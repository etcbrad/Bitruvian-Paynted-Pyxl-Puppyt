import { useCallback } from 'react';
import type Konva from 'konva';
import type { MutableRefObject } from 'react';
import { ViewState, useStudio } from '../store';

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const ZOOM_SPEED = 0.001;
const DEFAULT_VIEW: ViewState = { x: 0, y: 0, scale: 1 };

export function useCanvasView(mode: string, stageRef: MutableRefObject<Konva.Stage | null>) {
  const view = useStudio(s => s.views[mode] ?? DEFAULT_VIEW);
  const setView = useStudio(s => s.setView);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const factor = 1 + direction * Math.abs(e.evt.deltaY) * ZOOM_SPEED * 30;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * factor));

    const newX = pointer.x - mousePointTo.x * newScale;
    const newY = pointer.y - mousePointTo.y * newScale;

    setView(mode, { x: newX, y: newY, scale: newScale });
  }, [mode, setView, stageRef]);

  const handleDragEnd = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    setView(mode, { x: stage.x(), y: stage.y(), scale: stage.scaleX() });
  }, [mode, setView, stageRef]);

  const fitToContent = useCallback((
    items: Array<{ x: number; y: number; width: number; height: number }>,
    canvasW: number,
    canvasH: number,
    padding = 60,
  ) => {
    if (!items.length) return;
    const minX = Math.min(...items.map(i => i.x));
    const minY = Math.min(...items.map(i => i.y));
    const maxX = Math.max(...items.map(i => i.x + i.width));
    const maxY = Math.max(...items.map(i => i.y + i.height));
    const boundsW = maxX - minX || 200;
    const boundsH = maxY - minY || 200;

    const scaleX = (canvasW - padding * 2) / boundsW;
    const scaleY = (canvasH - padding * 2) / boundsH;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(scaleX, scaleY)));

    const x = canvasW / 2 - (minX + boundsW / 2) * scale;
    const y = canvasH / 2 - (minY + boundsH / 2) * scale;

    setView(mode, { x, y, scale });
  }, [mode, setView]);

  const recenter = useCallback((canvasW: number, canvasH: number) => {
    setView(mode, { x: canvasW / 2, y: canvasH / 2, scale: 1 });
  }, [mode, setView]);

  const zoomIn = useCallback(() => {
    const current = stageRef.current?.scaleX() ?? view.scale;
    setView(mode, { ...view, scale: Math.min(MAX_SCALE, current * 1.25) });
  }, [mode, setView, view, stageRef]);

  const zoomOut = useCallback(() => {
    const current = stageRef.current?.scaleX() ?? view.scale;
    setView(mode, { ...view, scale: Math.max(MIN_SCALE, current / 1.25) });
  }, [mode, setView, view, stageRef]);

  return { view, handleWheel, handleDragEnd, fitToContent, recenter, zoomIn, zoomOut };
}
