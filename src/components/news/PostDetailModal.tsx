/**
 * PostDetailModal — full-post reader shown as a medium card centered within the
 * RIGHT panel (the overlay clears the 68px icon sidebar, so the card sits in the
 * middle of the content area, not the whole viewport). Opened by clicking a post.
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
  ZoomIn,
} from 'lucide-react';
import type { NewsPost } from '@/types/news';
import { NEWS_DEPARTMENTS } from '@/types/news';
import { departmentGradients, ReactionsBar, deptColor } from './PostCard';

function formatDateLong(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
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
  post, isAdmin, onClose, onEdit, onArchive, onTogglePin,
}: PostDetailModalProps) {
  const [imgError, setImgError] = React.useState(false);
  const [zoomed, setZoomed] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (zoomed) setZoomed(false);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, zoomed]);

  const dept = NEWS_DEPARTMENTS[post.departmentId] ?? post.departmentId;
  const gradient = departmentGradients[post.departmentId] ?? departmentGradients.general;
  const accent = deptColor(post.departmentId);
  const hasImage = post.coverImage && !imgError;

  return (
    <>
      {/* Overlay covers the RIGHT panel (clears the 68px sidebar) and centers the card. */}
      <div
        className="fixed inset-y-0 right-0 left-0 lg:left-[68px] z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6"
        onClick={onClose}
        style={{ animation: 'fade-in-up 0.15s ease-out both' }}
      >
        <div
          className="w-full max-w-2xl max-h-[86vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Banner ── */}
          <div className="relative h-40 sm:h-44 shrink-0">
            {hasImage ? (
              <>
                <img
                  src={post.coverImage!}
                  alt={post.title}
                  className="absolute inset-0 w-full h-full object-cover cursor-zoom-in"
                  onClick={(e) => { e.stopPropagation(); setZoomed(true); }}
                  onError={() => setImgError(true)}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); setZoomed(true); }}
                  className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/35 text-white/90 hover:text-white hover:bg-black/55 backdrop-blur-sm text-[11px] font-medium transition-colors"
                  title="Zoom image"
                >
                  <ZoomIn size={13} /> Zoom
                </button>
              </>
            ) : (
              <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Building2 size={44} className="text-white/25" />
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />

            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/30 text-white/80 hover:text-white hover:bg-black/50 backdrop-blur-sm transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div className="absolute bottom-3 left-4 right-4 flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: accent }}>
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
                <a href={post.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center ml-2 text-indigo-500 hover:text-indigo-600 align-middle">
                  <ExternalLink size={18} />
                </a>
              )}
            </h2>

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

            <div className="mt-4 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {post.body}
            </div>

            {post.reactions && Object.values(post.reactions).some((n) => (n || 0) > 0) && (
              <div className="mt-5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Acknowledgements</div>
                <ReactionsBar reactions={post.reactions} />
              </div>
            )}

            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-5 pt-4 border-t border-slate-200 dark:border-slate-700/50">
                {post.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 dark:text-indigo-400">
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
                onClick={() => onTogglePin?.(post.id, post.pinned)}
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

      {/* ── Image lightbox (zoom) ── */}
      {zoomed && hasImage && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 p-4 cursor-zoom-out"
          onClick={() => setZoomed(false)}
          style={{ animation: 'fade-in-up 0.12s ease-out both' }}
        >
          <img
            src={post.coverImage!}
            alt={post.title}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setZoomed(false)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close zoom"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}
