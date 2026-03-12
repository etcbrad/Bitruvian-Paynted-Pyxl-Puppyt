import React from 'react';

interface Props {
  children?: React.ReactNode;
  className?: string;
}

export function GridBackground({ children, className = '' }: Props) {
  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{
        background: '#0d1117',
        backgroundImage: `
          linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px),
          linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px),
          linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '100px 100px, 100px 100px, 20px 20px, 20px 20px',
        backgroundPosition: '-1px -1px, -1px -1px, -1px -1px, -1px -1px',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(13,17,23,0.85) 100%)',
        }}
      />
      {children}
    </div>
  );
}
