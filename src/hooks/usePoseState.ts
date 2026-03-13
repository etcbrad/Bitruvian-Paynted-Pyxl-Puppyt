import { useState, useRef, useCallback } from 'react';
import { Pose } from '../types';

export const usePoseState = (initialPose: Pose) => {
  const [activePose, setActivePose] = useState<Pose>(initialPose);
  const [ghostPose, setGhostPose] = useState<Pose>(initialPose);
  const undoStack = useRef<Pose[]>([]);
  const redoStack = useRef<Pose[]>([]);

  const updatePose = useCallback((newPose: Pose) => {
    setActivePose(prev => {
      undoStack.current.push({ ...prev });
      redoStack.current = [];
      return newPose;
    });
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length > 0) {
      redoStack.current.push({ ...activePose });
      const previousPose = undoStack.current.pop()!;
      setActivePose(previousPose);
    }
  }, [activePose]);

  const redo = useCallback(() => {
    if (redoStack.current.length > 0) {
      undoStack.current.push({ ...activePose });
      const nextPose = redoStack.current.pop()!;
      setActivePose(nextPose);
    }
  }, [activePose]);

  const resetPose = useCallback(() => {
    updatePose(initialPose);
    setGhostPose(initialPose);
  }, [initialPose, updatePose]);

  return {
    activePose,
    ghostPose,
    setActivePose,
    setGhostPose,
    updatePose,
    undo,
    redo,
    resetPose,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0
  };
};
