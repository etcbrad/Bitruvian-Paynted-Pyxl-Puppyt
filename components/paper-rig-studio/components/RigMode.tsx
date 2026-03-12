import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Group, Circle, Line, Rect as KonvaRect } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { BodyPart, Point } from '../types';
import { GridBackground } from './GridBackground';
import { CanvasControls } from './CanvasControls';
import { MiniMap, partsToMapItems } from './MiniMap';
import { PhysicsWheel } from './PhysicsWheel';
import { useCanvasView } from '../hooks/useCanvasView';
import { Unlink, ArrowRight } from 'lucide-react';

const SNAP_DIST = 50;

function PartImage({ part, isSelected, onSelect, onDragEnd, onDragMove, snapTarget }: {
  part: BodyPart;
  isSelected: boolean;
  snapTarget: boolean;
  viewScale: number;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onDragMove: (x: number, y: number, partId: string) => void;
}) {
  const [img] = useImage(part.imageUrl);

  const dx = part.ballPoint.x - part.pivot.x;
  const dy = part.ballPoint.y - part.pivot.y;
  const pipeLen = Math.sqrt(dx * dx + dy * dy);
  const pipeAngle = Math.atan2(dy, dx) * 180 / Math.PI;

  return (
    <Group
      x={part.canvasX}
      y={part.canvasY}
      draggable
      onClick={onSelect}
      onDragMove={e => onDragMove(e.target.x(), e.target.y(), part.id)}
      onDragEnd={e => onDragEnd(e.target.x(), e.target.y())}
    >
      {img && <KonvaImage image={img} opacity={0.88} />}

      {pipeLen > 4 && (
        <Group x={part.pivot.x} y={part.pivot.y} rotation={pipeAngle}>
          <KonvaRect
            x={0} y={-6} width={pipeLen} height={12}
            fill={isSelected ? 'rgba(99,102,241,0.35)' : 'rgba(180,160,120,0.18)'}
            stroke={isSelected ? 'rgba(99,102,241,0.6)' : 'rgba(180,160,120,0.3)'}
            strokeWidth={1}
            cornerRadius={6}
          />
        </Group>
      )}

      <Circle
        x={part.pivot.x} y={part.pivot.y}
        radius={snapTarget ? 14 : 9}
        fill="transparent"
        stroke={snapTarget ? '#a855f7' : '#7c3aed'}
        strokeWidth={snapTarget ? 3 : 2}
        dash={[4, 3]}
        opacity={snapTarget ? 1 : 0.8}
      />
      {snapTarget && <Circle x={part.pivot.x} y={part.pivot.y} radius={5} fill="rgba(168,85,247,0.4)" />}

      <Circle
        x={part.ballPoint.x} y={part.ballPoint.y}
        radius={isSelected ? 10 : 7}
        fill={isSelected ? '#14b8a6' : '#0d9488'}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={1.5}
      />
    </Group>
  );
}

interface Props {
  parts: BodyPart[];
  setParts: (parts: BodyPart[]) => void;
  onNext: () => void;
}

