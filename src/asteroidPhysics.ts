import { Asteroid, AsteroidCrater, DamagePopup, Particle, Player, Vector } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, CAR_RADIUS } from './carPhysics';

// Asteroid 5 size tiers:
// Max size strictly <= 105% of car size (CAR_RADIUS = 30 -> max 31.5px)
export const ASTEROID_SIZE_TIERS = [
  { tier: 1, baseRadius: 13, mass: 0.45, label: 'Micro-Meteorite' },
  { tier: 2, baseRadius: 17, mass: 0.75, label: 'Small Asteroid' },
  { tier: 3, baseRadius: 21, mass: 1.15, label: 'Medium Asteroid' },
  { tier: 4, baseRadius: 26, mass: 1.65, label: 'Heavy Asteroid' },
  { tier: 5, baseRadius: 30.5, mass: 2.25, label: 'Mega Asteroid' }, // ~101.6% of car size
];

/**
 * Spawns an initial field of asteroids distributed across the arena,
 * keeping clear of player starting spawn positions.
 */
export function spawnAsteroids(count = 7, avoidPositions: Vector[] = []): Asteroid[] {
  const asteroids: Asteroid[] = [];
  const minClearanceFromPlayers = 200;

  for (let i = 0; i < count; i++) {
    // Pick random size tier (1 to 5)
    const tierIndex = Math.floor(Math.random() * ASTEROID_SIZE_TIERS.length);
    const tierConfig = ASTEROID_SIZE_TIERS[tierIndex];
    const radius = Math.min(31.2, tierConfig.baseRadius + (Math.random() - 0.5) * 1.8);

    // Find a spawn position away from borders and player spawn points
    let posX = 0;
    let posY = 0;
    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 60) {
      attempts++;
      posX = radius + 60 + Math.random() * (CANVAS_WIDTH - radius * 2 - 120);
      posY = radius + 60 + Math.random() * (CANVAS_HEIGHT - radius * 2 - 120);

      // Check distance from player starting points
      let tooClose = false;
      for (const avoid of avoidPositions) {
        if (Math.hypot(posX - avoid.x, posY - avoid.y) < minClearanceFromPlayers) {
          tooClose = true;
          break;
        }
      }

      // Check distance from already spawned asteroids
      if (!tooClose) {
        for (const ast of asteroids) {
          if (Math.hypot(posX - ast.pos.x, posY - ast.pos.y) < radius + ast.radius + 40) {
            tooClose = true;
            break;
          }
        }
      }

      if (!tooClose) valid = true;
    }

    // Random floating speed (0.4 to 1.6 px/frame) and direction
    const speed = 0.45 + Math.random() * 1.15;
    const moveAngle = Math.random() * Math.PI * 2;
    const velX = Math.cos(moveAngle) * speed;
    const velY = Math.sin(moveAngle) * speed;

    // Deterministic jagged polygonal shape profile (11 to 14 vertices)
    const vertexCount = 11 + Math.floor(Math.random() * 4);
    const shapeOffsets: number[] = [];
    for (let v = 0; v < vertexCount; v++) {
      // Offset between 0.82 and 1.18 of nominal radius
      shapeOffsets.push(0.84 + Math.random() * 0.32);
    }

    // Procedural crater depressions
    const craterCount = 2 + Math.floor(Math.random() * 3);
    const craters: AsteroidCrater[] = [];
    for (let c = 0; c < craterCount; c++) {
      const crAngle = Math.random() * Math.PI * 2;
      const crDist = Math.random() * (radius * 0.55);
      const crRadius = Math.max(2.8, (radius * (0.16 + Math.random() * 0.18)));
      craters.push({
        x: Math.cos(crAngle) * crDist,
        y: Math.sin(crAngle) * crDist,
        r: crRadius,
        depth: 0.5 + Math.random() * 0.5,
      });
    }

    asteroids.push({
      id: i + 1,
      pos: { x: posX, y: posY },
      vel: { x: velX, y: velY },
      radius,
      sizeTier: tierConfig.tier,
      mass: tierConfig.mass,
      angle: Math.random() * Math.PI * 2,
      spinSpeed: (Math.random() - 0.5) * 0.018,
      shapeOffsets,
      craters,
      mineralHue: Math.floor(Math.random() * 3), // 0: cool basalt, 1: warm chondrite, 2: dark obsidian
      touchingCars: {},
    });
  }

  return asteroids;
}

