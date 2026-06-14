'use client';

import React, { useState, useRef } from 'react';
import { Loader2, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';

/**
 * RxConnect — embedded pharmacy portal.
 *
 * Replaces the former multi-pharmacy (Revive/Align) iframe switcher. The whole
 * surface is a single embedded site. Because FeatureRouter keeps this view
 * mounted (keep-alive), the RxConnect session persists while you use other
 * Amble AI tabs.
 */
const RXCONNECT_URL = 'https://rxconnect.tweaking.agency/login';

export function PharmacyView() {
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const refresh = () => {
    setLoading(true);
    setHasError(false);
    if (iframeRef.current) iframeRef.current.src = RXCONNECT_URL;
  };

  const openInNewTab = () => window.open(RXCONNECT_URL, '_blank', 'noopener,noreferrer');

  const iconBtn =
    'p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-white dark:bg-slate-900">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">RxConnect</span>
          {loading && !hasError && <Loader2 size={14} className="animate-spin text-indigo-600" />}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className={iconBtn} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button onClick={openInNewTab} className={iconBtn} title="Open in new tab">
            <ExternalLink size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 relative">
        {hasError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 px-4 text-center">
            <AlertCircle size={48} className="text-red-500 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Couldn&apos;t load RxConnect
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-sm">
              The site may not allow being embedded. You can retry, or open it in a new tab.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={refresh}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                <RefreshCw size={16} />
                Try Again
              </button>
              <button
                onClick={openInNewTab}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
              >
                <ExternalLink size={16} />
                Open in new tab
              </button>
            </div>
          </div>
        ) : (
          <>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-900 z-10">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={32} className="animate-spin text-indigo-600" />
                  <span className="text-sm text-slate-500 dark:text-slate-400">Loading RxConnect...</span>
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={RXCONNECT_URL}
              title="RxConnect"
              className="absolute inset-0 w-full h-full border-0 bg-white dark:bg-slate-900"
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setHasError(true);
              }}
              allow="clipboard-read; clipboard-write; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
            />
          </>
        )}
      </div>
    </div>
  );
}
