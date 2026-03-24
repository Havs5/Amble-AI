import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { ChatInterface } from '../chat/ChatInterface';
import { PharmacyType } from '../layout/PharmacySidebar';
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
  loading: () => <LoadingSpinner label="Loading pharmacies..." />,
  ssr: false,
});

const KnowledgeBaseView = dynamic(() => import('../views/KnowledgeBaseView').then(m => ({ default: m.KnowledgeBaseView })), {
  loading: () => <LoadingSpinner label="Loading knowledge base..." />,
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

  // Pharmacy Props
  pharmacyProps?: {
    activePharmacy: PharmacyType | null;
    mountedPharmacies: Set<PharmacyType>;
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
  pharmacyProps,
  dashboardProps
}: FeatureRouterProps) {
  
  return (
    <main className="flex-1 overflow-hidden relative flex flex-col">
      {activeView === 'dashboard' && dashboardProps ? (
        <DashboardView {...dashboardProps} />
      ) : activeView === 'amble' ? (
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
      ) : activeView === 'billing' ? (
        <BillingView 
          key={billingProps.resetKey}
          user={billingProps.user}
          selectedModel={chatProps.model} // Billing often uses the selected model too
          systemPrompt={billingProps.systemPrompt}
          policies={billingProps.policies}
          setToast={billingProps.setToast}
          onHelp={billingProps.onHelp}
        />
      ) : activeView === 'veo' ? (
        <MediaStudio />
      ) : activeView === 'knowledge' ? (
        <KnowledgeBaseView />
      ) : activeView === 'pharmacies' && pharmacyProps ? (
        <PharmacyView 
          activePharmacy={pharmacyProps.activePharmacy}
          mountedPharmacies={pharmacyProps.mountedPharmacies}
        />
      ) : null}
    </main>
  );
}
