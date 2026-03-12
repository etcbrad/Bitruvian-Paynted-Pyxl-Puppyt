import { Point, Rect } from '../types';

export interface ExtractResult {
  url: string;
  rect: Rect;
  width: number;
  height: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function extractPolygon(
  sourceUrl: string,
  polygon: Point[],
): Promise<ExtractResult> {
  const img = await loadImage(sourceUrl);
  const { naturalWidth: w, naturalHeight: h } = img;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(img, 0, 0);

  const minX = Math.max(0, Math.floor(Math.min(...polygon.map(p => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...polygon.map(p => p.y))));
  const maxX = Math.min(w, Math.ceil(Math.max(...polygon.map(p => p.x))));
  const maxY = Math.min(h, Math.ceil(Math.max(...polygon.map(p => p.y))));
  const bw = maxX - minX;
  const bh = maxY - minY;

  const out = document.createElement('canvas');
  out.width = bw;
  out.height = bh;
  const ctx = out.getContext('2d')!;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(polygon[0].x - minX, polygon[0].y - minY);
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(polygon[i].x - minX, polygon[i].y - minY);
  }
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(srcCanvas, -minX, -minY);
  ctx.restore();

  return {
    url: out.toDataURL('image/png'),
    rect: { x: minX, y: minY, width: bw, height: bh },
    width: bw,
    height: bh,
  };
}

export async function extractRect(
  sourceUrl: string,
  rect: Rect,
): Promise<ExtractResult> {
  const img = await loadImage(sourceUrl);
  const out = document.createElement('canvas');
  out.width = rect.width;
  out.height = rect.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return { url: out.toDataURL('image/png'), rect, width: rect.width, height: rect.height };
}

export async function sliceWithLine(
  sourceUrl: string,
  imgWidth: number,
  imgHeight: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Promise<{ sideA: ExtractResult; sideB: ExtractResult }> {
  const lineExtended = extendLine(x1, y1, x2, y2, imgWidth, imgHeight);

  const topPoly = buildSidePolygon(lineExtended.px1, lineExtended.py1, lineExtended.px2, lineExtended.py2, imgWidth, imgHeight, true);
  const botPoly = buildSidePolygon(lineExtended.px1, lineExtended.py1, lineExtended.px2, lineExtended.py2, imgWidth, imgHeight, false);

  const [sideA, sideB] = await Promise.all([
    extractPolygon(sourceUrl, topPoly),
    extractPolygon(sourceUrl, botPoly),
  ]);

  return { sideA, sideB };
}

function extendLine(x1: number, y1: number, x2: number, y2: number, w: number, h: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const factor = Math.max(w, h) * 2;
  const nx = (dx / len) * factor;
  const ny = (dy / len) * factor;
  return { px1: x1 - nx, py1: y1 - ny, px2: x2 + nx, py2: y2 + ny };
}

function buildSidePolygon(px1: number, py1: number, px2: number, py2: number, w: number, h: number, topSide: boolean): Point[] {
  const dx = px2 - px1;
  const dy = py2 - py1;

  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];

  const side = corners.filter(c => {
    const cross = (c.x - px1) * dy - (c.y - py1) * dx;
    return topSide ? cross <= 0 : cross >= 0;
  });

  const line1: Point = { x: px1, y: py1 };
  const line2: Point = { x: px2, y: py2 };
  return [...side, line2, line1];
}

export function getImageData(imgEl: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = imgEl.naturalWidth;
  canvas.height = imgEl.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(imgEl, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
