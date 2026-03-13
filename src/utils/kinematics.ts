
import { ANATOMY, BASE_ROTATIONS, RIGGING } from '../constants';
import { PartName, Pose, Vector2D, AnchorName, JointConstraint, CHILD_MAP, LIMB_SEQUENCES, partNameToPoseKey, ProportionScales } from '../types';

export const lerp = (start: number, end: number, t: number): number => start * (1 - t) + end * t;

/**
 * Calculates shortest angular difference between two angles in degrees.
 */
export const getShortestAngleDiffDeg = (currentDeg: number, startDeg: number): number => {
  let diff = currentDeg - startDeg;
  diff = ((diff % 360) + 360) % 360; 
  if (diff > 180) diff -= 360;
  return diff;
};

export const lerpAngleShortestPath = (a: number, b: number, t: number): number => {
  const normalize = (angle: number) => ((angle % 360) + 360) % 360;
  let start = normalize(a);
  let end = normalize(b);
  let delta = end - start;
  if (delta > 180) delta -= 360;
  else if (delta < -180) delta += 360;
  return a + delta * t;
};

const rad = (deg: number): number => deg * Math.PI / 180;
const deg = (rad: number): number => rad * 180 / Math.PI;
const dist = (v1: Vector2D, v2: Vector2D): number => Math.sqrt(Math.pow(v2.x - v1.x, 2) + Math.pow(v2.y - v1.y, 2));

const rotateVec = (x: number, y: number, angleDeg: number): Vector2D => {
  const r = rad(angleDeg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
};
const addVec = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x + v2.x, y: v1.y + v2.y });

export const getTotalRotation = (key: string, pose: Pose): number => 
  (BASE_ROTATIONS[key as keyof typeof BASE_ROTATIONS] || 0) + ((pose as any)[key] || 0);

const DEFAULT_SCALES: ProportionScales = { arm: 1, leg: 1, torso: 1, head: 1 };
const withScales = (scales?: Partial<ProportionScales>): ProportionScales => ({
  ...DEFAULT_SCALES,
  ...(scales || {}),
});

const scaledLength = (key: keyof typeof ANATOMY, scales?: Partial<ProportionScales>) => {
  const s = withScales(scales);
  const base = ANATOMY[key];
  if (['UPPER_ARM', 'LOWER_ARM', 'HAND'].includes(key)) return base * s.arm;
  if (['LEG_UPPER', 'LEG_LOWER', 'FOOT'].includes(key)) return base * s.leg;
  if (['TORSO', 'WAIST', 'COLLAR'].includes(key)) return base * s.torso;
  if (['HEAD'].includes(key)) return base * s.head;
  return base;
};

const calculateBoneGlobalPositions = (
  parentGlobalPos: Vector2D,
  parentGlobalAngle: number,
  boneTotalLocalRotation: number,
  boneLength: number,
  boneOffset: Vector2D = { x: 0, y: 0 },
  isUpwardDrawing: boolean = false
): { globalStartPoint: Vector2D; globalEndPoint: Vector2D; childInheritedGlobalAngle: number } => {
  const rotatedOffset = rotateVec(boneOffset.x, boneOffset.y, parentGlobalAngle);
  const globalStartPoint = addVec(parentGlobalPos, rotatedOffset);
  const boneGlobalAngle = parentGlobalAngle + boneTotalLocalRotation;
  const y_dir = isUpwardDrawing ? -1 : 1;
  const boneVector = rotateVec(0, boneLength * y_dir, boneGlobalAngle);
  const globalEndPoint = addVec(globalStartPoint, boneVector);
  return { globalStartPoint, globalEndPoint, childInheritedGlobalAngle: boneGlobalAngle };
};

/**
 * Apply Curl/Stretch kinetic behaviors to child joints when a parent joint rotates.
 */
