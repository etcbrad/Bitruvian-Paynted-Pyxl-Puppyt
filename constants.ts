

// ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT: These are the proportions of each part
// relative to a single BASE_HEAD_UNIT (typically H=150 in App context).
export const ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT = {
  HEAD: 0.75,
  HEAD_WIDTH: (2 / 3) * 0.5,
  HEAD_NECK_GAP_OFFSET: 0.1,
  COLLAR: 0.4,
  COLLAR_WIDTH: (2 / 3),
  TORSO: 1.2,
  TORSO_WIDTH: 0.65,
  WAIST: 1.0,
  WAIST_WIDTH: 0.85,
  UPPER_ARM: 1.8,
  LOWER_ARM: 1.4,
  HAND: 0.8,
  LEG_UPPER: 2.2,
  LEG_LOWER: 1.8,
  FOOT: 0.64,
  TOE: 0.36,
  SHOULDER_WIDTH: 1.2,
  HIP_WIDTH: 1.0,
  LIMB_WIDTH_ARM: 0.22,
  LIMB_WIDTH_FOREARM: 0.18,
  LIMB_WIDTH_THIGH: 0.35,
  LIMB_WIDTH_CALF: 0.28,
  HAND_WIDTH: 0.2,
  FOOT_WIDTH: 0.25,
  TOE_WIDTH: 0.25,
};

// RIGGING values reference ANATOMY proportions directly.
export const RIGGING = {
  L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER: -ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.COLLAR_WIDTH / 2.1,
  R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.COLLAR_WIDTH / 2.1,
  SHOULDER_Y_OFFSET_FROM_COLLAR_END: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.COLLAR,
  COLLAR_OFFSET_Y: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.COLLAR * 0.15,
};

export const GROUND_STRIP_HEIGHT_RAW_H_UNIT = 0.4;
export const GROUND_STRIP_COLOR = '#2D2D2D'; // Dark grey for ground strip on dark background

// FK Greyscale additional constants
export const SCALE_FACTOR = 3.5;
export const HEAD_UNIT = 50 * SCALE_FACTOR;
export const FLOOR_HEIGHT = 1000 * SCALE_FACTOR;
export const GROUND_SINK_BUFFER = 50 * SCALE_FACTOR;
export const GROUND_SINK_REMAINING_PROPORTION = 0.45;

export const LOGICAL_CHAINS: Record<string, (keyof import('./types').WalkingEnginePivotOffsets)[]> = {
  spine: ['waist', 'torso', 'collar', 'neck'],
  left_arm: ['l_shoulder', 'l_elbow', 'l_hand'],
  right_arm: ['r_shoulder', 'r_elbow', 'r_hand'],
  left_leg: ['l_hip', 'l_knee', 'l_foot', 'l_toe'],
  right_leg: ['r_hip', 'r_knee', 'r_foot', 'r_toe'],
};
