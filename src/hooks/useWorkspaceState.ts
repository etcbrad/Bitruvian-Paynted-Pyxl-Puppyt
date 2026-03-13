import { useState, useRef } from 'react';
import { BackgroundPreset } from '../types';

export const useWorkspaceState = () => {
  const [backgroundPreset, setBackgroundPreset] = useState<BackgroundPreset>('grid');
  const [backgroundImageSrc, setBackgroundImageSrc] = useState<string | null>(null);
  const backgroundUploadInputRef = useRef<HTMLInputElement>(null);
  const [backgroundLight, setBackgroundLight] = useState(0);

  const [workflowStep, setWorkflowStep] = useState<'upload' | 'slice' | 'rig' | 'pose'>('pose');
  const [masksEnabled, setMasksEnabled] = useState(true);
  const [hideBonesWithMasks, setHideBonesWithMasks] = useState(false);

  return {
    backgroundPreset,
    setBackgroundPreset,
    backgroundImageSrc,
    setBackgroundImageSrc,
    backgroundUploadInputRef,
    backgroundLight,
    setBackgroundLight,
    workflowStep,
    setWorkflowStep,
    masksEnabled,
    setMasksEnabled,
    hideBonesWithMasks,
    setHideBonesWithMasks
  };
};
