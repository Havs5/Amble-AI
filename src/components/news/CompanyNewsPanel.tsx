/**
 * CompanyNewsPanel — Main dashboard content showing company news
 *
 * Modern editorial layout inspired by Linear changelog / Notion updates:
 *  1) Toolbar with title, last-updated, filter & admin toggles, New Post button
 *  2) Critical alert banner (if any)
 *  3) Featured / Hero post (highest-priority or newest published)
 *  4) Pinned posts in a horizontal card row
 *  5) Chronological feed grouped by date with separators
 *  6) Collapsible filters & admin drawer
 *  7) PostEditor as a slide-in right panel
 *
 * Uses useCompanyNews hook for real-time Firestore data.
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  Newspaper,
  AlertTriangle,
  Pin,
  Rss,
  Clock,
  Loader2,
  ExternalLink,
  Sparkles,
  Plus,
  Filter,
  Calendar,
  Tag as TagIcon,
  Building2,
  User,
} from 'lucide-react';
import { useCompanyNews } from '@/hooks/useCompanyNews';
import type { NewsPost } from '@/types/news';
import { NEWS_DEPARTMENTS } from '@/types/news';
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

const priorityColor: Record<string, string> = {
  CRITICAL: 'from-red-500 to-orange-500',
  NORMAL: 'from-indigo-500 to-blue-500',
  FYI: 'from-slate-400 to-slate-500',
};

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

  // Expanded post state
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  // Filter / admin drawer visibility
  const [showFilters, setShowFilters] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

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

  // ── Derived data ──────────────────────────────────────────────────────────

  // Featured = critical → first pinned → first feed post
  const featuredPost = useMemo(() => {
    if (news.criticalPost) return news.criticalPost;
    if (news.pinnedPosts.length > 0) return news.pinnedPosts[0];
    if (news.feedPosts.length > 0) return news.feedPosts[0];
    return null;
  }, [news.criticalPost, news.pinnedPosts, news.feedPosts]);

  // Remaining pinned (exclude featured)
  const remainingPinned = useMemo(
    () => news.pinnedPosts.filter((p) => p.id !== featuredPost?.id),
    [news.pinnedPosts, featuredPost],
  );

  // Feed excluding featured
  const remainingFeed = useMemo(
    () => news.feedPosts.filter((p) => p.id !== featuredPost?.id),
    [news.feedPosts, featuredPost],
  );

  const visibleFeed = remainingFeed.slice(0, feedLimit);
  const hasMore = remainingFeed.length > feedLimit;

  // Group visible feed by date
  const groupedFeed = useMemo(() => {
    const groups: { date: string; label: string; posts: NewsPost[] }[] = [];
    let currentKey = '';
    for (const post of visibleFeed) {
      const key = getDayKey(post.publishedAt);
      if (key !== currentKey) {
        currentKey = key;
        groups.push({
          date: key,
          label: formatDate(post.publishedAt),
          posts: [post],
        });
      } else {
        groups[groups.length - 1].posts.push(post);
      }
    }
    return groups;
  }, [visibleFeed]);

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

          {/* Admin controls */}
          {news.isAdmin && (
            <>
              <button
                onClick={() => setShowAdmin(!showAdmin)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  showAdmin
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400'
                }`}
              >
                Admin
              </button>
              <button
                onClick={() => handleOpenEditor()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
              >
                <Plus size={14} /> New Post
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── Scrollable Body ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-5 sm:px-6 pb-8 space-y-6">
          {/* Admin Tools (collapsible) */}
          {news.isAdmin && showAdmin && (
            <div style={{ animation: 'fade-in-up 0.2s ease-out both' }}>
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
            </div>
          )}

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

          {/* ─── Critical Alert Banner ───────────────────────────────────── */}
          {news.criticalPost && featuredPost?.id !== news.criticalPost.id && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={18}
                  className="text-red-500 shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-red-700 dark:text-red-300 uppercase tracking-wide mb-1">
                    Critical Alert
                  </p>
                  <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                    {news.criticalPost.title}
                  </p>
                  <p className="text-sm text-red-600/80 dark:text-red-300/70 mt-1 line-clamp-2">
                    {news.criticalPost.summary ||
                      news.criticalPost.body.slice(0, 200)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ─── Featured / Hero Post ────────────────────────────────────── */}
          {featuredPost && (
            <div
              className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-gradient-to-br from-white to-slate-50 dark:from-slate-800/80 dark:to-slate-800/40"
              style={{ animation: 'fade-in-up 0.3s ease-out both' }}
            >
              {/* Gradient accent strip */}
              <div
                className={`h-1.5 bg-gradient-to-r ${
                  priorityColor[featuredPost.priority] ?? priorityColor.NORMAL
                }`}
              />

              <div className="p-5 sm:p-7">
                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {featuredPost.priority === 'CRITICAL' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                      <AlertTriangle size={10} /> Critical
                    </span>
                  )}
                  {featuredPost.pinned && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
                      <Pin size={10} /> Pinned
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                    <Building2 size={11} />{' '}
                    {NEWS_DEPARTMENTS[featuredPost.departmentId] ??
                      featuredPost.departmentId}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {formatDate(featuredPost.publishedAt)}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-tight mb-3">
                  {featuredPost.title}
                  {featuredPost.link && (
                    <a
                      href={featuredPost.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center ml-2 text-indigo-500 hover:text-indigo-600"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </h3>

                {/* Body preview */}
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {expandedPostId === featuredPost.id
                    ? featuredPost.body
                    : featuredPost.summary ||
                      featuredPost.body.slice(0, 280)}
                </p>
                {featuredPost.body.length > 280 && (
                  <button
                    onClick={() =>
                      setExpandedPostId(
                        expandedPostId === featuredPost.id
                          ? null
                          : featuredPost.id,
                      )
                    }
                    className="mt-2 text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
                  >
                    {expandedPostId === featuredPost.id
                      ? 'Show less'
                      : 'Read more →'}
                  </button>
                )}

                {/* Tags */}
                {featuredPost.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {featuredPost.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 dark:text-indigo-400"
                      >
                        <TagIcon size={9} /> {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Author & admin edit */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/40">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <User size={14} className="text-indigo-500" />
                  </div>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {featuredPost.authorName}
                  </span>

                  {news.isAdmin && (
                    <button
                      onClick={() => handleOpenEditor(featuredPost)}
                      className="ml-auto text-xs text-indigo-500 hover:text-indigo-600 font-medium"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Pinned Posts Row ────────────────────────────────────────── */}
          {remainingPinned.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400 mb-3">
                <Pin size={12} /> Pinned
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {remainingPinned.map((p) => (
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

          {/* ─── Chronological Feed ──────────────────────────────────────── */}
          {groupedFeed.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
                <Rss size={12} /> Feed
              </h3>

              <div className="space-y-6">
                {groupedFeed.map((group) => (
                  <div key={group.date}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                        <Calendar
                          size={12}
                          className="text-slate-400 dark:text-slate-500"
                        />
                        {group.label}
                      </div>
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700/50" />
                    </div>

                    {/* Posts in this date group */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {group.posts.map((p) => (
                        <div key={p.id}>
                          <PostCard
                            post={p}
                            isAdmin={news.isAdmin}
                            onEdit={() => handleOpenEditor(p)}
                            onArchive={news.archivePost}
                            onTogglePin={news.togglePin}
                          />
                          {expandedPostId === p.id && (
                            <div className="mt-1.5 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed border border-slate-200 dark:border-slate-700/40">
                              {p.body}
                            </div>
                          )}
                          <button
                            onClick={() =>
                              setExpandedPostId(
                                expandedPostId === p.id ? null : p.id,
                              )
                            }
                            className="text-xs text-indigo-500 hover:text-indigo-600 font-medium mt-1 ml-1"
                          >
                            {expandedPostId === p.id
                              ? 'Show less'
                              : 'Read more'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Empty State ─────────────────────────────────────────────── */}
          {!featuredPost && remainingFeed.length === 0 && (
            <div
              className="text-center py-20"
              style={{ animation: 'fade-in-up 0.4s ease-out both' }}
            >
              <div className="w-20 h-20 bg-slate-100 dark:bg-slate-700/60 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Newspaper
                  size={36}
                  className="text-slate-300 dark:text-slate-500"
                />
              </div>
              <h3 className="text-lg font-semibold text-slate-600 dark:text-slate-300 mb-2">
                No news yet
              </h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 max-w-md mx-auto leading-relaxed">
                {news.isAdmin
                  ? 'Create your first company news post to keep the team informed about announcements, updates, and important information.'
                  : 'Company news and announcements will appear here. Check back soon!'}
              </p>
              {news.isAdmin && (
                <button
                  onClick={() => handleOpenEditor()}
                  className="mt-6 inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md hover:shadow-lg transition-all"
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
                Load more ({remainingFeed.length - feedLimit} remaining)
              </button>
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

      {/* ─── Post Editor Slide-in Panel ──────────────────────────────────── */}
      {editorOpen && (
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
      )}
    </div>
  );
}
