import React from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
  const getStyles = () => {
    switch (type) {
      case 'error':
        return 'bg-red-50 dark:bg-red-900/90 border-red-200 dark:border-red-800 text-red-800 dark:text-red-100';
      case 'info':
        return 'bg-blue-50 dark:bg-blue-900/90 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-100';
      case 'success':
      default:
        return 'bg-emerald-50 dark:bg-emerald-900/90 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-100';
    }
  };

  const Icon = () => {
    switch (type) {
      case 'error': return <AlertCircle size={20} />;
      case 'info': return <Info size={20} />;
      case 'success':
      default: 
        return <CheckCircle size={20} />;
    }
  };

  return (
    <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-[70] animate-in fade-in slide-in-from-top-4 border ${getStyles()}`}>
      <Icon />
      <span className="font-medium text-sm">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        <X size={16} />
      </button>
    </div>
  );
}
