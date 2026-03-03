
'use client';

import React, { useState } from 'react';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { ArtifactsPanel } from './ArtifactsPanel';
import { Sidebar as ChatSidebar } from './Sidebar';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { ChatProvider, useChat } from '@/contexts';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { ReasoningMode } from '@/utils/modelConstants';


function ChatHeader({ isChatSidebarOpen, onToggleChatSidebar }: { isChatSidebarOpen: boolean; onToggleChatSidebar: () => void }) {
  const { currentSessionId, sessions } = useChat();
  const session = sessions.find(s => s.id === currentSessionId);

  return (
    <div className="h-12 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shrink-0 z-20 relative">
        <div className="flex items-center gap-2.5 min-w-0">
                {/* Toggle chat history panel */}
                <button 
                  onClick={onToggleChatSidebar}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 mr-1"
                  title={isChatSidebarOpen ? 'Close history' : 'Open history'}
                >
                  {isChatSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                </button>
                <span className="font-semibold truncate text-slate-800 dark:text-slate-200 max-w-[150px] sm:max-w-md text-sm">
                    {session?.title || 'New Chat'}
                </span>
        </div>
    </div>
  );
}

function SessionSync({ onSessionChange }: { onSessionChange?: (id: string | null) => void }) {
  const { currentSessionId, wasParentInitiated, clearParentInitiatedFlag } = useChat();
  const lastReportedIdRef = React.useRef<string | null>(null);
  
  React.useEffect(() => {
    // Skip if this change was initiated by the parent (to prevent loops)
    if (wasParentInitiated()) {
      // console.log('[SessionSync] Skipping report - parent initiated change to:', currentSessionId);
      clearParentInitiatedFlag();
      // Update ref so we don't report it later either
      lastReportedIdRef.current = currentSessionId;
      return;
    }
    
    // Only call onSessionChange if the ID actually changed from what we last reported
    if (currentSessionId && onSessionChange && currentSessionId !== lastReportedIdRef.current) {
      // console.log('[SessionSync] Reporting new session to parent:', currentSessionId);
      lastReportedIdRef.current = currentSessionId;
      onSessionChange(currentSessionId);
    }
  }, [currentSessionId, onSessionChange, wasParentInitiated, clearParentInitiatedFlag]);
  
  return null;
}

function ChatLayout({ onSessionChange, onModeChange, dictationEnabled }: { onSessionChange?: (id: string | null) => void; onModeChange?: (mode: ReasoningMode) => void; dictationEnabled?: boolean }) {
  const { sendMessage, isStreaming, activeArtifact } = useChat();
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true);

  return (
    <div className="flex h-full bg-slate-50 dark:bg-slate-950 text-foreground overflow-hidden">
      <SessionSync onSessionChange={onSessionChange} />

      {/* Chat History Panel (Left — persistent like ChatGPT) */}
      <ChatSidebar isOpen={isChatSidebarOpen} onToggle={() => setIsChatSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header with sidebar toggle */}
        <ChatHeader isChatSidebarOpen={isChatSidebarOpen} onToggleChatSidebar={() => setIsChatSidebarOpen(prev => !prev)} />

        {/* Messages Area */}
        <MessageList />

        {/* Composer Area */}
        <div className="relative z-10 p-4 pb-6 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent dark:from-slate-950 dark:via-slate-950/95">
          <Composer onSend={sendMessage} isStreaming={isStreaming} onModeChange={onModeChange} dictationEnabled={dictationEnabled} />
        </div>
      </div>

      {/* Artifacts Panel (Right Sidebar) */}
      {activeArtifact && <ArtifactsPanel />}
    </div>
  );
}

interface ChatInterfaceProps {
  activeChatId?: string | null;
  onChatDeleted?: () => void;
  onSessionChange?: (id: string | null) => void;
  model?: string;
  mode?: ReasoningMode;
  onModeChange?: (mode: ReasoningMode) => void;
  config?: { temperature: number; maxTokens: number };
  projectId?: string | null; 
  dictationEnabled?: boolean;
}

export function ChatInterface({ activeChatId, onChatDeleted, onSessionChange, model, mode, onModeChange, config, projectId, dictationEnabled }: ChatInterfaceProps) {
  // REMOVED key prop - ChatProvider now handles session switching internally
  // Using key caused full remount which destroyed state and created race conditions
  // The ChatProvider already syncs with initialSessionId prop changes via useEffect
  return (
    <ChatErrorBoundary>
      <ChatProvider 
          initialSessionId={activeChatId} 
          model={model} 
          mode={mode}
          onSessionDelete={onChatDeleted ? () => onChatDeleted() : undefined}
          config={config}
          projectId={projectId} 
      >
        <ChatLayout onSessionChange={onSessionChange} onModeChange={onModeChange} dictationEnabled={dictationEnabled} />
      </ChatProvider>
    </ChatErrorBoundary>
  );
}
