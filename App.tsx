

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WalkingEnginePose, WalkingEnginePivotOffsets, WalkingEngineProportions, Vector2D, MaskTransform, JointMode } from './types';
import { ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT, RIGGING } from './constants'; 
import { Mannequin, getMannequinWorldTransformsHelper, partDefinitions } from './components/Mannequin';
import { SystemLogger } from './components/SystemLogger';

const T_POSE: WalkingEnginePivotOffsets = {
  waist: 0, neck: 0, collar: 0, torso: 0,
  l_shoulder: 0, r_shoulder: 0,
  l_elbow: 0, r_elbow: 0,
  l_hand: 0, r_hand: 0,
  l_hip: 180, r_hip: 180, // Legs pointing straight down
  l_knee: 0, r_knee: 0,
  l_foot: 0, r_foot: 0,
  l_toe: 0, r_toe: 0
};

// Define RESTING_BASE_POSE with all fields of WalkingEnginePose
const RESTING_BASE_POSE: WalkingEnginePose = {
  waist: 0, neck: 0, collar: 0, torso: 0,
  l_shoulder: 0, r_shoulder: 0,
  l_elbow: 0, r_elbow: 0,
  l_hand: 0, r_hand: 0,
  l_hip: 180, r_hip: 180, // Legs pointing straight down
  l_knee: 0, r_knee: 0,
  l_foot: 0, r_foot: 0,
  l_toe: 0, r_toe: 0,
  stride_phase: 0, // Default value for WalkingEnginePose
  y_offset: 0,     // Default value for WalkingEnginePose
  x_offset: 0,     // Default value for WalkingEnginePose
};

const INITIAL_CHALLENGE_POSE: WalkingEnginePivotOffsets = {
  waist: 0, torso: 0, collar: 0, neck: 0, // Reset these to 0 for a more "natural" starting point for challenges.
  l_shoulder: 0, l_elbow: 0, l_hand: 0,
  r_shoulder: 0, r_elbow: 0, r_hand: 0,
  l_hip: 180, l_knee: 0, l_foot: 0, l_toe: 0, // Legs start pointing down
  r_hip: 180, r_knee: 0, r_foot: 0, r_toe: 0
};

const DEFAULT_PROPORTIONS: WalkingEngineProportions = {
  head: { w: 1, h: 1 }, collar: { w: 1, h: 1 }, torso: { w: 1, h: 1 }, waist: { w: 1, h: 1 },
  l_upper_arm: { w: 1, h: 1 }, l_lower_arm: { w: 1, h: 1 }, l_hand: { w: 1, h: 1 },
  r_upper_arm: { w: 1, h: 1 }, r_lower_arm: { w: 1, h: 1 }, r_hand: { w: 1, h: 1 },
  l_upper_leg: { w: 1, h: 1 }, l_lower_leg: { w: 1, h: 1 }, l_foot: { w: 1, h: 1 }, l_toe: { w: 1, h: 1 },
  r_upper_leg: { w: 1, h: 1 }, r_lower_leg: { w: 1, h: 1 }, r_foot: { w: 1, h: 1 }, r_toe: { w: 1, h: 1 }
};

const PROP_KEYS: (keyof WalkingEngineProportions)[] = [
  'head', 'collar', 'torso', 'waist',
  'l_upper_arm', 'l_lower_arm', 'l_hand',
  'r_upper_arm', 'r_lower_arm', 'r_hand',
  'l_upper_leg', 'l_lower_leg', 'l_foot', 'l_toe',
  'r_upper_leg', 'r_lower_leg', 'r_foot', 'r_toe'
];

const JOINT_KEYS: (keyof WalkingEnginePivotOffsets)[] = [
  'waist', 'torso', 'collar', 'neck',
  'l_shoulder', 'l_elbow', 'l_hand',
  'r_shoulder', 'r_elbow', 'r_hand',
  'l_hip', 'l_knee', 'l_foot', 'l_toe',
  'r_hip', 'r_knee', 'r_foot', 'r_toe'
];

const CHAIN_DEPTH: Record<string, number> = {
  waist: 0, torso: 1, collar: 2, neck: 3, head: 4,
  l_shoulder: 3, r_shoulder: 3, l_elbow: 4, r_elbow: 4, l_hand: 5, r_hand: 5,
  l_hip: 1, r_hip: 1, l_knee: 2, r_knee: 2, l_foot: 3, r_foot: 3, l_toe: 4, r_toe: 4
};

