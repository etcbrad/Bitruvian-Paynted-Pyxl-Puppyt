import React, { useEffect, useState } from 'react';
import { UploadMode } from './components/UploadMode';
import { SliceMode } from './components/SliceMode';
import { RigMode } from './components/RigMode';
import { PoseMode } from './components/PoseMode';
import { BodyPart, PoseState, AppMode } from './types';
import './index.css';

const STEPS: AppMode[] = ['upload', 'slice', 'rig', 'pose'];

const STEP_CONFIG: Record<AppMode, { label: string; short: string }> = {
  upload: { label: 'Upload', short: '01' },
  slice: { label: 'Slice', short: '02' },
  rig: { label: 'Rig', short: '03' },
  pose: { label: 'Pose', short: '04' },
};

interface PaperRigStudioProps {
  onRigExport?: (parts: BodyPart[], pose: PoseState) => void;
  onPoseUpdate?: (parts: BodyPart[], pose: PoseState) => void;
}

export default function App({ onRigExport, onPoseUpdate }: PaperRigStudioProps) {
  const [mode, setMode] = useState<AppMode>('upload');
  const [cutoutSheet, setCutoutSheet] = useState<string | null>(null);
  const [backdrop, setBackdrop] = useState<string | null>(null);
  const [parts, setParts] = useState<BodyPart[]>([]);
  const [pose, setPose] = useState<PoseState>({});

  const canGo = (step: AppMode): boolean => {
    const idx = STEPS.indexOf(step);
    const cur = STEPS.indexOf(mode);
    if (idx <= cur) return true;
    if (step === 'slice') return !!cutoutSheet;
    if (step === 'rig' || step === 'pose') return !!cutoutSheet && parts.length > 0;
    return false;
  };

  useEffect(() => {
    if (mode === 'pose') {
      onPoseUpdate?.(parts, pose);
    }
  }, [mode, parts, pose, onPoseUpdate]);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#0d1117', color: 'white', fontFamily: 'Inter, sans-serif' }}>
      <header
        className="flex items-center justify-between px-5 py-2.5 flex-shrink-0"
        style={{
          background: 'rgba(13,17,23,0.95)',
          borderBottom: '1px solid rgba(99,102,241,0.12)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <circle cx="10" cy="5" r="2.5" />
              <line x1="10" y1="7.5" x2="10" y2="12.5" />
              <circle cx="5" cy="14" r="2" />
              <circle cx="15" cy="14" r="2" />
              <line x1="10" y1="12.5" x2="5" y2="12" />
              <line x1="10" y1="12.5" x2="15" y2="12" />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight text-white">Paper Rig Studio</span>
          <span
            className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            v2
          </span>
        </div>

        <nav className="flex items-center">
          {STEPS.map((step, i) => {
            const isActive = mode === step;
            const canNav = canGo(step);
            const conf = STEP_CONFIG[step];
            return (
              <React.Fragment key={step}>
                <button
                  onClick={() => canNav && setMode(step)}
                  disabled={!canNav}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
                  style={{
                    color: isActive ? 'white' : canNav ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                    background: isActive ? 'rgba(99,102,241,0.25)' : 'transparent',
                    border: isActive ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                    cursor: canNav ? 'pointer' : 'not-allowed',
                  }}
                >
                  <span
                    className="font-mono text-xs"
                    style={{ color: isActive ? '#818cf8' : canNav ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)' }}
                  >
                    {conf.short}
                  </span>
                  {conf.label}
                </button>
                {i < STEPS.length - 1 && (
                  <span style={{ color: 'rgba(255,255,255,0.12)', margin: '0 2px' }}>›</span>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {parts.length > 0 && <span className="font-mono">{parts.length} parts</span>}
          {cutoutSheet && (
            <div className="w-2 h-2 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {mode === 'upload' && (
          <UploadMode
            cutoutSheet={cutoutSheet}
            setCutoutSheet={setCutoutSheet}
            backdrop={backdrop}
            setBackdrop={setBackdrop}
            onNext={() => setMode('slice')}
          />
        )}
        {mode === 'slice' && (
          <SliceMode
            cutoutSheet={cutoutSheet}
            parts={parts}
            setParts={setParts}
            onNext={() => setMode('rig')}
          />
        )}
        {mode === 'rig' && (
          <RigMode
            parts={parts}
            setParts={setParts}
            onNext={() => {
              onRigExport?.(parts, pose);
              setMode('pose');
            }}
          />
        )}
        {mode === 'pose' && (
          <PoseMode
            parts={parts}
            backdrop={backdrop}
            pose={pose}
            setPose={setPose}
          />
        )}
      </main>
    </div>
  );
}
