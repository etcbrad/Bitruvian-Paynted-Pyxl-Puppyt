

export type Vector2D = { x: number; y: number; };

export type MaskTransform = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
};

export type JointMode = 'standard' | 'bend' | 'stretch';

export type BoneVariant =
  | 'diamond'
  | 'waist-teardrop-pointy-up'
  | 'torso-teardrop-pointy-down'
  | 'collar-horizontal-oval-shape'
  | 'deltoid-shape'
  | 'limb-tapered'
  | 'head-tall-oval'
  | 'hand-foot-arrowhead-shape'
  | 'foot-block-shape'
  | 'toe-rounded-cap'
  | 'capsule'
  | 'triangle'
  | 'triangle-up'
  | 'trapezoid'
  | 'trapezoid-up'
  | 'pentagon';

export type BodyPartMaskLayer = {
  src: string | null;
  visible: boolean;
  opacity: number;
  scale: number;
  mode?: 'projection' | 'costume';
  rotationDeg?: number;
  skewXDeg?: number;
  skewYDeg?: number;
  offsetX?: number;
  offsetY?: number;
  blendMode?: GlobalCompositeOperation;
  filter?: string;
  layerOrder?: 'front' | 'behind';
};

export type RigManifestV1 = {
  version: '1';
  metadata?: {
    source?: string;
    createdAt?: string;
  };
  parts: RigManifestPart[];
  joints: RigManifestJoint[];
  pose: RigManifestPose;
  constraints?: {
    rigidClusters?: string[];
  };
};

export type RigManifestPart = {
  id: string;
  name: string;
  src: string | null;
  width: number;
  height: number;
  pivot: Vector2D;
  ballPoint: Vector2D;
  zIndex: number;
  physics?: {
    stiffness: number;
    tension: number;
    volumePreservation: boolean;
    shadowEnabled: boolean;
  };
  tags?: string[];
  shape?: BoneVariant;
  colorClass?: string;
};

export type RigManifestJoint = {
  id: string;
  parentId: string | null;
  drivesPartId: string;
  defaultOffset: Vector2D;
  defaultRotation: number;
  rigidCluster?: boolean;
};

export type RigManifestPose = {
  joints: Record<string, { rotation: number; offsetX?: number; offsetY?: number }>;
};

export type WalkingEnginePose = {
  waist: number;
  neck: number; 
  collar: number; 
  torso: number;
  l_shoulder: number; r_shoulder: number;
  l_elbow: number; r_elbow: number;
  l_hand: number; r_hand: number;
  l_hip: number; r_hip: number;
  l_knee: number; r_knee: number;
  l_foot: number; r_foot: number;
  l_toe: number; r_toe: number;
  stride_phase: number;
  y_offset: number;
  x_offset: number;
};

export type WalkingEnginePivotOffsets = {
  waist: number;
  neck: number; 
  collar: number; 
  torso: number;
  l_shoulder: number; r_shoulder: number;
  l_elbow: number; r_elbow: number;
  l_hand: number; r_hand: number;
  l_hip: number; r_hip: number;
  l_knee: number; r_knee: number;
  l_foot: number; r_foot: number;
  l_toe: number; r_toe: number;
};

export type WalkingEngineProportions = {
  head: { w: number; h: number };
  collar: { w: number; h: number };
  torso: { w: number; h: number };
  waist: { w: number; h: number };
  l_upper_arm: { w: number; h: number };
  l_lower_arm: { w: number; h: number };
  l_hand: { w: number; h: number };
  r_upper_arm: { w: number; h: number };
  r_lower_arm: { w: number; h: number };
  r_hand: { w: number; h: number };
  l_upper_leg: { w: number; h: number };
  l_lower_leg: { w: number; h: number };
  l_foot: { w: number; h: number };
  l_toe: { w: number; h: number };
  r_upper_leg: { w: number; h: number };
  r_lower_leg: { w: number; h: number };
  r_foot: { w: number; h: number };
  r_toe: { w: number; h: number };
};
