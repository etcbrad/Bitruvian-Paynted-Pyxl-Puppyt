import React, { useMemo } from 'react';
import { BodyPart } from '../types';
import { ViewState } from '../store';

const MAP_W = 140;
const MAP_H = 90;
const PADDING = 10;

interface MapItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
}

interface Props {
  items: MapItem[];
  view: ViewState;
  canvasW: number;
  canvasH: number;
}

export function MiniMap({ items, view, canvasW, canvasH }: Props) {
  const { transform, vpRect } = useMemo(() => {
    if (!items.length) {
      return {
        transform: { scale: 0.1, ox: MAP_W / 2, oy: MAP_H / 2 },
        vpRect: null,
      };
    }

    const minX = Math.min(...items.map(i => i.x)) - PADDING;
    const minY = Math.min(...items.map(i => i.y)) - PADDING;
    const maxX = Math.max(...items.map(i => i.x + i.w)) + PADDING;
    const maxY = Math.max(...items.map(i => i.y + i.h)) + PADDING;
    const boundsW = Math.max(maxX - minX, 1);
    const boundsH = Math.max(maxY - minY, 1);

    const scaleX = MAP_W / boundsW;
    const scaleY = MAP_H / boundsH;
    const scale = Math.min(scaleX, scaleY);

    const ox = -minX * scale + (MAP_W - boundsW * scale) / 2;
    const oy = -minY * scale + (MAP_H - boundsH * scale) / 2;

    const vpX = (-view.x / view.scale) * scale + ox;
    const vpY = (-view.y / view.scale) * scale + oy;
    const vpW = (canvasW / view.scale) * scale;
    const vpH = (canvasH / view.scale) * scale;

    return {
      transform: { scale, ox, oy },
      vpRect: { x: vpX, y: vpY, w: vpW, h: vpH },
    };
  }, [items, view, canvasW, canvasH]);

  if (!items.length) return null;

  return (
    <div
      className="absolute bottom-3 right-3 z-20 overflow-hidden"
      style={{
        width: MAP_W,
        height: MAP_H,
        background: 'rgba(13,17,23,0.75)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(99,102,241,0.18)',
        borderRadius: 8,
      }}
    >
      <svg width={MAP_W} height={MAP_H}>
        <defs>
          <pattern id="miniGrid" width={8} height={8} patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 0 0 0 8" fill="none" stroke="rgba(99,102,241,0.06)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="url(#miniGrid)" />

        {items.map(item => {
          const rx = item.x * transform.scale + transform.ox;
          const ry = item.y * transform.scale + transform.oy;
          const rw = Math.max(item.w * transform.scale, 2);
          const rh = Math.max(item.h * transform.scale, 2);
          return (
            <rect
              key={item.id}
              x={rx} y={ry} width={rw} height={rh}
              rx={1}
              fill={item.color || 'rgba(99,102,241,0.35)'}
              stroke="rgba(99,102,241,0.6)"
              strokeWidth={0.5}
            />
          );
        })}

        {vpRect && (
          <rect
            x={vpRect.x} y={vpRect.y}
            width={Math.max(vpRect.w, 4)} height={Math.max(vpRect.h, 4)}
            fill="rgba(99,102,241,0.08)"
            stroke="rgba(99,102,241,0.6)"
            strokeWidth={1}
            strokeDasharray="3 2"
            rx={1}
          />
        )}
      </svg>
      <div
        className="absolute top-1 left-2 font-mono"
        style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 }}
      >
        MAP
      </div>
    </div>
  );
}

export function partsToMapItems(parts: BodyPart[]): MapItem[] {
  return parts.map(p => ({
    id: p.id,
    x: p.canvasX,
    y: p.canvasY,
    w: p.width,
    h: p.height,
  }));
}
