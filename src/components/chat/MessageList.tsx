'use client';

import React, { useEffect, useRef, useState, useMemo, memo } from 'react';
import { Message } from './Message';
import { useChat } from '@/contexts';
import { Search, Globe, Sparkles, Brain, ImageIcon, FileText, Cpu, BookOpen, Zap, ChevronDown, ChevronRight, CheckCircle2, Loader2, FolderSearch, XCircle, MinusCircle, Database } from 'lucide-react';
import { MessageSkeleton } from '@/components/ui/TypingIndicator';
import { useRenderPerformance } from '@/utils/performanceMonitor';

// Trace event type (matches backend)
interface TraceEvent {
  id: string;
  type: string;
  label: string;
  status: 'running' | 'done' | 'error' | 'skipped';
  detail?: string;
  sources?: string[];
  durationMs?: number;
}

// Get icon and color for a trace event
function getTraceVisual(event: TraceEvent) {
  const label = event.label.toLowerCase();
  const type = event.type;

  if (type === 'generate') return { icon: Sparkles, color: 'text-indigo-400', bg: 'bg-indigo-500/10', ring: 'ring-indigo-500/20' };
  if (type === 'analyze') return { icon: Brain, color: 'text-purple-400', bg: 'bg-purple-500/10', ring: 'ring-purple-500/20' };
  if (type === 'tool') return { icon: Cpu, color: 'text-orange-400', bg: 'bg-orange-500/10', ring: 'ring-orange-500/20' };
  if (type === 'fallback') return { icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/10', ring: 'ring-yellow-500/20' };

  // Search type — differentiate by keyword
  if (label.includes('knowledge') || label.includes('kb')) 
    return { icon: Database, color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' };
  if (label.includes('drive') || label.includes('file') || label.includes('document'))
    return { icon: FolderSearch, color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' };
  if (label.includes('web'))
    return { icon: Globe, color: 'text-green-400', bg: 'bg-green-500/10', ring: 'ring-green-500/20' };
  if (label.includes('memory'))
    return { icon: BookOpen, color: 'text-cyan-400', bg: 'bg-cyan-500/10', ring: 'ring-cyan-500/20' };
  if (label.includes('project'))
    return { icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10', ring: 'ring-blue-500/20' };

  return { icon: Search, color: 'text-slate-400', bg: 'bg-slate-500/10', ring: 'ring-slate-500/20' };
}

function getStatusIndicator(status: string) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />;
    case 'done':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    case 'error':
      return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    case 'skipped':
      return <MinusCircle className="w-3.5 h-3.5 text-slate-400/60" />;
    default:
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />;
  }
}

// Individual trace step row
function TraceStep({ event, isLast }: { event: TraceEvent; isLast: boolean }) {
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);
  const visual = getTraceVisual(event);
  const Icon = visual.icon;
  const isRunning = event.status === 'running';
  const hasSources = event.sources && event.sources.length > 0;

  return (
    <div className={`animate-slide-up ${isRunning ? '' : 'opacity-100'}`} style={{ animationDuration: '200ms' }}>
      <div className="flex items-start gap-2.5 py-1.5 group">
        {/* Status + Type icon */}
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {getStatusIndicator(event.status)}
        </div>

        {/* Label + duration */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={`w-3.5 h-3.5 ${visual.color} shrink-0`} />
            <span className={`text-[13px] leading-tight ${
              isRunning ? 'text-foreground font-medium' : 'text-muted-foreground'
            }`}>
              {event.label}
            </span>
            {event.durationMs != null && event.status === 'done' && (
              <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums shrink-0">
                {event.durationMs < 1000 
                  ? `${event.durationMs}ms` 
                  : `${(event.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>

          {/* Expandable sources */}
          {hasSources && event.status === 'done' && (
            <div className="mt-1 ml-5.5">
              <button
                onClick={() => setIsSourcesExpanded(!isSourcesExpanded)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground/80 transition-colors"
              >
                {isSourcesExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {event.sources!.length} source{event.sources!.length > 1 ? 's' : ''}
              </button>
              {isSourcesExpanded && (
                <div className="mt-1 space-y-0.5 pl-4 border-l border-slate-200/40 dark:border-slate-700/40">
                  {event.sources!.map((src, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                      <FileText className="w-3 h-3 shrink-0" />
                      <span className="truncate">{src}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Connector line between steps */}
      {!isLast && (
        <div className="ml-[7px] h-1 border-l border-dashed border-slate-200/40 dark:border-slate-700/30" />
      )}
    </div>
  );
}

// Main Thinking/Trace display — ChatGPT-style agent activity panel
function ThinkingProcess({ thinkingStatus, traceEvents }: { thinkingStatus: string; traceEvents: TraceEvent[] }) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const hasTraces = traceEvents.length > 0;
  const runningCount = traceEvents.filter(e => e.status === 'running').length;
  const doneCount = traceEvents.filter(e => e.status === 'done').length;
  const totalSteps = traceEvents.length;

  // Build header label
  const headerLabel = (() => {
    if (runningCount > 0) {
      const activeEvent = traceEvents.find(e => e.status === 'running');
      return activeEvent?.label || thinkingStatus || 'Working...';
    }
    if (doneCount > 0 && doneCount === totalSteps) {
      return 'Generating response...';
    }
    return thinkingStatus || 'Thinking...';
  })();

  // If no trace events, fall back to simple status display
  if (!hasTraces) {
    const getSimplePhase = () => {
      const s = thinkingStatus.toLowerCase();
      if (s.includes('knowledge base') || s.includes('kb')) return { icon: Database, color: 'text-emerald-400' };
      if (s.includes('drive') || s.includes('file') || s.includes('document')) return { icon: FolderSearch, color: 'text-amber-400' };
      if (s.includes('web') || s.includes('searching')) return { icon: Globe, color: 'text-green-400' };
      if (s.includes('reasoning') || s.includes('thinking')) return { icon: Brain, color: 'text-purple-400' };
      if (s.includes('image')) return { icon: ImageIcon, color: 'text-pink-400' };
      return { icon: Sparkles, color: 'text-indigo-400' };
    };
    const phase = getSimplePhase();
    const PhaseIcon = phase.icon;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center w-6 h-6">
              <div className="absolute inset-0 rounded-full bg-indigo-500/10 animate-ping" style={{ animationDuration: '2s' }} />
              <PhaseIcon className={`w-4 h-4 ${phase.color} relative z-10`} />
            </div>
            <span className="text-sm font-medium text-foreground">{thinkingStatus || 'Thinking...'}</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">{elapsedTime}s</span>
        </div>
        <div className="h-0.5 bg-slate-200/60 dark:bg-slate-700/40 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500/80 to-purple-500/80 transition-all duration-1000 ease-out"
            style={{ width: `${Math.min(elapsedTime * 4, 92)}%` }}
          />
        </div>
      </div>
    );
  }

  // Full trace display
  return (
    <div className="space-y-2">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full group"
      >
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center w-5 h-5">
            {runningCount > 0 ? (
              <>
                <div className="absolute inset-0 rounded-full bg-indigo-500/15 animate-ping" style={{ animationDuration: '2s' }} />
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin relative z-10" />
              </>
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
          </div>
          <span className="text-[13px] font-medium text-foreground">
            {runningCount > 0 ? headerLabel : `Completed ${doneCount} step${doneCount > 1 ? 's' : ''}`}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
          )}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">{elapsedTime}s</span>
      </button>

      {/* Expanded trace steps */}
      {isExpanded && (
        <div className="pl-1 space-y-0">
          {traceEvents.map((event, i) => (
            <TraceStep key={event.id} event={event} isLast={i === traceEvents.length - 1} />
          ))}
        </div>
      )}

      {/* Progress bar */}
      {runningCount > 0 && (
        <div className="h-0.5 bg-slate-200/50 dark:bg-slate-700/30 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500/70 via-purple-500/70 to-indigo-500/70 transition-all duration-700 ease-out"
            style={{ 
              width: totalSteps > 0 ? `${Math.min((doneCount / totalSteps) * 85 + 8, 92)}%` : `${Math.min(elapsedTime * 3, 90)}%`,
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s ease-in-out infinite'
            }}
          />
        </div>
      )}
    </div>
  );
}



export function MessageList() {
  const { messages, isStreaming, thinkingStatus, traceEvents, currentSessionId, isLoadingMessages } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  
  // Performance monitoring for render tracking
  useRenderPerformance('MessageList');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  // Memoize message rendering to prevent unnecessary re-renders
  const memoizedMessages = useMemo(() => 
    messages.map((msg, index) => (
      <div 
        key={msg.id} 
        className="animate-slide-up"
        style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}
      >
        <Message message={msg} />
      </div>
    )), 
    [messages]
  );

  // Show loading skeleton during message load (prevents welcome screen flash)
  if (isLoadingMessages) {
    return (
      <div key="loading" className="flex-1 overflow-y-auto px-4 scrollbar-thin">
        <div className="flex flex-col pb-4 w-full max-w-3xl mx-auto space-y-6 pt-6">
          <MessageSkeleton />
          <MessageSkeleton />
        </div>
      </div>
    );
  }

  // Use key on the container to force re-render when session changes
  if (messages.length === 0) {
    return (
      <div key={currentSessionId || 'empty'} className="flex-1 flex flex-col items-center justify-center text-center p-6 sm:p-8 relative overflow-hidden">
        
        <div className="relative z-10 w-full max-w-2xl">
          {/* Logo */}
          <div className="relative mb-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white font-extrabold text-5xl sm:text-6xl leading-none" style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>a</span>
            </div>
          </div>
          
          {/* Welcome text */}
          <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-slate-800 dark:text-slate-100">
            Welcome to Amble AI
          </h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
            Your intelligent AI assistant for patient care, billing, analysis, and more.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div key={currentSessionId || 'messages'} className="flex-1 overflow-y-auto px-3 sm:px-4 scrollbar-thin">
      <div className="flex flex-col pb-4 w-full max-w-3xl mx-auto space-y-6 pt-4 sm:pt-6">
        {memoizedMessages}
        
        {isStreaming && (
          <div className="w-full animate-fade-in">
            <div className="rounded-2xl p-4 bg-white/60 dark:bg-slate-800/40 backdrop-blur-sm border border-indigo-500/10 shadow-sm">
              <ThinkingProcess thinkingStatus={thinkingStatus} traceEvents={traceEvents} />
            </div>
          </div>
        )}
        
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
