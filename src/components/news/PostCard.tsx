/**
 * PostCard — Single news post card used in pinned section & feed
 */

'use client';

import React from 'react';
import {
  Pin,
  AlertTriangle,
  ExternalLink,
  Clock,
  Tag,
  Building2,
  User,
  MoreHorizontal,
  Archive,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { NewsPost } from '@/types/news';
import { NEWS_DEPARTMENTS } from '@/types/news';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(date: Date | null): string {
  if (!date) return '';
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const priorityStyles: Record<string, string> = {
  CRITICAL: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40',
  NORMAL: 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/50',
  FYI: 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/40',
};

const priorityBadge: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: 'Critical', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  NORMAL: { label: 'Normal', className: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300' },
  FYI: { label: 'FYI', className: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' },
};

// ─── Component ───────────────────────────────────────────────────────────────

interface PostCardProps {
  post: NewsPost;
  compact?: boolean;
  isAdmin?: boolean;
  onEdit?: (post: NewsPost) => void;
  onArchive?: (postId: string) => void;
  onTogglePin?: (postId: string, pinned: boolean) => void;
}

export function PostCard({ post, compact, isAdmin, onEdit, onArchive, onTogglePin }: PostCardProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu on outside click
  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const badge = priorityBadge[post.priority] ?? priorityBadge.NORMAL;
  const dept = NEWS_DEPARTMENTS[post.departmentId] ?? post.departmentId;

  return (
    <div
      className={`relative rounded-xl border p-4 transition-all duration-200 hover:shadow-md group ${priorityStyles[post.priority] ?? priorityStyles.NORMAL}`}
    >
      {/* Top row: badges + admin menu */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Priority badge */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${badge.className}`}>
            {post.priority === 'CRITICAL' && <AlertTriangle size={10} />}
            {badge.label}
          </span>

          {/* Pinned */}
          {post.pinned && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
              <Pin size={10} /> Pinned
            </span>
          )}

          {/* Department */}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400">
            <Building2 size={10} />
            {dept}
          </span>
        </div>

        {/* Admin context menu */}
        {isAdmin && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal size={16} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-8 z-50 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 text-sm">
                <button
                  onClick={() => { setMenuOpen(false); onEdit?.(post); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-left"
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onTogglePin?.(post.id, post.pinned); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-left"
                >
                  <Pin size={14} /> {post.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onArchive?.(post.id); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
                >
                  <Archive size={14} /> Archive
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug mb-1 line-clamp-2">
        {post.title}
        {post.link && (
          <a href={post.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center ml-1 text-indigo-500 hover:text-indigo-600">
            <ExternalLink size={12} />
          </a>
        )}
      </h3>

      {/* Summary / preview */}
      {!compact && (
        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2 leading-relaxed">
          {post.summary || post.body.slice(0, 160)}
        </p>
      )}

      {/* Tags */}
      {post.tags.length > 0 && !compact && (
        <div className="flex flex-wrap gap-1 mb-2">
          {post.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 dark:text-indigo-400"
            >
              <Tag size={8} /> {t}
            </span>
          ))}
        </div>
      )}

      {/* Footer: author + time */}
      <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
        <span className="flex items-center gap-1">
          <User size={10} /> {post.authorName}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={10} /> {timeAgo(post.publishedAt)}
        </span>
      </div>
    </div>
  );
}
