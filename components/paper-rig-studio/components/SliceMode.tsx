import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Line as KonvaLine, Circle, Group } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { v4 as uuidv4 } from 'uuid';
import { BodyPart, Point } from '../types';
import { GridBackground } from './GridBackground';
import { CanvasControls } from './CanvasControls';
import { MiniMap, partsToMapItems } from './MiniMap';
import { useCanvasView } from '../hooks/useCanvasView';
import { magicWand } from '../utils/magicWand';
import { extractPolygon, sliceWithLine, getImageData } from '../utils/imageUtils';
import { Slash, Wand2, PenTool, Trash2, Check, ArrowRight, Hand } from 'lucide-react';

type SliceTool = 'line' | 'wand' | 'draw' | 'pan';

interface Props {
  cutoutSheet: string | null;
  parts: BodyPart[];
  setParts: (parts: BodyPart[]) => void;
  onNext: () => void;
}

export function SliceMode({ cutoutSheet, parts, setParts, onNext }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [image] = useImage(cutoutSheet || '');
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 });
  const [imgScale, setImgScale] = useState(1);

  const { view, handleWheel, handleDragEnd, fitToContent, recenter, zoomIn, zoomOut } = useCanvasView('slice', stageRef);

  const [tool, setTool] = useState<SliceTool>('line');
  const [tolerance, setTolerance] = useState(30);
  const [lineStart, setLineStart] = useState<Point | null>(null);
  const [lineEnd, setLineEnd] = useState<Point | null>(null);
  const [isDrawingLine, setIsDrawingLine] = useState(false);
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  const [cursorPos, setCursorPos] = useState<Point>({ x: 0, y: 0 });
  const [preview, setPreview] = useState<Point[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); setTool('pan'); }
    };
    const offKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') setTool(prev => prev === 'pan' ? 'line' : prev);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', offKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', offKey); };
  }, []);

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
    if (!image || !dims.w) return;
    const scaleX = (dims.w - 80) / image.naturalWidth;
    const scaleY = (dims.h - 80) / image.naturalHeight;
    const s = Math.min(scaleX, scaleY, 1);
    const ox = (dims.w - image.naturalWidth * s) / 2;
    const oy = (dims.h - image.naturalHeight * s) / 2;
    setImgScale(s);
    setImgOffset({ x: ox, y: oy });
  }, [image, dims]);

  useEffect(() => {
    if (image) setImageData(getImageData(image as HTMLImageElement));
  }, [image]);

  const stageToImg = useCallback((sx: number, sy: number): Point => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const transform = stage.getAbsoluteTransform().copy().invert();
    const local = transform.point({ x: sx, y: sy });
    return {
      x: (local.x - imgOffset.x) / imgScale,
      y: (local.y - imgOffset.y) / imgScale,
    };
  }, [imgOffset, imgScale]);

  const imgToCanvas = useCallback((ix: number, iy: number): Point => ({
    x: ix * imgScale + imgOffset.x,
    y: iy * imgScale + imgOffset.y,
  }), [imgOffset, imgScale]);

  const resetTool = () => {
    setLineStart(null); setLineEnd(null); setIsDrawingLine(false);
    setDrawPoints([]); setPreview(null);
  };

  const addPart = async (polygon: Point[], name?: string) => {
    if (!cutoutSheet || polygon.length < 3) return;
    setIsProcessing(true);
    try {
      const result = await extractPolygon(cutoutSheet, polygon);
      const id = uuidv4();
      const newPart: BodyPart = {
        id,
        name: name || `Part ${parts.length + 1}`,
        imageUrl: result.url,
        width: result.width,
        height: result.height,
        pivot: { x: result.width / 2, y: result.height / 2 },
        ballPoint: { x: result.width / 2, y: result.height },
        parentId: null,
        canvasX: 100 + parts.length * 30,
        canvasY: 100 + parts.length * 20,
        zIndex: parts.length,
        physics: { stiffness: 50, tension: 80, volumePreservation: false, shadowEnabled: false },
      };
      setParts([...parts, newPart]);
      setSelectedId(id);
    } finally {
      setIsProcessing(false);
      resetTool();
    }
  };

  const getPointerImgCoords = (e: Konva.KonvaEventObject<MouseEvent>): Point | null => {
    const stage = e.target.getStage();
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return stageToImg(pos.x, pos.y);
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool === 'pan') return;
    const isCanvas = e.target === e.target.getStage() || e.target.name() === 'bg-image';
    if (!isCanvas) return;
    const ip = getPointerImgCoords(e);
    if (!ip) return;

    if (tool === 'line') {
      setIsDrawingLine(true);
      setLineStart(ip);
      setLineEnd(ip);
    } else if (tool === 'draw') {
      if (drawPoints.length > 2) {
        const first = drawPoints[0];
        if (Math.hypot(ip.x - first.x, ip.y - first.y) < 12 / imgScale) {
          setPreview([...drawPoints]);
          return;
        }
      }
      setDrawPoints(prev => [...prev, ip]);
    } else if (tool === 'wand' && imageData) {
      const pts = magicWand(imageData, Math.round(ip.x), Math.round(ip.y), tolerance);
      setPreview(pts && pts.length > 2 ? pts : null);
    }
  };

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    const ip = stageToImg(pos.x, pos.y);
    setCursorPos(ip);
    if (tool === 'line' && isDrawingLine) setLineEnd(ip);
  };

  const handleStageMouseUp = () => {
    if (tool === 'line' && isDrawingLine) setIsDrawingLine(false);
  };

  const confirmLine = async () => {
    if (!lineStart || !lineEnd || !cutoutSheet || !image) return;
    setIsProcessing(true);
    try {
      const { sideA, sideB } = await sliceWithLine(
        cutoutSheet, image.naturalWidth, image.naturalHeight,
        lineStart.x, lineStart.y, lineEnd.x, lineEnd.y,
      );
      const id1 = uuidv4(), id2 = uuidv4();
      const base = { parentId: null as null, physics: { stiffness: 50, tension: 80, volumePreservation: false, shadowEnabled: false } };
      const p1: BodyPart = { ...base, id: id1, name: `Part ${parts.length + 1}`, imageUrl: sideA.url, width: sideA.width, height: sideA.height, pivot: { x: sideA.width / 2, y: sideA.height / 2 }, ballPoint: { x: sideA.width / 2, y: sideA.height }, canvasX: 80, canvasY: 80, zIndex: parts.length };
      const p2: BodyPart = { ...base, id: id2, name: `Part ${parts.length + 2}`, imageUrl: sideB.url, width: sideB.width, height: sideB.height, pivot: { x: sideB.width / 2, y: sideB.height / 2 }, ballPoint: { x: sideB.width / 2, y: sideB.height }, canvasX: 80 + sideA.width + 20, canvasY: 80, zIndex: parts.length + 1 };
      setParts([...parts, p1, p2]);
    } finally {
      setIsProcessing(false);
      resetTool();
    }
  };

  const deletePart = (id: string) => {
    setParts(parts.filter(p => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const lineStartCanvas = lineStart ? imgToCanvas(lineStart.x, lineStart.y) : null;
  const lineEndCanvas = lineEnd ? imgToCanvas(lineEnd.x, lineEnd.y) : null;
  const previewCanvas = preview?.map(p => imgToCanvas(p.x, p.y)) || null;
  const drawCanvas = drawPoints.map(p => imgToCanvas(p.x, p.y));
  const cursorCanvas = imgToCanvas(cursorPos.x, cursorPos.y);

  const TOOLS = [
    { id: 'line' as SliceTool, label: 'Line Cut', icon: <Slash size={14} />, hint: 'Drag to draw a cut line' },
    { id: 'wand' as SliceTool, label: 'Auto Detect', icon: <Wand2 size={14} />, hint: 'Click to detect region boundary' },
    { id: 'draw' as SliceTool, label: 'Draw Mask', icon: <PenTool size={14} />, hint: 'Click to place polygon points' },
    { id: 'pan' as SliceTool, label: 'Pan', icon: <Hand size={14} />, hint: 'Drag to pan · or hold Space' },
  ];

  const getCursor = () => {
    if (tool === 'pan') return 'grab';
    if (tool === 'line') return 'crosshair';
    if (tool === 'wand') return 'cell';
    return 'default';
  };

  const miniMapItems = image ? [{ id: 'sheet', x: imgOffset.x, y: imgOffset.y, w: image.naturalWidth * imgScale, h: image.naturalHeight * imgScale }] : [];

  return (
    <div className="flex h-full">
      <div
        className="w-64 flex flex-col z-10 overflow-hidden flex-shrink-0"
        style={{
          background: 'rgba(13,17,23,0.88)',
          backdropFilter: 'blur(12px)',
          borderRight: '1px solid rgba(99,102,241,0.12)',
        }}
      >
        <div className="p-4 border-b border-neutral-800">
          <h2 className="text-sm font-bold text-white tracking-wide uppercase">Slice Mode</h2>
          <p className="text-xs text-neutral-500 mt-1">Isolate each body part from the sheet</p>
        </div>

        <div className="p-3 border-b border-neutral-800 space-y-1">
          {TOOLS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTool(t.id); resetTool(); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-all ${
                tool === t.id
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 border border-transparent'
              }`}
            >
              {t.icon} {t.label}
              {t.id === 'pan' && <span className="ml-auto text-xs text-neutral-700 font-mono">Space</span>}
            </button>
          ))}

          {tool === 'wand' && (
            <div className="pt-1">
              <div className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>Tolerance</span><span className="text-neutral-300 font-mono">{tolerance}</span>
              </div>
              <input type="range" min={5} max={120} value={tolerance} onChange={e => setTolerance(Number(e.target.value))} className="w-full accent-indigo-500" />
            </div>
          )}

          {tool === 'draw' && drawPoints.length > 2 && !preview && (
            <button onClick={() => setPreview([...drawPoints])} className="w-full mt-1 py-1.5 bg-neutral-700 text-white rounded text-xs font-medium hover:bg-neutral-600">
              Close Polygon ({drawPoints.length} pts)
            </button>
          )}
          {(tool === 'wand' || tool === 'draw') && preview && (
            <button onClick={() => addPart(preview)} disabled={isProcessing} className="w-full mt-1 py-1.5 bg-green-700 text-white rounded text-xs font-medium flex items-center justify-center gap-1 hover:bg-green-600 disabled:opacity-50">
              <Check size={12} /> Confirm Selection
            </button>
          )}
          {tool === 'line' && lineStart && lineEnd && (
            <button onClick={confirmLine} disabled={isProcessing} className="w-full mt-1 py-1.5 bg-green-700 text-white rounded text-xs font-medium flex items-center justify-center gap-1 hover:bg-green-600 disabled:opacity-50">
              <Check size={12} /> {isProcessing ? 'Slicing…' : 'Confirm Cut'}
            </button>
          )}
          {(preview || drawPoints.length > 0 || lineStart) && (
            <button onClick={resetTool} className="w-full mt-1 py-1.5 text-neutral-500 text-xs hover:text-neutral-300">Cancel</button>
          )}
          <div className="pt-2 text-xs text-neutral-600 leading-relaxed border-t border-neutral-800 mt-2">
            {TOOLS.find(t2 => t2.id === tool)?.hint}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          <p className="text-xs text-neutral-600 font-medium uppercase tracking-wide mb-2">Parts ({parts.length})</p>
          {parts.length === 0 && <p className="text-xs text-neutral-700 text-center py-4">No parts yet</p>}
          {parts.map(part => (
            <div key={part.id} onClick={() => setSelectedId(part.id === selectedId ? null : part.id)}
              className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-all ${selectedId === part.id ? 'bg-indigo-900/40 border border-indigo-700/50' : 'hover:bg-neutral-800 border border-transparent'}`}>
              <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-neutral-800">
                <img src={part.imageUrl} alt={part.name} className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-neutral-200 truncate">{part.name}</p>
                <p className="text-xs text-neutral-600">{Math.round(part.width)}×{Math.round(part.height)}</p>
              </div>
              <button onClick={e => { e.stopPropagation(); deletePart(part.id); }} className="text-neutral-700 hover:text-red-400 transition-colors flex-shrink-0">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-neutral-800">
          <button onClick={onNext} disabled={parts.length === 0}
            className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-indigo-500 transition-colors">
            Rig ({parts.length} parts) <ArrowRight size={14} />
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
            draggable={tool === 'pan'}
            onWheel={handleWheel}
            onDragEnd={handleDragEnd}
            onMouseDown={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
            style={{ cursor: isDrawingLine ? 'crosshair' : getCursor() }}
          >
            <Layer>
              {image && (
                <KonvaImage image={image} name="bg-image" x={imgOffset.x} y={imgOffset.y} scaleX={imgScale} scaleY={imgScale} />
              )}
              {tool === 'line' && lineStartCanvas && lineEndCanvas && (
                <>
                  <KonvaLine points={[lineStartCanvas.x, lineStartCanvas.y, lineEndCanvas.x, lineEndCanvas.y]} stroke="#f43f5e" strokeWidth={2 / view.scale} dash={[8 / view.scale, 4 / view.scale]} />
                  <Circle x={lineStartCanvas.x} y={lineStartCanvas.y} radius={5 / view.scale} fill="#f43f5e" />
                  <Circle x={lineEndCanvas.x} y={lineEndCanvas.y} radius={5 / view.scale} fill="#f43f5e" />
                </>
              )}
              {tool === 'draw' && drawCanvas.length > 0 && (
                <KonvaLine points={[...drawCanvas.flatMap(p => [p.x, p.y]), cursorCanvas.x, cursorCanvas.y]} stroke="#6366f1" strokeWidth={1.5 / view.scale} dash={[5 / view.scale, 3 / view.scale]} />
              )}
              {drawCanvas.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={(i === 0 ? 7 : 4) / view.scale} fill="#6366f1" opacity={i === 0 ? 1 : 0.7} />
              ))}
              {previewCanvas && (
                <KonvaLine points={previewCanvas.flatMap(p => [p.x, p.y])} closed fill="rgba(34,197,94,0.22)" stroke="#22c55e" strokeWidth={1.5 / view.scale} />
              )}
            </Layer>
          </Stage>
        </GridBackground>

        <CanvasControls
          scale={view.scale}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFit={() => image && fitToContent([{ x: imgOffset.x, y: imgOffset.y, width: image.naturalWidth * imgScale, height: image.naturalHeight * imgScale }], dims.w, dims.h)}
          onReset={() => recenter(dims.w, dims.h)}
        />
        <MiniMap items={miniMapItems} view={view} canvasW={dims.w} canvasH={dims.h} />
      </div>
    </div>
  );
}
