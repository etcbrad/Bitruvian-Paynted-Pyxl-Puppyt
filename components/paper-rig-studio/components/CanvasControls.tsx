import React from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';

interface Props {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
}

export function CanvasControls({ scale, onZoomIn, onZoomOut, onFit, onReset }: Props) {
  return (
    <div
      className="absolute top-3 right-3 flex flex-col gap-1 z-20"
      style={{
        background: 'rgba(13,17,23,0.72)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99,102,241,0.18)',
        borderRadius: 10,
        padding: '6px',
      }}
    >
      <ControlBtn title="Zoom in" onClick={onZoomIn}><ZoomIn size={13} /></ControlBtn>
      <ControlBtn title="Zoom out" onClick={onZoomOut}><ZoomOut size={13} /></ControlBtn>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />

      <ControlBtn title="Fit all content" onClick={onFit}><Maximize2 size={13} /></ControlBtn>
      <ControlBtn title="Reset view" onClick={onReset}><RotateCcw size={13} /></ControlBtn>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />

      <div
        className="text-center font-mono select-none"
        style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', padding: '1px 0' }}
      >
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}

function ControlBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        color: 'rgba(255,255,255,0.45)',
        cursor: 'pointer',
        transition: 'color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.22)';
        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.9)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)';
      }}
    >
      {children}
    </button>
  );
}
