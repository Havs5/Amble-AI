/**
 * CompanyNewsPanel — Magazine-style company news layout
 *
 * Layout:
 *  1) Clean toolbar with search, filters, + New Post button
 *  2) Hero section for featured/critical post (full-width image card)
 *  3) Pinned stories row (image cards in grid)
 *  4) Latest updates feed (list items with thumbnails)
 *  5) PostEditor as slide-in right panel
 *
 * Uses useCompanyNews hook for real-time Firestore data.
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  Newspaper,
  AlertTriangle,
  Clock,
  Loader2,
  Sparkles,
  Plus,
  Filter,
  Tag as TagIcon,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  X,
  FileText,
  Send,
  Archive,
} from 'lucide-react';
import { useCompanyNews } from '@/hooks/useCompanyNews';
import type { NewsPost } from '@/types/news';
import { NEWS_DEPARTMENTS } from '@/types/news';
import { PostCard } from './PostCard';
import { NewsFiltersBar } from './NewsFiltersBar';
import { PostEditor } from './PostEditor';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lastUpdatedLabel(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDayKey(date: Date | null): string {
  if (!date) return 'unknown';
  return date.toISOString().slice(0, 10);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CompanyNewsPanelProps {
  userId: string;
  userRole: 'admin' | 'user' | 'superadmin';
  userName: string;
  userDepartmentId?: string;
}

export function CompanyNewsPanel({
  userId,
  userRole,
  userName,
  userDepartmentId,
}: CompanyNewsPanelProps) {
  const news = useCompanyNews({ userId, userRole, userName, userDepartmentId });

  // Editor panel state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<NewsPost | null>(null);

  // Expanded post state (for reading full body)
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  // Filter bar visibility
  const [showFilters, setShowFilters] = useState(false);

  // Drafts section visibility (admin only)
  const [showDrafts, setShowDrafts] = useState(true);

  // Feed display limit
  const [feedLimit, setFeedLimit] = useState(12);

  const handleOpenEditor = useCallback((post?: NewsPost) => {
    setEditingPost(post ?? null);
    setEditorOpen(true);
  }, []);

  const handleSavePost = useCallback(
    async (data: Partial<NewsPost>) => {
      if (data.id) {
        await news.updatePost(data.id, data);
      } else {
        return await news.createPost(data);
      }
    },
    [news],
  );

  const handlePublishPost = useCallback(
    async (postId: string) => {
      await news.publishPost(postId);
    },
    [news],
  );

  const handleExpandToggle = useCallback((postId: string) => {
    setExpandedPostId((prev) => (prev === postId ? null : postId));
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────

  // Sorted: critical → pinned → newest
  const sortedPosts = useMemo(() => {
    return [...news.allPosts].sort((a, b) => {
      if (a.priority === 'CRITICAL' && b.priority !== 'CRITICAL') return -1;
      if (a.priority !== 'CRITICAL' && b.priority === 'CRITICAL') return 1;
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const da = a.publishedAt?.getTime() ?? 0;
      const db = b.publishedAt?.getTime() ?? 0;
      return db - da;
    });
  }, [news.allPosts]);

  // Top 3 featured posts (banner row)
  const topPosts = useMemo(() => sortedPosts.slice(0, 3), [sortedPosts]);

  // Everything else goes into the grid below
  const allRemainingPosts = useMemo(() => {
    const topIds = new Set(topPosts.map((p) => p.id));
    return sortedPosts.filter((p) => !topIds.has(p.id));
  }, [sortedPosts, topPosts]);

  const visibleFeed = allRemainingPosts.slice(0, feedLimit);
  const hasMore = allRemainingPosts.length > feedLimit;

  // Quick stats for admin
  const draftCount = news.drafts.filter((d) => d.status === 'DRAFT').length;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (news.loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2
            size={28}
            className="animate-spin text-indigo-500 mx-auto mb-3"
          />
          <p className="text-sm text-slate-400 font-medium">Loading news...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ─── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="flex items-center gap-2.5 text-base font-semibold text-slate-800 dark:text-white">
            <Newspaper size={18} className="text-indigo-500" />
            Company News
          </h2>
          <span className="hidden sm:flex items-center gap-1 text-xs text-slate-400">
            <Clock size={11} />
            {lastUpdatedLabel(news.lastUpdated)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              showFilters
                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400'
            }`}
          >
            <Filter size={13} />
            <span className="hidden sm:inline">Filters</span>
          </button>

          {/* New Post (admin only) */}
          {news.isAdmin && (
            <button
              onClick={() => handleOpenEditor()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors relative"
            >
              <Plus size={14} /> New Post
              {draftCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {draftCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ─── Main content: News (left) + Editor sidebar (right) ──────────── */}
      <div className="flex-1 flex min-h-0">
        {/* ─── News Feed (center / left) ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin min-w-0">
          <div className="px-5 sm:px-6 pb-16 space-y-6">

          {/* Filters (collapsible) */}
          {showFilters && (
            <div style={{ animation: 'fade-in-up 0.2s ease-out both' }}>
              <NewsFiltersBar
                filters={news.filters}
                onChange={news.setFilters}
                onReset={news.resetFilters}
              />
            </div>
          )}

          {/* ─── Top Stories Banner (up to 3) ────────────────────────────── */}
          {topPosts.length > 0 && (
            <div>
              {topPosts.length === 1 ? (
                /* Single post — full-width hero */
                <PostCard
                  post={topPosts[0]}
                  variant="hero"
                  isAdmin={news.isAdmin}
                  onEdit={(p) => handleOpenEditor(p)}
                  onArchive={news.archivePost}
                  onTogglePin={news.togglePin}
                  onExpand={handleExpandToggle}
                />
              ) : topPosts.length === 2 ? (
                /* Two posts — equal split */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {topPosts.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      variant="featured"
                      isAdmin={news.isAdmin}
                      onEdit={() => handleOpenEditor(p)}
                      onArchive={news.archivePost}
                      onTogglePin={news.togglePin}
                      onExpand={handleExpandToggle}
                    />
                  ))}
                </div>
              ) : (
                /* Three posts — large left + two stacked right */
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                  {/* Main feature (takes 3/5 width) */}
                  <div className="lg:col-span-3">
                    <PostCard
                      post={topPosts[0]}
                      variant="hero"
                      isAdmin={news.isAdmin}
                      onEdit={(p) => handleOpenEditor(p)}
                      onArchive={news.archivePost}
                      onTogglePin={news.togglePin}
                      onExpand={handleExpandToggle}
                    />
                  </div>
                  {/* Two stacked cards on the right (2/5 width) */}
                  <div className="lg:col-span-2 flex flex-col gap-3">
                    {topPosts.slice(1, 3).map((p) => (
                      <div key={p.id} className="flex-1 flex flex-col [&>*]:flex-1">
                        <PostCard
                          post={p}
                          variant="featured"
                          isAdmin={news.isAdmin}
                          onEdit={() => handleOpenEditor(p)}
                          onArchive={news.archivePost}
                          onTogglePin={news.togglePin}
                          onExpand={handleExpandToggle}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Expanded body for any top post */}
              {topPosts.map((tp) =>
                expandedPostId === tp.id ? (
                  <div
                    key={`exp-${tp.id}`}
                    className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/40 p-5 sm:p-6"
                    style={{ animation: 'fade-in-up 0.2s ease-out both' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{tp.title}</h3>
                      <button
                        onClick={() => setExpandedPostId(null)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {tp.body}
                    </div>
                    {tp.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/50">
                        {tp.tags.map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 dark:text-indigo-400">
                            <TagIcon size={9} /> {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null,
              )}
            </div>
          )}

          {/* ─── All Posts Grid ──────────────────────────────────────── */}
          {visibleFeed.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
                  <TrendingUp size={14} className="text-indigo-500" />
                  Latest Updates
                </h3>
                <span className="text-xs text-slate-400">
                  {allRemainingPosts.length} {allRemainingPosts.length === 1 ? 'post' : 'posts'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {visibleFeed.map((p) => (
                  <div key={p.id}>
                    <PostCard
                      post={p}
                      variant="list"
                      isAdmin={news.isAdmin}
                      onEdit={() => handleOpenEditor(p)}
                      onArchive={news.archivePost}
                      onTogglePin={news.togglePin}
                      onExpand={handleExpandToggle}
                    />

                    {/* Expanded body */}
                    {expandedPostId === p.id && (
                      <div
                        className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/40 p-4"
                        style={{ animation: 'fade-in-up 0.15s ease-out both' }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Full Post</span>
                          <button
                            onClick={() => setExpandedPostId(null)}
                            className="p-0.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {p.body}
                        </div>
                        {p.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-slate-200 dark:border-slate-700/50">
                            {p.tags.map((t) => (
                              <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 dark:text-indigo-400">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Empty State ─────────────────────────────────────────────── */}
          {topPosts.length === 0 && allRemainingPosts.length === 0 && (
            <div
              className="text-center py-20"
              style={{ animation: 'fade-in-up 0.4s ease-out both' }}
            >
              <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Newspaper
                  size={40}
                  className="text-indigo-400 dark:text-indigo-500"
                />
              </div>
              <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">
                No news yet
              </h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 max-w-md mx-auto leading-relaxed">
                {news.isAdmin
                  ? 'Create your first company news post. Add a cover image to make it stand out!'
                  : 'Company news and announcements will appear here. Check back soon!'}
              </p>
              {news.isAdmin && (
                <button
                  onClick={() => handleOpenEditor()}
                  className="mt-8 inline-flex items-center gap-2 px-8 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg hover:shadow-xl transition-all"
                >
                  <Sparkles size={16} />
                  Create the first post
                </button>
              )}
            </div>
          )}

          {/* Load more */}
          {hasMore && (
            <div className="text-center pt-2">
              <button
                onClick={() => setFeedLimit((l) => l + 12)}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-xl transition-colors"
              >
                Load more ({allRemainingPosts.length - feedLimit} remaining)
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* ─── Drafts & Archived Section (Admin Only) ─────────────────── */}
          {news.isAdmin && news.drafts.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700/50">
              <button
                onClick={() => setShowDrafts((v) => !v)}
                className="flex items-center gap-2 w-full text-left group"
              >
                <ChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform ${showDrafts ? '' : '-rotate-90'}`}
                />
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 group-hover:text-slate-800 dark:group-hover:text-white transition-colors">
                  <FileText size={14} className="text-amber-500" />
                  Drafts & Archived
                </h3>
                <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                  {news.drafts.length}
                </span>
              </button>

              {showDrafts && (
                <div className="mt-3 space-y-2">
                  {news.drafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      {/* Status badge */}
                      <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        draft.status === 'DRAFT'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}>
                        {draft.status === 'DRAFT' ? <FileText size={10} /> : <Archive size={10} />}
                        {draft.status}
                      </span>

                      {/* Title & meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                          {draft.title || 'Untitled'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {draft.updatedAt
                            ? `Updated ${lastUpdatedLabel(draft.updatedAt)}`
                            : draft.createdAt
                            ? `Created ${lastUpdatedLabel(draft.createdAt)}`
                            : ''}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleOpenEditor(draft)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                          title="Edit"
                        >
                          <FileText size={14} />
                        </button>
                        {draft.status === 'DRAFT' && (
                          <button
                            onClick={() => news.publishPost(draft.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                            title="Publish now"
                          >
                            <Send size={10} />
                            Publish
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {news.error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {news.error}
            </div>
          )}
        </div>
        </div>
        {/* ── End of News Feed column ── */}

        {/* ─── Editor Sidebar (right, admin only) ────────────────────────── */}
        {editorOpen && news.isAdmin && (
          <div className="w-[380px] xl:w-[420px] shrink-0 border-l border-slate-200 dark:border-slate-700/50 overflow-y-auto scrollbar-thin">
            <PostEditor
              post={editingPost}
              authorId={userId}
              authorName={userName}
              onSave={handleSavePost}
              onPublish={handlePublishPost}
              onClose={() => {
                setEditorOpen(false);
                setEditingPost(null);
              }}
              saving={news.saving}
            />
          </div>
        )}
      </div>
      {/* ── End of main flex row ── */}
    </div>
  );
}
