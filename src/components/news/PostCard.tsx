/**
 * PostCard — Magazine-style news post card with variant layouts
 *
 * Variants:
 *  - hero: Full-width with large cover image & overlay text
 *  - featured: Medium card with image on top, text below
 *  - list: Horizontal layout with small thumbnail left, text right
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
  TrendingUp,
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

function formatDateShort(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Department-themed gradient for posts without a cover image */
const departmentGradients: Record<string, string> = {
  general: 'from-indigo-500 to-purple-600',
  engineering: 'from-blue-500 to-cyan-600',
  operations: 'from-emerald-500 to-teal-600',
  clinical: 'from-rose-500 to-pink-600',
  billing: 'from-amber-500 to-orange-600',
  hr: 'from-violet-500 to-purple-600',
  marketing: 'from-fuchsia-500 to-pink-600',
  leadership: 'from-slate-600 to-gray-700',
};

const departmentBadgeColors: Record<string, string> = {
  general: 'bg-indigo-500',
  engineering: 'bg-blue-500',
  operations: 'bg-emerald-500',
  clinical: 'bg-rose-500',
  billing: 'bg-amber-500',
  hr: 'bg-violet-500',
  marketing: 'bg-fuchsia-500',
  leadership: 'bg-slate-600',
};

// ─── Component ───────────────────────────────────────────────────────────────

type PostCardVariant = 'hero' | 'featured' | 'list';

interface PostCardProps {
  post: NewsPost;
  variant?: PostCardVariant;
  compact?: boolean;
  isAdmin?: boolean;
  onEdit?: (post: NewsPost) => void;
  onArchive?: (postId: string) => void;
  onTogglePin?: (postId: string, pinned: boolean) => void;
  onExpand?: (postId: string) => void;
}

