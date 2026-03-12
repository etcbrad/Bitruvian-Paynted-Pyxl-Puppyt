import { Point } from '../types';

export function getImageData(imgEl: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = imgEl.naturalWidth;
  canvas.height = imgEl.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(imgEl, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function colorDistance(r1: number, g1: number, b1: number, a1: number, r2: number, g2: number, b2: number, a2: number): number {
  if (a1 < 10 && a2 < 10) return 0;
  if (a1 < 10 || a2 < 10) return 255;
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

export function magicWand(imageData: ImageData, startX: number, startY: number, tolerance: number): Point[] | null {
  const { width, height, data } = imageData;

  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return null;

  const startIdx = (startY * width + startX) * 4;
  const sr = data[startIdx];
  const sg = data[startIdx + 1];
  const sb = data[startIdx + 2];
  const sa = data[startIdx + 3];

  const visited = new Uint8Array(width * height);
  const filled = new Uint8Array(width * height);

  const queue: number[] = [startY * width + startX];
  visited[startY * width + startX] = 1;

  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % width;
    const y = Math.floor(idx / width);

    const pixIdx = idx * 4;
    const dist = colorDistance(data[pixIdx], data[pixIdx + 1], data[pixIdx + 2], data[pixIdx + 3], sr, sg, sb, sa);

    if (dist <= tolerance) {
      filled[idx] = 1;
      const neighbors = [
        { nx: x - 1, ny: y }, { nx: x + 1, ny: y },
        { nx: x, ny: y - 1 }, { nx: x, ny: y + 1 },
      ];
      for (const { nx, ny } of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (!visited[nIdx]) {
            visited[nIdx] = 1;
            queue.push(nIdx);
          }
        }
      }
    }
  }

  const boundary = traceBoundary(filled, width, height);
  if (!boundary || boundary.length < 3) return null;
  return simplifyPolygon(boundary, 2.0);
}

function traceBoundary(filled: Uint8Array, width: number, height: number): Point[] | null {
  let startX = -1, startY = -1;
  outer:
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (filled[y * width + x]) { startX = x; startY = y; break outer; }
    }
  }
  if (startX === -1) return null;

  const boundary: Point[] = [{ x: startX, y: startY }];
  let Bx = startX, By = startY;
  let cx = startX - 1, cy = startY;

  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];

  let maxIter = width * height * 2;

  while (maxIter-- > 0) {
    let startDir = 0;
    for (let d = 0; d < 8; d++) {
      if (Bx + dirs[d][0] === cx && By + dirs[d][1] === cy) {
        startDir = d;
        break;
      }
    }

    let found = false;
    let nx = 0, ny = 0;
    let prev_nx = cx, prev_ny = cy;

    for (let i = 0; i < 8; i++) {
      const d = (startDir + 1 + i) % 8;
      const testX = Bx + dirs[d][0];
      const testY = By + dirs[d][1];
      if (testX >= 0 && testX < width && testY >= 0 && testY < height && filled[testY * width + testX]) {
        nx = testX; ny = testY;
        found = true;
        break;
      }
      prev_nx = testX; prev_ny = testY;
    }

    if (!found) break;
    if (nx === startX && ny === startY) break;

    boundary.push({ x: nx, y: ny });
    Bx = nx; By = ny;
    cx = prev_nx; cy = prev_ny;
  }

  return boundary;
}

function simplifyPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;

  const findPerpendicularDistance = (p: Point, p1: Point, p2: Point) => {
    const num = Math.abs((p2.y - p1.y) * p.x - (p2.x - p1.x) * p.y + p2.x * p1.y - p2.y * p1.x);
    const den = Math.sqrt((p2.y - p1.y) ** 2 + (p2.x - p1.x) ** 2);
    return den === 0 ? 0 : num / den;
  };

  let dmax = 0, index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = findPerpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) { index = i; dmax = d; }
  }

  if (dmax > epsilon) {
    const r1 = simplifyPolygon(points.slice(0, index + 1), epsilon);
    const r2 = simplifyPolygon(points.slice(index), epsilon);
    return r1.slice(0, r1.length - 1).concat(r2);
  }
  return [points[0], points[end]];
}
