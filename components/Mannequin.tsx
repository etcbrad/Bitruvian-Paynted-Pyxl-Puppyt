

import React, { useMemo, useCallback } from 'react';
import { Bone } from './Bone';
import { ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT, RIGGING } from '../constants';
import { BoneVariant, WalkingEnginePose, WalkingEngineProportions, WalkingEnginePivotOffsets, Vector2D, MaskTransform, JointMode } from '../types';

// Helper functions for vector math, copied from App.tsx for Mannequin's internal calculations.
const rotateVec = (vec: Vector2D, angleDeg: number): Vector2D => {
  const r = angleDeg * Math.PI / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: vec.x * c - vec.y * s, y: vec.x * s + vec.y * c };
};
const addVec = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x + v2.x, y: v1.y + v2.y });

// Exported helper function for App.tsx to get current world transforms
export function getMannequinWorldTransformsHelper(
  pivotOffsets: WalkingEnginePivotOffsets,
  props: WalkingEngineProportions,
  baseUnitH: number,
  isReversed: boolean,
  jointModes?: Record<keyof WalkingEnginePivotOffsets, JointMode>,
  disabledJoints?: Record<keyof WalkingEnginePivotOffsets, boolean>,
): Partial<Record<keyof WalkingEngineProportions | 'headJoint' | 'collarJoint' | 'waistJoint' | 'torsoJoint' | 'collarEndPoint', { position: Vector2D; rotation: number, length?: number }>> {
    const trans: Partial<Record<keyof WalkingEngineProportions | 'headJoint' | 'collarJoint' | 'waistJoint' | 'torsoJoint' | 'collarEndPoint', { position: Vector2D; rotation: number, length?: number }>> = {};

    const getScaledDimension = (raw: number, key: keyof WalkingEngineProportions, axis: 'w' | 'h') => {
        return raw * baseUnitH * (props[key]?.[axis] || 1);
    };

    const calculateJointRotation = (boneKey: string, parentRot: number) => {
        if (disabledJoints?.[boneKey as keyof WalkingEnginePivotOffsets]) return parentRot;
        const local = (pivotOffsets[boneKey as keyof WalkingEnginePivotOffsets] || 0);
        const mode = jointModes?.[boneKey as keyof WalkingEnginePivotOffsets] || 'standard';
        
        switch(mode) {
            case 'bend': return parentRot + (local * 1.5);
            case 'stretch': return parentRot + (local * 0.5);
            default: return parentRot + local;
        }
    };

    if (!isReversed) {
        // --- Standard Hierarchy (Waist as Root) ---
        const waistLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.WAIST, 'waist', 'h');
        const waistRot = calculateJointRotation('waist', 0);
        trans.waist = { position: { x: 0, y: 0 }, rotation: waistRot, length: waistLen };
        trans.waistJoint = { position: { x: 0, y: 0 }, rotation: waistRot, length: waistLen };

        const torsoLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TORSO, 'torso', 'h');
        const torsoRot = calculateJointRotation('torso', waistRot);
        const torsoPos = addVec(trans.waist.position, rotateVec({ x: 0, y: -waistLen }, waistRot));
        trans.torso = { position: torsoPos, rotation: torsoRot, length: torsoLen };
        trans.torsoJoint = { position: torsoPos, rotation: torsoRot, length: torsoLen };

        const collarLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.COLLAR, 'collar', 'h');
        const collarRot = calculateJointRotation('collar', torsoRot);
        const collarPos = addVec(trans.torso.position, rotateVec({ x: 0, y: -torsoLen }, torsoRot));
        trans.collar = { position: collarPos, rotation: collarRot, length: collarLen };
        trans.collarJoint = { position: collarPos, rotation: collarRot, length: collarLen };
        
        const collarEndPoint = addVec(trans.collar.position, rotateVec({ x: 0, y: -collarLen }, collarRot));
        trans.collarEndPoint = { position: collarEndPoint, rotation: collarRot };

        const neckRot = calculateJointRotation('neck', collarRot);
        const headPos = addVec(trans.collar.position, rotateVec({ x: 0, y: -collarLen }, collarRot));
        trans.head = { position: headPos, rotation: neckRot, length: getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HEAD, 'head', 'h') };
        trans.headJoint = { position: headPos, rotation: neckRot };

        ['r', 'l'].forEach(side => {
            const shBoneKey = `${side}_shoulder` as keyof WalkingEnginePivotOffsets;
            const upArmPropKey = `${side}_upper_arm` as keyof WalkingEngineProportions;
            const elBoneKey = `${side}_elbow` as keyof WalkingEnginePivotOffsets;
            const lowArmPropKey = `${side}_lower_arm` as keyof WalkingEngineProportions;
            const handBoneKey = `${side}_hand` as keyof WalkingEnginePivotOffsets;
            const handPropKey = `${side}_hand` as keyof WalkingEngineProportions;
            const sx = (side === 'r' ? RIGGING.R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER : RIGGING.L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER) * baseUnitH;
            const shJointPos = addVec(collarEndPoint, rotateVec({ x: sx, y: 0 }, collarRot));
            const shRot = calculateJointRotation(shBoneKey, collarRot + (side === 'l' ? 90 : -90));
            const upLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.UPPER_ARM, upArmPropKey, 'h');
            trans[upArmPropKey] = { position: shJointPos, rotation: shRot, length: upLen };
            const elJointPos = addVec(shJointPos, rotateVec({ x: 0, y: upLen }, shRot));
            const elRot = calculateJointRotation(elBoneKey, shRot);
            const lowLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LOWER_ARM, lowArmPropKey, 'h');
            trans[lowArmPropKey] = { position: elJointPos, rotation: elRot, length: lowLen };
            const handJointPos = addVec(elJointPos, rotateVec({ x: 0, y: lowLen }, elRot));
            const handRot = calculateJointRotation(handBoneKey, elRot);
            const handLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HAND, handPropKey, 'h');
            trans[handPropKey] = { position: handJointPos, rotation: handRot, length: handLen };
        });

        ['r', 'l'].forEach(side => {
            const hipBoneKey = `${side}_hip` as keyof WalkingEnginePivotOffsets;
            const upLegPropKey = `${side}_upper_leg` as keyof WalkingEngineProportions;
            const kneeBoneKey = `${side}_knee` as keyof WalkingEnginePivotOffsets;
            const lowLegPropKey = `${side}_lower_leg` as keyof WalkingEngineProportions;
            const footBoneKey = `${side}_foot` as keyof WalkingEnginePivotOffsets;
            const footPropKey = `${side}_foot` as keyof WalkingEngineProportions;
            const toeBoneKey = `${side}_toe` as keyof WalkingEnginePivotOffsets;
            const toePropKey = `${side}_toe` as keyof WalkingEngineProportions;
            const hipJointPos = trans.waist.position;
            const hipRot = calculateJointRotation(hipBoneKey, waistRot + 180);
            const thighLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_UPPER, upLegPropKey, 'h');
            trans[upLegPropKey] = { position: hipJointPos, rotation: hipRot, length: thighLen };
            const kneeJointPos = addVec(hipJointPos, rotateVec({ x: 0, y: thighLen }, hipRot));
            const kneeRot = calculateJointRotation(kneeBoneKey, hipRot);
            const calfLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_LOWER, lowLegPropKey, 'h');
            trans[lowLegPropKey] = { position: kneeJointPos, rotation: kneeRot, length: calfLen };
            const ankleJointPos = addVec(kneeJointPos, rotateVec({ x: 0, y: calfLen }, kneeRot));
            const ankleRot = calculateJointRotation(footBoneKey, kneeRot);
            const footLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.FOOT, footPropKey, 'h');
            trans[footPropKey] = { position: ankleJointPos, rotation: ankleRot, length: footLen };
            const toeJointPos = addVec(ankleJointPos, rotateVec({ x: 0, y: footLen }, ankleRot));
            const toeRot = calculateJointRotation(toeBoneKey, ankleRot);
            const toeLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TOE, toePropKey, 'h');
            trans[toePropKey] = { position: toeJointPos, rotation: toeRot, length: toeLen };
        });
    } else {
        // --- Reversed Hierarchy (Head as Root) ---
        const neckRot = calculateJointRotation('neck', 0);
        trans.head = { position: { x: 0, y: 0 }, rotation: neckRot, length: getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HEAD, 'head', 'h') };
        trans.headJoint = { position: { x: 0, y: 0 }, rotation: neckRot };
        
        const collarLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.COLLAR, 'collar', 'h');
        const collarRot = calculateJointRotation('collar', neckRot);
        const collarPos = addVec(trans.head.position, rotateVec({ x: 0, y: collarLen }, neckRot));
        trans.collar = { position: collarPos, rotation: collarRot, length: collarLen };
        trans.collarJoint = { position: collarPos, rotation: collarRot, length: collarLen };
        
        const collarEndPoint = addVec(trans.collar.position, rotateVec({ x: 0, y: collarLen }, collarRot));
        trans.collarEndPoint = { position: collarEndPoint, rotation: collarRot };

        const torsoLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TORSO, 'torso', 'h');
        const torsoRot = calculateJointRotation('torso', collarRot);
        const torsoPos = addVec(trans.collar.position, rotateVec({ x: 0, y: collarLen }, collarRot));
        trans.torso = { position: torsoPos, rotation: torsoRot, length: torsoLen };
        trans.torsoJoint = { position: torsoPos, rotation: torsoRot, length: torsoLen };
        
        const waistLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.WAIST, 'waist', 'h');
        const waistRot = calculateJointRotation('waist', torsoRot);
        const waistPos = addVec(trans.torso.position, rotateVec({ x: 0, y: torsoLen }, torsoRot));
        trans.waist = { position: waistPos, rotation: waistRot, length: waistLen };
        trans.waistJoint = { position: waistPos, rotation: waistRot, length: waistLen };

        ['r', 'l'].forEach(side => {
            const shBoneKey = `${side}_shoulder` as keyof WalkingEnginePivotOffsets;
            const upArmPropKey = `${side}_upper_arm` as keyof WalkingEngineProportions;
            const elBoneKey = `${side}_elbow` as keyof WalkingEnginePivotOffsets;
            const lowArmPropKey = `${side}_lower_arm` as keyof WalkingEngineProportions;
            const handBoneKey = `${side}_hand` as keyof WalkingEnginePivotOffsets;
            const handPropKey = `${side}_hand` as keyof WalkingEngineProportions;
            const sx = (side === 'r' ? RIGGING.R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER : RIGGING.L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER) * baseUnitH;
            const shJointPos = addVec(collarEndPoint, rotateVec({ x: sx, y: 0 }, collarRot));
            const shRot = calculateJointRotation(shBoneKey, collarRot + (side === 'l' ? 90 : -90));
            const upLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.UPPER_ARM, upArmPropKey, 'h');
            trans[upArmPropKey] = { position: shJointPos, rotation: shRot, length: upLen };
            const elJointPos = addVec(shJointPos, rotateVec({ x: 0, y: upLen }, shRot));
            const elRot = calculateJointRotation(elBoneKey, shRot);
            const lowLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LOWER_ARM, lowArmPropKey, 'h');
            trans[lowArmPropKey] = { position: elJointPos, rotation: elRot, length: lowLen };
            const handJointPos = addVec(elJointPos, rotateVec({ x: 0, y: lowLen }, elRot));
            const handRot = calculateJointRotation(handBoneKey, elRot);
            const handLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HAND, handPropKey, 'h');
            trans[handPropKey] = { position: handJointPos, rotation: handRot, length: handLen };
        });

        ['r', 'l'].forEach(side => {
            const hipBoneKey = `${side}_hip` as keyof WalkingEnginePivotOffsets;
            const upLegPropKey = `${side}_upper_leg` as keyof WalkingEngineProportions;
            const kneeBoneKey = `${side}_knee` as keyof WalkingEnginePivotOffsets;
            const lowLegPropKey = `${side}_lower_leg` as keyof WalkingEngineProportions;
            const footBoneKey = `${side}_foot` as keyof WalkingEnginePivotOffsets;
            const footPropKey = `${side}_foot` as keyof WalkingEngineProportions;
            const toeBoneKey = `${side}_toe` as keyof WalkingEnginePivotOffsets;
            const toePropKey = `${side}_toe` as keyof WalkingEngineProportions;
            const hipJointPos = trans.waist.position;
            const hipRot = calculateJointRotation(hipBoneKey, waistRot + 180);
            const thighLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_UPPER, upLegPropKey, 'h');
            trans[upLegPropKey] = { position: hipJointPos, rotation: hipRot, length: thighLen };
            const kneeJointPos = addVec(hipJointPos, rotateVec({ x: 0, y: thighLen }, hipRot));
            const kneeRot = calculateJointRotation(kneeBoneKey, hipRot);
            const calfLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_LOWER, lowLegPropKey, 'h');
            trans[lowLegPropKey] = { position: kneeJointPos, rotation: kneeRot, length: calfLen };
            const ankleJointPos = addVec(kneeJointPos, rotateVec({ x: 0, y: calfLen }, kneeRot));
            const ankleRot = calculateJointRotation(footBoneKey, kneeRot);
            const footLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.FOOT, footPropKey, 'h');
            trans[footPropKey] = { position: ankleJointPos, rotation: ankleRot, length: footLen };
            const toeJointPos = addVec(ankleJointPos, rotateVec({ x: 0, y: footLen }, ankleRot));
            const toeRot = calculateJointRotation(toeBoneKey, ankleRot);
            const toeLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TOE, toePropKey, 'h');
            trans[toePropKey] = { position: toeJointPos, rotation: toeRot, length: toeLen };
        });
    }
    return trans;
}