export function PostCard({
  post,
  variant = 'list',
  compact,
  isAdmin,
  onEdit,
  onArchive,
  onTogglePin,
  onExpand,
}: PostCardProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [imgError, setImgError] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const dept = NEWS_DEPARTMENTS[post.departmentId] ?? post.departmentId;
  const gradient = departmentGradients[post.departmentId] ?? departmentGradients.general;
  const badgeColor = departmentBadgeColors[post.departmentId] ?? departmentBadgeColors.general;
  const hasImage = post.coverImage && !imgError;

  // ─── Admin context menu (shared across variants) ──────────────────────
  const adminMenu = isAdmin ? (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
        className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-all opacity-0 group-hover:opacity-100"
      >
        <MoreHorizontal size={16} />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-8 z-50 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl py-1.5 text-sm" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setMenuOpen(false); onEdit?.(post); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-left text-slate-700 dark:text-slate-200">
            <Pencil size={14} /> Edit
          </button>
          <button onClick={() => { setMenuOpen(false); onTogglePin?.(post.id, post.pinned); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-left text-slate-700 dark:text-slate-200">
            <Pin size={14} /> {post.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button onClick={() => { setMenuOpen(false); onArchive?.(post.id); }} className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-left">
            <Archive size={14} /> Archive
          </button>
        </div>
      )}
    </div>
  ) : null;

  // ─── HERO VARIANT ─────────────────────────────────────────────────────
  if (variant === 'hero') {
    return (
      <div
        className="relative rounded-2xl overflow-hidden group cursor-pointer h-full"
        onClick={() => onExpand?.(post.id)}
        style={{ animation: 'fade-in-up 0.3s ease-out both' }}
      >
        {/* Image / gradient background */}
        <div className="relative h-full min-h-[200px]">
          {hasImage ? (
            <img
              src={post.coverImage!}
              alt={post.title}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
            </div>
          )}

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          {/* Admin menu (top right) */}
          {isAdmin && (
            <div className="absolute top-4 right-4 z-10">
              {adminMenu}
            </div>
          )}

          {/* Content overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
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

            {/* Title */}
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white leading-tight mb-2 line-clamp-2">
              {post.title}
              {post.link && (
                <a href={post.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center ml-2 text-white/70 hover:text-white transition-colors">
                  <ExternalLink size={18} />
                </a>
              )}
            </h2>

            {/* Summary */}
            <p className="text-sm sm:text-base text-white/80 leading-relaxed line-clamp-2 max-w-2xl mb-4">
              {post.summary || post.body.slice(0, 200)}
            </p>

            {/* Author & date */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <User size={14} className="text-white" />
              </div>
              <div>
                <span className="text-sm font-medium text-white">{post.authorName}</span>
                <span className="text-white/50 mx-2">·</span>
                <span className="text-sm text-white/60">{formatDateShort(post.publishedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── FEATURED VARIANT ─────────────────────────────────────────────────
  if (variant === 'featured') {
    return (
      <div
        className="group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/60 hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col h-full"
        onClick={() => onExpand?.(post.id)}
        style={{ animation: 'fade-in-up 0.3s ease-out both' }}
      >
        {/* Image */}
        <div className="relative flex-1 min-h-[100px] overflow-hidden">
          {hasImage ? (
            <img
              src={post.coverImage!}
              alt={post.title}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-90`}>
              <div className="absolute inset-0 flex items-center justify-center">
                <Building2 size={32} className="text-white/30" />
              </div>
            </div>
          )}

          {/* Department badge overlay */}
          <div className="absolute top-3 left-3">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-white ${badgeColor}`}>
              {dept}
            </span>
          </div>

          {/* Admin menu */}
          {isAdmin && (
            <div className="absolute top-2 right-2 z-10">
              {adminMenu}
            </div>
          )}

          {/* Priority indicator */}
          {post.priority === 'CRITICAL' && (
            <div className="absolute top-3 right-3">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 block animate-pulse" />
            </div>
          )}
        </div>

        {/* Text content */}
        <div className="shrink-0 p-3">
          {/* Priority / Pinned badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {post.priority === 'CRITICAL' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-white bg-red-500">
                <AlertTriangle size={9} /> Critical
              </span>
            )}
            {post.pinned && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-white bg-amber-500">
                <Pin size={9} /> Pinned
              </span>
            )}
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug mb-1 line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {post.title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-2">
            {post.summary || post.body.slice(0, 120)}
          </p>

          {/* Footer */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <User size={10} /> {post.authorName}
            </span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="flex items-center gap-1">
              <Clock size={10} /> {timeAgo(post.publishedAt)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ─── LIST VARIANT (default) ───────────────────────────────────────────
  return (
    <div
      className="group flex gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-700/40 bg-white dark:bg-slate-800/40 hover:border-slate-200 dark:hover:border-slate-600/50 hover:shadow-md transition-all duration-200 cursor-pointer"
      onClick={() => onExpand?.(post.id)}
      style={{ animation: 'fade-in-up 0.2s ease-out both' }}
    >
      {/* Thumbnail */}
      <div className="shrink-0 w-28 h-20 sm:w-36 sm:h-24 rounded-lg overflow-hidden relative">
        {hasImage ? (
          <img
            src={post.coverImage!}
            alt={post.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-85`}>
            <div className="absolute inset-0 flex items-center justify-center">
              <Building2 size={20} className="text-white/40" />
            </div>
          </div>
        )}
        {/* Department badge on image */}
        <div className="absolute bottom-1.5 left-1.5">
          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider text-white ${badgeColor}`}>
            {dept}
          </span>
        </div>
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          {/* Top row: badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            {post.priority === 'CRITICAL' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                <AlertTriangle size={9} /> Critical
              </span>
            )}
            {post.pinned && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
                <Pin size={9} /> Pinned
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug mb-1 line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {post.title}
            {post.link && (
              <a href={post.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center ml-1 text-indigo-400 hover:text-indigo-500">
                <ExternalLink size={11} />
              </a>
            )}
          </h3>

          {/* Summary */}
          {!compact && (
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-1.5">
              {post.summary || post.body.slice(0, 140)}
            </p>
          )}
        </div>

        {/* Footer: author + time + tags */}
        <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1">
            <User size={10} /> {post.authorName}
          </span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className="flex items-center gap-1">
            <Clock size={10} /> {timeAgo(post.publishedAt)}
          </span>
          {post.tags.length > 0 && !compact && (
            <>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              {post.tags.slice(0, 2).map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 dark:text-indigo-400">
                  {t}
                </span>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Right: Admin menu */}
      {isAdmin && (
        <div className="shrink-0 self-start">
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 opacity-0 group-hover:opacity-100 transition-all"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-50 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl py-1.5 text-sm" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setMenuOpen(false); onEdit?.(post); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-left text-slate-700 dark:text-slate-200">
                  <Pencil size={14} /> Edit
                </button>
                <button onClick={() => { setMenuOpen(false); onTogglePin?.(post.id, post.pinned); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-left text-slate-700 dark:text-slate-200">
                  <Pin size={14} /> {post.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button onClick={() => { setMenuOpen(false); onArchive?.(post.id); }} className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-left">
                  <Archive size={14} /> Archive
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
