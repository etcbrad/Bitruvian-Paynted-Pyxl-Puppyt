

import React, { useMemo } from 'react';
import { BoneVariant, Vector2D, WalkingEnginePivotOffsets, WalkingEngineProportions } from '../types';
import { adjustBrightness } from '../utils/color-utils';

export interface BoneProps { 
  rotation: number;
  length: number; 
  width?: number; 
  variant?: BoneVariant;
  showPivots?: boolean;
  showOverlay?: boolean;
  visible?: boolean;
  offset?: Vector2D;
  className?: string;
  children?: React.ReactNode;
  drawsUpwards?: boolean;
  colorClass?: string;
  fillOverride?: string;
  showLabel?: boolean;
  label?: string;
  boneKey?: keyof WalkingEnginePivotOffsets; 
  proportionKey?: keyof WalkingEngineProportions; 
  onAnchorMouseDown?: (boneKey: keyof WalkingEnginePivotOffsets, event: React.MouseEvent) => void;
  isBeingDragged?: boolean;
  isPausedAndPivotsVisible?: boolean;
  patternFillId?: string;
  isPinned?: boolean;
  isInActiveChain?: boolean;
  isSelected?: boolean;
  renderMode?: 'default' | 'wireframe' | 'silhouette' | 'backlight';
  partCategory?: string;
  jointConstraintMode?: 'fk' | 'ik' | 'stretch' | 'curl';
}

export const COLORS = {
  ANCHOR_RED: "#F87171", // Anchor dots explicitly red
  SELECTION: "#D1D5DB", // Changed from yellow to a light monochrome shade
  RIDGE: "#333333", // For wireframe stroke - kept dark
  PIN_HIGHLIGHT: "#D1D5DB", // Changed from green to light monochrome for active pin
  DEFAULT_FILL: "#000000", // Fallback / solid black for silhouette
  FOCUS_RING: "#374151",
  CHAIN_HIGHLIGHT: "#D1D5DB", // Neutral gray for selected chain
  BACKLIGHT_OPACITY: 0.25, // New constant for backlight mode opacity
  
  // Kinetic Colors - Reintroduced for visual feedback
  GREEN_CURL: adjustBrightness("#A3E635", 0.6),    // Desaturated green for Curl
  PURPLE_STRETCH: adjustBrightness("#8B7EC1", 0.8), // Desaturated purple for Stretch
  
  // Categorical Colors - all default to a dark monochrome for the doll itself
  LIGHT_MONO_HEAD_HAND_FOOT: "#FFFFFF", // Changed to white as requested for head, hands, and feet
  DARK_MONO_BODY_PARTS: "#000000", // Changed to black as requested
  OLIVE: '#000000', // Changed to black as requested for the collar
};

// Map part categories to colors - simplified to grayscale for the doll's fill
export const COLORS_BY_CATEGORY: { [category: string]: string } = {
  head: COLORS.LIGHT_MONO_HEAD_HAND_FOOT,
  hand: COLORS.LIGHT_MONO_HEAD_HAND_FOOT,
  foot: COLORS.LIGHT_MONO_HEAD_HAND_FOOT,
  
  bicep: COLORS.DARK_MONO_BODY_PARTS,
  forearm: COLORS.DARK_MONO_BODY_PARTS,
  collar: COLORS.OLIVE, // Explicitly using the new OLIVE color for the collar
  torso: COLORS.DARK_MONO_BODY_PARTS,
  waist: COLORS.DARK_MONO_BODY_PARTS,
  thigh: COLORS.DARK_MONO_BODY_PARTS,
  shin: COLORS.DARK_MONO_BODY_PARTS,

  default: COLORS.DEFAULT_FILL,
};

