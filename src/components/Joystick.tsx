import React, { useState, useRef, useEffect, useCallback } from 'react';

interface JoystickProps {
  onMove: (x: number, y: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  color?: string;
  label?: string;
}

export const Joystick: React.FC<JoystickProps> = ({ onMove, onStart, onEnd, color = '#3b82f6', label }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const size = 120;
  const handleSize = 50;
  const radius = size / 2;

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    onStart?.();
    handleMove(e);
  };

  const handleMove = useCallback((e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    if (!isDragging && !('touches' in e)) return;
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + radius;
    const centerY = rect.top + radius;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = radius - handleSize / 2;

    let limitedX = dx;
    let limitedY = dy;

    if (distance > maxDistance) {
      const angle = Math.atan2(dy, dx);
      limitedX = Math.cos(angle) * maxDistance;
      limitedY = Math.sin(angle) * maxDistance;
    }

    setPosition({ x: limitedX, y: limitedY });
    onMove(limitedX / maxDistance, limitedY / maxDistance);
  }, [isDragging, radius, onMove]);

  const handleEnd = useCallback(() => {
    setIsDragging(false);
    onEnd?.();
    setPosition({ x: 0, y: 0 });
    onMove(0, 0);
  }, [onMove, onEnd]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      {label && <span className="text-xs font-mono uppercase opacity-50 text-white">{label}</span>}
      <div
        ref={containerRef}
        className="relative rounded-full bg-white/10 border border-white/20 backdrop-blur-sm"
        style={{ width: size, height: size }}
        onMouseDown={handleStart}
        onTouchStart={handleStart}
      >
        <div
          className="absolute rounded-full shadow-lg transition-transform duration-75"
          style={{
            width: handleSize,
            height: handleSize,
            backgroundColor: color,
            left: radius - handleSize / 2 + position.x,
            top: radius - handleSize / 2 + position.y,
            boxShadow: `0 0 20px ${color}44`,
          }}
        />
      </div>
    </div>
  );
};
