

import React, { useMemo } from 'react';
import { Vector2D, JointConstraint, RenderMode, PartName, BodyPartMaskLayer } from '../types';
import { ANATOMY } from '../constants';
import { adjustBrightness } from '../utils/color-utils'; // Import the new utility

export interface BoneProps { // Exported for use in Mannequin.tsx cloneElement
  rotation: number;
  length: number;
  width?: number;
  variant?: 'diamond' | 'waist-teardrop-pointy-up' | 'torso-teardrop-pointy-down' | 'collar-horizontal-oval-shape' | 'deltoid-shape' | 'limb-tapered' | 'head-tall-oval' | 'hand-foot-arrowhead-shape';
  showOverlay?: boolean;
  visible?: boolean;
  offset?: Vector2D;
  className?: string;
  children?: React.ReactNode;
  drawsUpwards?: boolean;
  fillOverride?: string; 
  isSelected?: boolean;
  renderMode?: RenderMode; // 'constraint' and 'darken20Percent' removed
  partCategory?: string; 
  jointConstraintMode?: JointConstraint; // New prop for kinetic modes
  maskLayer?: BodyPartMaskLayer;
  suppressBone?: boolean;
}

export const COLORS = {
  ANCHOR_RED: "#F87171", // Anchor dots explicitly red
  SELECTION: "#D1D5DB", // Changed from yellow to a light monochrome shade
  RIDGE: "#333333", // For wireframe stroke - kept dark
  PIN_HIGHLIGHT: "#D1D5DB", // Changed from green to light monochrome for active pin

  // Kinetic Colors - Reintroduced for visual feedback
  GREEN_CURL: adjustBrightness("#A3E635", 0.6),    // Desaturated green for Curl
  PURPLE_STRETCH: adjustBrightness("#8B7EC1", 0.8), // Desaturated purple for Stretch
  
  // Categorical Colors - all default to a dark monochrome for the doll itself
  LIGHT_MONO_HEAD_HAND_FOOT: "#FFFFFF", // Changed to white as requested for head, hands, and feet
  DARK_MONO_BODY_PARTS: "#000000", // Changed to black as requested
  OLIVE: '#000000', // Changed to black as requested for the collar
  
  DEFAULT_FILL: "#000000", // Fallback / solid black for silhouette
  BACKLIGHT_OPACITY: 0.25, // New constant for backlight mode opacity
};

