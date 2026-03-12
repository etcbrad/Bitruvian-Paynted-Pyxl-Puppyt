import React from 'react';

export interface TimelineStripProps {
  frameCount: number;
  keyframeFrames: number[];
  currentFrame: number;
  onSetCurrentFrame: (frame: number) => void;
}

const TimelineStrip: React.FC<TimelineStripProps> = ({
  frameCount,
  keyframeFrames,
  currentFrame,
  onSetCurrentFrame,
}) => {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {Array.from({ length: frameCount }, (_, i) => {
        const isKeyframe = keyframeFrames.includes(i);
        const isCurrent = i === currentFrame;
        return (
          <button
            key={i}
            onClick={() => onSetCurrentFrame(i)}
            className={`relative w-7 h-7 flex items-center justify-center text-[10px] font-mono rounded transition-colors ${
              isCurrent
                ? 'bg-zinc-200 text-ink border border-ink'
                : isKeyframe
                ? 'bg-zinc-600 text-zinc-100 hover:bg-zinc-500'
                : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
            }`}
            title={`Frame ${i}`}
          >
            {i}
            {isKeyframe && !isCurrent && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default TimelineStrip;
