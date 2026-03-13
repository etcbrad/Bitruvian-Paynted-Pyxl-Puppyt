
import React from 'react';
import { Bone, type BoneProps } from './Bone'; // Import BoneProps type for explicit casting
import { ANATOMY, RIGGING } from '../constants';
import { getJointPositions, getTotalRotation, calculateTensionFactor } from '../utils/kinematics';
import { PartName, PartSelection, PartVisibility, AnchorName, Pose, JointConstraint, RenderMode, PARENT_MAP, partNameToPoseKey, PinnedState, BodyPartMaskLayer, ProportionScales } from '../types';
import { COLORS_BY_CATEGORY, COLORS } from './Bone'; // Import COLORS_BY_CATEGORY AND COLORS for pin indicator color

interface MannequinProps {
  pose: Pose;
  ghostPose?: Pose;
  showOverlay?: boolean;
  selectedParts: PartSelection;
  visibility: PartVisibility;
  activePins: AnchorName[];
  pinnedState: PinnedState;
  className?: string;
  onMouseDownOnPart?: (part: PartName, event: React.MouseEvent<SVGGElement>) => void;
  onDoubleClickOnPart?: (part: PartName, event: React.MouseEvent<SVGGElement>) => void;
  onMouseDownOnRoot?: (event: React.MouseEvent<SVGCircleElement>) => void;
  jointModes: Record<PartName, JointConstraint>;
  renderMode?: RenderMode;
  masksEnabled?: boolean;
  hideBonesWithMasks?: boolean;
  maskLayers?: Record<PartName, BodyPartMaskLayer>;
  proportionScales?: ProportionScales;
}

export const getPartCategory = (part: PartName): string => { // Exported
  switch (part) {
    case PartName.RWrist:
    case PartName.LWrist: return 'hand';
    case PartName.RElbow: // This represents the forearm segment
    case PartName.LElbow: return 'forearm';
    case PartName.RShoulder: // This represents the bicep segment
    case PartName.LShoulder: return 'bicep';
    case PartName.Collar: return 'collar';
    case PartName.Torso: return 'torso';
    case PartName.Waist: return 'waist';
    case PartName.RThigh:
    case PartName.LThigh: return 'thigh';
    case PartName.RSkin: // This represents the shin/calf segment
    case PartName.LSkin: return 'shin';
    case PartName.RAnkle: // This represents the foot segment
    case PartName.LAnkle: return 'foot';
    case PartName.Head: return 'head';
    default: return 'default';
  }
};

export const getPartCategoryDisplayName = (part: PartName): string => { // Exported
  const category = getPartCategory(part);
  // Simple mapping for display purposes
  switch(category) {
    case 'bicep': return part.startsWith('r') ? 'RIGHT BICEP' : 'LEFT BICEP';
    case 'forearm': return part.startsWith('r') ? 'RIGHT FOREARM' : 'LEFT FOREARM';
    case 'hand': return part.startsWith('r') ? 'RIGHT HAND' : 'LEFT HAND';
    case 'thigh': return part.startsWith('r') ? 'RIGHT THIGH' : 'LEFT THIGH';
    case 'shin': return part.startsWith('r') ? 'RIGHT SHIN' : 'LEFT SHIN';
    case 'foot': return part.startsWith('r') ? 'RIGHT FOOT' : 'LEFT FOOT';
    case 'head': return 'HEAD';
    case 'collar': return 'COLLAR';
    case 'torso': return 'TORSO';
    case 'waist': return 'WAIST';
    default: return part.toUpperCase();
  }
};