/**
 * Updates Asteroid movement, rotation, arena border bounces,
 * and asteroid-to-asteroid elastic collisions.
 *
 * CRITICAL RULE: The portal loop does NOT work for asteroids!
 * They bounce physically off the arena borders (left, right, top, bottom).
 */
export function updateAsteroids(
  asteroids: Asteroid[],
  particles: Particle[]
) {
  for (let i = 0; i < asteroids.length; i++) {
    const ast = asteroids[i];

    // 1. Float translation and slow tumbling spin
    ast.pos.x += ast.vel.x;
    ast.pos.y += ast.vel.y;
    ast.angle += ast.spinSpeed;

    // 2. Arena Border Bouncing (Portal loops DO NOT WORK for asteroids!)
    const restitution = 0.92;
    let bounced = false;
    let hitX = ast.pos.x;
    let hitY = ast.pos.y;

    // Left Border
    if (ast.pos.x - ast.radius <= 0) {
      ast.pos.x = ast.radius;
      ast.vel.x = Math.abs(ast.vel.x) * restitution;
      hitX = 0;
      hitY = ast.pos.y;
      bounced = true;
    }
    // Right Border
    else if (ast.pos.x + ast.radius >= CANVAS_WIDTH) {
      ast.pos.x = CANVAS_WIDTH - ast.radius;
      ast.vel.x = -Math.abs(ast.vel.x) * restitution;
      hitX = CANVAS_WIDTH;
      hitY = ast.pos.y;
      bounced = true;
    }

    // Top Border
    if (ast.pos.y - ast.radius <= 0) {
      ast.pos.y = ast.radius;
      ast.vel.y = Math.abs(ast.vel.y) * restitution;
      hitX = ast.pos.x;
      hitY = 0;
      bounced = true;
    }
    // Bottom Border
    else if (ast.pos.y + ast.radius >= CANVAS_HEIGHT) {
      ast.pos.y = CANVAS_HEIGHT - ast.radius;
      ast.vel.y = -Math.abs(ast.vel.y) * restitution;
      hitX = ast.pos.x;
      hitY = CANVAS_HEIGHT;
      bounced = true;
    }

    // Border bounce spark / mineral dust
    if (bounced && Math.hypot(ast.vel.x, ast.vel.y) > 0.6) {
      for (let s = 0; s < 4; s++) {
        particles.push({
          x: hitX,
          y: hitY,
          vx: (Math.random() - 0.5) * 2 - ast.vel.x * 0.2,
          vy: (Math.random() - 0.5) * 2 - ast.vel.y * 0.2,
          life: 0.4,
          color: '#94a3b8',
          size: Math.random() * 2 + 1,
          type: 'debris',
        });
      }
    }
  }

  // 3. Asteroid-to-Asteroid Elastic Collisions
  for (let i = 0; i < asteroids.length; i++) {
    for (let j = i + 1; j < asteroids.length; j++) {
      const a1 = asteroids[i];
      const a2 = asteroids[j];

      const dx = a2.pos.x - a1.pos.x;
      const dy = a2.pos.y - a1.pos.y;
      const dist = Math.hypot(dx, dy);
      const minDist = a1.radius + a2.radius;

      if (dist < minDist && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;

        // Separate overlapping asteroids based on masses
        const overlap = minDist - dist;
        const totalMass = a1.mass + a2.mass;
        const r1 = a2.mass / totalMass;
        const r2 = a1.mass / totalMass;

        a1.pos.x -= nx * overlap * r1;
        a1.pos.y -= ny * overlap * r1;
        a2.pos.x += nx * overlap * r2;
        a2.pos.y += ny * overlap * r2;

        // Relative velocity along normal
        const relVx = a1.vel.x - a2.vel.x;
        const relVy = a1.vel.y - a2.vel.y;
        const impactSpeed = relVx * nx + relVy * ny;

        if (impactSpeed > 0) {
          const restitution = 0.88;
          const impulse = ((1 + restitution) * impactSpeed) / (1 / a1.mass + 1 / a2.mass);

          a1.vel.x -= (impulse / a1.mass) * nx;
          a1.vel.y -= (impulse / a1.mass) * ny;
          a2.vel.x += (impulse / a2.mass) * nx;
          a2.vel.y += (impulse / a2.mass) * ny;

          // Subtle spin exchange
          a1.spinSpeed += (Math.random() - 0.5) * 0.008;
          a2.spinSpeed += (Math.random() - 0.5) * 0.008;

          // Small rock dust puffs on asteroid collision
          if (impactSpeed > 0.8) {
            const cx = a1.pos.x + nx * a1.radius;
            const cy = a1.pos.y + ny * a1.radius;
            for (let d = 0; d < 3; d++) {
              particles.push({
                x: cx,
                y: cy,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5,
                life: 0.35,
                color: '#64748b',
                size: Math.random() * 2 + 1,
                type: 'debris',
              });
            }
          }
        }
      }
    }
  }
}

