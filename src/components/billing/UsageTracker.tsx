'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  DollarSign, TrendingUp, Zap, AlertTriangle, RefreshCw,
  MessageSquare, Image, Video, Mic, ChevronDown, ChevronUp,
  BarChart3, Settings, Clock, Target
} from 'lucide-react';
import { UsageManager, UsageLimits, DetailedUsageStats, ModelUsageBreakdown } from '@/lib/usageManager';
import { useAuth } from '@/components/auth/AuthContextRefactored';

interface UsageTrackerProps {
  compact?: boolean;
  showDetails?: boolean;
  className?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  text: 'bg-indigo-500',
  image: 'bg-pink-500',
  video: 'bg-orange-500',
  audio: 'bg-emerald-500',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  text: <MessageSquare size={14} />,
  image: <Image size={14} />,
  video: <Video size={14} />,
  audio: <Mic size={14} />,
};

export function UsageTracker({ compact = false, showDetails = true, className = '' }: UsageTrackerProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<DetailedUsageStats | null>(null);
  const [limits, setLimits] = useState<UsageLimits | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [detailedStats, userLimits] = await Promise.all([
        UsageManager.loadDetailedStats(user.id),
        UsageManager.loadLimits(user.id)
      ]);

      setStats(detailedStats);
      setLimits(userLimits);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load usage data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(loadData, 120000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (!user) {
    return null;
  }

  const todayCost = stats?.today?.cost ?? 0;
  const monthCost = stats?.month?.cost ?? 0;
  const dailyLimit = limits?.dailyCostLimit ?? 20;
  const monthlyLimit = limits?.monthlyCostLimit ?? 200;
  
  const dailyPercentage = Math.min((todayCost / dailyLimit) * 100, 100);
  const monthlyPercentage = Math.min((monthCost / monthlyLimit) * 100, 100);
  
  const isNearDailyLimit = dailyPercentage > 80;
  const isNearMonthlyLimit = monthlyPercentage > 80;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 ${className}`}>
        <DollarSign size={14} className="text-emerald-400" />
        <span className="text-xs font-medium text-muted-foreground">
          ${todayCost.toFixed(2)} today
        </span>
        {isNearDailyLimit && (
          <AlertTriangle size={12} className="text-amber-400" />
        )}
      </div>
    );
  }

  return (
    <div className={`glass-card rounded-2xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Usage & Billing</h3>
            {lastRefresh && (
              <p className="text-[10px] text-muted-foreground">
                Updated {lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <button 
          onClick={loadData}
          disabled={isLoading}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={`text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading && !stats ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Cost Summary Cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Today's Cost */}
            <div className="glass-card rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={12} className="text-indigo-400" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Today</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold">${todayCost.toFixed(2)}</span>
                <span className="text-xs text-muted-foreground">/ ${dailyLimit}</span>
              </div>
              <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    isNearDailyLimit ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                  }`}
                  style={{ width: `${dailyPercentage}%` }}
                />
              </div>
              {isNearDailyLimit && (
                <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  {dailyPercentage >= 100 ? 'Limit reached' : 'Approaching limit'}
                </p>
              )}
            </div>

            {/* Monthly Cost */}
            <div className="glass-card rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <Target size={12} className="text-purple-400" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">This Month</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold">${monthCost.toFixed(2)}</span>
                <span className="text-xs text-muted-foreground">/ ${monthlyLimit}</span>
              </div>
              <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    isNearMonthlyLimit ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-purple-500 to-pink-500'
                  }`}
                  style={{ width: `${monthlyPercentage}%` }}
                />
              </div>
              {isNearMonthlyLimit && (
                <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  {monthlyPercentage >= 100 ? 'Limit reached' : 'Approaching limit'}
                </p>
              )}
            </div>
          </div>

          {/* Quick Stats Row */}
          <div className="flex items-center justify-between py-3 border-y border-white/5">
            <div className="text-center flex-1">
              <p className="text-lg font-bold">{stats?.totalRequests ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Requests</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center flex-1">
              <p className="text-lg font-bold">{((stats?.month?.tokens ?? 0) / 1000).toFixed(0)}K</p>
              <p className="text-[10px] text-muted-foreground">Tokens</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center flex-1">
              <p className="text-lg font-bold">${(stats?.avgCostPerRequest ?? 0).toFixed(3)}</p>
              <p className="text-[10px] text-muted-foreground">Avg/Request</p>
            </div>
          </div>

          {/* Expandable Model Breakdown */}
          {showDetails && stats?.modelBreakdown && stats.modelBreakdown.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="font-medium">Model Breakdown</span>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {isExpanded && (
                <div className="space-y-2 mt-2 animate-in slide-in-from-top-2 duration-200">
                  {stats.modelBreakdown.slice(0, 5).map((model: ModelUsageBreakdown) => (
                    <div key={model.modelId} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white/5">
                      <div className={`w-6 h-6 rounded-lg ${CATEGORY_COLORS[model.category]} bg-opacity-20 flex items-center justify-center`}>
                        {CATEGORY_ICONS[model.category]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{model.displayName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {model.requests} requests • {(model.totalTokens / 1000).toFixed(1)}K tokens
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">${model.cost.toFixed(3)}</p>
                      </div>
                    </div>
                  ))}

                  {stats.modelBreakdown.length > 5 && (
                    <p className="text-[10px] text-muted-foreground text-center py-1">
                      +{stats.modelBreakdown.length - 5} more models
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Mini version for sidebar/header
export function UsageMini() {
  const { user } = useAuth();
  const [todayCost, setTodayCost] = useState(0);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    if (!user?.id) return;
    
    const loadStats = async () => {
      const stats = UsageManager.getStats(user.id);
      const limits = UsageManager.getLimits(user.id);
      setTodayCost(stats.today.cost);
      setLimit(limits.dailyCostLimit);
    };

    loadStats();
    
    // Listen for usage updates
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const percentage = Math.min((todayCost / limit) * 100, 100);
  const isNearLimit = percentage > 80;

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-8 h-8">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-white/10"
          />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="url(#usage-gradient)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${percentage}, 100`}
          />
          <defs>
            <linearGradient id="usage-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={isNearLimit ? '#f59e0b' : '#6366f1'} />
              <stop offset="100%" stopColor={isNearLimit ? '#ef4444' : '#a855f7'} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <DollarSign size={12} className={isNearLimit ? 'text-amber-400' : 'text-indigo-400'} />
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-semibold">${todayCost.toFixed(2)}</span>
        <span className="text-[9px] text-muted-foreground">today</span>
      </div>
    </div>
  );
}

export default UsageTracker;
