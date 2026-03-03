'use client';

import React from 'react';
import {
  MessageCircle,
  FileText,
  Database,
  Pill,
  Video,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Clock,
  Zap,
  Brain,
  Activity,
} from 'lucide-react';
import { CompanyNewsPanel } from '../news/CompanyNewsPanel';

interface DashboardViewProps {
  userName: string;
  onNavigate: (view: string) => void;
  recentChats?: Array<{ id: string; title: string; updatedAt: string }>;
  permissions: {
    accessAmble: boolean;
    accessBilling: boolean;
    accessPharmacy: boolean;
    accessStudio: boolean;
    accessKnowledge: boolean;
  };
  stats?: {
    totalChats: number;
    totalTokens: number;
    billingCases: number;
    kbDocuments: number;
  };
  // User info for Company News panel
  user?: {
    id: string;
    name: string;
    role: 'admin' | 'user' | 'superadmin';
    departmentId?: string;
  };
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const quickActions = [
  {
    key: 'amble',
    label: 'Ask Amble AI',
    description: 'Start a new AI-powered conversation',
    icon: MessageCircle,
    gradient: 'from-indigo-500 to-purple-600',
    shadow: 'shadow-indigo-500/20',
  },
  {
    key: 'billing',
    label: 'Billing CX',
    description: 'Draft patient billing responses',
    icon: FileText,
    gradient: 'from-emerald-500 to-teal-600',
    shadow: 'shadow-emerald-500/20',
  },
  {
    key: 'knowledge',
    label: 'Knowledge Base',
    description: 'Browse and sync documentation',
    icon: Database,
    gradient: 'from-blue-500 to-cyan-600',
    shadow: 'shadow-blue-500/20',
  },
  {
    key: 'pharmacies',
    label: 'Pharmacies',
    description: 'Access Revive & Align systems',
    icon: Pill,
    gradient: 'from-pink-500 to-rose-600',
    shadow: 'shadow-pink-500/20',
  },
  {
    key: 'veo',
    label: 'Media Studio',
    description: 'Generate images & videos with AI',
    icon: Video,
    gradient: 'from-amber-500 to-orange-600',
    shadow: 'shadow-amber-500/20',
  },
];

export function DashboardView({
  userName,
  onNavigate,
  recentChats = [],
  permissions,
  stats,
  user,
}: DashboardViewProps) {
  const greeting = getGreeting();
  const firstName = userName.split(' ')[0];

  const visibleActions = quickActions.filter((action) => {
    switch (action.key) {
      case 'amble': return permissions.accessAmble;
      case 'billing': return permissions.accessBilling;
      case 'knowledge': return permissions.accessKnowledge;
      case 'pharmacies': return permissions.accessPharmacy;
      case 'veo': return permissions.accessStudio;
      default: return true;
    }
  });

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex gap-6 lg:gap-8">
          {/* LEFT: Main dashboard content */}
          <div className="flex-1 min-w-0">
        {/* Hero greeting */}
        <div className="mb-10" style={{ animation: 'entrance-stagger 0.5s ease-out both' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Online</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
            {greeting}, <span className="gradient-text">{firstName}</span>
          </h1>
          <p className="mt-2 text-base text-slate-500 dark:text-slate-400 max-w-xl">
            Your AI-powered healthcare workspace is ready. What would you like to work on today?
          </p>
        </div>

        {/* Quick stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-10" style={{ animation: 'entrance-stagger 0.6s ease-out both' }}>
            <StatCard
              label="Conversations"
              value={stats.totalChats}
              icon={MessageCircle}
              trend="+12%"
              trendUp
            />
            <StatCard
              label="Tokens Used"
              value={formatTokenCount(stats.totalTokens)}
              icon={Zap}
              trend="This month"
            />
            <StatCard
              label="Billing Cases"
              value={stats.billingCases}
              icon={FileText}
              trend="+3 today"
              trendUp
            />
            <StatCard
              label="KB Documents"
              value={stats.kbDocuments}
              icon={Database}
              trend="Synced"
            />
          </div>
        )}

        {/* Quick actions grid */}
        <div className="mb-10" style={{ animation: 'entrance-stagger 0.7s ease-out both' }}>
          <h2 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Sparkles size={14} />
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleActions.map((action) => (
              <button
                key={action.key}
                onClick={() => onNavigate(action.key)}
                className={`group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${action.shadow}`}
              >
                {/* Gradient accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${action.gradient} opacity-70 group-hover:opacity-100 transition-opacity`} />
                
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-lg ${action.shadow}`}>
                    <action.icon size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {action.label}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      {action.description}
                    </p>
                  </div>
                  <ArrowRight size={16} className="shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all mt-1" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div style={{ animation: 'entrance-stagger 0.8s ease-out both' }}>
          <h2 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Clock size={14} />
            Recent Activity
          </h2>
          
          {recentChats.length > 0 ? (
            <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-2xl divide-y divide-slate-100 dark:divide-slate-700/50 overflow-hidden">
              {recentChats.slice(0, 6).map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => onNavigate('amble')}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors text-left group"
                >
                  <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40 transition-colors">
                    <Brain size={16} className="text-indigo-500 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {chat.title || 'Untitled Chat'}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {formatRelativeTime(chat.updatedAt)}
                    </p>
                  </div>
                  <ArrowRight size={14} className="shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-8 text-center">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Activity size={20} className="text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No recent activity</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Start a conversation to see your history here</p>
              <button
                onClick={() => onNavigate('amble')}
                className="mt-4 px-4 py-2 text-sm font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
              >
                Start chatting
              </button>
            </div>
          )}
        </div>

        {/* AI capabilities showcase */}
        <div className="mt-10 mb-6" style={{ animation: 'entrance-stagger 0.9s ease-out both' }}>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 p-6 sm:p-8 text-white">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
            </div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={18} className="text-amber-300" />
                <span className="text-xs font-bold uppercase tracking-widest text-white/70">AI Capabilities</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-2">
                Powered by GPT-5 & Gemini 3
              </h3>
              <p className="text-sm text-white/80 max-w-lg mb-5">
                Multi-model AI with deep reasoning, web search, code generation, image analysis, and 
                healthcare-specific knowledge base integration.
              </p>
              <div className="flex flex-wrap gap-2">
                {['Deep Reasoning', 'Web Search', 'Code Gen', 'Image Analysis', 'Voice Dictation', 'RAG'].map((cap) => (
                  <span key={cap} className="px-3 py-1 text-xs font-semibold bg-white/20 backdrop-blur-sm rounded-full border border-white/20">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
          </div>{/* end left column */}

          {/* RIGHT: Company News Panel */}
          {user && (
            <div className="hidden lg:block w-[340px] xl:w-[380px] shrink-0">
              <div className="sticky top-0 h-[calc(100vh-8rem)] bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden flex flex-col shadow-sm">
                <CompanyNewsPanel
                  userId={user.id}
                  userRole={user.role}
                  userName={user.name}
                  userDepartmentId={user.departmentId}
                />
              </div>
            </div>
          )}
        </div>{/* end flex row */}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------- 
// Sub-components
// --------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendUp,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <div className="stat-card group hover:-translate-y-0.5 transition-transform duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 transition-colors">
          <Icon size={16} className="text-slate-500 dark:text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
        </div>
        {trend && (
          <span className={`kpi-indicator ${trendUp ? 'kpi-up' : 'kpi-neutral'}`}>
            {trendUp && <TrendingUp size={12} />}
            {trend}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
        {value}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
        {label}
      </div>
    </div>
  );
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}
