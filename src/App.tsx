import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Rocket,
  Shield,
  Zap,
  RefreshCw,
  Play,
  Trophy,
  Gauge,
  AlertTriangle,
  Disc,
  ArrowLeft,
  Globe,
  LogOut,
  Users,
  Copy,
  Check,
} from 'lucide-react';
import { Joystick } from './components/Joystick';
import { CockpitDashboard, TelemetryData } from './components/CockpitDashboard';
import { Player, GameState, Vector, GameMode, MultiplayerState, PlayerInput } from './types';
import { MenuOverlay } from './components/MenuOverlay';
import { network } from './network';
import { drawBallCar, drawDamagePopups, drawSkidMarks, drawJetSmoke } from './components/CarRenderer';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  CAR_RADIUS,
  INITIAL_HEALTH,
  GEAR_CONFIG,
  DISPLAY_SPEED_MULTIPLIER,
  updateCarDriving,
  handleArenaBoundaryWrap,
  handleCarToCarCollision,
} from './carPhysics';
import {
  spawnAsteroids,
  updateAsteroids,
  handleCarAsteroidCollisions,
  drawAsteroids,
} from './asteroidPhysics';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [gameState, setGameState] = useState<GameState['status']>('start');
  const [winner, setWinner] = useState<number | null>(null);
  const [healths, setHealths] = useState<[number, number]>([INITIAL_HEALTH, INITIAL_HEALTH]);
  const [strikes, setStrikes] = useState<[number, number]>([0, 0]);
  const [aiOpponent, setAiOpponent] = useState<boolean>(false);

  // Online Multiplayer State
  const [multiplayer, setMultiplayer] = useState<MultiplayerState>({
    connected: false,
    roomId: null,
    role: null,
    opponentJoined: false,
    rematchRequestedByMe: false,
    rematchRequestedByOpponent: false,
    statusMessage: '',
    ping: 0,
  });

  const gameModeRef = useRef<GameMode>(gameMode);
  const multiplayerRef = useRef<MultiplayerState>(multiplayer);
  const opponentInputRef = useRef<PlayerInput>({
    throttle: 0,
    steer: 0,
    braking: false,
    gear: 1,
  });

  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);

  useEffect(() => {
    multiplayerRef.current = multiplayer;
  }, [multiplayer]);

  // Telemetry for real-time dashboard UI
  const [p1Telemetry, setP1Telemetry] = useState<TelemetryData>({
    speed: 0,
    gear: 1,
    rpm: 1000,
    isBraking: false,
    isStalled: false,
    isRevLimiting: false,
    isUnbalanced: false,
    maxSpeedForGear: GEAR_CONFIG[0].maxSpeed * DISPLAY_SPEED_MULTIPLIER,
  });

  const [p2Telemetry, setP2Telemetry] = useState<TelemetryData>({
    speed: 0,
    gear: 1,
    rpm: 1000,
    isBraking: false,
    isStalled: false,
    isRevLimiting: false,
    isUnbalanced: false,
    maxSpeedForGear: GEAR_CONFIG[0].maxSpeed * DISPLAY_SPEED_MULTIPLIER,
  });

  // State ref for high-frequency game loop
  const stateRef = useRef<GameState>({
    players: [
      {
        id: 1,
        pos: { x: 250, y: CANVAS_HEIGHT / 2 },
        vel: { x: 0, y: 0 },
        acc: { x: 0, y: 0 },
        angle: 0, // Facing right (towards opponent)
        angularVel: 0,
        steerAngle: 0,
        throttle: 0,
        steering: 0,
        health: INITIAL_HEALTH,
        color: '#3b82f6', // Blue
        radius: CAR_RADIUS,
        score: 0,
        strikes: 0,
        gear: 1,
        braking: false,
        stalled: false,
        revLimiting: false,
        rpm: 1000,
        unbalancedTimer: 0,
        wobbleAngle: 0,
        wobbleVel: 0,
        skidding: false,
        touchingWall: { left: false, right: false, top: false, bottom: false },
        touchingCar: false,
      },
      {
        id: 2,
        pos: { x: CANVAS_WIDTH - 250, y: CANVAS_HEIGHT / 2 },
        vel: { x: 0, y: 0 },
        acc: { x: 0, y: 0 },
        angle: Math.PI, // Facing left (towards opponent)
        angularVel: 0,
        steerAngle: 0,
        throttle: 0,
        steering: 0,
        health: INITIAL_HEALTH,
        color: '#ef4444', // Red
        radius: CAR_RADIUS,
        score: 0,
        strikes: 0,
        gear: 1,
        braking: false,
        stalled: false,
        revLimiting: false,
        rpm: 1000,
        unbalancedTimer: 0,
        wobbleAngle: 0,
        wobbleVel: 0,
        skidding: false,
        touchingWall: { left: false, right: false, top: false, bottom: false },
        touchingCar: false,
      },
    ],
    asteroids: spawnAsteroids(7, [
      { x: 250, y: CANVAS_HEIGHT / 2 },
      { x: CANVAS_WIDTH - 250, y: CANVAS_HEIGHT / 2 },
    ]),
    particles: [],
    skidMarks: [],
    jetSmoke: [],
    damagePopups: [],
    stars: Array.from({ length: 140 }, () => ({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.7 + 0.2,
    })),
    status: 'start',
    winner: null,
    screenShake: 0,
  });

  const keysPressed = useRef<Set<string>>(new Set());
  const joystickP1 = useRef<{ steer: number; throttle: number }>({ steer: 0, throttle: 0 });
  const joystickP2 = useRef<{ steer: number; throttle: number }>({ steer: 0, throttle: 0 });
  const joystickActive = useRef<[boolean, boolean]>([false, false]);
  const p1TouchBrake = useRef(false);
  const p2TouchBrake = useRef(false);
  const frameCounter = useRef(0);

  // Helper to add screen shake on violent crashes
  const addScreenShake = (amount: number) => {
    stateRef.current.screenShake = Math.max(stateRef.current.screenShake, amount);
  };

  // --- Network Event Listeners for Online Multiplayer ---
  useEffect(() => {
    const unsubCreated = network.on('room_created', (data) => {
      setMultiplayer((prev) => ({
        ...prev,
        roomId: data.roomId,
        role: 'blue',
        opponentJoined: false,
        statusMessage: 'Room created. Waiting for Player 2 (Red)...',
      }));
    });

    const unsubJoined = network.on('room_joined', (data) => {
      setMultiplayer((prev) => ({
        ...prev,
        roomId: data.roomId,
        role: 'red',
        opponentJoined: true,
        statusMessage: 'Joined room as Red Ship. Waiting for Host to start...',
      }));
    });

    const unsubPlayerJoined = network.on('player_joined', () => {
      setMultiplayer((prev) => ({
        ...prev,
        opponentJoined: true,
        statusMessage: 'Player 2 (Red Ship) has joined the room!',
      }));
    });

    const unsubPlayerLeft = network.on('player_left', () => {
      setMultiplayer((prev) => ({
        ...prev,
        opponentJoined: false,
        rematchRequestedByOpponent: false,
        statusMessage: 'Player 2 left the room.',
      }));
    });

    const unsubRoomClosed = (data: any) => {
      setGameMode('menu');
      setGameState('start');
      setMultiplayer({
        connected: false,
        roomId: null,
        role: null,
        opponentJoined: false,
        rematchRequestedByMe: false,
        rematchRequestedByOpponent: false,
        statusMessage: data?.message || 'Room was closed by host.',
        ping: 0,
      });
    };
    const unsubRoomClosedFn = network.on('room_closed', unsubRoomClosed);

    const unsubGameStarted = network.on('game_started', (data) => {
      if (data.seedData?.asteroids) {
        stateRef.current.asteroids = data.seedData.asteroids;
      }
      resetMatch(data.seedData?.asteroids);
      setGameState('playing');
    });

    const unsubOpponentInput = network.on('opponent_input', (data) => {
      if (data.input) {
        opponentInputRef.current = data.input;
        if (data.input.gear) {
          const otherPlayerId = multiplayerRef.current.role === 'blue' ? 2 : 1;
          const otherP = stateRef.current.players.find((p) => p.id === otherPlayerId);
          if (otherP) otherP.gear = data.input.gear;
        }
      }
    });

    const unsubSyncState = network.on('sync_state', (data) => {
      // If we are Guest (Red), synchronize with authoritative Host snapshot
      if (multiplayerRef.current.role === 'red' && data.state) {
        const { p1: sP1, p2: sP2, asteroids: sAst, winner: sWinner } = data.state;
        const p1 = stateRef.current.players[0];
        const p2 = stateRef.current.players[1];

        if (sP1) {
          p1.pos.x = sP1.x;
          p1.pos.y = sP1.y;
          p1.vel.x = sP1.vx;
          p1.vel.y = sP1.vy;
          p1.angle = sP1.angle;
          p1.angularVel = sP1.angularVel;
          p1.health = sP1.health;
          p1.gear = sP1.gear;
          p1.throttle = sP1.throttle;
          p1.steering = sP1.steering;
          p1.braking = sP1.braking;
          p1.unbalancedTimer = sP1.unbalancedTimer;
          p1.wobbleAngle = sP1.wobbleAngle;
          p1.rpm = sP1.rpm;
          p1.strikes = sP1.strikes;
        }

        if (sP2) {
          // Soft blend guest position to maintain local responsiveness
          p2.pos.x += (sP2.x - p2.pos.x) * 0.45;
          p2.pos.y += (sP2.y - p2.pos.y) * 0.45;
          p2.vel.x = sP2.vx;
          p2.vel.y = sP2.vy;
          p2.angle = sP2.angle;
          p2.angularVel = sP2.angularVel;
          p2.health = sP2.health;
          p2.gear = sP2.gear;
          p2.unbalancedTimer = sP2.unbalancedTimer;
          p2.wobbleAngle = sP2.wobbleAngle;
          p2.rpm = sP2.rpm;
          p2.strikes = sP2.strikes;
        }

        if (sAst && Array.isArray(sAst)) {
          for (const sa of sAst) {
            const localAst = stateRef.current.asteroids.find((a) => a.id === sa.id);
            if (localAst) {
              localAst.pos.x = sa.x;
              localAst.pos.y = sa.y;
              localAst.vel.x = sa.vx;
              localAst.vel.y = sa.vy;
              localAst.angle = sa.angle;
              localAst.spinSpeed = sa.spinSpeed;
            }
          }
        }

        if (sWinner !== undefined && sWinner !== null) {
          stateRef.current.winner = sWinner;
          setWinner(sWinner);
          setGameState('gameover');
        }

        setHealths([p1.health, p2.health]);
        setStrikes([p1.strikes, p2.strikes]);
      }
    });

    const unsubRematchReq = network.on('rematch_requested', () => {
      setMultiplayer((prev) => ({
        ...prev,
        rematchRequestedByOpponent: true,
      }));
    });

    const unsubRematchStart = network.on('rematch_start', (data) => {
      if (data.seedData?.asteroids) {
        stateRef.current.asteroids = data.seedData.asteroids;
      }
      resetMatch(data.seedData?.asteroids);
      setMultiplayer((prev) => ({
        ...prev,
        rematchRequestedByMe: false,
        rematchRequestedByOpponent: false,
      }));
      setGameState('playing');
    });

    return () => {
      unsubCreated();
      unsubJoined();
      unsubPlayerJoined();
      unsubPlayerLeft();
      unsubRoomClosedFn();
      unsubGameStarted();
      unsubOpponentInput();
      unsubSyncState();
      unsubRematchReq();
      unsubRematchStart();
    };
  }, []);

  // --- Gear Shift Handler ---
  const shiftPlayerGear = useCallback((playerId: number, newGear: number) => {
    const player = stateRef.current.players.find((p) => p.id === playerId);
    if (!player) return;
    const clamped = Math.max(1, Math.min(4, newGear));
    if (player.gear === clamped) return;

    player.gear = clamped;

    // Shift exhaust pop particles
    const fwdX = Math.cos(player.angle);
    const fwdY = Math.sin(player.angle);
    for (let i = 0; i < 14; i++) {
      stateRef.current.particles.push({
        x: player.pos.x - fwdX * player.radius,
        y: player.pos.y - fwdY * player.radius,
        vx: -fwdX * (Math.random() * 3 + 1) + (Math.random() - 0.5) * 2,
        vy: -fwdY * (Math.random() * 3 + 1) + (Math.random() - 0.5) * 2,
        life: 0.6,
        color: player.color,
        size: Math.random() * 3 + 2,
        type: 'spark',
      });
    }

    const speed = Math.hypot(player.vel.x, player.vel.y);
    const gearCfg = GEAR_CONFIG[clamped - 1];
    const updateFn = playerId === 1 ? setP1Telemetry : setP2Telemetry;
    updateFn((prev) => ({
      ...prev,
      gear: clamped,
      maxSpeedForGear: gearCfg.maxSpeed,
      isRevLimiting: speed >= gearCfg.maxSpeed,
      isStalled: (speed < 1.0 && clamped > 1) || (speed >= 1.0 && speed < gearCfg.minLaunchSpeed),
    }));

    // If online guest shifts Red car, notify Host immediately
    if (multiplayerRef.current.role === 'red' && playerId === 2) {
      network.sendInput({
        throttle: player.throttle,
        steer: player.steering,
        braking: player.braking,
        gear: clamped,
      });
    }
  }, []);

  // --- Joystick Handlers ---
  const handleJoystick = useCallback((id: number, x: number, y: number) => {
    const isOnline = gameModeRef.current === 'online_lobby' || multiplayerRef.current.roomId !== null;
    const myRole = multiplayerRef.current.role;
    let target = id === 1 ? joystickP1.current : joystickP2.current;

    // In online mode, joystick on either side steers YOUR car
    if (isOnline) {
      target = myRole === 'red' ? joystickP2.current : joystickP1.current;
    }

    target.steer = Math.max(-1, Math.min(1, x));
    target.throttle = Math.max(-1, Math.min(1, -y));
  }, []);

  const handleJoystickStart = (id: number) => {
    const isOnline = gameModeRef.current === 'online_lobby' || multiplayerRef.current.roomId !== null;
    const myRole = multiplayerRef.current.role;
    if (isOnline) {
      if (myRole === 'red') joystickActive.current[1] = true;
      else joystickActive.current[0] = true;
    } else {
      joystickActive.current[id - 1] = true;
    }
  };

  const handleJoystickEnd = (id: number) => {
    const isOnline = gameModeRef.current === 'online_lobby' || multiplayerRef.current.roomId !== null;
    const myRole = multiplayerRef.current.role;
    if (isOnline) {
      if (myRole === 'red') {
        joystickActive.current[1] = false;
        joystickP2.current.steer = 0;
        joystickP2.current.throttle = 0;
      } else {
        joystickActive.current[0] = false;
        joystickP1.current.steer = 0;
        joystickP1.current.throttle = 0;
      }
    } else {
      joystickActive.current[id - 1] = false;
      const target = id === 1 ? joystickP1.current : joystickP2.current;
      target.steer = 0;
      target.throttle = 0;
    }
  };

  // Keyboard Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      keysPressed.current.add(e.code);
      if (e.key) keysPressed.current.add(e.key.toLowerCase());

      const isOnline = gameModeRef.current === 'online_lobby' || multiplayerRef.current.roomId !== null;
      const myRole = multiplayerRef.current.role;

      if (isOnline) {
        // In Online Mode: on the local player's device, Keys 1-4 shift THEIR car
        const targetId = myRole === 'red' ? 2 : 1;
        if (e.code === 'Digit1' || e.key === '1') shiftPlayerGear(targetId, 1);
        else if (e.code === 'Digit2' || e.key === '2') shiftPlayerGear(targetId, 2);
        else if (e.code === 'Digit3' || e.key === '3') shiftPlayerGear(targetId, 3);
        else if (e.code === 'Digit4' || e.key === '4') shiftPlayerGear(targetId, 4);
      } else {
        // Local Mode: Player 1 Gear Shifting (Keys 1-4)
        const isP2Shift = keysPressed.current.has('ShiftRight');
        if (!isP2Shift) {
          if (e.code === 'Digit1' || e.key === '1') shiftPlayerGear(1, 1);
          else if (e.code === 'Digit2' || e.key === '2') shiftPlayerGear(1, 2);
          else if (e.code === 'Digit3' || e.key === '3') shiftPlayerGear(1, 3);
          else if (e.code === 'Digit4' || e.key === '4') shiftPlayerGear(1, 4);
        }

        // Local Mode: Player 2 Gear Shifting (Numpad 1-4 or Right Shift + 1-4)
        if (isP2Shift) {
          if (e.code === 'Digit1' || e.key === '1' || e.code === 'Numpad1') shiftPlayerGear(2, 1);
          else if (e.code === 'Digit2' || e.key === '2' || e.code === 'Numpad2') shiftPlayerGear(2, 2);
          else if (e.code === 'Digit3' || e.key === '3' || e.code === 'Numpad3') shiftPlayerGear(2, 3);
          else if (e.code === 'Digit4' || e.key === '4' || e.code === 'Numpad4') shiftPlayerGear(2, 4);
        } else {
          if (e.code === 'Numpad1') shiftPlayerGear(2, 1);
          else if (e.code === 'Numpad2') shiftPlayerGear(2, 2);
          else if (e.code === 'Numpad3') shiftPlayerGear(2, 3);
          else if (e.code === 'Numpad4') shiftPlayerGear(2, 4);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.code);
      if (e.key) keysPressed.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [shiftPlayerGear]);

  // --- Main Physics Loop ---
  const update = () => {
    if (stateRef.current.status !== 'playing') return;

    const { players, particles, skidMarks, jetSmoke, damagePopups } = stateRef.current;
    const p1 = players[0];
    const p2 = players[1];

    const isOnline = gameModeRef.current === 'online_lobby' || multiplayerRef.current.roomId !== null;
    const myRole = multiplayerRef.current.role;

    if (isOnline) {
      // ONLINE MULTIPLAYER CONTROLS
      if (myRole === 'blue') {
        // HOST controls Player 1 (Blue) using BOTH WASD and Arrow keys alternately!
        let myKbdSteer = 0;
        let myKbdThrottle = 0;
        let myKbdActive = false;

        if (keysPressed.current.has('KeyW') || keysPressed.current.has('w') || keysPressed.current.has('ArrowUp') || keysPressed.current.has('arrowup')) {
          myKbdThrottle += 1;
          myKbdActive = true;
        }
        if (keysPressed.current.has('KeyS') || keysPressed.current.has('s') || keysPressed.current.has('ArrowDown') || keysPressed.current.has('arrowdown')) {
          myKbdThrottle -= 1;
          myKbdActive = true;
        }
        if (keysPressed.current.has('KeyA') || keysPressed.current.has('a') || keysPressed.current.has('ArrowLeft') || keysPressed.current.has('arrowleft')) {
          myKbdSteer -= 1;
          myKbdActive = true;
        }
        if (keysPressed.current.has('KeyD') || keysPressed.current.has('d') || keysPressed.current.has('ArrowRight') || keysPressed.current.has('arrowright')) {
          myKbdSteer += 1;
          myKbdActive = true;
        }

        const myBrake =
          keysPressed.current.has('ControlLeft') ||
          keysPressed.current.has('ControlRight') ||
          keysPressed.current.has('Space') ||
          keysPressed.current.has('KeyB') ||
          keysPressed.current.has('b') ||
          p1TouchBrake.current;
        p1.braking = myBrake;

        const targetP1Steer = myKbdActive ? myKbdSteer : joystickActive.current[0] ? joystickP1.current.steer : 0;
        const targetP1Throttle = myKbdActive ? myKbdThrottle : joystickActive.current[0] ? joystickP1.current.throttle : 0;

        p1.steering += (targetP1Steer - p1.steering) * 0.35;
        p1.throttle += (targetP1Throttle - p1.throttle) * 0.35;
        if (Math.abs(p1.steering) < 0.01) p1.steering = 0;
        if (Math.abs(p1.throttle) < 0.01) p1.throttle = 0;

        // Player 2 (Red) is controlled by opponent's inputs received over network
        const targetP2Steer = opponentInputRef.current.steer || 0;
        const targetP2Throttle = opponentInputRef.current.throttle || 0;
        p2.braking = !!opponentInputRef.current.braking;

        p2.steering += (targetP2Steer - p2.steering) * 0.35;
        p2.throttle += (targetP2Throttle - p2.throttle) * 0.35;
        if (Math.abs(p2.steering) < 0.01) p2.steering = 0;
        if (Math.abs(p2.throttle) < 0.01) p2.throttle = 0;
      } else if (myRole === 'red') {
        // GUEST controls Player 2 (Red) using BOTH WASD and Arrow keys alternately!
        let myKbdSteer = 0;
        let myKbdThrottle = 0;
        let myKbdActive = false;

        if (keysPressed.current.has('KeyW') || keysPressed.current.has('w') || keysPressed.current.has('ArrowUp') || keysPressed.current.has('arrowup')) {
          myKbdThrottle += 1;
          myKbdActive = true;
        }
        if (keysPressed.current.has('KeyS') || keysPressed.current.has('s') || keysPressed.current.has('ArrowDown') || keysPressed.current.has('arrowdown')) {
          myKbdThrottle -= 1;
          myKbdActive = true;
        }
        if (keysPressed.current.has('KeyA') || keysPressed.current.has('a') || keysPressed.current.has('ArrowLeft') || keysPressed.current.has('arrowleft')) {
          myKbdSteer -= 1;
          myKbdActive = true;
        }
        if (keysPressed.current.has('KeyD') || keysPressed.current.has('d') || keysPressed.current.has('ArrowRight') || keysPressed.current.has('arrowright')) {
          myKbdSteer += 1;
          myKbdActive = true;
        }

        const myBrake =
          keysPressed.current.has('ControlLeft') ||
          keysPressed.current.has('ControlRight') ||
          keysPressed.current.has('Space') ||
          keysPressed.current.has('KeyB') ||
          keysPressed.current.has('b') ||
          p2TouchBrake.current;
        p2.braking = myBrake;

        const targetP2Steer = myKbdActive ? myKbdSteer : joystickActive.current[1] ? joystickP2.current.steer : 0;
        const targetP2Throttle = myKbdActive ? myKbdThrottle : joystickActive.current[1] ? joystickP2.current.throttle : 0;

        p2.steering += (targetP2Steer - p2.steering) * 0.35;
        p2.throttle += (targetP2Throttle - p2.throttle) * 0.35;
        if (Math.abs(p2.steering) < 0.01) p2.steering = 0;
        if (Math.abs(p2.throttle) < 0.01) p2.throttle = 0;

        // Send local input to Host
        network.sendInput({
          steer: targetP2Steer,
          throttle: targetP2Throttle,
          braking: myBrake,
          gear: p2.gear,
        });

        // Player 1 steering is relaxed
        p1.steering += (0 - p1.steering) * 0.1;
      }
    } else {
      // 1. Handbrake / Braking inputs
      p1.braking = keysPressed.current.has('ControlLeft') || keysPressed.current.has('KeyB') || keysPressed.current.has('b') || p1TouchBrake.current;
      p2.braking = keysPressed.current.has('ControlRight') || keysPressed.current.has('Numpad0') || p2TouchBrake.current;

      // 2. Player 1 Car Driving Controls (WASD / Joystick 1)
      let p1KbdSteer = 0;
      let p1KbdThrottle = 0;
      let p1KbdActive = false;
      if (keysPressed.current.has('KeyW') || keysPressed.current.has('w')) { p1KbdThrottle += 1; p1KbdActive = true; }
      if (keysPressed.current.has('KeyS') || keysPressed.current.has('s')) { p1KbdThrottle -= 1; p1KbdActive = true; }
      if (keysPressed.current.has('KeyA') || keysPressed.current.has('a')) { p1KbdSteer -= 1; p1KbdActive = true; }
      if (keysPressed.current.has('KeyD') || keysPressed.current.has('d')) { p1KbdSteer += 1; p1KbdActive = true; }

      const targetP1Steer = p1KbdActive ? p1KbdSteer : (joystickActive.current[0] ? joystickP1.current.steer : 0);
      const targetP1Throttle = p1KbdActive ? p1KbdThrottle : (joystickActive.current[0] ? joystickP1.current.throttle : 0);

      p1.steering += (targetP1Steer - p1.steering) * 0.35;
      p1.throttle += (targetP1Throttle - p1.throttle) * 0.35;
      if (Math.abs(p1.steering) < 0.01) p1.steering = 0;
      if (Math.abs(p1.throttle) < 0.01) p1.throttle = 0;

      // 3. Player 2 Car Driving Controls (Arrows / Numpad / Joystick 2 / Optional AI Bot)
      let p2KbdSteer = 0;
      let p2KbdThrottle = 0;
      let p2KbdActive = false;
      if (keysPressed.current.has('ArrowUp') || keysPressed.current.has('arrowup') || keysPressed.current.has('Numpad8') || keysPressed.current.has('KeyI') || keysPressed.current.has('i')) { p2KbdThrottle += 1; p2KbdActive = true; }
      if (keysPressed.current.has('ArrowDown') || keysPressed.current.has('arrowdown') || keysPressed.current.has('Numpad2') || keysPressed.current.has('Numpad5') || keysPressed.current.has('KeyK') || keysPressed.current.has('k')) { p2KbdThrottle -= 1; p2KbdActive = true; }
      if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('arrowleft') || keysPressed.current.has('Numpad4') || keysPressed.current.has('KeyJ') || keysPressed.current.has('j')) { p2KbdSteer -= 1; p2KbdActive = true; }
      if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('arrowright') || keysPressed.current.has('Numpad6') || keysPressed.current.has('KeyL') || keysPressed.current.has('l')) { p2KbdSteer += 1; p2KbdActive = true; }

      let targetP2Steer = 0;
      let targetP2Throttle = 0;

      if (p2KbdActive) {
        targetP2Steer = p2KbdSteer;
        targetP2Throttle = p2KbdThrottle;
      } else if (joystickActive.current[1]) {
        targetP2Steer = joystickP2.current.steer;
        targetP2Throttle = joystickP2.current.throttle;
      } else if (aiOpponent) {
        let dx = p1.pos.x - p2.pos.x;
        let dy = p1.pos.y - p2.pos.y;
        if (dx > CANVAS_WIDTH / 2) dx -= CANVAS_WIDTH;
        else if (dx < -CANVAS_WIDTH / 2) dx += CANVAS_WIDTH;
        if (dy > CANVAS_HEIGHT / 2) dy -= CANVAS_HEIGHT;
        else if (dy < -CANVAS_HEIGHT / 2) dy += CANVAS_HEIGHT;

        const targetAngle = Math.atan2(dy, dx);
        let angleDiff = targetAngle - p2.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        targetP2Steer = Math.max(-1, Math.min(1, angleDiff * 2.5));

        if (Math.abs(angleDiff) < 1.3) {
          targetP2Throttle = 1;
          const curSpd = Math.hypot(p2.vel.x, p2.vel.y);
          const gearCfg = GEAR_CONFIG[p2.gear - 1];
          if (curSpd > gearCfg.maxSpeed * 0.82 && p2.gear < 4) {
            shiftPlayerGear(2, p2.gear + 1);
          }
        } else {
          targetP2Throttle = 0.6;
          if (Math.hypot(p2.vel.x, p2.vel.y) > 4.2 && Math.abs(angleDiff) > 1.8) {
            p2.braking = true;
          }
        }
      }

      p2.steering += (targetP2Steer - p2.steering) * 0.35;
      p2.throttle += (targetP2Throttle - p2.throttle) * 0.35;
      if (Math.abs(p2.steering) < 0.01) p2.steering = 0;
      if (Math.abs(p2.throttle) < 0.01) p2.throttle = 0;
    }

    // 4. Update Automotive Driving & Turning Physics for each vehicle
    updateCarDriving(p1, particles, skidMarks, jetSmoke);
    updateCarDriving(p2, particles, skidMarks, jetSmoke);

    // 5. Looping Boundary Wrap (Entering right wall appears from left, top wraps to bottom)
    handleArenaBoundaryWrap(p1, particles);
    handleArenaBoundaryWrap(p2, particles);

    // 6. Car-to-Car Collision with SINGLE POINT OF IMPACT damage & loss of balance
    handleCarToCarCollision(p1, p2, particles, damagePopups, addScreenShake);

    // 6b. Update Asteroids & Arena Border Bounces (Portal loops DO NOT work for asteroids)
    updateAsteroids(stateRef.current.asteroids, particles);

    // 6c. Car-to-Asteroid Single Point of Impact Collisions, Damage, & Momentum Exchange
    handleCarAsteroidCollisions(
      stateRef.current.players,
      stateRef.current.asteroids,
      particles,
      damagePopups,
      addScreenShake
    );

    // 7. Update Particles with Toroidal Boundary Wrapping
    for (let i = particles.length - 1; i >= 0; i--) {
      const part = particles[i];
      part.x += part.vx;
      part.y += part.vy;

      // Wrap particles across arena borders so exhaust/smoke doesn't pop out
      if (part.x >= CANVAS_WIDTH) part.x -= CANVAS_WIDTH;
      else if (part.x < 0) part.x += CANVAS_WIDTH;
      if (part.y >= CANVAS_HEIGHT) part.y -= CANVAS_HEIGHT;
      else if (part.y < 0) part.y += CANVAS_HEIGHT;

      part.life -= part.type === 'smoke' ? 0.025 : 0.035;
      if (part.life <= 0) particles.splice(i, 1);
    }

    // 8. Update Damage Popups
    for (let i = damagePopups.length - 1; i >= 0; i--) {
      const pop = damagePopups[i];
      pop.y += pop.vy;
      pop.life -= 0.022;
      if (pop.life <= 0) damagePopups.splice(i, 1);
    }

    // 9. Fade and Limit Skid Marks
    if (skidMarks.length > 200) {
      skidMarks.splice(0, skidMarks.length - 200);
    }
    for (let i = skidMarks.length - 1; i >= 0; i--) {
      skidMarks[i].alpha -= 0.0006;
      if (skidMarks[i].alpha <= 0) {
        skidMarks.splice(i, 1);
      }
    }

    // 9b. Update and Diffuse Dual Exhaust Jet Smoke Clouds
    for (let i = jetSmoke.length - 1; i >= 0; i--) {
      const puff = jetSmoke[i];
      puff.x += puff.vx;
      puff.y += puff.vy;
      puff.vx *= 0.985; // ambient atmospheric deceleration
      puff.vy *= 0.985;
      puff.rotation += puff.spin;
      puff.age++;

      // Toroidal boundary wrapping for smoke puffs
      if (puff.x >= CANVAS_WIDTH) puff.x -= CANVAS_WIDTH;
      else if (puff.x < 0) puff.x += CANVAS_WIDTH;
      if (puff.y >= CANVAS_HEIGHT) puff.y -= CANVAS_HEIGHT;
      else if (puff.y < 0) puff.y += CANVAS_HEIGHT;

      if (puff.age >= puff.maxLife) {
        jetSmoke.splice(i, 1);
      }
    }

    if (jetSmoke.length > 420) {
      jetSmoke.splice(0, jetSmoke.length - 420);
    }

    // 10. Dampen Screen Shake
    if (stateRef.current.screenShake > 0.05) {
      stateRef.current.screenShake *= 0.88;
    } else {
      stateRef.current.screenShake = 0;
    }

    // 11. Check Game Over Condition
    if (p1.health <= 0 || p2.health <= 0) {
      stateRef.current.status = 'gameover';
      const winnerId = p1.health > p2.health ? 1 : 2;
      stateRef.current.winner = winnerId;
      setWinner(winnerId);
      setGameState('gameover');
    }

    // 12. Synchronize Dashboard Telemetry (~30 FPS update)
    frameCounter.current++;
    if (frameCounter.current % 2 === 0) {
      setHealths([Math.max(0, p1.health), Math.max(0, p2.health)]);
      setStrikes([p1.strikes || 0, p2.strikes || 0]);

      // Scale displayed speed to match dashboard dial (0-18 km/h)
      const p1DisplaySpeed = Math.hypot(p1.vel.x, p1.vel.y) * DISPLAY_SPEED_MULTIPLIER;
      const p2DisplaySpeed = Math.hypot(p2.vel.x, p2.vel.y) * DISPLAY_SPEED_MULTIPLIER;

      setP1Telemetry({
        speed: p1DisplaySpeed,
        gear: p1.gear,
        rpm: p1.rpm,
        isBraking: p1.braking,
        isStalled: p1.stalled,
        isRevLimiting: p1.revLimiting,
        isUnbalanced: p1.unbalancedTimer > 0,
        maxSpeedForGear: GEAR_CONFIG[p1.gear - 1].maxSpeed * DISPLAY_SPEED_MULTIPLIER,
      });

      setP2Telemetry({
        speed: p2DisplaySpeed,
        gear: p2.gear,
        rpm: p2.rpm,
        isBraking: p2.braking,
        isStalled: p2.stalled,
        isRevLimiting: p2.revLimiting,
        isUnbalanced: p2.unbalancedTimer > 0,
        maxSpeedForGear: GEAR_CONFIG[p2.gear - 1].maxSpeed * DISPLAY_SPEED_MULTIPLIER,
      });

      // If online Host, broadcast physics state snapshot to Guest
      if (isOnline && myRole === 'blue') {
        network.sendSyncState({
          p1: {
            x: p1.pos.x,
            y: p1.pos.y,
            vx: p1.vel.x,
            vy: p1.vel.y,
            angle: p1.angle,
            angularVel: p1.angularVel,
            health: p1.health,
            gear: p1.gear,
            throttle: p1.throttle,
            steering: p1.steering,
            braking: p1.braking,
            unbalancedTimer: p1.unbalancedTimer,
            wobbleAngle: p1.wobbleAngle,
            rpm: p1.rpm,
            strikes: p1.strikes,
          },
          p2: {
            x: p2.pos.x,
            y: p2.pos.y,
            vx: p2.vel.x,
            vy: p2.vel.y,
            angle: p2.angle,
            angularVel: p2.angularVel,
            health: p2.health,
            gear: p2.gear,
            throttle: p2.throttle,
            steering: p2.steering,
            braking: p2.braking,
            unbalancedTimer: p2.unbalancedTimer,
            wobbleAngle: p2.wobbleAngle,
            rpm: p2.rpm,
            strikes: p2.strikes,
          },
          asteroids: stateRef.current.asteroids.map((a) => ({
            id: a.id,
            x: a.pos.x,
            y: a.pos.y,
            vx: a.vel.x,
            vy: a.vel.y,
            angle: a.angle,
            spinSpeed: a.spinSpeed,
          })),
          winner: stateRef.current.winner,
          screenShake: stateRef.current.screenShake,
        });
      }
    }
  };

  // --- Canvas Drawing ---
  const draw = (ctx: CanvasRenderingContext2D) => {
    // Defensively reset canvas transformation matrix to identity every frame
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();

    // Apply Screen Shake during impacts
    if (stateRef.current.screenShake > 0) {
      const sx = (Math.random() - 0.5) * stateRef.current.screenShake;
      const sy = (Math.random() - 0.5) * stateRef.current.screenShake;
      ctx.translate(sx, sy);
    }

    // 1. Asphalt Arena Floor & Grid Markings
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Subtle arena grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    for (let x = 0; x < CANVAS_WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // Center Arena Hazard Circle & Starting Grid Marks
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 140, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Looping Portal Horizons (Left <-> Right wrap, Top <-> Bottom wrap)
    // Subtle portal edge glow gradients to convey open spatial continuity
    const hGlowLeft = ctx.createLinearGradient(0, 0, 36, 0);
    hGlowLeft.addColorStop(0, 'rgba(56, 189, 248, 0.18)');
    hGlowLeft.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = hGlowLeft;
    ctx.fillRect(0, 0, 36, CANVAS_HEIGHT);

    const hGlowRight = ctx.createLinearGradient(CANVAS_WIDTH, 0, CANVAS_WIDTH - 36, 0);
    hGlowRight.addColorStop(0, 'rgba(56, 189, 248, 0.18)');
    hGlowRight.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = hGlowRight;
    ctx.fillRect(CANVAS_WIDTH - 36, 0, 36, CANVAS_HEIGHT);

    const vGlowTop = ctx.createLinearGradient(0, 0, 0, 36);
    vGlowTop.addColorStop(0, 'rgba(168, 85, 247, 0.18)');
    vGlowTop.addColorStop(1, 'rgba(168, 85, 247, 0)');
    ctx.fillStyle = vGlowTop;
    ctx.fillRect(0, 0, CANVAS_WIDTH, 36);

    const vGlowBottom = ctx.createLinearGradient(0, CANVAS_HEIGHT, 0, CANVAS_HEIGHT - 36);
    vGlowBottom.addColorStop(0, 'rgba(168, 85, 247, 0.18)');
    vGlowBottom.addColorStop(1, 'rgba(168, 85, 247, 0)');
    ctx.fillStyle = vGlowBottom;
    ctx.fillRect(0, CANVAS_HEIGHT - 36, CANVAS_WIDTH, 36);

    // Left & Right Portal Edges (Horizontal Loop)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(1.5, 0); ctx.lineTo(1.5, CANVAS_HEIGHT);
    ctx.moveTo(CANVAS_WIDTH - 1.5, 0); ctx.lineTo(CANVAS_WIDTH - 1.5, CANVAS_HEIGHT);
    ctx.stroke();

    // Top & Bottom Portal Edges (Vertical Loop)
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
    ctx.beginPath();
    ctx.moveTo(0, 1.5); ctx.lineTo(CANVAS_WIDTH, 1.5);
    ctx.moveTo(0, CANVAS_HEIGHT - 1.5); ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - 1.5);
    ctx.stroke();
    ctx.setLineDash([]);

    // Portal Directional Chevrons
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(168, 85, 247, 0.4)';
    ctx.fillText('▲ VERTICAL LOOP PORTAL (WRAPS TO BOTTOM) ▲', CANVAS_WIDTH / 2, 12);
    ctx.fillText('▼ VERTICAL LOOP PORTAL (WRAPS TO TOP) ▼', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 12);

    ctx.save();
    ctx.translate(12, CANVAS_HEIGHT / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.fillText('◄ HORIZONTAL LOOP (WRAPS TO RIGHT) ►', 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(CANVAS_WIDTH - 12, CANVAS_HEIGHT / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.fillText('◄ HORIZONTAL LOOP (WRAPS TO LEFT) ►', 0, 0);
    ctx.restore();

    // 2. Stars & Ambient Arena Lighting
    stateRef.current.stars.forEach(star => {
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * 0.4})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. Draw Tire Skid Marks on the Asphalt
    drawSkidMarks(ctx, stateRef.current.skidMarks);

    // 3b. Draw Dual Exhaust Grey Jet Smoke Traces (expanding and cloudier further back)
    drawJetSmoke(ctx, stateRef.current.jetSmoke);

    // 3c. Draw Floating Asteroids with Realistic 3D Texture & Surface Craters
    drawAsteroids(ctx, stateRef.current.asteroids);

    // 4. Draw Particles (Sparks, Exhaust, Tire Smoke) with edge loop rendering
    stateRef.current.particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      // Wrap particle clone if near edge
      if (p.x < 30) {
        ctx.beginPath();
        ctx.arc(p.x + CANVAS_WIDTH, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.x > CANVAS_WIDTH - 30) {
        ctx.beginPath();
        ctx.arc(p.x - CANVAS_WIDTH, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.y < 30) {
        ctx.beginPath();
        ctx.arc(p.x, p.y + CANVAS_HEIGHT, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.y > CANVAS_HEIGHT - 30) {
        ctx.beginPath();
        ctx.arc(p.x, p.y - CANVAS_HEIGHT, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1.0;

    // 5. Draw Both Top-View Ball-Cars
    const maxSpeed = GEAR_CONFIG[3].maxSpeed;
    stateRef.current.players.forEach(p => {
      drawBallCar(ctx, p, maxSpeed);
    });

    // 6. Draw Floating Single-Point-of-Impact Damage Popups
    drawDamagePopups(ctx, stateRef.current.damagePopups);

    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const render = () => {
      update();
      draw(ctx);
      animationFrameId = window.requestAnimationFrame(render);
    };

    render();
    return () => window.cancelAnimationFrame(animationFrameId);
  }, []);

  // --- Start / Reset Game Match ---
  const resetMatch = (customAsteroids?: any[]) => {
    const p1 = stateRef.current.players[0];
    const p2 = stateRef.current.players[1];

    p1.health = INITIAL_HEALTH;
    p1.pos = { x: 250, y: CANVAS_HEIGHT / 2 };
    p1.vel = { x: 0, y: 0 };
    p1.angle = 0;
    p1.angularVel = 0;
    p1.steerAngle = 0;
    p1.throttle = 0;
    p1.steering = 0;
    p1.gear = 1;
    p1.braking = false;
    p1.stalled = false;
    p1.revLimiting = false;
    p1.unbalancedTimer = 0;
    p1.wobbleAngle = 0;
    p1.wobbleVel = 0;
    p1.touchingWall = { left: false, right: false, top: false, bottom: false };
    p1.touchingCar = false;
    p1.rpm = 1000;
    p1.strikes = 0;

    p2.health = INITIAL_HEALTH;
    p2.pos = { x: CANVAS_WIDTH - 250, y: CANVAS_HEIGHT / 2 };
    p2.vel = { x: 0, y: 0 };
    p2.angle = Math.PI;
    p2.angularVel = 0;
    p2.steerAngle = 0;
    p2.throttle = 0;
    p2.steering = 0;
    p2.gear = 1;
    p2.braking = false;
    p2.stalled = false;
    p2.revLimiting = false;
    p2.unbalancedTimer = 0;
    p2.wobbleAngle = 0;
    p2.wobbleVel = 0;
    p2.touchingWall = { left: false, right: false, top: false, bottom: false };
    p2.touchingCar = false;
    p2.rpm = 1000;
    p2.strikes = 0;

    stateRef.current.particles = [];
    stateRef.current.skidMarks = [];
    stateRef.current.jetSmoke = [];
    stateRef.current.damagePopups = [];
    if (customAsteroids && Array.isArray(customAsteroids)) {
      stateRef.current.asteroids = customAsteroids;
    } else {
      stateRef.current.asteroids = spawnAsteroids(7, [
        { x: 250, y: CANVAS_HEIGHT / 2 },
        { x: CANVAS_WIDTH - 250, y: CANVAS_HEIGHT / 2 },
      ]);
    }
    stateRef.current.screenShake = 0;
    stateRef.current.status = 'playing';
    setGameState('playing');
    setWinner(null);
    setHealths([INITIAL_HEALTH, INITIAL_HEALTH]);
    setStrikes([0, 0]);
  };

  const startLocalGame = () => {
    resetMatch();
  };

  const handleStartOnlineMatch = () => {
    const freshAsteroids = spawnAsteroids(7, [
      { x: 250, y: CANVAS_HEIGHT / 2 },
      { x: CANVAS_WIDTH - 250, y: CANVAS_HEIGHT / 2 },
    ]);
    stateRef.current.asteroids = freshAsteroids;
    network.startGame({ asteroids: freshAsteroids });
    resetMatch(freshAsteroids);
  };

  const handleRematch = () => {
    if (multiplayerRef.current.role === 'blue') {
      const freshAsteroids = spawnAsteroids(7, [
        { x: 250, y: CANVAS_HEIGHT / 2 },
        { x: CANVAS_WIDTH - 250, y: CANVAS_HEIGHT / 2 },
      ]);
      network.requestRematch({ asteroids: freshAsteroids });
    } else {
      network.requestRematch();
    }
    setMultiplayer((prev) => ({ ...prev, rematchRequestedByMe: true }));
  };

  const handleLeaveRoom = () => {
    network.leaveRoom();
    network.disconnect();
    setMultiplayer({
      connected: false,
      roomId: null,
      role: null,
      opponentJoined: false,
      rematchRequestedByMe: false,
      rematchRequestedByOpponent: false,
      statusMessage: '',
      ping: 0,
    });
    setGameMode('menu');
    setGameState('start');
  };

  const [copiedCode, setCopiedCode] = useState(false);
  const handleCopyRoomId = () => {
    if (multiplayer.roomId) {
      navigator.clipboard.writeText(multiplayer.roomId);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="relative w-full min-h-screen bg-[#050505] overflow-x-hidden flex flex-col items-center justify-start p-4 font-sans text-white">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-blue-900/20 blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-red-900/20 blur-[130px]" />
      </div>

      {/* Main Canvas Arena Container */}
      <div className="relative w-full max-w-[1200px] aspect-[12/8] border border-white/10 bg-black/50 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden mt-1">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full block"
        />

        {/* In-Game Top HUD (Health Bars & Status Badges) */}
        <div className="absolute top-0 left-0 w-full p-5 flex justify-between items-start pointer-events-none">
          {/* Player 1 Health & Status Badge */}
          <div className="flex items-center gap-3 bg-black/75 backdrop-blur-md p-2.5 rounded-2xl border border-white/15 shadow-xl">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.6)]">
              <Rocket size={20} />
            </div>
            <div className="flex flex-col min-w-[200px]">
              <div className="flex justify-between items-center gap-3">
                <span className="text-xs font-mono font-bold tracking-wider text-blue-400">
                  PLAYER 1 (BLUE)
                </span>
                {/* Strike Count Badge */}
                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                  <Zap size={10} className="fill-amber-400 text-amber-400" />
                  <span>STRIKES: {strikes[0]}</span>
                </span>
              </div>
              {/* Health Bar */}
              <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden mt-1.5 border border-white/10">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-600 to-cyan-400"
                  initial={{ width: '100%' }}
                  animate={{ width: `${healths[0]}%` }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                />
              </div>
              {/* Under the Health: Running Gear & Brake Indication */}
              <div className="flex items-center justify-between gap-2 mt-1.5 pt-1 border-t border-white/10 text-[10px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="text-white/40 text-[9px] uppercase tracking-wider">GEAR</span>
                  <span className="px-1.5 py-0.2 rounded bg-blue-500/25 text-blue-300 border border-blue-500/40 font-bold font-mono">
                    G{p1Telemetry.gear}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-white/40 text-[9px] uppercase tracking-wider">BRAKE</span>
                  <span
                    className={`px-1.5 py-0.2 rounded font-bold font-mono text-[9px] transition-all duration-150 ${
                      p1Telemetry.isBraking
                        ? 'bg-red-500/30 text-red-300 border border-red-500/70 shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse'
                        : 'bg-white/5 text-white/30 border border-white/10'
                    }`}
                  >
                    {p1Telemetry.isBraking ? '🛑 ON' : 'OFF'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Center Transmission & Mode Switcher */}
          <div className="hidden md:flex flex-col items-center gap-1.5 px-4 py-1.5 rounded-full bg-black/80 border border-white/15 text-[11px] font-mono text-white/90 pointer-events-auto backdrop-blur-md shadow-xl">
            {gameMode === 'online_lobby' || multiplayer.roomId !== null ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                  <Globe size={13} className="animate-spin" />
                  <span>ONLINE ROOM:</span>
                  <button
                    onClick={handleCopyRoomId}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-all font-mono font-black tracking-widest text-xs cursor-pointer"
                    title="Click to copy Room Code"
                  >
                    <span>{multiplayer.roomId || 'CONNECTING...'}</span>
                    {copiedCode ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>

                <div className="h-3 w-px bg-white/20" />

                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-white/50">YOU:</span>
                  <span
                    className={`px-1.5 py-0.5 rounded font-bold ${
                      multiplayer.role === 'blue'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'bg-red-500/20 text-red-300 border border-red-500/40'
                    }`}
                  >
                    {multiplayer.role === 'blue' ? 'BLUE (HOST)' : 'RED (GUEST)'}
                  </span>
                </div>

                <div className="h-3 w-px bg-white/20" />

                <button
                  id="leave-room-hud-btn"
                  onClick={handleLeaveRoom}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[10px] font-bold cursor-pointer transition-colors"
                >
                  <LogOut size={11} />
                  <span>LEAVE</span>
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Gauge size={13} className="text-cyan-400" />
                  <span>1v1 LOCAL DEMOLITION ARENA</span>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-cyan-400 font-bold uppercase tracking-wider">
                    Full Toroidal Physics • Asteroids
                  </span>
                  <button
                    id="toggle-ai-btn"
                    onClick={() => setAiOpponent(prev => !prev)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer border ${
                      aiOpponent
                        ? 'bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30'
                        : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20'
                    }`}
                  >
                    {aiOpponent ? '🤖 P2: AI BOT (ON)' : '👥 P2: MANUAL 2P'}
                  </button>
                  <button
                    id="switch-mode-btn"
                    onClick={() => {
                      setGameMode('menu');
                      setGameState('start');
                    }}
                    className="px-2 py-0.5 rounded bg-white/10 text-white/70 border border-white/20 hover:bg-white/20 text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    MAIN MENU
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Player 2 Health & Status Badge */}
          <div className="flex items-center gap-3 flex-row-reverse bg-black/75 backdrop-blur-md p-2.5 rounded-2xl border border-white/15 shadow-xl">
            <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.6)]">
              <Rocket size={20} className="rotate-180" />
            </div>
            <div className="flex flex-col items-end min-w-[200px]">
              <div className="flex justify-between items-center gap-3 w-full flex-row-reverse">
                <span className="text-xs font-mono font-bold tracking-wider text-red-400">
                  PLAYER 2 (RED)
                </span>
                {/* Strike Count Badge */}
                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                  <Zap size={10} className="fill-amber-400 text-amber-400" />
                  <span>STRIKES: {strikes[1]}</span>
                </span>
              </div>
              {/* Health Bar */}
              <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden mt-1.5 border border-white/10">
                <motion.div
                  className="h-full bg-gradient-to-r from-red-600 to-rose-400"
                  initial={{ width: '100%' }}
                  animate={{ width: `${healths[1]}%` }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                />
              </div>
              {/* Under the Health: Running Gear & Brake Indication */}
              <div className="flex items-center justify-between gap-2 mt-1.5 pt-1 border-t border-white/10 text-[10px] font-mono w-full">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-1.5 py-0.2 rounded font-bold font-mono text-[9px] transition-all duration-150 ${
                      p2Telemetry.isBraking
                        ? 'bg-red-500/30 text-red-300 border border-red-500/70 shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse'
                        : 'bg-white/5 text-white/30 border border-white/10'
                    }`}
                  >
                    {p2Telemetry.isBraking ? '🛑 ON' : 'OFF'}
                  </span>
                  <span className="text-white/40 text-[9px] uppercase tracking-wider">BRAKE</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.2 rounded bg-red-500/25 text-red-300 border border-red-500/40 font-bold font-mono">
                    G{p2Telemetry.gear}
                  </span>
                  <span className="text-white/40 text-[9px] uppercase tracking-wider">GEAR</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Start / Menu / Game Over Overlays */}
        <AnimatePresence>
          {/* Main Launching Menu / Online Lobby Overlay */}
          {(gameMode === 'menu' || (gameMode === 'online_lobby' && gameState !== 'playing' && gameState !== 'gameover')) && (
            <MenuOverlay
              currentMode={gameMode}
              onSelectLocal1v1={() => {
                setGameMode('local_1v1');
                setGameState('start');
              }}
              onSelectOnline={() => {
                setGameMode('online_lobby');
              }}
              onStartOnlineGame={handleStartOnlineMatch}
              onBackToMenu={handleLeaveRoom}
              multiplayer={multiplayer}
              setMultiplayer={setMultiplayer}
            />
          )}

          {/* Local 1v1 Mode Start Briefing */}
          {gameMode === 'local_1v1' && gameState === 'start' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20"
            >
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => setGameMode('menu')}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80 text-xs font-mono transition-colors cursor-pointer"
                >
                  <ArrowLeft size={14} /> Back to Game Modes
                </button>
              </div>

              <motion.h1
                initial={{ y: -20 }}
                animate={{ y: 0 }}
                className="text-5xl md:text-6xl font-black tracking-tighter mb-2 italic uppercase"
              >
                1v1 <span className="text-blue-500">Battle</span>
              </motion.h1>
              <p className="text-sm md:text-base opacity-75 max-w-xl mb-4">
                Top-view ball-car combat with looping space physics and floating asteroids!
                Boundaries wrap seamlessly across edges. Speed calibrated with reduced top speed and natural diminishing inertia.
              </p>

              {/* Looping Portal Banner */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-6">
                <span>🌌 Seamless Edge Loop: Right ◄► Left • Top ▲▼ Bottom • Floating Asteroids</span>
              </div>

              {/* Instructions Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mb-8 w-full">
                {/* Player 1 Card */}
                <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex flex-col items-center gap-2 text-left">
                  <div className="flex items-center gap-2 text-blue-400 font-bold font-mono">
                    <Rocket size={16} /> PLAYER 1 (BLUE CAR)
                  </div>
                  <ul className="text-xs font-mono space-y-1.5 opacity-85 w-full">
                    <li>🕹 <strong>Drive & Steer:</strong> W/S (Gas/Rev), A/D (Steer) or Left Joystick</li>
                    <li>⚙ <strong>Gears 1-4:</strong> Keys 1, 2, 3, 4 (Shift speeds)</li>
                    <li>🛑 <strong>Handbrake:</strong> Left Ctrl / Space (Drift & Lock Brakes)</li>
                    <li className="text-[11px] text-blue-300">⏱ Calibrated top speed & diminishing coasting inertia!</li>
                  </ul>
                </div>

                {/* Player 2 Card */}
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex flex-col items-center gap-2 text-left">
                  <div className="flex items-center gap-2 text-red-400 font-bold font-mono">
                    <Rocket size={16} className="rotate-180" /> PLAYER 2 (RED CAR)
                  </div>
                  <ul className="text-xs font-mono space-y-1.5 opacity-85 w-full">
                    <li>🕹 <strong>Drive & Steer:</strong> Up/Down or I/K (Gas/Rev), Left/Right or J/L (Steer)</li>
                    <li>⚙ <strong>Gears 1-4:</strong> Numpad 1-4 or Right Shift + 1-4</li>
                    <li>🛑 <strong>Handbrake:</strong> Right Ctrl or Num 0</li>
                    <li className="text-[11px] text-red-300">☄ Watch out for drifting asteroids — impacts cause serious damage!</li>
                  </ul>
                </div>
              </div>

              <button
                id="start-mission-btn"
                onClick={startLocalGame}
                className="group relative px-12 py-4 bg-white text-black font-bold uppercase tracking-widest rounded-full overflow-hidden transition-transform active:scale-95 shadow-xl hover:shadow-blue-500/30 cursor-pointer"
              >
                <div className="absolute inset-0 bg-blue-500 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300" />
                <span className="relative z-10 flex items-center gap-2 group-hover:text-white transition-colors">
                  <Play size={20} fill="currentColor" /> Start Battle
                </span>
              </button>
            </motion.div>
          )}

          {/* Game Over Screen */}
          {gameState === 'gameover' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center z-20"
            >
              <Trophy size={72} className={winner === 1 ? "text-blue-500 mb-4" : "text-red-500 mb-4"} />
              <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-2 italic">
                Match <span className={winner === 1 ? "text-blue-500" : "text-red-500"}>Decided</span>
              </h2>

              {/* Winner Text with online role awareness */}
              <p className="text-xl font-mono uppercase tracking-widest mb-2 opacity-90">
                {gameMode === 'online_lobby' || multiplayer.roomId !== null ? (
                  multiplayer.role === (winner === 1 ? 'blue' : 'red') ? (
                    <span className="text-emerald-400 font-black">🏆 VICTORY! YOU WON THE ARENA!</span>
                  ) : (
                    <span className="text-red-400 font-black">💥 DEFEAT! OPPONENT WON THE MATCH!</span>
                  )
                ) : (
                  `Player ${winner} (${winner === 1 ? 'Blue' : 'Red'}) Won the Demolition Arena`
                )}
              </p>

              {/* Online Mode Badge in Game Over */}
              {(gameMode === 'online_lobby' || multiplayer.roomId !== null) && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-mono mb-4 text-cyan-300">
                  <Globe size={13} />
                  <span>ROOM {multiplayer.roomId} • Both players stay connected in room for rematch</span>
                </div>
              )}

              {/* Match Strike Summary */}
              <div className="flex items-center gap-6 px-8 py-3.5 rounded-2xl bg-white/5 border border-white/15 mb-8 font-mono shadow-xl">
                <div className="flex flex-col items-center">
                  <span className="text-[11px] text-blue-400 font-bold tracking-wider">PLAYER 1 (BLUE) STRIKES</span>
                  <span className="text-3xl font-black text-blue-300 mt-0.5">{strikes[0]}</span>
                </div>
                <div className="text-white/20 text-2xl font-bold">VS</div>
                <div className="flex flex-col items-center">
                  <span className="text-[11px] text-red-400 font-bold tracking-wider">PLAYER 2 (RED) STRIKES</span>
                  <span className="text-3xl font-black text-red-300 mt-0.5">{strikes[1]}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-4">
                {gameMode === 'online_lobby' || multiplayer.roomId !== null ? (
                  <>
                    <button
                      id="online-rematch-btn"
                      disabled={multiplayer.rematchRequestedByMe && !multiplayer.rematchRequestedByOpponent}
                      onClick={handleRematch}
                      className={`px-8 py-3.5 rounded-full font-bold uppercase tracking-widest text-sm flex items-center gap-2 transition-all shadow-xl ${
                        multiplayer.rematchRequestedByOpponent
                          ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-emerald-500/40 animate-bounce cursor-pointer'
                          : multiplayer.rematchRequestedByMe
                          ? 'bg-white/10 text-white/40 border border-white/20 cursor-wait'
                          : 'bg-white text-black hover:bg-white/90 cursor-pointer active:scale-95'
                      }`}
                    >
                      <RefreshCw size={18} className={multiplayer.rematchRequestedByMe ? 'animate-spin' : ''} />
                      <span>
                        {multiplayer.rematchRequestedByOpponent
                          ? 'Accept Rematch!'
                          : multiplayer.rematchRequestedByMe
                          ? 'Waiting for Opponent...'
                          : 'Request Rematch'}
                      </span>
                    </button>

                    <button
                      id="leave-room-btn"
                      onClick={handleLeaveRoom}
                      className="px-6 py-3.5 rounded-full border border-white/20 hover:bg-white/10 text-white/80 font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <LogOut size={16} />
                      <span>Leave Room</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      id="restart-battle-btn"
                      onClick={startLocalGame}
                      className="group relative px-10 py-3.5 border-2 border-white text-white font-bold uppercase tracking-widest rounded-full overflow-hidden transition-all hover:bg-white hover:text-black active:scale-95 cursor-pointer"
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        <RefreshCw size={18} /> Rematch Battle
                      </span>
                    </button>

                    <button
                      id="back-menu-btn"
                      onClick={() => {
                        setGameMode('menu');
                        setGameState('start');
                      }}
                      className="px-6 py-3.5 rounded-full border border-white/20 hover:bg-white/10 text-white/80 font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <ArrowLeft size={16} />
                      <span>Main Menu</span>
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cockpit & Controls Area: Speedometers, Gear Indicators, Joysticks & Pedals */}
      <div className="w-full max-w-[1200px] mt-6 flex flex-col lg:flex-row justify-between items-center gap-6">
        {/* Left Side: Player 1 Cockpit & Joystick */}
        <div className="flex items-center gap-4 w-full lg:w-auto justify-center lg:justify-start">
          <Joystick
            label="Player 1 (Steer & Gas)"
            color="#3b82f6"
            onMove={(x, y) => handleJoystick(1, x, y)}
            onStart={() => handleJoystickStart(1)}
            onEnd={() => handleJoystickEnd(1)}
          />

          <CockpitDashboard
            playerNumber={1}
            color="#3b82f6"
            telemetry={p1Telemetry}
            onShift={(g) => shiftPlayerGear(1, g)}
            onBrakeStart={() => { p1TouchBrake.current = true; }}
            onBrakeEnd={() => { p1TouchBrake.current = false; }}
            gearShortcuts={['1', '2', '3', '4']}
            brakeShortcut="L-CTRL"
          />
        </div>

        {/* Center Car Physics & Transmission Rules */}
        <div className="hidden xl:flex flex-col items-center gap-2 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10 text-center max-w-[280px]">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-white/80 uppercase">
            <Disc size={14} className="text-cyan-400" />
            <span>BALL-CAR DRIVING PHYSICS</span>
          </div>
          <div className="text-[10px] font-mono text-white/50 leading-relaxed text-left space-y-1">
            <p>• <strong>Drive & Steer:</strong> Heading angle, front wheel steering & drift grip.</p>
            <p>• <strong>Single Impact Point:</strong> Damage triggers once upon contact.</p>
            <p>• <strong>Impact Kinetic Force:</strong> Damage scales with speed + acceleration.</p>
            <p>• <strong>Inertia & Spin:</strong> Off-center torque knocks cars into spin-outs.</p>
            <p>• <strong>Handbrake:</strong> Initiates power-drifts and cuts sliding.</p>
          </div>
        </div>

        {/* Right Side: Player 2 Cockpit & Joystick */}
        <div className="flex items-center gap-4 w-full lg:w-auto justify-center lg:justify-end">
          <CockpitDashboard
            playerNumber={2}
            color="#ef4444"
            telemetry={p2Telemetry}
            onShift={(g) => shiftPlayerGear(2, g)}
            onBrakeStart={() => { p2TouchBrake.current = true; }}
            onBrakeEnd={() => { p2TouchBrake.current = false; }}
            gearShortcuts={['R⇧+1', 'R⇧+2', 'R⇧+3', 'R⇧+4']}
            brakeShortcut="R-CTRL"
          />

          <Joystick
            label="Player 2 (Steer & Gas)"
            color="#ef4444"
            onMove={(x, y) => handleJoystick(2, x, y)}
            onStart={() => handleJoystickStart(2)}
            onEnd={() => handleJoystickEnd(2)}
          />
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-6 mb-2 text-[10px] font-mono uppercase tracking-[0.3em] opacity-30 text-center">
        Orbital Clash // Top-Down Ball-Car Combat Physics Simulator // v3.0
      </div>
    </div>
  );
}
