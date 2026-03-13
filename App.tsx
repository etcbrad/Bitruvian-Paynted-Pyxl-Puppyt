
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Pose, PartName, PartSelection, PartVisibility, AnchorName, partNameToPoseKey, JointConstraint, RenderMode, Vector2D, ViewMode, AnimationState, AnimationKeyframe, SavedPose, KinematicMode, BodyPartMaskLayer } from './types';
import { RESET_POSE, FLOOR_HEIGHT, JOINT_LIMITS, ANATOMY, GROUND_STRIP_HEIGHT } from './constants'; 
import { getJointPositions, getShortestAngleDiffDeg, interpolatePoses, solveIK, solveAdvancedIK } from './utils/kinematics';
import { Scanlines, SystemGuides } from './components/SystemGrid';
import { Mannequin, getPartCategory, getPartCategoryDisplayName } from './components/Mannequin'; 
import { COLORS_BY_CATEGORY, COLORS } from './components/Bone';
import { poseToString, stringToPose } from './utils/pose-parser';
import { RotationWheelControl } from './components/RotationWheelControl';
import { POSE_LIBRARY_DB } from './pose-library-db';

const App: React.FC = () => {
  const [activePose, setActivePose] = useState<Pose>(RESET_POSE);
  const [ghostPose, setGhostPose] = useState<Pose>(RESET_POSE);
  const isDragging = useRef(false);
  const undoStack = useRef<Pose[]>([]);
  const redoStack = useRef<Pose[]>([]); 
  redoStack.current = []; // Clear redo stack on mount


  const [activeTab, setActiveTab] = useState<'model' | 'animation' | 'puppyt'>('model');
  const [poseA, setPoseA] = useState<Pose | null>(null);
  const [poseB, setPoseB] = useState<Pose | null>(null);
  const [tweenValue, setTweenValue] = useState(0); // 0 to 100

  const capturePoseA = () => setPoseA({ ...activePose });
  const capturePoseB = () => setPoseB({ ...activePose });

  useEffect(() => {
    if (poseA && poseB) {
      const t = tweenValue / 100;
      const interpolated = interpolatePoses(poseA, poseB, t);
      setActivePose(interpolated);
      setGhostPose(interpolated);
    }
  }, [tweenValue, poseA, poseB]);

  const [viewMode, setViewMode] = useState<ViewMode>('default');
  const [activePins, setActivePins] = useState<AnchorName[]>([PartName.Waist]); 
  const [pinnedState, setPinnedState] = useState<Record<string, Vector2D>>({});
  const [renderMode, setRenderMode] = useState<RenderMode>('default');

  const [selectedParts, setSelectedParts] = useState<PartSelection>(() => {
    const initialSelection: PartSelection = Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: false }), {} as PartSelection);
    initialSelection[PartName.Waist] = true; 
    return initialSelection;
  });

  const [visibility] = useState<PartVisibility>(() => Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: true }), {} as PartVisibility));

  const [jointModes, setJointModes] = useState<Record<PartName, JointConstraint>>(() => 
    Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: 'fk' }), {} as Record<PartName, JointConstraint>)
  );

  const [workflowStep, setWorkflowStep] = useState<'upload' | 'slice' | 'rig' | 'pose'>('pose');
  const [masksEnabled, setMasksEnabled] = useState(true);
  const [hideBonesWithMasks, setHideBonesWithMasks] = useState(false);
  const [torsoUnitEnabled, setTorsoUnitEnabled] = useState(true);
  const [torsoUnitAngle, setTorsoUnitAngle] = useState(0);

  const DEFAULT_MASK_LAYER: BodyPartMaskLayer = {
    src: null,
    width: 0,
    height: 0,
    opacity: 1,
    scale: 1,
    baseScale: 1,
    rotationDeg: 0,
    offsetX: 0,
    offsetY: 0,
    layerOrder: 'front',
  };

  const [maskLayers, setMaskLayers] = useState<Record<PartName, BodyPartMaskLayer>>(() =>
    Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: { ...DEFAULT_MASK_LAYER } }), {} as Record<PartName, BodyPartMaskLayer>)
  );

  const maskUploadInputRef = useRef<HTMLInputElement>(null);
  const cutoutUploadInputRef = useRef<HTMLInputElement>(null);
  const [cutoutSheet, setCutoutSheet] = useState<{ src: string; width: number; height: number } | null>(null);
  const [cutoutOpacity, setCutoutOpacity] = useState(0.45);
  const [cutoutScale, setCutoutScale] = useState(1);
  const [cutoutOffset, setCutoutOffset] = useState({ x: 0, y: 0 });

  // Animation State
  const [animation, setAnimation] = useState<AnimationState>({
    keyframes: [],
    isPlaying: false,
    currentFrameIndex: 0,
    loop: true,
  });

  const [kinematicMode, setKinematicMode] = useState<KinematicMode>('fk');
  const [isPoweredOn, setIsPoweredOn] = useState(true);

  const animationTimer = useRef<NodeJS.Timeout | null>(null);

  // --- Animation Logic ---
  const addKeyframe = useCallback(() => {
    const newKeyframe: AnimationKeyframe = {
      id: Math.random().toString(36).substr(2, 9),
      pose: { ...activePose },
      duration: 1000,
    };
    setAnimation(prev => ({
      ...prev,
      keyframes: [...prev.keyframes, newKeyframe],
    }));
  }, [activePose]);

  const removeKeyframe = useCallback((id: string) => {
    setAnimation(prev => ({
      ...prev,
      keyframes: prev.keyframes.filter(k => k.id !== id),
    }));
  }, []);

  const playAnimation = useCallback(() => {
    if (animation.keyframes.length < 2) return;
    setAnimation(prev => ({ ...prev, isPlaying: true, currentFrameIndex: 0 }));
  }, [animation.keyframes.length]);

  const stopAnimation = useCallback(() => {
    setAnimation(prev => ({ ...prev, isPlaying: false }));
    if (animationTimer.current) clearInterval(animationTimer.current);
  }, []);

  useEffect(() => {
    if (animation.isPlaying && animation.keyframes.length >= 2) {
      const currentK = animation.keyframes[animation.currentFrameIndex];
      const nextIndex = (animation.currentFrameIndex + 1) % animation.keyframes.length;
      const nextK = animation.keyframes[nextIndex];

      if (nextIndex === 0 && !animation.loop) {
        stopAnimation();
        return;
      }

      let startTime = Date.now();
      const duration = nextK.duration;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        
        // Exponential decay / smooth interpolation
        const easedT = 1 - Math.pow(1 - t, 3); 
        
        const interpolated = interpolatePoses(currentK.pose, nextK.pose, easedT);
        setActivePose(interpolated);

        if (t < 1) {
          animationTimer.current = setTimeout(animate, 16);
        } else {
          setAnimation(prev => ({ ...prev, currentFrameIndex: nextIndex }));
        }
      };

      animate();
    }
    return () => {
      if (animationTimer.current) clearTimeout(animationTimer.current);
    };
  }, [animation.isPlaying, animation.currentFrameIndex, animation.keyframes, animation.loop, stopAnimation]);

  // --- IK Interaction Logic ---
  const handleIKMove = useCallback((pinName: AnchorName, targetPos: Vector2D) => {
    if (pinName === 'root' || pinName === PartName.Waist) return;

    // Determine which limb we are dragging
    let limb: 'rArm' | 'lArm' | 'rLeg' | 'lLeg' | null = null;
    if (pinName === PartName.RWrist || pinName === 'rHandTip') limb = 'rArm';
    else if (pinName === PartName.LWrist || pinName === 'lHandTip') limb = 'lArm';
    else if (pinName === PartName.RAnkle || pinName === 'rFootTip') limb = 'rLeg';
    else if (pinName === PartName.LAnkle || pinName === 'lFootTip') limb = 'lLeg';

    if (limb) {
      let solvedPose: Pose;
      if (kinematicMode === 'ik') {
        solvedPose = solveIK(ghostPose, limb, targetPos);
      } else {
        solvedPose = solveAdvancedIK(ghostPose, limb, targetPos, jointModes, activePins);
      }
      setGhostPose(solvedPose);
    }
  }, [ghostPose, jointModes, activePins, kinematicMode]);

  const [userPoses, setUserPoses] = useState<SavedPose[]>(() => {
    const saved = localStorage.getItem('bitruvius-saved-poses');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('bitruvius-saved-poses', JSON.stringify(userPoses));
  }, [userPoses]);

  const saveCurrentPose = (name: string) => {
    const newPose: SavedPose = {
      id: `UP-${Date.now()}`,
      name: name || `Pose ${userPoses.length + 1}`,
      data: poseToString(activePose),
      timestamp: Date.now(),
    };
    setUserPoses(prev => [newPose, ...prev]);
  };

  const deleteSavedPose = (id: string) => {
    setUserPoses(prev => prev.filter(p => p.id !== id));
  };

  const [isAdjusting, setIsAdjusting] = useState(false);
  const [rotatingPart, setRotatingPart] = useState<PartName | null>(null);
  const rotationStartInfo = useRef<{ 
    startAngle: number; 
    startRotationValue: number; 
    pointerX: number; 
    pointerY: number;
    initialPinnedPos: Vector2D | null;
  } | null>(null);

  const [isEffectorDragging, setIsEffectorDragging] = useState(false);
  const [effectorPart, setEffectorPart] = useState<PartName | null>(null);
  const [isIKDragging, setIsIKDragging] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null); 
  const [isCraneActive] = useState(false);
  const [isCraneDragging, setIsCraneDragging] = useState(false);
  const dragStartInfo = useRef<{ startX: number; startY: number; startRootX: number; startRootY: number } | null>(dragStartInfoInitial());
  const dragStartPose = useRef<Pose | null>(null);

  function dragStartInfoInitial() {
    return { startX: 0, startY: 0, startRootX: 0, startRootY: 0 };
  }

  const [showSplash, setShowSplash] = useState(true);
  const [isAirMode] = useState(false);

  const [windowSize, setWindowSize] = useState({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  });

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'joint-control': true,
    'pin-options': false,
    'display-modes': false,
    'cutout-maker': true,
    'animation-engine': false,
    'ab-engine': true,
    'saved-poses': true,
    'system-monitor': false,
    'hotkey-commands': false,
    'system-roadmap': false,
    'pose-export': false,
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const primarySelectedPart = useMemo(() => {
    return (Object.entries(selectedParts).find(([p, sel]) => sel)?.[0]) as PartName | undefined;
  }, [selectedParts]);

  const isTorsoUnitPart = useMemo(() => {
    return Boolean(primarySelectedPart && [PartName.Waist, PartName.Torso, PartName.Collar].includes(primarySelectedPart));
  }, [primarySelectedPart]);

  // Dynamically calculate viewBox based on viewMode and windowSize
  const autoViewBox = useMemo(() => {
    const configs = {
      zoomed: { x: -900, y: 1950, w: 1800, h: 1550 },
      default: { x: -1112.5, y: 1287.5, w: 2225, h: 2212.5 },
      lotte: { x: -1325, y: 625, w: 2650, h: 2875 },
      wide: { x: -1750, y: -700, w: 3500, h: 4200 },
    };

    if (viewMode === 'mobile') {
      const screenAspectRatio = windowSize.innerWidth / windowSize.innerHeight;

      const mannequinIntrinsicHeight = (
        ANATOMY.HEAD +
        ANATOMY.HEAD_NECK_GAP_OFFSET +
        ANATOMY.COLLAR +
        ANATOMY.TORSO +
        ANATOMY.WAIST +
        ANATOMY.LEG_UPPER +
        ANATOMY.LEG_LOWER +
        ANATOMY.FOOT
      );

      const verticalPaddingRatio = 0.20;
      const contentHeightInSVGUnits = mannequinIntrinsicHeight * (1 + verticalPaddingRatio);

      const viewBoxHeight = contentHeightInSVGUnits;
      const viewBoxWidth = viewBoxHeight * screenAspectRatio;

      const groundPlaneBuffer = GROUND_STRIP_HEIGHT * 1.5;
      const desiredViewBoxBottom = FLOOR_HEIGHT + groundPlaneBuffer;
      const viewBoxY = desiredViewBoxBottom - viewBoxHeight;
      const viewBoxX = -viewBoxWidth / 2;

      return `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`;

    } else {
      const c = configs[viewMode];
      return `${c.x} ${c.y} ${c.w} ${c.h}`;
    }
  }, [viewMode, windowSize.innerWidth, windowSize.innerHeight]);

  // --- Physics Validation Logic ---
  const isValidMove = useCallback((
    potentialPose: Pose,
    originalPose: Pose,
    activePins: AnchorName[],
    pinnedState: Record<string, Vector2D>,
    isCraneDragging: boolean,
    isEffectorDragging: boolean,
    partBeingRotated: PartName | null,
    isAirMode: boolean,
  ): boolean => {
    if (isAirMode) return true;

    const potentialJoints = getJointPositions(potentialPose, activePins);
    
    // 1. Check Pin Immovability (Softened by Elasticity)
    // In Bitruvius 0.2, pins are elastic, but we still have a "Hard Stop" threshold
    const HARD_STOP_THRESHOLD = 300; // Maximum stretch before hard stop

    for (const pinName of activePins) {
      const targetPos = pinnedState[pinName];
      const currentPos = potentialJoints[pinName as keyof typeof potentialJoints];
      
      if (targetPos && currentPos && !isCraneDragging) {
        const dx = currentPos.x - targetPos.x;
        const dy = currentPos.y - targetPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > HARD_STOP_THRESHOLD) {
          return false;
        }
      }
    }

    // 2. Check Ground Collision
    const isFootRelatedPart = (part: PartName | null) =>
      part === PartName.LAnkle || part === PartName.RAnkle || part === PartName.LSkin || part === PartName.RSkin; 

    const relevantToGrounding = isCraneDragging || isEffectorDragging || isFootRelatedPart(partBeingRotated);
    
    if (relevantToGrounding) {
      const lFootTipY = potentialJoints.lFootTip?.y || -Infinity;
      const rFootTipY = potentialJoints.rFootTip?.y || -Infinity;
      const lowestFootTipY = Math.max(lFootTipY, rFootTipY);

      const GROUND_COLLISION_THRESHOLD = 2;
      if (lowestFootTipY > FLOOR_HEIGHT + GROUND_COLLISION_THRESHOLD) {
          return false;
      }
    }

    return true;
  }, [isAirMode]); 

  const validateAndApplyPoseUpdate = useCallback((
      proposedUpdates: Partial<Pose>,
      partBeingDirectlyManipulated: PartName | null,
      isEffectorDrag: boolean,
  ) => {
      let normalizedUpdates = proposedUpdates;
      if (torsoUnitEnabled) {
        const torsoUpdate =
          typeof proposedUpdates.waist === 'number'
            ? proposedUpdates.waist
            : typeof proposedUpdates.torso === 'number'
              ? proposedUpdates.torso
              : typeof proposedUpdates.collar === 'number'
                ? proposedUpdates.collar
                : null;
        if (torsoUpdate !== null) {
          normalizedUpdates = {
            ...proposedUpdates,
            waist: torsoUpdate,
            torso: torsoUpdate,
            collar: torsoUpdate,
          };
          setTorsoUnitAngle(torsoUpdate);
        }
      }
      setGhostPose(prev => {
          let tentativeNextPose: Pose = { ...prev, ...normalizedUpdates };

          if (!isValidMove(
              tentativeNextPose,
              prev,
              activePins,
              pinnedState,
              isCraneDragging, 
              isEffectorDrag,
              partBeingDirectlyManipulated,
              isAirMode,
          )) {
              return prev;
          }

          return tentativeNextPose;
      });
  }, [activePins, pinnedState, isAirMode, isCraneDragging, isValidMove, torsoUnitEnabled]);

  // Exponential Decay Smoothing (Bitruvius 0.1 requirement)
  useEffect(() => {
    if (!isPoweredOn) return;
    
    let rafId: number;
    const smooth = () => {
      setActivePose(current => {
        // If not dragging, we can either snap or continue smoothing
        // The "5-frame snap" logic is handled in handleMouseUp
        const smoothingFactor = isDragging.current ? 0.3 : 0.15;
        return interpolatePoses(current, ghostPose, smoothingFactor);
      });
      rafId = requestAnimationFrame(smooth);
    };
    
    rafId = requestAnimationFrame(smooth);
    return () => cancelAnimationFrame(rafId);
  }, [ghostPose, isPoweredOn]);

  useEffect(() => {
    if (!torsoUnitEnabled) return;
    const baseAngle = activePose.torso || 0;
    setTorsoUnitAngle(baseAngle);
    setGhostPose(prev => ({ ...prev, waist: baseAngle, torso: baseAngle, collar: baseAngle }));
  }, [torsoUnitEnabled]);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length > 0) {
      const prev = activePose;
      redoStack.current.push(prev); 
      const nextPose = undoStack.current.pop()!;
      setGhostPose(nextPose);
      setActivePose(nextPose);
    }
  }, [activePose]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length > 0) {
      const prev = activePose;
      undoStack.current.push(prev);
      const nextPose = redoStack.current.pop()!;
      setGhostPose(nextPose);
      setActivePose(nextPose);
    }
  }, [activePose]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!svgRef.current) return;
    const svgPoint = svgRef.current.createSVGPoint();
    svgPoint.x = e.clientX; svgPoint.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const transformedPoint = svgPoint.matrixTransform(ctm.inverse());

    if (isCraneDragging && dragStartInfo.current) {
      const dx = transformedPoint.x - dragStartInfo.current.startX;
      const dy = transformedPoint.y - dragStartInfo.current.startY;
      
      const newRootX = dragStartInfo.current.startRootX + dx;
      const newRootY = dragStartInfo.current.startRootY + dy;

      validateAndApplyPoseUpdate({ root: { x: newRootX, y: newRootY } }, null, false);
      
    } else if (isAdjusting && rotatingPart && rotationStartInfo.current) {
      const joints = getJointPositions(ghostPose, activePins);
      const pivot = joints[rotatingPart]; 
      if (!pivot) return;
      
      const currentAngleDeg = Math.atan2(transformedPoint.y - pivot.y, transformedPoint.x - pivot.x) * 180 / Math.PI;
      const startAngleDeg = rotationStartInfo.current.startAngle; 
      
      const angleDeltaDeg = getShortestAngleDiffDeg(currentAngleDeg, startAngleDeg);
      
      let newRotationValue = rotationStartInfo.current.startRotationValue + angleDeltaDeg;
      const partKey = partNameToPoseKey[rotatingPart];
      const limits = JOINT_LIMITS[partKey];

      if (limits) {
        newRotationValue = Math.max(limits.min, Math.min(limits.max, newRotationValue));
      }

      validateAndApplyPoseUpdate({ [partKey]: newRotationValue }, rotatingPart, false);

    } else if (isIKDragging && effectorPart) {
      handleIKMove(effectorPart, transformedPoint);
    }
  }, [isAdjusting, rotatingPart, isCraneDragging, isIKDragging, effectorPart, ghostPose, validateAndApplyPoseUpdate, activePins, handleIKMove]);

  const updatePinnedState = useCallback((pins: AnchorName[]) => {
    const joints = getJointPositions(activePose, pins);
    const newState: Record<string, Vector2D> = {};
    pins.forEach(p => {
      newState[p] = joints[p];
    });
    setPinnedState(newState);
  }, [activePose]);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      // 5-frame snap (Bitruvius 0.1 requirement)
      // We snap activePose to ghostPose immediately on release
      setActivePose(ghostPose);
      
      // Save to undo stack on release
      if (dragStartPose.current) {
        undoStack.current.push(dragStartPose.current);
        redoStack.current.length = 0;
      }
    }

    isDragging.current = false;
    setIsAdjusting(false);
    setRotatingPart(null);
    setIsCraneDragging(false);
    setEffectorPart(null); 
    setIsEffectorDragging(false); 
    setIsIKDragging(false);
    rotationStartInfo.current = null;
    dragStartInfo.current = dragStartInfoInitial(); 
  }, [ghostPose, activePose]);

  const handleDoubleClickOnPart = useCallback((part: PartName, e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    setJointModes(prev => {
      const currentMode = prev[part];
      let nextMode: JointConstraint;
      if (currentMode === 'fk') {
        nextMode = 'stretch';
      } else if (currentMode === 'stretch') {
        nextMode = 'curl';
      } else if (currentMode === 'curl') {
        nextMode = 'stretch';
      } else {
        nextMode = 'fk';
      }
      return { ...prev, [part]: nextMode };
    });
  }, []);

  useEffect(() => {
    updatePinnedState(activePins);
  }, [activePins]); // Sync pinnedState when activePins change

  const handleMouseDownOnPart = useCallback((part: PartName, e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    if (!svgRef.current) return;

    isDragging.current = true;
    dragStartPose.current = activePose;
    setSelectedParts(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => next[k as PartName] = k === part);
      return next;
    });

    const joints = getJointPositions(activePose, activePins);
    const pivot = joints[part]; 
    if (!pivot) return;

    // If part is pinned OR global IK is active OR joint mode is 'stretch', use IK instead of rotation
    const isLimbPart = [PartName.RWrist, PartName.LWrist, PartName.RAnkle, PartName.LAnkle].includes(part);
    const isStretchMode = jointModes[part] === 'stretch';
    
    if (activePins.includes(part) || (kinematicMode !== 'fk' && isLimbPart) || (isStretchMode && isLimbPart)) {
      setIsIKDragging(true);
      setEffectorPart(part);
    } else {
      const svgPoint = svgRef.current.createSVGPoint();
      svgPoint.x = e.clientX; svgPoint.y = e.clientY;
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) return;
      const transformedPoint = svgPoint.matrixTransform(ctm.inverse());

      setIsAdjusting(true);
      setRotatingPart(part);
      rotationStartInfo.current = {
        startAngle: Math.atan2(transformedPoint.y - pivot.y, transformedPoint.x - pivot.x) * 180 / Math.PI,
        startRotationValue: (activePose as any)[partNameToPoseKey[part]] || 0,
        pointerX: transformedPoint.x, pointerY: transformedPoint.y, initialPinnedPos: null // Not used in Bitruvius 0.2
      };
    }
  }, [activePose, activePins, kinematicMode, jointModes]);

  const cycleKinematicMode = useCallback(() => {
    setKinematicMode(prev => {
      if (prev === 'fk') return 'ik';
      if (prev === 'ik') return 'fabrik';
      return 'fk';
    });
  }, []);
  const cycleRenderMode = useCallback(() => {
    setRenderMode(prev => {
      if (prev === 'default') return 'wireframe';
      if (prev === 'wireframe') return 'silhouette';
      if (prev === 'silhouette') return 'backlight';
      if (prev === 'backlight') return 'default';
      return 'default';
    });
  }, []);

  const cycleViewMode = useCallback(() => {
    setViewMode(prev => {
      if (prev === 'default') return 'lotte';
      if (prev === 'lotte') return 'wide';
      if (prev === 'wide') return 'mobile';
      if (prev === 'mobile') return 'zoomed';
      if (prev === 'zoomed') return 'default';
      return 'default';
    });
  }, []);

  // Handler for toggling the minimized state of the settings panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'v') cycleViewMode();
      if (e.key === 'p') {
        setActivePins(prev => {
          const cycle = [PartName.Waist, PartName.LAnkle, 'lFootTip', PartName.RAnkle, 'rFootTip', 'root'];
          const currentPrimary = prev[0] || PartName.Waist;
          const currentIndex = cycle.indexOf(currentPrimary);
          const nextPrimary = cycle[(currentIndex + 1) % cycle.length] as AnchorName;
          
          if (e.shiftKey) {
            if (prev.includes(nextPrimary)) {
              return prev.filter(p => p !== nextPrimary);
            } else {
              return [...prev, nextPrimary];
            }
          } else {
            return [nextPrimary];
          }
        });
      }
      if (e.key === 'r') cycleRenderMode();
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleUndo();
      }
      if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleRedo();
      }
    };

    const handleResize = () => {
      setWindowSize({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [handleMouseMove, handleMouseUp, handleUndo, handleRedo, cycleRenderMode, cycleViewMode]);

  const getPinName = (pins: AnchorName[]) => {
    if (pins.length === 0) return 'NONE';
    return pins.map(p => {
      if (p === PartName.Waist) return 'HIPS';
      if (p === PartName.LAnkle) return 'L-ANKLE';
      if (p === 'lFootTip') return 'L-FOOT';
      if (p === PartName.RAnkle) return 'R-ANKLE';
      if (p === 'rFootTip') return 'R-FOOT';
      if (p === 'root') return 'ROOT';
      return p.toUpperCase();
    }).join(' + ');
  };

  const getKineticModeDisplayName = (mode: JointConstraint) => {
    switch (mode) {
      case 'fk': return 'STANDARD (No Effects)';
      case 'stretch': return 'STRETCH (PULLS PARENT)';
      case 'curl': return 'CURL (PULLS CHILD)';
      default: return 'UNKNOWN';
    }
  };

  const getKineticModeDisplayColorClass = (mode: JointConstraint) => {
    switch (mode) {
      case 'stretch': return 'text-accent-purple';
      case 'curl': return 'text-accent-green';
      case 'fk': return 'text-focus-ring';
      default: return 'text-white/70';
    }
  };

  const getRenderModeDisplayName = (mode: RenderMode) => {
    switch (mode) {
      case 'default': return 'STANDARD (Solid)';
      case 'wireframe': return 'WIREFRAME (Outline)';
      case 'silhouette': return 'MONOCHROME (Black Fill)';
      case 'backlight': return 'X-RAY (Transparent)';
      default: return 'UNKNOWN';
    }
  };


  const handlePartRotationWheelChange = useCallback((newValue: number) => {
    if (!primarySelectedPart) return;
    const partKey = partNameToPoseKey[primarySelectedPart];
    
    validateAndApplyPoseUpdate({ [partKey]: newValue }, primarySelectedPart, false);
  }, [primarySelectedPart, validateAndApplyPoseUpdate]);

  const handleBodyRotationWheelChange = useCallback((newValue: number) => {
    validateAndApplyPoseUpdate({ bodyRotation: newValue }, null, false);
  }, [validateAndApplyPoseUpdate]);

  const getBoneLengthForPart = useCallback((part: PartName): number => {
    switch (part) {
      case PartName.Waist: return ANATOMY.WAIST;
      case PartName.Torso: return ANATOMY.TORSO;
      case PartName.Collar: return ANATOMY.COLLAR;
      case PartName.Head: return ANATOMY.HEAD;
      case PartName.RShoulder:
      case PartName.LShoulder: return ANATOMY.UPPER_ARM;
      case PartName.RElbow:
      case PartName.LElbow: return ANATOMY.LOWER_ARM;
      case PartName.RWrist:
      case PartName.LWrist: return ANATOMY.HAND;
      case PartName.RThigh:
      case PartName.LThigh: return ANATOMY.LEG_UPPER;
      case PartName.RSkin:
      case PartName.LSkin: return ANATOMY.LEG_LOWER;
      case PartName.RAnkle:
      case PartName.LAnkle: return ANATOMY.FOOT;
      default: return ANATOMY.TORSO;
    }
  }, []);

  const handleTorsoUnitChange = useCallback((newValue: number) => {
    setTorsoUnitAngle(newValue);
    validateAndApplyPoseUpdate({ waist: newValue, torso: newValue, collar: newValue }, PartName.Torso, false);
  }, [validateAndApplyPoseUpdate]);

  const updateMaskLayer = useCallback((part: PartName, patch: Partial<BodyPartMaskLayer>) => {
    setMaskLayers(prev => ({ ...prev, [part]: { ...prev[part], ...patch } }));
  }, []);

  const handleMaskUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !primarySelectedPart) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const boneLength = getBoneLengthForPart(primarySelectedPart);
        const dominantSize = Math.max(img.width, img.height);
        const baseScale = dominantSize > 0 ? boneLength / dominantSize : 1;
        updateMaskLayer(primarySelectedPart, {
          src,
          width: img.width,
          height: img.height,
          baseScale,
          scale: baseScale,
        });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [primarySelectedPart, updateMaskLayer, getBoneLengthForPart]);

  const handleCutoutUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        setCutoutSheet({ src, width: img.width, height: img.height });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  

  return (
    <div className={`w-full h-full bg-mono-darker shadow-2xl flex flex-col relative touch-none fixed inset-0 z-50 overflow-hidden text-ink font-mono ${!isPoweredOn ? 'grayscale brightness-50' : ''}`}>
      <div className="flex h-full w-full">
        <aside
          className="w-72 flex flex-col overflow-hidden z-20 flex-shrink-0 border-r border-white/10"
          style={{ background: 'rgba(13,17,23,0.88)', backdropFilter: 'blur(12px)' }}
        >
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[8px] text-white/40 uppercase">System_Status</span>
                <div className="flex items-center gap-2 mt-1 bg-black/40 px-2 py-1 border border-white/10 rounded">
                  <div className={`w-1.5 h-1.5 rounded-full ${isPoweredOn ? 'bg-accent-green animate-pulse' : 'bg-accent-red'}`} />
                  <span className="text-[9px] font-bold text-white/70 tracking-widest">
                    {isPoweredOn ? 'ACTIVE' : 'STANDBY'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={cycleKinematicMode}
                  className={`px-2 py-1 rounded border text-[9px] font-bold transition-all ${
                    kinematicMode !== 'fk'
                      ? 'bg-accent-purple/30 border-accent-purple text-white'
                      : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
                  }`}
                  aria-label={`Kinematic Mode: ${kinematicMode.toUpperCase()}`}
                >
                  {kinematicMode.toUpperCase()}
                </button>
                <button
                  onClick={() => setIsPoweredOn(!isPoweredOn)}
                  className={`p-2 rounded border transition-all ${
                    isPoweredOn
                      ? 'bg-accent-green/30 border-accent-green text-accent-green'
                      : 'bg-accent-red/30 border-accent-red text-accent-red opacity-50'
                  }`}
                  aria-label={isPoweredOn ? "System Shutdown" : "System Activation"}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              </div>
            </div>

          </div>

          {/* Section: Cutout Maker */}
          <div className="flex flex-col gap-1 w-full text-left border-b border-white/10 pb-2 mb-2">
            <button
              onClick={() => toggleSection('cutout-maker')}
              className="flex items-center justify-between w-full text-focus-ring font-bold uppercase tracking-wide hover:text-white transition-colors"
            >
              <span>CUTOUT MAKER</span>
              <span className="text-[10px] opacity-50">{expandedSections['cutout-maker'] ? '▼' : '▶'}</span>
            </button>

            {expandedSections['cutout-maker'] && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMasksEnabled(prev => !prev)}
                    className={`flex-1 text-[9px] px-2 py-1 border uppercase ${
                      masksEnabled ? 'bg-accent-green/20 border-accent-green/40 text-accent-green' : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    Masks {masksEnabled ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => setHideBonesWithMasks(prev => !prev)}
                    disabled={!masksEnabled}
                    className={`flex-1 text-[9px] px-2 py-1 border uppercase ${
                      !masksEnabled
                        ? 'bg-white/5 border-transparent text-white/30 cursor-not-allowed'
                        : hideBonesWithMasks
                          ? 'bg-selection/30 border-selection text-selection'
                          : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    Bones {hideBonesWithMasks ? 'Hidden' : 'Visible'}
                  </button>
                </div>

                <div className="bg-white/5 p-2 rounded border border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] uppercase text-white/70 font-bold">
                      {primarySelectedPart ? getPartCategoryDisplayName(primarySelectedPart) : 'Select Joint'}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => maskUploadInputRef.current?.click()}
                        disabled={!primarySelectedPart}
                        className={`text-[9px] px-2 py-1 border ${
                          primarySelectedPart ? 'bg-white/10 border-white/20 text-white/70' : 'bg-white/5 border-transparent text-white/30 cursor-not-allowed'
                        }`}
                      >
                        Upload
                      </button>
                      <button
                        onClick={() => primarySelectedPart && updateMaskLayer(primarySelectedPart, { src: null })}
                        disabled={!primarySelectedPart}
                        className={`text-[9px] px-2 py-1 border ${
                          primarySelectedPart ? 'bg-accent-red/20 border-accent-red/40 text-accent-red' : 'bg-white/5 border-transparent text-white/30 cursor-not-allowed'
                        }`}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <input ref={maskUploadInputRef} type="file" accept="image/*" onChange={handleMaskUpload} className="hidden" />

                  {primarySelectedPart && maskLayers[primarySelectedPart]?.src && (
                    <div className="mt-2 space-y-2">
                      {maskLayers[primarySelectedPart].baseScale > 0 && (
                        <div className="text-[8px] text-white/40 uppercase">
                          Auto Fit: {maskLayers[primarySelectedPart].baseScale.toFixed(2)}x
                        </div>
                      )}
                      <div className="flex justify-between text-[8px] text-white/40">
                        <span>Opacity</span>
                        <span>{Math.round(maskLayers[primarySelectedPart].opacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(maskLayers[primarySelectedPart].opacity * 100)}
                        onChange={e => updateMaskLayer(primarySelectedPart, { opacity: Number(e.target.value) / 100 })}
                        className="w-full accent-selection"
                      />

                      <div className="flex justify-between text-[8px] text-white/40">
                        <span>Scale</span>
                        <span>{maskLayers[primarySelectedPart].scale.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min={Math.round(((maskLayers[primarySelectedPart].baseScale || 1) * 0.2) * 100)}
                        max={Math.round(((maskLayers[primarySelectedPart].baseScale || 1) * 3.5) * 100)}
                        value={Math.round(maskLayers[primarySelectedPart].scale * 100)}
                        onChange={e => updateMaskLayer(primarySelectedPart, { scale: Number(e.target.value) / 100 })}
                        className="w-full accent-selection"
                      />

                      <div className="flex justify-between text-[8px] text-white/40">
                        <span>Rotation</span>
                        <span>{Math.round(maskLayers[primarySelectedPart].rotationDeg)}°</span>
                      </div>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        value={Math.round(maskLayers[primarySelectedPart].rotationDeg)}
                        onChange={e => updateMaskLayer(primarySelectedPart, { rotationDeg: Number(e.target.value) })}
                        className="w-full accent-selection"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="flex justify-between text-[8px] text-white/40"><span>Offset X</span><span>{Math.round(maskLayers[primarySelectedPart].offsetX)}</span></div>
                          <input
                            type="range"
                            min={-200}
                            max={200}
                            value={Math.round(maskLayers[primarySelectedPart].offsetX)}
                            onChange={e => updateMaskLayer(primarySelectedPart, { offsetX: Number(e.target.value) })}
                            className="w-full accent-selection"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[8px] text-white/40"><span>Offset Y</span><span>{Math.round(maskLayers[primarySelectedPart].offsetY)}</span></div>
                          <input
                            type="range"
                            min={-200}
                            max={200}
                            value={Math.round(maskLayers[primarySelectedPart].offsetY)}
                            onChange={e => updateMaskLayer(primarySelectedPart, { offsetY: Number(e.target.value) })}
                            className="w-full accent-selection"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tab Bar */}
          <div className="flex border-b border-white/20 mb-4 px-4 pt-3">
            <button 
              onClick={() => setActiveTab('model')}
              className={`flex-1 py-1 text-[9px] font-bold tracking-widest transition-all ${activeTab === 'model' ? 'text-focus-ring border-b-2 border-focus-ring' : 'text-white/40 hover:text-white/70'}`}
            >
              MODEL
            </button>
            <button 
              onClick={() => setActiveTab('animation')}
              className={`flex-1 py-1 text-[9px] font-bold tracking-widest transition-all ${activeTab === 'animation' ? 'text-focus-ring border-b-2 border-focus-ring' : 'text-white/40 hover:text-white/70'}`}
            >
              ANIMATION
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
          {activeTab === 'model' ? (
            <>
              {/* Workflow: Upload */}
              {workflowStep === 'upload' && (
                <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] uppercase font-bold text-white/70">Upload Cutout Sheet</span>
                    <button
                      onClick={() => cutoutUploadInputRef.current?.click()}
                      className="text-[9px] px-2 py-1 border border-white/20 bg-white/10 hover:bg-white/20 uppercase"
                    >
                      Upload
                    </button>
                  </div>
                  <input ref={cutoutUploadInputRef} type="file" accept="image/*" onChange={handleCutoutUpload} className="hidden" />
                  {cutoutSheet && (
                    <div className="mt-2 space-y-2">
                      <div className="flex justify-between text-[8px] text-white/50">
                        <span>Opacity</span>
                        <span>{Math.round(cutoutOpacity * 100)}%</span>
                      </div>
                      <input type="range" min={0} max={100} value={Math.round(cutoutOpacity * 100)} onChange={e => setCutoutOpacity(Number(e.target.value) / 100)} className="w-full accent-selection" />
                      <div className="flex justify-between text-[8px] text-white/50">
                        <span>Scale</span>
                        <span>{cutoutScale.toFixed(2)}x</span>
                      </div>
                      <input type="range" min={50} max={200} value={Math.round(cutoutScale * 100)} onChange={e => setCutoutScale(Number(e.target.value) / 100)} className="w-full accent-selection" />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="flex justify-between text-[8px] text-white/50"><span>Offset X</span><span>{Math.round(cutoutOffset.x)}</span></div>
                          <input type="range" min={-500} max={500} value={Math.round(cutoutOffset.x)} onChange={e => setCutoutOffset(prev => ({ ...prev, x: Number(e.target.value) }))} className="w-full accent-selection" />
                        </div>
                        <div>
                          <div className="flex justify-between text-[8px] text-white/50"><span>Offset Y</span><span>{Math.round(cutoutOffset.y)}</span></div>
                          <input type="range" min={-500} max={500} value={Math.round(cutoutOffset.y)} onChange={e => setCutoutOffset(prev => ({ ...prev, y: Number(e.target.value) }))} className="w-full accent-selection" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Workflow: Slice (Conceptual) */}
              {workflowStep === 'slice' && (
                <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                  <div className="text-[9px] uppercase font-bold text-white/70">Slice (Lightweight)</div>
                  <p className="text-[8px] text-white/40 mt-1">
                    Use joint masks below to assign cutout pieces. This keeps the flow light while aligning to the rig.
                  </p>
                </div>
              )}

              {/* Workflow: Rig */}
              {workflowStep === 'rig' && (
                <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                  <div className="text-[9px] uppercase font-bold text-white/70">Rig Alignment</div>
                  <p className="text-[8px] text-white/40 mt-1">
                    Select a joint on the mannequin, upload its cutout, then fine‑tune scale and offsets.
                  </p>
                </div>
              )}

              {/* Torso Unit */}
              <div className="flex flex-col gap-2 w-full text-left border-b border-white/10 pb-2 mb-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase font-bold text-white/70">Torso Unit</span>
                  <button
                    onClick={() => setTorsoUnitEnabled(prev => !prev)}
                    className={`text-[8px] px-2 py-1 border uppercase ${
                      torsoUnitEnabled ? 'bg-accent-green/20 border-accent-green/40 text-accent-green' : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    {torsoUnitEnabled ? 'Rigid' : 'Independent'}
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[8px] text-white/40">
                    <span>Master Angle</span>
                    <span>{Math.round(torsoUnitAngle)}°</span>
                  </div>
                  <input
                    type="range"
                    min={JOINT_LIMITS.torso?.min ?? -180}
                    max={JOINT_LIMITS.torso?.max ?? 180}
                    value={torsoUnitAngle}
                    onChange={e => handleTorsoUnitChange(Number(e.target.value))}
                    className="w-full accent-selection"
                  />
                </div>
              </div>

              {/* Section: Joint Control */}
              <div className="flex flex-col gap-1 w-full text-left border-b border-white/10 pb-2 mb-2">
            <button 
              onClick={() => toggleSection('joint-control')}
              className="flex items-center justify-between w-full text-focus-ring font-bold uppercase tracking-wide hover:text-white transition-colors"
            >
              <span>JOINT CONTROL</span>
              <span className="text-[10px] opacity-50">{expandedSections['joint-control'] ? '▼' : '▶'}</span>
            </button>
            
            {expandedSections['joint-control'] && (
              <div className="mt-2 flex flex-col gap-1">
                <div className="bg-white/5 p-2 rounded border border-white/10 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: primarySelectedPart ? COLORS_BY_CATEGORY[getPartCategory(primarySelectedPart)] : '#9CA3AF' }}></span>
                    <span className="text-white/70 text-[9px] uppercase font-bold">
                      {primarySelectedPart ? getPartCategoryDisplayName(primarySelectedPart) : 'NO JOINT SELECTED'}
                    </span>
                    {primarySelectedPart && <span className="text-accent-red animate-pulse text-[8px]">ACTIVE</span>}
                  </div>
                  <div className="flex flex-col gap-1 border-t border-white/10 pt-2 items-center">
                    <span className="text-white/40 uppercase text-[8px]">Joint_Rotation_Angle</span>
                    <RotationWheelControl
                      value={
                        primarySelectedPart
                          ? (torsoUnitEnabled && isTorsoUnitPart ? torsoUnitAngle : (activePose[partNameToPoseKey[primarySelectedPart]] || 0))
                          : 0
                      }
                      min={primarySelectedPart ? JOINT_LIMITS[partNameToPoseKey[primarySelectedPart]]?.min || -180 : -180}
                      max={primarySelectedPart ? JOINT_LIMITS[partNameToPoseKey[primarySelectedPart]]?.max || 180 : 180}
                      step={5}
                      onChange={handlePartRotationWheelChange}
                      isDisabled={!primarySelectedPart || (torsoUnitEnabled && isTorsoUnitPart)}
                      className="my-2"
                    />
                  </div>
                  {primarySelectedPart && (
                    <div className="flex flex-col gap-1 border-t border-white/10 pt-2 items-center">
                      <span className="text-white/40 uppercase text-[8px]">Joint_Behavior_Mode</span>
                      <button
                        onClick={() => {
                          if (primarySelectedPart) {
                            setJointModes(prev => {
                              const currentMode = prev[primarySelectedPart];
                              let nextMode: JointConstraint;
                              if (currentMode === 'fk') {
                                nextMode = 'stretch';
                              } else if (currentMode === 'stretch') {
                                nextMode = 'curl';
                              } else if (currentMode === 'curl') {
                                nextMode = 'stretch';
                              } else {
                                nextMode = 'fk';
                              }
                              return { ...prev, [primarySelectedPart]: nextMode };
                            });
                          }
                        }}
                        disabled={!primarySelectedPart || (torsoUnitEnabled && isTorsoUnitPart)}
                        className={`w-full text-[9px] font-bold text-center px-2 py-1 transition-all border ${
                          (!primarySelectedPart || (torsoUnitEnabled && isTorsoUnitPart))
                            ? 'bg-white/5 border-transparent text-white/30 cursor-not-allowed'
                            : `bg-white/20 border-white/40 hover:bg-white/30 ${getKineticModeDisplayColorClass(jointModes[primarySelectedPart])}`
                        }`}
                        aria-label={`Toggle Kinetic Mode for ${getPartCategoryDisplayName(primarySelectedPart)}. Current mode: ${getKineticModeDisplayName(jointModes[primarySelectedPart])}`}
                        aria-pressed={jointModes[primarySelectedPart] !== 'fk'}
                      >
                        {getKineticModeDisplayName(jointModes[primarySelectedPart])}
                      </button>
                    </div>
                  )}
                </div>
                {/* Undo/Redo Buttons */}
                <div className="border-t border-white/10 pt-2 mt-2 w-full flex justify-between gap-2">
                  <button
                    onClick={handleUndo}
                    disabled={undoStack.current.length === 0}
                    className={`flex-1 text-[9px] px-2 py-1 border ${
                      undoStack.current.length > 0 
                      ? 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20' 
                      : 'bg-white/5 border-transparent text-white/30 cursor-not-allowed'
                    } transition-all`}
                    aria-label="Undo last action"
                  >
                    UNDO
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={redoStack.current.length === 0}
                    className={`flex-1 text-[9px] px-2 py-1 border ${
                      redoStack.current.length > 0 
                      ? 'bg-white/10 border-white/20 text-white/70 hover:bg-white/10' 
                      : 'bg-white/5 border-transparent text-white/30 cursor-not-allowed'
                    } transition-all`}
                    aria-label="Redo last action"
                  >
                    REDO
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section: Fixed Point (Pin) Options */}
          <div className="flex flex-col gap-1 w-full text-left border-b border-white/10 pb-2 mb-2">
            <button 
              onClick={() => toggleSection('pin-options')}
              className="flex items-center justify-between w-full text-focus-ring font-bold uppercase tracking-wide hover:text-white transition-colors"
            >
              <span>FIXED POINT (PIN) OPTIONS</span>
              <span className="text-[10px] opacity-50">{expandedSections['pin-options'] ? '▼' : '▶'}</span>
            </button>

            {expandedSections['pin-options'] && (
              <div className="mt-2 flex flex-col gap-1">
                <span className="text-white/40 text-[8px] uppercase">Select_Pin_Location</span>
                <div className="grid grid-cols-2 gap-1">
                  {([PartName.Waist, PartName.LAnkle, 'lFootTip', PartName.RAnkle, 'rFootTip', 'root'] as AnchorName[]).map(pinOption => (
                    <button
                      key={pinOption}
                      onClick={() => {
                        setActivePins(prev => {
                          if (prev.includes(pinOption)) {
                            return prev.filter(p => p !== pinOption);
                          } else {
                            return [...prev, pinOption];
                          }
                        });
                      }}
                      className={`text-[9px] text-left px-2 py-1 transition-all border ${
                        activePins.includes(pinOption)
                        ? 'bg-accent-red/30 border-accent-red text-accent-red'
                        : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                      }`}
                      aria-pressed={activePins.includes(pinOption)}
                      aria-label={`Toggle fixed point ${getPinName([pinOption])}`}
                    >
                      {getPinName([pinOption])}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-1 border-t border-white/10 pt-2 mt-2 items-center">
                  <span className="text-white/40 uppercase text-[8px]">Global_Rotation_Angle</span>
                  <RotationWheelControl
                    value={activePose.bodyRotation || 0}
                    min={-180}
                    max={180}
                    step={5}
                    onChange={handleBodyRotationWheelChange}
                    isDisabled={false}
                    className="my-2"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section: Saved Poses */}
          <div className="flex flex-col gap-1 w-full text-left border-b border-white/10 pb-2 mb-2">
            <button 
              onClick={() => toggleSection('saved-poses')}
              className="flex items-center justify-between w-full text-focus-ring font-bold uppercase tracking-wide hover:text-white transition-colors"
            >
              <span>SAVED POSES</span>
              <span className="text-[10px] opacity-50">{expandedSections['saved-poses'] ? '▼' : '▶'}</span>
            </button>

            {expandedSections['saved-poses'] && (
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex gap-1 mb-2">
                  <button
                    onClick={() => {
                      const name = prompt('Enter pose name:');
                      if (name !== null) saveCurrentPose(name);
                    }}
                    className="flex-1 text-[10px] font-bold py-1 bg-accent-green/20 border border-accent-green/40 text-accent-green hover:bg-accent-green/30 transition-all"
                  >
                    + SAVE_CURRENT
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-1 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                  {/* Default T-Pose */}
                  {POSE_LIBRARY_DB.map(poseData => (
                    <button
                      key={poseData.id}
                      onClick={() => {
                        const parsed = stringToPose(poseData.data);
                        setActivePose(prev => ({ ...prev, ...parsed }));
                      }}
                      className="text-[9px] text-left px-2 py-1 bg-white/5 border border-transparent hover:border-white/20 hover:bg-white/10 transition-all flex justify-between items-center group"
                    >
                      <span className="truncate">{poseData.name.toUpperCase()}</span>
                      <span className="text-[8px] opacity-30 group-hover:opacity-60">SYSTEM</span>
                    </button>
                  ))}

                  {/* User Saved Poses */}
                  {userPoses.map(pose => (
                    <div key={pose.id} className="flex gap-1 group">
                      <button
                        onClick={() => {
                          const parsed = stringToPose(pose.data);
                          setActivePose(prev => ({ ...prev, ...parsed }));
                        }}
                        className="flex-1 text-[9px] text-left px-2 py-1 bg-white/5 border border-transparent hover:border-white/20 hover:bg-white/10 transition-all truncate"
                      >
                        {pose.name.toUpperCase()}
                      </button>
                      <button
                        onClick={() => deleteSavedPose(pose.id)}
                        className="px-2 text-[9px] text-red-500/50 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  
                  {userPoses.length === 0 && POSE_LIBRARY_DB.length === 0 && (
                    <div className="text-[9px] text-white/20 italic py-2 text-center">NO_POSES_FOUND</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section: Display Modes */}
          <div className="flex flex-col gap-1 w-full text-left border-b border-white/10 pb-2 mb-2">
            <button 
              onClick={() => toggleSection('display-modes')}
              className="flex items-center justify-between w-full text-focus-ring font-bold uppercase tracking-wide hover:text-white transition-colors"
            >
              <span>DISPLAY MODES</span>
              <span className="text-[10px] opacity-50">{expandedSections['display-modes'] ? '▼' : '▶'}</span>
            </button>

            {expandedSections['display-modes'] && (
              <div className="mt-2 flex flex-col gap-1">
                <span className="text-white/40 text-[8px] uppercase">Render_Style</span>
                <div className="flex flex-col gap-1">
                  {(['default', 'wireframe', 'silhouette', 'backlight'] as RenderMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setRenderMode(mode)}
                      className={`text-[9px] text-center px-2 py-1 transition-all border ${
                        renderMode === mode 
                        ? 'bg-selection/30 border-selection text-selection' 
                        : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                      }`}
                      aria-pressed={renderMode === mode}
                      aria-label={`Set display mode to ${getRenderModeDisplayName(mode)}`}
                    >
                      {getRenderModeDisplayName(mode).toUpperCase()}
                    </button>
                  ))}
                </div>
                <span className="text-white/40 text-[8px] uppercase mt-4">Viewport_Zoom</span>
                <div className="grid grid-cols-2 gap-1 items-center">
                  {(['default', 'lotte', 'wide', 'mobile', 'zoomed'] as ViewMode[]).map(_mode => (
                    <button
                      key={_mode}
                      onClick={() => setViewMode(_mode)}
                      className={`col-span-1 text-[9px] text-center px-1 py-0.5 transition-all border ${
                        viewMode === _mode
                          ? 'bg-accent-green/30 border-accent-green text-accent-green'
                          : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                      }`}
                      aria-pressed={viewMode === _mode}
                      aria-label={`Set viewport zoom to ${_mode.toUpperCase()}`}
                    >
                      {_mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section: System Monitor */}
          <div className="flex flex-col gap-1 w-full text-right border-b border-white/10 pb-2 mb-2">
            <button 
              onClick={() => toggleSection('system-monitor')}
              className="flex items-center justify-between w-full text-focus-ring font-bold uppercase tracking-wide hover:text-white transition-colors"
            >
              <span className="text-left">SYSTEM MONITOR</span>
              <span className="text-[10px] opacity-50">{expandedSections['system-monitor'] ? '▼' : '▶'}</span>
            </button>

            {expandedSections['system-monitor'] && (
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex gap-4 justify-between w-full"><span>VIEWPORT:</span> <span className="text-accent-green text-right">{viewMode.toUpperCase()}</span></div>
                <div className="flex gap-4 justify-between w-full"><span>FIXED POINTS:</span> <span className="text-accent-red truncate max-w-[120px]">{getPinName(activePins)}</span></div>
                <div className="flex gap-4 justify-between w-full"><span>ACTIVE JOINT:</span> <span className="text-focus-ring">{primarySelectedPart ? getPartCategoryDisplayName(primarySelectedPart) : 'NONE'}</span></div>
                {primarySelectedPart && (
                  <div className="flex gap-4 justify-between w-full">
                    <span>JOINT BEHAVIOR:</span> 
                    <span className={`text-[9px] font-bold ${getKineticModeDisplayColorClass(jointModes[primarySelectedPart])}`}>
                      {getKineticModeDisplayName(jointModes[primarySelectedPart])}
                    </span>
                  </div>
                )}
                <div className="flex gap-4 justify-between w-full"><span>DISPLAY MODE:</span> <span className="text-focus-ring">{getRenderModeDisplayName(renderMode).toUpperCase()}</span></div>
              </div>
            )}
          </div>

          {/* Section: Hotkey Commands */}
          <div className="flex flex-col gap-1 w-full text-left uppercase tracking-widest border-b border-white/10 pb-2 mb-2">
            <button 
              onClick={() => toggleSection('hotkey-commands')}
              className="flex items-center justify-between w-full text-focus-ring font-bold uppercase tracking-wide hover:text-white transition-colors"
            >
              <span>HOTKEY COMMANDS</span>
              <span className="text-[10px] opacity-50">{expandedSections['hotkey-commands'] ? '▼' : '▶'}</span>
            </button>

            {expandedSections['hotkey-commands'] && (
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex gap-2 items-center"><span className="text-accent-green">[V]</span> <span>TOGGLE ZOOM</span></div>
                <div className="flex gap-2 items-center"><span className="text-accent-green">[P]</span> <span>CYCLE FIXED POINT</span></div>
                <div className="flex gap-2 items-center"><span className="text-accent-green">[R]</span> <span>CYCLE DISPLAY MODE</span></div>
                <div className="flex gap-2 items-center"><span className="text-accent-green">[CTRL/CMD+Z]</span> <span>UNDO LAST ACTION</span></div>
                <div className="flex gap-2 items-center"><span className="text-accent-green">[CTRL/CMD+Y]</span> <span>REDO LAST ACTION</span></div>
                <div className="flex gap-2 items-center"><span className="text-accent-green">DRAG</span> <span>POSE JOINT</span></div>
                <div className="flex gap-2 items-center"><span className="text-accent-green">DBL-CLK</span> <span>TOGGLE JOINT BEHAVIOR</span></div>
                <div className="mt-2 text-white/30 border-b border-white/10 pb-1">BEHAVIOR_LEGEND</div>
                <div className="flex gap-2 items-center"><span className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS.PURPLE_STRETCH}}></span> <span className="text-accent-purple">STRETCH</span></div>
                <div className="flex gap-2 items-center"><span className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS.GREEN_CURL}}></span> <span className="text-accent-green">CURL</span></div>
              </div>
            )}
          </div>
          
          {/* Section: System Roadmap */}
          <div className="flex flex-col gap-1 w-full text-left border-b border-white/10 pb-2 mb-2">
            <button 
              onClick={() => toggleSection('system-roadmap')}
              className="flex items-center justify-between w-full text-accent-green font-bold uppercase tracking-wide hover:text-white transition-colors"
            >
              <span>SYSTEM ROADMAP (v0.2)</span>
              <span className="text-[10px] opacity-50">{expandedSections['system-roadmap'] ? '▼' : '▶'}</span>
            </button>

            {expandedSections['system-roadmap'] && (
              <div className="mt-2 flex flex-col gap-2 text-[8px] text-white/50">
                <div className="flex gap-2"><span className="text-accent-green">●</span> <span>PHASE 0.2.1: ENVIRONMENTAL CONTEXT (FLOOR PLANE $Y=0$) - [COMPLETE]</span></div>
                <div className="flex gap-2"><span className="text-accent-green">●</span> <span>PHASE 0.2.2: ELASTIC ANKLE CONSTRAINTS (TENSION PHYSICS) - [COMPLETE]</span></div>
                <div className="flex gap-2"><span className="text-accent-green">●</span> <span>PHASE 0.2.3: ANIMATION ENGINE (KEYFRAME SEQUENCER) - [COMPLETE]</span></div>
                <div className="flex gap-2"><span className="text-focus-ring">○</span> <span>PHASE 0.2.4: MULTI-PIN SAFEGUARDS (AUTO-SQUAT/ELASTICITY) - [PLANNED]</span></div>
                <div className="flex gap-2"><span className="text-focus-ring">○</span> <span>PHASE 0.3.0: PROP SYSTEM & COLLISION (INTERACTIVE OBJECTS) - [PLANNED]</span></div>
              </div>
            )}
          </div>

          {/* Section: Pose Data Export */}
          <div className="flex flex-col gap-1 w-full text-left uppercase tracking-widest">
            <button 
              onClick={() => toggleSection('pose-export')}
              className="flex items-center justify-between w-full text-focus-ring font-bold uppercase tracking-wide hover:text-white transition-colors"
            >
              <span>POSE DATA EXPORT</span>
              <span className="text-[10px] opacity-50">{expandedSections['pose-export'] ? '▼' : '▶'}</span>
            </button>

            {expandedSections['pose-export'] && (
              <div className="mt-2 flex flex-col gap-1">
                <div className="text-white/70 text-[8px] whitespace-pre-wrap break-all h-40 overflow-y-auto custom-scrollbar bg-white/5 p-2 rounded border border-white/10">
                  {poseToString(activePose)}
                </div>
              </div>
            )}
          </div>
            </>
          ) : (
            <>
              {/* Section: AB Pose to Pose Engine */}
              <div className="flex flex-col gap-1 w-full text-left border-b border-white/10 pb-2 mb-2">
                <button 
                  onClick={() => toggleSection('ab-engine')}
                  className="flex items-center justify-between w-full text-focus-ring font-bold uppercase tracking-wide hover:text-white transition-colors"
                >
                  <span>AB POSE ENGINE</span>
                  <span className="text-[10px] opacity-50">{expandedSections['ab-engine'] ? '▼' : '▶'}</span>
                </button>

                {expandedSections['ab-engine'] && (
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="flex gap-1">
                      <button
                        onClick={capturePoseA}
                        className={`flex-1 text-[9px] border px-2 py-1 transition-all ${poseA ? 'bg-accent-green/20 border-accent-green/40 text-accent-green' : 'bg-white/5 border-white/10 text-white/50'}`}
                      >
                        {poseA ? 'SET POSE A' : 'CAPTURE A'}
                      </button>
                      <button
                        onClick={capturePoseB}
                        className={`flex-1 text-[9px] border px-2 py-1 transition-all ${poseB ? 'bg-accent-green/20 border-accent-green/40 text-accent-green' : 'bg-white/5 border-white/10 text-white/50'}`}
                      >
                        {poseB ? 'SET POSE B' : 'CAPTURE B'}
                      </button>
                    </div>

                    {poseA && poseB && (
                      <div className="flex flex-col gap-1 items-center mt-2">
                        <span className="text-white/40 uppercase text-[8px]">Tween_Value: {tweenValue}%</span>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={tweenValue} 
                          onChange={(e) => setTweenValue(parseInt(e.target.value))}
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-focus-ring"
                        />
                        <div className="flex justify-between w-full text-[7px] text-white/30 mt-1">
                          <span>POSE_A</span>
                          <span>POSE_B</span>
                        </div>
                      </div>
                    )}
                    
                    <button
                      onClick={() => {
                        setPoseA(null);
                        setPoseB(null);
                        setTweenValue(0);
                      }}
                      className="text-[8px] text-accent-red/50 hover:text-accent-red mt-2 self-end"
                    >
                      RESET_AB
                    </button>
                  </div>
                )}
              </div>

              {/* Section: Animation Engine */}
              <div className="flex flex-col gap-1 w-full text-left border-b border-white/10 pb-2 mb-2">
                <button 
                  onClick={() => toggleSection('animation-engine')}
                  className="flex items-center justify-between w-full text-focus-ring font-bold uppercase tracking-wide hover:text-white transition-colors"
                >
                  <span>ANIMATION ENGINE</span>
                  <span className="text-[10px] opacity-50">{expandedSections['animation-engine'] ? '▼' : '▶'}</span>
                </button>

                {expandedSections['animation-engine'] && (
                  <div className="mt-2 flex flex-col gap-1">
                    <div className="flex gap-1 mb-2">
                      <button
                        onClick={addKeyframe}
                        className="flex-1 text-[9px] bg-accent-green/20 border border-accent-green/40 text-accent-green px-2 py-1 hover:bg-accent-green/30"
                      >
                        + KEYFRAME
                      </button>
                      <button
                        onClick={animation.isPlaying ? stopAnimation : playAnimation}
                        className={`flex-1 text-[9px] border px-2 py-1 ${
                          animation.isPlaying 
                          ? 'bg-accent-red/20 border-accent-red/40 text-accent-red' 
                          : 'bg-accent-green/20 border-accent-green/40 text-accent-green'
                        }`}
                      >
                        {animation.isPlaying ? 'STOP' : 'PLAY'}
                      </button>
                    </div>
                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar">
                      {animation.keyframes.map((k, i) => (
                        <div key={k.id} className="flex items-center justify-between bg-white/5 p-1 border border-white/10 text-[8px]">
                          <span>FRAME {i + 1} ({k.duration}ms)</span>
                          <button onClick={() => removeKeyframe(k.id)} className="text-accent-red hover:text-white">REMOVE</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          </div>
        </aside>

        <div className="flex-1 bg-selection-super-light bg-triangle-grid flex items-center justify-center relative">
          <Scanlines />
          {showSplash && (
            <div className="absolute top-[8%] left-0 right-0 z-30 flex items-center justify-center pointer-events-none">
              <h1 className="text-6xl font-archaic text-paper/80 animate-terminal-boot tracking-widest uppercase">BITRUVIUS</h1>
            </div>
          )}
          
          <svg 
            ref={svgRef} 
            width="100%" 
            height="100%" 
            viewBox={autoViewBox} 
            className="overflow-visible relative z-10" 
          >
            {cutoutSheet && (
              <image
                href={cutoutSheet.src}
                x={-((cutoutSheet.width * cutoutScale) / 2) + cutoutOffset.x}
                y={-((cutoutSheet.height * cutoutScale) / 2) + cutoutOffset.y}
                width={cutoutSheet.width * cutoutScale}
                height={cutoutSheet.height * cutoutScale}
                opacity={cutoutOpacity}
                preserveAspectRatio="xMidYMid meet"
              />
            )}
            <SystemGuides floorY={FLOOR_HEIGHT} /> 
            <g>
              <Mannequin
                pose={activePose}
                ghostPose={isDragging.current ? ghostPose : undefined}
                showOverlay={true}
                selectedParts={selectedParts}
                visibility={visibility}
                activePins={activePins}
                pinnedState={pinnedState}
                className="text-black"
                onMouseDownOnPart={handleMouseDownOnPart}
                onDoubleClickOnPart={handleDoubleClickOnPart}
                onMouseDownOnRoot={(e) => { 
                  e.stopPropagation(); 
                  isDragging.current = true;
                  dragStartPose.current = activePose;
                  setIsCraneDragging(true); 
                  dragStartInfo.current = { startX: e.clientX, startY: e.clientY, startRootX: activePose.root.x, startRootY: activePose.root.y }; 
                }}
                jointModes={jointModes}
                renderMode={renderMode}
                masksEnabled={masksEnabled}
                hideBonesWithMasks={hideBonesWithMasks}
                maskLayers={maskLayers}
              />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};

export default App;
