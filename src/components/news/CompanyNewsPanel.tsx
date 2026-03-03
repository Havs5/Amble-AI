/**
 * CompanyNewsPanel — Right-side panel for Dashboard showing company news
 *
 * Layout:
 *  1) Critical banner (if any CRITICAL post is active)
 *  2) Admin tools drawer (admin only, collapsible)
 *  3) Filters
 *  4) Pinned posts section (up to 3)
 *  5) Latest feed (infinite scroll via Firestore onSnapshot)
 *  6) "Last updated X minutes ago" footer
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
  RefreshCw,
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
  const [feedLimit, setFeedLimit] = useState(10);

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

  // ── Loading state ─────────────────────────────────────────────────────────
  if (news.loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={24} className="animate-spin text-indigo-500 mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">Loading news...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
          <Newspaper size={16} className="text-indigo-500" />
          Company News
        </h2>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <Clock size={10} />
          Updated {lastUpdatedLabel(news.lastUpdated)}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 scrollbar-thin">
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
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 p-3 animate-pulse-subtle">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-red-700 dark:text-red-300 uppercase tracking-wide mb-0.5">
                  Critical Alert
                </p>
                <p className="text-sm font-semibold text-red-900 dark:text-red-100 leading-snug">
                  {news.criticalPost.title}
                </p>
                <p className="text-xs text-red-600/80 dark:text-red-300/70 mt-1 line-clamp-2">
                  {news.criticalPost.summary || news.criticalPost.body.slice(0, 120)}
                </p>
                {news.criticalPost.link && (
                  <a
                    href={news.criticalPost.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium text-red-600 hover:text-red-800 dark:text-red-400"
                  >
                    Learn more <ExternalLink size={10} />
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
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400 mb-2">
              <Pin size={10} /> Pinned
            </h3>
            <div className="space-y-2">
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
          <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            <Rss size={10} /> Latest
          </h3>

          {visibleFeed.length > 0 ? (
            <div className="space-y-2">
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
                    <div className="mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed border border-slate-200 dark:border-slate-700/40">
                      {p.body}
                    </div>
                  )}
                  <button
                    onClick={() => setExpandedPostId(expandedPostId === p.id ? null : p.id)}
                    className="text-[10px] text-indigo-500 hover:text-indigo-600 font-medium mt-0.5 ml-1"
                  >
                    {expandedPostId === p.id ? 'Show less' : 'Read more'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Sparkles size={20} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">No news posts yet</p>
              {news.isAdmin && (
                <button
                  onClick={() => handleOpenEditor()}
                  className="mt-2 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
                >
                  Create the first post
                </button>
              )}
            </div>
          )}

          {/* Load more */}
          {hasMore && (
            <button
              onClick={() => setFeedLimit((l) => l + 10)}
              className="w-full mt-2 py-2 text-xs font-medium text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 rounded-lg transition-colors"
            >
              Load more ({news.feedPosts.length - feedLimit} remaining)
            </button>
          )}
        </div>

        {/* Error */}
        {news.error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-3 py-2 text-xs text-red-600 dark:text-red-400">
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
