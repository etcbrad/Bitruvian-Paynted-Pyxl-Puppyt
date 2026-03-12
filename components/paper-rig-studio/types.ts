export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhysicsProps {
  stiffness: number;
  tension: number;
  volumePreservation: boolean;
  shadowEnabled: boolean;
}

export interface BodyPart {
  id: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  pivot: Point;
  ballPoint: Point;
  parentId: string | null;
  canvasX: number;
  canvasY: number;
  zIndex: number;
  physics: PhysicsProps;
}

export interface Connection {
  parentId: string;
  childId: string;
}

export interface PoseEntry {
  rotation: number;
  x: number;
  y: number;
}

export interface PoseState {
  [partId: string]: PoseEntry;
}

export type AppMode = 'upload' | 'slice' | 'rig' | 'pose';

export type SliceTool = 'line' | 'wand' | 'draw';
