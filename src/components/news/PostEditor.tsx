/**
 * PostEditor — Admin form for creating / editing a news post
 * Includes preview, validation, and publish controls.
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Eye,
  Save,
  Send,
  Pin,
  AlertTriangle,
  Info,
  Calendar,
  Tag,
  Building2,
  Users,
  Globe,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  ImageIcon,
} from 'lucide-react';
import type { NewsPost, NewsPriority, NewsStatus, NewsVisibility } from '@/types/news';
import { NEWS_DEPARTMENTS, NEWS_TAGS, createBlankPost } from '@/types/news';
import { PostCard } from './PostCard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validatePost(post: Partial<NewsPost>): string[] {
  const errors: string[] = [];
  if (!post.title?.trim()) errors.push('Title is required');
  if (!post.body?.trim()) errors.push('Body content is required');
  if (post.title && post.title.length > 200) errors.push('Title must be under 200 characters');
  return errors;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface PostEditorProps {
  post?: NewsPost | null;          // null = create mode
  authorId: string;
  authorName: string;
  onSave: (post: Partial<NewsPost>) => Promise<string | void>;
  onPublish?: (postId: string) => Promise<void>;
  onClose: () => void;
  saving?: boolean;
}

export function PostEditor({ post, authorId, authorName, onSave, onPublish, onClose, saving }: PostEditorProps) {
  const isEdit = !!post?.id;

  // ── Form state ──────────────────────────────────────────────────────────
  const [title, setTitle] = useState(post?.title ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [summary, setSummary] = useState(post?.summary ?? '');
  const [departmentId, setDepartmentId] = useState(post?.departmentId ?? 'general');
  const [tags, setTags] = useState<string[]>(post?.tags ?? []);
  const [priority, setPriority] = useState<NewsPriority>(post?.priority ?? 'NORMAL');
  const [pinned, setPinned] = useState(post?.pinned ?? false);
  const [visibility, setVisibility] = useState<NewsVisibility>(post?.visibility ?? 'ALL');
  const [allowedDepartmentIds, setAllowedDepartmentIds] = useState<string[]>(post?.allowedDepartmentIds ?? []);
  const [allowedUserIds, setAllowedUserIds] = useState(post?.allowedUserIds?.join(', ') ?? '');
  const [link, setLink] = useState(post?.link ?? '');
  const [coverImage, setCoverImage] = useState(post?.coverImage ?? '');
  const [imageError, setImageError] = useState(false);
  const [publishAt, setPublishAt] = useState(post?.publishAt ? toInputDate(post.publishAt) : '');
  const [expiresAt, setExpiresAt] = useState(post?.expiresAt ? toInputDate(post.expiresAt) : '');

  // ── UI state ────────────────────────────────────────────────────────────
  const [showPreview, setShowPreview] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // ── Validation ──────────────────────────────────────────────────────────
  const currentErrors = useMemo(() => validatePost({ title, body }), [title, body]);

  // ── Build the partial post payload ──────────────────────────────────────
  function buildPayload(status: NewsStatus): Partial<NewsPost> {
    return {
      ...(isEdit ? { id: post!.id } : {}),
      title: title.trim(),
      body: body.trim(),
      summary: summary.trim() || body.trim().slice(0, 160),
      departmentId,
      tags,
      priority,
      pinned,
      status,
      visibility,
      allowedDepartmentIds: visibility === 'DEPARTMENTS' ? allowedDepartmentIds : [],
      allowedUserIds: visibility === 'USERS' ? allowedUserIds.split(',').map((s) => s.trim()).filter(Boolean) : [],
      link: link.trim() || undefined,
      coverImage: coverImage.trim() || undefined,
      publishAt: publishAt ? new Date(publishAt) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      authorId,
      authorName,
    };
  }

  async function handleSaveDraft() {
    const v = validatePost({ title, body: body || '(draft)' });
    if (v.length > 0 && !title.trim()) {
      setErrors(['Title is required even for drafts']);
      return;
    }
    setErrors([]);
    try {
      await onSave(buildPayload('DRAFT'));
      onClose();
    } catch {
      setErrors(['Failed to save draft']);
    }
  }

  async function handlePublish() {
    const v = validatePost({ title, body });
    if (v.length > 0) {
      setErrors(v);
      return;
    }
    setErrors([]);
    try {
      if (isEdit && post!.status !== 'PUBLISHED') {
        // Save changes then publish
        await onSave(buildPayload('PUBLISHED'));
        onClose();
      } else if (isEdit) {
        // Already published — just save updates
        await onSave(buildPayload('PUBLISHED'));
        onClose();
      } else {
        // New post → create as published
        await onSave(buildPayload('PUBLISHED'));
        onClose();
      }
    } catch {
      setErrors(['Failed to publish']);
    }
  }

  // ── Preview mock ────────────────────────────────────────────────────────
  const previewPost: NewsPost = {
    id: post?.id ?? 'preview',
    title,
    body,
    summary: summary || body.slice(0, 160),
    departmentId,
    tags,
    priority,
    pinned,
    status: 'PUBLISHED',
    visibility,
    allowedDepartmentIds: [],
    allowedUserIds: [],
    authorId,
    authorName,
    coverImage: coverImage || undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: new Date(),
    publishAt: null,
    expiresAt: null,
  };

  return (
      <div
        className="flex flex-col h-full bg-white dark:bg-slate-900"
        style={{ animation: 'fade-in-up 0.2s ease-out both' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700/60 shrink-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {isEdit ? 'Edit Post' : 'New Post'}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                showPreview
                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Eye size={14} /> Preview
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Errors */}
          {errors.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-3 py-2">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle size={12} /> {e}
                </p>
              ))}
            </div>
          )}

          {/* Preview */}
          {showPreview && (
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-900/10 p-3">
              <p className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider mb-2">Preview</p>
              <PostCard post={previewPost} />
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title..."
              maxLength={200}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 text-slate-800 dark:text-slate-100"
            />
            <p className="text-[10px] text-slate-400 mt-0.5 text-right">{title.length}/200</p>
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Content * (Markdown supported)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your news post content..."
              rows={6}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 text-slate-800 dark:text-slate-100 resize-y font-mono"
            />
          </div>

          {/* Summary (optional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Summary <span className="font-normal text-slate-400">(auto-generated if empty)</span>
            </label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Short preview text..."
              maxLength={200}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 text-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Cover Image */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              <ImageIcon size={12} className="inline mr-1" /> Cover Image URL <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="url"
              value={coverImage}
              onChange={(e) => { setCoverImage(e.target.value); setImageError(false); }}
              placeholder="https://images.unsplash.com/..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 text-slate-800 dark:text-slate-100"
            />
            {coverImage && !imageError && (
              <div className="mt-2 relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700/50">
                <img
                  src={coverImage}
                  alt="Cover preview"
                  className="w-full h-32 object-cover"
                  onError={() => setImageError(true)}
                />
                <button
                  type="button"
                  onClick={() => { setCoverImage(''); setImageError(false); }}
                  className="absolute top-1.5 right-1.5 p-1 bg-black/50 text-white rounded-md hover:bg-black/70 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {imageError && (
              <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
                <AlertTriangle size={10} /> Could not load image — check the URL
              </p>
            )}
          </div>

          {/* Row: Priority + Department */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as NewsPriority)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500/30 text-slate-700 dark:text-slate-200"
              >
                <option value="CRITICAL">🔴 Critical</option>
                <option value="NORMAL">🔵 Normal</option>
                <option value="FYI">⚪ FYI</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500/30 text-slate-700 dark:text-slate-200"
              >
                {Object.entries(NEWS_DEPARTMENTS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {NEWS_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                  }
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                    tags.includes(t)
                      ? 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700'
                      : 'bg-white dark:bg-slate-800/60 text-slate-500 border-slate-200 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  <Tag size={10} /> {t}
                </button>
              ))}
            </div>
          </div>

          {/* Pin toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
            />
            <Pin size={14} className="text-amber-500" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Pin this post</span>
          </label>

          {/* Optional link */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              <LinkIcon size={12} className="inline mr-1" /> External Link (optional)
            </label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Advanced section */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Advanced Settings
          </button>

          {showAdvanced && (
            <div className="space-y-3 pl-3 border-l-2 border-slate-200 dark:border-slate-700">
              {/* Visibility */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Visibility</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as NewsVisibility)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none text-slate-700 dark:text-slate-200"
                >
                  <option value="ALL">🌐 Everyone</option>
                  <option value="DEPARTMENTS">🏢 Specific Departments</option>
                  <option value="USERS">👤 Specific Users</option>
                </select>
              </div>

              {visibility === 'DEPARTMENTS' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Allowed Departments</label>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(NEWS_DEPARTMENTS).map(([k, v]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() =>
                          setAllowedDepartmentIds((prev) =>
                            prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
                          )
                        }
                        className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                          allowedDepartmentIds.includes(k)
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700'
                            : 'bg-white dark:bg-slate-800/60 text-slate-500 border-slate-200 dark:border-slate-700/50'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {visibility === 'USERS' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Allowed User IDs (comma-separated)</label>
                  <input
                    type="text"
                    value={allowedUserIds}
                    onChange={(e) => setAllowedUserIds(e.target.value)}
                    placeholder="userId1, userId2, ..."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none text-slate-800 dark:text-slate-100"
                  />
                </div>
              )}

              {/* Schedule / Expire */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    <Calendar size={12} className="inline mr-1" /> Publish At
                  </label>
                  <input
                    type="datetime-local"
                    value={publishAt}
                    onChange={(e) => setPublishAt(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none text-slate-700 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    <Calendar size={12} className="inline mr-1" /> Expires At
                  </label>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none text-slate-700 dark:text-slate-200"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer: actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
          <div className="text-[10px] text-slate-400">
            {currentErrors.length > 0 ? (
              <span className="text-amber-500">{currentErrors.length} issue(s)</span>
            ) : (
              <span className="text-emerald-500">✓ Ready to publish</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-50"
            >
              <Save size={14} /> Save Draft
            </button>
            <button
              onClick={handlePublish}
              disabled={saving || currentErrors.length > 0}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={14} /> {isEdit && post?.status === 'PUBLISHED' ? 'Update' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
  );
}

// ─── Private helper ──────────────────────────────────────────────────────────

function toInputDate(d: Date | null | undefined): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  // Format to YYYY-MM-DDTHH:MM for datetime-local input
  return dt.toISOString().slice(0, 16);
}