// Map part categories to colors - simplified to grayscale for the doll's fill
export const COLORS_BY_CATEGORY: { [category: string]: string } = { // Exported
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
  showOverlay = true,
  visible = true,
  offset = { x: 0, y: 0 },
  className,
  children,
  drawsUpwards = false,
  fillOverride,
  isSelected = false,
  renderMode = 'default', // 'constraint' and 'darken20Percent' removed
  partCategory, 
  jointConstraintMode = 'fk', // Default to 'fk'
  maskLayer,
  suppressBone = false,
}) => {
  const getBonePath = (length: number, width: number, variant: string, drawsUpwards: boolean): string => {
    const effectiveLength = drawsUpwards ? -length : length;
    const halfWidth = width / 2;

    switch (variant) {
      case 'head-tall-oval':
        const hH = ANATOMY.HEAD * 0.75;    
        const bW = ANATOMY.HEAD_WIDTH * 0.3; 
        const tW = ANATOMY.HEAD_WIDTH * 0.6; 
        return `M ${-bW / 2},0 L ${bW / 2},0 C ${bW / 2 + 10},0 ${tW / 2},${-hH * 0.4} ${tW / 2},${-hH} L ${-tW / 2},${-hH} C ${-tW / 2},${-hH * 0.4} ${-bW / 2 - 10},0 ${-bW / 2},0 Z`;

      case 'collar-horizontal-oval-shape':
        const collarVisHeight = ANATOMY.COLLAR;
        const collarBaseWidth = ANATOMY.COLLAR_WIDTH;
        const collarTopWidth = collarBaseWidth * 0.5; 
        return `M ${collarBaseWidth / 2},0 C ${collarBaseWidth * 0.3},${-collarVisHeight * 0.3} ${collarTopWidth * 0.7},${-collarVisHeight * 0.6} ${collarTopWidth / 2},${-collarVisHeight} L ${-collarTopWidth / 2},${-collarVisHeight} C ${-collarTopWidth * 0.7},${-collarVisHeight * 0.6} ${-collarBaseWidth * 0.3},${-collarVisHeight * 0.3} ${-collarBaseWidth / 2},0 Z`;

      case 'waist-teardrop-pointy-up':
        const wHeight = ANATOMY.WAIST;
        const wWidth = ANATOMY.WAIST_WIDTH;
        return `M ${wWidth / 2},0 L ${wWidth * 0.15},${-wHeight} L ${-wWidth * 0.15},${-wHeight} L ${-wWidth / 2},0 Z`;

      case 'torso-teardrop-pointy-down':
        const tHeight = ANATOMY.TORSO;
        const tWidth = ANATOMY.TORSO_WIDTH;
        return `M ${tWidth * 0.3},0 C ${tWidth * 0.3},${-tHeight * 0.3} ${tWidth / 2},${-tHeight * 0.7} ${tWidth / 2},${-tHeight} L ${-tWidth / 2},${-tHeight} C ${-tWidth / 2},${-tHeight * 0.7} ${-tWidth * 0.3},${-tHeight * 0.3} ${-tWidth * 0.3},0 Z`;

      case 'deltoid-shape':
        const dHeight = ANATOMY.UPPER_ARM;
        const shoulderWidth = ANATOMY.LIMB_WIDTH_ARM; 
        return `M ${shoulderWidth / 2} 0
                C ${shoulderWidth / 2} ${dHeight * 0.2} ${shoulderWidth * 1.2 / 2} ${dHeight * 0.4} ${shoulderWidth * 1.2 / 2} ${dHeight * 0.7}
                L 0 ${dHeight}
                L ${-shoulderWidth * 1.2 / 2} ${dHeight * 0.7}
                C ${-shoulderWidth * 1.2 / 2} ${dHeight * 0.4} ${-shoulderWidth / 2} ${dHeight * 0.2} ${-shoulderWidth / 2} 0 Z`;

      case 'limb-tapered':
        const endWidth = width * 0.65;
        return `M ${width / 2},0 L ${endWidth / 2},${effectiveLength} L ${-endWidth / 2},${effectiveLength} L ${-width / 2},0 Z`;

      case 'hand-foot-arrowhead-shape':
        const hBaseWidth = width * 0.4; 
        const hMaxWidth = width;
        const flareY = effectiveLength * 0.2; 
        return `M ${-hBaseWidth / 2},0 L ${hBaseWidth / 2},0 L ${hMaxWidth / 2},${flareY} L 0,${effectiveLength} L ${-hMaxWidth / 2},${flareY} Z`;

      default:
        const split = effectiveLength * 0.4;
        return `M 0 0 L ${halfWidth} ${split} L 0 ${effectiveLength} L ${-halfWidth} ${split} Z`;
    }
  };

  const partCategoryColor = getPartCategoryColor(partCategory);
  const rotationHue = useMemo(() => {
    const normalized = ((rotation % 360) + 360) % 360;
    return normalized;
  }, [rotation]);

  const pathFill = useMemo(() => {
    if (renderMode === 'wireframe') return 'none';
    if (renderMode === 'silhouette') return COLORS.DEFAULT_FILL; // Solid black fill for silhouette
    if (renderMode === 'backlight') return COLORS.DEFAULT_FILL; // Black fill for backlight mode
    if (renderMode === 'colorwheel') return `hsl(${rotationHue} 75% 60%)`;

    // Default mode: use categorical color, which is now monochrome.
    return fillOverride || partCategoryColor;
  }, [renderMode, fillOverride, partCategoryColor, rotationHue]);

  const pathOpacity = useMemo(() => {
    if (renderMode === 'backlight') return COLORS.BACKLIGHT_OPACITY;
    return 1; // Default to opaque
  }, [renderMode]);

  const pathStroke = useMemo(() => {
    if (isSelected) return COLORS.SELECTION; // Selection always has priority for stroke color
    
    if (renderMode === 'wireframe') return COLORS.RIDGE;
    if (renderMode === 'backlight') return COLORS.RIDGE; // Outline for backlight mode
    if (renderMode === 'colorwheel') return 'none';
    
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
    if (renderMode === 'colorwheel' && showOverlay) {
      if (jointConstraintMode === 'stretch') return COLORS.PURPLE_STRETCH;
      if (jointConstraintMode === 'curl') return COLORS.GREEN_CURL;
    }
    // For backlight, use a distinct color for the axis lines to stand out
    if (renderMode === 'backlight') return COLORS.SELECTION;
    return COLORS.RIDGE; // Default for FK or other modes
  }, [renderMode, showOverlay, jointConstraintMode]);


  const visualEndPoint = drawsUpwards ? -length : length;
  const transform = (offset.x !== 0 || offset.y !== 0)
    ? `translate(${offset.x}, ${offset.y}) rotate(${rotation})`
    : `rotate(${rotation})`;

  const renderMask = (position: 'front' | 'behind') => {
    if (!maskLayer?.src) return null;
    const layerOrder = maskLayer.layerOrder || 'front';
    if (layerOrder !== position) return null;
    const scale = Number.isFinite(maskLayer.scale)
      ? maskLayer.scale
      : Number.isFinite(maskLayer.baseScale)
        ? maskLayer.baseScale
        : 1;
    const width = (maskLayer.width || 0) * scale || 100 * scale;
    const height = (maskLayer.height || 0) * scale || 100 * scale;
    const offsetX = Number.isFinite(maskLayer.offsetX) ? maskLayer.offsetX : 0;
    const offsetY = Number.isFinite(maskLayer.offsetY) ? maskLayer.offsetY : 0;
    const rotationDeg = Number.isFinite(maskLayer.rotationDeg) ? maskLayer.rotationDeg : 0;
    const opacity = Number.isFinite(maskLayer.opacity) ? maskLayer.opacity : 1;
    const anchors = maskLayer.jointAnchors || [];

    const mirror = maskLayer.mirrorX ? -1 : 1;
    return (
      <g transform={`scale(${mirror}, 1)`}>
        <g transform={`rotate(${rotationDeg})`}>
          <image
            href={maskLayer.src}
            x={-width / 2 + offsetX}
            y={-height / 2 + offsetY}
            width={width}
            height={height}
            opacity={opacity}
            preserveAspectRatio="xMidYMid meet"
          />
          {anchors.length > 0 && (
            <g>
              {anchors.length === 1 && (
                <circle
                  cx={anchors[0].x + offsetX}
                  cy={anchors[0].y + offsetY}
                  r={6}
                  fill="rgba(255,255,255,0.85)"
                  stroke="rgba(0,0,0,0.6)"
                  strokeWidth={1}
                />
              )}
              {anchors.length === 2 && (
                <line
                  x1={anchors[0].x + offsetX}
                  y1={anchors[0].y + offsetY}
                  x2={anchors[1].x + offsetX}
                  y2={anchors[1].y + offsetY}
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              )}
              {anchors.length >= 3 && (
                <polygon
                  points={anchors.slice(0, 3).map(p => `${p.x + offsetX},${p.y + offsetY}`).join(' ')}
                  fill="rgba(255,255,255,0.18)"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={2}
                />
              )}
            </g>
          )}
        </g>
      </g>
    );
  };

  return (
    <g transform={transform} className={className}>
      {renderMask('behind')}
      {visible && !suppressBone && (
        <React.Fragment>
          <path
            d={getBonePath(length, width, variant, drawsUpwards)}
            fill={pathFill}
            stroke={pathStroke}
            strokeWidth={pathStrokeWidth}
            paintOrder="stroke"
            opacity={pathOpacity}
          />
          {/* Overlay line for axis, only in default mode, now with kinetic color */}
          {showOverlay && renderMode !== 'wireframe' && ( // Show overlay in default, backlight, silhouette, but not wireframe
            <line x1="0" y1="0" x2="0" y2={visualEndPoint} stroke={overlayLineStroke} strokeWidth={1} opacity={0.5} strokeLinecap="round" />
          )}
        </React.Fragment>
      )}
      {renderMask('front')}

      <g transform={`translate(0, ${visualEndPoint})`}>{children}</g>

      {/* Anchor (red dot) at the start of the bone, always visible if showOverlay */}
      {showOverlay && (
        <circle 
          cx="0" cy="0" r={isSelected ? 7 : 5} 
          fill={COLORS.ANCHOR_RED} 
          className="pointer-events-none drop-shadow-md transition-all duration-150" 
          data-no-export={true} 
        />
      )}
    </g>
  );
};