/**
 * Handles Car-to-Asteroid Collision with:
 * 1. SINGLE POINT OF IMPACT damage (applied only at initial contact point)
 * 2. Proportional damage based on closing speed, throttle thrust, and asteroid mass
 * 3. Momentum, direction, and inertia exchange causing cars to LOSE BALANCE and SPIN OUT!
 * 4. Asteroid deflected by car collision
 * 5. Severe spark, shrapnel explosion, screen shake, and damage popups
 */
export function handleCarAsteroidCollisions(
  players: Player[],
  asteroids: Asteroid[],
  particles: Particle[],
  popups: DamagePopup[],
  addScreenShake: (amount: number) => void
) {
  for (const p of players) {
    for (const ast of asteroids) {
      let dx = ast.pos.x - p.pos.x;
      let dy = ast.pos.y - p.pos.y;

      const dist = Math.hypot(dx, dy);
      const minDist = p.radius + ast.radius;
      const isColliding = dist < minDist && dist > 0.001;

      if (isColliding) {
        const nx = dx / dist;
        const ny = dy / dist;

        // Relative velocity: Car relative to Asteroid
        const relVx = p.vel.x - ast.vel.x;
        const relVy = p.vel.y - ast.vel.y;

        // Closing speed along collision normal
        const impactSpeed = relVx * nx + relVy * ny;

        // Separate overlapping car and asteroid based on relative mass
        const carMass = 1.0;
        const totalMass = carMass + ast.mass;
        const overlap = minDist - dist;

        p.pos.x -= nx * (overlap * (ast.mass / totalMass));
        p.pos.y -= ny * (overlap * (ast.mass / totalMass));
        ast.pos.x += nx * (overlap * (carMass / totalMass));
        ast.pos.y += ny * (overlap * (carMass / totalMass));

        // Check if this is the initial contact frame (Single Point of Impact!)
        const wasTouching = ast.touchingCars[p.id] ?? false;

        if (!wasTouching) {
          ast.touchingCars[p.id] = true;

          // Contact point in world space
          const contactX = p.pos.x + nx * p.radius;
          const contactY = p.pos.y + ny * p.radius;

          // Forward acceleration of the car
          const fwdX = Math.cos(p.angle);
          const fwdY = Math.sin(p.angle);
          const throttleForce = Math.max(0, p.throttle);
          const aIntoCrash = Math.max(0, (fwdX * nx + fwdY * ny) * throttleForce);

          // Absolute closing intensity
          const effectiveImpactSpeed = Math.max(0.6, Math.abs(impactSpeed));

          // Damage calibrated similarly to car collisions:
          // Based on impact speed, throttle momentum, and asteroid mass tier
          const rawDamage = (effectiveImpactSpeed * 2.2 + aIntoCrash * 38.0) * (0.85 + ast.mass * 0.28);
          const damage = Math.min(36, Math.max(5, Math.round(rawDamage * 10) / 10));

          p.health = Math.max(0, p.health - damage);

          // Damage Popup at collision site
          popups.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            x: contactX,
            y: contactY - 25,
            text: `-${damage} HP`,
            subtext: `💥 ${ast.radius > 25 ? 'MEGA' : 'ROCK'} IMPACT`,
            color: '#f59e0b',
            life: 1.1,
            vy: -1.4,
          });

          // Severe Spark & Asteroid Rock Shrapnel Explosion
          const particleCount = Math.min(40, Math.round(effectiveImpactSpeed * 7 + 14));
          for (let k = 0; k < particleCount; k++) {
            const speed = Math.random() * 5.5 + 1.8;
            const angle = Math.random() * Math.PI * 2;
            const isSparks = Math.random() < 0.55;

            particles.push({
              x: contactX,
              y: contactY,
              vx: Math.cos(angle) * speed - nx * 1.5,
              vy: Math.sin(angle) * speed - ny * 1.5,
              life: isSparks ? 0.75 : 0.95,
              color: isSparks
                ? (Math.random() < 0.5 ? '#ffffff' : p.color)
                : (Math.random() < 0.4 ? '#64748b' : Math.random() < 0.7 ? '#475569' : '#94a3b8'),
              size: isSparks ? Math.random() * 2.5 + 1.2 : Math.random() * 3.8 + 2.0,
              type: isSparks ? 'spark' : 'debris',
            });
          }

          // Linear Impulse Exchange (Coefficient of restitution = 0.80)
          const restitution = 0.80;
          const impulse = (-(1 + restitution) * impactSpeed) / (1 / carMass + 1 / ast.mass);

          p.vel.x += (impulse / carMass) * nx;
          p.vel.y += (impulse / carMass) * ny;
          ast.vel.x -= (impulse / ast.mass) * nx;
          ast.vel.y -= (impulse / ast.mass) * ny;

          // Tangential Friction & Swiping Torque (Car loses balance and spins out)
          const tx = -ny;
          const ty = nx;
          const relTanSpeed = relVx * tx + relVy * ty;
          const carTorque = (fwdX * ny - fwdY * nx) * effectiveImpactSpeed * 0.09 + relTanSpeed * 0.07;
          p.angularVel += carTorque;

          // Asteroid tumbles from collision
          ast.spinSpeed += (Math.random() - 0.5) * 0.05 + relTanSpeed * 0.01;

          // Loss of Balance State on Car
          const balanceLossDuration = Math.min(65, Math.round(effectiveImpactSpeed * 3.6 + 14));
          p.unbalancedTimer = balanceLossDuration;
          p.wobbleVel = (Math.random() - 0.5) * effectiveImpactSpeed * 0.4;

          // Screen Shake on asteroid impact
          addScreenShake(Math.min(20, effectiveImpactSpeed * 1.6 + ast.mass * 2.5));
        }
      } else {
        // Reset single-point-of-contact state once separated
        if (ast.touchingCars[p.id]) {
          ast.touchingCars[p.id] = false;
        }
      }
    }
  }
}

