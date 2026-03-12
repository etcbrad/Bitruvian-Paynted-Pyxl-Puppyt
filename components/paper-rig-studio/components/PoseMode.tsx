import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Group, Circle, Rect as KonvaRect } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { BodyPart, PoseState } from '../types';
import { GridBackground } from './GridBackground';
import { CanvasControls } from './CanvasControls';
import { MiniMap, partsToMapItems } from './MiniMap';
import { useCanvasView } from '../hooks/useCanvasView';
import { RotateCcw } from 'lucide-react';

interface Props {
  parts: BodyPart[];
  backdrop: string | null;
  pose: PoseState;
  setPose: (pose: PoseState) => void;
}

function deg(r: number) { return r * 180 / Math.PI; }
function rad(d: number) { return d * Math.PI / 180; }

function computeWorldTransform(
  partId: string,
  parts: BodyPart[],
  pose: PoseState,
): { x: number; y: number; rotation: number } {
  const part = parts.find(p => p.id === partId);
  if (!part) return { x: 0, y: 0, rotation: 0 };
  const entry = pose[partId] || { rotation: 0, x: part.canvasX + part.pivot.x, y: part.canvasY + part.pivot.y };

  if (!part.parentId) return { x: entry.x, y: entry.y, rotation: entry.rotation || 0 };

  const parent = parts.find(p => p.id === part.parentId);
  if (!parent) return { x: entry.x, y: entry.y, rotation: entry.rotation || 0 };

  const parentWorld = computeWorldTransform(parent.id, parts, pose);
  const parentRot = rad(parentWorld.rotation);
  const bx = parent.ballPoint.x - parent.pivot.x;
  const by = parent.ballPoint.y - parent.pivot.y;

  return {
    x: parentWorld.x + bx * Math.cos(parentRot) - by * Math.sin(parentRot),
    y: parentWorld.y + bx * Math.sin(parentRot) + by * Math.cos(parentRot),
    rotation: parentWorld.rotation + (entry.rotation || 0),
  };
}

function PartRenderer({ part, parts, pose, isSelected, onSelect, onAngleChange, onMoveRoot }: {
  part: BodyPart;
  parts: BodyPart[];
  pose: PoseState;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onAngleChange: (id: string, angle: number) => void;
  onMoveRoot: (id: string, x: number, y: number) => void;
}) {
  const [img] = useImage(part.imageUrl);
  const isRoot = !part.parentId;
  const world = computeWorldTransform(part.id, parts, pose);

  const ballOffX = part.ballPoint.x - part.pivot.x;
  const ballOffY = part.ballPoint.y - part.pivot.y;
  const boneLen = Math.sqrt(ballOffX * ballOffX + ballOffY * ballOffY);
  const boneAngle = deg(Math.atan2(ballOffY, ballOffX));

  const handleBallDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const group = e.target.getParent() as Konva.Group;
    const inv = group.getAbsoluteTransform().copy().invert();
    const local = inv.point(pos);
    const newWorldAngle = deg(Math.atan2(local.y, local.x));
    const nativeAngle = deg(Math.atan2(ballOffY, ballOffX));
    const currentEntry = pose[part.id] || { rotation: 0, x: 0, y: 0 };
    const parentRot = world.rotation - (currentEntry.rotation || 0);
    const newLocalRot = newWorldAngle - nativeAngle - parentRot;
    onAngleChange(part.id, newLocalRot);
    e.target.x(ballOffX);
    e.target.y(ballOffY);
  }, [ballOffX, ballOffY, world.rotation, part.id, pose, onAngleChange]);

  return (
    <Group
      x={world.x}
      y={world.y}
      rotation={world.rotation}
      draggable={isRoot}
      onClick={() => onSelect(part.id)}
      onDragEnd={isRoot ? (e: any) => onMoveRoot(part.id, e.target.x(), e.target.y()) : undefined}
    >
      {boneLen > 4 && (
        <Group rotation={boneAngle}>
          <KonvaRect
            x={0} y={-5} width={boneLen} height={10}
            fill={isSelected ? 'rgba(99,102,241,0.28)' : 'rgba(150,130,90,0.15)'}
            stroke={isSelected ? 'rgba(99,102,241,0.5)' : 'rgba(150,130,90,0.25)'}
            strokeWidth={1}
            cornerRadius={5}
          />
        </Group>
      )}

      {img && (
        <KonvaImage image={img} offsetX={part.pivot.x} offsetY={part.pivot.y} opacity={0.9} />
      )}

      <Circle
        x={0} y={0}
        radius={isSelected ? 7 : 4}
        fill={isSelected ? '#a855f7' : 'rgba(168,85,247,0.55)'}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={1}
        onClick={() => onSelect(part.id)}
      />

      <Circle
        x={ballOffX} y={ballOffY}
        radius={isSelected ? 10 : 6}
        fill={isSelected ? '#14b8a6' : 'rgba(20,184,166,0.55)'}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={isSelected ? 2 : 1}
        draggable
        onDragMove={handleBallDragMove}
        onDragEnd={(e: any) => { e.target.x(ballOffX); e.target.y(ballOffY); }}
        onClick={(e: any) => { e.cancelBubble = true; }}
      />
    </Group>
  );
}

