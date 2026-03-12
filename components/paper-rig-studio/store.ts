import { create } from 'zustand';
import { BodyPart, PoseState, AppMode } from './types';

export interface ViewState {
  x: number;
  y: number;
  scale: number;
}

const DEFAULT_VIEW: ViewState = { x: 0, y: 0, scale: 1 };

interface StudioState {
  mode: AppMode;
  cutoutSheet: string | null;
  backdrop: string | null;
  parts: BodyPart[];
  pose: PoseState;
  views: Record<string, ViewState>;

  setMode: (mode: AppMode) => void;
  setCutoutSheet: (url: string | null) => void;
  setBackdrop: (url: string | null) => void;
  setParts: (parts: BodyPart[]) => void;
  updatePart: (id: string, updates: Partial<BodyPart>) => void;
  addPart: (part: BodyPart) => void;
  removePart: (id: string) => void;
  setPose: (pose: PoseState) => void;
  updatePoseEntry: (partId: string, entry: Partial<{ rotation: number; x: number; y: number }>) => void;
  connectParts: (childId: string, parentId: string) => void;
  disconnectPart: (childId: string) => void;
  setView: (mode: string, view: ViewState) => void;
  resetView: (mode: string) => void;
}

export const useStudio = create<StudioState>((set) => ({
  mode: 'upload',
  cutoutSheet: null,
  backdrop: null,
  parts: [],
  pose: {},
  views: {},

  setMode: (mode) => set({ mode }),
  setCutoutSheet: (cutoutSheet) => set({ cutoutSheet }),
  setBackdrop: (backdrop) => set({ backdrop }),
  setParts: (parts) => set({ parts }),

  updatePart: (id, updates) =>
    set(s => ({ parts: s.parts.map(p => p.id === id ? { ...p, ...updates } : p) })),

  addPart: (part) =>
    set(s => ({ parts: [...s.parts, part] })),

  removePart: (id) =>
    set(s => ({ parts: s.parts.filter(p => p.id !== id) })),

  setPose: (pose) => set({ pose }),

  updatePoseEntry: (partId, entry) =>
    set(s => ({
      pose: { ...s.pose, [partId]: { ...(s.pose[partId] || { rotation: 0, x: 0, y: 0 }), ...entry } }
    })),

  connectParts: (childId, parentId) =>
    set(s => ({ parts: s.parts.map(p => p.id === childId ? { ...p, parentId } : p) })),

  disconnectPart: (childId) =>
    set(s => ({ parts: s.parts.map(p => p.id === childId ? { ...p, parentId: null } : p) })),

  setView: (mode, view) =>
    set(s => ({ views: { ...s.views, [mode]: view } })),

  resetView: (mode) =>
    set(s => ({ views: { ...s.views, [mode]: DEFAULT_VIEW } })),
}));
