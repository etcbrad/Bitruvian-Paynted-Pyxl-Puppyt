import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { BoneVariant, WalkingEnginePivotOffsets, WalkingEngineProportions, Vector2D, WalkingEnginePose, JointMode } from './types';
import { ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT, RIGGING } from './constants'; 
import { Mannequin, getMannequinWorldTransformsHelper, partDefinitions } from './components/Mannequin';
import { Scanlines, SystemGuides } from './components/SystemGrid';
import { DraggablePanel } from './components/DraggablePanel';
import { COLORS } from './components/Bone';

const RESTING_BASE_POSE: WalkingEnginePose = {
  waist: 0, neck: 0, collar: 0, torso: 0,
  l_shoulder: 0, r_shoulder: 0,
  l_elbow: 0, r_elbow: 0,
  l_hand: 0, r_hand: 0,
  l_hip: 180, r_hip: 180, // Legs pointing straight down
  l_knee: 0, r_knee: 0,
  l_foot: 0, r_foot: 0,
  l_toe: 0, r_toe: 0,
  stride_phase: 0,
  y_offset: 0,
  x_offset: 0,
};

const DEFAULT_PROPORTIONS: WalkingEngineProportions = {
  head: { w: 1, h: 1 }, collar: { w: 1, h: 1 }, torso: { w: 1, h: 1 }, waist: { w: 1, h: 1 },
  l_upper_arm: { w: 1, h: 1 }, l_lower_arm: { w: 1, h: 1 }, l_hand: { w: 1, h: 1 },
  r_upper_arm: { w: 1, h: 1 }, r_lower_arm: { w: 1, h: 1 }, r_hand: { w: 1, h: 1 },
  l_upper_leg: { w: 1, h: 1 }, l_lower_leg: { w: 1, h: 1 }, l_foot: { w: 1, h: 1 }, l_toe: { w: 1, h: 1 },
  r_upper_leg: { w: 1, h: 1 }, r_lower_leg: { w: 1, h: 1 }, r_foot: { w: 1, h: 1 }, r_toe: { w: 1, h: 1 }
};

interface PanelRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
}

