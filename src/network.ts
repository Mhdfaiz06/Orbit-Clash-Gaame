import { PlayerInput } from './types';

export type NetworkEventCallback = (data: any) => void;

class NetworkManager {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<NetworkEventCallback>>();
  private isConnecting = false;

  public connect(): Promise<boolean> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve(true);
    }

    if (this.isConnecting) {
      return Promise.resolve(false);
    }

    this.isConnecting = true;

    return new Promise((resolve) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          this.ws = socket;
          this.isConnecting = false;
          this.emit('connected', {});
          resolve(true);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type) {
              this.emit(data.type, data);
            }
          } catch (e) {
            console.error('Failed to parse WS message:', e);
          }
        };

        socket.onclose = () => {
          this.ws = null;
          this.isConnecting = false;
          this.emit('disconnected', {});
        };

        socket.onerror = (err) => {
          console.error('WebSocket error:', err);
          this.isConnecting = false;
          this.emit('error', { message: 'Connection error. Please try again.' });
          resolve(false);
        };
      } catch (err) {
        this.isConnecting = false;
        resolve(false);
      }
    });
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public on(event: string, callback: NetworkEventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.off(event, callback);
    };
  }

  public off(event: string, callback: NetworkEventCallback) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  private send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  public createRoom() {
    this.send({ type: 'create_room' });
  }

  public joinRoom(roomId: string) {
    this.send({ type: 'join_room', roomId });
  }

  public startGame(seedData: any) {
    this.send({ type: 'start_game', seedData });
  }

  public sendInput(input: PlayerInput) {
    this.send({ type: 'input', input });
  }

  public sendSyncState(state: any) {
    this.send({ type: 'sync_state', state });
  }

  public requestRematch(seedData?: any) {
    this.send({ type: 'rematch', seedData });
  }

  public leaveRoom() {
    this.send({ type: 'leave_room' });
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const network = new NetworkManager();
