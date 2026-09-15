import { Player, Particle, SkidMark, DamagePopup, GearConfig, Vector } from './types';

export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 800;
export const CAR_RADIUS = 30;
export const INITIAL_HEALTH = 100;

/**
 * Display speed multiplier: Keeps dashboard speedometer numbers authentic (0-18 km/h scale)
 * while physical velocity is calibrated to user requirements (13s to cross arena in G1).
 */
export const DISPLAY_SPEED_MULTIPLIER = 3.02;

export const GEAR_CONFIG: GearConfig[] = [
  // G1: 1200px / (13 sec * 60 fps) = 1.5385 px/frame (takes exactly 13s full throttle across arena)
  { gear: 1, maxSpeed: 1.5385, accel: 0.055, minLaunchSpeed: 0.0, label: '1ST' },
  // G2: Controlled cruising speed (~7.4s across)
  { gear: 2, maxSpeed: 2.70,   accel: 0.046, minLaunchSpeed: 0.5, label: '2ND' },
  // G3: Ideal combat maneuver & ramming speed (~5.1s across)
  { gear: 3, maxSpeed: 3.90,   accel: 0.038, minLaunchSpeed: 1.2, label: '3RD' },
  // G4: Top speed that the eye can track and control (~3.8s across)
  { gear: 4, maxSpeed: 5.30,   accel: 0.030, minLaunchSpeed: 2.0, label: '4TH' },
];

/**
 * Updates car driving physics, steering, traction, and tire skidmarks
 */
