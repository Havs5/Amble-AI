'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { PHARMACIES, PharmacyType } from '../layout/PharmacySidebar';

interface PharmacyViewProps {
  activePharmacy: PharmacyType | null;
  // Keep iframes mounted so they persist sessions across view switches
  mountedPharmacies: Set<PharmacyType>;
}

export function PharmacyView({ activePharmacy, mountedPharmacies }: PharmacyViewProps) {
  const [loadingStates, setLoadingStates] = useState<Record<PharmacyType, boolean>>({
    revive: true,
    align: true
  });
  const [errorStates, setErrorStates] = useState<Record<PharmacyType, boolean>>({
    revive: false,
    align: false
  });
  const iframeRefs = useRef<Record<PharmacyType, HTMLIFrameElement | null>>({
    revive: null,
    align: null
  });

  // Listen for clipboard-copy messages from pharmacy iframes
  useEffect(() => {
    const allowedOrigins = PHARMACIES.map(p => new URL(p.url).origin);
    const handleMessage = (e: MessageEvent) => {
      if (!allowedOrigins.includes(e.origin)) return;
      if (e.data && e.data.type === 'clipboard-copy' && typeof e.data.text === 'string') {
        navigator.clipboard.writeText(e.data.text).catch(() => {});
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleLoad = (pharmacyId: PharmacyType) => {
    setLoadingStates(prev => ({ ...prev, [pharmacyId]: false }));
    setErrorStates(prev => ({ ...prev, [pharmacyId]: false }));
  };

  const handleError = (pharmacyId: PharmacyType) => {
    setLoadingStates(prev => ({ ...prev, [pharmacyId]: false }));
    setErrorStates(prev => ({ ...prev, [pharmacyId]: true }));
  };

  const refreshIframe = (pharmacyId: PharmacyType) => {
    const iframe = iframeRefs.current[pharmacyId];
    if (iframe) {
      setLoadingStates(prev => ({ ...prev, [pharmacyId]: true }));
      setErrorStates(prev => ({ ...prev, [pharmacyId]: false }));
      iframe.src = iframe.src; // Refresh the iframe
    }
  };

  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!activePharmacy) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 12h-15m0 0l6.75-6.75M4.5 12l6.75 6.75" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Select a Pharmacy
          </h3>
          <p className="text-sm">
            Choose a pharmacy from the sidebar to access its system. Your login session will remain active as you navigate between Amble AI features.
          </p>
        </div>
      </div>
    );
  }

  const activePharmacyData = PHARMACIES.find(p => p.id === activePharmacy);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Render ALL mounted iframes but only show the active one */}
      {PHARMACIES.map(pharmacy => {
        const isMounted = mountedPharmacies.has(pharmacy.id);
        const isActive = pharmacy.id === activePharmacy;
        const isLoading = loadingStates[pharmacy.id];
        const hasError = errorStates[pharmacy.id];

        if (!isMounted) return null;

        return (
          <div
            key={pharmacy.id}
            className={`absolute inset-0 flex flex-col ${isActive ? 'z-10' : 'z-0 invisible'}`}
          >
            {/* Header bar */}
            <div className={`flex items-center justify-between px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 ${!isActive && 'hidden'}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {pharmacy.name}
                </span>
                {isLoading && (
                  <Loader2 size={14} className="animate-spin text-indigo-600" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refreshIframe(pharmacy.id)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  onClick={() => openInNewTab(pharmacy.url)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink size={16} />
                </button>
              </div>
            </div>

            {/* Error state */}
            {hasError && isActive && (
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
                <AlertCircle size={48} className="text-red-500 mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  Failed to load {pharmacy.name}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  The pharmacy application could not be loaded.
                </p>
                <button
                  onClick={() => refreshIframe(pharmacy.id)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                  <RefreshCw size={16} />
                  Try Again
                </button>
              </div>
            )}

            {/* Loading spinner overlay */}
            {isLoading && isActive && !hasError && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-900 z-10" style={{ top: '45px' }}>
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={32} className="animate-spin text-indigo-600" />
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Loading {pharmacy.name}...
                  </span>
                </div>
              </div>
            )}

            {/* Iframe */}
            <iframe
              ref={(el) => { iframeRefs.current[pharmacy.id] = el; }}
              src={pharmacy.url}
              title={pharmacy.name}
              className={`flex-1 w-full border-0 bg-white dark:bg-slate-900 ${hasError ? 'hidden' : ''}`}
              onLoad={() => handleLoad(pharmacy.id)}
              onError={() => handleError(pharmacy.id)}
              allow="clipboard-read; clipboard-write; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
            />
          </div>
        );
      })}
    </div>
  );
}