export const applyKineticBehaviors = (
  pose: Pose,
  changedPart: PartName,
  angleDelta: number,
  jointModes: Record<PartName, JointConstraint>,
  resonance: number = 1.0
): Pose => {
  const newPose = { ...pose };
  const children = CHILD_MAP[changedPart];
  if (!children) return newPose;

  children.forEach(child => {
    const mode = jointModes[child];
    if (mode === 'fk') return;

    const poseKey = child === PartName.RElbow ? 'rForearm' : 
                    child === PartName.LElbow ? 'lForearm' : 
                    child === PartName.RSkin ? 'rCalf' : 
                    child === PartName.LSkin ? 'lCalf' : 
                    (child as string);

    if (mode === 'stretch') {
      // Counter-rotate to maintain world orientation
      (newPose as any)[poseKey] = ((newPose as any)[poseKey] || 0) - (angleDelta * resonance);
    } else if (mode === 'curl') {
      // Exaggerate fold (rotate same direction as parent)
      (newPose as any)[poseKey] = ((newPose as any)[poseKey] || 0) + (angleDelta * resonance);
    }
  });

  return newPose;
};

const _calculateGlobalJointPositions = (
    baseRoot: Vector2D,
    baseBodyRotation: number,
    pose: Pose,
    scales?: Partial<ProportionScales>
): Record<string, Vector2D> => {
    const offsets = pose.offsets || {};

    const waistCalc = calculateBoneGlobalPositions(baseRoot, baseBodyRotation, getTotalRotation(PartName.Waist, pose), scaledLength('WAIST', scales), offsets[PartName.Waist], true);
    const torsoCalc = calculateBoneGlobalPositions(waistCalc.globalEndPoint, waistCalc.childInheritedGlobalAngle, getTotalRotation(PartName.Torso, pose), scaledLength('TORSO', scales), offsets[PartName.Torso], true);
    const collarCalc = calculateBoneGlobalPositions(torsoCalc.globalEndPoint, torsoCalc.childInheritedGlobalAngle, getTotalRotation(PartName.Collar, pose), scaledLength('COLLAR', scales), offsets[PartName.Collar], true);
    const collarAngle = collarCalc.childInheritedGlobalAngle;
    const collarEnd = collarCalc.globalEndPoint;

    const headPivot = addVec(collarEnd, rotateVec(0, -ANATOMY.HEAD_NECK_GAP_OFFSET, collarAngle));
    const headGlobalAngle = collarAngle + getTotalRotation(PartName.Head, pose);
    const headTip = addVec(headPivot, rotateVec(0, -scaledLength('HEAD', scales), headGlobalAngle));

    const getArmJoints = (isRight: boolean) => {
        const side = isRight ? 'r' : 'l';
        const sX = isRight ? RIGGING.R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER : RIGGING.L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER;
        // Shoulder pinning remains unchanged: locks to collar corners
        const shoulderAttach = addVec(collarEnd, rotateVec(sX, RIGGING.SHOULDER_Y_OFFSET_FROM_COLLAR_END, collarAngle));
        const upperArmCalc = calculateBoneGlobalPositions(shoulderAttach, collarAngle, getTotalRotation(isRight ? PartName.RShoulder : PartName.LShoulder, pose), scaledLength('UPPER_ARM', scales), offsets[isRight ? PartName.RShoulder : PartName.LShoulder], false);
        const forearmCalc = calculateBoneGlobalPositions(upperArmCalc.globalEndPoint, upperArmCalc.childInheritedGlobalAngle, getTotalRotation(isRight ? 'rForearm' : 'lForearm', pose), scaledLength('LOWER_ARM', scales), offsets[isRight ? PartName.RElbow : PartName.LElbow], false);
        const handAngle = forearmCalc.childInheritedGlobalAngle + getTotalRotation(isRight ? PartName.RWrist : PartName.LWrist, pose);
        const handTip = addVec(forearmCalc.globalEndPoint, rotateVec(0, scaledLength('HAND', scales), handAngle));
        return { shoulder: shoulderAttach, elbow: upperArmCalc.globalEndPoint, wrist: forearmCalc.globalEndPoint, hand: handTip };
    };

    const getLegJoints = (isRight: boolean) => {
        const thighCalc = calculateBoneGlobalPositions(baseRoot, baseBodyRotation, getTotalRotation(isRight ? PartName.RThigh : PartName.LThigh, pose), scaledLength('LEG_UPPER', scales), offsets[isRight ? PartName.RThigh : PartName.LThigh], false);
        const calfCalc = calculateBoneGlobalPositions(thighCalc.globalEndPoint, thighCalc.childInheritedGlobalAngle, getTotalRotation(isRight ? 'rCalf' : 'lCalf', pose), scaledLength('LEG_LOWER', scales), offsets[isRight ? PartName.RSkin : PartName.LSkin], false);
        const ankleAngle = calfCalc.childInheritedGlobalAngle + getTotalRotation(isRight ? PartName.RAnkle : PartName.LAnkle, pose);
        const footTip = addVec(calfCalc.globalEndPoint, rotateVec(0, scaledLength('FOOT', scales), ankleAngle));
        return { hip: baseRoot, knee: thighCalc.globalEndPoint, ankle: calfCalc.globalEndPoint, footTip };
    };

    const rArm = getArmJoints(true);
    const lArm = getArmJoints(false);
    const rLeg = getLegJoints(true);
    const lLeg = getLegJoints(false);

    return {
        root: baseRoot,
        waist: baseRoot,
        torso: waistCalc.globalEndPoint,
        collar: torsoCalc.globalEndPoint,
        head: headPivot,
        rShoulder: rArm.shoulder,
        rElbow: rArm.elbow,
        rWrist: rArm.wrist,
        lShoulder: lArm.shoulder,
        lElbow: lArm.elbow,
        lWrist: lArm.wrist,
        rThigh: baseRoot,
        [PartName.RSkin]: rLeg.knee,
        rAnkle: rLeg.ankle,
        lThigh: baseRoot,
        [PartName.LSkin]: lLeg.knee,
        lAnkle: lLeg.ankle,
        headTip,
        rFootTip: rLeg.footTip,
        lFootTip: lLeg.footTip,
        rHandTip: rArm.hand,
        lHandTip: lArm.hand,
    };
};

