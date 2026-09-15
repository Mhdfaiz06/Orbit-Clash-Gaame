import { Player, Particle, SkidMark, DamagePopup, GearConfig, Vector, JetSmokePuff } from './types';

export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 800;
export const CAR_RADIUS = 30;
export const INITIAL_HEALTH = 100;

/**
 * Display speed multiplier: Keeps dashboard speedometer numbers authentic (0-18 km/h scale)
 * while physical traveling velocity is fast and responsive (~5s in G1 to cross 1200px arena).
 */
export const DISPLAY_SPEED_MULTIPLIER = 1.60;

export const GEAR_CONFIG: GearConfig[] = [
  // G1: 2.2 px/frame (gentle, controlled starting crawl; speedometer ~3.5 km/h)
  { gear: 1, maxSpeed: 2.2,  accel: 0.085, minLaunchSpeed: 0.0, label: '1ST' },
  // G2: 4.2 px/frame (smooth mid-pace cruising; speedometer ~6.7 km/h)
  { gear: 2, maxSpeed: 4.2,  accel: 0.070, minLaunchSpeed: 1.2, label: '2ND' },
  // G3: 6.8 px/frame (dynamic racing velocity; speedometer ~10.9 km/h)
  { gear: 3, maxSpeed: 6.8,  accel: 0.055, minLaunchSpeed: 2.6, label: '3RD' },
  // G4: 9.8 px/frame (high-velocity overdrive; speedometer ~15.7 km/h)
  { gear: 4, maxSpeed: 9.8,  accel: 0.045, minLaunchSpeed: 4.6, label: '4TH' },
];

/**
 * Updates spacecraft / car driving physics:
 * - In rest mode: behaves under zero-gravity float (conservation of momentum, frictionless glide, hovering levitation).
 * - During braking: immediately reduces throttle to zero, while zero-gravity inertia continues carrying the vessel as retro-thrusters decelerate it.
 * - Spaceship in space motion: Newtonian vector thrust, RCS attitude steering at any speed, and zero-gravity inertial drifting.
 * - Dual exhaust jet smoke trace: continuous grey smoke emitted from twin exhausts, expanding and getting cloudier as it is traced further back.
 */
