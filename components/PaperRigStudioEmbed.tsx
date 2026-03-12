import React from 'react';
import PaperRigStudio from './paper-rig-studio/App';
import type { BodyPart, PoseState } from './paper-rig-studio/types';

interface PaperRigStudioEmbedProps {
  onRigExport: (parts: BodyPart[], pose: PoseState) => void;
  onPoseUpdate: (parts: BodyPart[], pose: PoseState) => void;
}

export function PaperRigStudioEmbed({ onRigExport, onPoseUpdate }: PaperRigStudioEmbedProps) {
  return (
    <div className="absolute inset-0 z-20">
      <PaperRigStudio onRigExport={onRigExport} onPoseUpdate={onPoseUpdate} />
    </div>
  );
}