interface MannequinProps {
  pose: WalkingEnginePose;
  pivotOffsets: WalkingEnginePivotOffsets & { l_hand_flash?: boolean; r_hand_flash?: boolean };
  props: WalkingEngineProportions;
  showPivots: boolean;
  showLabels: boolean;
  baseUnitH: number;
  onAnchorMouseDown: (boneKey: keyof WalkingEnginePivotOffsets, event: React.MouseEvent) => void;
  draggingBoneKey: keyof WalkingEnginePivotOffsets | null;
  isPaused: boolean;
  pinningMode: 'none' | 'rightFoot' | 'dual';
  maskImage?: string | null;
  maskTransform?: MaskTransform;
  offset: Vector2D;
  isReversed?: boolean;
  jointModes?: Record<keyof WalkingEnginePivotOffsets, JointMode>;
  disabledJoints?: Record<keyof WalkingEnginePivotOffsets, boolean>;
  hiddenBoneKeys?: Set<keyof WalkingEnginePivotOffsets>;
  activeChain?: (keyof WalkingEnginePivotOffsets)[] | null;
  partShapes?: Record<keyof WalkingEngineProportions, BoneVariant>;
  partColors?: Record<keyof WalkingEngineProportions, string | null>;
}

const RENDER_ORDER: (keyof WalkingEngineProportions)[] = [
    'waist', 'torso', 'l_upper_leg', 'r_upper_leg', 'l_lower_leg', 'r_lower_leg', 'l_foot', 'r_foot', 'l_toe', 'r_toe', 
    'collar', 'head', 'l_upper_arm', 'r_upper_arm', 'l_lower_arm', 'r_lower_arm', 'l_hand', 'r_hand'
];

