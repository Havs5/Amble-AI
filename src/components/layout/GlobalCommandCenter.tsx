import React, { useState } from 'react';
import { RefreshCw, ShieldAlert, HelpCircle, Info, Send, BrainCircuit, Sparkles, Search, Code } from 'lucide-react';
import { Provider, ReasoningMode } from '@/utils/modelConstants';
import { 
  ModelSelector, 
  AMBLE_AI_MODEL_CATEGORIES, 
  BILLING_MODEL_CATEGORIES,
  ModelOption
} from '@/components/ui/ModelSelector';

interface GlobalCommandCenterProps {
  activeView: string;
  modelSel: {
    selectedModel: string;
    setSelectedModel: (id: string) => void;
    selectedProvider: Provider;
    setSelectedProvider: (p: Provider) => void;
    selectedReasoningMode: ReasoningMode;
    setSelectedReasoningMode: (m: ReasoningMode) => void;
  };
  billingActions?: {
    onNewPatient: () => void;
    qaEnabled: boolean;
    setQaEnabled: (v: boolean) => void;
  };
  onOpenHelp: () => void;
}

const modeDescriptions = [
  { mode: 'Instant', icon: Send, color: 'text-slate-500', desc: 'Quick responses for simple questions' },
  { mode: 'Thinking', icon: BrainCircuit, color: 'text-indigo-500', desc: 'Deep reasoning for complex problems' },
  { mode: 'Planner', icon: Sparkles, color: 'text-emerald-500', desc: 'Step-by-step task planning agent' },
  { mode: 'Researcher', icon: Search, color: 'text-orange-500', desc: 'Web search & information gathering' },
  { mode: 'Coder', icon: Code, color: 'text-blue-500', desc: 'Code generation & debugging agent' },
];

export function GlobalCommandCenter({
  activeView,
  modelSel,
  billingActions,
  onOpenHelp
}: GlobalCommandCenterProps) {
  const [showModeInfo, setShowModeInfo] = useState(false);
  
  // For billing view, use a separate model state (default to Gemini 3 Flash)
  const [billingModel, setBillingModel] = useState('gemini-3-flash-preview');
  
  // Map model IDs to reasoning modes
  const getReasoningModeForModel = (modelId: string): ReasoningMode => {
    const instantModels = ['gpt-4o-mini', 'gemini-3-flash-preview'];
    const thinkingModels = ['gpt-4o', 'gemini-3-pro-preview', 'o1'];
    if (instantModels.includes(modelId)) return 'instant';
    if (thinkingModels.includes(modelId)) return 'thinking';
    return 'instant';
  };
  
  return (
    <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
      {/* LEFT SIDE */}
      <div className="flex items-center gap-4">
        {activeView === 'billing' ? (
          // Billing-specific model selector dropdown
          <ModelSelector
            categories={BILLING_MODEL_CATEGORIES}
            selectedModelId={billingModel}
            onSelect={(model: ModelOption) => {
              setBillingModel(model.id);
              modelSel.setSelectedModel(model.id);
              modelSel.setSelectedProvider(model.provider as Provider);
              modelSel.setSelectedReasoningMode(getReasoningModeForModel(model.id));
            }}
            variant="pill"
          />
        ) : activeView !== 'veo' && activeView !== 'knowledge' && (
          // Default model selector for other views
          <ModelSelector
            categories={AMBLE_AI_MODEL_CATEGORIES}
            selectedModelId={modelSel.selectedModel}
            onSelect={(model: ModelOption) => {
              modelSel.setSelectedModel(model.id);
              modelSel.setSelectedProvider(model.provider as Provider);
              modelSel.setSelectedReasoningMode(getReasoningModeForModel(model.id));
            }}
          />
        )}
      </div>

      {/* CENTER - New Patient Button (Billing only) */}
      {activeView === 'billing' && billingActions && (
        <div className="hidden sm:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <button
            onClick={() => billingActions.onNewPatient()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors font-medium text-sm"
          >
            <RefreshCw size={16} />
            <span>New Patient</span>
          </button>
        </div>
      )}

      {/* RIGHT SIDE */}
      <div className="flex items-center gap-3">
        {/* QA Check - Billing only */}
        {activeView === 'billing' && billingActions && (
          <div className="flex items-center gap-4 bg-slate-100/50 dark:bg-slate-800/50 px-4 py-1.5 rounded-full border border-slate-200/50 dark:border-slate-700/50">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={billingActions.qaEnabled} 
                onChange={(e) => billingActions.setQaEnabled(e.target.checked)} 
                className="rounded text-indigo-600 w-4 h-4"
              />
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <ShieldAlert size={16} />
                <span className="hidden sm:inline">QA Check</span>
              </span>
            </label>
          </div>
        )}

        {/* Help Button - Only show for billing view (workspace guide) */}
        {activeView === 'billing' && (
          <button 
            onClick={onOpenHelp} 
            className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            title="Workspace Guide"
          >
            <HelpCircle size={20} />
          </button>
        )}

        {/* Mode Info Tooltip - Hide for billing view */}
        {activeView !== 'billing' && (
          <div className="relative">
            <button 
              onClick={() => setShowModeInfo(!showModeInfo)}
              className="p-2 rounded-full transition-all bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400"
              title="Mode Information"
              aria-expanded={showModeInfo}
              aria-haspopup="dialog"
            >
              <Info size={20} />
            </button>
            
            {showModeInfo && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowModeInfo(false)} />
                <div className="absolute top-12 right-0 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">Reasoning Modes</h3>
                  <div className="space-y-3">
                    {modeDescriptions.map((item) => (
                      <div key={item.mode} className="flex items-start gap-3">
                        <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 ${item.color}`}>
                          <item.icon size={14} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{item.mode}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