export function updateCarDriving(
  p: Player,
  particles: Particle[],
  skidMarks: SkidMark[],
  jetSmoke: JetSmokePuff[]
) {
  const currentSpeed = Math.hypot(p.vel.x, p.vel.y);
  const gearCfg = GEAR_CONFIG[p.gear - 1];

  // 1. Spacecraft Heading Vectors
  const forwardX = Math.cos(p.angle);
  const forwardY = Math.sin(p.angle);
  const rightX = -forwardY;
  const rightY = forwardX;

  // 2. Decompose velocity into longitudinal (forward) and lateral (drift) components
  let vForward = p.vel.x * forwardX + p.vel.y * forwardY;
  let vLateral = p.vel.x * rightX + p.vel.y * rightY;

  // 3. Reactor / Engine Thruster Ignition & Stalling
  if (currentSpeed < 1.0) {
    p.stalled = p.gear !== 1;
  } else {
    p.stalled = currentSpeed < gearCfg.minLaunchSpeed;
  }

  let effectiveAccel = gearCfg.accel;
  if (p.stalled) {
    if (currentSpeed < 1.0) {
      effectiveAccel = 0;
      // Stutter stall plasma puff
      if (Math.random() < 0.08) {
        particles.push({
          x: p.pos.x - forwardX * p.radius,
          y: p.pos.y - forwardY * p.radius,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          life: 0.6,
          color: '#94a3b8',
          size: Math.random() * 3 + 2,
          type: 'smoke',
        });
      }
    } else {
      effectiveAccel = gearCfg.accel * 0.55;
    }
  }

  // 4. Spacecraft Steering & RCS Attitude Thrusters with Silky Smooth Damping
  // In zero-gravity space, attitude thrusters rotate the ship freely with smooth input filtering
  if (p.smoothSteer === undefined) p.smoothSteer = 0;
  p.smoothSteer += (p.steering - p.smoothSteer) * 0.24;

  // Speed-sensitive steering geometry: slightly tighter at low speed, rock-solid at high speed
  const speedSteerDamp = Math.max(0.72, 1.0 - (currentSpeed / (gearCfg.maxSpeed * 2.6)) * 0.28);
  const targetSteerAngle = p.smoothSteer * 0.44 * speedSteerDamp;
  p.steerAngle += (targetSteerAngle - p.steerAngle) * 0.25;
  const rcsTurnRate = p.steerAngle * 0.080;

  const isUnbalanced = p.unbalancedTimer > 0;
  if (isUnbalanced) {
    p.unbalancedTimer--;
    // Zero-g rotational inertia from impacts takes longer to damp down
    p.angle += p.angularVel;
    p.angularVel *= 0.95;
  } else {
    p.angle += rcsTurnRate + p.angularVel;
    p.angularVel *= 0.88;
  }

  // Cold-gas RCS thruster puffs during attitude maneuvers
  if (Math.abs(p.steering) > 0.25 && Math.random() < 0.25) {
    const sideSign = p.steering > 0 ? 1 : -1;
    particles.push({
      x: p.pos.x + forwardX * (p.radius * 0.7) - rightX * (sideSign * 14),
      y: p.pos.y + forwardY * (p.radius * 0.7) - rightY * (sideSign * 14),
      vx: rightX * sideSign * 2.2 + (Math.random() - 0.5),
      vy: rightY * sideSign * 2.2 + (Math.random() - 0.5),
      life: 0.28,
      color: '#e2e8f0',
      size: Math.random() * 2 + 1,
      type: 'smoke',
    });
  }

  // 5. Acceleration, Zero-Gravity Float, and Inertial Braking
  const isThrottling = Math.abs(p.throttle) > 0.05 && !p.braking;
  const wasThrottling = p.lastThrottling ?? false;

  // Immediate inertia step-down on throttle release:
  // Momentum immediately drops below the active throttle speed upon release
  if (wasThrottling && !isThrottling && !p.braking) {
    p.vel.x *= 0.80;
    p.vel.y *= 0.80;
  }
  p.lastThrottling = isThrottling;

  if (p.braking) {
    // BRAKING IN ZERO GRAVITY:
    // 1) Cuts throttle completely
    p.throttle = 0;

    // 2) The inertia of zero gravity continues carrying the vehicle forward
    // while retro-thrusters apply decelerating counter-force opposing the current velocity vector!
    if (currentSpeed > 0.04) {
      const retroDecel = 0.15; // Smooth counter-acceleration against zero-g momentum
      const newSpeed = Math.max(0, currentSpeed - retroDecel);
      const speedScale = newSpeed / currentSpeed;
      p.vel.x *= speedScale;
      p.vel.y *= speedScale;

      // Recompute decomposed velocities after retro-thrust
      vForward = p.vel.x * forwardX + p.vel.y * forwardY;
      vLateral = p.vel.x * rightX + p.vel.y * rightY;

      // Forward retro-thruster counter-burst plasma sparks opposing forward glide
      if (currentSpeed > 1.2 && Math.random() < 0.4) {
        const normVx = p.vel.x / currentSpeed;
        const normVy = p.vel.y / currentSpeed;
        particles.push({
          x: p.pos.x + normVx * (p.radius * 0.75) + (Math.random() - 0.5) * 8,
          y: p.pos.y + normVy * (p.radius * 0.75) + (Math.random() - 0.5) * 8,
          vx: normVx * 3.0 + (Math.random() - 0.5) * 2,
          vy: normVy * 3.0 + (Math.random() - 0.5) * 2,
          life: 0.35,
          color: p.id === 1 ? '#38bdf8' : '#fb923c',
          size: Math.random() * 2.5 + 1.2,
          type: 'spark',
        });
      }
    }
  } else if (isThrottling) {
    // MAIN PROPULSION (Spaceship Thrusters):
    // Smooth asymptotic speed limit approach prevents jerky velocity oscillations
    const speedRatio = currentSpeed / gearCfg.maxSpeed;
    if (speedRatio >= 1.0) {
      p.revLimiting = true;
      const decay = Math.pow(gearCfg.maxSpeed / currentSpeed, 0.15);
      p.vel.x *= decay;
      p.vel.y *= decay;
    } else {
      p.revLimiting = false;
      const thrustScale = speedRatio > 0.85 ? Math.max(0.20, 1.0 - (speedRatio - 0.85) / 0.15 * 0.7) : 1.0;
      if (p.throttle > 0) {
        // Forward thruster burn
        const thrust = p.throttle * effectiveAccel * thrustScale;
        p.vel.x += forwardX * thrust;
        p.vel.y += forwardY * thrust;
      } else if (p.gear === 1) {
        // Reverse thruster burn
        const revThrust = p.throttle * (effectiveAccel * 0.65);
        p.vel.x += forwardX * revThrust;
        p.vel.y += forwardY * revThrust;
      }
    }

    // Recompute forward and lateral components after thrust
    vForward = p.vel.x * forwardX + p.vel.y * forwardY;
    vLateral = p.vel.x * rightX + p.vel.y * rightY;
  } else {
    // THROTTLE RELEASED - COASTING INERTIA MODE:
    // Inertia speed is reduced from the active throttle speed, and diminishes steadily with time
    const coastSpeed = Math.hypot(p.vel.x, p.vel.y);
    if (coastSpeed > 0.02) {
      const decayFactor = 0.982;
      const newCoastSpeed = Math.max(0, coastSpeed * decayFactor - 0.005);
      const ratio = newCoastSpeed / coastSpeed;
      p.vel.x *= ratio;
      p.vel.y *= ratio;
    } else {
      p.vel.x = 0;
      p.vel.y = 0;
    }
    p.revLimiting = false;

    vForward = p.vel.x * forwardX + p.vel.y * forwardY;
    vLateral = p.vel.x * rightX + p.vel.y * rightY;
  }

  // 6. Zero-G Inertial Drifting & Flight Assist Stabilization
  const lateralFlightAssist = isUnbalanced ? 0.99 : p.braking ? 0.97 : 0.965;
  vLateral *= lateralFlightAssist;
  if (Math.abs(vLateral) < 0.005) vLateral = 0;

  // Reconstruct world velocity from heading and stabilized drift
  p.vel.x = vForward * forwardX + vLateral * rightX;
  p.vel.y = vForward * forwardY + vLateral * rightY;

  // Frame-synced smooth riding levitation phase (eliminates Date.now() clock stutter)
  if (p.hoverPhase === undefined) p.hoverPhase = p.id * 1.5;
  p.hoverPhase = (p.hoverPhase + 0.045) % (Math.PI * 2);

  // Dynamic Riding Suspension: Pitch (acceleration squat / braking dive)
  if (p.bodyPitch === undefined) p.bodyPitch = 0;
  const targetPitch = p.braking ? -1.8 : (p.throttle > 0 ? 2.0 * Math.min(1.0, currentSpeed / 3.5) : 0);
  p.bodyPitch += (targetPitch - p.bodyPitch) * 0.15;

  // Dynamic Riding Suspension: Roll (centrifugal body roll lean into turns)
  if (p.bodyRoll === undefined) p.bodyRoll = 0;
  const targetRoll = (vLateral * 0.024) + (p.steerAngle * 0.045 * Math.min(1.5, currentSpeed / 3.0));
  p.bodyRoll += (targetRoll - p.bodyRoll) * 0.16;

  // Zero-G Levitation / Hover Wobble Oscillation in Rest Mode
  if (currentSpeed < 1.5 && !p.braking) {
    p.wobbleAngle = Math.sin(p.hoverPhase) * 0.038;
  } else {
    p.wobbleAngle += p.wobbleVel;
    p.wobbleVel -= p.wobbleAngle * 0.20;
    p.wobbleVel *= 0.86;
  }

  // Detect zero-g drift / skidding state
  p.skidding = Math.abs(vLateral) > 1.0 || (p.braking && currentSpeed > 1.8) || isUnbalanced;

  // 7. Update Position
  p.pos.x += p.vel.x;
  p.pos.y += p.vel.y;

  // 8. Dual Exhaust Jet Smoke Trace Generation
  // Smoke is ONLY generated when active forward throttle is applied; no throttle = zero smoke.
  // Calibrated so smoke vanishes completely within 2-3 cm (~75-95 px) behind the rear exhaust.
  const exhaustDistX = -20;
  const exhaustDistY = 8;
  const curExhaustLeft: Vector = {
    x: p.pos.x + forwardX * exhaustDistX - rightX * exhaustDistY,
    y: p.pos.y + forwardY * exhaustDistX - rightY * exhaustDistY,
  };
  const curExhaustRight: Vector = {
    x: p.pos.x + forwardX * exhaustDistX + rightX * exhaustDistY,
    y: p.pos.y + forwardY * exhaustDistX + rightY * exhaustDistY,
  };

  const isForwardThrottling = p.throttle > 0.05 && !p.braking;

  if (isForwardThrottling) {
    // Determine number of interpolated steps between frames to keep the dual trace solid
    let steps = 1;
    if (p.lastExhaustLeft) {
      const stepDist = Math.hypot(curExhaustLeft.x - p.lastExhaustLeft.x, curExhaustLeft.y - p.lastExhaustLeft.y);
      if (stepDist < 60 && stepDist > 5) {
        steps = Math.min(3, Math.ceil(stepDist / 4.5));
      }
    }

    // Precise 2-3 cm trail length calibration:
    // Screen 2-3 cm = ~75 to 95 pixels behind the rear exhaust
    const targetTrailDist = 82 + Math.random() * 12; // ~82-94 pixels (~2.2 - 2.5 cm)
    const travelRate = Math.max(2.0, currentSpeed + 0.9);
    // Lifetime in frames: vanishes exactly within 2-3 cm distance regardless of gear speed
    const maxLife = Math.max(9, Math.min(22, Math.round(targetTrailDist / travelRate)));

    const ejectSpeed = 0.8 + currentSpeed * 0.12 + (p.throttle * 1.0);
    // Dense, rich charcoal grey base opacity right at the car rear
    const baseAlpha = 0.88;

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const posLeftX = p.lastExhaustLeft ? p.lastExhaustLeft.x + (curExhaustLeft.x - p.lastExhaustLeft.x) * t : curExhaustLeft.x;
      const posLeftY = p.lastExhaustLeft ? p.lastExhaustLeft.y + (curExhaustLeft.y - p.lastExhaustLeft.y) * t : curExhaustLeft.y;
      const posRightX = p.lastExhaustRight ? p.lastExhaustRight.x + (curExhaustRight.x - p.lastExhaustRight.x) * t : curExhaustRight.x;
      const posRightY = p.lastExhaustRight ? p.lastExhaustRight.y + (curExhaustRight.y - p.lastExhaustRight.y) * t : curExhaustRight.y;

      // Left exhaust puff
      jetSmoke.push({
        x: posLeftX + (Math.random() - 0.5) * 1.2,
        y: posLeftY + (Math.random() - 0.5) * 1.2,
        vx: -forwardX * ejectSpeed + (Math.random() - 0.5) * 0.5 + p.vel.x * 0.08,
        vy: -forwardY * ejectSpeed + (Math.random() - 0.5) * 0.5 + p.vel.y * 0.08,
        age: 0,
        maxLife: maxLife,
        initialRadius: 4.0 + Math.random() * 1.0,
        targetRadius: 18 + Math.random() * 6,
        carId: p.id,
        nozzle: 0,
        baseAlpha: baseAlpha,
        seed: Math.random() * 100,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.035,
      });

      // Right exhaust puff
      jetSmoke.push({
        x: posRightX + (Math.random() - 0.5) * 1.2,
        y: posRightY + (Math.random() - 0.5) * 1.2,
        vx: -forwardX * ejectSpeed + (Math.random() - 0.5) * 0.5 + p.vel.x * 0.08,
        vy: -forwardY * ejectSpeed + (Math.random() - 0.5) * 0.5 + p.vel.y * 0.08,
        age: 0,
        maxLife: maxLife,
        initialRadius: 4.0 + Math.random() * 1.0,
        targetRadius: 18 + Math.random() * 6,
        carId: p.id,
        nozzle: 1,
        baseAlpha: baseAlpha,
        seed: Math.random() * 100,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.035,
      });
    }

    p.lastExhaustLeft = curExhaustLeft;
    p.lastExhaustRight = curExhaustRight;
  } else {
    // When throttle is released, reset last exhaust points so reconnection doesn't stretch across gaps
    p.lastExhaustLeft = undefined;
    p.lastExhaustRight = undefined;
  }

  // 9. Tire Skid Marks Generation in Soft Grey
  const rearTireDistX = -15;
  const rearTireDistY = 21;
  const curTireLeft: Vector = {
    x: p.pos.x + forwardX * rearTireDistX - rightX * rearTireDistY,
    y: p.pos.y + forwardY * rearTireDistX - rightY * rearTireDistY,
  };
  const curTireRight: Vector = {
    x: p.pos.x + forwardX * rearTireDistX + rightX * rearTireDistY,
    y: p.pos.y + forwardY * rearTireDistX + rightY * rearTireDistY,
  };

  if (p.skidding && currentSpeed > 1.2) {
    if (p.lastTireLeft && p.lastTireRight) {
      const stepDist = Math.hypot(curTireLeft.x - p.lastTireLeft.x, curTireLeft.y - p.lastTireLeft.y);
      if (stepDist < 60) {
        const markAlpha = Math.min(0.55, (Math.abs(vLateral) + (p.braking ? 0.8 : 0)) * 0.30);
        skidMarks.push({
          x1: p.lastTireLeft.x,
          y1: p.lastTireLeft.y,
          x2: curTireLeft.x,
          y2: curTireLeft.y,
          alpha: markAlpha,
          width: 5,
        });
        skidMarks.push({
          x1: p.lastTireRight.x,
          y1: p.lastTireRight.y,
          x2: curTireRight.x,
          y2: curTireRight.y,
          alpha: markAlpha,
          width: 5,
        });
      }
    }

    // Grey smoke drift particles during hard zero-g skids
    if (Math.random() < 0.45) {
      particles.push({
        x: curTireLeft.x + (Math.random() - 0.5) * 4,
        y: curTireLeft.y + (Math.random() - 0.5) * 4,
        vx: -p.vel.x * 0.15 + (Math.random() - 0.5) * 1.5,
        vy: -p.vel.y * 0.15 + (Math.random() - 0.5) * 1.5,
        life: 0.6,
        color: '#94a3b8',
        size: Math.random() * 4.0 + 3.0,
        type: 'smoke',
      });
    }
  }

  p.lastTireLeft = curTireLeft;
  p.lastTireRight = curTireRight;

  // 10. Reactor Engine / RPM Calculation
  if (p.stalled && currentSpeed < 1.0) {
    p.rpm = 650;
  } else {
    const rpmRatio = Math.min(1.0, currentSpeed / gearCfg.maxSpeed);
    const bounce = p.revLimiting ? (Math.random() - 0.5) * 220 : 0;
    p.rpm = Math.min(8000, Math.max(1000, 1000 + rpmRatio * 7000 + bounce));
  }
}

