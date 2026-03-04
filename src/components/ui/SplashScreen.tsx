'use client';

import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish?: () => void;
  /** Minimum display time in ms */
  minDuration?: number;
}

export function SplashScreen({ onFinish, minDuration = 1800 }: SplashScreenProps) {
  const [phase, setPhase] = useState<'loading' | 'exit'>('loading');

  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase('exit');
      setTimeout(() => onFinish?.(), 500);
    }, minDuration);
    return () => clearTimeout(timer);
  }, [minDuration, onFinish]);

  return (
    <div
      className={`splash-screen transition-opacity duration-500 ${phase === 'exit' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      role="status"
      aria-label="Loading Amble AI"
    >
      <div className="flex flex-col items-center gap-8">
        {/* Animated logo */}
        <div className="relative">
          {/* Outer glow ring */}
          <div className="absolute inset-0 w-24 h-24 rounded-full bg-[#1a1a1a] blur-xl opacity-30 animate-glow-pulse" />
          
          {/* Logo container */}
          <div className="relative w-24 h-24 bg-[#1a1a1a] rounded-full flex items-center justify-center shadow-2xl">
            {/* Orbiting particles */}
            <div className="absolute inset-0">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/80" style={{ animation: 'orbit 3s linear infinite' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-400/60" style={{ animation: 'orbit 4s linear infinite reverse' }} />
            </div>
            
            <span className="text-white font-semibold text-5xl tracking-tighter relative z-10" style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>a</span>
          </div>
        </div>

        {/* Brand text */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Amble AI
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Healthcare Intelligence Platform
          </p>
        </div>

        {/* Loading indicator */}
        <div className="flex items-center gap-3">
          <div className="relative w-48 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full"
              style={{
                animation: 'splash-progress 1.8s ease-in-out forwards',
              }}
            />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes splash-progress {
          0% { width: 0%; }
          30% { width: 40%; }
          60% { width: 70%; }
          80% { width: 85%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}