export const partDefinitions: Record<keyof WalkingEngineProportions, any> = {
    head: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HEAD, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HEAD_WIDTH, variant: 'head-tall-oval', drawsUpwards: true, label: 'Head', boneKey: 'neck' },
    collar: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.COLLAR, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.COLLAR_WIDTH, variant: 'collar-horizontal-oval-shape', drawsUpwards: true, label: 'Collar', boneKey: 'collar' },
    torso: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TORSO, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TORSO_WIDTH, variant: 'torso-teardrop-pointy-down', drawsUpwards: true, label: 'Upper Body', boneKey: 'torso' },
    waist: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.WAIST, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.WAIST_WIDTH, variant: 'waist-teardrop-pointy-up', drawsUpwards: true, label: 'Lower Body', boneKey: 'waist' },
    r_upper_arm: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.UPPER_ARM, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_ARM, variant: 'deltoid-shape', label: 'Shoulder', boneKey: 'r_shoulder' },
    r_lower_arm: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LOWER_ARM, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_FOREARM, variant: 'limb-tapered', label: 'Forearm', boneKey: 'r_elbow' },
    r_hand: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HAND, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HAND_WIDTH, variant: 'hand-foot-arrowhead-shape', label: 'Hand', boneKey: 'r_hand' },
    l_upper_arm: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.UPPER_ARM, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_ARM, variant: 'deltoid-shape', label: 'Shoulder', boneKey: 'l_shoulder' },
    l_lower_arm: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LOWER_ARM, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_FOREARM, variant: 'limb-tapered', label: 'Forearm', boneKey: 'l_elbow' },
    l_hand: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HAND, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HAND_WIDTH, variant: 'hand-foot-arrowhead-shape', label: 'Hand', boneKey: 'l_hand' },
    r_upper_leg: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_UPPER, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_THIGH, variant: 'limb-tapered', label: 'Thigh', boneKey: 'r_hip' },
    r_lower_leg: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_LOWER, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_CALF, variant: 'limb-tapered', label: 'Calf', boneKey: 'r_knee' },
    r_foot: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.FOOT, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.FOOT_WIDTH, variant: 'foot-block-shape', label: 'Foot', boneKey: 'r_foot' },
    r_toe: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TOE, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TOE_WIDTH, variant: 'toe-rounded-cap', label: 'Toe', boneKey: 'r_toe' },
    l_upper_leg: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_UPPER, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_THIGH, variant: 'limb-tapered', label: 'Thigh', boneKey: 'l_hip' },
    l_lower_leg: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_LOWER, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_CALF, variant: 'limb-tapered', label: 'Calf', boneKey: 'l_knee' },
    l_foot: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.FOOT, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.FOOT_WIDTH, variant: 'foot-block-shape', label: 'Foot', boneKey: 'l_foot' },
    l_toe: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TOE, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TOE_WIDTH, variant: 'toe-rounded-cap', label: 'Toe', boneKey: 'l_toe' },
};

