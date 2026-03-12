import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, Image as ImageIcon, ArrowRight } from 'lucide-react';
import { GridBackground } from './GridBackground';

interface Props {
  cutoutSheet: string | null;
  setCutoutSheet: (url: string) => void;
  backdrop: string | null;
  setBackdrop: (url: string) => void;
  onNext: () => void;
}

function RadialUploadZone({
  label,
  sublabel,
  icon,
  imageUrl,
  color,
  onFile,
}: {
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  imageUrl: string | null;
  color: string;
  onFile: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(URL.createObjectURL(file));
  };

  const hasImage = !!imageUrl;

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        className="relative cursor-pointer"
        style={{ width: 220, height: 220 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => inputRef.current?.click()}
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: `radial-gradient(circle, ${color}22 0%, transparent 70%)` }}
          animate={hasImage ? { opacity: [0.6, 1, 0.6] } : { opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />

        <motion.div
          className="absolute rounded-full border-2"
          style={{
            inset: 8,
            borderColor: hasImage ? color : `${color}55`,
            boxShadow: hasImage ? `0 0 24px ${color}66, inset 0 0 24px ${color}22` : `0 0 12px ${color}33`,
          }}
          animate={hasImage ? { scale: [1, 1.02, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />

        {[20, 14, 8].map((inset, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border"
            style={{
              inset,
              borderColor: `${color}${['18', '11', '08'][i]}`,
            }}
            animate={{ scale: [1, 1.015, 1], opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
          />
        ))}

        <div
          className="absolute rounded-full overflow-hidden flex items-center justify-center"
          style={{
            inset: 20,
            background: hasImage ? 'transparent' : 'rgba(13,17,23,0.85)',
          }}
        >
          {hasImage ? (
            <img src={imageUrl!} alt={label} className="w-full h-full object-cover rounded-full" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-center px-4">
              <motion.div
                style={{ color }}
                animate={{ y: [-2, 2, -2] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                {icon}
              </motion.div>
              <span className="text-xs font-medium text-neutral-300">{label}</span>
            </div>
          )}
        </div>

        {hasImage && (
          <motion.div
            className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: color }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          >
            <svg viewBox="0 0 16 16" fill="white" className="w-3 h-3">
              <path d="M13.485 1.929L5.5 9.914 2.515 6.929 1.1 8.343l4.4 4.4 9.4-9.4z" />
            </svg>
          </motion.div>
        )}

        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </motion.div>

      <div className="text-center">
        <p className="text-sm font-semibold text-neutral-200">{label}</p>
        <p className="text-xs text-neutral-500 mt-0.5">{sublabel}</p>
        {hasImage && (
          <motion.p className="text-xs mt-1" style={{ color }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            Click to replace
          </motion.p>
        )}
      </div>
    </div>
  );
}

export function UploadMode({ cutoutSheet, setCutoutSheet, backdrop, setBackdrop, onNext }: Props) {
  return (
    <GridBackground>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-12">
        <div className="text-center z-10">
          <motion.h2
            className="text-3xl font-bold text-white tracking-tight"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Paper Rig Studio
          </motion.h2>
          <motion.p
            className="text-sm text-neutral-500 mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.2 } }}
          >
            Upload your cutout sheet to begin rigging
          </motion.p>
        </div>

        <div className="flex items-center gap-16 md:gap-24 z-10">
          <RadialUploadZone
            label="Cutout Sheet"
            sublabel="Character parts · PNG / JPG"
            icon={<Upload className="w-8 h-8" />}
            imageUrl={cutoutSheet}
            color="#6366f1"
            onFile={setCutoutSheet}
          />

          <div className="flex flex-col items-center gap-2">
            <div className="w-px h-16 bg-gradient-to-b from-transparent via-neutral-700 to-transparent" />
            <span className="text-xs text-neutral-600 font-mono">+</span>
            <div className="w-px h-16 bg-gradient-to-b from-transparent via-neutral-700 to-transparent" />
          </div>

          <RadialUploadZone
            label="Backdrop"
            sublabel="Scene background · optional"
            icon={<ImageIcon className="w-8 h-8" />}
            imageUrl={backdrop}
            color="#22c55e"
            onFile={setBackdrop}
          />
        </div>

        <motion.button
          onClick={onNext}
          disabled={!cutoutSheet}
          className="z-10 flex items-center gap-2 px-8 py-3 rounded-full text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: cutoutSheet ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(99,102,241,0.2)',
            boxShadow: cutoutSheet ? '0 0 32px rgba(99,102,241,0.4)' : 'none',
            color: 'white',
          }}
          whileHover={cutoutSheet ? { scale: 1.04, boxShadow: '0 0 48px rgba(99,102,241,0.6)' } : {}}
          whileTap={cutoutSheet ? { scale: 0.97 } : {}}
        >
          Begin Slicing
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      </div>
    </GridBackground>
  );
}
