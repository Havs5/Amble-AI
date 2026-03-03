import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ClearDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ClearDataModal({ isOpen, onClose, onConfirm }: ClearDataModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 animate-in zoom-in-95 duration-200 mx-4">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-400">
            <AlertCircle size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Clear all data?</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This will permanently remove all current patient chat history and verified notes. This action cannot be undone.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium shadow-lg shadow-red-500/20 transition-all"
          >
            Yes, Clear All
          </button>
        </div>
      </div>
    </div>
  );
}