export function RigMode({ parts, setParts, onNext }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapCandidateId, setSnapCandidateId] = useState<string | null>(null);
  const [snapPreviewLine, setSnapPreviewLine] = useState<[number, number, number, number] | null>(null);

  const { view, handleWheel, handleDragEnd, fitToContent, recenter, zoomIn, zoomOut } = useCanvasView('rig', stageRef);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) setDims({ w: containerRef.current.offsetWidth, h: containerRef.current.offsetHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (parts.length > 0) {
      const items = parts.map(p => ({ x: p.canvasX, y: p.canvasY, width: p.width, height: p.height }));
      fitToContent(items, dims.w, dims.h, 80);
    }
  }, []);

  const selectedPart = parts.find(p => p.id === selectedId);
  const sorted = useMemo(() => [...parts].sort((a, b) => a.zIndex - b.zIndex), [parts]);

  const handlePartDragMove = useCallback((x: number, y: number, dragId: string) => {
    const dragging = parts.find(p => p.id === dragId);
    if (!dragging) return;
    const mySocketWorld = { x: x + dragging.pivot.x, y: y + dragging.pivot.y };

    let best: { id: string; dist: number; bx: number; by: number } | null = null;
    for (const p of parts) {
      if (p.id === dragId) continue;
      const ballWorld = { x: p.canvasX + p.ballPoint.x, y: p.canvasY + p.ballPoint.y };
      const dist = Math.hypot(mySocketWorld.x - ballWorld.x, mySocketWorld.y - ballWorld.y);
      if (dist < SNAP_DIST && (!best || dist < best.dist)) best = { id: p.id, dist, bx: ballWorld.x, by: ballWorld.y };
    }

    if (best) {
      setSnapCandidateId(best.id);
      setSnapPreviewLine([mySocketWorld.x, mySocketWorld.y, best.bx, best.by]);
    } else {
      setSnapCandidateId(null);
      setSnapPreviewLine(null);
    }
  }, [parts]);

  const handlePartDragEnd = useCallback((dragId: string, x: number, y: number) => {
    if (snapCandidateId) {
      const parent = parts.find(p => p.id === snapCandidateId)!;
      const ballWorld = { x: parent.canvasX + parent.ballPoint.x, y: parent.canvasY + parent.ballPoint.y };
      const dragging = parts.find(p => p.id === dragId)!;
      const snappedX = ballWorld.x - dragging.pivot.x;
      const snappedY = ballWorld.y - dragging.pivot.y;
      setParts(parts.map(p => p.id === dragId ? { ...p, canvasX: snappedX, canvasY: snappedY, parentId: snapCandidateId } : p));
    } else {
      setParts(parts.map(p => p.id === dragId ? { ...p, canvasX: x, canvasY: y } : p));
    }
    setSnapCandidateId(null);
    setSnapPreviewLine(null);
  }, [parts, snapCandidateId, setParts]);

  const connectionLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    for (const child of parts) {
      if (!child.parentId) continue;
      const parent = parts.find(p => p.id === child.parentId);
      if (!parent) continue;
      const bx = parent.canvasX + parent.ballPoint.x;
      const by = parent.canvasY + parent.ballPoint.y;
      const sx = child.canvasX + child.pivot.x;
      const sy = child.canvasY + child.pivot.y;
      lines.push(
        <Group key={`c-${child.id}`}>
          <Line points={[bx, by, sx, sy]} stroke="#a855f7" strokeWidth={2} opacity={0.4} dash={[6, 4]} />
          <Circle x={bx} y={by} radius={8} fill="#a855f7" opacity={0.25} />
          <Circle x={bx} y={by} radius={4} fill="#a855f7" />
          <Circle x={sx} y={sy} radius={6} fill="rgba(168,85,247,0.15)" stroke="#a855f7" strokeWidth={1.5} />
        </Group>
      );
    }
    return lines;
  }, [parts]);

  const miniItems = partsToMapItems(parts);

  return (
    <div className="flex h-full">
      <div
        className="w-64 flex flex-col overflow-hidden z-10 flex-shrink-0"
        style={{
          background: 'rgba(13,17,23,0.88)',
          backdropFilter: 'blur(12px)',
          borderRight: '1px solid rgba(99,102,241,0.12)',
        }}
      >
        <div className="p-4 border-b border-neutral-800">
          <h2 className="text-sm font-bold text-white tracking-wide uppercase">Rig Mode</h2>
          <p className="text-xs text-neutral-500 mt-1">Drag a child's teal ball near a parent's purple socket to connect</p>
        </div>

        <div className="p-3 border-b border-neutral-800">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-full border-2 border-dashed border-purple-500" /><span className="text-neutral-400">Socket (parent)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-teal-500" /><span className="text-neutral-400">Ball (child)</span></div>
          </div>
          <p className="text-xs text-neutral-600 mt-1.5">Scroll to zoom · drag canvas to pan</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {parts.map(part => {
            const isSelected = part.id === selectedId;
            const parentName = parts.find(p => p.id === part.parentId)?.name;
            return (
              <div
                key={part.id}
                onClick={() => setSelectedId(isSelected ? null : part.id)}
                className={`p-2 rounded cursor-pointer transition-all border ${isSelected ? 'border-indigo-600/60 bg-indigo-950/40' : 'border-transparent hover:bg-neutral-800'}`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded overflow-hidden bg-neutral-800 flex-shrink-0">
                    <img src={part.imageUrl} alt={part.name} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-neutral-200 truncate">{part.name}</p>
                    {parentName && <p className="text-xs text-purple-400 truncate">↳ {parentName}</p>}
                  </div>
                  {part.parentId && (
                    <button
                      onClick={e => { e.stopPropagation(); setParts(parts.map(p => p.id === part.id ? { ...p, parentId: null } : p)); }}
                      className="text-neutral-700 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Unlink size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {selectedPart && (
          <div className="p-3 border-t border-neutral-800">
            <p className="text-xs text-neutral-500 mb-2 font-medium">Physics — {selectedPart.name}</p>
            <PhysicsWheel
              physics={selectedPart.physics}
              onChange={physics => setParts(parts.map(p => p.id === selectedPart.id ? { ...p, physics } : p))}
            />
            <div className="mt-2 space-y-1 text-xs">
              <div>
                <div className="flex justify-between text-neutral-500 mb-0.5"><label>Pivot X</label><span className="font-mono text-neutral-300">{Math.round(selectedPart.pivot.x)}</span></div>
                <input type="range" min={0} max={selectedPart.width} value={selectedPart.pivot.x}
                  onChange={e => setParts(parts.map(p => p.id === selectedPart.id ? { ...p, pivot: { ...p.pivot, x: Number(e.target.value) } } : p))}
                  className="w-full accent-indigo-500" />
              </div>
              <div>
                <div className="flex justify-between text-neutral-500 mb-0.5"><label>Ball Y</label><span className="font-mono text-neutral-300">{Math.round(selectedPart.ballPoint.y)}</span></div>
                <input type="range" min={0} max={selectedPart.height} value={selectedPart.ballPoint.y}
                  onChange={e => setParts(parts.map(p => p.id === selectedPart.id ? { ...p, ballPoint: { ...p.ballPoint, y: Number(e.target.value) } } : p))}
                  className="w-full accent-teal-500" />
              </div>
            </div>
          </div>
        )}

        <div className="p-3 border-t border-neutral-800">
          <button onClick={onNext} disabled={parts.length === 0}
            className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-indigo-500 transition-colors">
            Pose <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden" ref={containerRef}>
        <GridBackground>
          <Stage
            ref={stageRef}
            width={dims.w}
            height={dims.h}
            x={view.x}
            y={view.y}
            scaleX={view.scale}
            scaleY={view.scale}
            draggable
            onWheel={handleWheel}
            onDragEnd={handleDragEnd}
          >
            <Layer>
              {connectionLines}
              {sorted.map(part => (
                <PartImage
                  key={part.id}
                  part={part}
                  isSelected={selectedId === part.id}
                  snapTarget={snapCandidateId === part.id}
                  viewScale={view.scale}
                  onSelect={() => setSelectedId(selectedId === part.id ? null : part.id)}
                  onDragMove={handlePartDragMove}
                  onDragEnd={(x, y) => handlePartDragEnd(part.id, x, y)}
                />
              ))}
              {snapPreviewLine && (
                <Line points={snapPreviewLine} stroke="#a855f7" strokeWidth={2 / view.scale} dash={[6 / view.scale, 3 / view.scale]} opacity={0.7} />
              )}
            </Layer>
          </Stage>
        </GridBackground>

        <CanvasControls
          scale={view.scale}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFit={() => fitToContent(parts.map(p => ({ x: p.canvasX, y: p.canvasY, width: p.width, height: p.height })), dims.w, dims.h)}
          onReset={() => recenter(dims.w, dims.h)}
        />
        <MiniMap items={miniItems} view={view} canvasW={dims.w} canvasH={dims.h} />

        <div className="absolute bottom-[104px] right-3 z-20 flex flex-col gap-1 text-xs text-neutral-600 px-3 py-2 rounded-lg"
          style={{ background: 'rgba(13,17,23,0.72)', backdropFilter: 'blur(10px)', border: '1px solid rgba(99,102,241,0.12)' }}>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full border-2 border-dashed border-purple-500" /><span>Socket</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-teal-500" /><span>Ball</span></div>
          <div className="flex items-center gap-2"><div className="w-7 h-2 rounded bg-neutral-600 opacity-60" /><span>Bone</span></div>
        </div>
      </div>
    </div>
  );
}
