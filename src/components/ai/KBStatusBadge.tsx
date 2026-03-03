'use client';

/**
 * Knowledge Base Status Badge
 * 
 * Small indicator showing KB status in the chat interface
 */

import React, { useEffect, useState } from 'react';
import { Database, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContextRefactored';

interface KBStatusBadgeProps {
  compact?: boolean;
  showOnlyWhenActive?: boolean;
  className?: string;
}

export function KBStatusBadge({ 
  compact = false, 
  showOnlyWhenActive = true,
  className = '' 
}: KBStatusBadgeProps) {
  const { getIdToken } = useAuth();
  const [status, setStatus] = useState<{
    configured: boolean;
    active: boolean;
    documentsCount: number;
    syncing: boolean;
  }>({
    configured: false,
    active: false,
    documentsCount: 0,
    syncing: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const token = await getIdToken();
        if (!token) return;

        const response = await fetch('/api/knowledge/status', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setStatus({
            configured: data.syncStatus?.configured || false,
            active: data.syncStatus?.documentsCount > 0,
            documentsCount: data.syncStatus?.documentsCount || 0,
            syncing: data.syncStatus?.status === 'syncing',
          });
        }
      } catch {
        // Silently fail - KB is optional
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
    // Refresh every 60 seconds
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [getIdToken]);

  // Don't show if configured to show only when active and KB is not active
  if (showOnlyWhenActive && !status.active) {
    return null;
  }

  if (loading) {
    return null;
  }

  if (compact) {
    return (
      <div 
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
          status.active 
            ? 'bg-green-100 text-green-700' 
            : status.configured 
              ? 'bg-yellow-100 text-yellow-700' 
              : 'bg-gray-100 text-gray-500'
        } ${className}`}
        title={
          status.active 
            ? `Knowledge Base active (${status.documentsCount} docs)` 
            : status.configured 
              ? 'Knowledge Base configured but empty' 
              : 'Knowledge Base not configured'
        }
      >
        {status.syncing ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Database className="w-3 h-3" />
        )}
        {status.active && <span>KB</span>}
      </div>
    );
  }

  return (
    <div 
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
        status.active 
          ? 'bg-green-50 text-green-700 border border-green-200' 
          : status.configured 
            ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
            : 'bg-gray-50 text-gray-500 border border-gray-200'
      } ${className}`}
    >
      {status.syncing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : status.active ? (
        <CheckCircle className="w-4 h-4" />
      ) : (
        <AlertCircle className="w-4 h-4" />
      )}
      <span>
        {status.syncing 
          ? 'Syncing...' 
          : status.active 
            ? `KB Active (${status.documentsCount})` 
            : status.configured 
              ? 'KB Empty' 
              : 'KB Not Configured'}
      </span>
    </div>
  );
}

export default KBStatusBadge;