const snapOutEase = (t: number) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

const EASING_FUNCTIONS = {
  linear: (t: number) => t,
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  snapOut: snapOutEase,
};

interface HistoryState {
  pivotOffsets: WalkingEnginePivotOffsets;
  props: WalkingEngineProportions;
  jointModes: Record<keyof WalkingEnginePivotOffsets, JointMode>;
  timestamp: number;
}

interface SavedPoseEntry {
  id: number;
  name: string;
  pivotOffsets: WalkingEnginePivotOffsets;
  props: WalkingEngineProportions;
  jointModes: Record<keyof WalkingEnginePivotOffsets, JointMode>;
}

type CanvasId = 'primary';

interface CanvasState {
  showPivots: boolean;
  showLabels: boolean;
  baseH: number;
  jointModes: Record<keyof WalkingEnginePivotOffsets, JointMode>;
  isReversed: boolean;
  pinningMode: 'none' | 'rightFoot' | 'dual';
  pinOffset: Vector2D;
  tweenDuration: number;
  tweenEasing: 'linear' | 'easeInOutQuad' | 'snapOut';
  isTweening: boolean;
  pivotOffsets: WalkingEnginePivotOffsets;
  props: WalkingEngineProportions;
  globalScale: number;
  globalBoneWidthMultiplier: number;
  globalLimbLengthMultiplier: number;
  mannequinOffsetY: number;
}

const createInitialCanvasState = (): CanvasState => ({
  showPivots: true,
  showLabels: false,
  baseH: 150,
  jointModes: Object.fromEntries(JOINT_KEYS.map(k => [k, 'standard'])) as any,
  isReversed: false,
  pinningMode: 'none',
  pinOffset: { x: 0, y: 0 },
  tweenDuration: 1000,
  tweenEasing: 'easeInOutQuad',
  isTweening: false,
  pivotOffsets: INITIAL_CHALLENGE_POSE,
  props: DEFAULT_PROPORTIONS,
  globalScale: 150,
  globalBoneWidthMultiplier: 1,
  globalLimbLengthMultiplier: 1,
  mannequinOffsetY: -50,
});

const rotateVec = (vec: Vector2D, angleDeg: number): Vector2D => {
  const r = angleDeg * Math.PI / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: vec.x * c - vec.y * s, y: vec.x * s + vec.y * c };
};
const addVec = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x + v2.x, y: v1.y + v2.y });

