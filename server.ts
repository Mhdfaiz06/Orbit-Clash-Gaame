import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

interface Room {
  id: string;
  host: WebSocket | null;
  guest: WebSocket | null;
  rematchHost: boolean;
  rematchGuest: boolean;
  createdAt: number;
}

const rooms = new Map<string, Room>();
const socketToRoom = new Map<WebSocket, { roomId: string; role: 'blue' | 'red' }>();

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude confusing chars (0, O, 1, I)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // Clean up rooms older than 2 hours periodically
  setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms.entries()) {
      if (now - room.createdAt > 2 * 60 * 60 * 1000) {
        if (room.host) room.host.close();
        if (room.guest) room.guest.close();
        rooms.delete(id);
      }
    }
  }, 10 * 60 * 1000);

  wss.on('connection', (ws: WebSocket) => {
    // Keep alive ping
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 25000);

    ws.on('message', (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        const { type } = message;

        switch (type) {
          case 'create_room': {
            let roomId = generateRoomId();
            while (rooms.has(roomId)) {
              roomId = generateRoomId();
            }

            const room: Room = {
              id: roomId,
              host: ws,
              guest: null,
              rematchHost: false,
              rematchGuest: false,
              createdAt: Date.now(),
            };

            rooms.set(roomId, room);
            socketToRoom.set(ws, { roomId, role: 'blue' });

            ws.send(JSON.stringify({
              type: 'room_created',
              roomId,
              role: 'blue',
            }));
            break;
          }

          case 'join_room': {
            const requestedId = (message.roomId || '').toUpperCase().trim();
            const room = rooms.get(requestedId);

            if (!room) {
              ws.send(JSON.stringify({
                type: 'error',
                message: `Room "${requestedId}" was not found. Please verify the 6-character code.`,
              }));
              return;
            }

            if (room.guest && room.guest.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                message: `Room "${requestedId}" is already full (2/2 players).`,
              }));
              return;
            }

            // Assign as guest (Red player)
            room.guest = ws;
            room.rematchGuest = false;
            socketToRoom.set(ws, { roomId: requestedId, role: 'red' });

            ws.send(JSON.stringify({
              type: 'room_joined',
              roomId: requestedId,
              role: 'red',
            }));

            // Notify host that player 2 has arrived!
            if (room.host && room.host.readyState === WebSocket.OPEN) {
              room.host.send(JSON.stringify({
                type: 'player_joined',
                role: 'red',
              }));
            }
            break;
          }

          case 'start_game': {
            const context = socketToRoom.get(ws);
            if (!context) return;
            const room = rooms.get(context.roomId);
            if (!room) return;

            // Only host can initiate the match start
            if (context.role === 'blue') {
              room.rematchHost = false;
              room.rematchGuest = false;
              const payload = JSON.stringify({
                type: 'game_started',
                seedData: message.seedData,
              });
              if (room.host && room.host.readyState === WebSocket.OPEN) {
                room.host.send(payload);
              }
              if (room.guest && room.guest.readyState === WebSocket.OPEN) {
                room.guest.send(payload);
              }
            }
            break;
          }

          case 'input': {
            const context = socketToRoom.get(ws);
            if (!context) return;
            const room = rooms.get(context.roomId);
            if (!room) return;

            // Relay guest input to host, or host input to guest
            const target = context.role === 'blue' ? room.guest : room.host;
            if (target && target.readyState === WebSocket.OPEN) {
              target.send(JSON.stringify({
                type: 'opponent_input',
                role: context.role,
                input: message.input,
              }));
            }
            break;
          }

          case 'sync_state': {
            const context = socketToRoom.get(ws);
            if (!context || context.role !== 'blue') return;
            const room = rooms.get(context.roomId);
            if (!room) return;

            // Host broadcasts authoritative simulation state to guest
            if (room.guest && room.guest.readyState === WebSocket.OPEN) {
              room.guest.send(JSON.stringify({
                type: 'sync_state',
                state: message.state,
              }));
            }
            break;
          }

          case 'rematch': {
            const context = socketToRoom.get(ws);
            if (!context) return;
            const room = rooms.get(context.roomId);
            if (!room) return;

            if (context.role === 'blue') room.rematchHost = true;
            if (context.role === 'red') room.rematchGuest = true;

            const other = context.role === 'blue' ? room.guest : room.host;
            if (other && other.readyState === WebSocket.OPEN) {
              other.send(JSON.stringify({
                type: 'rematch_requested',
                by: context.role,
              }));
            }

            // If both want a rematch, or host initiates rematch and guest is present
            if (room.rematchHost && room.rematchGuest) {
              room.rematchHost = false;
              room.rematchGuest = false;
              const payload = JSON.stringify({
                type: 'rematch_start',
                seedData: message.seedData,
              });
              if (room.host && room.host.readyState === WebSocket.OPEN) room.host.send(payload);
              if (room.guest && room.guest.readyState === WebSocket.OPEN) room.guest.send(payload);
            }
            break;
          }

          case 'leave_room': {
            const context = socketToRoom.get(ws);
            if (!context) return;
            const room = rooms.get(context.roomId);
            if (room) {
              if (context.role === 'blue') {
                if (room.guest && room.guest.readyState === WebSocket.OPEN) {
                  room.guest.send(JSON.stringify({
                    type: 'room_closed',
                    message: 'Host has left the room.',
                  }));
                }
                rooms.delete(context.roomId);
              } else {
                room.guest = null;
                room.rematchGuest = false;
                if (room.host && room.host.readyState === WebSocket.OPEN) {
                  room.host.send(JSON.stringify({
                    type: 'player_left',
                  }));
                }
              }
            }
            socketToRoom.delete(ws);
            break;
          }
        }
      } catch (err) {
        console.error('WS message parse error:', err);
      }
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
      const context = socketToRoom.get(ws);
      if (context) {
        const room = rooms.get(context.roomId);
        if (room) {
          if (context.role === 'blue') {
            // Host disconnected
            if (room.guest && room.guest.readyState === WebSocket.OPEN) {
              room.guest.send(JSON.stringify({
                type: 'room_closed',
                message: 'Host disconnected from room.',
              }));
            }
            rooms.delete(context.roomId);
          } else {
            // Guest disconnected
            room.guest = null;
            room.rematchGuest = false;
            if (room.host && room.host.readyState === WebSocket.OPEN) {
              room.host.send(JSON.stringify({
                type: 'player_left',
              }));
            }
          }
        }
        socketToRoom.delete(ws);
      }
    });
  });

  // API health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', activeRooms: rooms.size });
  });

  // Vite middleware for dev or static bundle for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