/**
 * Handles Boundary Wrap-Around (Looping Space Portal)
 * Uses exact modular toroidal coordinate wrapping without arbitrary offsets,
 * eliminating high-speed jitters, position leaps, and visual discontinuities.
 */
export function handleArenaBoundaryWrap(
  p: Player,
  particles?: Particle[]
) {
  let wrapDx = 0;
  let wrapDy = 0;

  // Exact modular coordinate wrapping: preserves exact sub-pixel velocity and momentum
  if (p.pos.x >= CANVAS_WIDTH) {
    p.pos.x -= CANVAS_WIDTH;
    wrapDx -= CANVAS_WIDTH;
  } else if (p.pos.x < 0) {
    p.pos.x += CANVAS_WIDTH;
    wrapDx += CANVAS_WIDTH;
  }

  if (p.pos.y >= CANVAS_HEIGHT) {
    p.pos.y -= CANVAS_HEIGHT;
    wrapDy -= CANVAS_HEIGHT;
  } else if (p.pos.y < 0) {
    p.pos.y += CANVAS_HEIGHT;
    wrapDy += CANVAS_HEIGHT;
  }

  // Preserve continuous tire contact anchors across the boundary
  if (wrapDx !== 0 || wrapDy !== 0) {
    if (p.lastTireLeft) {
      p.lastTireLeft.x += wrapDx;
      p.lastTireLeft.y += wrapDy;
    }
    if (p.lastTireRight) {
      p.lastTireRight.x += wrapDx;
      p.lastTireRight.y += wrapDy;
    }
  }
}