const App: React.FC = () => {
  const [activeCanvasId] = useState<CanvasId>('primary');
  const [canvasStates, setCanvasStates] = useState<Record<CanvasId, CanvasState>>({
    primary: createInitialCanvasState(),
  });
  const currentCanvas = canvasStates[activeCanvasId];
  const updateCanvas = useCallback((patch: Partial<CanvasState>) => {
    setCanvasStates(prev => ({
      ...prev,
      [activeCanvasId]: { ...prev[activeCanvasId], ...patch },
    }));
  }, [activeCanvasId]);
  const updateCanvasWith = useCallback((updater: (prev: CanvasState) => CanvasState) => {
    setCanvasStates(prev => ({
      ...prev,
      [activeCanvasId]: updater(prev[activeCanvasId]),
    }));
  }, [activeCanvasId]);

  const [isConsoleVisible, setIsConsoleVisible] = useState(false);
  const [activeControlTab, setActiveControlTab] = useState<'pose' | 'proportions' | 'library'>('pose');
  const [systemLogs, setSystemLogs] = useState<{ timestamp: string; message: string }[]>([]);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [lHandFlash, setLHandFlash] = useState(false);
  const [rHandFlash, setRHandFlash] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState(false);
  
  const anomalySize = useMemo(() => 15, []);

  const [lastPoppedKey, setLastPoppedKey] = useState<string | null>(null);

  const pinnedWorldPosRef = useRef<Vector2D | null>(null);

  const lastInteractionTimeRef = useRef(Date.now());
  const draggingBoneKeyRef = useRef<keyof WalkingEnginePivotOffsets | null>(null);

  const [savedPoses, setSavedPoses] = useState<SavedPoseEntry[]>([]);
  const [anomaly, setAnomaly] = useState<Vector2D | null>(null);
  const anomalyRef = useRef<Vector2D | null>(null);

  const [draggingBoneKey, setDraggingBoneKey] = useState<keyof WalkingEnginePivotOffsets | null>(null);
  
  const svgRef = useRef<SVGSVGElement>(null);
  const pivotOffsetsRef = useRef(currentCanvas.pivotOffsets);
  const propsRef = useRef(currentCanvas.props);
  const baseHRef = useRef(currentCanvas.baseH);
  const isReversedRef = useRef(currentCanvas.isReversed);
  const jointModesRef = useRef(currentCanvas.jointModes);
  const pinOffsetRef = useRef(currentCanvas.pinOffset);
  const pinningModeRef = useRef(currentCanvas.pinningMode);
  const mannequinOffsetYRef = useRef(currentCanvas.mannequinOffsetY);

  useEffect(() => { pivotOffsetsRef.current = currentCanvas.pivotOffsets; }, [currentCanvas.pivotOffsets]);
  useEffect(() => { propsRef.current = currentCanvas.props; }, [currentCanvas.props]);
  useEffect(() => { baseHRef.current = currentCanvas.baseH; }, [currentCanvas.baseH]);
  useEffect(() => { isReversedRef.current = currentCanvas.isReversed; }, [currentCanvas.isReversed]);
  useEffect(() => { jointModesRef.current = currentCanvas.jointModes; }, [currentCanvas.jointModes]);
  useEffect(() => { pinOffsetRef.current = currentCanvas.pinOffset; }, [currentCanvas.pinOffset]);
  useEffect(() => { pinningModeRef.current = currentCanvas.pinningMode; }, [currentCanvas.pinningMode]);
  useEffect(() => { mannequinOffsetYRef.current = currentCanvas.mannequinOffsetY; }, [currentCanvas.mannequinOffsetY]);

  const addLog = useCallback((message: string) => {
    setSystemLogs(prev => [...prev.slice(-49), { timestamp: new Date().toLocaleTimeString(), message }]);
  }, []);

  useEffect(() => {
    updateCanvas({ baseH: currentCanvas.globalScale });
  }, [currentCanvas.globalScale, updateCanvas]);

  useEffect(() => {
    updateCanvasWith(prev => {
      const newProps: WalkingEngineProportions = {} as WalkingEngineProportions;
      PROP_KEYS.forEach(key => {
        newProps[key] = {
          w: (DEFAULT_PROPORTIONS[key]?.w || 1) * prev.globalBoneWidthMultiplier,
          h: (DEFAULT_PROPORTIONS[key]?.h || 1) * prev.globalLimbLengthMultiplier,
        };
      });
      return { ...prev, props: newProps };
    });
  }, [currentCanvas.globalBoneWidthMultiplier, currentCanvas.globalLimbLengthMultiplier, updateCanvasWith]);

  useEffect(() => {
    try {
      const storedPoses = localStorage.getItem('bitruvian_library');
      if (storedPoses) {
        const parsed = JSON.parse(storedPoses);
        if (Array.isArray(parsed)) setSavedPoses(parsed);
      }
    } catch (e) { console.error("Error loading library", e); }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('bitruvian_library', JSON.stringify(savedPoses));
    } catch (e) { console.error("Error saving library", e); }
  }, [savedPoses]);

  const awardTokens = useCallback((sourceBone: string) => {
    const timeSinceLastInteraction = Date.now() - lastInteractionTimeRef.current;
    let passiveMultiplier = (timeSinceLastInteraction > 1500 || currentCanvas.isTweening) ? 2 : 1;
    let limbBonus = CHAIN_DEPTH[sourceBone] || 1;
    const gain = Math.floor(limbBonus * passiveMultiplier);
    setTokens(prev => prev + gain);
    addLog(`[SYSTEM]: POSE_PICKUP - UNIT TOKENS UPDATED (+${gain}) ${passiveMultiplier > 1 ? '[PASSIVE BONUS]' : ''} [${sourceBone.toUpperCase()} DEPTH: ${limbBonus}X]`);
  }, [addLog, currentCanvas.isTweening]);

  const spawnAnomaly = useCallback(() => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 150 + Math.random() * 350;
    const newAnom = { x: Math.cos(angle) * distance, y: -250 + Math.sin(angle) * distance };
    setAnomaly(newAnom);
    anomalyRef.current = newAnom;
  }, []);

  const calculateAnklePos = useCallback((currentPivotOffsets: WalkingEnginePivotOffsets, currentProps: WalkingEngineProportions) => {
    const getRot = (key: string) => ((currentPivotOffsets as any)[key] || 0);
    const getDim = (raw: number, key: keyof WalkingEngineProportions) => raw * currentCanvas.baseH * (currentProps[key]?.h || 1);
    const waistRot = getRot('waist');
    const hipRot = waistRot + getRot('r_hip'); 
    const thighLen = getDim(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_UPPER, 'r_upper_leg');
    const kneeRot = hipRot + getRot('r_knee');
    const kneePos = rotateVec({ x: 0, y: thighLen }, hipRot);
    const calfLen = getDim(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_LOWER, 'r_lower_leg');
    const anklePos = addVec(kneePos, rotateVec({ x: 0, y: calfLen }, kneeRot));
    return anklePos;
  }, [currentCanvas.baseH]);

  const togglePinning = useCallback(() => {
    setLastPoppedKey('pin-foot');
    setTimeout(() => setLastPoppedKey(null), 300);
    if (currentCanvas.pinningMode === 'none') {
      const local = calculateAnklePos(currentCanvas.pivotOffsets, currentCanvas.props);
      pinnedWorldPosRef.current = { x: local.x + currentCanvas.pinOffset.x, y: local.y - 50 + currentCanvas.pinOffset.y };
      updateCanvas({ pinningMode: 'rightFoot' });
      addLog(`[SYSTEM]: PINNING ENABLED - RIGHT ANKLE ANCHORED.`);
    } else {
      updateCanvas({ pinningMode: 'none' });
      pinnedWorldPosRef.current = null;
      updateCanvas({ pinOffset: { x: 0, y: 0 } });
      addLog(`[SYSTEM]: PINNING DISABLED.`);
    }
  }, [currentCanvas.pinningMode, currentCanvas.pivotOffsets, currentCanvas.props, currentCanvas.pinOffset, calculateAnklePos, addLog, updateCanvas]);

  const updatePinOffset = useCallback(() => {
    if (currentCanvas.pinningMode === 'none' || !pinnedWorldPosRef.current) return;
    const currentLocal = calculateAnklePos(currentCanvas.pivotOffsets, currentCanvas.props);
    const nextX = pinnedWorldPosRef.current.x - currentLocal.x;
    const nextY = pinnedWorldPosRef.current.y - currentLocal.y + 50;
    updateCanvas({ pinOffset: { x: nextX, y: nextY } });
  }, [currentCanvas.pinningMode, currentCanvas.pivotOffsets, currentCanvas.props, calculateAnklePos, updateCanvas]);

  useEffect(() => {
    if (currentCanvas.pinningMode !== 'none') updatePinOffset();
  }, [currentCanvas.pinningMode, currentCanvas.pivotOffsets, currentCanvas.props, updatePinOffset]);

  const handleAnchorMouseDown = useCallback((boneKey: keyof WalkingEnginePivotOffsets) => {
    setDraggingBoneKey(boneKey);
  }, []);

  const handleDrag = useCallback((e: MouseEvent) => {
    if (draggingBoneKey && !currentCanvas.isTweening && svgRef.current) {
      lastInteractionTimeRef.current = Date.now();
      
      const svg = svgRef.current;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgP = pt.matrixTransform(ctm.inverse());
      
      updateCanvasWith(prev => {
        const latestPivotOffsets = prev.pivotOffsets;
        let currentPinOffset = pinOffsetRef.current;
        if (pinningModeRef.current !== 'none' && pinnedWorldPosRef.current) {
          const currentLocal = calculateAnklePos(latestPivotOffsets, propsRef.current);
          currentPinOffset = {
            x: pinnedWorldPosRef.current.x - currentLocal.x,
            y: pinnedWorldPosRef.current.y - currentLocal.y + 50
          };
        }
        
        const localX = svgP.x - currentPinOffset.x;
        const localY = svgP.y - (mannequinOffsetYRef.current + currentPinOffset.y);
        
        const transforms = getMannequinWorldTransformsHelper(latestPivotOffsets, propsRef.current, baseHRef.current, isReversedRef.current, jointModesRef.current);
        
        const partEntry = Object.entries(partDefinitions).find(([_, def]) => def.boneKey === draggingBoneKey);
        if (!partEntry) return latestPivotOffsets;
        const [propKey, def] = partEntry;
        
        const jointTransform = transforms[propKey as keyof WalkingEngineProportions];
        if (!jointTransform) return latestPivotOffsets;
        
        const dx = localX - jointTransform.position.x;
        const dy = localY - jointTransform.position.y;
        
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return latestPivotOffsets;
        
        let targetGlobalRot = Math.atan2(dy, dx) * 180 / Math.PI;
        targetGlobalRot += def.drawsUpwards ? 90 : -90;
        
        const currentGlobalRot = jointTransform.rotation;
        const currentLocal = latestPivotOffsets[draggingBoneKey];
        const mode = jointModesRef.current[draggingBoneKey] || 'standard';
        const multiplier = mode === 'bend' ? 1.5 : (mode === 'stretch' ? 0.5 : 1);
        
        const parentRot = currentGlobalRot - currentLocal * multiplier;
        
        let newLocal = (targetGlobalRot - parentRot) / multiplier;
        
        while (newLocal > 180) newLocal -= 360;
        while (newLocal < -180) newLocal += 360;
        
        return { ...prev, pivotOffsets: { ...latestPivotOffsets, [draggingBoneKey]: newLocal } };
      });
      
      awardTokens(draggingBoneKey);
    }
  }, [draggingBoneKey, currentCanvas.isTweening, awardTokens, calculateAnklePos, updateCanvasWith]);

  useEffect(() => {
    const hu = () => { setDraggingBoneKey(null); draggingBoneKeyRef.current = null; };
    if (draggingBoneKey) {
      draggingBoneKeyRef.current = draggingBoneKey;
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', hu);
    }
    return () => { window.removeEventListener('mousemove', handleDrag); window.removeEventListener('mouseup', hu); };
  }, [draggingBoneKey, handleDrag]);

  const setJointMode = (key: keyof WalkingEnginePivotOffsets, mode: JointMode) => {
    setLastPoppedKey(`${key}-${mode}`);
    setTimeout(() => setLastPoppedKey(null), 300);
    const nextMode = currentCanvas.jointModes[key] === mode ? 'standard' : mode;
    updateCanvasWith(prev => ({ ...prev, jointModes: { ...prev.jointModes, [key]: nextMode } }));
    addLog(`[SYSTEM]: JOINT_MODE_UPDATE - ${key.toUpperCase()} SET TO ${nextMode.toUpperCase()}`);
  };

  const runTween = useCallback((target: SavedPoseEntry) => {
    if (currentCanvas.isTweening) return;
    updateCanvas({ isTweening: true });
    const startPivot = { ...currentCanvas.pivotOffsets };
    const startProps = { ...currentCanvas.props };
    const startJointModes = { ...currentCanvas.jointModes };
    let startTime: number | null = null;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / currentCanvas.tweenDuration, 1);
      const easedProgress = EASING_FUNCTIONS[currentCanvas.tweenEasing](progress);

      const nextPivot = { ...startPivot };
      JOINT_KEYS.forEach(key => {
        const startValue = startPivot[key];
        const endValue = target.pivotOffsets[key];
        nextPivot[key] = startValue + (endValue - startValue) * easedProgress;
      });

      const nextProps: WalkingEngineProportions = {} as WalkingEngineProportions;
      PROP_KEYS.forEach(key => {
        const startW = startProps[key]?.w || 1;
        const endW = target.props[key]?.w || 1;
        const startH = startProps[key]?.h || 1;
        const endH = target.props[key]?.h || 1;
        nextProps[key] = {
          w: startW + (endW - startW) * easedProgress,
          h: startH + (endH - startH) * easedProgress,
        };
      });

      updateCanvasWith(prev => ({
        ...prev,
        pivotOffsets: nextPivot,
        props: nextProps,
        jointModes: startJointModes,
      }));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        updateCanvasWith(prev => ({
          ...prev,
          isTweening: false,
          jointModes: target.jointModes,
          props: target.props,
        }));
        addLog(`[SYSTEM]: TWEEN_COMPLETE - POSE "${target.name.toUpperCase()}" LOADED.`);
      }
    };

    requestAnimationFrame(animate);
  }, [currentCanvas.isTweening, currentCanvas.pivotOffsets, currentCanvas.props, currentCanvas.jointModes, currentCanvas.tweenDuration, currentCanvas.tweenEasing, addLog, updateCanvas, updateCanvasWith]);

  const saveCurrentPose = useCallback(() => {
    const newEntry: SavedPoseEntry = {
      id: Date.now(),
      name: `Pose ${savedPoses.length + 1}`,
      pivotOffsets: { ...currentCanvas.pivotOffsets },
      props: { ...currentCanvas.props },
      jointModes: { ...currentCanvas.jointModes }
    };
    setSavedPoses(prev => [...prev, newEntry]);
    setSaveConfirmation(true);
    addLog(`[SYSTEM]: POSE_SAVED - ENTITY ID: ${newEntry.id}`);
    setTimeout(() => setSaveConfirmation(false), 2000);
  }, [savedPoses, currentCanvas.pivotOffsets, currentCanvas.props, currentCanvas.jointModes, addLog]);

  const getMannequinGlobalTransforms = useCallback((reversed: boolean) => {
    return getMannequinWorldTransformsHelper(currentCanvas.pivotOffsets, currentCanvas.props, currentCanvas.baseH, reversed, currentCanvas.jointModes);
  }, [currentCanvas.baseH, currentCanvas.props, currentCanvas.pivotOffsets, currentCanvas.jointModes]);

  useEffect(() => {
    const currentTransforms = getMannequinGlobalTransforms(currentCanvas.isReversed);
    const currentTorsoY = currentTransforms.torso?.position.y || 0;
    const targetTorsoY = -200;
    updateCanvas({ mannequinOffsetY: targetTorsoY - currentTorsoY });
  }, [currentCanvas.isReversed, getMannequinGlobalTransforms, updateCanvas]);

  return (
    <div className="flex h-full w-full bg-paper font-mono text-ink overflow-hidden select-none">
      {isConsoleVisible && (
        <div className="w-80 border-r border-ridge bg-mono-darker p-4 flex flex-col gap-4 custom-scrollbar overflow-y-auto z-50">
          <div className="flex justify-between items-center border-b border-ridge pb-2">
            <h1 className="text-xl font-archaic tracking-widest uppercase italic">Bitruvius.Core</h1>
          </div>
          
          <div className="flex flex-col gap-2">
            {!isCalibrated ? (
              <button onClick={() => setIsCalibrated(true)} className="text-[9px] px-3 py-2 border border-selection bg-selection text-paper font-bold uppercase hover:scale-[1.02] active:scale-[0.98] transition-transform btn-pop">INITIALIZE ENGINE</button>
            ) : (
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => {
                    setLastPoppedKey('t-pose');
                    setTimeout(() => setLastPoppedKey(null), 300);
                    runTween({ id: 0, name: 'T-POSE', pivotOffsets: T_POSE, props: DEFAULT_PROPORTIONS, jointModes: Object.fromEntries(JOINT_KEYS.map(k => [k, 'standard'])) as any });
                    updateCanvas({
                      globalScale: 150,
                      globalBoneWidthMultiplier: 1,
                      globalLimbLengthMultiplier: 1,
                    });
                  }} 
                  className={`text-[9px] px-3 py-2 border border-selection bg-selection text-paper font-bold uppercase transition-all hover:scale-[1.02] active:scale-[0.98] btn-pop ${lastPoppedKey === 't-pose' ? 'animate-pop' : ''}`}
                >
                  T-POSE
                </button>
                <div className="grid grid-cols-2 gap-2">
                    <button 
                    onClick={togglePinning} 
                    className={`text-[9px] px-3 py-2 border transition-all font-bold uppercase hover:scale-[1.05] active:scale-[0.95] ${lastPoppedKey === 'pin-foot' ? 'animate-pop' : ''} ${currentCanvas.pinningMode !== 'none' ? 'bg-accent-purple text-paper border-accent-purple shadow-lg scale-[1.05]' : 'bg-paper/10 border-ridge text-mono-light'}`}
                    >
                    {currentCanvas.pinningMode !== 'none' ? 'FOOT PINNED' : 'PIN FOOT'}
                    </button>
                    <button 
                    onClick={() => { 
                      setLastPoppedKey('reverse');
                      setTimeout(() => setLastPoppedKey(null), 300);
                      updateCanvas({ isReversed: !currentCanvas.isReversed }); 
                      addLog(`[SYSTEM]: HIERARCHY_REVERSED - ROOT SET TO ${!currentCanvas.isReversed ? 'HEAD' : 'WAIST'}`); 
                    }} 
                    className={`text-[9px] px-3 py-2 border transition-all font-bold uppercase hover:scale-[1.05] active:scale-[0.95] ${lastPoppedKey === 'reverse' ? 'animate-pop' : ''} ${currentCanvas.isReversed ? 'bg-accent-red text-paper border-accent-red shadow-lg scale-[1.05]' : 'bg-paper/10 border-ridge text-mono-light'}`}
                    >
                    {currentCanvas.isReversed ? 'REVERSED' : 'REVERSE'}
                    </button>
                </div>
                <button onClick={() => updateCanvas({ showPivots: !currentCanvas.showPivots })} className={`text-[9px] px-3 py-1 border transition-all ${currentCanvas.showPivots ? 'bg-selection text-paper' : 'border-ridge'}`}>ANCHORS: {currentCanvas.showPivots ? 'ON' : 'OFF'}</button>
              </div>
            )}
          </div>

          <div className="flex border-b border-ridge">
            {(['pose', 'proportions', 'library'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveControlTab(tab)} className={`flex-1 text-[9px] py-2 font-bold transition-all ${activeControlTab === tab ? 'text-selection border-b-2 border-selection bg-white/40' : 'opacity-40 hover:opacity-100'}`}>{tab.toUpperCase()}</button>
            ))}
          </div>

          <div className="flex-grow flex flex-col min-h-0">
            {activeControlTab === 'pose' && (
              <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar py-2 pr-1">
                {JOINT_KEYS.map(k => (
                  <div key={k} className="p-2 border border-ridge/20 rounded hover:bg-white/30 transition-colors">
                    <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold text-ink">{k.replace(/_/g, ' ')}</span>
                            <div className="flex gap-1">
                                {(['bend', 'stretch'] as JointMode[]).map(m => (
                                    <button 
                                        key={m} 
                                        onClick={() => setJointMode(k, m)}
                                        title={m.toUpperCase()}
                                        className={`w-5 h-5 flex items-center justify-center rounded-sm text-[8px] font-bold border transition-all hover:scale-110 active:scale-90 ${lastPoppedKey === `${k}-${m}` ? 'animate-pop' : ''} ${currentCanvas.jointModes[k] === m ? 'bg-selection text-paper border-selection shadow-md translate-y-[-1px]' : 'border-ridge text-mono-mid opacity-40 hover:opacity-100'}`}
                                    >
                                        {m === 'bend' ? 'B' : '2'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <span className="text-[8px] font-mono text-mono-mid tabular-nums">{Math.round(currentCanvas.pivotOffsets[k])}°</span>
                    </div>
                    <input type="range" min="-180" max="180" value={currentCanvas.pivotOffsets[k]} onChange={e => !currentCanvas.isTweening && updateCanvasWith(prev => ({ ...prev, pivotOffsets: { ...prev.pivotOffsets, [k]: parseInt(e.target.value) } }))} className="w-full accent-selection h-1 cursor-ew-resize" />
                  </div>
                ))}
              </div>
            )}
            {activeControlTab === 'proportions' && (
                <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar py-2 pr-1">
                    <div className="p-2 border border-ridge/20 rounded">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] uppercase font-bold text-ink">Global Scale</span>
                            <span className="text-[8px] font-mono text-mono-mid tabular-nums">{Math.round(currentCanvas.globalScale)}</span>
                        </div>
                        <input type="range" min="50" max="250" value={currentCanvas.globalScale} onChange={e => updateCanvas({ globalScale: parseInt(e.target.value) })} className="w-full accent-selection h-1 cursor-ew-resize" />
                    </div>
                    <div className="p-2 border border-ridge/20 rounded">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] uppercase font-bold text-ink">Limb Width</span>
                            <span className="text-[8px] font-mono text-mono-mid tabular-nums">{(currentCanvas.globalBoneWidthMultiplier).toFixed(2)}x</span>
                        </div>
                        <input type="range" min="0.5" max="2" step="0.05" value={currentCanvas.globalBoneWidthMultiplier} onChange={e => updateCanvas({ globalBoneWidthMultiplier: parseFloat(e.target.value) })} className="w-full accent-selection h-1 cursor-ew-resize" />
                    </div>
                    <div className="p-2 border border-ridge/20 rounded">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] uppercase font-bold text-ink">Limb Length</span>
                            <span className="text-[8px] font-mono text-mono-mid tabular-nums">{(currentCanvas.globalLimbLengthMultiplier).toFixed(2)}x</span>
                        </div>
                        <input type="range" min="0.5" max="2" step="0.05" value={currentCanvas.globalLimbLengthMultiplier} onChange={e => updateCanvas({ globalLimbLengthMultiplier: parseFloat(e.target.value) })} className="w-full accent-selection h-1 cursor-ew-resize" />
                    </div>
                </div>
            )}
            {activeControlTab === 'library' && (
              <div className="flex flex-col h-full gap-2">
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {savedPoses.map(pe => (
                    <div key={pe.id} className="flex items-center justify-between p-2 border-b border-ridge hover:bg-white/40 group transition-colors">
                      <span className="text-[10px] uppercase font-bold">{pe.name}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { updateCanvasWith(prev => ({ ...prev, pivotOffsets: { ...pe.pivotOffsets }, jointModes: { ...pe.jointModes } })); }} className="text-[8px] px-2 py-1 bg-selection text-paper uppercase hover:scale-105 active:scale-95 transition-transform">Load</button>
                        <button onClick={() => runTween(pe)} className="text-[8px] px-2 py-1 bg-mono-mid text-paper uppercase hover:scale-105 active:scale-95 transition-transform">Tween</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={saveCurrentPose} 
                  className={`w-full py-3 text-[10px] font-bold uppercase transition-all hover:scale-[1.02] active:scale-[0.98] ${saveConfirmation ? 'bg-accent-green text-paper scale-[1.02] shadow-lg' : 'bg-selection text-paper shadow-md'}`}
                >
                  {saveConfirmation ? '✓ SAVED' : 'SAVE POSE'}
                </button>
              </div>
            )}
          </div>

          <div className="mt-auto pt-4"><SystemLogger logs={systemLogs} isVisible={true} historyCount={tokens} /></div>
        </div>
      )}

      <div className="flex-1 relative bg-paper flex items-center justify-center overflow-hidden" onClick={() => !isCalibrated && setIsCalibrated(true)}>
        <div className="absolute top-4 right-4 z-50 text-right">
          <div className="text-[10px] text-mono-mid uppercase tracking-widest">Unit Tokens</div>
          <div className="text-2xl font-archaic text-ink">{tokens.toLocaleString()}</div>
        </div>

        <button onClick={() => setIsConsoleVisible(!isConsoleVisible)} className="absolute top-4 left-4 z-50 p-2 border border-ridge bg-white rounded-full transition-all hover:scale-110 active:scale-95 shadow-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg></button>

        {!isCalibrated && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center pointer-events-none bg-paper/20">
            <h2 className="text-6xl font-archaic uppercase tracking-tighter text-ink">Bitruvian Station</h2>
            <p className="text-[10px] uppercase tracking-[0.5em] animate-pulse text-mono-mid">Touch to Wake Core</p>
          </div>
        )}
        
        <svg ref={svgRef} viewBox="-500 -700 1000 1400" className="w-full h-full overflow-visible relative z-10 drop-shadow-2xl">
          <g transform={`translate(${currentCanvas.pinOffset.x}, ${currentCanvas.mannequinOffsetY + currentCanvas.pinOffset.y})`}>
            <Mannequin 
              pose={RESTING_BASE_POSE} 
              pivotOffsets={{...currentCanvas.pivotOffsets, l_hand_flash: lHandFlash, r_hand_flash: rHandFlash} as any} 
              props={currentCanvas.props} 
              showPivots={currentCanvas.showPivots && isCalibrated} 
              showLabels={currentCanvas.showLabels} 
              baseUnitH={currentCanvas.baseH} 
              onAnchorMouseDown={(k) => handleAnchorMouseDown(k)} 
              draggingBoneKey={draggingBoneKey} 
              isPaused={true} 
              pinningMode={currentCanvas.pinningMode} 
              offset={currentCanvas.pinOffset} 
              isReversed={currentCanvas.isReversed}
              jointModes={currentCanvas.jointModes}
            />
          </g>
          {anomaly && (
            <g transform={`translate(${anomaly.x}, ${anomaly.y})`}>
              <rect x={-anomalySize / 2} y={-anomalySize / 2} width={anomalySize} height={anomalySize} className="fill-ink hover:fill-accent-red cursor-crosshair transition-all hover:scale-150 active:scale-90" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};

export default App;