/**
 * Calculates global positions of all joints, adjusted for the active pins.
 * The primary pin (first in array) is used for stabilization.
 * Other pins will exhibit "elasticity" (tension) if the model moves away from them.
 */
export const getJointPositions = (pose: Pose, activePins: AnchorName[], scales?: Partial<ProportionScales>): Record<string, Vector2D> => {
    const inputRoot = pose.root;
    const inputBodyRotation = getTotalRotation('bodyRotation', pose);
    const primaryPin = activePins[0] || 'root';

    // If pinning root, just return standard calc.
    if (primaryPin === 'root' || primaryPin === PartName.Waist) {
        return _calculateGlobalJointPositions(inputRoot, inputBodyRotation, pose, scales);
    }

    // To keep a pin fixed while rotating, we find the offset the rotation caused.
    const jointsNoRot = _calculateGlobalJointPositions(inputRoot, 0, pose, scales);
    const pinNoRot = jointsNoRot[primaryPin as string];
    if (!pinNoRot) return _calculateGlobalJointPositions(inputRoot, inputBodyRotation, pose, scales);

    const jointsWithRot = _calculateGlobalJointPositions(inputRoot, inputBodyRotation, pose, scales);
    const pinWithRot = jointsWithRot[primaryPin as string];
    if (!pinWithRot) return jointsWithRot;

    // Calculate how much the pin moved due to rotation
    const offset = {
        x: pinNoRot.x - pinWithRot.x,
        y: pinNoRot.y - pinWithRot.y,
    };

    // Shift the entire model by that offset to keep the pin at its "no-rotation" position
    const stabilizedRoot = {
        x: inputRoot.x + offset.x,
        y: inputRoot.y + offset.y,
    };

    return _calculateGlobalJointPositions(stabilizedRoot, inputBodyRotation, pose, scales);
};

/**
 * Calculates the tension factor (0 to 1+) based on distance from pin to anatomical joint.
 */
export const calculateTensionFactor = (anatomicalPos: Vector2D, pinnedPos: Vector2D, threshold: number = 50): number => {
    const dx = anatomicalPos.x - pinnedPos.x;
    const dy = anatomicalPos.y - pinnedPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return Math.min(2.0, distance / threshold);
};

/**
 * Interpolates between two poses.
 */
const interpolateOffsets = (
  startOffsets: Record<string, Vector2D>,
  endOffsets: Record<string, Vector2D>,
  t: number
): Record<string, Vector2D> => {
  const keys = new Set([...Object.keys(startOffsets), ...Object.keys(endOffsets)]);
  const result: Record<string, Vector2D> = {};
  keys.forEach(key => {
    const s = startOffsets[key] || { x: 0, y: 0 };
    const e = endOffsets[key] || { x: 0, y: 0 };
    result[key] = { x: lerp(s.x, e.x, t), y: lerp(s.y, e.y, t) };
  });
  return result;
};

