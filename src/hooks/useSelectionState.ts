import { useState } from 'react';
import { PartSelection, PartName, ViewMode, RenderMode, AnchorName, Vector2D } from '../types';

export const useSelectionState = () => {
  const [selectedParts, setSelectedParts] = useState<PartSelection>(() => {
    const initialSelection: PartSelection = Object.values(PartName).reduce(
      (acc, name) => ({ ...acc, [name]: false }), 
      {} as PartSelection
    );
    initialSelection[PartName.Waist] = true;
    return initialSelection;
  });

  const [viewMode, setViewMode] = useState<ViewMode>('default');
  const [activePins, setActivePins] = useState<AnchorName[]>([PartName.Waist]);
  const [pinnedState, setPinnedState] = useState<Record<string, Vector2D>>({});
  const [renderMode, setRenderMode] = useState<RenderMode>('default');

  return {
    selectedParts,
    setSelectedParts,
    viewMode,
    setViewMode,
    activePins,
    setActivePins,
    pinnedState,
    setPinnedState,
    renderMode,
    setRenderMode
  };
};
