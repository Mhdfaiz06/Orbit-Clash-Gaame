import { Player, DamagePopup, SkidMark } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, DISPLAY_SPEED_MULTIPLIER } from '../carPhysics';

/**
 * Renders the top-view ball-car at specified coordinates
 */
function renderCarAt(
  ctx: CanvasRenderingContext2D,
  p: Player,
  maxTopSpeed: number,
  posX: number,
  posY: number
) {
  const speed = Math.hypot(p.vel.x, p.vel.y);
  const healthPercent = Math.max(0, p.health) / 100;
  const isP1 = p.id === 1;

  ctx.save();
  ctx.translate(posX, posY);

  // Apply heading angle plus dynamic chassis wobble/tilt from loss of balance
  const totalAngle = p.angle + p.wobbleAngle;
  ctx.rotate(totalAngle);

  // 1. Headlights Beam Projections onto Arena Surface
  ctx.save();
  const headlightBeamLength = 110 + speed * 4;
  const headlightSpread = 32;

  // Left & Right headlight beams
  [-11, 11].forEach(offsetY => {
    const beamGrad = ctx.createRadialGradient(
      22, offsetY, 4,
      headlightBeamLength * 0.7, offsetY, headlightSpread * 1.5
    );
    beamGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    beamGrad.addColorStop(0.25, isP1 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(248, 113, 113, 0.25)');
    beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(22, offsetY);
    ctx.lineTo(22 + headlightBeamLength, offsetY - headlightSpread);
    ctx.lineTo(22 + headlightBeamLength, offsetY + headlightSpread);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();

  // 2. Underglow & Ground Shadow
  ctx.save();
  ctx.shadowColor = p.color;
  ctx.shadowBlur = p.unbalancedTimer > 0 ? 25 : 16;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.ellipse(0, 2, p.radius * 1.05, p.radius * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 3. Four Wheels / Tires
  // Front Tires (Steerable with physical steerAngle)
  const frontTireDistX = 16;
  const frontTireDistY = 19;
  const rearTireDistX = -15;
  const rearTireDistY = 21;

  // Draw Front Left & Front Right Tires (Turned by steerAngle)
  [-frontTireDistY, frontTireDistY].forEach(yPos => {
    ctx.save();
    ctx.translate(frontTireDistX, yPos);
    ctx.rotate(p.steerAngle);

    // Tire tread
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-7, -4, 15, 8, 3);
    ctx.fill();
    ctx.stroke();

    // Wheel Rim
    ctx.fillStyle = isP1 ? '#38bdf8' : '#f87171';
    ctx.fillRect(-3, -2, 6, 4);

    // Glowing Brake Caliper when braking
    if (p.braking) {
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 8;
      ctx.fillRect(-2, -3.5, 4, 2);
    }
    ctx.restore();
  });

  // Draw Rear Left & Rear Right Tires (Fixed drive wheels)
  [-rearTireDistY, rearTireDistY].forEach(yPos => {
    ctx.save();
    ctx.translate(rearTireDistX, yPos);

    // Wide rear drag tread
    ctx.fillStyle = '#090d16';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-8, -4.5, 17, 9, 3.5);
    ctx.fill();
    ctx.stroke();

    // Wheel Rim
    ctx.fillStyle = isP1 ? '#0284c7' : '#dc2626';
    ctx.fillRect(-3.5, -2, 7, 4);

    if (p.braking) {
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 8;
      ctx.fillRect(-2, -4, 4, 2);
    }
    ctx.restore();
  });

  // 4. Exhaust Jets & Combustion Flames (At twin rear manifolds)
  if (speed > 0.4 && p.throttle > 0.1) {
    const flameRatio = Math.min(1.2, speed / maxTopSpeed);
    const flameLen = flameRatio * 28 + (Math.random() * 8);

    [-8, 8].forEach(exhaustY => {
      ctx.save();
      const grad = ctx.createLinearGradient(rearTireDistX - 8, exhaustY, rearTireDistX - 8 - flameLen, exhaustY);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, isP1 ? '#38bdf8' : '#fb923c');
      grad.addColorStop(0.8, isP1 ? '#2563eb' : '#ef4444');
      grad.addColorStop(1, 'transparent');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(rearTireDistX - 6, exhaustY - 3);
      ctx.lineTo(rearTireDistX - 6 - flameLen, exhaustY);
      ctx.lineTo(rearTireDistX - 6, exhaustY + 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }

  // 5. Main Ball-Car Body Chassis
  // Aerodynamic hybrid: spherical armored pod with sculpted front splitter and flared rear fenders

  // Outer Chassis Gradient
  const bodyGrad = ctx.createRadialGradient(4, -4, 3, 0, 0, p.radius);
  if (isP1) {
    bodyGrad.addColorStop(0, '#60a5fa');
    bodyGrad.addColorStop(0.4, '#2563eb');
    bodyGrad.addColorStop(0.85, '#1e3a8a');
    bodyGrad.addColorStop(1, '#0f172a');
  } else {
    bodyGrad.addColorStop(0, '#f87171');
    bodyGrad.addColorStop(0.4, '#dc2626');
    bodyGrad.addColorStop(0.85, '#991b1b');
    bodyGrad.addColorStop(1, '#0f172a');
  }

  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = isP1 ? '#93c5fd' : '#fca5a5';
  ctx.lineWidth = 1.8;

  // Draw sculpted race orb car chassis
  ctx.beginPath();
  // Front nose splitter
  ctx.moveTo(p.radius + 4, 0);
  ctx.bezierCurveTo(p.radius + 3, 12, frontTireDistX, frontTireDistY - 1, 6, frontTireDistY + 1);
  // Right side & rear fender
  ctx.bezierCurveTo(-6, frontTireDistY + 3, rearTireDistX + 2, rearTireDistY + 1, rearTireDistX - 4, rearTireDistY - 2);
  // Rear bumper & diffuser
  ctx.bezierCurveTo(rearTireDistX - 10, 10, rearTireDistX - 10, -10, rearTireDistX - 4, -rearTireDistY + 2);
  // Left side & rear fender
  ctx.bezierCurveTo(rearTireDistX + 2, -rearTireDistY - 1, -6, -frontTireDistY - 3, 6, -frontTireDistY - 1);
  // Front left quarter
  ctx.bezierCurveTo(frontTireDistX, -frontTireDistY + 1, p.radius + 3, -12, p.radius + 4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 6. Combat Armor Panels & Front Splitter Wing
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(p.radius + 6, -10);
  ctx.lineTo(p.radius + 7, 0);
  ctx.lineTo(p.radius + 6, 10);
  ctx.lineTo(p.radius - 2, 8);
  ctx.lineTo(p.radius, 0);
  ctx.lineTo(p.radius - 2, -8);
  ctx.closePath();
  ctx.fill();

  // Racing Center Livery Stripe
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(p.radius + 2, -2.5);
  ctx.lineTo(p.radius + 2, 2.5);
  ctx.lineTo(-p.radius + 6, 2.5);
  ctx.lineTo(-p.radius + 6, -2.5);
  ctx.closePath();
  ctx.fill();

  // 7. Cockpit Dome / Tinted Teardrop Canopy
  const canopyGrad = ctx.createLinearGradient(-10, -10, 12, 10);
  canopyGrad.addColorStop(0, '#1e293b');
  canopyGrad.addColorStop(0.5, '#0f172a');
  canopyGrad.addColorStop(1, '#020617');

  ctx.fillStyle = canopyGrad;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(2, 0, 15, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Pilot Helmet / Interior Roll-bar
  ctx.fillStyle = isP1 ? '#38bdf8' : '#fbbf24';
  ctx.beginPath();
  ctx.arc(-1, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Canopy Glass Glare/Specular Highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(5, -3, 6, 2.5, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // 8. Rear Carbon-Fiber Racing Spoiler / Wing
  ctx.fillStyle = '#090d16';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rearTireDistX - 8, -19, 5.5, 38, 2);
  ctx.fill();
  ctx.stroke();

  // Spoiler Endplates
  ctx.fillStyle = p.color;
  ctx.fillRect(rearTireDistX - 9, -20.5, 7, 3);
  ctx.fillRect(rearTireDistX - 9, 17.5, 7, 3);

  // 9. Taillights (Bright Red LEDs / Brake Lights)
  ctx.fillStyle = p.braking ? '#ff1e1e' : '#991b1b';
  if (p.braking) {
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
  }
  ctx.fillRect(rearTireDistX - 5, -12, 2.5, 5);
  ctx.fillRect(rearTireDistX - 5, 7, 2.5, 5);

  // 10. Front Headlight Lenses
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(p.radius - 2, -10, 2.5, 0, Math.PI * 2);
  ctx.arc(p.radius - 2, 10, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // 11. Battle Damage Scratches & Dents
  if (healthPercent < 0.75) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4, -8);
    ctx.lineTo(6, -4);
    ctx.lineTo(12, -7);
    ctx.stroke();
  }
  if (healthPercent < 0.45) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-8, 6);
    ctx.lineTo(2, 9);
    ctx.lineTo(8, 5);
    ctx.stroke();
  }

  ctx.restore(); // Restore car rotation & position

  // 12. Floating Overhead Status HUD (Drawn in world orientation, not rotated)
  ctx.save();
  const hudY = posY - p.radius - 18;

  // Unbalanced / Loss of Balance / Spin-out warning badge
  if (p.unbalancedTimer > 0) {
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f97316';
    ctx.shadowColor = '#ea580c';
    ctx.shadowBlur = 10;
    ctx.fillText('⚠ LOSS OF BALANCE (SPIN)', posX, hudY - 12);
  } else if (p.stalled) {
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('⚠ STALL (SHIFT G1)', posX, hudY - 12);
  } else if (p.braking) {
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('🛑 BRAKING', posX, hudY - 12);
  }

  // Gear & Speed Micro Badge (Calibrated to speedometer dial)
  const displaySpeed = speed * DISPLAY_SPEED_MULTIPLIER;
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.shadowBlur = 0;
  ctx.fillText(`G${p.gear} • ${displaySpeed.toFixed(1)} km/h`, posX, hudY);

  ctx.restore();
}

/**
 * Draws the top-view ball-car with seamless edge-loop rendering across toroidal boundaries
 */
export function drawBallCar(ctx: CanvasRenderingContext2D, p: Player, maxTopSpeed: number) {
  // Main car render
  renderCarAt(ctx, p, maxTopSpeed, p.pos.x, p.pos.y);

  // Seamless boundary wrap clones:
  // Using a 250px margin ensures headlights (up to 150px), overhead status HUDs (up to 70px),
  // exhaust flames, and vehicle body smoothly cross the toroidal portal without any pop-in or jitter.
  const MARGIN = 250;
  const wrapLeft = p.pos.x < MARGIN;
  const wrapRight = p.pos.x > CANVAS_WIDTH - MARGIN;
  const wrapTop = p.pos.y < MARGIN;
  const wrapBottom = p.pos.y > CANVAS_HEIGHT - MARGIN;

  if (wrapLeft) renderCarAt(ctx, p, maxTopSpeed, p.pos.x + CANVAS_WIDTH, p.pos.y);
  if (wrapRight) renderCarAt(ctx, p, maxTopSpeed, p.pos.x - CANVAS_WIDTH, p.pos.y);
  if (wrapTop) renderCarAt(ctx, p, maxTopSpeed, p.pos.x, p.pos.y + CANVAS_HEIGHT);
  if (wrapBottom) renderCarAt(ctx, p, maxTopSpeed, p.pos.x, p.pos.y - CANVAS_HEIGHT);

  // Corner wrap clones
  if (wrapLeft && wrapTop) renderCarAt(ctx, p, maxTopSpeed, p.pos.x + CANVAS_WIDTH, p.pos.y + CANVAS_HEIGHT);
  if (wrapLeft && wrapBottom) renderCarAt(ctx, p, maxTopSpeed, p.pos.x + CANVAS_WIDTH, p.pos.y - CANVAS_HEIGHT);
  if (wrapRight && wrapTop) renderCarAt(ctx, p, maxTopSpeed, p.pos.x - CANVAS_WIDTH, p.pos.y + CANVAS_HEIGHT);
  if (wrapRight && wrapBottom) renderCarAt(ctx, p, maxTopSpeed, p.pos.x - CANVAS_WIDTH, p.pos.y - CANVAS_HEIGHT);
}

/**
 * Draws floating damage indicators at the single point of impact
 */
export function drawDamagePopups(ctx: CanvasRenderingContext2D, popups: DamagePopup[]) {
  ctx.save();
  popups.forEach(p => {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.font = 'black 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.fillText(p.text, p.x, p.y);

    if (p.subtext) {
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(p.subtext, p.x, p.y + 13);
    }
  });
  ctx.restore();
}

/**
 * Draws tire skid marks left on the arena asphalt with seamless edge wrapping
 */
export function drawSkidMarks(ctx: CanvasRenderingContext2D, marks: SkidMark[]) {
  ctx.save();
  ctx.lineCap = 'round';
  marks.forEach(m => {
    ctx.strokeStyle = `rgba(15, 23, 42, ${m.alpha * 0.75})`;
    ctx.lineWidth = m.width;
    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.stroke();

    // Mirror skid mark segments that cross or touch edges so lines don't get abruptly clipped
    const minX = Math.min(m.x1, m.x2);
    const maxX = Math.max(m.x1, m.x2);
    const minY = Math.min(m.y1, m.y2);
    const maxY = Math.max(m.y1, m.y2);

    if (minX < 30) {
      ctx.beginPath();
      ctx.moveTo(m.x1 + CANVAS_WIDTH, m.y1);
      ctx.lineTo(m.x2 + CANVAS_WIDTH, m.y2);
      ctx.stroke();
    } else if (maxX > CANVAS_WIDTH - 30) {
      ctx.beginPath();
      ctx.moveTo(m.x1 - CANVAS_WIDTH, m.y1);
      ctx.lineTo(m.x2 - CANVAS_WIDTH, m.y2);
      ctx.stroke();
    }

    if (minY < 30) {
      ctx.beginPath();
      ctx.moveTo(m.x1, m.y1 + CANVAS_HEIGHT);
      ctx.lineTo(m.x2, m.y2 + CANVAS_HEIGHT);
      ctx.stroke();
    } else if (maxY > CANVAS_HEIGHT - 30) {
      ctx.beginPath();
      ctx.moveTo(m.x1, m.y1 - CANVAS_HEIGHT);
      ctx.lineTo(m.x2, m.y2 - CANVAS_HEIGHT);
      ctx.stroke();
    }
  });
  ctx.restore();
}
