import React, { useRef, useEffect, useCallback } from 'react';
import { PhysicsProps } from '../types';

interface Props {
  physics: PhysicsProps;
  onChange: (physics: PhysicsProps) => void;
}

function getMaterialLabel(stiffness: number, tension: number): string {
  if (stiffness > 80) return 'Marble';
  if (stiffness > 60) return 'Wood';
  if (stiffness > 40) return 'Paper';
  if (stiffness > 20) return 'Fabric';
  return 'Rubber';
}

function getAgeLabel(tension: number): string {
  if (tension > 80) return 'Youthful';
  if (tension > 60) return 'Fresh';
  if (tension > 40) return 'Worn';
  if (tension > 20) return 'Aged';
  return 'Ancient';
}

export function PhysicsWheel({ physics, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;

    ctx.clearRect(0, 0, size, size);

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(128,128,128,0.3)');
    grad.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    const stiffGrad = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    stiffGrad.addColorStop(0, 'rgba(34,197,94,0.4)');
    stiffGrad.addColorStop(0.5, 'rgba(200,200,200,0.1)');
    stiffGrad.addColorStop(1, 'rgba(139,92,246,0.4)');
    ctx.fillStyle = stiffGrad;
    ctx.fillRect(cx - r, cy - 2, r * 2, 4);

    const tensionGrad = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    tensionGrad.addColorStop(0, 'rgba(234,179,8,0.4)');
    tensionGrad.addColorStop(1, 'rgba(100,100,100,0.4)');
    ctx.fillStyle = tensionGrad;
    ctx.fillRect(cx - 2, cy - r, 4, r * 2);

    const dotX = cx + ((physics.stiffness / 100) * 2 - 1) * r;
    const dotY = cy - ((physics.tension / 100) * 2 - 1) * r;

    const stiffnessColor = physics.stiffness > 50
      ? `rgba(139,92,246,${0.4 + (physics.stiffness - 50) / 100})`
      : `rgba(34,197,94,${0.4 + (50 - physics.stiffness) / 100})`;

    const dotGrad = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 10);
    dotGrad.addColorStop(0, 'white');
    dotGrad.addColorStop(0.4, stiffnessColor);
    dotGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = dotGrad;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();

    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(139,92,246,0.8)';
    ctx.fillText('Marble', cx + r - 32, cy - 4);
    ctx.fillStyle = 'rgba(34,197,94,0.8)';
    ctx.fillText('Rubber', cx - r + 2, cy - 4);
    ctx.fillStyle = 'rgba(234,179,8,0.8)';
    ctx.fillText('Youthful', cx + 4, cy - r + 10);
    ctx.fillStyle = 'rgba(160,160,160,0.8)';
    ctx.fillText('Aged', cx + 4, cy + r - 4);
  }, [physics]);

  useEffect(() => { draw(); }, [draw]);

  const getPhysicsFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;
    const x = ((e.clientX - rect.left) / rect.width) * size;
    const y = ((e.clientY - rect.top) / rect.height) * size;
    const stiffness = Math.max(0, Math.min(100, ((x - (cx - r)) / (r * 2)) * 100));
    const tension = Math.max(0, Math.min(100, ((cy + r - y) / (r * 2)) * 100));
    onChange({ ...physics, stiffness: Math.round(stiffness), tension: Math.round(tension) });
  }, [physics, onChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    getPhysicsFromEvent(e);
  }, [getPhysicsFromEvent]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging.current) getPhysicsFromEvent(e);
  }, [getPhysicsFromEvent]);

  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);

  return (
    <div className="flex flex-col items-center space-y-2">
      <div className="flex items-center justify-between w-full">
        <span className="text-xs font-medium text-neutral-300">Physics Wheel</span>
        <span className="text-xs text-indigo-400 font-mono">
          {getMaterialLabel(physics.stiffness, physics.tension)} · {getAgeLabel(physics.tension)}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={180}
        height={180}
        className="cursor-crosshair rounded-full"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-full text-xs">
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Stiffness</span>
          <span className="font-mono text-neutral-200">{physics.stiffness}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Tension</span>
          <span className="font-mono text-neutral-200">{physics.tension}%</span>
        </div>
      </div>
      <div className="flex items-center gap-2 w-full text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={physics.volumePreservation}
            onChange={e => onChange({ ...physics, volumePreservation: e.target.checked })}
            className="accent-indigo-500"
          />
          <span className="text-neutral-400">Volume Preservation</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={physics.shadowEnabled}
            onChange={e => onChange({ ...physics, shadowEnabled: e.target.checked })}
            className="accent-indigo-500"
          />
          <span className="text-neutral-400">Shadow</span>
        </label>
      </div>
    </div>
  );
}