export const interpolatePoses = (start: Pose, end: Pose, t: number): Pose => {
  const result: any = {
    root: {
      x: lerp(start.root.x, end.root.x, t),
      y: lerp(start.root.y, end.root.y, t),
    },
    bodyRotation: lerpAngleShortestPath(start.bodyRotation, end.bodyRotation, t),
    offsets: interpolateOffsets(start.offsets || {}, end.offsets || {}, t),
  };

  const keys = Object.keys(BASE_ROTATIONS) as (keyof typeof BASE_ROTATIONS)[];
  keys.forEach(key => {
    if (key === 'bodyRotation') return;
    result[key] = lerpAngleShortestPath((start as any)[key] || 0, (end as any)[key] || 0, t);
  });

  return result as Pose;
};

/**
 * FABRIK IK Solver (Forward And Backward Reaching Inverse Kinematics)
 * Provides more fluid and stable limb movement than CCD.
 */
export const solveFABRIK = (
  pose: Pose,
  limbName: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
  target: Vector2D,
  jointModes: Record<PartName, JointConstraint>,
  activePins: AnchorName[],
  scales?: Partial<ProportionScales>,
  iterations: number = 10,
  tolerance: number = 0.1
): Pose => {
  const newPose = { ...pose };
  const chain = LIMB_SEQUENCES[limbName];
  if (!chain) return newPose;

  // 1. Get current global positions and bone lengths
  // Use activePins to ensure we are solving in the correct world space
  const joints = getJointPositions(newPose, activePins, scales);
  const points: Vector2D[] = chain.map(joint => ({ ...joints[joint as string] }));
  
  // Add effector tip for better precision
  const effector = chain[chain.length - 1];
  const tipKey = effector === PartName.RAnkle ? 'rFootTip' : effector === PartName.LAnkle ? 'lFootTip' : effector === PartName.RWrist ? 'rHandTip' : 'lHandTip';
  points.push({ ...joints[tipKey] });

  const originalLengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    originalLengths.push(dist(points[i], points[i + 1]));
  }

  const origin = { ...points[0] };
  const currentLengths = originalLengths;

  if (dist(origin, target) >= originalLengths.reduce((a, b) => a + b, 0)) {
    // Standard out-of-reach behavior: extend fully
    for (let i = 0; i < points.length - 1; i++) {
      const r = dist(points[i], target);
      if (r < 1e-6) continue; // Skip if points coincide
      const lambda = currentLengths[i] / r;
      points[i + 1] = {
        x: (1 - lambda) * points[i].x + lambda * target.x,
        y: (1 - lambda) * points[i].y + lambda * target.y
      };
    }
  } else {
    for (let iter = 0; iter < iterations; iter++) {
      if (dist(points[points.length - 1], target) < tolerance) break;

      // Forward Pass
      points[points.length - 1] = { ...target };
      for (let i = points.length - 2; i >= 0; i--) {
        const r = dist(points[i + 1], points[i]);
        if (r < 1e-6) continue;
        const lambda = currentLengths[i] / r;
        points[i] = {
          x: (1 - lambda) * points[i + 1].x + lambda * points[i].x,
          y: (1 - lambda) * points[i + 1].y + lambda * points[i].y
        };
      }

      // Backward Pass
      points[0] = { ...origin };
      for (let i = 0; i < points.length - 1; i++) {
        const r = dist(points[i], points[i + 1]);
        if (r < 1e-6) continue;
        const lambda = currentLengths[i] / r;
        points[i + 1] = {
          x: (1 - lambda) * points[i].x + lambda * points[i + 1].x,
          y: (1 - lambda) * points[i].y + lambda * points[i + 1].y
        };
      }
    }
          y: (1 - lambda) * points[i + 1].y + lambda * points[i].y
        };
      }

      // Backward Pass
      points[0] = { ...origin };
      for (let i = 0; i < points.length - 1; i++) {
        const r = dist(points[i], points[i + 1]);
        const lambda = currentLengths[i] / r;
        points[i + 1] = {
          x: (1 - lambda) * points[i].x + lambda * points[i + 1].x,
          y: (1 - lambda) * points[i].y + lambda * points[i + 1].y
        };
      }
    }
  }

  // 2. Convert points back to joint angles and update offsets if stretched
  // We solve angles sequentially from root to effector
  let currentParentAngle = 0;
  if (limbName === 'rArm' || limbName === 'lArm') {
    const waistAngle = newPose.bodyRotation + getTotalRotation(PartName.Waist, newPose);
    const torsoAngle = waistAngle + getTotalRotation(PartName.Torso, newPose);
    currentParentAngle = torsoAngle + getTotalRotation(PartName.Collar, newPose);
  } else {
    currentParentAngle = newPose.bodyRotation;
  }

  if (!newPose.offsets) newPose.offsets = {};

  for (let i = 0; i < chain.length; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const globalAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
    const normalizedGlobalAngle = globalAngle - 90; 
    
    const part = chain[i];
    const poseKey = partNameToPoseKey[part];
    const baseRot = BASE_ROTATIONS[poseKey as keyof typeof BASE_ROTATIONS] || 0;
    
    let localAngle = normalizedGlobalAngle - currentParentAngle - baseRot;
    localAngle = ((localAngle + 180) % 360 + 360) % 360 - 180;

    (newPose as any)[poseKey] = localAngle;
    currentParentAngle = normalizedGlobalAngle;

    // If stretched, we need to handle the bone length change
    // In our current system, bone lengths are fixed in ANATOMY.
    // To "stretch", we would need to use offsets or dynamic ANATOMY.
    // Bitruvius 0.2 uses offsets for "Elasticity".
    if (hasStretch) {
        const originalLen = originalLengths[i];
        const currentLen = currentLengths[i];
        if (Math.abs(currentLen - originalLen) > 0.1) {
            // We don't have a direct "bone length" property in Pose, 
            // but we can use offsets to shift the child joint.
            // However, the next joint in the chain will be calculated from the previous one's end point.
            // This is complex with the current _calculateGlobalJointPositions.
            // For now, let's just solve the angles. 
            // True "Stretch" (bone elongation) requires a more flexible rigging system.
        }
    }
  }

  return newPose;
};