/**
 * Handles Car-to-Car Collision with:
 * 1. SINGLE POINT OF IMPACT damage (applied only at initial contact point)
 * 2. Damage directly proportional to relative impact speed AND forward acceleration
 * 3. Momentum, direction, and inertia exchange causing cars to LOSE BALANCE and SPIN OUT!
 */
export function handleCarToCarCollision(
  p1: Player,
  p2: Player,
  particles: Particle[],
  popups: DamagePopup[],
  addScreenShake: (amount: number) => void
) {
  let dx = p2.pos.x - p1.pos.x;
  let dy = p2.pos.y - p1.pos.y;

  // Shortest toroidal path across looping boundaries
  if (dx > CANVAS_WIDTH / 2) dx -= CANVAS_WIDTH;
  else if (dx < -CANVAS_WIDTH / 2) dx += CANVAS_WIDTH;
  if (dy > CANVAS_HEIGHT / 2) dy -= CANVAS_HEIGHT;
  else if (dy < -CANVAS_HEIGHT / 2) dy += CANVAS_HEIGHT;

  const dist = Math.hypot(dx, dy);
  const minDist = p1.radius + p2.radius;

  const isColliding = dist < minDist && dist > 0.001;

  if (isColliding) {
    // Collision normal pointing from P1 to P2
    const nx = dx / dist;
    const ny = dy / dist;

    // Relative velocity: P1 relative to P2
    const relVx = p1.vel.x - p2.vel.x;
    const relVy = p1.vel.y - p2.vel.y;

    // Closing speed along collision normal
    const impactSpeed = relVx * nx + relVy * ny;

    // Separate overlapping cars immediately
    const overlap = minDist - dist;
    p1.pos.x -= nx * (overlap * 0.5);
    p1.pos.y -= ny * (overlap * 0.5);
    p2.pos.x += nx * (overlap * 0.5);
    p2.pos.y += ny * (overlap * 0.5);

    // Check if this is the initial contact frame (Single Point of Impact!)
    if (!p1.touchingCar) {
      // Contact point in world space
      const contactX = p1.pos.x + nx * p1.radius;
      const contactY = p1.pos.y + ny * p1.radius;

      // Forward acceleration vectors of each car
      const gCfg1 = GEAR_CONFIG[p1.gear - 1];
      const gCfg2 = GEAR_CONFIG[p2.gear - 1];
      const a1Mag = Math.max(0, p1.throttle) * gCfg1.accel;
      const a2Mag = Math.max(0, p2.throttle) * gCfg2.accel;

      const a1x = Math.cos(p1.angle) * a1Mag;
      const a1y = Math.sin(p1.angle) * a1Mag;
      const a2x = Math.cos(p2.angle) * a2Mag;
      const a2y = Math.sin(p2.angle) * a2Mag;

      // Acceleration directed into the crash
      // P1 accelerating toward P2: (a1 · n)
      const a1IntoCrash = Math.max(0, a1x * nx + a1y * ny);
      // P2 accelerating toward P1: -(a2 · n)
      const a2IntoCrash = Math.max(0, -(a2x * nx + a2y * ny));

      // Absolute closing intensity
      const effectiveImpactSpeed = Math.max(0.8, Math.abs(impactSpeed));

      // Damage is directly proportional to speed and acceleration!
      // Calibrated for higher traveling speeds: impacts deal between 4 to 38 damage
      const rawD1 = effectiveImpactSpeed * 1.8 + a2IntoCrash * 45.0;
      const rawD2 = effectiveImpactSpeed * 1.8 + a1IntoCrash * 45.0;
      const d1 = Math.min(38, Math.max(4, Math.round(rawD1 * 10) / 10));
      const d2 = Math.min(38, Math.max(4, Math.round(rawD2 * 10) / 10));

      p1.health = Math.max(0, p1.health - d1);
      p2.health = Math.max(0, p2.health - d2);

      // --- STRIKE LOGIC ---
      // 1. Determine who strikes whom based on relative velocity, heading, and acceleration
      const v1IntoCrash = p1.vel.x * nx + p1.vel.y * ny;
      const v2IntoCrash = -(p2.vel.x * nx + p2.vel.y * ny);

      const fwd1X = Math.cos(p1.angle);
      const fwd1Y = Math.sin(p1.angle);
      const fwd2X = Math.cos(p2.angle);
      const fwd2Y = Math.sin(p2.angle);

      const h1IntoCrash = fwd1X * nx + fwd1Y * ny;
      const h2IntoCrash = -(fwd2X * nx + fwd2Y * ny);

      const p1Striking = v1IntoCrash > 0.25 || a1IntoCrash > 0.05 || (h1IntoCrash > 0.2 && p1.throttle > 0.1);
      const p2Striking = v2IntoCrash > 0.25 || a2IntoCrash > 0.05 || (h2IntoCrash > 0.2 && p2.throttle > 0.1);

      // 2. Mutual Strike vs Single-Sided Strike
      // If mutual strike: the one who makes the other car deal with more damage gets the strike;
      // If damage is equal, each player gets 1 strike each.
      const isMutual = (p1Striking && p2Striking) || (!p1Striking && !p2Striking);

      let strikeText = '';
      let strikeSubtext = '';
      let strikeColor = '';

      if (isMutual) {
        if (d2 > d1) {
          // P1 dealt more damage to P2 (d2 > d1)
          p1.strikes = (p1.strikes || 0) + 1;
          strikeText = '⚡ P1 STRIKE!';
          strikeSubtext = `MUTUAL (${d2} vs ${d1} DMG)`;
          strikeColor = '#60a5fa';
        } else if (d1 > d2) {
          // P2 dealt more damage to P1 (d1 > d2)
          p2.strikes = (p2.strikes || 0) + 1;
          strikeText = '⚡ P2 STRIKE!';
          strikeSubtext = `MUTUAL (${d1} vs ${d2} DMG)`;
          strikeColor = '#f87171';
        } else {
          // Exactly equal damage dealt to both cars -> 1 strike each
          p1.strikes = (p1.strikes || 0) + 1;
          p2.strikes = (p2.strikes || 0) + 1;
          strikeText = '⚔️ EQUAL STRIKE!';
          strikeSubtext = '+1 STRIKE TO BOTH';
          strikeColor = '#fbbf24';
        }
      } else if (p1Striking) {
        // P1 struck P2 cleanly
        p1.strikes = (p1.strikes || 0) + 1;
        strikeText = '⚡ P1 STRIKE!';
        strikeSubtext = 'DIRECT IMPACT (+1)';
        strikeColor = '#38bdf8';
      } else {
        // P2 struck P1 cleanly
        p2.strikes = (p2.strikes || 0) + 1;
        strikeText = '⚡ P2 STRIKE!';
        strikeSubtext = 'DIRECT IMPACT (+1)';
        strikeColor = '#f87171';
      }

      // Strike Result Popup
      popups.push({
        id: Date.now() + 3,
        x: contactX,
        y: contactY - 35,
        text: strikeText,
        subtext: strikeSubtext,
        color: strikeColor,
        life: 1.25,
        vy: -1.6,
      });

      // Damage Popups at impact point
      popups.push({
        id: Date.now() + 1,
        x: contactX - 25,
        y: contactY - 15,
        text: `-${d1} HP`,
        subtext: 'P1 IMPACT',
        color: '#60a5fa',
        life: 1.0,
        vy: -1.3,
      });

      popups.push({
        id: Date.now() + 2,
        x: contactX + 25,
        y: contactY - 15,
        text: `-${d2} HP`,
        subtext: 'P2 IMPACT',
        color: '#f87171',
        life: 1.0,
        vy: -1.3,
      });

      // Severe Spark & Armor Shrapnel Explosion
      const sparkCount = Math.min(45, Math.round(effectiveImpactSpeed * 6 + 14));
      for (let i = 0; i < sparkCount; i++) {
        const speed = Math.random() * 6 + 2;
        const angle = Math.random() * Math.PI * 2;
        particles.push({
          x: contactX,
          y: contactY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.8,
          color: Math.random() < 0.33 ? '#ffffff' : Math.random() < 0.66 ? '#38bdf8' : '#ef4444',
          size: Math.random() * 3 + 1.5,
          type: 'spark',
        });
      }

      // 4. INERTIA, MOMENTUM & LOSS OF BALANCE PHYSICS
      // (a) Linear impulse exchange (Coefficient of restitution = 0.82)
      const restitution = 0.82;
      const v1n = p1.vel.x * nx + p1.vel.y * ny;
      const v2n = p2.vel.x * nx + p2.vel.y * ny;

      // Impulse scalar for equal masses
      const impulse = (-(1 + restitution) * (v1n - v2n)) / 2;

      p1.vel.x += impulse * nx;
      p1.vel.y += impulse * ny;
      p2.vel.x -= impulse * nx;
      p2.vel.y -= impulse * ny;

      // (b) Tangential Friction & Swiping Torque (Causes sudden spin-out)
      const tx = -ny;
      const ty = nx;
      const relTanSpeed = relVx * tx + relVy * ty;

      // Off-center rotational impulse (Torque = r x F)
      // Car 1 heading relative to normal
      const torque1 = (fwd1X * ny - fwd1Y * nx) * effectiveImpactSpeed * 0.08 + relTanSpeed * 0.06;

      // Car 2 heading relative to normal
      const torque2 = (-fwd2X * ny + fwd2Y * nx) * effectiveImpactSpeed * 0.08 - relTanSpeed * 0.06;

      p1.angularVel += torque1;
      p2.angularVel += torque2;

      // (c) Loss of Balance State Initiation
      // High speed crashes cause loss of balance / spin-out
      const balanceLossDuration = Math.min(70, Math.round(effectiveImpactSpeed * 3.2 + 15));
      p1.unbalancedTimer = balanceLossDuration;
      p2.unbalancedTimer = balanceLossDuration;

      // Chassis wobble roll
      p1.wobbleVel = (Math.random() - 0.5) * effectiveImpactSpeed * 0.35;
      p2.wobbleVel = (Math.random() - 0.5) * effectiveImpactSpeed * 0.35;

      addScreenShake(Math.min(22, effectiveImpactSpeed * 1.5));
    }

    // Set touching flag to true so continuous contact does NOT drain extra health
    p1.touchingCar = true;
    p2.touchingCar = true;
  } else {
    // Separation! Reset touching flag so next collision triggers a new discrete impact
    p1.touchingCar = false;
    p2.touchingCar = false;
  }
}
