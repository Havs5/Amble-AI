import React, { useRef } from 'react';
import dynamic from 'next/dynamic';
import { ChatInterface } from '../chat/ChatInterface';
import { ReasoningMode } from '@/utils/modelConstants';

const DashboardView = dynamic(() => import('../views/DashboardView').then(m => ({ default: m.DashboardView })), {
  loading: () => <LoadingSpinner label="Loading dashboard..." />,
  ssr: false,
});

// Lazy load heavy components that aren't immediately visible
const BillingView = dynamic(() => import('../views/BillingView').then(m => ({ default: m.BillingView })), {
  loading: () => <LoadingSpinner label="Loading billing..." />,
  ssr: false,
});

const MediaStudio = dynamic(() => import('../studio/MediaStudio').then(m => ({ default: m.MediaStudio })), {
  loading: () => <LoadingSpinner label="Loading studio..." />,
  ssr: false,
});

const PharmacyView = dynamic(() => import('../views/PharmacyView').then(m => ({ default: m.PharmacyView })), {
  loading: () => <LoadingSpinner label="Loading RxConnect..." />,
  ssr: false,
});

const KnowledgeBaseView = dynamic(() => import('../views/KnowledgeBaseView').then(m => ({ default: m.KnowledgeBaseView })), {
  loading: () => <LoadingSpinner label="Loading knowledge base..." />,
  ssr: false,
});

const TimeClockView = dynamic(() => import('../views/TimeClockView').then(m => ({ default: m.TimeClockView })), {
  loading: () => <LoadingSpinner label="Loading time clock..." />,
  ssr: false,
});

// Simple loading component
function LoadingSpinner({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-900" role="status" aria-live="polite">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
      </div>
    </div>
  );
}

/**
 * KeepAlive — renders its children persistently and only toggles visibility.
 * Inactive views stay mounted (display:none) so their internal state — scroll
 * position, open document, in-progress draft, loaded iframe session — survives
 * tab switches, and switching back is instant (no remount, no re-fetch).
 */
function KeepAlive({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ display: active ? 'flex' : 'none' }}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

interface FeatureRouterProps {
  activeView: string;

  // Chat Props
  chatProps: {
    sessionToken: number;
    activeChatId: string | null;
    activeProjectId: string | null;
    model: string;
    mode?: ReasoningMode;
    onModeChange?: (mode: ReasoningMode) => void;
    config: any;
    onChatDeleted: () => void;
    onSessionChange: (id: string) => void;
    dictationEnabled?: boolean;
  };

  // Billing Props
  billingProps: {
    resetKey: number;
    user: any;
    systemPrompt: string;
    policies?: string[];
    setToast: (data: { type: 'success' | 'error' | 'info'; message: string } | null) => void;
    onHelp: () => void;
  };

  // Dashboard Props
  dashboardProps?: {
    userName: string;
    onNavigate: (view: string) => void;
    recentChats?: Array<{ id: string; title: string; updatedAt: string }>;
    permissions: {
      accessAmble: boolean;
      accessBilling: boolean;
      accessPharmacy: boolean;
      accessStudio: boolean;
      accessKnowledge: boolean;
    };
    stats?: {
      totalChats: number;
      totalTokens: number;
      billingCases: number;
      kbDocuments: number;
    };
    user?: {
      id: string;
      name: string;
      role: 'admin' | 'user' | 'superadmin';
      departmentId?: string;
    };
  };
}

export function FeatureRouter({
  activeView,
  chatProps,
  billingProps,
  dashboardProps
}: FeatureRouterProps) {

  // Keep-alive: a view is mounted the first time it becomes active, then kept
  // alive for the rest of the session. Because we only ever record the *active*
  // view, every view's first mount happens while it is visible (so size-aware
  // children like charts measure correctly).
  const visited = useRef<Set<string>>(new Set());
  visited.current.add(activeView);
  const isVisited = (view: string) => visited.current.has(view);

  return (
    <main className="flex-1 overflow-hidden relative flex flex-col">
      {dashboardProps && isVisited('dashboard') && (
        <KeepAlive active={activeView === 'dashboard'}>
          <DashboardView {...dashboardProps} />
        </KeepAlive>
      )}

      {isVisited('amble') && (
        <KeepAlive active={activeView === 'amble'}>
          <div className="flex-1 flex flex-col h-full bg-white dark:bg-slate-900 relative">
            <ChatInterface
              activeChatId={chatProps.activeChatId}
              onChatDeleted={chatProps.onChatDeleted}
              onSessionChange={(id) => {
                if (id && id !== chatProps.activeChatId) chatProps.onSessionChange(id);
              }}
              model={chatProps.model}
              mode={chatProps.mode}
              onModeChange={chatProps.onModeChange}
              config={chatProps.config}
              projectId={chatProps.activeProjectId}
              dictationEnabled={chatProps.dictationEnabled}
            />
          </div>
        </KeepAlive>
      )}

      {isVisited('billing') && (
        <KeepAlive active={activeView === 'billing'}>
          <BillingView
            key={billingProps.resetKey}
            user={billingProps.user}
            selectedModel={chatProps.model} // Billing often uses the selected model too
            systemPrompt={billingProps.systemPrompt}
            policies={billingProps.policies}
            setToast={billingProps.setToast}
            onHelp={billingProps.onHelp}
          />
        </KeepAlive>
      )}

      {isVisited('veo') && (
        <KeepAlive active={activeView === 'veo'}>
          <MediaStudio />
        </KeepAlive>
      )}

      {isVisited('knowledge') && (
        <KeepAlive active={activeView === 'knowledge'}>
          <KnowledgeBaseView />
        </KeepAlive>
      )}

      {isVisited('pharmacies') && (
        <KeepAlive active={activeView === 'pharmacies'}>
          <PharmacyView />
        </KeepAlive>
      )}

      {isVisited('clock') && (
        <KeepAlive active={activeView === 'clock'}>
          <TimeClockView />
        </KeepAlive>
      )}
    </main>
  );
}