export function updateCarDriving(
  p: Player,
  particles: Particle[],
  skidMarks: SkidMark[]
) {
  const currentSpeed = Math.hypot(p.vel.x, p.vel.y);
  const gearCfg = GEAR_CONFIG[p.gear - 1];

  // 1. Heading vectors
  const forwardX = Math.cos(p.angle);
  const forwardY = Math.sin(p.angle);
  const rightX = -forwardY;
  const rightY = forwardX;

  // 2. Decompose velocity into forward (longitudinal) and sideways (lateral) components
  let vForward = p.vel.x * forwardX + p.vel.y * forwardY;
  let vLateral = p.vel.x * rightX + p.vel.y * rightY;

  // 3. Stalling Mechanics (Manual Transmission)
  if (currentSpeed < 0.6) {
    // At standstill, only Gear 1 can launch
    p.stalled = p.gear !== 1;
  } else {
    // While rolling, engine bogs down if speed drops below min launch speed for current gear
    p.stalled = currentSpeed < gearCfg.minLaunchSpeed;
  }

  // 4. Throttle & Acceleration Physics
  let effectiveAccel = gearCfg.accel;
  if (p.stalled) {
    if (currentSpeed < 0.6) {
      effectiveAccel = 0;
      // Stutter stall smoke puff
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
      // Bogged down in higher gear: gentle acceleration so driver can recover speed
      effectiveAccel = gearCfg.accel * 0.55;
    }
  }

  // Active Braking / Handbrake
  if (p.braking) {
    // Strong brake deceleration
    vForward *= 0.82;
    vLateral *= 0.72;
    if (Math.abs(vForward) < 0.08) vForward = 0;
    if (Math.abs(vLateral) < 0.08) vLateral = 0;

    // Brake sparks at wheels
    if (currentSpeed > 2.0 && Math.random() < 0.35) {
      particles.push({
        x: p.pos.x - forwardX * (p.radius * 0.6) + (Math.random() - 0.5) * 10,
        y: p.pos.y - forwardY * (p.radius * 0.6) + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 0.4,
        color: '#ef4444',
        size: Math.random() * 2 + 1,
        type: 'spark',
      });
    }
  } else if (Math.abs(p.throttle) > 0.05) {
    // Forward / Reverse acceleration
    if (p.throttle > 0) {
      // Forward drive
      if (vForward < gearCfg.maxSpeed) {
        vForward += p.throttle * effectiveAccel;
      }
    } else {
      // Reverse drive (max ~3.2 km/h in 1st gear)
      const maxRevSpeed = -3.2;
      if (vForward > maxRevSpeed && p.gear === 1) {
        vForward += p.throttle * (effectiveAccel * 0.65);
      }
    }
  } else {
    // Coasting rolling resistance: very slow deceleration to allow smooth gear shifting
    // Car retains its forward momentum so speed does not plummet while reaching for the shift key
    vForward *= 0.993;
    if (Math.abs(vForward) < 0.03) vForward = 0;
  }

  // Rev Limiter check
  if (vForward >= gearCfg.maxSpeed) {
    p.revLimiting = true;
    vForward = gearCfg.maxSpeed;
  } else {
    p.revLimiting = false;
  }

  // 5. Steering & Car Turning Dynamics
  // Steer angle smoothly targets input (-0.45 to +0.45 rad, ~26 degrees)
  const targetSteer = p.steering * 0.45;
  p.steerAngle += (targetSteer - p.steerAngle) * 0.25;

  // Turning rate is speed-dependent (cars turn while rolling, reversing reverses turning)
  const speedFactor = Math.min(1.0, Math.abs(vForward) / 2.5);
  const turnDirection = vForward >= 0 ? 1 : -1;
  const baseTurnSpeed = p.steerAngle * 0.075 * speedFactor * turnDirection;

  // 6. Inertia, Unbalanced State & Angular Velocity
  const isUnbalanced = p.unbalancedTimer > 0;
  if (isUnbalanced) {
    p.unbalancedTimer--;
    // High spin rate during loss of balance!
    p.angle += p.angularVel;
    p.angularVel *= 0.93; // Angular friction gradually restores control
  } else {
    p.angle += baseTurnSpeed + p.angularVel;
    p.angularVel *= 0.82; // Fast damping when tires have grip
  }

  // Body roll / suspension wobble oscillation
  p.wobbleAngle += p.wobbleVel;
  p.wobbleVel -= p.wobbleAngle * 0.22; // Spring return
  p.wobbleVel *= 0.84; // Damping

  // 7. Lateral Tire Grip vs. Drifting / Skidding
  // During normal driving, tires grip strongly (vLateral quickly dampened).
  // When braking, turning hard at speed, or unbalanced, grip is broken (car slides!).
  const lateralGrip = isUnbalanced ? 0.45 : p.braking ? 0.65 : 0.88;
  vLateral *= lateralGrip;
  if (Math.abs(vLateral) < 0.04) vLateral = 0;

  // Detect tire skidding
  p.skidding = Math.abs(vLateral) > 0.8 || (p.braking && currentSpeed > 1.8) || isUnbalanced;

  // 8. Reconstruct world velocity vector from forward & lateral components
  p.vel.x = vForward * forwardX + vLateral * rightX;
  p.vel.y = vForward * forwardY + vLateral * rightY;

  // 9. Update position
  p.pos.x += p.vel.x;
  p.pos.y += p.vel.y;

  // 10. Tire Skid Marks Generation
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
      // Guard against any discontinuity across coordinates
      const stepDist = Math.hypot(curTireLeft.x - p.lastTireLeft.x, curTireLeft.y - p.lastTireLeft.y);
      if (stepDist < 60) {
        const markAlpha = Math.min(0.65, (Math.abs(vLateral) + (p.braking ? 1 : 0)) * 0.35);
        skidMarks.push({
          x1: p.lastTireLeft.x,
          y1: p.lastTireLeft.y,
          x2: curTireLeft.x,
          y2: curTireLeft.y,
          alpha: markAlpha,
          width: 6,
        });
        skidMarks.push({
          x1: p.lastTireRight.x,
          y1: p.lastTireRight.y,
          x2: curTireRight.x,
          y2: curTireRight.y,
          alpha: markAlpha,
          width: 6,
        });
      }
    }

    // Tire smoke particles
    if (Math.random() < 0.45) {
      particles.push({
        x: curTireLeft.x + (Math.random() - 0.5) * 4,
        y: curTireLeft.y + (Math.random() - 0.5) * 4,
        vx: -p.vel.x * 0.2 + (Math.random() - 0.5) * 1.5,
        vy: -p.vel.y * 0.2 + (Math.random() - 0.5) * 1.5,
        life: 0.5,
        color: '#cbd5e1',
        size: Math.random() * 4 + 3,
        type: 'tireSmoke',
      });
    }
  }

  p.lastTireLeft = curTireLeft;
  p.lastTireRight = curTireRight;

  // 11. Engine RPM Calculation
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
      // Damage sustained by P1 is driven by impact speed + P2's ramming acceleration
      const d1 = Math.round((effectiveImpactSpeed * 4.4 + a2IntoCrash * 140.0) * 10) / 10;
      // Damage sustained by P2 is driven by impact speed + P1's ramming acceleration
      const d2 = Math.round((effectiveImpactSpeed * 4.4 + a1IntoCrash * 140.0) * 10) / 10;

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
      const torque1 = (fwd1X * ny - fwd1Y * nx) * effectiveImpactSpeed * 0.18 + relTanSpeed * 0.12;

      // Car 2 heading relative to normal
      const torque2 = (-fwd2X * ny + fwd2Y * nx) * effectiveImpactSpeed * 0.18 - relTanSpeed * 0.12;

      p1.angularVel += torque1;
      p2.angularVel += torque2;

      // (c) Loss of Balance State Initiation
      // High speed crashes cause longer loss of balance / spin-out
      const balanceLossDuration = Math.min(90, Math.round(effectiveImpactSpeed * 12 + 20));
      p1.unbalancedTimer = balanceLossDuration;
      p2.unbalancedTimer = balanceLossDuration;

      // Chassis wobble roll
      p1.wobbleVel = (Math.random() - 0.5) * effectiveImpactSpeed * 0.5;
      p2.wobbleVel = (Math.random() - 0.5) * effectiveImpactSpeed * 0.5;

      addScreenShake(Math.min(22, effectiveImpactSpeed * 3.5));
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
