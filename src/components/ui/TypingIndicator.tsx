'use client';

import React from 'react';

interface TypingIndicatorProps {
  variant?: 'dots' | 'pulse' | 'wave';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function TypingIndicator({ variant = 'wave', size = 'md', className = '' }: TypingIndicatorProps) {
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3'
  };

  const gapClasses = {
    sm: 'gap-1',
    md: 'gap-1.5',
    lg: 'gap-2'
  };

  if (variant === 'dots') {
    return (
      <div className={`flex items-center ${gapClasses[size]} ${className}`} role="status" aria-label="AI is typing">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`${sizeClasses[size]} rounded-full bg-gradient-to-r from-indigo-500 to-purple-500`}
            style={{
              animation: `typing-bounce 1.4s infinite ease-in-out both`,
              animationDelay: `${i * 0.16}s`
            }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'pulse') {
    return (
      <div className={`flex items-center ${gapClasses[size]} ${className}`} role="status" aria-label="AI is thinking">
        <div className="relative">
          <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-ping absolute`} />
          <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-r from-indigo-500 to-purple-500`} />
        </div>
        <span className="text-xs text-muted-foreground ml-2 animate-pulse">AI is thinking...</span>
      </div>
    );
  }

  // Wave variant (default)
  return (
    <div className={`flex items-end ${gapClasses[size]} ${className}`} role="status" aria-label="AI is typing">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`w-1 rounded-full bg-gradient-to-t from-indigo-500 via-purple-500 to-pink-500`}
          style={{
            height: size === 'sm' ? '12px' : size === 'md' ? '16px' : '20px',
            animation: `typing-wave 1.2s infinite ease-in-out`,
            animationDelay: `${i * 0.1}s`
          }}
        />
      ))}
    </div>
  );
}

// Streaming text component with typewriter effect
interface StreamingTextProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  className?: string;
}

export function StreamingText({ text, speed = 20, onComplete, className = '' }: StreamingTextProps) {
  const [displayedText, setDisplayedText] = React.useState('');
  const [currentIndex, setCurrentIndex] = React.useState(0);

  React.useEffect(() => {
    if (currentIndex < text.length) {
      const timer = setTimeout(() => {
        setDisplayedText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timer);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, text, speed, onComplete]);

  // Reset when text changes
  React.useEffect(() => {
    setDisplayedText('');
    setCurrentIndex(0);
  }, [text]);

  return (
    <span className={className} aria-live="polite">
      {displayedText}
      {currentIndex < text.length && (
        <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse" aria-hidden="true" />
      )}
    </span>
  );
}

// AI Avatar with pulse effect
interface AIAvatarProps {
  isThinking?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AIAvatar({ isThinking = false, size = 'md', className = '' }: AIAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  };

  return (
    <div className={`relative ${className}`}>
      {/* Glow effect when thinking */}
      {isThinking && (
        <div className={`absolute inset-0 ${sizeClasses[size]} rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 blur-md opacity-60 animate-pulse`} />
      )}
      
      {/* Main avatar */}
      <div className={`
        ${sizeClasses[size]} 
        rounded-full 
        bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 
        flex items-center justify-center 
        text-white font-bold 
        shadow-lg shadow-purple-500/25
        relative
        ${isThinking ? 'animate-pulse' : ''}
      `}>
        <svg className="w-1/2 h-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
          <circle cx="9" cy="13" r="1" fill="currentColor" />
          <circle cx="15" cy="13" r="1" fill="currentColor" />
          <path d="M9 17h6" strokeLinecap="round" />
        </svg>
      </div>
      
      {/* Orbiting particles when thinking */}
      {isThinking && (
        <>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-indigo-400" style={{
            animation: 'orbit 2s linear infinite',
            top: '50%',
            left: '50%',
            transformOrigin: '0 0'
          }} />
          <div className="absolute w-1 h-1 rounded-full bg-purple-400" style={{
            animation: 'orbit 2s linear infinite reverse',
            animationDelay: '-0.5s',
            top: '50%',
            left: '50%',
            transformOrigin: '0 0'
          }} />
        </>
      )}
    </div>
  );
}

// Loading skeleton for messages
export function MessageSkeleton() {
  return (
    <div className="flex gap-4 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800" />
      <div className="flex-1 space-y-3">
        <div className="h-4 w-24 rounded bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800" />
          <div className="h-3 w-5/6 rounded bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800" />
          <div className="h-3 w-4/6 rounded bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800" />
        </div>
      </div>
    </div>
  );
}
