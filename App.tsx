import React, { useEffect } from 'react';
import { Pose, PartName, RenderMode, ViewMode, BackgroundPreset } from './src/types/types';
import { RESET_POSE } from './src/constants/constants';
import { usePoseState } from './src/hooks/usePoseState';
import { useSelectionState } from './src/hooks/useSelectionState';
import { useWorkspaceState } from './src/hooks/useWorkspaceState';
import { useAnimationState } from './src/hooks/useAnimationState';
import { MannequinCanvas } from './src/components/MannequinCanvas';
import { ControlPanel } from './src/components/ControlPanel';
import './src/App.css';

const App: React.FC = () => {
  const { activePose, ghostPose, setActivePose, updatePose, undo, redo, resetPose } = usePoseState(RESET_POSE);
  const { selectedParts, setSelectedParts, viewMode, setViewMode, renderMode, setRenderMode } = useSelectionState();
  const { backgroundPreset, setBackgroundPreset } = useWorkspaceState();
  const { activeTab, setActiveTab } = useAnimationState();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handlePartClick = (partName: PartName) => {
    setSelectedParts(prev => ({
      ...prev,
      [partName]: !prev[partName]
    }));
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Bitruvian Rig Builder</h1>
        <div className="tab-navigation">
          <button 
            className={activeTab === 'model' ? 'active' : ''}
            onClick={() => setActiveTab('model')}
          >
            Model
          </button>
          <button 
            className={activeTab === 'animation' ? 'active' : ''}
            onClick={() => setActiveTab('animation')}
          >
            Animation
          </button>
          <button 
            className={activeTab === 'puppyt' ? 'active' : ''}
            onClick={() => setActiveTab('puppyt')}
          >
            Puppyt
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="canvas-container">
          <MannequinCanvas
            pose={activePose}
            renderMode={renderMode}
            viewMode={viewMode}
            backgroundPreset={backgroundPreset}
            selectedParts={selectedParts}
            onPartClick={handlePartClick}
          />
        </div>

        <div className="controls-container">
          <ControlPanel
            selectedParts={selectedParts}
            renderMode={renderMode}
            viewMode={viewMode}
            backgroundPreset={backgroundPreset}
            onRenderModeChange={setRenderMode}
            onViewModeChange={setViewMode}
            onBackgroundChange={setBackgroundPreset}
          />
        </div>
      </main>

      <footer className="app-footer">
        <button onClick={resetPose}>Reset Pose</button>
        <button onClick={undo} disabled={!undo}>Undo</button>
        <button onClick={redo} disabled={!redo}>Redo</button>
      </footer>
    </div>
  );
};

export default App;
