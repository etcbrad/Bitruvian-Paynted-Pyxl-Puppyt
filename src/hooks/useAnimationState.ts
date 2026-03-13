import { useState, useEffect } from 'react';
import { Pose } from '../types';
import { interpolatePoses } from '../utils/kinematics';

export const useAnimationState = () => {
  const [activeTab, setActiveTab] = useState<'model' | 'animation' | 'puppet'>('model');
  const [poseA, setPoseA] = useState<Pose | null>(null);
  const [poseB, setPoseB] = useState<Pose | null>(null);
  const [tweenValue, setTweenValue] = useState(0);

  const capturePoseA = (pose: Pose) => setPoseA({ ...pose });
  const capturePoseB = (pose: Pose) => setPoseB({ ...pose });

  return {
    activeTab,
    setActiveTab,
    poseA,
    poseB,
    tweenValue,
    setTweenValue,
    capturePoseA,
    capturePoseB
  };
};
