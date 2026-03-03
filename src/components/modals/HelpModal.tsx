import React from 'react';
import { HelpCircle, X, EyeOff, Mic, RefreshCw, Zap, Brain } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-0 animate-in zoom-in-95 duration-200 mx-4 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
              <HelpCircle size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Workspace Guide</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 dark:text-slate-400"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-8">
          
          {/* Section: AI Controls */}
          <div className="flex gap-4">
            <div className="mt-1">
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                <Brain size={16} />
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">AI Model & Reasoning</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
                Controls the "brain" powering the assistant.
              </p>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li className="flex gap-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 w-24 shrink-0">ChatGPT:</span> 
                  <span>Uses OpenAI's models (GPT-5). Good for general purpose logic.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 w-24 shrink-0">Gemini:</span> 
                  <span>Uses Google's models. Often faster and has a larger context window.</span>
                </li>
                 <li className="flex gap-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 w-24 shrink-0">Thinking:</span> 
                  <span>Enables "Chain of Thought" reasoning. The AI takes longer to process but solves complex logic problems better.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 w-24 shrink-0">Instant:</span> 
                  <span>Optimized for speed. Best for simple queries and quick chats.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="w-full h-px bg-slate-100 dark:bg-slate-800"></div>

          {/* Section: QA Check */}
          <div className="flex gap-4">
            <div className="mt-1">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">QA</div>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">QA Check (Quality Assurance)</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                When enabled, the AI runs a second pass over its own output to verify accuracy against defined policies (e.g., verifying medical codes or checking for logical consistency).
              </p>
            </div>
          </div>

          {/* Section: Redact */}
          <div className="flex gap-4">
            <div className="mt-1">
              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-sm">
                <EyeOff size={14} />
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">Redact</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Automatically mask sensitive Personal Identifiable Information (PII) like names and dates in the output to ensure privacy.
              </p>
            </div>
          </div>

          {/* Section: Push-to-Talk */}
          <div className="flex gap-4">
            <div className="mt-1">
              <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold text-sm">
                <Mic size={14} />
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">PTT (Space)</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Hold the <strong>Spacebar</strong> to activate voice dictation instantly. Release to stop recording.
              </p>
            </div>
          </div>

          {/* Section: New Patient */}
          <div className="flex gap-4">
            <div className="mt-1">
              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                <RefreshCw size={14} />
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">New Patient</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Clears all current context (chat history, notes) to start a fresh analysis session.
              </p>
            </div>
          </div>

          {/* Section: Append vs Replace */}
          <div className="flex gap-4">
            <div className="mt-1">
              <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-sm">
                <RefreshCw size={14} />
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">Append vs. Replace</h3>
              <div className="space-y-3 mt-2">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 text-sm block mb-1">Append</span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Adds the new text to the end of your existing notes without removing anything. Use this to add more details.</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 text-sm block mb-1">Replace</span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Completely overwrites the selected section or the entire note with the new text. Use this when rewriting a section.</span>
                </div>
              </div>
            </div>
          </div>

        </div>
        
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-slate-900/10"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