/**
 * Draws Asteroids with realistic texture:
 * - 3D space celestial directional lighting gradient
 * - Multi-faceted craggy silhouette
 * - Sunlit crater rims and deep crater shadow floors
 * - Stony stippling / surface mineral flecks
 * - Optical cast floor shadow for depth
 */
export function drawAsteroids(
  ctx: CanvasRenderingContext2D,
  asteroids: Asteroid[]
) {
  // Fixed deep-space directional light vector from top-left (angle: -3π/4)
  const lightAngle = -Math.PI * 0.75;
  const lightDirX = Math.cos(lightAngle);
  const lightDirY = Math.sin(lightAngle);

  for (const ast of asteroids) {
    ctx.save();
    ctx.translate(ast.pos.x, ast.pos.y);

    // 1. Realistic Cast Floor Shadow (provides optical depth above asphalt)
    ctx.save();
    ctx.translate(10, 14);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    const vCount = ast.shapeOffsets.length;
    for (let i = 0; i < vCount; i++) {
      const vertAngle = (i / vCount) * Math.PI * 2 + ast.angle;
      const r = ast.radius * ast.shapeOffsets[i];
      const vx = Math.cos(vertAngle) * r;
      const vy = Math.sin(vertAngle) * r;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 2. Build Asteroid Craggy Silhouette Path
    ctx.beginPath();
    for (let i = 0; i < vCount; i++) {
      const vertAngle = (i / vCount) * Math.PI * 2 + ast.angle;
      const r = ast.radius * ast.shapeOffsets[i];
      const vx = Math.cos(vertAngle) * r;
      const vy = Math.sin(vertAngle) * r;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();

    // 3. Celestial 3D Lighting Radial Gradient for Realistic Stone
    const lightOffsetX = lightDirX * (ast.radius * 0.45);
    const lightOffsetY = lightDirY * (ast.radius * 0.45);

    const grad = ctx.createRadialGradient(
      lightOffsetX,
      lightOffsetY,
      ast.radius * 0.12,
      0,
      0,
      ast.radius * 1.15
    );

    if (ast.mineralHue === 0) {
      // Basalt slate (cool grey mineral)
      grad.addColorStop(0, '#cbd5e1');   // Sunlit highlight
      grad.addColorStop(0.35, '#64748b'); // Midtone slate
      grad.addColorStop(0.72, '#334155'); // Deep rock shadow
      grad.addColorStop(1.0, '#0f172a');  // Dark crevice
    } else if (ast.mineralHue === 1) {
      // Iron chondrite (warm mineral stone)
      grad.addColorStop(0, '#d6d3d1');   // Light chondrite
      grad.addColorStop(0.35, '#78716c'); // Warm mineral
      grad.addColorStop(0.72, '#44403c'); // Deep iron stone
      grad.addColorStop(1.0, '#1c1917');  // Chasm shadow
    } else {
      // Obsidian metallic basalt
      grad.addColorStop(0, '#94a3b8');   // Crisp reflection
      grad.addColorStop(0.30, '#475569'); // Charcoal stone
      grad.addColorStop(0.70, '#1e293b'); // Dark basalt
      grad.addColorStop(1.0, '#020617');  // Deep void
    }

    ctx.fillStyle = grad;
    ctx.fill();

    // 4. Clip to Asteroid Silhouette for Internal Texture, Ridges & Craters
    ctx.save();
    ctx.clip();

    // Rotate context to match tumbling orientation for surface features
    ctx.rotate(ast.angle);

    // 4a. Surface Grain & Mineral Flecks
    const grainCount = Math.round(ast.radius * 0.7);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    for (let g = 0; g < grainCount; g++) {
      const gAngle = (g * 137.5) * (Math.PI / 180);
      const gDist = ((g * 19) % Math.round(ast.radius * 0.85));
      const gx = Math.cos(gAngle) * gDist;
      const gy = Math.sin(gAngle) * gDist;
      ctx.fillRect(gx, gy, 1.2, 1.2);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (let g = 0; g < grainCount; g++) {
      const gAngle = (g * 83.1) * (Math.PI / 180);
      const gDist = ((g * 17) % Math.round(ast.radius * 0.85));
      const gx = Math.cos(gAngle) * gDist;
      const gy = Math.sin(gAngle) * gDist;
      ctx.fillRect(gx, gy, 1.4, 1.4);
    }

    // 4b. Procedural Craters with Depth, Dark Interiors & Sunlit Rims
    for (const cr of ast.craters) {
      // Crater Dark Floor
      const craterGrad = ctx.createRadialGradient(
        cr.x - cr.r * 0.3,
        cr.y - cr.r * 0.3,
        cr.r * 0.1,
        cr.x,
        cr.y,
        cr.r
      );
      craterGrad.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
      craterGrad.addColorStop(0.65, 'rgba(30, 41, 59, 0.85)');
      craterGrad.addColorStop(1, 'rgba(51, 65, 85, 0.4)');

      ctx.fillStyle = craterGrad;
      ctx.beginPath();
      ctx.arc(cr.x, cr.y, cr.r, 0, Math.PI * 2);
      ctx.fill();

      // Sunlit Crater Rim Crescent (Calculated relative to asteroid orientation)
      const relLightAngle = lightAngle - ast.angle;
      const rimHighlightX = cr.x + Math.cos(relLightAngle) * (cr.r * 0.35);
      const rimHighlightY = cr.y + Math.sin(relLightAngle) * (cr.r * 0.35);

      ctx.strokeStyle = 'rgba(241, 245, 249, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(
        rimHighlightX,
        rimHighlightY,
        cr.r * 0.9,
        relLightAngle - Math.PI * 0.45,
        relLightAngle + Math.PI * 0.45
      );
      ctx.stroke();

      // Shadowed Rim on opposite side
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.65)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(
        cr.x,
        cr.y,
        cr.r * 0.9,
        relLightAngle + Math.PI * 0.55,
        relLightAngle + Math.PI * 1.45
      );
      ctx.stroke();
    }

    ctx.restore(); // Exit clip

    // 5. Outer Rock Contour Stroke & Sunlit Rim Line
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.restore();
  }
}
