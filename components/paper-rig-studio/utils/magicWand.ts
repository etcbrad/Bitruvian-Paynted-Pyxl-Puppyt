import { Point } from '../types';

function colorDist(r1: number, g1: number, b1: number, a1: number, r2: number, g2: number, b2: number, a2: number): number {
  if (a1 < 10 && a2 < 10) return 0;
  if (a1 < 10 || a2 < 10) return 255;
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

export function magicWand(imageData: ImageData, startX: number, startY: number, tolerance: number): Point[] | null {
  const { width, height, data } = imageData;
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return null;
  const startIdx = (startY * width + startX) * 4;
  const sr = data[startIdx], sg = data[startIdx + 1], sb = data[startIdx + 2], sa = data[startIdx + 3];
  const visited = new Uint8Array(width * height);
  const filled = new Uint8Array(width * height);
  const queue: number[] = [startY * width + startX];
  visited[startY * width + startX] = 1;
  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % width;
    const y = Math.floor(idx / width);
    const pi = idx * 4;
    if (colorDist(data[pi], data[pi + 1], data[pi + 2], data[pi + 3], sr, sg, sb, sa) <= tolerance) {
      filled[idx] = 1;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const ni = ny * width + nx;
          if (!visited[ni]) { visited[ni] = 1; queue.push(ni); }
        }
      }
    }
  }
  const boundary = traceBoundary(filled, width, height);
  if (!boundary || boundary.length < 3) return null;
  return simplify(boundary, 2.5);
}

function traceBoundary(filled: Uint8Array, width: number, height: number): Point[] | null {
  let sx = -1, sy = -1;
  outer: for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (filled[y * width + x]) { sx = x; sy = y; break outer; }
  }
  if (sx === -1) return null;
  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const boundary: Point[] = [{ x: sx, y: sy }];
  let Bx = sx, By = sy, cx = sx - 1, cy = sy;
  let limit = width * height * 2;
  while (limit-- > 0) {
    let sd = 0;
    for (let d = 0; d < 8; d++) {
      if (Bx + dirs[d][0] === cx && By + dirs[d][1] === cy) { sd = d; break; }
    }
    let found = false, nx = 0, ny = 0, pnx = cx, pny = cy;
    for (let i = 0; i < 8; i++) {
      const d = (sd + 1 + i) % 8;
      const tx = Bx + dirs[d][0], ty = By + dirs[d][1];
      if (tx >= 0 && tx < width && ty >= 0 && ty < height && filled[ty * width + tx]) {
        nx = tx; ny = ty; found = true; break;
      }
      pnx = tx; pny = ty;
    }
    if (!found) break;
    if (nx === sx && ny === sy) break;
    boundary.push({ x: nx, y: ny });
    Bx = nx; By = ny; cx = pnx; cy = pny;
  }
  return boundary;
}

function simplify(points: Point[], eps: number): Point[] {
  if (points.length < 3) return points;
  const dist = (p: Point, a: Point, b: Point) => {
    const num = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x);
    const den = Math.sqrt((b.y - a.y) ** 2 + (b.x - a.x) ** 2);
    return den === 0 ? 0 : num / den;
  };
  let dmax = 0, idx = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = dist(points[i], points[0], points[end]);
    if (d > dmax) { idx = i; dmax = d; }
  }
  if (dmax > eps) {
    const r1 = simplify(points.slice(0, idx + 1), eps);
    const r2 = simplify(points.slice(idx), eps);
    return r1.slice(0, -1).concat(r2);
  }
  return [points[0], points[end]];
}
