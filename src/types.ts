export interface Vector {
  x: number;
  y: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife?: number;
  color: string;
  size: number;
  type?: 'spark' | 'smoke' | 'debris' | 'tireSmoke';
}

export interface SkidMark {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
  width: number;
}

export interface DamagePopup {
  id: number;
  x: number;
  y: number;
  text: string;
  subtext?: string;
  color: string;
  life: number; // 1.0 down to 0
  vy: number;
}

export interface GearConfig {
  gear: number;
  maxSpeed: number;
  accel: number;
  minLaunchSpeed: number;
  label: string;
}

export interface WallContact {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

export interface Player {
  id: number;
  pos: Vector;
  vel: Vector;
  acc: Vector;
  
  // Driving & Heading Physics
  angle: number;           // Car heading direction in radians
  angularVel: number;      // Current rotational spin rate (rad/frame)
  steerAngle: number;      // Wheel turning angle (-0.45 to +0.45 rad)
  throttle: number;        // -1 (reverse) to +1 (forward)
  steering: number;        // -1 (left) to +1 (right)
  
  // Health & Condition
  health: number;
  color: string;
  radius: number;          // Bounding radius for collision
  score: number;
  strikes: number;         // Total successful combat strikes dealt
  
  // Transmission & Engine
  gear: number;            // 1 to 4
  braking: boolean;
  stalled: boolean;
  revLimiting: boolean;
  rpm: number;             // 1000 to 8000
  
  // Inertia, Drift & Balance Physics
  unbalancedTimer: number; // Frames remaining in loss-of-balance state
  wobbleAngle: number;     // Dynamic body roll / chassis tilt (rad)
  wobbleVel: number;       // Angular velocity of body roll
  skidding: boolean;       // Tires losing traction / screeching
  
  // Discrete Single-Point-of-Impact Tracking
  touchingWall: WallContact;
  touchingCar: boolean;
  
  // Tire position cache for skid marks (left and right tires)
  lastTireLeft?: Vector;
  lastTireRight?: Vector;
}

export interface GameState {
  players: Player[];
  particles: Particle[];
  skidMarks: SkidMark[];
  damagePopups: DamagePopup[];
  stars: { x: number; y: number; size: number; opacity: number }[];
  status: 'start' | 'playing' | 'gameover';
  winner: number | null;
  screenShake: number;     // Screen shake intensity
}
