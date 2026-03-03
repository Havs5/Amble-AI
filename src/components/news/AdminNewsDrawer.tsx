/**
 * AdminNewsDrawer — Collapsible admin tools panel within the Company News panel
 * 
 * Shows:
 *  - Create new post button
 *  - Draft posts list (edit / publish / delete)
 *  - Archived posts list (restore / delete)
 *  - Post statistics summary
 */

'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  FileText,
  Archive,
  Send,
  Pencil,
  Pin,
  Trash2,
  Shield,
  BarChart3,
} from 'lucide-react';
import type { NewsPost } from '@/types/news';
import { NEWS_DEPARTMENTS } from '@/types/news';

interface AdminNewsDrawerProps {
  drafts: NewsPost[];
  allPostsCount: number;
  pinnedCount: number;
  criticalCount: number;
  onCreatePost: () => void;
  onEditPost: (post: NewsPost) => void;
  onPublishPost: (postId: string) => Promise<void>;
  onArchivePost: (postId: string) => Promise<void>;
  onTogglePin: (postId: string, pinned: boolean) => Promise<void>;
  saving?: boolean;
}

export function AdminNewsDrawer({
  drafts,
  allPostsCount,
  pinnedCount,
  criticalCount,
  onCreatePost,
  onEditPost,
  onPublishPost,
  onArchivePost,
  onTogglePin,
  saving,
}: AdminNewsDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const draftPosts = drafts.filter((d) => d.status === 'DRAFT');
  const archivedPosts = drafts.filter((d) => d.status === 'ARCHIVED');

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <Shield size={14} />
          Admin Tools
          {draftPosts.length > 0 && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-full">
              {draftPosts.length} draft{draftPosts.length !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        {isOpen ? <ChevronUp size={14} className="text-amber-500" /> : <ChevronDown size={14} className="text-amber-500" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-3">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Published" value={allPostsCount} icon={FileText} color="indigo" />
            <MiniStat label="Pinned" value={pinnedCount} icon={Pin} color="amber" />
            <MiniStat label="Critical" value={criticalCount} icon={BarChart3} color="red" />
          </div>

          {/* Create button */}
          <button
            onClick={onCreatePost}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
          >
            <Plus size={14} /> New Post
          </button>

          {/* Drafts */}
          {draftPosts.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Drafts</p>
              <div className="space-y-1.5">
                {draftPosts.map((d) => (
                  <DraftRow
                    key={d.id}
                    post={d}
                    onEdit={() => onEditPost(d)}
                    onPublish={() => onPublishPost(d.id)}
                    onArchive={() => onArchivePost(d.id)}
                    saving={saving}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Archived */}
          {archivedPosts.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Archived</p>
              <div className="space-y-1.5">
                {archivedPosts.slice(0, 5).map((d) => (
                  <DraftRow
                    key={d.id}
                    post={d}
                    onEdit={() => onEditPost(d)}
                    onPublish={() => onPublishPost(d.id)}
                    onArchive={() => onArchivePost(d.id)}
                    saving={saving}
                    isArchived
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MiniStat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30',
    amber: 'text-amber-500 bg-amber-50 dark:bg-amber-900/30',
    red: 'text-red-500 bg-red-50 dark:bg-red-900/30',
  };
  return (
    <div className={`rounded-lg px-2 py-1.5 text-center ${colorMap[color] ?? colorMap.indigo}`}>
      <Icon size={12} className="mx-auto mb-0.5" />
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[9px] opacity-70 font-medium">{label}</div>
    </div>
  );
}

function DraftRow({
  post,
  onEdit,
  onPublish,
  onArchive,
  saving,
  isArchived,
}: {
  post: NewsPost;
  onEdit: () => void;
  onPublish: () => void;
  onArchive: () => void;
  saving?: boolean;
  isArchived?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 group">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">
          {post.title || 'Untitled'}
        </p>
        <p className="text-[9px] text-slate-400">
          {NEWS_DEPARTMENTS[post.departmentId] ?? post.departmentId}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1 text-slate-400 hover:text-indigo-500 rounded"
          title="Edit"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={onPublish}
          disabled={saving}
          className="p-1 text-slate-400 hover:text-emerald-500 rounded disabled:opacity-50"
          title={isArchived ? 'Restore & Publish' : 'Publish'}
        >
          <Send size={12} />
        </button>
        {!isArchived && (
          <button
            onClick={onArchive}
            disabled={saving}
            className="p-1 text-slate-400 hover:text-red-500 rounded disabled:opacity-50"
            title="Archive"
          >
            <Archive size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
