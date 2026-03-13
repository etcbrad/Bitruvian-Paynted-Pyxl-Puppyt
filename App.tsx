
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Pose, PartName, PartSelection, PartVisibility, AnchorName, partNameToPoseKey, JointConstraint, RenderMode, Vector2D, ViewMode, AnimationState, AnimationKeyframe, SavedPose, KinematicMode, BodyPartMaskLayer, PARENT_MAP, PART_NAMES } from './types';
import { RESET_POSE, FLOOR_HEIGHT, JOINT_LIMITS, ANATOMY, GROUND_STRIP_HEIGHT } from './constants'; 
import { getJointPositions, getShortestAngleDiffDeg, interpolatePoses, solveIK, solveAdvancedIK, getTotalRotation } from './utils/kinematics';
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
  const maskDragInfo = useRef<{
    startLocalX: number;
    startLocalY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
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
  type BackgroundPreset = 'grid' | 'white' | 'gray-1' | 'gray-2' | 'gray-3' | 'black';
  const [backgroundPreset, setBackgroundPreset] = useState<BackgroundPreset>('grid');
  const [backgroundImageSrc, setBackgroundImageSrc] = useState<string | null>(null);
  const backgroundUploadInputRef = useRef<HTMLInputElement>(null);
  const [backgroundLight, setBackgroundLight] = useState(0);

  const [selectedParts, setSelectedParts] = useState<PartSelection>(() => {
    const initialSelection: PartSelection = Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: false }), {} as PartSelection);
    initialSelection[PartName.Waist] = true; 
    return initialSelection;
  });

  const [visibility] = useState<PartVisibility>(() => Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: true }), {} as PartVisibility));

  const [jointModes, setJointModes] = useState<Record<PartName, JointConstraint>>(() => 
    Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: 'fk' }), {} as Record<PartName, JointConstraint>)
  );
  const [jointParentOverrides, setJointParentOverrides] = useState<Record<PartName, AnchorName | null>>(() =>
    Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: PARENT_MAP[name] || null }), {} as Record<PartName, AnchorName | null>)
  );

  const [workflowStep, setWorkflowStep] = useState<'upload' | 'slice' | 'rig' | 'pose'>('pose');
  const [masksEnabled, setMasksEnabled] = useState(true);
  const [hideBonesWithMasks, setHideBonesWithMasks] = useState(false);
  const [torsoUnitEnabled, setTorsoUnitEnabled] = useState(true);
  const [torsoUnitAngle, setTorsoUnitAngle] = useState(0);
  const [autoMirrorLimbs, setAutoMirrorLimbs] = useState(true);
  const [autoBuildFromLegs, setAutoBuildFromLegs] = useState(true);
  const [autoAdvanceJoint, setAutoAdvanceJoint] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState(10);
  const [placingJoint, setPlacingJoint] = useState(false);
  const [placingAnchors, setPlacingAnchors] = useState(false);
  const [dragMaskMode, setDragMaskMode] = useState(false);
  const [showJointLabels, setShowJointLabels] = useState(false);
  const [proportionScales, setProportionScales] = useState({ arm: 1, leg: 1, torso: 1, head: 1 });

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
    mirrorX: false,
    scaleLocked: false,
    jointAnchors: [],
  };

  const [maskLayers, setMaskLayers] = useState<Record<PartName, BodyPartMaskLayer>>(() =>
    Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: { ...DEFAULT_MASK_LAYER } }), {} as Record<PartName, BodyPartMaskLayer>)
  );

  const JOINT_ORDER: PartName[] = [
    PartName.Head,
    PartName.Collar,
    PartName.Torso,
    PartName.Waist,
    PartName.RShoulder,
    PartName.RElbow,
    PartName.RWrist,
    PartName.LShoulder,
    PartName.LElbow,
    PartName.LWrist,
    PartName.RThigh,
    PartName.RSkin,
    PartName.RAnkle,
    PartName.LThigh,
    PartName.LSkin,
    PartName.LAnkle,
  ];

  const ARM_FROM_LEG_SCALE = 0.72;

  const maskUploadInputRef = useRef<HTMLInputElement>(null);
  const cutoutUploadInputRef = useRef<HTMLInputElement>(null);
  const [cutoutSheet, setCutoutSheet] = useState<{ src: string; width: number; height: number } | null>(null);
  const [cutoutOpacity, setCutoutOpacity] = useState(0.45);
  const [cutoutScale, setCutoutScale] = useState(1);
  const [cutoutOffset, setCutoutOffset] = useState({ x: 0, y: 0 });
  const [cutoutSensitivity, setCutoutSensitivity] = useState(0.6);
  const [cutoutMergeGap, setCutoutMergeGap] = useState(1);
  const [cutoutIgnoreText, setCutoutIgnoreText] = useState(true);
  const [cutoutTool, setCutoutTool] = useState<'select' | 'rect' | 'circle' | 'freehand' | 'erase'>('select');
  const [cutoutEraseSize, setCutoutEraseSize] = useState(14);
  const [cutoutIsErasing, setCutoutIsErasing] = useState(false);
  const [showTPoseTemplate, setShowTPoseTemplate] = useState(true);
  const [tPoseTemplateOpacity, setTPoseTemplateOpacity] = useState(0.4);
  const [cutoutShapes, setCutoutShapes] = useState<Array<{
    id: string;
    type: 'rect' | 'circle' | 'freehand';
    bbox: { x: number; y: number; w: number; h: number };
    points?: Array<{ x: number; y: number }>;
  }>>([]);
  const [cutoutActiveShapeId, setCutoutActiveShapeId] = useState<string | null>(null);
  const [cutoutDraftShape, setCutoutDraftShape] = useState<{
    type: 'rect' | 'circle' | 'freehand';
    bbox: { x: number; y: number; w: number; h: number };
    points?: Array<{ x: number; y: number }>;
  } | null>(null);
  const [cutoutPieces, setCutoutPieces] = useState<Array<{
    id: string;
    labelId: number;
    shapeId: string;
    bbox: { x: number; y: number; w: number; h: number };
    area: number;
    previewSrc: string;
    center: { x: number; y: number };
    fillRatio: number;
  }>>([]);
  const [selectedCutoutPieceId, setSelectedCutoutPieceId] = useState<string | null>(null);
  const [isAdjustingSensitivity, setIsAdjustingSensitivity] = useState(false);
  const cutoutImageRef = useRef<HTMLImageElement | null>(null);
  const cutoutImageDataRef = useRef<ImageData | null>(null);
  const cutoutLabelMapRef = useRef<{ labels: Int32Array; width: number; height: number } | null>(null);
  const sensitivityDragRef = useRef<{ startY: number; startSensitivity: number } | null>(null);
  const shapeDragRef = useRef<{ startX: number; startY: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const isErasingRef = useRef(false);
  const longPressTriggeredRef = useRef(false);

  // Animation State
  const [animation, setAnimation] = useState<AnimationState>({
    keyframes: [],
    isPlaying: false,
    currentFrameIndex: 0,
    loop: true,
  });

  const [kinematicMode, setKinematicMode] = useState<KinematicMode>('fk');
  const [isPoweredOn] = useState(true);

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
        solvedPose = solveIK(ghostPose, limb, targetPos, 10, proportionScales);
      } else {
        solvedPose = solveAdvancedIK(ghostPose, limb, targetPos, jointModes, activePins, proportionScales);
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

  const jointPositions = useMemo(() => getJointPositions(activePose, activePins, proportionScales), [activePose, activePins, proportionScales]);

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

  const viewBoxValues = useMemo(() => {
    const parts = autoViewBox.split(' ').map(v => Number(v));
    if (parts.length === 4 && parts.every(v => Number.isFinite(v))) {
      return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
    }
    return { x: -1000, y: -1000, w: 2000, h: 2000 };
  }, [autoViewBox]);

  const tPoseTemplate = useMemo(() => {
    const headTip = jointPositions.headTip;
    const lFoot = jointPositions.lFootTip;
    const rFoot = jointPositions.rFootTip;
    const lHand = jointPositions.lHandTip;
    const rHand = jointPositions.rHandTip;
    const lShoulder = jointPositions.lShoulder;
    const rShoulder = jointPositions.rShoulder;
    if (!headTip || !lFoot || !rFoot) return null;
    const topY = headTip.y;
    const bottomY = Math.max(lFoot.y, rFoot.y);
    const height = Math.max(1, bottomY - topY);
    const centerX = activePose.root.x;
    const centerY = topY + height / 2;
    return {
      square: {
        x: centerX - height / 2,
        y: topY,
        size: height,
      },
      circle: {
        cx: centerX,
        cy: centerY,
        r: height / 2,
      },
      vertical: {
        x1: centerX,
        y1: topY,
        x2: centerX,
        y2: bottomY,
      },
      shoulders: lShoulder && rShoulder ? {
        x1: lShoulder.x,
        y1: lShoulder.y,
        x2: rShoulder.x,
        y2: rShoulder.y,
      } : null,
      hands: lHand && rHand ? {
        x1: lHand.x,
        y1: lHand.y,
        x2: rHand.x,
        y2: rHand.y,
      } : null,
    };
  }, [activePose.root.x, jointPositions]);

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

    const potentialJoints = getJointPositions(potentialPose, activePins, proportionScales);
    
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

  // Pose sync loop (smoothing disabled for immediate feedback)
  useEffect(() => {
    if (!isPoweredOn) return;
    
    let rafId: number;
    const smooth = () => {
      setActivePose(ghostPose);
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

    if (dragMaskMode && maskDragInfo.current && primarySelectedPart) {
      const joints = getJointPositions(activePose, activePins, proportionScales);
      const jointPos = joints[primarySelectedPart];
      if (!jointPos) return;
      const rot = getWorldRotationForPart(primarySelectedPart, activePose);
      const local = rotateVec(transformedPoint.x - jointPos.x, transformedPoint.y - jointPos.y, -rot);
      const dx = local.x - maskDragInfo.current.startLocalX;
      const dy = local.y - maskDragInfo.current.startLocalY;
      updateMaskLayer(primarySelectedPart, {
        offsetX: snapValue(maskDragInfo.current.startOffsetX + dx),
        offsetY: snapValue(maskDragInfo.current.startOffsetY + dy),
      });
      return;
    }

    if (isCraneDragging && dragStartInfo.current) {
      const dx = transformedPoint.x - dragStartInfo.current.startX;
      const dy = transformedPoint.y - dragStartInfo.current.startY;
      
      const newRootX = dragStartInfo.current.startRootX + dx;
      const newRootY = dragStartInfo.current.startRootY + dy;

      validateAndApplyPoseUpdate({ root: { x: newRootX, y: newRootY } }, null, false);
      
    } else if (isAdjusting && rotatingPart && rotationStartInfo.current) {
      const joints = getJointPositions(ghostPose, activePins, proportionScales);
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
  }, [dragMaskMode, primarySelectedPart, activePose, activePins, proportionScales, getWorldRotationForPart, rotateVec, snapValue, updateMaskLayer, isAdjusting, rotatingPart, isCraneDragging, isIKDragging, effectorPart, ghostPose, validateAndApplyPoseUpdate, handleIKMove]);

  const updatePinnedState = useCallback((pins: AnchorName[]) => {
    const joints = getJointPositions(activePose, pins, proportionScales);
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
    maskDragInfo.current = null;
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
    if (workflowStep === 'slice') return;

    if (dragMaskMode && maskLayers[part]?.src) {
      const point = toSvgPoint(e.clientX, e.clientY);
      if (!point) return;
      const joints = getJointPositions(activePose, activePins, proportionScales);
      const jointPos = joints[part];
      if (!jointPos) return;
      const rot = getWorldRotationForPart(part, activePose);
      const local = rotateVec(point.x - jointPos.x, point.y - jointPos.y, -rot);
      maskDragInfo.current = {
        startLocalX: local.x,
        startLocalY: local.y,
        startOffsetX: maskLayers[part].offsetX || 0,
        startOffsetY: maskLayers[part].offsetY || 0,
      };
      setSelectedParts(prev => ({ ...prev, [part]: true }));
      return;
    }

    isDragging.current = true;
    dragStartPose.current = activePose;
    setSelectedParts(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => next[k as PartName] = k === part);
      return next;
    });

    const joints = getJointPositions(activePose, activePins, proportionScales);
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
  }, [activePose, activePins, dragMaskMode, getWorldRotationForPart, jointModes, kinematicMode, maskLayers, proportionScales, rotateVec, toSvgPoint, workflowStep]);

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
      if (prev === 'backlight') return 'colorwheel';
      if (prev === 'colorwheel') return 'default';
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
      case 'colorwheel': return 'COLOR WHEEL (Rotation-Linked)';
      default: return 'UNKNOWN';
    }
  };

  const backgroundOptions: Array<{
    id: BackgroundPreset;
    label: string;
    className?: string;
    color?: string;
  }> = [
    { id: 'grid', label: 'GRID', className: 'bg-selection-super-light bg-triangle-grid' },
    { id: 'white', label: 'WHITE', color: '#FFFFFF' },
    { id: 'gray-1', label: 'GRAY 1', color: '#E5E7EB' },
    { id: 'gray-2', label: 'GRAY 2', color: '#9CA3AF' },
    { id: 'gray-3', label: 'GRAY 3', color: '#4B5563' },
    { id: 'black', label: 'BLACK', color: '#000000' },
  ];

  const activeBackground = backgroundOptions.find(option => option.id === backgroundPreset) || backgroundOptions[0];


  const handlePartRotationWheelChange = useCallback((newValue: number) => {
    if (!primarySelectedPart) return;
    const partKey = partNameToPoseKey[primarySelectedPart];
    
    validateAndApplyPoseUpdate({ [partKey]: newValue }, primarySelectedPart, false);
  }, [primarySelectedPart, validateAndApplyPoseUpdate]);

  const handleBodyRotationWheelChange = useCallback((newValue: number) => {
    validateAndApplyPoseUpdate({ bodyRotation: newValue }, null, false);
  }, [validateAndApplyPoseUpdate]);

  const handleBackgroundUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBackgroundImageSrc(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const getBoneLengthForPart = useCallback((part: PartName): number => {
    const arm = proportionScales.arm || 1;
    const leg = proportionScales.leg || 1;
    const torso = proportionScales.torso || 1;
    const head = proportionScales.head || 1;
    switch (part) {
      case PartName.Waist: return ANATOMY.WAIST * torso;
      case PartName.Torso: return ANATOMY.TORSO * torso;
      case PartName.Collar: return ANATOMY.COLLAR * torso;
      case PartName.Head: return ANATOMY.HEAD * head;
      case PartName.RShoulder:
      case PartName.LShoulder: return ANATOMY.UPPER_ARM * arm;
      case PartName.RElbow:
      case PartName.LElbow: return ANATOMY.LOWER_ARM * arm;
      case PartName.RWrist:
      case PartName.LWrist: return ANATOMY.HAND * arm;
      case PartName.RThigh:
      case PartName.LThigh: return ANATOMY.LEG_UPPER * leg;
      case PartName.RSkin:
      case PartName.LSkin: return ANATOMY.LEG_LOWER * leg;
      case PartName.RAnkle:
      case PartName.LAnkle: return ANATOMY.FOOT * leg;
      default: return ANATOMY.TORSO * torso;
    }
  }, [proportionScales]);

  const handleTorsoUnitChange = useCallback((newValue: number) => {
    setTorsoUnitAngle(newValue);
    validateAndApplyPoseUpdate({ waist: newValue, torso: newValue, collar: newValue }, PartName.Torso, false);
  }, [validateAndApplyPoseUpdate]);

  const mirrorPairs: Partial<Record<PartName, PartName>> = {
    [PartName.RShoulder]: PartName.LShoulder,
    [PartName.RElbow]: PartName.LElbow,
    [PartName.RWrist]: PartName.LWrist,
    [PartName.RThigh]: PartName.LThigh,
    [PartName.RSkin]: PartName.LSkin,
    [PartName.RAnkle]: PartName.LAnkle,
  };

  const applyLegToLimbs = (nextLayers: Record<PartName, BodyPartMaskLayer>) => {
    const rightLeg = {
      thigh: nextLayers[PartName.RThigh],
      calf: nextLayers[PartName.RSkin],
      ankle: nextLayers[PartName.RAnkle],
    };
    if (!rightLeg.thigh.src || !rightLeg.calf.src || !rightLeg.ankle.src) return nextLayers;

    // Auto build left leg from right leg.
    if (!nextLayers[PartName.LThigh].src) nextLayers[PartName.LThigh] = { ...rightLeg.thigh, mirrorX: true };
    if (!nextLayers[PartName.LSkin].src) nextLayers[PartName.LSkin] = { ...rightLeg.calf, mirrorX: true };
    if (!nextLayers[PartName.LAnkle].src) nextLayers[PartName.LAnkle] = { ...rightLeg.ankle, mirrorX: true };

    // Build arms from leg proportions (vitruvian-ish).
    const armScale = ARM_FROM_LEG_SCALE;
    if (!nextLayers[PartName.RShoulder].src) {
      nextLayers[PartName.RShoulder] = {
        ...rightLeg.thigh,
        scale: (rightLeg.thigh.scale || 1) * armScale,
        baseScale: (rightLeg.thigh.baseScale || rightLeg.thigh.scale || 1) * armScale,
        offsetX: (rightLeg.thigh.offsetX || 0) * armScale,
        offsetY: (rightLeg.thigh.offsetY || 0) * armScale,
        mirrorX: false,
      };
    }
    if (!nextLayers[PartName.RElbow].src) {
      nextLayers[PartName.RElbow] = {
        ...rightLeg.calf,
        scale: (rightLeg.calf.scale || 1) * armScale,
        baseScale: (rightLeg.calf.baseScale || rightLeg.calf.scale || 1) * armScale,
        offsetX: (rightLeg.calf.offsetX || 0) * armScale,
        offsetY: (rightLeg.calf.offsetY || 0) * armScale,
        mirrorX: false,
      };
    }
    if (!nextLayers[PartName.RWrist].src) {
      nextLayers[PartName.RWrist] = {
        ...rightLeg.ankle,
        scale: (rightLeg.ankle.scale || 1) * armScale,
        baseScale: (rightLeg.ankle.baseScale || rightLeg.ankle.scale || 1) * armScale,
        offsetX: (rightLeg.ankle.offsetX || 0) * armScale,
        offsetY: (rightLeg.ankle.offsetY || 0) * armScale,
        mirrorX: false,
      };
    }
    if (!nextLayers[PartName.LShoulder].src) nextLayers[PartName.LShoulder] = { ...nextLayers[PartName.RShoulder], mirrorX: true };
    if (!nextLayers[PartName.LElbow].src) nextLayers[PartName.LElbow] = { ...nextLayers[PartName.RElbow], mirrorX: true };
    if (!nextLayers[PartName.LWrist].src) nextLayers[PartName.LWrist] = { ...nextLayers[PartName.RWrist], mirrorX: true };

    return nextLayers;
  };

  const updateMaskLayer = useCallback((part: PartName, patch: Partial<BodyPartMaskLayer>) => {
    setMaskLayers(prev => {
      const next = { ...prev, [part]: { ...prev[part], ...patch } };
      const mirrorTarget = mirrorPairs[part];
      if (autoMirrorLimbs && mirrorTarget) {
        next[mirrorTarget] = { ...prev[mirrorTarget], ...patch, mirrorX: true };
        if (patch.src === null) {
          next[mirrorTarget] = { ...next[mirrorTarget], src: null };
        }
      }
      if (autoBuildFromLegs) {
        applyLegToLimbs(next);
      }
      return next;
    });
  }, [autoMirrorLimbs, autoBuildFromLegs, applyLegToLimbs]);

  useEffect(() => {
    if (!autoMirrorLimbs) return;
    setMaskLayers(prev => {
      const next = { ...prev };
      (Object.entries(mirrorPairs) as Array<[PartName, PartName]>).forEach(([right, left]) => {
        if (prev[right].src && !prev[left].src) {
          next[left] = { ...prev[right], mirrorX: true };
        }
      });
      return next;
    });
  }, [autoMirrorLimbs]);

  const copyRightToLeft = useCallback((pairs: Array<[PartName, PartName]>) => {
    setMaskLayers(prev => {
      const next = { ...prev };
      pairs.forEach(([right, left]) => {
        if (prev[right].src) {
          next[left] = { ...prev[right], mirrorX: true };
        }
      });
      return next;
    });
  }, []);

  const getNextEmptyJoint = useCallback((from?: PartName | null) => {
    const startIndex = from ? Math.max(0, JOINT_ORDER.indexOf(from) + 1) : 0;
    for (let i = startIndex; i < JOINT_ORDER.length; i += 1) {
      const part = JOINT_ORDER[i];
      if (!maskLayers[part].src) return part;
    }
    return null;
  }, [maskLayers]);

  const fitMaskToBone = useCallback((part: PartName) => {
    const layer = maskLayers[part];
    if (!layer?.src) return;
    const boneLength = getBoneLengthForPart(part);
    const dominantSize = Math.max(layer.width || 0, layer.height || 0);
    const baseScale = dominantSize > 0 ? boneLength / dominantSize : 1;
    updateMaskLayer(part, { baseScale, scale: baseScale, offsetX: 0, offsetY: 0, rotationDeg: 0 });
  }, [getBoneLengthForPart, maskLayers, updateMaskLayer]);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const snapValue = useCallback((value: number) => {
    if (!snapToGrid || !gridSize) return value;
    return Math.round(value / gridSize) * gridSize;
  }, [snapToGrid, gridSize]);

  const rotateVec = useCallback((x: number, y: number, angleDeg: number) => {
    const r = angleDeg * Math.PI / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    return { x: x * c - y * s, y: x * s + y * c };
  }, []);

  const getWorldRotationForPart = useCallback((part: PartName, pose: Pose) => {
    const chain: PartName[] = [];
    let current: PartName | undefined = part;
    while (current) {
      chain.unshift(current);
      current = PARENT_MAP[current];
    }
    let rot = pose.bodyRotation || 0;
    chain.forEach(p => {
      const key = partNameToPoseKey[p];
      rot += getTotalRotation(key, pose);
    });
    return rot;
  }, []);

  const toSvgPoint = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return null;
    const svgPoint = svgRef.current.createSVGPoint();
    svgPoint.x = clientX;
    svgPoint.y = clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return null;
    return svgPoint.matrixTransform(ctm.inverse());
  }, []);


  const handleCutoutUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    const reader = new FileReader();

    const loadRaster = (src: string) => {
      const img = new Image();
      img.onload = () => {
        setCutoutSheet({ src, width: img.width || img.naturalWidth, height: img.height || img.naturalHeight });
        setWorkflowStep('slice');
      };
      img.src = src;
    };

    if (isSvg) {
      reader.onload = () => {
        const raw = String(reader.result || '');
        let width = 0;
        let height = 0;
        try {
          const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
          const svgEl = doc.documentElement;
          const widthAttr = svgEl.getAttribute('width');
          const heightAttr = svgEl.getAttribute('height');
          const viewBoxAttr = svgEl.getAttribute('viewBox');
          if (widthAttr && heightAttr) {
            width = parseFloat(widthAttr);
            height = parseFloat(heightAttr);
          } else if (viewBoxAttr) {
            const parts = viewBoxAttr.split(/[\s,]+/).map(v => parseFloat(v)).filter(v => Number.isFinite(v));
            if (parts.length === 4) {
              width = parts[2];
              height = parts[3];
            }
          }
        } catch {
          // Fallback handled below.
        }
        const src = `data:image/svg+xml;utf8,${encodeURIComponent(raw)}`;
        if (width > 0 && height > 0) {
          setCutoutSheet({ src, width, height });
          setWorkflowStep('slice');
        } else {
          // Some SVGs omit size attributes; attempt to infer via image load.
          loadRaster(src);
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = () => loadRaster(reader.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (workflowStep === 'slice') return;
    if (placingAnchors && primarySelectedPart) {
      const point = toSvgPoint(e.clientX, e.clientY);
      if (!point) return;
      const jointPos = jointPositions[primarySelectedPart];
      if (!jointPos) return;
      const rot = getWorldRotationForPart(primarySelectedPart, activePose);
      const local = rotateVec(point.x - jointPos.x, point.y - jointPos.y, -rot);
      const anchor = { x: snapValue(local.x), y: snapValue(local.y) };
      const existing = maskLayers[primarySelectedPart]?.jointAnchors || [];
      const nextAnchors = existing.length >= 3 ? [anchor] : [...existing, anchor];
      updateMaskLayer(primarySelectedPart, { jointAnchors: nextAnchors });
      return;
    }
    if (!placingJoint || !primarySelectedPart) return;
    const point = toSvgPoint(e.clientX, e.clientY);
    if (!point) return;
    const jointPos = jointPositions[primarySelectedPart];
    if (!jointPos) return;
    const rot = getWorldRotationForPart(primarySelectedPart, activePose);
    const local = rotateVec(point.x - jointPos.x, point.y - jointPos.y, -rot);
    updateMaskLayer(primarySelectedPart, { offsetX: snapValue(local.x), offsetY: snapValue(local.y) });
  }, [placingAnchors, placingJoint, primarySelectedPart, workflowStep, toSvgPoint, jointPositions, getWorldRotationForPart, activePose, rotateVec, updateMaskLayer, snapValue, maskLayers]);

  const getCutoutDetectionParams = useCallback((sensitivity: number) => {
    const normalized = clamp(sensitivity, 0, 1);
    return {
      lumaThreshold: Math.round(80 + normalized * 160),
      alphaThreshold: Math.round(40 - normalized * 30),
      minArea: Math.round(30 + (1 - normalized) * 260),
      mergeDistance: clamp(Math.round(cutoutMergeGap), 0, 8),
      colorDistanceThreshold: 0.08 + normalized * 0.35,
      textFillRatioThreshold: 0.14,
      textAreaMax: 1800,
    };
  }, [cutoutMergeGap]);

  const buildCutoutPreviews = useCallback((
    labels: Int32Array,
    imageData: ImageData,
    pieces: Array<{ labelId: number; shapeId: string; bbox: { x: number; y: number; w: number; h: number }; area: number; center: { x: number; y: number }; fillRatio: number }>
  ) => {
    const { width, height, data } = imageData;
    return pieces.map(piece => {
      const { x, y, w, h } = piece.bbox;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return {
          ...piece,
          id: `piece-${piece.labelId}`,
          previewSrc: '',
        };
      }
      const output = ctx.createImageData(w, h);
      const outData = output.data;
      for (let yy = 0; yy < h; yy += 1) {
        const srcRow = (y + yy) * width;
        const outRow = yy * w;
        for (let xx = 0; xx < w; xx += 1) {
          const srcIndex = srcRow + (x + xx);
          const outIndex = outRow + xx;
          const outOffset = outIndex * 4;
          if (labels[srcIndex] === piece.labelId) {
            const srcOffset = srcIndex * 4;
            outData[outOffset] = data[srcOffset];
            outData[outOffset + 1] = data[srcOffset + 1];
            outData[outOffset + 2] = data[srcOffset + 2];
            outData[outOffset + 3] = data[srcOffset + 3];
          } else {
            outData[outOffset] = 0;
            outData[outOffset + 1] = 0;
            outData[outOffset + 2] = 0;
            outData[outOffset + 3] = 0;
          }
        }
      }
      ctx.putImageData(output, 0, 0);
      return {
        ...piece,
        id: `piece-${piece.labelId}`,
        previewSrc: canvas.toDataURL('image/png'),
      };
    });
  }, []);

  const buildShapeMask = useCallback((shape: { type: 'rect' | 'circle' | 'freehand'; bbox: { x: number; y: number; w: number; h: number }; points?: Array<{ x: number; y: number }> }, width: number, height: number) => {
    const mask = new Uint8Array(width * height);
    if (shape.type === 'rect') {
      const x0 = clamp(Math.floor(shape.bbox.x), 0, width - 1);
      const y0 = clamp(Math.floor(shape.bbox.y), 0, height - 1);
      const x1 = clamp(Math.ceil(shape.bbox.x + shape.bbox.w), 0, width);
      const y1 = clamp(Math.ceil(shape.bbox.y + shape.bbox.h), 0, height);
      for (let y = y0; y < y1; y += 1) {
        const row = y * width;
        for (let x = x0; x < x1; x += 1) {
          mask[row + x] = 1;
        }
      }
      return mask;
    }
    if (shape.type === 'circle') {
      const cx = shape.bbox.x + shape.bbox.w / 2;
      const cy = shape.bbox.y + shape.bbox.h / 2;
      const rx = Math.max(1, shape.bbox.w / 2);
      const ry = Math.max(1, shape.bbox.h / 2);
      const x0 = clamp(Math.floor(shape.bbox.x), 0, width - 1);
      const y0 = clamp(Math.floor(shape.bbox.y), 0, height - 1);
      const x1 = clamp(Math.ceil(shape.bbox.x + shape.bbox.w), 0, width);
      const y1 = clamp(Math.ceil(shape.bbox.y + shape.bbox.h), 0, height);
      for (let y = y0; y < y1; y += 1) {
        const dy = (y - cy) / ry;
        const row = y * width;
        for (let x = x0; x < x1; x += 1) {
          const dx = (x - cx) / rx;
          if (dx * dx + dy * dy <= 1) {
            mask[row + x] = 1;
          }
        }
      }
      return mask;
    }
    if (shape.type === 'freehand' && shape.points && shape.points.length > 2) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return mask;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i += 1) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
      ctx.closePath();
      ctx.fill();
      const maskData = ctx.getImageData(0, 0, width, height).data;
      for (let i = 0; i < width * height; i += 1) {
        mask[i] = maskData[i * 4 + 3] > 10 ? 1 : 0;
      }
      return mask;
    }
    return mask;
  }, []);

  const runCutoutDetection = useCallback((img: HTMLImageElement, sensitivity: number) => {
    const params = getCutoutDetectionParams(sensitivity);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) {
      setCutoutPieces([]);
      cutoutImageDataRef.current = null;
      cutoutLabelMapRef.current = null;
      return;
    }
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    cutoutImageDataRef.current = imageData;
    const { width, height, data } = imageData;
    const pixelCount = width * height;
    const foreground = new Uint8Array(pixelCount);

    const sampleCorner = (sx: number, sy: number) => {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let yy = 0; yy < 6; yy += 1) {
        for (let xx = 0; xx < 6; xx += 1) {
          const x = clamp(sx + xx, 0, width - 1);
          const y = clamp(sy + yy, 0, height - 1);
          const idx = (y * width + x) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          count += 1;
        }
      }
      return { r: r / count, g: g / count, b: b / count };
    };

    const cornerSamples = [
      sampleCorner(0, 0),
      sampleCorner(width - 6, 0),
      sampleCorner(0, height - 6),
      sampleCorner(width - 6, height - 6),
    ];
    const bg = cornerSamples.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 });
    bg.r /= cornerSamples.length;
    bg.g /= cornerSamples.length;
    bg.b /= cornerSamples.length;

    for (let i = 0; i < pixelCount; i += 1) {
      const offset = i * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const dr = r - bg.r;
      const dg = g - bg.g;
      const db = b - bg.b;
      const colorDistance = Math.sqrt(dr * dr + dg * dg + db * db) / 441;
      const isForeground = a > params.alphaThreshold || luma < params.lumaThreshold || colorDistance > params.colorDistanceThreshold;
      foreground[i] = isForeground ? 1 : 0;
    }

    if (params.mergeDistance > 0) {
      let current = foreground;
      for (let iter = 0; iter < params.mergeDistance; iter += 1) {
        const next = new Uint8Array(pixelCount);
        for (let y = 0; y < height; y += 1) {
          const row = y * width;
          for (let x = 0; x < width; x += 1) {
            const idx = row + x;
            if (current[idx]) {
              next[idx] = 1;
              if (x > 0) next[idx - 1] = 1;
              if (x < width - 1) next[idx + 1] = 1;
              if (y > 0) next[idx - width] = 1;
              if (y < height - 1) next[idx + width] = 1;
              if (x > 0 && y > 0) next[idx - width - 1] = 1;
              if (x < width - 1 && y > 0) next[idx - width + 1] = 1;
              if (x > 0 && y < height - 1) next[idx + width - 1] = 1;
              if (x < width - 1 && y < height - 1) next[idx + width + 1] = 1;
            }
          }
        }
        current = next;
      }
      foreground.set(current);
    }

    const labels = new Int32Array(pixelCount);
    labels.fill(-1);
    const queueX: number[] = [];
    const queueY: number[] = [];
    const pieces: Array<{ labelId: number; shapeId: string; bbox: { x: number; y: number; w: number; h: number }; area: number; center: { x: number; y: number }; fillRatio: number }> = [];
    let labelId = 0;
    const shapes = cutoutShapes.length > 0
      ? cutoutShapes
      : [{
        id: 'full-sheet',
        type: 'rect' as const,
        bbox: { x: 0, y: 0, w: width, h: height },
      }];

    shapes.forEach(shape => {
      const mask = buildShapeMask(shape, width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          if (!foreground[idx] || labels[idx] !== -1 || mask[idx] === 0) continue;
          let minX = x;
          let maxX = x;
          let minY = y;
          let maxY = y;
          let area = 0;
          let sumX = 0;
          let sumY = 0;
          queueX.length = 0;
          queueY.length = 0;
          queueX.push(x);
          queueY.push(y);
          labels[idx] = labelId;
          while (queueX.length) {
            const qx = queueX.pop()!;
            const qy = queueY.pop()!;
            const qIdx = qy * width + qx;
            if (mask[qIdx] === 0) continue;
            area += 1;
            sumX += qx;
            sumY += qy;
            if (qx < minX) minX = qx;
            if (qx > maxX) maxX = qx;
            if (qy < minY) minY = qy;
            if (qy > maxY) maxY = qy;
            const neighbors = [
              [qx - 1, qy],
              [qx + 1, qy],
              [qx, qy - 1],
              [qx, qy + 1],
            ];
            for (const [nx, ny] of neighbors) {
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              const nIdx = ny * width + nx;
              if (!foreground[nIdx] || labels[nIdx] !== -1 || mask[nIdx] === 0) continue;
              labels[nIdx] = labelId;
              queueX.push(nx);
              queueY.push(ny);
            }
          }
          if (area >= params.minArea) {
            const w = maxX - minX + 1;
            const h = maxY - minY + 1;
            const fillRatio = area / (w * h);
            const isLikelyText = cutoutIgnoreText && area < params.textAreaMax && fillRatio < params.textFillRatioThreshold;
            if (isLikelyText) {
              labelId += 1;
              continue;
            }
            pieces.push({
              labelId,
              shapeId: shape.id,
              bbox: { x: minX, y: minY, w, h },
              area,
              center: { x: sumX / area, y: sumY / area },
              fillRatio,
            });
          }
          labelId += 1;
        }
      }
    });

    cutoutLabelMapRef.current = { labels, width, height };
    const previews = buildCutoutPreviews(labels, imageData, pieces);
    previews.sort((a, b) => b.area - a.area);
    setCutoutPieces(previews);
  }, [buildCutoutPreviews, buildShapeMask, cutoutIgnoreText, cutoutShapes, getCutoutDetectionParams]);

  const selectSinglePartBase = useCallback((part: PartName) => {
    setSelectedParts(prev => {
      const next: PartSelection = Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: false }), {} as PartSelection);
      next[part] = true;
      return next;
    });
  }, []);

  const applyCutoutPieceToPart = useCallback((pieceId: string, part: PartName) => {
    const piece = cutoutPieces.find(p => p.id === pieceId);
    const labelMap = cutoutLabelMapRef.current;
    const imageData = cutoutImageDataRef.current;
    if (!piece || !labelMap || !imageData) return;
    const { labels, width, height } = labelMap;
    const { data } = imageData;
    const { x, y, w, h } = piece.bbox;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const output = ctx.createImageData(w, h);
    const outData = output.data;
    for (let yy = 0; yy < h; yy += 1) {
      const srcRow = (y + yy) * width;
      const outRow = yy * w;
      for (let xx = 0; xx < w; xx += 1) {
        const srcIndex = srcRow + (x + xx);
        const outIndex = outRow + xx;
        const outOffset = outIndex * 4;
        if (labels[srcIndex] === piece.labelId) {
          const srcOffset = srcIndex * 4;
          outData[outOffset] = data[srcOffset];
          outData[outOffset + 1] = data[srcOffset + 1];
          outData[outOffset + 2] = data[srcOffset + 2];
          outData[outOffset + 3] = data[srcOffset + 3];
        } else {
          outData[outOffset] = 0;
          outData[outOffset + 1] = 0;
          outData[outOffset + 2] = 0;
          outData[outOffset + 3] = 0;
        }
      }
    }
    ctx.putImageData(output, 0, 0);
    const src = canvas.toDataURL('image/png');
    const boneLength = getBoneLengthForPart(part);
    const dominantSize = Math.max(w, h);
    const baseScale = dominantSize > 0 ? boneLength / dominantSize : 1;
    updateMaskLayer(part, {
      src,
      width: w,
      height: h,
      baseScale,
      scale: baseScale,
      offsetX: 0,
      offsetY: 0,
      rotationDeg: 0,
      opacity: 1,
    });
    setSelectedCutoutPieceId(null);
    if (autoAdvanceJoint) {
      const next = getNextEmptyJoint(part);
      if (next) selectSinglePartBase(next);
    }
  }, [cutoutPieces, getBoneLengthForPart, updateMaskLayer, autoAdvanceJoint, getNextEmptyJoint, selectSinglePartBase]);

  const rebuildPieceFromLabels = useCallback((labelId: number, shapeId: string) => {
    const labelMap = cutoutLabelMapRef.current;
    const imageData = cutoutImageDataRef.current;
    if (!labelMap || !imageData) return null;
    const { labels, width, height } = labelMap;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = row + x;
        if (labels[idx] !== labelId) continue;
        area += 1;
        sumX += x;
        sumY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (area === 0) return null;
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const fillRatio = area / (w * h);
    const preview = buildCutoutPreviews(labels, imageData, [{
      labelId,
      shapeId,
      bbox: { x: minX, y: minY, w, h },
      area,
      center: { x: sumX / area, y: sumY / area },
      fillRatio,
    }])[0];
    return preview;
  }, [buildCutoutPreviews]);

  const svgPointToSheetPoint = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current || !cutoutSheet) return null;
    const svgPoint = svgRef.current.createSVGPoint();
    svgPoint.x = clientX;
    svgPoint.y = clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return null;
    const transformed = svgPoint.matrixTransform(ctm.inverse());
    const sheetOriginX = -((cutoutSheet.width * cutoutScale) / 2) + cutoutOffset.x;
    const sheetOriginY = -((cutoutSheet.height * cutoutScale) / 2) + cutoutOffset.y;
    const sx = (transformed.x - sheetOriginX) / cutoutScale;
    const sy = (transformed.y - sheetOriginY) / cutoutScale;
    return { x: clamp(sx, 0, cutoutSheet.width), y: clamp(sy, 0, cutoutSheet.height) };
  }, [cutoutOffset.x, cutoutOffset.y, cutoutScale, cutoutSheet]);

  const getPieceAtPoint = useCallback((clientX: number, clientY: number) => {
    const point = svgPointToSheetPoint(clientX, clientY);
    const labelMap = cutoutLabelMapRef.current;
    if (!point || !labelMap) return null;
    const { labels, width, height } = labelMap;
    const x = clamp(Math.floor(point.x), 0, width - 1);
    const y = clamp(Math.floor(point.y), 0, height - 1);
    const labelId = labels[y * width + x];
    if (labelId === -1) return null;
    return cutoutPieces.find(piece => piece.labelId === labelId) || null;
  }, [cutoutPieces, svgPointToSheetPoint]);

  const mergePieces = useCallback((target: typeof cutoutPieces[number], source: typeof cutoutPieces[number]) => {
    const labelMap = cutoutLabelMapRef.current;
    if (!labelMap) return;
    const { labels } = labelMap;
    for (let i = 0; i < labels.length; i += 1) {
      if (labels[i] === source.labelId) {
        labels[i] = target.labelId;
      }
    }
    const rebuilt = rebuildPieceFromLabels(target.labelId, target.shapeId);
    if (!rebuilt) return;
    setCutoutPieces(prev => prev.filter(piece => piece.id !== source.id).map(piece => (
      piece.id === target.id ? rebuilt : piece
    )));
    setSelectedCutoutPieceId(rebuilt.id);
  }, [rebuildPieceFromLabels]);

  const eraseAtPoint = useCallback((clientX: number, clientY: number) => {
    if (!selectedCutoutPieceId) return;
    const piece = cutoutPieces.find(p => p.id === selectedCutoutPieceId);
    const labelMap = cutoutLabelMapRef.current;
    const point = svgPointToSheetPoint(clientX, clientY);
    if (!piece || !labelMap || !point) return;
    const { labels, width, height } = labelMap;
    const radius = Math.max(2, cutoutEraseSize);
    const r2 = radius * radius;
    const cx = Math.floor(point.x);
    const cy = Math.floor(point.y);
    const x0 = clamp(cx - radius, 0, width - 1);
    const x1 = clamp(cx + radius, 0, width - 1);
    const y0 = clamp(cy - radius, 0, height - 1);
    const y1 = clamp(cy + radius, 0, height - 1);
    for (let y = y0; y <= y1; y += 1) {
      const row = y * width;
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const idx = row + x;
        if (labels[idx] === piece.labelId) labels[idx] = -1;
      }
    }
  }, [cutoutEraseSize, cutoutPieces, selectedCutoutPieceId, svgPointToSheetPoint]);

  const handleSliceMouseDown = useCallback((e: React.MouseEvent<SVGRectElement, MouseEvent>) => {
    if (!cutoutSheet) return;
    e.stopPropagation();
    if (cutoutTool === 'select') {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
      longPressTriggeredRef.current = false;
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        sensitivityDragRef.current = { startY: e.clientY, startSensitivity: cutoutSensitivity };
        setIsAdjustingSensitivity(true);
      }, 300);
      return;
    }
    const point = svgPointToSheetPoint(e.clientX, e.clientY);
    if (!point) return;
    if (cutoutTool === 'rect' || cutoutTool === 'circle') {
      shapeDragRef.current = { startX: point.x, startY: point.y };
      setCutoutDraftShape({
        type: cutoutTool,
        bbox: { x: point.x, y: point.y, w: 0, h: 0 },
      });
      return;
    }
    if (cutoutTool === 'freehand') {
      shapeDragRef.current = { startX: point.x, startY: point.y };
      setCutoutDraftShape({
        type: 'freehand',
        bbox: { x: point.x, y: point.y, w: 0, h: 0 },
        points: [point],
      });
      return;
    }
    if (cutoutTool === 'erase') {
      if (!selectedCutoutPieceId) return;
      isErasingRef.current = true;
      setCutoutIsErasing(true);
      eraseAtPoint(e.clientX, e.clientY);
    }
  }, [cutoutSensitivity, cutoutSheet, cutoutTool, eraseAtPoint, selectedCutoutPieceId, svgPointToSheetPoint]);

  const handleSliceMouseUp = useCallback((e: React.MouseEvent<SVGRectElement, MouseEvent>) => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (cutoutTool === 'select') {
      const picked = getPieceAtPoint(e.clientX, e.clientY);
      if (picked) {
        setSelectedCutoutPieceId(picked.id);
      }
    }
    longPressTriggeredRef.current = false;
  }, [cutoutTool, getPieceAtPoint]);

  const handleSliceDoubleClick = useCallback((e: React.MouseEvent<SVGRectElement, MouseEvent>) => {
    if (cutoutTool !== 'select') return;
    const picked = getPieceAtPoint(e.clientX, e.clientY);
    if (!picked) return;
    if (selectedCutoutPieceId && picked.id !== selectedCutoutPieceId) {
      const target = cutoutPieces.find(p => p.id === selectedCutoutPieceId);
      if (target) {
        mergePieces(target, picked);
      }
    } else {
      setSelectedCutoutPieceId(picked.id);
    }
  }, [cutoutPieces, cutoutTool, getPieceAtPoint, mergePieces, selectedCutoutPieceId]);

  useEffect(() => {
    if (!cutoutSheet) {
      setCutoutPieces([]);
      cutoutImageRef.current = null;
      cutoutImageDataRef.current = null;
      cutoutLabelMapRef.current = null;
      return;
    }
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (cancelled) return;
      cutoutImageRef.current = img;
      runCutoutDetection(img, cutoutSensitivity);
    };
    img.src = cutoutSheet.src;
    return () => {
      cancelled = true;
    };
  }, [cutoutSheet, runCutoutDetection]);

  useEffect(() => {
    if (!cutoutImageRef.current) return;
    const timer = setTimeout(() => {
      if (!cutoutImageRef.current) return;
      runCutoutDetection(cutoutImageRef.current, cutoutSensitivity);
    }, 120);
    return () => clearTimeout(timer);
  }, [cutoutSensitivity, runCutoutDetection]);

  useEffect(() => {
    if (!isAdjustingSensitivity) return;
    const handleMove = (e: MouseEvent) => {
      if (!sensitivityDragRef.current) return;
      const deltaY = e.clientY - sensitivityDragRef.current.startY;
      const next = clamp(sensitivityDragRef.current.startSensitivity - deltaY * 0.003, 0, 1);
      setCutoutSensitivity(next);
    };
    const handleUp = () => {
      sensitivityDragRef.current = null;
      setIsAdjustingSensitivity(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isAdjustingSensitivity]);

  useEffect(() => {
    if (!cutoutDraftShape && !cutoutIsErasing) return;
    const handleMove = (e: MouseEvent) => {
      if (cutoutDraftShape) {
        const point = svgPointToSheetPoint(e.clientX, e.clientY);
        if (!point || !shapeDragRef.current) return;
        if (cutoutDraftShape.type === 'freehand') {
          const nextPoints = [...(cutoutDraftShape.points || []), point];
          const xs = nextPoints.map(p => p.x);
          const ys = nextPoints.map(p => p.y);
          const x0 = Math.min(...xs);
          const y0 = Math.min(...ys);
          const x1 = Math.max(...xs);
          const y1 = Math.max(...ys);
          setCutoutDraftShape({
            type: 'freehand',
            points: nextPoints,
            bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
          });
        } else {
          const x0 = Math.min(shapeDragRef.current.startX, point.x);
          const y0 = Math.min(shapeDragRef.current.startY, point.y);
          const x1 = Math.max(shapeDragRef.current.startX, point.x);
          const y1 = Math.max(shapeDragRef.current.startY, point.y);
          setCutoutDraftShape(prev => prev ? ({
            ...prev,
            bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
          }) : prev);
        }
      }
      if (cutoutIsErasing) {
        eraseAtPoint(e.clientX, e.clientY);
      }
    };
    const handleUp = () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (cutoutDraftShape) {
        const id = `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const nextShape = {
          id,
          type: cutoutDraftShape.type,
          bbox: cutoutDraftShape.bbox,
          points: cutoutDraftShape.points,
        };
        if (nextShape.bbox.w > 2 && nextShape.bbox.h > 2) {
          setCutoutShapes(prev => [...prev, nextShape]);
          setCutoutActiveShapeId(id);
        }
        setCutoutDraftShape(null);
        shapeDragRef.current = null;
      }
      if (cutoutIsErasing) {
        setCutoutIsErasing(false);
        isErasingRef.current = false;
        if (selectedCutoutPieceId) {
          const piece = cutoutPieces.find(p => p.id === selectedCutoutPieceId);
          if (piece) {
            const rebuilt = rebuildPieceFromLabels(piece.labelId, piece.shapeId);
            if (!rebuilt) {
              setCutoutPieces(prev => prev.filter(p => p.id !== piece.id));
              setSelectedCutoutPieceId(null);
            } else {
              setCutoutPieces(prev => prev.map(p => (p.id === piece.id ? rebuilt : p)));
              setSelectedCutoutPieceId(rebuilt.id);
            }
          }
        }
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [cutoutDraftShape, cutoutIsErasing, cutoutPieces, eraseAtPoint, rebuildPieceFromLabels, selectedCutoutPieceId, svgPointToSheetPoint]);

  const selectSinglePart = useCallback((part: PartName) => {
    selectSinglePartBase(part);
    if (selectedCutoutPieceId) {
      applyCutoutPieceToPart(selectedCutoutPieceId, part);
    }
  }, [applyCutoutPieceToPart, selectSinglePartBase, selectedCutoutPieceId]);

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
        if (autoAdvanceJoint) {
          const next = getNextEmptyJoint(primarySelectedPart);
          if (next) selectSinglePart(next);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [primarySelectedPart, updateMaskLayer, getBoneLengthForPart, autoAdvanceJoint, getNextEmptyJoint, selectSinglePart]);

  const handleExportMasks = useCallback(() => {
    const payload = {
      version: 1,
      cutoutSheet,
      detection: {
        sensitivity: cutoutSensitivity,
        mergeGap: cutoutMergeGap,
        ignoreText: cutoutIgnoreText,
        tool: cutoutTool,
        eraseSize: cutoutEraseSize,
        shapes: cutoutShapes,
      },
      jointParents: jointParentOverrides,
      pieces: cutoutPieces.map(piece => ({
        id: piece.id,
        labelId: piece.labelId,
        bbox: piece.bbox,
        area: piece.area,
        center: piece.center,
        fillRatio: piece.fillRatio,
      })),
      masks: Object.fromEntries(
        Object.entries(maskLayers).filter(([, layer]) => Boolean(layer.src))
      ),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'cutout-masks.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }, [cutoutEraseSize, cutoutIgnoreText, cutoutMergeGap, cutoutPieces, cutoutSensitivity, cutoutShapes, cutoutSheet, cutoutTool, maskLayers]);

  

  return (
    <div className="w-full h-full bg-mono-darker shadow-2xl flex flex-col relative touch-none fixed inset-0 z-50 overflow-hidden text-ink font-mono">
      <div className="flex h-full w-full">
        <aside
          className="w-72 flex flex-col overflow-hidden z-10 flex-shrink-0 border-r border-white/10"
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
                  onClick={cycleRenderMode}
                  className={`p-2 rounded border transition-all ${
                    renderMode === 'default'
                      ? 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
                      : renderMode === 'wireframe'
                        ? 'bg-accent-green/20 border-accent-green/50 text-accent-green'
                        : renderMode === 'silhouette'
                          ? 'bg-accent-purple/20 border-accent-purple/50 text-accent-purple'
                          : renderMode === 'backlight'
                            ? 'bg-accent-red/20 border-accent-red/50 text-accent-red'
                            : 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                  }`}
                  aria-label={`Aesthetic Engine. Current: ${getRenderModeDisplayName(renderMode)}`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-widest">Aesthetic Engine</span>
                </button>
                <button
                  onClick={() => backgroundUploadInputRef.current?.click()}
                  className="p-2 rounded border bg-white/10 border-white/20 text-white/70 hover:bg-white/20 transition-all"
                  aria-label="Upload background"
                  title="Upload background"
                >
                  +
                </button>
                <input
                  ref={backgroundUploadInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBackgroundUpload}
                  className="hidden"
                />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-end gap-2">
              <span className="text-[7px] uppercase text-white/50">BG LIGHT</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(backgroundLight * 100)}
                onChange={e => setBackgroundLight(Math.min(1, Math.max(0, Number(e.target.value) / 100)))}
                className="w-28 accent-selection"
                aria-label="Background light overlay"
              />
            </div>

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
            <button 
              onClick={() => setActiveTab('puppyt')}
              className={`flex-1 py-1 text-[9px] font-bold tracking-widest transition-all ${activeTab === 'puppyt' ? 'text-focus-ring border-b-2 border-focus-ring' : 'text-white/40 hover:text-white/70'}`}
            >
              PUPPYT
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
          {activeTab === 'model' ? (
            <>
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
                            ? 'bg-white/5 border-transparent text-white cursor-not-allowed'
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
                      : 'bg-white/5 border-transparent text-white cursor-not-allowed'
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
                      : 'bg-white/5 border-transparent text-white cursor-not-allowed'
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
                  {(['default', 'wireframe', 'silhouette', 'backlight', 'colorwheel'] as RenderMode[]).map(mode => (
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
                <span className="text-white/40 text-[8px] uppercase mt-4">Background</span>
                <div className="grid grid-cols-3 gap-1 items-center">
                  {backgroundOptions.map(option => (
                    <button
                      key={option.id}
                      onClick={() => setBackgroundPreset(option.id)}
                      className={`text-[9px] text-center px-1 py-0.5 transition-all border flex items-center justify-center gap-1 ${
                        backgroundPreset === option.id
                          ? 'bg-accent-green/30 border-accent-green text-accent-green'
                          : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                      }`}
                      aria-pressed={backgroundPreset === option.id}
                      aria-label={`Set background to ${option.label}`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-sm border border-white/30"
                        style={{ backgroundColor: option.color || '#E5E7EB' }}
                      />
                      <span>{option.label}</span>
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
          ) : activeTab === 'animation' ? (
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
          ) : (
            <>
              <div className="grid grid-cols-4 gap-1 mb-3">
                {(['upload', 'slice', 'rig', 'pose'] as const).map(step => (
                  <button
                    key={step}
                    onClick={() => setWorkflowStep(step)}
                    className={`py-1 text-[9px] font-bold uppercase border transition-all ${
                      workflowStep === step
                        ? 'bg-selection text-paper border-selection'
                        : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'
                    }`}
                  >
                    {step}
                  </button>
                ))}
              </div>

                <div className="mb-3 border border-white/10 p-2 rounded bg-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase font-bold text-white/70">Assist</span>
                    <button
                    onClick={() => setShowJointLabels(prev => !prev)}
                    className={`text-[8px] px-2 py-1 border uppercase ${
                      showJointLabels ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    Labels {showJointLabels ? 'On' : 'Off'}
                  </button>
                </div>

                <div className="mb-3 border border-white/10 p-2 rounded bg-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase font-bold text-white/70">Proportions</span>
                    <span className="text-[8px] text-white/40">Mirrored L/R</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[8px] text-white/40">
                        <span>Arms</span>
                        <span>{proportionScales.arm.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={140}
                        value={Math.round(proportionScales.arm * 100)}
                        onChange={e => setProportionScales(prev => ({ ...prev, arm: Number(e.target.value) / 100 }))}
                        className="w-full accent-selection"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[8px] text-white/40">
                        <span>Legs</span>
                        <span>{proportionScales.leg.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={140}
                        value={Math.round(proportionScales.leg * 100)}
                        onChange={e => setProportionScales(prev => ({ ...prev, leg: Number(e.target.value) / 100 }))}
                        className="w-full accent-selection"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[8px] text-white/40">
                        <span>Torso</span>
                        <span>{proportionScales.torso.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min={70}
                        max={130}
                        value={Math.round(proportionScales.torso * 100)}
                        onChange={e => setProportionScales(prev => ({ ...prev, torso: Number(e.target.value) / 100 }))}
                        className="w-full accent-selection"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAutoMirrorLimbs(prev => !prev)}
                    className={`text-[9px] px-2 py-1 border uppercase ${
                      autoMirrorLimbs ? 'bg-accent-green/20 border-accent-green/40 text-accent-green' : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    Auto Mirror {autoMirrorLimbs ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => setAutoBuildFromLegs(prev => !prev)}
                    className={`text-[9px] px-2 py-1 border uppercase ${
                      autoBuildFromLegs ? 'bg-accent-purple/20 border-accent-purple/40 text-accent-purple' : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    Build From Legs {autoBuildFromLegs ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => setAutoAdvanceJoint(prev => !prev)}
                    className={`text-[9px] px-2 py-1 border uppercase ${
                      autoAdvanceJoint ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    Auto-Advance {autoAdvanceJoint ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => setPlacingJoint(prev => !prev)}
                    className={`text-[9px] px-2 py-1 border uppercase ${
                      placingJoint ? 'bg-accent-purple/20 border-accent-purple/40 text-accent-purple' : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    Place Joint {placingJoint ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => setPlacingAnchors(prev => !prev)}
                    className={`text-[9px] px-2 py-1 border uppercase ${
                      placingAnchors ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    Set Anchors {placingAnchors ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => setDragMaskMode(prev => !prev)}
                    className={`text-[9px] px-2 py-1 border uppercase ${
                      dragMaskMode ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    Drag Mask {dragMaskMode ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => setSnapToGrid(prev => !prev)}
                    className={`text-[9px] px-2 py-1 border uppercase ${
                      snapToGrid ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    Snap {snapToGrid ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => copyRightToLeft([[PartName.RShoulder, PartName.LShoulder], [PartName.RElbow, PartName.LElbow], [PartName.RWrist, PartName.LWrist]])}
                    className="text-[9px] px-2 py-1 border uppercase bg-white/5 border-white/10 text-white/40 hover:text-white/70"
                  >
                    Copy R→L Arm
                  </button>
                  <button
                    onClick={() => copyRightToLeft([[PartName.RThigh, PartName.LThigh], [PartName.RSkin, PartName.LSkin], [PartName.RAnkle, PartName.LAnkle]])}
                    className="text-[9px] px-2 py-1 border uppercase bg-white/5 border-white/10 text-white/40 hover:text-white/70"
                  >
                    Copy R→L Leg
                  </button>
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[8px] text-white/40">
                      <span>Grid</span>
                      <span>{gridSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={40}
                      step={1}
                      value={gridSize}
                      onChange={e => setGridSize(Number(e.target.value))}
                      className="w-full accent-selection"
                    />
                  </div>
                </div>
                <div className="text-[8px] text-white/40 mt-2">
                  Tip: Use “Drag Mask” to align pieces. “Set Anchors” places 1/2/3 points (point/line/shape).
                </div>
              </div>

              <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase font-bold text-white/70">Cutout Sheet</span>
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
                    <button
                      onClick={handleExportMasks}
                      disabled={!Object.values(maskLayers).some(layer => layer.src)}
                      className={`w-full mt-2 text-[9px] px-2 py-1 border uppercase ${
                        Object.values(maskLayers).some(layer => layer.src)
                          ? 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
                          : 'bg-white/5 border-transparent text-white cursor-not-allowed'
                      }`}
                    >
                      Export Masks JSON
                    </button>
                  </div>
                )}
              </div>

              {workflowStep === 'slice' && (
                <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                  <div className="text-[9px] uppercase font-bold text-white/70">Slice (Lightweight)</div>
                  <p className="text-[8px] text-white/40 mt-1">
                    Assign cutout pieces to joints below. We keep slicing manual to stay lightweight.
                  </p>
                </div>
              )}

              <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] uppercase font-bold text-white/70">Joint Previews</span>
                  <span className="text-[8px] text-white/40">Click to select</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {JOINT_ORDER.map(part => {
                    const layer = maskLayers[part];
                    const hasMask = Boolean(layer.src);
                    return (
                      <button
                        key={`preview-${part}`}
                        onClick={() => selectSinglePart(part)}
                        className={`flex flex-col items-center gap-1 p-1 border text-[7px] uppercase ${
                          hasMask ? 'border-accent-green/40 bg-accent-green/10 text-accent-green' : 'border-white/10 bg-white/5 text-white/40'
                        }`}
                      >
                        <div className="w-10 h-10 bg-black/20 border border-white/10 flex items-center justify-center overflow-hidden">
                          {hasMask ? (
                            <img src={layer.src!} alt={part} className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[8px]">Empty</span>
                          )}
                        </div>
                        <span className="truncate w-full text-center">{part.replace(/([A-Z])/g, ' $1')}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(workflowStep === 'rig' || workflowStep === 'pose') && (
                <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                  <div className="text-[9px] uppercase font-bold text-white/70">Rig + Pose</div>
                  <p className="text-[8px] text-white/40 mt-1">
                    Select a joint on the mannequin, upload its cutout, then fine‑tune scale and offsets.
                  </p>
                  {workflowStep === 'rig' && (
                    <div className="mt-2 flex flex-col gap-2">
                      <button
                        onClick={() => setShowTPoseTemplate(prev => !prev)}
                        className={`text-[9px] px-2 py-1 border uppercase ${
                          showTPoseTemplate ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-white/10 text-white/40'
                        }`}
                      >
                        T‑Pose Template {showTPoseTemplate ? 'On' : 'Off'}
                      </button>
                      <div className="flex items-center justify-between text-[8px] text-white/50">
                        <span>Template Opacity</span>
                        <span>{Math.round(tPoseTemplateOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={90}
                        value={Math.round(tPoseTemplateOpacity * 100)}
                        onChange={e => setTPoseTemplateOpacity(Number(e.target.value) / 100)}
                        className="w-full accent-selection"
                      />
                    </div>
                  )}
                </div>
              )}

              {workflowStep === 'rig' && (
                <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                  <div className="text-[9px] uppercase font-bold text-white/70">Joint Parents</div>
                  <p className="text-[8px] text-white/40 mt-1">
                    Set parent/child relations for export. (Does not change the live rig yet.)
                  </p>
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                    {Object.values(PartName).map(part => (
                      <label key={`parent-${part}`} className="flex items-center gap-2 text-[9px] text-white/60">
                        <span className="w-20">{part.toUpperCase()}</span>
                        <select
                          value={jointParentOverrides[part] || ''}
                          onChange={e => {
                            const value = e.target.value as AnchorName | '';
                            setJointParentOverrides(prev => ({ ...prev, [part]: value ? value : null }));
                          }}
                          className="flex-1 bg-black/30 border border-white/10 text-white/70 text-[9px] px-1 py-0.5"
                        >
                          <option value="">NONE</option>
                          <option value="root">ROOT</option>
                          {Object.values(PartName).filter(p => p !== part).map(option => (
                            <option key={`parent-option-${part}-${option}`} value={option}>{option.toUpperCase()}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {workflowStep === 'slice' && (
                <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase font-bold text-white/70">Slice Helper</span>
                    <span className="text-[8px] text-white/40">
                      {JOINT_ORDER.filter(p => maskLayers[p].src).length}/{JOINT_ORDER.length}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const next = JOINT_ORDER.find(p => !maskLayers[p].src);
                      if (next) selectSinglePart(next);
                    }}
                    className="w-full mb-2 text-[9px] px-2 py-1 border uppercase bg-white/10 border-white/20 text-white/70 hover:bg-white/20"
                  >
                    Next Empty Joint
                  </button>
                  {selectedCutoutPieceId && (
                    <button
                      onClick={() => {
                        const next = JOINT_ORDER.find(p => !maskLayers[p].src);
                        if (next) applyCutoutPieceToPart(selectedCutoutPieceId, next);
                      }}
                      className="w-full mb-2 text-[9px] px-2 py-1 border uppercase bg-accent-purple/20 border-accent-purple/40 text-accent-purple hover:bg-accent-purple/30"
                    >
                      Assign Selected → Next
                    </button>
                  )}
                  <div className="grid grid-cols-1 gap-1 max-h-52 overflow-y-auto custom-scrollbar">
                    {JOINT_ORDER.map(part => {
                      const hasMask = Boolean(maskLayers[part].src);
                      return (
                        <button
                          key={`slice-${part}`}
                          onClick={() => selectSinglePart(part)}
                          className={`flex items-center gap-2 px-2 py-1 text-[9px] border transition-all ${
                            hasMask ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' : 'bg-white/5 border-white/10 text-white/50'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hasMask ? '#22c55e' : '#6b7280' }} />
                          <span className="flex-1 text-left">{part.replace(/([A-Z])/g, ' $1').toUpperCase()}</span>
                          <span className="text-[8px]">{hasMask ? 'DONE' : 'EMPTY'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {workflowStep === 'slice' && cutoutSheet && (
                <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase font-bold text-white/70">Tools</span>
                    <span className="text-[8px] text-white/40">Slice</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {(['select', 'rect', 'circle', 'freehand', 'erase'] as const).map(tool => (
                      <button
                        key={tool}
                        onClick={() => setCutoutTool(tool)}
                        className={`text-[9px] px-1 py-1 border uppercase ${
                          cutoutTool === tool
                            ? 'bg-selection text-paper border-selection'
                            : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'
                        }`}
                      >
                        {tool}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-[8px] text-white/40">
                    Draw a shape per piece. Double‑click to merge extra blobs. Long‑press to tweak sensitivity.
                  </div>
                  {cutoutTool === 'erase' && (
                    <>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[8px] text-white/40">Erase Size</span>
                        <span className="text-[8px] text-white/40">{Math.round(cutoutEraseSize)}px</span>
                      </div>
                      <input
                        type="range"
                        min={4}
                        max={48}
                        value={Math.round(cutoutEraseSize)}
                        onChange={e => setCutoutEraseSize(Number(e.target.value))}
                        className="w-full accent-selection"
                      />
                    </>
                  )}
                </div>
              )}

              {workflowStep === 'slice' && cutoutSheet && (
                <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase font-bold text-white/70">Detection</span>
                    <span className="text-[8px] text-white/40">{Math.round(cutoutSensitivity * 100)}%</span>
                  </div>
                  <div className="text-[8px] text-white/40 mb-2">
                    Drag on the canvas to tune sensitivity. Higher = more pieces.
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(cutoutSensitivity * 100)}
                    onChange={e => setCutoutSensitivity(Number(e.target.value) / 100)}
                    className="w-full accent-selection"
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[8px] text-white/40">Merge Gap</span>
                    <span className="text-[8px] text-white/40">{Math.round(cutoutMergeGap)}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    value={Math.round(cutoutMergeGap)}
                    onChange={e => setCutoutMergeGap(Number(e.target.value))}
                    className="w-full accent-selection"
                  />
                  <label className="mt-2 flex items-center gap-2 text-[8px] text-white/50">
                    <input
                      type="checkbox"
                      checked={cutoutIgnoreText}
                      onChange={e => setCutoutIgnoreText(e.target.checked)}
                      className="accent-selection"
                    />
                    Ignore text-like fragments
                  </label>
                </div>
              )}

              {workflowStep === 'slice' && cutoutSheet && (
                <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase font-bold text-white/70">Shapes</span>
                    <span className="text-[8px] text-white/40">{cutoutShapes.length}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto custom-scrollbar">
                    {cutoutShapes.map(shape => (
                      <button
                        key={shape.id}
                        onClick={() => setCutoutActiveShapeId(shape.id)}
                        className={`flex items-center justify-between text-[9px] px-2 py-1 border ${
                          cutoutActiveShapeId === shape.id
                            ? 'bg-selection/20 border-selection text-selection'
                            : 'bg-white/5 border-white/10 text-white/50'
                        }`}
                      >
                        <span>{shape.type.toUpperCase()}</span>
                        <span className="text-[8px]">
                          {Math.round(shape.bbox.w)}×{Math.round(shape.bbox.h)}
                        </span>
                      </button>
                    ))}
                    {cutoutShapes.length === 0 && (
                      <div className="text-[8px] text-white/40">No shapes yet.</div>
                    )}
                  </div>
                  {cutoutActiveShapeId && (
                    <button
                      onClick={() => {
                        setCutoutShapes(prev => prev.filter(shape => shape.id !== cutoutActiveShapeId));
                        setCutoutActiveShapeId(null);
                      }}
                      className="mt-2 w-full text-[9px] px-2 py-1 border uppercase bg-white/5 border-white/10 text-white/40"
                    >
                      Delete Selected Shape
                    </button>
                  )}
                </div>
              )}

              {workflowStep === 'slice' && cutoutSheet && (
                <div className="mb-4 border border-white/10 p-2 rounded bg-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase font-bold text-white/70">Detected Pieces</span>
                    <span className="text-[8px] text-white/40">{cutoutPieces.length}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {cutoutPieces.map(piece => {
                      const isSelected = piece.id === selectedCutoutPieceId;
                      return (
                        <button
                          key={piece.id}
                          onClick={() => {
                            if (primarySelectedPart) {
                              applyCutoutPieceToPart(piece.id, primarySelectedPart);
                            } else {
                              setSelectedCutoutPieceId(piece.id);
                            }
                          }}
                          className={`border p-1 flex items-center justify-center bg-black/40 ${
                            isSelected ? 'border-selection' : 'border-white/10'
                          }`}
                          title="Click to assign to the active joint"
                        >
                          {piece.previewSrc ? (
                            <img src={piece.previewSrc} alt="cutout piece" className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[8px] text-white/30">No Preview</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {!primarySelectedPart && selectedCutoutPieceId && (
                    <div className="mt-2 text-[8px] text-accent-red">
                      Select a joint to assign the highlighted piece.
                    </div>
                  )}
                </div>
              )}

              {/* Cutout Maker */}
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
                            ? 'bg-white/5 border-transparent text-white cursor-not-allowed'
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
                              primarySelectedPart ? 'bg-white/10 border-white/20 text-white/70' : 'bg-white/5 border-transparent text-white cursor-not-allowed'
                            }`}
                          >
                            Upload
                          </button>
                          <button
                            onClick={() => primarySelectedPart && fitMaskToBone(primarySelectedPart)}
                            disabled={!primarySelectedPart}
                            className={`text-[9px] px-2 py-1 border ${
                              primarySelectedPart ? 'bg-white/10 border-white/20 text-white/70' : 'bg-white/5 border-transparent text-white cursor-not-allowed'
                            }`}
                          >
                            Fit
                          </button>
                          <button
                            onClick={() => primarySelectedPart && updateMaskLayer(primarySelectedPart, { src: null })}
                            disabled={!primarySelectedPart}
                            className={`text-[9px] px-2 py-1 border ${
                              primarySelectedPart ? 'bg-accent-red/20 border-accent-red/40 text-accent-red' : 'bg-white/5 border-transparent text-white cursor-not-allowed'
                            }`}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <input ref={maskUploadInputRef} type="file" accept="image/*" onChange={handleMaskUpload} className="hidden" />

                      {primarySelectedPart && maskLayers[primarySelectedPart]?.src && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="w-10 h-10 border border-white/10 bg-black/20 flex items-center justify-center overflow-hidden">
                            <img src={maskLayers[primarySelectedPart].src!} alt="mask preview" className="w-full h-full object-contain opacity-90" />
                          </div>
                          <div className="text-[8px] text-white/40 uppercase">Preview</div>
                        </div>
                      )}

                      {primarySelectedPart && maskLayers[primarySelectedPart]?.src && (
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center gap-2 text-[8px] text-white/40">
                            <button
                              onClick={() => updateMaskLayer(primarySelectedPart, { mirrorX: !maskLayers[primarySelectedPart].mirrorX })}
                              className={`px-2 py-0.5 border uppercase ${
                                maskLayers[primarySelectedPart].mirrorX ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-white/10 text-white/40'
                              }`}
                            >
                              Mirror {maskLayers[primarySelectedPart].mirrorX ? 'On' : 'Off'}
                            </button>
                          </div>
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
                          <div className="flex items-center justify-between text-[8px] text-white/40">
                            <span>Anchors</span>
                            <span>{(maskLayers[primarySelectedPart].jointAnchors || []).length}/3</span>
                          </div>
                          <button
                            onClick={() => updateMaskLayer(primarySelectedPart, { jointAnchors: [] })}
                            className="text-[9px] px-2 py-1 border uppercase bg-white/5 border-white/10 text-white/40"
                          >
                            Clear Anchors
                          </button>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="flex justify-between text-[8px] text-white/40"><span>Offset X</span><span>{Math.round(maskLayers[primarySelectedPart].offsetX)}</span></div>
                              <input
                                type="range"
                                min={-200}
                                max={200}
                                value={Math.round(maskLayers[primarySelectedPart].offsetX)}
                                step={snapToGrid ? gridSize : 1}
                                onChange={e => updateMaskLayer(primarySelectedPart, { offsetX: snapValue(Number(e.target.value)) })}
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
                                step={snapToGrid ? gridSize : 1}
                                onChange={e => updateMaskLayer(primarySelectedPart, { offsetY: snapValue(Number(e.target.value)) })}
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
            </>
          )}
          </div>
        </aside>

        <div
          className={`flex-1 flex items-center justify-center relative ${activeBackground.className || ''}`}
          style={
            backgroundImageSrc
              ? {
                  backgroundImage: `url(${backgroundImageSrc})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }
              : activeBackground.className
                ? undefined
                : {
                    backgroundColor: activeBackground.color,
                    backgroundImage: 'none',
                  }
          }
        >
          {backgroundLight > 0 && (
            <div
              className="absolute inset-0 z-10 pointer-events-none"
              style={{ backgroundColor: `rgba(255,255,255,${backgroundLight})` }}
              aria-hidden="true"
            />
          )}
          <Scanlines />
          {showSplash && (
            <div className="absolute top-[8%] left-0 right-0 z-30 flex items-center justify-center pointer-events-none">
              <h1 className="text-6xl font-archaic text-paper/80 animate-terminal-boot tracking-widest uppercase">BITRUVIUS</h1>
            </div>
          )}
          {renderMode === 'colorwheel' && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <div
                className="w-56 h-56 rounded-full"
                style={{
                  background: 'conic-gradient(from 0deg, #ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #007aff, #5856d6, #ff2d55, #ff3b30)',
                  boxShadow: '0 0 0 2px rgba(255,255,255,0.2), inset 0 0 30px rgba(0,0,0,0.35)',
                  maskImage: 'radial-gradient(circle, transparent 42%, black 43%)',
                  WebkitMaskImage: 'radial-gradient(circle, transparent 42%, black 43%)',
                }}
              />
            </div>
          )}
          
          <svg 
            ref={svgRef} 
            width="100%" 
            height="100%" 
            viewBox={autoViewBox} 
            className={`overflow-visible relative z-30 ${placingJoint ? 'cursor-crosshair' : ''}`} 
            onClick={handleCanvasClick}
          >
            <SystemGuides floorY={FLOOR_HEIGHT} /> 
            {workflowStep === 'rig' && showTPoseTemplate && tPoseTemplate && (
              <g opacity={tPoseTemplateOpacity}>
                <circle
                  cx={tPoseTemplate.circle.cx}
                  cy={tPoseTemplate.circle.cy}
                  r={tPoseTemplate.circle.r}
                  fill="none"
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth={2}
                />
                <rect
                  x={tPoseTemplate.square.x}
                  y={tPoseTemplate.square.y}
                  width={tPoseTemplate.square.size}
                  height={tPoseTemplate.square.size}
                  fill="none"
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth={2}
                />
                <line
                  x1={tPoseTemplate.vertical.x1}
                  y1={tPoseTemplate.vertical.y1}
                  x2={tPoseTemplate.vertical.x2}
                  y2={tPoseTemplate.vertical.y2}
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={1.5}
                />
                {tPoseTemplate.shoulders && (
                  <line
                    x1={tPoseTemplate.shoulders.x1}
                    y1={tPoseTemplate.shoulders.y1}
                    x2={tPoseTemplate.shoulders.x2}
                    y2={tPoseTemplate.shoulders.y2}
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth={1.5}
                  />
                )}
                {tPoseTemplate.hands && (
                  <line
                    x1={tPoseTemplate.hands.x1}
                    y1={tPoseTemplate.hands.y1}
                    x2={tPoseTemplate.hands.x2}
                    y2={tPoseTemplate.hands.y2}
                    stroke="rgba(255,255,255,0.35)"
                    strokeDasharray="6 6"
                    strokeWidth={1}
                  />
                )}
              </g>
            )}
            {showJointLabels && (
              <g>
                {PART_NAMES.map(part => {
                  const pos = jointPositions[part];
                  if (!pos) return null;
                  return (
                    <text
                      key={`label-${part}`}
                      x={pos.x + 8}
                      y={pos.y - 6}
                      fontSize={10}
                      fill="rgba(17,17,17,0.7)"
                      stroke="rgba(255,255,255,0.6)"
                      strokeWidth={0.5}
                      paintOrder="stroke"
                    >
                      {part.toUpperCase()}
                    </text>
                  );
                })}
              </g>
            )}
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
                proportionScales={proportionScales}
              />
            </g>
            {cutoutSheet && (
              <image
                href={cutoutSheet.src}
                x={-((cutoutSheet.width * cutoutScale) / 2) + cutoutOffset.x}
                y={-((cutoutSheet.height * cutoutScale) / 2) + cutoutOffset.y}
                width={cutoutSheet.width * cutoutScale}
                height={cutoutSheet.height * cutoutScale}
                opacity={cutoutOpacity}
                preserveAspectRatio="xMidYMid meet"
                pointerEvents="none"
              />
            )}
            {workflowStep === 'slice' && cutoutSheet && (
              <g>
                {[...cutoutShapes, ...(cutoutDraftShape ? [{
                  id: 'draft',
                  type: cutoutDraftShape.type,
                  bbox: cutoutDraftShape.bbox,
                  points: cutoutDraftShape.points,
                }] : [])].map(shape => {
                  const isActive = shape.id === cutoutActiveShapeId || shape.id === 'draft';
                  const x = -((cutoutSheet.width * cutoutScale) / 2) + cutoutOffset.x + shape.bbox.x * cutoutScale;
                  const y = -((cutoutSheet.height * cutoutScale) / 2) + cutoutOffset.y + shape.bbox.y * cutoutScale;
                  const w = shape.bbox.w * cutoutScale;
                  const h = shape.bbox.h * cutoutScale;
                  if (shape.type === 'circle') {
                    return (
                      <ellipse
                        key={`shape-${shape.id}`}
                        cx={x + w / 2}
                        cy={y + h / 2}
                        rx={Math.max(1, w / 2)}
                        ry={Math.max(1, h / 2)}
                        fill="rgba(56,189,248,0.08)"
                        stroke={isActive ? 'rgba(56,189,248,0.9)' : 'rgba(56,189,248,0.4)'}
                        strokeWidth={isActive ? 2 : 1}
                        pointerEvents="none"
                      />
                    );
                  }
                  if (shape.type === 'freehand' && shape.points && shape.points.length > 1) {
                    const d = shape.points.map((p, i) => {
                      const px = -((cutoutSheet.width * cutoutScale) / 2) + cutoutOffset.x + p.x * cutoutScale;
                      const py = -((cutoutSheet.height * cutoutScale) / 2) + cutoutOffset.y + p.y * cutoutScale;
                      return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
                    }).join(' ');
                    return (
                      <path
                        key={`shape-${shape.id}`}
                        d={`${d} Z`}
                        fill="rgba(56,189,248,0.08)"
                        stroke={isActive ? 'rgba(56,189,248,0.9)' : 'rgba(56,189,248,0.4)'}
                        strokeWidth={isActive ? 2 : 1}
                        pointerEvents="none"
                      />
                    );
                  }
                  return (
                    <rect
                      key={`shape-${shape.id}`}
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill="rgba(56,189,248,0.08)"
                      stroke={isActive ? 'rgba(56,189,248,0.9)' : 'rgba(56,189,248,0.4)'}
                      strokeWidth={isActive ? 2 : 1}
                      pointerEvents="none"
                    />
                  );
                })}
                {cutoutPieces.map(piece => {
                  const px = -((cutoutSheet.width * cutoutScale) / 2) + cutoutOffset.x + piece.bbox.x * cutoutScale;
                  const py = -((cutoutSheet.height * cutoutScale) / 2) + cutoutOffset.y + piece.bbox.y * cutoutScale;
                  const pw = piece.bbox.w * cutoutScale;
                  const ph = piece.bbox.h * cutoutScale;
                  const isSelected = piece.id === selectedCutoutPieceId;
                  return (
                    <rect
                      key={`piece-box-${piece.id}`}
                      x={px}
                      y={py}
                      width={pw}
                      height={ph}
                      fill="none"
                      stroke={isSelected ? '#E5E7EB' : 'rgba(255,255,255,0.2)'}
                      strokeWidth={isSelected ? 2 : 1}
                      pointerEvents="none"
                    />
                  );
                })}
                <g
                  transform={`translate(${viewBoxValues.x + 40}, ${viewBoxValues.y + 40})`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    sensitivityDragRef.current = { startY: e.clientY, startSensitivity: cutoutSensitivity };
                    setIsAdjustingSensitivity(true);
                  }}
                  style={{ cursor: 'ns-resize' }}
                >
                  <rect x={-10} y={-18} width={160} height={28} rx={6} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.2)" />
                  <text x={0} y={0} fill="rgba(255,255,255,0.7)" fontSize={10} fontWeight={700}>
                    Sensitivity {Math.round(cutoutSensitivity * 100)}%
                  </text>
                  <text x={0} y={12} fill="rgba(255,255,255,0.4)" fontSize={8}>
                    Drag up/down
                  </text>
                </g>
                <rect
                  x={viewBoxValues.x}
                  y={viewBoxValues.y}
                  width={viewBoxValues.w}
                  height={viewBoxValues.h}
                  fill="transparent"
                  style={{ cursor: cutoutTool === 'erase' ? 'crosshair' : 'default' }}
                  onMouseDown={handleSliceMouseDown}
                  onMouseUp={handleSliceMouseUp}
                  onDoubleClick={handleSliceDoubleClick}
                />
              </g>
            )}
          </svg>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-black/45 z-20" />
    </div>
  );
};

export default App;