export const Mannequin: React.FC<MannequinProps> = ({
  pose,
  ghostPose,
  showOverlay = true,
  selectedParts,
  visibility,
  activePins,
  pinnedState,
  className = "text-ink",
  onMouseDownOnPart,
  onDoubleClickOnPart,
  onMouseDownOnRoot,
  jointModes,
  renderMode = 'default',
  masksEnabled = false,
  hideBonesWithMasks = false,
  maskLayers = {},
  proportionScales = { arm: 1, leg: 1, torso: 1, head: 1 },
}) => {
  const joints = getJointPositions(pose, activePins);
  const ghostJoints = ghostPose ? getJointPositions(ghostPose, activePins) : null;
  const offsets = pose.offsets || {};

  const scaleLen = (category: 'arm' | 'leg' | 'torso' | 'head') => (proportionScales[category] || 1);
  const scaled = {
    waist: ANATOMY.WAIST * scaleLen('torso'),
    torso: ANATOMY.TORSO * scaleLen('torso'),
    collar: ANATOMY.COLLAR * scaleLen('torso'),
    head: ANATOMY.HEAD * scaleLen('head'),
    upperArm: ANATOMY.UPPER_ARM * scaleLen('arm'),
    lowerArm: ANATOMY.LOWER_ARM * scaleLen('arm'),
    hand: ANATOMY.HAND * scaleLen('arm'),
    upperLeg: ANATOMY.LEG_UPPER * scaleLen('leg'),
    lowerLeg: ANATOMY.LEG_LOWER * scaleLen('leg'),
    foot: ANATOMY.FOOT * scaleLen('leg'),
    waistW: ANATOMY.WAIST_WIDTH * scaleLen('torso'),
    torsoW: ANATOMY.TORSO_WIDTH * scaleLen('torso'),
    collarW: ANATOMY.COLLAR_WIDTH * scaleLen('torso'),
    headW: ANATOMY.HEAD_WIDTH * scaleLen('head'),
    armW: ANATOMY.LIMB_WIDTH_ARM * scaleLen('arm'),
    forearmW: ANATOMY.LIMB_WIDTH_FOREARM * scaleLen('arm'),
    handW: ANATOMY.HAND_WIDTH * scaleLen('arm'),
    thighW: ANATOMY.LIMB_WIDTH_THIGH * scaleLen('leg'),
    calfW: ANATOMY.LIMB_WIDTH_CALF * scaleLen('leg'),
    footW: ANATOMY.FOOT_WIDTH * scaleLen('leg'),
  };

  const PartWrapper = ({ part, isGhost = false, children }: { part: PartName; isGhost?: boolean; children?: React.ReactNode }) => {
    const isSelected = selectedParts[part];

    const handleMouseDown = (e: React.MouseEvent<SVGGElement>) => { 
      if (isGhost) return;
      e.stopPropagation(); 
      onMouseDownOnPart?.(part, e); 
    };
    
    const handleDoubleClick = (e: React.MouseEvent<SVGGElement>) => {
      if (isGhost) return;
      e.stopPropagation();
      onDoubleClickOnPart?.(part, e);
    };

    return (
      <g 
        className={isGhost ? "pointer-events-none opacity-20" : "cursor-pointer"} 
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick} // Reintroduced
        role={isGhost ? "presentation" : "button"} 
        aria-label={isGhost ? undefined : `Select ${getPartCategoryDisplayName(part)}`}
        aria-pressed={isGhost ? undefined : isSelected}
      >
        {React.Children.map(children, child =>
          // Explicitly cloneElement and pass `isSelected`, `renderMode`, and `jointConstraintMode`.
          React.isValidElement(child) && child.type === Bone
            ? React.cloneElement(child as React.ReactElement<BoneProps>, { 
                isSelected: isGhost ? false : isSelected,
                renderMode: isGhost ? 'wireframe' : renderMode,
                jointConstraintMode: jointModes[part], // Pass kinetic mode
              })
            : child
        )}
      </g>
    );
  };

  const ROOT_COLOR = "#5A5A5A"; // Darker grayscale for the root circle
  const PIN_INDICATOR_SIZE = ANATOMY.ROOT_SIZE * 0.7; // Size of the inner circle of the root graphic
  const PIN_INDICATOR_STROKE_COLOR = COLORS.SELECTION; // Light monochrome for stroke
  const PIN_INDICATOR_STROKE_WIDTH = 1;

  const renderSkeleton = (p: Pose, j: any, isGhost: boolean = false) => {
    const skeletonOffsets = p.offsets || {};
    return (
      <g 
        className={isGhost ? "ghost-skeleton" : "main-skeleton"} 
        transform={`translate(${j.root.x}, ${j.root.y}) rotate(${p.bodyRotation})`}
      >
        <PartWrapper part={PartName.Waist} isGhost={isGhost}>
          <Bone 
            rotation={getTotalRotation(PartName.Waist, p)} 
            length={scaled.waist} 
            width={scaled.waistW} 
            variant="waist-teardrop-pointy-up" 
            drawsUpwards 
            showOverlay={showOverlay} 
            offset={skeletonOffsets[PartName.Waist]} 
            visible={visibility[PartName.Waist]} 
            partCategory={getPartCategory(PartName.Waist)}
            maskLayer={masksEnabled ? maskLayers[PartName.Waist] : undefined}
            suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.Waist]?.src)}
          >
            <PartWrapper part={PartName.Torso} isGhost={isGhost}>
              <Bone 
                rotation={getTotalRotation(PartName.Torso, p)} 
                length={scaled.torso} 
                width={scaled.torsoW} 
                variant="torso-teardrop-pointy-down" 
                drawsUpwards 
                showOverlay={showOverlay} 
                offset={skeletonOffsets[PartName.Torso]} 
                visible={visibility[PartName.Torso]} 
                partCategory={getPartCategory(PartName.Torso)}
                maskLayer={masksEnabled ? maskLayers[PartName.Torso] : undefined}
                suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.Torso]?.src)}
              >
                <PartWrapper part={PartName.Collar} isGhost={isGhost}>
                  <Bone 
                    rotation={getTotalRotation(PartName.Collar, p)} 
                    length={scaled.collar} 
                    width={scaled.collarW} 
                    variant="collar-horizontal-oval-shape" 
                    drawsUpwards 
                    showOverlay={showOverlay} 
                    partCategory={getPartCategory(PartName.Collar)}
                    offset={skeletonOffsets[PartName.Collar]} 
                    visible={visibility[PartName.Collar]} 
                    maskLayer={masksEnabled ? maskLayers[PartName.Collar] : undefined}
                    suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.Collar]?.src)}
                  >
                    
                    <g transform={`translate(0, 0)`}>
                      <PartWrapper part={PartName.Head} isGhost={isGhost}>
                        <Bone 
                          rotation={getTotalRotation(PartName.Head, p)} 
                          length={scaled.head} 
                          width={scaled.headW} 
                          variant="head-tall-oval" 
                          drawsUpwards 
                          showOverlay={showOverlay} 
                          offset={skeletonOffsets[PartName.Head]} 
                          visible={visibility[PartName.Head]} 
                          partCategory={getPartCategory(PartName.Head)}
                          maskLayer={masksEnabled ? maskLayers[PartName.Head] : undefined}
                          suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.Head]?.src)}
                        />
                      </PartWrapper>
                    </g>

                    <g transform={`translate(${RIGGING.R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER}, ${RIGGING.SHOULDER_Y_OFFSET_FROM_COLLAR_END}) rotate(${-getTotalRotation(PartName.Collar, p)})`}>
                      <PartWrapper part={PartName.RShoulder} isGhost={isGhost}>
                        <Bone 
                          rotation={getTotalRotation(PartName.RShoulder, p)} 
                          length={scaled.upperArm} 
                          width={scaled.armW} 
                          variant="deltoid-shape" 
                          showOverlay={showOverlay} 
                          offset={skeletonOffsets[PartName.RShoulder]} 
                          visible={visibility[PartName.RShoulder]} 
                          partCategory={getPartCategory(PartName.RShoulder)}
                          maskLayer={masksEnabled ? maskLayers[PartName.RShoulder] : undefined}
                          suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.RShoulder]?.src)}
                        >
                          <PartWrapper part={PartName.RElbow} isGhost={isGhost}>
                            <Bone 
                              rotation={getTotalRotation('rForearm', p)} 
                              length={scaled.lowerArm} 
                              width={scaled.forearmW} 
                              variant="limb-tapered" 
                              showOverlay={showOverlay} 
                              offset={skeletonOffsets[PartName.RElbow]} 
                              visible={visibility[PartName.RElbow]} 
                              partCategory={getPartCategory(PartName.RElbow)}
                              maskLayer={masksEnabled ? maskLayers[PartName.RElbow] : undefined}
                              suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.RElbow]?.src)}
                            >
                              <PartWrapper part={PartName.RWrist} isGhost={isGhost}>
                                <Bone 
                                  rotation={getTotalRotation(PartName.RWrist, p)} 
                                  length={scaled.hand} 
                                  width={scaled.handW} 
                                  variant="hand-foot-arrowhead-shape" 
                                  showOverlay={showOverlay} 
                                  offset={skeletonOffsets[PartName.RWrist]} 
                                  visible={visibility[PartName.RWrist]} 
                                  partCategory={getPartCategory(PartName.RWrist)}
                                  maskLayer={masksEnabled ? maskLayers[PartName.RWrist] : undefined}
                                  suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.RWrist]?.src)}
                                />
                              </PartWrapper>
                            </Bone>
                          </PartWrapper>
                        </Bone>
                      </PartWrapper>
                    </g>

                    <g transform={`translate(${RIGGING.L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER}, ${RIGGING.SHOULDER_Y_OFFSET_FROM_COLLAR_END}) rotate(${-getTotalRotation(PartName.Collar, p)})`}>
                      <PartWrapper part={PartName.LShoulder} isGhost={isGhost}>
                        <Bone 
                          rotation={getTotalRotation(PartName.LShoulder, p)} 
                          length={scaled.upperArm} 
                          width={scaled.armW} 
                          variant="deltoid-shape" 
                          showOverlay={showOverlay} 
                          offset={skeletonOffsets[PartName.LShoulder]} 
                          visible={visibility[PartName.LShoulder]} 
                          partCategory={getPartCategory(PartName.LShoulder)}
                          maskLayer={masksEnabled ? maskLayers[PartName.LShoulder] : undefined}
                          suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.LShoulder]?.src)}
                        >
                          <PartWrapper part={PartName.LElbow} isGhost={isGhost}>
                            <Bone 
                              rotation={getTotalRotation('lForearm', p)} 
                              length={scaled.lowerArm} 
                              width={scaled.forearmW} 
                              variant="limb-tapered" 
                              showOverlay={showOverlay} 
                              offset={skeletonOffsets[PartName.LElbow]} 
                              visible={visibility[PartName.LElbow]} 
                              partCategory={getPartCategory(PartName.LElbow)}
                              maskLayer={masksEnabled ? maskLayers[PartName.LElbow] : undefined}
                              suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.LElbow]?.src)}
                            >
                              <PartWrapper part={PartName.LWrist} isGhost={isGhost}>
                                <Bone 
                                  rotation={getTotalRotation(PartName.LWrist, p)} 
                                  length={scaled.hand} 
                                  width={scaled.handW} 
                                  variant="hand-foot-arrowhead-shape" 
                                  showOverlay={showOverlay} 
                                  offset={skeletonOffsets[PartName.LWrist]} 
                                  visible={visibility[PartName.LWrist]} 
                                  partCategory={getPartCategory(PartName.LWrist)}
                                  maskLayer={masksEnabled ? maskLayers[PartName.LWrist] : undefined}
                                  suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.LWrist]?.src)}
                                />
                              </PartWrapper>
                            </Bone>
                          </PartWrapper>
                        </Bone>
                      </PartWrapper>
                    </g>
                  </Bone>
                </PartWrapper>
              </Bone>
            </PartWrapper>
          </Bone>
        </PartWrapper>

        <PartWrapper part={PartName.RThigh} isGhost={isGhost}>
          <Bone 
            rotation={getTotalRotation(PartName.RThigh, p)} 
            length={scaled.upperLeg} 
            width={scaled.thighW} 
            variant="limb-tapered" 
            showOverlay={showOverlay} 
            offset={skeletonOffsets[PartName.RThigh]} 
            visible={visibility[PartName.RThigh]} 
            partCategory={getPartCategory(PartName.RThigh)}
            maskLayer={masksEnabled ? maskLayers[PartName.RThigh] : undefined}
            suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.RThigh]?.src)}
          >
            <PartWrapper part={PartName.RSkin} isGhost={isGhost}>
              <Bone 
                rotation={getTotalRotation('rCalf', p)} 
                length={scaled.lowerLeg} 
                width={scaled.calfW} 
                variant="limb-tapered" 
                showOverlay={showOverlay} 
                offset={skeletonOffsets[PartName.RSkin]} 
                visible={visibility[PartName.RSkin]} 
                partCategory={getPartCategory(PartName.RSkin)}
                maskLayer={masksEnabled ? maskLayers[PartName.RSkin] : undefined}
                suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.RSkin]?.src)}
              >
                <PartWrapper part={PartName.RAnkle} isGhost={isGhost}>
                  <Bone 
                    rotation={getTotalRotation(PartName.RAnkle, p)} 
                    length={scaled.foot} 
                    width={scaled.footW} 
                    variant="hand-foot-arrowhead-shape" 
                    showOverlay={showOverlay} 
                    offset={skeletonOffsets[PartName.RAnkle]} 
                    visible={visibility[PartName.RAnkle]} 
                    partCategory={getPartCategory(PartName.RAnkle)}
                    maskLayer={masksEnabled ? maskLayers[PartName.RAnkle] : undefined}
                    suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.RAnkle]?.src)}
                  />
                </PartWrapper>
              </Bone>
            </PartWrapper>
          </Bone>
        </PartWrapper>

        <PartWrapper part={PartName.LThigh} isGhost={isGhost}>
          <Bone 
            rotation={getTotalRotation(PartName.LThigh, p)} 
            length={scaled.upperLeg} 
            width={scaled.thighW} 
            variant="limb-tapered" 
            showOverlay={showOverlay} 
            offset={skeletonOffsets[PartName.LThigh]} 
            visible={visibility[PartName.LThigh]} 
            partCategory={getPartCategory(PartName.LThigh)}
            maskLayer={masksEnabled ? maskLayers[PartName.LThigh] : undefined}
            suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.LThigh]?.src)}
          >
            <PartWrapper part={PartName.LSkin} isGhost={isGhost}>
              <Bone 
                rotation={getTotalRotation('lCalf', p)} 
                length={scaled.lowerLeg} 
                width={scaled.calfW} 
                variant="limb-tapered" 
                showOverlay={showOverlay} 
                offset={skeletonOffsets[PartName.LSkin]} 
                visible={visibility[PartName.LSkin]} 
                partCategory={getPartCategory(PartName.LSkin)}
                maskLayer={masksEnabled ? maskLayers[PartName.LSkin] : undefined}
                suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.LSkin]?.src)}
              >
                <PartWrapper part={PartName.LAnkle} isGhost={isGhost}>
                  <Bone 
                    rotation={getTotalRotation(PartName.LAnkle, p)} 
                    length={scaled.foot} 
                    width={scaled.footW} 
                    variant="hand-foot-arrowhead-shape" 
                    showOverlay={showOverlay} 
                    offset={skeletonOffsets[PartName.LAnkle]} 
                    visible={visibility[PartName.LAnkle]} 
                    partCategory={getPartCategory(PartName.LAnkle)}
                    maskLayer={masksEnabled ? maskLayers[PartName.LAnkle] : undefined}
                    suppressBone={Boolean(masksEnabled && hideBonesWithMasks && maskLayers[PartName.LAnkle]?.src)}
                  />
                </PartWrapper>
              </Bone>
            </PartWrapper>
          </Bone>
        </PartWrapper>
      </g>
    );
  };

  return (
    <g className={`mannequin-container ${className}`}>
      {/* Render Ghost Skeleton First (Behind) */}
      {ghostPose && ghostJoints && renderSkeleton(ghostPose, ghostJoints, true)}
      
      {/* Render Main Skeleton */}
      {renderSkeleton(pose, joints, false)}

      {/* Root circle for drag (Always on top of main skeleton) */}
      <g 
        onMouseDown={onMouseDownOnRoot} 
        className={'cursor-pointer'} 
        transform={`translate(${joints.root.x}, ${joints.root.y}) rotate(${pose.bodyRotation})`}
        data-no-export={true}
        role="button"
        aria-label="Drag mannequin root"
      >
        <circle cx="0" cy="0" r={ANATOMY.ROOT_SIZE} fill="currentColor" opacity="0.1" />
        <circle 
          cx="0" cy="0" r={PIN_INDICATOR_SIZE} 
          fill={activePins.includes('root') ? COLORS.ANCHOR_RED : ROOT_COLOR}
          stroke={PIN_INDICATOR_STROKE_COLOR} 
          strokeWidth={PIN_INDICATOR_STROKE_WIDTH} 
        />
      </g>

      {/* Multi-Pin Indicators with Tension Visualization */}
      <g transform={`translate(${joints.root.x}, ${joints.root.y}) rotate(${pose.bodyRotation})`}>
        {activePins.map((pinName, index) => {
          if (pinName === 'root') return null;
          const currentPos = joints[pinName as keyof typeof joints];
          const targetPos = pinnedState[pinName];
          if (!currentPos || !targetPos) return null;

          const tension = calculateTensionFactor(currentPos, targetPos);
          const isPrimary = index === 0;
          
          // Tension visual: Scale and luminance
          const scale = 1 + tension * 0.5;
          const opacity = 0.5 + tension * 0.5;
          const color = isPrimary ? COLORS.ANCHOR_RED : "#FF4488"; // Pinkish-red for secondary pins

          return (
            <g 
              key={pinName}
              transform={`translate(${currentPos.x - joints.root.x}, ${currentPos.y - joints.root.y})`} 
              data-no-export={true}
            >
              {/* Rubber band line if tension exists */}
              {tension > 0.05 && (
                <line 
                  x1={0} y1={0} 
                  x2={targetPos.x - currentPos.x} 
                  y2={targetPos.y - currentPos.y}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="2,2"
                  opacity={opacity}
                />
              )}
              
              {/* Target pin (ghost) */}
              <circle 
                cx={targetPos.x - currentPos.x} 
                cy={targetPos.y - currentPos.y} 
                r={PIN_INDICATOR_SIZE * 0.5} 
                fill={color} 
                opacity={0.3} 
              />

              {/* Active joint pin */}
              <circle cx="0" cy="0" r={ANATOMY.ROOT_SIZE} fill="currentColor" opacity="0.1" />
              <circle 
                cx="0" cy="0" r={PIN_INDICATOR_SIZE * scale} 
                fill={color}
                stroke={PIN_INDICATOR_STROKE_COLOR} 
                strokeWidth={PIN_INDICATOR_STROKE_WIDTH}
                opacity={opacity}
              />
            </g>
          );
        })}
      </g>
    </g>
  );
};