/**
 * Advanced IK Solver that combines FABRIK with Bitruvius constraints.
 */
export const solveAdvancedIK = (
  pose: Pose,
  limbName: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
  target: Vector2D,
  jointModes: Record<PartName, JointConstraint>,
  activePins: AnchorName[],
  scales?: Partial<ProportionScales>
): Pose => {
  return solveFABRIK(pose, limbName, target, jointModes, activePins, scales);
};

/**
 * Simple CCD IK Solver for a limb chain.
 */
export const solveIK = (
  pose: Pose,
  limbName: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
  target: Vector2D,
  iterations: number = 10,
  scales?: Partial<ProportionScales>
): Pose => {
  const newPose = { ...pose };
  const chain = LIMB_SEQUENCES[limbName];
  if (!chain) return newPose;

  // CCD Implementation
  const joints = getJointPositions(newPose, [] as any, scales);
  
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = chain.length - 1; i >= 0; i--) {
      const currentJoint = chain[i];
      const effector = chain[chain.length - 1];
      
      const jointPos = joints[currentJoint as string];
      const effectorPos = joints[effector === PartName.RAnkle ? 'rFootTip' : effector === PartName.LAnkle ? 'lFootTip' : effector === PartName.RWrist ? 'rHandTip' : 'lHandTip'];
      
      if (!jointPos || !effectorPos) continue;

      const toEffector = { x: effectorPos.x - jointPos.x, y: effectorPos.y - jointPos.y };
      const toTarget = { x: target.x - jointPos.x, y: target.y - jointPos.y };

      const angleEffector = Math.atan2(toEffector.y, toEffector.x);
      const angleTarget = Math.atan2(toTarget.y, toTarget.x);
      
      let deltaAngle = deg(angleTarget - angleEffector);
      
      // Apply bias only when there's a meaningful delta to correct
      if (Math.abs(deltaAngle) > 0.5) {
        deltaAngle += (deltaAngle > 0 ? 1 : -1);
      }

      const poseKey = partNameToPoseKey[currentJoint];
      (newPose as any)[poseKey] = ((newPose as any)[poseKey] || 0) + deltaAngle;
    }
  }

  return newPose;
};
