'use client';

import React from 'react';
import { Newspaper } from 'lucide-react';
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

export function DashboardView({
  userName,
  user,
}: DashboardViewProps) {
  const greeting = getGreeting();
  const firstName = userName.split(' ')[0];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero greeting */}
        <div className="mb-8" style={{ animation: 'entrance-stagger 0.5s ease-out both' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Online</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
            {greeting}, <span className="gradient-text">{firstName}</span>
          </h1>
          <p className="mt-2 text-base text-slate-500 dark:text-slate-400 max-w-xl">
            Stay up to date with the latest company news and announcements.
          </p>
        </div>

        {/* Company News — Full-width main content */}
        {user ? (
          <div
            className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm flex flex-col"
            style={{
              animation: 'entrance-stagger 0.6s ease-out both',
              minHeight: 'calc(100vh - 16rem)',
            }}
          >
            <CompanyNewsPanel
              userId={user.id}
              userRole={user.role}
              userName={user.name}
              userDepartmentId={user.departmentId}
            />
          </div>
        ) : (
          <div
            className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-12 text-center"
            style={{ animation: 'entrance-stagger 0.6s ease-out both' }}
          >
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Newspaper size={24} className="text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Sign in to view company news
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
