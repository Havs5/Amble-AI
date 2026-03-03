/**
 * NewsFiltersBar — Department, Tag, and Search filters for the news feed
 */

'use client';

import React from 'react';
import { Search, X, Filter } from 'lucide-react';
import { NEWS_DEPARTMENTS, NEWS_TAGS } from '@/types/news';
import type { NewsFilters } from '@/hooks/useCompanyNews';

interface NewsFiltersBarProps {
  filters: NewsFilters;
  onChange: (filters: NewsFilters) => void;
  onReset: () => void;
}

export function NewsFiltersBar({ filters, onChange, onReset }: NewsFiltersBarProps) {
  const hasActive = filters.department || filters.tag || filters.search;

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search news..."
          className="w-full pl-8 pr-8 py-1.5 text-xs bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
        />
        {filters.search && (
          <button
            onClick={() => onChange({ ...filters, search: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Dropdowns row */}
      <div className="flex items-center gap-2">
        <Filter size={12} className="text-slate-400 shrink-0" />

        {/* Department */}
        <select
          value={filters.department}
          onChange={(e) => onChange({ ...filters, department: e.target.value })}
          className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-md text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        >
          <option value="">All Depts</option>
          {Object.entries(NEWS_DEPARTMENTS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {/* Tag */}
        <select
          value={filters.tag}
          onChange={(e) => onChange({ ...filters, tag: e.target.value })}
          className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-md text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        >
          <option value="">All Tags</option>
          {NEWS_TAGS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Reset */}
        {hasActive && (
          <button
            onClick={onReset}
            className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
