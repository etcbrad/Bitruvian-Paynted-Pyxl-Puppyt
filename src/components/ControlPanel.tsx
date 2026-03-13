import React from 'react';
import { PartName, RenderMode, ViewMode, BackgroundPreset } from '../types/types';
import { RotationWheelControl } from './controls/RotationWheelControl';

interface ControlPanelProps {
  selectedParts: Record<PartName, boolean>;
  renderMode: RenderMode;
  viewMode: ViewMode;
  backgroundPreset: BackgroundPreset;
  onRenderModeChange: (mode: RenderMode) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onBackgroundChange: (preset: BackgroundPreset) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  selectedParts,
  renderMode,
  viewMode,
  backgroundPreset,
  onRenderModeChange,
  onViewModeChange,
  onBackgroundChange
}) => {
  return (
    <div className="control-panel">
      <h3>Controls</h3>
      
      <div className="control-section">
        <label>Render Mode:</label>
        <select value={renderMode} onChange={(e) => onRenderModeChange(e.target.value as RenderMode)}>
          <option value="default">Default</option>
          <option value="wireframe">Wireframe</option>
          <option value="silhouette">Silhouette</option>
          <option value="backlight">Backlight</option>
          <option value="colorwheel">Color Wheel</option>
        </select>
      </div>

      <div className="control-section">
        <label>View Mode:</label>
        <select value={viewMode} onChange={(e) => onViewModeChange(e.target.value as ViewMode)}>
          <option value="default">Default</option>
          <option value="zoomed">Zoomed</option>
          <option value="lotte">Lotte</option>
          <option value="wide">Wide</option>
          <option value="mobile">Mobile</option>
        </select>
      </div>

      <div className="control-section">
        <label>Background:</label>
        <select value={backgroundPreset} onChange={(e) => onBackgroundChange(e.target.value as BackgroundPreset)}>
          <option value="grid">Grid</option>
          <option value="white">White</option>
          <option value="gray-1">Gray 1</option>
          <option value="gray-2">Gray 2</option>
          <option value="gray-3">Gray 3</option>
          <option value="black">Black</option>
        </select>
      </div>

      <div className="control-section">
        <h4>Selected Parts</h4>
        {Object.entries(selectedParts).map(([partName, isSelected]) => (
          <div key={partName} className="part-checkbox">
            <input
              type="checkbox"
              id={partName}
              checked={isSelected}
              onChange={() => {}}
            />
            <label htmlFor={partName}>{partName}</label>
          </div>
        ))}
      </div>
    </div>
  );
};