const Mannequin: React.FC<MannequinProps> = ({
  pivotOffsets, props, showPivots, showLabels, baseUnitH,
  onAnchorMouseDown, draggingBoneKey, isPaused, pinningMode,
  maskImage, maskTransform, offset, isReversed, jointModes, disabledJoints, hiddenBoneKeys, activeChain, partShapes, partColors
}) => {
    const getScaledDimension = useCallback((raw: number, key: keyof WalkingEngineProportions, axis: 'w' | 'h') => {
        return raw * baseUnitH * (props[key]?.[axis] || 1);
    }, [baseUnitH, props]);

    const globalTransforms = useMemo(() => {
      return getMannequinWorldTransformsHelper(
        pivotOffsets, props, baseUnitH, isReversed, jointModes, disabledJoints
      );
    }, [pivotOffsets, props, baseUnitH, isReversed, jointModes, disabledJoints]);

    return (
        <g>
            {RENDER_ORDER.map(partKey => {
                const p = partDefinitions[partKey];
                const t = globalTransforms[partKey];
                if (!p || !t) return null;

                const colorOverride = partColors?.[partKey] || null;
                const colorClass = colorOverride ?? (
                  (partKey === 'collar') ? 'fill-olive' :
                  (partKey === 'l_hand' && pivotOffsets.l_hand_flash) ? 'fill-accent-red' :
                  (partKey === 'r_hand' && pivotOffsets.r_hand_flash) ? 'fill-accent-red' : 'fill-mono-dark'
                );

                return (
                    <g key={partKey} transform={`translate(${t.position.x}, ${t.position.y}) rotate(${t.rotation})`}>
                        <Bone 
                            rotation={0}
                            length={t.length || 0}
                            width={getScaledDimension(p.rawW, partKey, 'w') || 0}
                            variant={partShapes?.[partKey] || p.variant}
                            drawsUpwards={p.drawsUpwards}
                            label={p.label}
                            boneKey={p.boneKey}
                            proportionKey={partKey}
                            showPivots={showPivots}
                            showLabel={showLabels}
                            onAnchorMouseDown={onAnchorMouseDown}
                            isBeingDragged={draggingBoneKey === p.boneKey}
                            isPausedAndPivotsVisible={true} 
                            colorClass={colorClass}
                            isPinned={pinningMode === 'rightFoot' && partKey === 'r_foot'}
                            isInActiveChain={activeChain?.includes(p.boneKey)}
                            visible={!hiddenBoneKeys?.has(p.boneKey)}
                        />
                    </g>
                );
            })}
        </g>
    );
};

export { Mannequin };