const App: React.FC = () => {
  const [activePose, setActivePose] = useState<WalkingEnginePose>(RESTING_BASE_POSE);
  const [baseUnitH] = useState(60);
  const [showPivots, setShowPivots] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [renderMode, setRenderMode] = useState<'default' | 'wireframe' | 'silhouette' | 'backlight'>('default');
  const [viewMode, setViewMode] = useState<'default' | 'lotte' | 'wide' | 'mobile' | 'zoomed'>('default');
  const [isPaused, setIsPaused] = useState(true);
  const [partColors, setPartColors] = useState<Record<keyof WalkingEngineProportions, string>>(() => 
    Object.keys(DEFAULT_PROPORTIONS).reduce((acc, key) => ({ ...acc, [key]: 'fill-mono-dark' }), {} as Record<keyof WalkingEngineProportions, string>)
  );
  const [partShapes, setPartShapes] = useState<Record<keyof WalkingEngineProportions, BoneVariant>>(() => 
    Object.keys(DEFAULT_PROPORTIONS).reduce((acc, key) => ({ 
      ...acc, 
      [key]: (partDefinitions as any)[key]?.variant || 'diamond' 
    }), {} as Record<keyof WalkingEngineProportions, BoneVariant>)
  );

  const [windowSize, setWindowSize] = useState({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  });

  // Panel Z-index management
  const [panelZIndices, setPanelZIndices] = useState<Record<string, number>>({
    'model-settings-panel': 102,
  });
  const nextZIndex = useRef<number>(103);

  const bringPanelToFront = useCallback((id: string) => {
    setPanelZIndices(prev => {
      const newZIndices = { ...prev };
      newZIndices[id] = nextZIndex.current++;
      return newZIndices;
    });
  }, []);

  // Panel Position/Size Management
  const [panelRects, setPanelRects] = useState<Record<string, PanelRect>>({
    'model-settings-panel': { id: 'model-settings-panel', x: window.innerWidth - 224 - 16, y: 16, width: 224, height: 700, minimized: true },
  });

  const updatePanelRect = useCallback((id: string, newRect: Omit<PanelRect, 'x' | 'y'>) => {
    setPanelRects(prev => {
      const existingRect = prev[id];
      if (!existingRect || existingRect.width !== newRect.width || existingRect.height !== newRect.height || existingRect.minimized !== newRect.minimized) {
        return { ...prev, [id]: { ...existingRect, ...newRect } };
      }
      return prev;
    });
  }, []);

  const updatePanelPosition = useCallback((id: string, newX: number, newY: number, minimized: boolean) => {
    setPanelRects(prev => {
      const existingRect = prev[id];
      if (!existingRect || existingRect.x !== newX || existingRect.y !== newY || existingRect.minimized !== minimized) {
        return { ...prev, [id]: { ...existingRect, x: newX, y: newY, minimized: minimized } };
      }
      return prev;
    });
  }, []);

  // Dynamic viewBox calculation
  const autoViewBox = useMemo(() => {
    const configs = {
      zoomed: { x: -900, y: 1950, w: 1800, h: 1550 },
      default: { x: -1112.5, y: 1287.5, w: 2225, h: 2212.5 },
      lotte: { x: -1325, y: 625, w: 2650, h: 2875 },
      wide: { x: -1750, y: -700, w: 3500, h: 4200 },
    };

    if (viewMode === 'mobile') {
      const screenAspectRatio = windowSize.innerWidth / windowSize.innerHeight;
      const mannequinIntrinsicHeight = baseUnitH * 12; // Approximate height
      const verticalPaddingRatio = 0.20;
      const contentHeightInSVGUnits = mannequinIntrinsicHeight * (1 + verticalPaddingRatio);
      const viewBoxHeight = contentHeightInSVGUnits;
      const viewBoxWidth = viewBoxHeight * screenAspectRatio;
      const groundPlaneBuffer = 20;
      const desiredViewBoxBottom = baseUnitH * 10 + groundPlaneBuffer;
      const viewBoxY = desiredViewBoxBottom - viewBoxHeight;
      const viewBoxX = -viewBoxWidth / 2;
      return `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`;
    } else {
      const c = configs[viewMode];
      return `${c.x} ${c.y} ${c.w} ${c.h}`;
    }
  }, [viewMode, windowSize.innerWidth, windowSize.innerHeight, baseUnitH]);

  const handleAnchorMouseDown = useCallback((boneKey: keyof WalkingEnginePivotOffsets) => {
    console.log('Anchor clicked:', boneKey);
  }, []);

  const handlePoseUpdate = useCallback((updates: Partial<WalkingEnginePose>) => {
    setActivePose(prev => ({ ...prev, ...updates }));
  }, []);

  const handlePartColorChange = useCallback((partKey: keyof WalkingEngineProportions, color: string) => {
    setPartColors(prev => ({ ...prev, [partKey]: color }));
  }, []);

  const handlePartShapeChange = useCallback((partKey: keyof WalkingEngineProportions, shape: BoneVariant) => {
    setPartShapes(prev => ({ ...prev, [partKey]: shape }));
  }, []);

  const resetPose = useCallback(() => {
    setActivePose(RESTING_BASE_POSE);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="w-full h-screen bg-paper text-ink overflow-hidden relative">
      <DraggablePanel
        id="model-settings-panel"
        title="MODEL SETTINGS"
        x={panelRects['model-settings-panel'].x}
        y={panelRects['model-settings-panel'].y}
        minimized={panelRects['model-settings-panel'].minimized}
        onBringToFront={bringPanelToFront}
        currentZIndex={panelZIndices['model-settings-panel'] || 102}
        onUpdateRect={updatePanelRect}
        onUpdatePosition={updatePanelPosition}
        allPanelRects={Object.values(panelRects)}
      >
        {/* Display Mode Controls */}
        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-1">
            <span className="text-white/40 text-[8px] uppercase">Display_Mode</span>
            <div className="grid grid-cols-2 gap-1">
              {(['default', 'wireframe', 'silhouette', 'backlight'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setRenderMode(mode)}
                  className={`text-[9px] px-1 py-0.5 transition-all border ${
                    renderMode === mode
                      ? 'bg-accent-green/30 border-accent-green text-accent-green'
                      : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                  }`}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Viewport Controls */}
          <div className="flex flex-col gap-1">
            <span className="text-white/40 text-[8px] uppercase">Viewport_Zoom</span>
            <div className="grid grid-cols-2 gap-1">
              {(['default', 'lotte', 'wide', 'mobile', 'zoomed'] as const).map(_mode => (
                <button
                  key={_mode}
                  onClick={() => setViewMode(_mode)}
                  className={`text-[9px] px-1 py-0.5 transition-all border ${
                    viewMode === _mode
                      ? 'bg-accent-green/30 border-accent-green text-accent-green'
                      : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                  }`}
                >
                  {_mode.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Toggle Controls */}
          <div className="flex flex-col gap-1">
            <span className="text-white/40 text-[8px] uppercase">Options</span>
            <label className="flex items-center gap-2 text-[9px]">
              <input
                type="checkbox"
                checked={showPivots}
                onChange={(e) => setShowPivots(e.target.checked)}
                className="w-3 h-3"
              />
              Show Pivots
            </label>
            <label className="flex items-center gap-2 text-[9px]">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="w-3 h-3"
              />
              Show Labels
            </label>
          </div>

          {/* Part Color Controls */}
          <div className="flex flex-col gap-1">
            <span className="text-white/40 text-[8px] uppercase">Part_Colors</span>
            <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto custom-scrollbar">
              {Object.entries(partColors).map(([partKey, color]) => (
                <div key={partKey} className="flex items-center gap-1">
                  <span className="text-[7px] truncate flex-1">{partKey}</span>
                  <select
                    value={color}
                    onChange={(e) => handlePartColorChange(partKey as keyof WalkingEngineProportions, e.target.value)}
                    className="text-[7px] bg-white/10 border border-white/20 rounded px-1 py-0.5 flex-1"
                  >
                    <option value="fill-mono-dark">Dark</option>
                    <option value="fill-mono-mid">Mid</option>
                    <option value="fill-mono-light">Light</option>
                    <option value="fill-selection">Selection</option>
                    <option value="fill-olive">Olive</option>
                    <option value="fill-accent-red">Red</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Part Shape Controls */}
          <div className="flex flex-col gap-1">
            <span className="text-white/40 text-[8px] uppercase">Part_Shapes</span>
            <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto custom-scrollbar">
              {Object.entries(partShapes).map(([partKey, shape]) => (
                <div key={partKey} className="flex items-center gap-1">
                  <span className="text-[7px] truncate flex-1">{partKey}</span>
                  <select
                    value={shape}
                    onChange={(e) => handlePartShapeChange(partKey as keyof WalkingEngineProportions, e.target.value as BoneVariant)}
                    className="text-[7px] bg-white/10 border border-white/20 rounded px-1 py-0.5 flex-1"
                  >
                    <option value="diamond">Diamond</option>
                    <option value="capsule">Capsule</option>
                    <option value="triangle">Triangle</option>
                    <option value="triangle-up">Triangle Up</option>
                    <option value="trapezoid">Trapezoid</option>
                    <option value="trapezoid-up">Trapezoid Up</option>
                    <option value="pentagon">Pentagon</option>
                    <option value="head-tall-oval">Head Oval</option>
                    <option value="collar-horizontal-oval-shape">Collar Oval</option>
                    <option value="torso-teardrop-pointy-down">Torso Teardrop</option>
                    <option value="waist-teardrop-pointy-up">Waist Teardrop</option>
                    <option value="deltoid-shape">Deltoid</option>
                    <option value="limb-tapered">Limb Tapered</option>
                    <option value="hand-foot-arrowhead-shape">Arrowhead</option>
                    <option value="foot-block-shape">Foot Block</option>
                    <option value="toe-rounded-cap">Toe Cap</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Pose Controls */}
          <div className="flex flex-col gap-1">
            <span className="text-white/40 text-[8px] uppercase">Pose_Controls</span>
            <button
              onClick={resetPose}
              className="text-[9px] px-2 py-1 bg-accent-red/20 border border-accent-red text-accent-red hover:bg-accent-red/30 transition-all"
            >
              RESET POSE
            </button>
            
            {/* Basic pose adjustments */}
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => handlePoseUpdate({ waist: activePose.waist + 5 })}
                className="text-[8px] px-1 py-0.5 bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 transition-all"
              >
                WAIST +
              </button>
              <button
                onClick={() => handlePoseUpdate({ waist: activePose.waist - 5 })}
                className="text-[8px] px-1 py-0.5 bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 transition-all"
              >
                WAIST -
              </button>
              <button
                onClick={() => handlePoseUpdate({ torso: activePose.torso + 5 })}
                className="text-[8px] px-1 py-0.5 bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 transition-all"
              >
                TORSO +
              </button>
              <button
                onClick={() => handlePoseUpdate({ torso: activePose.torso - 5 })}
                className="text-[8px] px-1 py-0.5 bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 transition-all"
              >
                TORSO -
              </button>
              <button
                onClick={() => handlePoseUpdate({ l_shoulder: activePose.l_shoulder + 5 })}
                className="text-[8px] px-1 py-0.5 bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 transition-all"
              >
                L.SHOULDER +
              </button>
              <button
                onClick={() => handlePoseUpdate({ l_shoulder: activePose.l_shoulder - 5 })}
                className="text-[8px] px-1 py-0.5 bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 transition-all"
              >
                L.SHOULDER -
              </button>
              <button
                onClick={() => handlePoseUpdate({ r_shoulder: activePose.r_shoulder + 5 })}
                className="text-[8px] px-1 py-0.5 bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 transition-all"
              >
                R.SHOULDER +
              </button>
              <button
                onClick={() => handlePoseUpdate({ r_shoulder: activePose.r_shoulder - 5 })}
                className="text-[8px] px-1 py-0.5 bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 transition-all"
              >
                R.SHOULDER -
              </button>
            </div>
          </div>
        </div>
      </DraggablePanel>

      {/* Main Canvas */}
      <div className="w-full h-full bg-selection-super-light bg-triangle-grid flex items-center justify-center relative">
        <Scanlines />
        
        <svg 
          width="100%" 
          height="100%" 
          viewBox={autoViewBox} 
          className="overflow-visible relative z-10" 
        >
          <SystemGuides floorY={baseUnitH * 10} baseUnitH={baseUnitH} /> 
          <g>
            <Mannequin
              pose={activePose}
              pivotOffsets={activePose}
              props={DEFAULT_PROPORTIONS}
              showPivots={showPivots}
              showLabels={showLabels}
              baseUnitH={baseUnitH}
              onAnchorMouseDown={handleAnchorMouseDown}
              draggingBoneKey={null}
              isPaused={isPaused}
              pinningMode="none"
              offset={{ x: 0, y: 0 }}
              isReversed={false}
              jointModes={Object.keys(DEFAULT_PROPORTIONS).reduce((acc, key) => ({ 
                ...acc, 
                [key]: 'fk' as JointMode 
              }), {} as Record<keyof WalkingEngineProportions, JointMode>)}
              disabledJoints={Object.keys(DEFAULT_PROPORTIONS).reduce((acc, key) => ({ 
                ...acc, 
                [key]: false 
              }), {} as Record<keyof WalkingEngineProportions, boolean>)}
              hiddenBoneKeys={new Set()}
              partShapes={partShapes}
              partColors={partColors}
            />
          </g>
        </svg>
      </div>
    </div>
  );
};

export default App;