export function PoseMode({ parts, backdrop, pose, setPose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [backdropImg] = useImage(backdrop || '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [backdropPos, setBackdropPos] = useState({ x: 0, y: 0 });
  const [backdropScale, setBackdropScale] = useState(1);
  const [backdropOpacity, setBackdropOpacity] = useState(0.8);

  const { view, handleWheel, handleDragEnd, fitToContent, recenter, zoomIn, zoomOut } = useCanvasView('pose', stageRef);

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
    const init: PoseState = {};
    parts.forEach(p => {
      if (!pose[p.id]) init[p.id] = { rotation: 0, x: p.canvasX + p.pivot.x, y: p.canvasY + p.pivot.y };
    });
    if (Object.keys(init).length > 0) setPose({ ...pose, ...init });
  }, [parts]);

  useEffect(() => {
    if (parts.length > 0) {
      const items = parts.map(p => ({ x: p.canvasX, y: p.canvasY, width: p.width, height: p.height }));
      fitToContent(items, dims.w, dims.h, 80);
    }
  }, []);

  const selectedPart = parts.find(p => p.id === selectedId);
  const selectedEntry = selectedId ? pose[selectedId] : null;

  const handleAngleChange = useCallback((id: string, angle: number) => {
    setPose(prev => ({ ...prev, [id]: { ...(prev[id] || { x: 0, y: 0, rotation: 0 }), rotation: angle } }));
  }, [setPose]);

  const handleMoveRoot = useCallback((id: string, x: number, y: number) => {
    setPose(prev => ({ ...prev, [id]: { ...(prev[id] || { rotation: 0, x: 0, y: 0 }), x, y } }));
  }, [setPose]);

  const resetPose = () => {
    const np: PoseState = {};
    parts.forEach(p => { np[p.id] = { rotation: 0, x: p.canvasX + p.pivot.x, y: p.canvasY + p.pivot.y }; });
    setPose(np);
  };

  const miniItems = partsToMapItems(parts);

  return (
    <div className="flex h-full">
      <div
        className="w-60 flex flex-col overflow-hidden z-10 flex-shrink-0"
        style={{
          background: 'rgba(13,17,23,0.88)',
          backdropFilter: 'blur(12px)',
          borderRight: '1px solid rgba(99,102,241,0.12)',
        }}
      >
        <div className="p-4 border-b border-neutral-800">
          <h2 className="text-sm font-bold text-white tracking-wide uppercase">Pose Mode</h2>
          <p className="text-xs text-neutral-500 mt-1">Drag teal handles to rotate. Drag root parts to reposition.</p>
        </div>

        {selectedPart && selectedEntry && (
          <div className="p-3 border-b border-neutral-800">
            <p className="text-xs font-medium text-indigo-400 mb-2">{selectedPart.name}</p>
            <div className="flex justify-between text-xs text-neutral-500 mb-1">
              <span>Rotation</span>
              <span className="font-mono text-neutral-200">{Math.round(selectedEntry.rotation || 0)}°</span>
            </div>
            <input
              type="range" min={-180} max={180}
              value={selectedEntry.rotation || 0}
              onChange={e => handleAngleChange(selectedPart.id, Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {parts.map(part => (
            <button
              key={part.id}
              onClick={() => setSelectedId(selectedId === part.id ? null : part.id)}
              className={`w-full text-left px-2 py-1.5 rounded text-xs transition-all ${
                selectedId === part.id
                  ? 'bg-indigo-900/50 text-indigo-300 border border-indigo-700/40'
                  : 'text-neutral-400 hover:bg-neutral-800 border border-transparent'
              }`}
            >
              {part.parentId && <span className="text-neutral-700 mr-1">↳</span>}
              {part.name}
            </button>
          ))}
        </div>

        {backdrop && (
          <div className="p-3 border-t border-neutral-800 space-y-2 text-xs">
            <p className="text-neutral-500 font-medium">Backdrop</p>
            <div className="flex justify-between text-neutral-600 mb-0.5"><span>Scale</span><span className="font-mono text-neutral-300">{Math.round(backdropScale * 100)}%</span></div>
            <input type="range" min={0.1} max={3} step={0.01} value={backdropScale} onChange={e => setBackdropScale(Number(e.target.value))} className="w-full accent-green-600" />
            <div className="flex justify-between text-neutral-600 mb-0.5"><span>Opacity</span><span className="font-mono text-neutral-300">{Math.round(backdropOpacity * 100)}%</span></div>
            <input type="range" min={0} max={1} step={0.01} value={backdropOpacity} onChange={e => setBackdropOpacity(Number(e.target.value))} className="w-full accent-green-600" />
          </div>
        )}

        <div className="p-3 border-t border-neutral-800">
          <button onClick={resetPose} className="w-full flex items-center justify-center gap-2 py-1.5 border border-red-800 text-red-500 rounded text-xs font-medium hover:bg-red-950/50 transition-colors">
            <RotateCcw size={12} /> Reset Pose
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
            onMouseDown={(e: any) => {
              if (e.target === e.target.getStage() || e.target.name() === 'backdrop') setSelectedId(null);
            }}
          >
            <Layer>
              {backdropImg && (
                <KonvaImage
                  image={backdropImg}
                  name="backdrop"
                  x={backdropPos.x} y={backdropPos.y}
                  scaleX={backdropScale} scaleY={backdropScale}
                  opacity={backdropOpacity}
                  draggable
                  onDragMove={(e: any) => setBackdropPos({ x: e.target.x(), y: e.target.y() })}
                />
              )}
              {parts.map(part => (
                <PartRenderer
                  key={part.id}
                  part={part}
                  parts={parts}
                  pose={pose}
                  isSelected={selectedId === part.id}
                  onSelect={setSelectedId}
                  onAngleChange={handleAngleChange}
                  onMoveRoot={handleMoveRoot}
                />
              ))}
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
      </div>
    </div>
  );
}
