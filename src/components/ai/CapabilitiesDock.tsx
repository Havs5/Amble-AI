import React from 'react';
import { X, Zap, Globe, FileText, Code, Image as ImageIcon, Layout, Mic, Video, Radio } from 'lucide-react';
import { CapabilityKey, CAPABILITY_LABELS, MODEL_CAPABILITIES } from '../../lib/capabilities';

interface CapabilitiesDockProps {
  isOpen: boolean;
  onClose: () => void;
  activeCapabilities: Record<CapabilityKey, boolean>;
  onToggleCapability: (cap: CapabilityKey) => void;
  currentModelId: string;
  onModelChange: (modelId: string) => void;
}

export function CapabilitiesDock({
  isOpen,
  onClose,
  activeCapabilities,
  onToggleCapability,
  currentModelId,
  onModelChange
}: CapabilitiesDockProps) {
  const currentModel = MODEL_CAPABILITIES[currentModelId];

  const renderToggle = (cap: CapabilityKey, icon: React.ReactNode, label: string, description: string) => {
    const isSupported = currentModel?.capabilities[cap];
    const isActive = activeCapabilities[cap];

    return (
      <div className={`p-4 rounded-xl border transition-all ${isActive ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isActive ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
              {icon}
            </div>
            <div>
              <h4 className="font-medium text-slate-900 dark:text-white text-sm">{label}</h4>
              {!isSupported && (
                <span className="text-xs text-amber-500 flex items-center gap-1">
                  Not supported by {currentModel?.name}
                </span>
              )}
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={isActive}
              onChange={() => onToggleCapability(cap)}
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
          </label>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {description}
        </p>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full w-96 bg-white dark:bg-slate-900 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-slate-200 dark:border-slate-800 overflow-y-auto ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <Zap size={24} fill="currentColor" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Premium Capabilities</h2>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-6">
            {/* Realtime Voice */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Voice & Audio</h3>
              {renderToggle('realtimeVoice', <Radio size={18} />, 'Realtime Voice Mode', 'Low-latency speech-to-speech conversation using WebRTC.')}
              {renderToggle('audioIn', <Mic size={18} />, 'Audio Understanding', 'Upload or record audio for analysis.')}
            </div>

            {/* Web & Knowledge */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Knowledge & Grounding</h3>
              {renderToggle('webBrowse', <Globe size={18} />, 'Web Browsing', 'Search the web for real-time information and citations.')}
              {renderToggle('fileSearch', <FileText size={18} />, 'File Search / RAG', 'Upload documents for context-aware responses.')}
            </div>

            {/* Advanced Tools */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Advanced Tools</h3>
              {renderToggle('codeInterpreter', <Code size={18} />, 'Code Interpreter', 'Execute Python code for analysis and math.')}
              {renderToggle('imageGen', <ImageIcon size={18} />, 'Image Generation', 'Create images from text descriptions.')}
              {renderToggle('jsonSchema', <Layout size={18} />, 'Structured Output', 'Enforce strict JSON schemas for responses.')}
            </div>

            {/* Multimodal */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Multimodal</h3>
              {renderToggle('videoIn', <Video size={18} />, 'Video Understanding', 'Analyze uploaded video content.')}
            </div>
          </div>

          {/* Model Info Footer */}
          <div className="mt-8 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-1">Current Model</h4>
            <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">{currentModel?.name || currentModelId}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {currentModel?.contextWindow?.toLocaleString()} token context window
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