const getPartCategoryColor = (category?: string) => {
  if (category && COLORS_BY_CATEGORY[category]) {
    return COLORS_BY_CATEGORY[category];
  }
  return COLORS.DEFAULT_FILL;
};
export const Bone: React.FC<BoneProps> = ({
  rotation,
  length,
  width = 15,
  variant = 'diamond',
  showPivots = true,
  showOverlay = true,
  visible = true,
  offset = { x: 0, y: 0 },
  className,
  children,
  drawsUpwards = false,
  colorClass = "fill-mono-dark",
  fillOverride,
  showLabel = false,
  label,
  boneKey,
  onAnchorMouseDown,
  isBeingDragged = false,
  isPausedAndPivotsVisible = false,
  patternFillId,
  isPinned = false,
  isInActiveChain = false,
  isSelected = false,
  renderMode = 'default',
  partCategory,
  jointConstraintMode = 'fk',
}) => {

  const partCategoryColor = getPartCategoryColor(partCategory);

  const pathFill = useMemo(() => {
    if (renderMode === 'wireframe') return 'none';
    if (renderMode === 'silhouette') return COLORS.DEFAULT_FILL; // Solid black fill for silhouette
    if (renderMode === 'backlight') return COLORS.DEFAULT_FILL; // Black fill for backlight mode

    // Default mode: use categorical color, which is now monochrome.
    return fillOverride || patternFillId || partCategoryColor || colorClass;
  }, [renderMode, fillOverride, patternFillId, partCategoryColor, colorClass]);

  const pathOpacity = useMemo(() => {
    if (renderMode === 'backlight') return COLORS.BACKLIGHT_OPACITY;
    return 1; // Default to opaque
  }, [renderMode]);

  const pathStroke = useMemo(() => {
    if (isSelected) return COLORS.SELECTION; // Selection always has priority for stroke color
    
    if (renderMode === 'wireframe') return COLORS.RIDGE;
    if (renderMode === 'backlight') return COLORS.RIDGE; // Outline for backlight mode
    
    // In silhouette mode, no stroke unless selected
    if (renderMode === 'silhouette') {
      return 'none';
    }
    
    return 'none'; // Default behavior for 'default' mode (no stroke by default)
  }, [isSelected, renderMode]);

  const pathStrokeWidth = useMemo(() => {
    if (isSelected) return 3; // Selected parts get a thicker stroke
    
    if (renderMode === 'wireframe' || renderMode === 'backlight') return 0.5; // Thinner stroke for wireframe and backlight
    
    // In silhouette mode, no stroke width unless selected
    if (renderMode === 'silhouette') {
      return 0;
    }
    
    return 0; // Default behavior for 'default' mode (no stroke width by default)
  }, [isSelected, renderMode]);

  const overlayLineStroke = useMemo(() => {
    if (renderMode === 'default' && showOverlay) {
      if (jointConstraintMode === 'stretch') return COLORS.PURPLE_STRETCH;
      if (jointConstraintMode === 'curl') return COLORS.GREEN_CURL;
    }
    // For backlight, use a distinct color for the axis lines to stand out
    if (renderMode === 'backlight') return COLORS.SELECTION;
    return COLORS.RIDGE; // Default for FK or other modes
  }, [renderMode, showOverlay, jointConstraintMode]);

  const finalColorClass = isInActiveChain ? 'fill-mono-light' : colorClass;

  const getBonePath = (boneLength: number, boneWidth: number, variant: BoneVariant, drawsUpwards: boolean): string => {
    const effectiveLength = drawsUpwards ? -boneLength : boneLength;
    const halfWidth = boneWidth / 2;

    switch (variant) {
      case 'head-tall-oval':
        const topWidth = boneWidth;
        const baseWidth = boneWidth * 0.4;
        const headEffectiveLength = -boneLength;
        return `M ${-baseWidth / 2},0 L ${baseWidth / 2},0 L ${topWidth / 2},${headEffectiveLength} L ${-topWidth / 2},${headEffectiveLength} Z`;

      case 'collar-horizontal-oval-shape':
        const collarVisHeight = boneLength;
        const collarBaseWidth = boneWidth;
        const collarTopWidth = collarBaseWidth * 0.5; 
        return `M ${collarBaseWidth / 2},0 C ${collarBaseWidth * 0.3},${-collarVisHeight * 0.3} ${collarTopWidth * 0.7},${-collarVisHeight * 0.6} ${collarTopWidth / 2},${-collarVisHeight} L ${-collarTopWidth / 2},${-collarVisHeight} C ${-collarTopWidth * 0.7},${-collarVisHeight * 0.6} ${-collarBaseWidth * 0.3},${-collarVisHeight * 0.3} ${-collarBaseWidth / 2},0 Z`;

      case 'waist-teardrop-pointy-up':
        const wHeight = boneLength;
        const wWidth = boneWidth;
        return `M ${wWidth / 2},0 L ${wWidth * 0.15},${-wHeight} L ${-wWidth * 0.15},${-wHeight} L ${-wWidth / 2},0 Z`;

      case 'torso-teardrop-pointy-down':
        const tHeight = boneLength;
        const tWidth = boneWidth;
        return `M ${tWidth * 0.3},0 C ${tWidth * 0.3},${-tHeight * 0.3} ${tWidth / 2},${-tHeight * 0.7} ${tWidth / 2},${-tHeight} L ${-tWidth / 2},${-tHeight} C ${-tWidth / 2},${-tHeight * 0.7} ${-tWidth * 0.3},${-tHeight * 0.3} ${-tWidth * 0.3},0 Z`;

      case 'deltoid-shape':
        const dHeight = boneLength;
        const shoulderWidth = boneWidth; 
        return `M ${shoulderWidth / 2} 0
                C ${shoulderWidth / 2} ${dHeight * 0.2} ${shoulderWidth * 1.2 / 2} ${dHeight * 0.4} ${shoulderWidth * 1.2 / 2} ${dHeight * 0.7}
                L 0 ${dHeight}
                L ${-shoulderWidth * 1.2 / 2} ${dHeight * 0.7}
                C ${-shoulderWidth * 1.2 / 2} ${dHeight * 0.4} ${-shoulderWidth / 2} ${dHeight * 0.2} ${-shoulderWidth / 2} 0 Z`;

      case 'limb-tapered':
        const taperedWidth = boneWidth;
        const taperedEndWidth = taperedWidth * 0.65;
        return `M ${taperedWidth / 2},0 L ${taperedEndWidth / 2},${effectiveLength} L ${-taperedEndWidth / 2},${effectiveLength} L ${-taperedWidth / 2},0 Z`;
      
      case 'foot-block-shape':
        const footBaseW = boneWidth;
        const footEndW = boneWidth * 1.4;
        return `M ${footBaseW / 2},0 L ${footEndW / 2},${effectiveLength} L ${-footEndW / 2},${effectiveLength} L ${-footBaseW / 2},0 Z`;

      case 'toe-rounded-cap':
        const toeBaseW = boneWidth * 1.4;
        return `M ${toeBaseW / 2},0 L 0,${effectiveLength} L ${-toeBaseW / 2},0 Z`;

      case 'hand-foot-arrowhead-shape':
        const handFootWidth = boneWidth;
        return `M ${-handFootWidth / 2},0 L ${handFootWidth / 2},0 L 0,${effectiveLength} Z`;

      case 'triangle':
        return `M ${-halfWidth},0 L ${halfWidth},0 L 0,${effectiveLength} Z`;

      case 'triangle-up':
        return `M ${-halfWidth},${effectiveLength} L ${halfWidth},${effectiveLength} L 0,0 Z`;

      case 'trapezoid':
        const trapTopWidth = boneWidth * 0.6;
        return `M ${-halfWidth},0 L ${halfWidth},0 L ${trapTopWidth / 2},${effectiveLength} L ${-trapTopWidth / 2},${effectiveLength} Z`;

      case 'trapezoid-up':
        const trapUpBottomWidth = boneWidth * 0.6;
        return `M ${-trapUpBottomWidth / 2},0 L ${trapUpBottomWidth / 2},0 L ${halfWidth},${effectiveLength} L ${-halfWidth},${effectiveLength} Z`;

      case 'pentagon':
        const pentMidY = effectiveLength * 0.65;
        const pentMidW = boneWidth * 0.75;
        const pentTopW = boneWidth * 0.35;
        return `M ${-halfWidth},0 L ${halfWidth},0 L ${pentMidW / 2},${pentMidY} L ${pentTopW / 2},${effectiveLength} L ${-pentTopW / 2},${effectiveLength} L ${-pentMidW / 2},${pentMidY} Z`;

      case 'capsule':
        const capLen = effectiveLength;
        const capAbs = Math.abs(capLen);
        const capR = Math.min(halfWidth, capAbs / 2);
        const capBottom = capLen >= 0 ? capLen : -capAbs;
        return [
          `M ${-halfWidth + capR},0`,
          `H ${halfWidth - capR}`,
          `A ${capR} ${capR} 0 0 1 ${halfWidth} ${capLen >= 0 ? capR : -capR}`,
          `V ${capBottom - (capLen >= 0 ? capR : -capR)}`,
          `A ${capR} ${capR} 0 0 1 ${halfWidth - capR} ${capBottom}`,
          `H ${-halfWidth + capR}`,
          `A ${capR} ${capR} 0 0 1 ${-halfWidth} ${capBottom - (capLen >= 0 ? capR : -capR)}`,
          `V ${capLen >= 0 ? capR : -capR}`,
          `A ${capR} ${capR} 0 0 1 ${-halfWidth + capR} 0`,
          `Z`,
        ].join(' ');

      default:
        const defaultWidth = boneWidth;
        const split = effectiveLength * 0.4;
        return `M 0 0 L ${defaultWidth / 2} ${split} L 0 ${effectiveLength} L ${-defaultWidth / 2} ${split} Z`;
    }
  };

  const visualEndPoint = drawsUpwards ? -length : length;
  const transform = (offset.x !== 0 || offset.y !== 0)
    ? `translate(${offset.x}, ${offset.y}) rotate(${rotation})`
    : `rotate(${rotation})`;

  const cursorStyle = isPausedAndPivotsVisible 
    ? (isBeingDragged ? 'cursor-grabbing' : 'cursor-grab')
    : 'cursor-default';

  const handleInteractionStart = (e: React.MouseEvent) => {
    if (isPausedAndPivotsVisible && boneKey && onAnchorMouseDown) {
      e.stopPropagation();
      onAnchorMouseDown(boneKey, e);
    }
  };
  
  const finalColorClass = isInActiveChain ? 'fill-mono-light' : colorClass;

  return (
    <g transform={transform} className={finalColorClass}>
      {visible && (
        <React.Fragment>
          <path
            d={getBonePath(length, width, variant, drawsUpwards)}
            fill={pathFill}
            stroke={pathStroke}
            strokeWidth={pathStrokeWidth}
            paintOrder="stroke"
            opacity={pathOpacity}
            className={`${isPausedAndPivotsVisible ? (isBeingDragged ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'} hover:opacity-80 transition-opacity`}
            onMouseDown={handleInteractionStart}
          />
          {/* Overlay line for axis, only in default mode, now with kinetic color */}
          {showOverlay && renderMode !== 'wireframe' && (
            <line x1="0" y1="0" x2="0" y2={visualEndPoint} stroke={overlayLineStroke} strokeWidth={1} opacity={0.5} strokeLinecap="round" />
          )}
          {showLabel && label && (
            <text x={width / 2 + 5} y={visualEndPoint / 2} 
                  className="fill-mono-mid text-[7px] font-mono select-none opacity-40 tracking-tighter uppercase pointer-events-none"
                  data-is-label="true">
              {label}
            </text>
          )}
        </React.Fragment>
      )}

      <g transform={`translate(0, ${visualEndPoint})`}>{children}</g>

      {/* Anchor (red dot) at the start of the bone */}
      {showOverlay && visible && (
        <g>
          <circle 
            cx="0" cy="0" r={isSelected ? 7 : (showPivots ? 5 : 0)} 
            fill={COLORS.ANCHOR_RED} 
            stroke="white"
            strokeWidth="1"
            className={`${isPausedAndPivotsVisible ? (isBeingDragged ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'} drop-shadow-sm hover:scale-125 transition-transform`} 
            data-no-export="true"
            onMouseDown={handleInteractionStart}
          />
          {isPinned && (
              <circle
                  cx="0" cy="0" r={10}
                  fill="none"
                  stroke={COLORS.PIN_HIGHLIGHT}
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  data-no-export="true"
              >
                  <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from="0 0 0"
                      to="360 0 0"
                      dur="3s"
                      repeatCount="indefinite"
                  />
              </circle>
          )}
        </g>
      )}
    </g>
  );
};
