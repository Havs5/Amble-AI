'use client';

/**
 * Knowledge Base Admin Panel
 * 
 * Manage KB sync, view status, and browse documents
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth/AuthContextRefactored';
import { 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  FileText,
  FolderSync,
  Trash2,
  Clock,
  BarChart3,
  ExternalLink
} from 'lucide-react';

interface KBStatus {
  syncStatus: {
    configured: boolean;
    rootFolderId: string | null;
    lastSync: string | null;
    status: 'idle' | 'syncing' | 'error' | 'completed';
    documentsCount: number;
    chunksCount: number;
    errors?: string[];
  };
  stats: {
    totalDocuments: number;
    totalChunks: number;
    byCategory: Record<string, number>;
    byDepartment: Record<string, number>;
    lastUpdated: string | null;
    avgChunksPerDocument: number;
  };
  health: {
    healthy: boolean;
    issues: string[];
  };
  configuration: {
    rootFolderId: string | null;
    syncIntervalMinutes: number;
    maxDocuments: number;
    embeddingModel: string;
    minRelevanceScore: number;
    webSearchFallback: boolean;
  };
}

export function KnowledgeBaseAdmin() {
  const { user, getIdToken } = useAuth();
  const [status, setStatus] = useState<KBStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;

      const response = await fetch('/api/knowledge/status', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setError(null);
      } else {
        const err = await response.json();
        setError(err.error || 'Failed to fetch status');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Trigger sync
  const handleSync = async (force: boolean = false) => {
    setSyncing(true);
    setError(null);

    try {
      const token = await getIdToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/knowledge/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ force })
      });

      if (response.ok) {
        // Start polling for updates
        const pollInterval = setInterval(async () => {
          await fetchStatus();
          if (status?.syncStatus.status !== 'syncing') {
            clearInterval(pollInterval);
            setSyncing(false);
          }
        }, 3000);
      } else {
        const err = await response.json();
        setError(err.error || 'Sync failed');
        setSyncing(false);
      }
    } catch (err: any) {
      setError(err.message);
      setSyncing(false);
    }
  };

  // Rebuild KB
  const handleRebuild = async () => {
    if (!confirm('This will delete all KB data and rebuild from scratch. Continue?')) {
      return;
    }

    setSyncing(true);
    setError(null);

    try {
      const token = await getIdToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/knowledge/sync', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        await fetchStatus();
        // Continue polling
        const pollInterval = setInterval(async () => {
          await fetchStatus();
          if (status?.syncStatus.status !== 'syncing') {
            clearInterval(pollInterval);
            setSyncing(false);
          }
        }, 3000);
      } else {
        const err = await response.json();
        setError(err.error || 'Rebuild failed');
        setSyncing(false);
      }
    } catch (err: any) {
      setError(err.message);
      setSyncing(false);
    }
  };

  // Test search
  const handleTestSearch = async () => {
    if (!testQuery.trim()) return;

    setTestLoading(true);
    setTestResults(null);

    try {
      const token = await getIdToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/knowledge/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ query: testQuery, limit: 5 })
      });

      if (response.ok) {
        const data = await response.json();
        setTestResults(data.results || []);
      } else {
        const err = await response.json();
        setError(err.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8" role="status" aria-live="polite">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
        <span className="ml-2 text-foreground">Loading Knowledge Base status...</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
            <Database className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Knowledge Base</h1>
            <p className="text-sm text-muted-foreground">Manage AI-powered document search</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => fetchStatus()}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-foreground flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => handleSync(false)}
            disabled={syncing || !status?.syncStatus.configured}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-indigo-500/25 transition-all"
          >
            <FolderSync className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-700 dark:text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Health Status */}
      {status && (
        <div className={`p-4 rounded-xl border ${status.health.healthy ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'}`}>
          <div className="flex items-center gap-2">
            {status.health.healthy ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            )}
            <span className="font-medium text-foreground">
              {status.health.healthy ? 'Knowledge Base is healthy' : 'Issues detected'}
            </span>
          </div>
          {status.health.issues.length > 0 && (
            <ul className="mt-2 ml-7 text-sm list-disc text-muted-foreground">
              {status.health.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Stats Grid */}
      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FileText className="w-4 h-4" />
              Documents
            </div>
            <div className="text-3xl font-bold text-foreground">{status.stats.totalDocuments}</div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <BarChart3 className="w-4 h-4" />
              Chunks
            </div>
            <div className="text-3xl font-bold text-foreground">{status.stats.totalChunks}</div>
            <div className="text-sm text-muted-foreground">
              ~{status.stats.avgChunksPerDocument} per doc
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="w-4 h-4" />
              Last Sync
            </div>
            <div className="text-lg font-medium text-foreground">
              {status.syncStatus.lastSync
                ? new Date(status.syncStatus.lastSync).toLocaleString()
                : 'Never'}
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Database className="w-4 h-4" />
              Status
            </div>
            <div className={`text-lg font-medium capitalize ${
              status.syncStatus.status === 'syncing' ? 'text-indigo-600 dark:text-indigo-400' :
              status.syncStatus.status === 'error' ? 'text-red-600 dark:text-red-400' :
              status.syncStatus.status === 'completed' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
            }`}>
              {status.syncStatus.status}
            </div>
          </div>
        </div>
      )}

      {/* Configuration */}
      {status && (
        <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h2 className="text-lg font-semibold mb-3 text-foreground">Configuration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Root Folder ID</div>
              <div className="font-mono text-xs truncate text-foreground">
                {status.configuration.rootFolderId || 'Not configured'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Embedding Model</div>
              <div className="text-foreground">{status.configuration.embeddingModel}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Min Relevance Score</div>
              <div className="text-foreground">{status.configuration.minRelevanceScore}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Web Search Fallback</div>
              <div className="text-foreground">{status.configuration.webSearchFallback ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Max Documents</div>
              <div className="text-foreground">{status.configuration.maxDocuments}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Sync Interval</div>
              <div className="text-foreground">{status.configuration.syncIntervalMinutes} minutes</div>
            </div>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {status && Object.keys(status.stats.byCategory).length > 0 && (
        <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h2 className="text-lg font-semibold mb-3 text-foreground">Documents by Category</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(status.stats.byCategory).map(([cat, count]) => (
              <span 
                key={cat} 
                className="px-3 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/20 rounded-full text-sm"
              >
                {cat}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Test Search */}
      <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 text-foreground">Test Search</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTestSearch()}
            placeholder="Enter a test query..."
            aria-label="Test search query"
            className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/50 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all"
          />
          <button
            onClick={handleTestSearch}
            disabled={testLoading || !testQuery.trim()}
            className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 transition-all"
          >
            {testLoading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {testResults && (
          <div className="mt-4 space-y-3">
            {testResults.length === 0 ? (
              <p className="text-muted-foreground italic">No results found</p>
            ) : (
              testResults.map((result, i) => (
                <div key={i} className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-foreground">
                      {result.documentTitle || result.sourcePath}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      result.score >= 0.8 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                      result.score >= 0.6 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                      'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                      {(result.score * 100).toFixed(0)}% match
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {result.content}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800">
        <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-3">Danger Zone</h2>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">Rebuild Knowledge Base</p>
            <p className="text-sm text-muted-foreground">Delete all data and re-sync from Google Drive</p>
          </div>
          <button
            onClick={handleRebuild}
            disabled={syncing}
            className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 shrink-0 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Rebuild
          </button>
        </div>
      </div>
    </div>
  );
}

export default KnowledgeBaseAdmin;
