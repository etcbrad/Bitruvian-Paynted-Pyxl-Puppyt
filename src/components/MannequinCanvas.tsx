import React from 'react';
import { Stage, Layer } from 'react-konva';
import { Pose, PartName, RenderMode, ViewMode } from '../types';
import { Mannequin } from './mannequin/Mannequin';
import { SystemGuides, Scanlines } from './layout/SystemGrid';

interface MannequinCanvasProps {
  pose: Pose;
  renderMode: RenderMode;
  viewMode: ViewMode;
  backgroundPreset: string;
  selectedParts: Record<PartName, boolean>;
  onPartClick: (partName: PartName) => void;
  width?: number;
  height?: number;
}

export const MannequinCanvas: React.FC<MannequinCanvasProps> = ({
  pose,
  renderMode,
  viewMode,
  backgroundPreset,
  selectedParts,
  onPartClick,
  width = 800,
  height = 600
}) => {
  return (
    <Stage width={width} height={height}>
      <Layer>
        {backgroundPreset === 'grid' && <SystemGuides />}
        <Mannequin
          pose={pose}
          renderMode={renderMode}
          viewMode={viewMode}
          selectedParts={selectedParts}
          onPartClick={onPartClick}
        />
        {backgroundPreset === 'grid' && <Scanlines />}
      </Layer>
    </Stage>
  );
};
