/**
 * CompanyNewsPanel — Main dashboard content showing company news
 *
 * Layout:
 *  1) Header with title + admin tools
 *  2) Critical banner (if any CRITICAL post is active)
 *  3) Filters bar
 *  4) Pinned posts section (up to 3, grid layout)
 *  5) Latest feed (responsive grid, "Load more" pagination)
 *
 * Uses useCompanyNews hook for real-time Firestore data.
 */

'use client';

import React, { useState, useCallback } from 'react';
import {
  Newspaper,
  AlertTriangle,
  Pin,
  Rss,
  Clock,
  Loader2,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { useCompanyNews } from '@/hooks/useCompanyNews';
import type { NewsPost } from '@/types/news';
import { PostCard } from './PostCard';
import { NewsFiltersBar } from './NewsFiltersBar';
import { AdminNewsDrawer } from './AdminNewsDrawer';
import { PostEditor } from './PostEditor';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lastUpdatedLabel(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CompanyNewsPanelProps {
  userId: string;
  userRole: 'admin' | 'user' | 'superadmin';
  userName: string;
  userDepartmentId?: string;
}

export function CompanyNewsPanel({ userId, userRole, userName, userDepartmentId }: CompanyNewsPanelProps) {
  const news = useCompanyNews({ userId, userRole, userName, userDepartmentId });

  // Editor modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<NewsPost | null>(null);

  // Expanded post state
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  // Feed display limit for "load more"
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

  const visibleFeed = news.feedPosts.slice(0, feedLimit);
  const hasMore = news.feedPosts.length > feedLimit;

  const totalPosts = news.pinnedPosts.length + news.feedPosts.length + (news.criticalPost ? 1 : 0);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (news.loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 size={28} className="animate-spin text-indigo-500 mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium">Loading news...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-3">
        <h2 className="flex items-center gap-2.5 text-base font-semibold text-slate-800 dark:text-white">
          <Newspaper size={18} className="text-indigo-500" />
          Company News
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Clock size={12} />
          Updated {lastUpdatedLabel(news.lastUpdated)}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-6 space-y-5 scrollbar-thin">
        {/* Admin Tools */}
        {news.isAdmin && (
          <AdminNewsDrawer
            drafts={news.drafts}
            allPostsCount={news.allPosts.length}
            pinnedCount={news.pinnedPosts.length}
            criticalCount={news.criticalPost ? 1 : 0}
            onCreatePost={() => handleOpenEditor()}
            onEditPost={(p) => handleOpenEditor(p)}
            onPublishPost={handlePublishPost}
            onArchivePost={news.archivePost}
            onTogglePin={news.togglePin}
            saving={news.saving}
          />
        )}

        {/* Critical banner */}
        {news.criticalPost && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 p-4 animate-pulse-subtle">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-red-700 dark:text-red-300 uppercase tracking-wide mb-1">
                  Critical Alert
                </p>
                <p className="text-sm font-semibold text-red-900 dark:text-red-100 leading-snug">
                  {news.criticalPost.title}
                </p>
                <p className="text-sm text-red-600/80 dark:text-red-300/70 mt-1.5 line-clamp-3">
                  {news.criticalPost.summary || news.criticalPost.body.slice(0, 200)}
                </p>
                {news.criticalPost.link && (
                  <a
                    href={news.criticalPost.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-red-600 hover:text-red-800 dark:text-red-400"
                  >
                    Learn more <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <NewsFiltersBar
          filters={news.filters}
          onChange={news.setFilters}
          onReset={news.resetFilters}
        />

        {/* Pinned posts */}
        {news.pinnedPosts.length > 0 && (
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400 mb-3">
              <Pin size={12} /> Pinned
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {news.pinnedPosts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  compact
                  isAdmin={news.isAdmin}
                  onEdit={() => handleOpenEditor(p)}
                  onArchive={news.archivePost}
                  onTogglePin={news.togglePin}
                />
              ))}
            </div>
          </div>
        )}

        {/* Feed */}
        <div>
          {totalPosts > 0 && (
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              <Rss size={12} /> Latest
            </h3>
          )}

          {visibleFeed.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleFeed.map((p) => (
                <div key={p.id}>
                  <PostCard
                    post={p}
                    isAdmin={news.isAdmin}
                    onEdit={() => handleOpenEditor(p)}
                    onArchive={news.archivePost}
                    onTogglePin={news.togglePin}
                  />
                  {/* Expandable body */}
                  {expandedPostId === p.id && (
                    <div className="mt-1.5 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed border border-slate-200 dark:border-slate-700/40">
                      {p.body}
                    </div>
                  )}
                  <button
                    onClick={() => setExpandedPostId(expandedPostId === p.id ? null : p.id)}
                    className="text-xs text-indigo-500 hover:text-indigo-600 font-medium mt-1 ml-1"
                  >
                    {expandedPostId === p.id ? 'Show less' : 'Read more'}
                  </button>
                </div>
              ))}
            </div>
          ) : totalPosts === 0 ? (
            /* Empty state — no news at all */
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700/60 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Newspaper size={28} className="text-slate-300 dark:text-slate-500" />
              </div>
              <h3 className="text-base font-semibold text-slate-600 dark:text-slate-300 mb-1">
                No news yet
              </h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
                {news.isAdmin
                  ? 'Create your first company news post to keep everyone informed.'
                  : 'Company news and announcements will appear here.'}
              </p>
              {news.isAdmin && (
                <button
                  onClick={() => handleOpenEditor()}
                  className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors"
                >
                  <Sparkles size={16} />
                  Create the first post
                </button>
              )}
            </div>
          ) : null}

          {/* Load more */}
          {hasMore && (
            <button
              onClick={() => setFeedLimit((l) => l + 12)}
              className="w-full mt-4 py-2.5 text-sm font-medium text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 rounded-xl transition-colors border border-indigo-100 dark:border-indigo-900/30"
            >
              Load more ({news.feedPosts.length - feedLimit} remaining)
            </button>
          )}
        </div>

        {/* Error */}
        {news.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {news.error}
          </div>
        )}
      </div>

      {/* Post Editor Modal */}
      {editorOpen && (
        <PostEditor
          post={editingPost}
          authorId={userId}
          authorName={userName}
          onSave={handleSavePost}
          onPublish={handlePublishPost}
          onClose={() => { setEditorOpen(false); setEditingPost(null); }}
          saving={news.saving}
        />
      )}
    </div>
  );
}
