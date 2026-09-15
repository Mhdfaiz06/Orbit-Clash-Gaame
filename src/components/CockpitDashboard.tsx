import React from 'react';
import { ShieldAlert, Zap, AlertTriangle } from 'lucide-react';

export interface TelemetryData {
  speed: number;
  gear: number;
  rpm: number; // 1000 to 8000
  isBraking: boolean;
  isStalled: boolean;
  isRevLimiting: boolean;
  isUnbalanced?: boolean;
  maxSpeedForGear: number;
}

interface CockpitDashboardProps {
  playerNumber: 1 | 2;
  color: string;
  telemetry: TelemetryData;
  onShift: (gear: number) => void;
  onBrakeStart: () => void;
  onBrakeEnd: () => void;
  gearShortcuts: string[];
  brakeShortcut: string;
}

export const CockpitDashboard: React.FC<CockpitDashboardProps> = ({
  playerNumber,
  color,
  telemetry,
  onShift,
  onBrakeStart,
  onBrakeEnd,
  gearShortcuts,
  brakeShortcut,
}) => {
  const { speed, gear, rpm, isBraking, isStalled, isRevLimiting } = telemetry;
  
  // Speedometer calculation calibrated for new reduced top speed (0 to 18 km/h dial)
  const maxDialSpeed = 18;
  const clampedSpeed = Math.min(speed, maxDialSpeed);
  // Dial angle from -135deg (0 speed) to +135deg (max speed) -> 270 deg span
  const startAngle = -135;
  const totalAngle = 270;
  const needleAngle = startAngle + (clampedSpeed / maxDialSpeed) * totalAngle;

  // SVG arc calculations
  const radius = 54;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  // 270 degrees out of 360 = 0.75 of circumference
  const arcLength = circumference * 0.75;
  const progressRatio = Math.min(1, clampedSpeed / maxDialSpeed);
  const strokeDashoffset = arcLength * (1 - progressRatio);

  // RPM percentage for tachometer (1000 to 8000)
  const rpmRatio = Math.max(0, Math.min(1, (rpm - 1000) / 7000));
  const isRedline = rpm >= 6800;

  const isPlayer1 = playerNumber === 1;

  return (
    <div
      id={`cockpit-dashboard-p${playerNumber}`}
      className="flex flex-col gap-2.5 p-3 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md shadow-xl select-none min-w-[260px] max-w-[320px] transition-all"
      style={{
        boxShadow: isBraking
          ? '0 0 25px rgba(239, 68, 68, 0.35)'
          : isRevLimiting
          ? '0 0 25px rgba(234, 179, 8, 0.35)'
          : `0 0 20px ${color}15`,
      }}
    >
      {/* Top Header: Player Tag & Warnings */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full animate-pulse"
            style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
          />
          <span className="text-xs font-mono font-bold tracking-wider uppercase text-white/90">
            P{playerNumber} TELEMETRY
          </span>
        </div>

        {/* Dynamic Status Warning Badge */}
        {telemetry.isUnbalanced ? (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/25 text-orange-300 border border-orange-500/50 animate-bounce flex items-center gap-1">
            <AlertTriangle size={11} /> SPIN-OUT
          </span>
        ) : isBraking ? (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
            BRAKING
          </span>
        ) : isStalled ? (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-bounce">
            <AlertTriangle size={11} /> STALL (USE G1)
          </span>
        ) : isRevLimiting ? (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 animate-pulse">
            SHIFT UP ⬆
          </span>
        ) : (
          <span className="text-[10px] font-mono text-white/40 uppercase">
            GEAR {gear} / 4
          </span>
        )}
      </div>

      {/* Main Gauge Cluster: Speedometer + Tachometer */}
      <div className="flex items-center justify-center gap-3 py-1">
        {/* Analog Speedometer Dial */}
        <div className="relative w-32 h-32 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
            {/* Background Arc */}
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeLinecap="round"
              transform="rotate(135 70 70)"
            />
            {/* Active Colored Arc */}
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform="rotate(135 70 70)"
              className="transition-[stroke-dashoffset] duration-75 ease-out"
              style={{
                filter: `drop-shadow(0 0 6px ${color})`,
              }}
            />
            {/* Dial Tick Marks calibrated to 18 km/h max (3 km/h steps) */}
            {[0, 3, 6, 9, 12, 15, 18].map((tickVal, idx) => {
              const tickAngle = startAngle + (tickVal / maxDialSpeed) * totalAngle;
              const rad = (tickAngle * Math.PI) / 180;
              const x1 = 70 + Math.cos(rad) * 44;
              const y1 = 70 + Math.sin(rad) * 44;
              const x2 = 70 + Math.cos(rad) * 48;
              const y2 = 70 + Math.sin(rad) * 48;
              const isG3Mid = tickVal === 9;
              return (
                <line
                  key={idx}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={tickVal >= 15 ? '#ef4444' : isG3Mid ? '#38bdf8' : 'rgba(255,255,255,0.4)'}
                  strokeWidth={isG3Mid ? '2.5' : '1.5'}
                />
              );
            })}
          </svg>

          {/* Rotating Needle */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-75 ease-out"
            style={{
              transform: `rotate(${needleAngle}deg)`,
            }}
          >
            <div
              className="w-1 h-12 origin-bottom rounded-full"
              style={{
                backgroundColor: isRevLimiting ? '#eab308' : isBraking ? '#ef4444' : '#ffffff',
                boxShadow: `0 0 8px ${isRevLimiting ? '#eab308' : color}`,
                transform: 'translateY(-50%)',
              }}
            />
            <div className="absolute w-3.5 h-3.5 rounded-full bg-neutral-900 border-2 border-white/60 shadow" />
          </div>

          {/* Center Digital Speed & Gear Readout */}
          <div className="absolute flex flex-col items-center justify-center text-center mt-7">
            <span className="text-xl font-black font-mono leading-none tracking-tight text-white drop-shadow">
              {speed.toFixed(1)}
            </span>
            <span className="text-[9px] font-mono uppercase text-white/50 tracking-wider">
              SPD
            </span>
          </div>

          {/* Big Gear Badge in Top Center of dial */}
          <div
            className="absolute top-4 px-2 py-0.5 rounded-full border text-[11px] font-black font-mono"
            style={{
              backgroundColor: `${color}25`,
              borderColor: `${color}60`,
              color: '#ffffff',
            }}
          >
            G{gear}
          </div>
        </div>

        {/* Tachometer / RPM & Controls Column */}
        <div className="flex-1 flex flex-col justify-between h-28 gap-2">
          {/* RPM Tachometer Bar */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-white/50">TACHOMETER</span>
              <span
                className={`font-bold ${
                  isRedline ? 'text-red-400 animate-pulse' : 'text-white/80'
                }`}
              >
                {Math.round(rpm)} RPM
              </span>
            </div>
            {/* RPM Segmented Bar */}
            <div className="h-3 w-full bg-white/10 rounded-md p-0.5 flex overflow-hidden border border-white/10">
              <div
                className={`h-full rounded-sm transition-[width] duration-75 ${
                  isRedline
                    ? 'bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 shadow-[0_0_10px_#ef4444]'
                    : 'bg-gradient-to-r from-emerald-500 via-blue-500 to-cyan-400'
                }`}
                style={{ width: `${rpmRatio * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[8px] font-mono text-white/30 px-0.5">
              <span>1K</span>
              <span>4K</span>
              <span className="text-red-400/80">REDLINE 8K</span>
            </div>
          </div>

          {/* Handbrake Button */}
          <button
            id={`p${playerNumber}-brake-btn`}
            type="button"
            onPointerDown={onBrakeStart}
            onPointerUp={onBrakeEnd}
            onPointerLeave={onBrakeEnd}
            className={`w-full py-1.5 px-3 rounded-lg border text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 ${
              isBraking
                ? 'bg-red-600 border-red-400 text-white shadow-[0_0_16px_rgba(239,68,68,0.8)]'
                : 'bg-white/5 hover:bg-white/10 border-white/15 text-white/80'
            }`}
          >
            <ShieldAlert size={14} className={isBraking ? 'animate-bounce' : ''} />
            <span>BRAKE</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-black/40 text-white/60">
              {brakeShortcut}
            </span>
          </button>
        </div>
      </div>

      {/* Gear Shift Matrix (Gears 1 to 4) */}
      <div className="flex flex-col gap-1 pt-1 border-t border-white/10">
        <div className="flex justify-between items-center text-[10px] font-mono px-0.5">
          <span className="text-white/40 uppercase">MANUAL GEARBOX</span>
          <span className="text-[9px] text-white/50">
            {isPlayer1 ? 'SHIFT + NUMBER' : 'R-SHIFT + NUM'}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map((g) => {
            const isSelected = gear === g;
            return (
              <button
                key={g}
                id={`p${playerNumber}-gear-${g}-btn`}
                type="button"
                onClick={() => onShift(g)}
                className={`py-1.5 px-1 rounded-lg border flex flex-col items-center justify-center transition-all active:scale-95 ${
                  isSelected
                    ? 'font-black shadow-lg scale-[1.02]'
                    : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/10 text-white/60'
                }`}
                style={{
                  backgroundColor: isSelected ? `${color}30` : undefined,
                  borderColor: isSelected ? color : undefined,
                  color: isSelected ? '#ffffff' : undefined,
                  boxShadow: isSelected ? `0 0 12px ${color}60` : undefined,
                }}
              >
                <span className="text-xs font-mono font-bold leading-none">
                  G{g}
                </span>
                <span className="text-[8px] font-mono opacity-60 mt-0.5">
                  {gearShortcuts[g - 1]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
