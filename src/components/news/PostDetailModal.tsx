/**
 * PostDetailModal — full-post reader shown as a centered popup.
 *
 * Replaces the old inline "expanded body below the card" behaviour: clicking
 * any post (hero / featured / list) opens this modal with the complete story.
 */

'use client';

import React from 'react';
import {
  X,
  AlertTriangle,
  Pin,
  User,
  Clock,
  Tag as TagIcon,
  ExternalLink,
  Building2,
  Pencil,
  Archive,
} from 'lucide-react';
import type { NewsPost } from '@/types/news';
import { NEWS_DEPARTMENTS } from '@/types/news';
import { departmentGradients, departmentBadgeColors } from './PostCard';

function formatDateLong(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

interface PostDetailModalProps {
  post: NewsPost;
  isAdmin?: boolean;
  onClose: () => void;
  onEdit?: (post: NewsPost) => void;
  onArchive?: (postId: string) => void;
  onTogglePin?: (postId: string, pinned: boolean) => void;
}

export function PostDetailModal({
  post,
  isAdmin,
  onClose,
  onEdit,
  onArchive,
  onTogglePin,
}: PostDetailModalProps) {
  const [imgError, setImgError] = React.useState(false);

  // Close on Escape
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dept = NEWS_DEPARTMENTS[post.departmentId] ?? post.departmentId;
  const gradient = departmentGradients[post.departmentId] ?? departmentGradients.general;
  const badgeColor = departmentBadgeColors[post.departmentId] ?? departmentBadgeColors.general;
  const hasImage = post.coverImage && !imgError;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
      style={{ animation: 'fade-in-up 0.15s ease-out both' }}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Banner (cover image or department gradient) ── */}
        <div className="relative h-44 sm:h-52 shrink-0">
          {hasImage ? (
            <img
              src={post.coverImage!}
              alt={post.title}
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`}>
              <div className="absolute inset-0 flex items-center justify-center">
                <Building2 size={44} className="text-white/25" />
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/30 text-white/80 hover:text-white hover:bg-black/50 backdrop-blur-sm transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          {/* Badges */}
          <div className="absolute bottom-3 left-4 right-4 flex flex-wrap items-center gap-2">
            <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-white ${badgeColor}`}>
              {dept}
            </span>
            {post.priority === 'CRITICAL' && (
              <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-white bg-red-500 flex items-center gap-1">
                <AlertTriangle size={11} /> Critical
              </span>
            )}
            {post.pinned && (
              <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-white bg-amber-500 flex items-center gap-1">
                <Pin size={11} /> Pinned
              </span>
            )}
          </div>
        </div>

        {/* ── Body (scrollable) ── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 sm:p-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-tight">
            {post.title}
            {post.link && (
              <a
                href={post.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center ml-2 text-indigo-500 hover:text-indigo-600 align-middle"
              >
                <ExternalLink size={18} />
              </a>
            )}
          </h2>

          {/* Author + date */}
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><User size={12} /> {post.authorName}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {formatDateLong(post.publishedAt)}</span>
          </div>

          {post.summary && (
            <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
              {post.summary}
            </p>
          )}

          {/* Full body */}
          <div className="mt-4 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
            {post.body}
          </div>

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-5 pt-4 border-t border-slate-200 dark:border-slate-700/50">
              {post.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 dark:text-indigo-400"
                >
                  <TagIcon size={9} /> {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Admin actions footer ── */}
        {isAdmin && (
          <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/40">
            <button
              onClick={() => { onTogglePin?.(post.id, post.pinned); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Pin size={13} /> {post.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              onClick={() => { onArchive?.(post.id); onClose(); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Archive size={13} /> Archive
            </button>
            <button
              onClick={() => { onEdit?.(post); onClose(); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
            >
              <Pencil size={13} /> Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
