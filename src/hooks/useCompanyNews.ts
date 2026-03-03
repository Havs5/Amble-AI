/**
 * useCompanyNews — Firestore real-time hook for the Company News panel
 *
 * Queries:
 *  - Published posts visible to the current user
 *  - Realtime updates via onSnapshot
 *  - Separate pinned / critical / feed slices
 *  - Admin: also queries drafts for management
 *
 * Mutations:
 *  - createPost, updatePost, archivePost, togglePin, publishPost
 *
 * All writes include audit trail entries.
 */

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { NewsPost, NewsStatus, NewsPriority, NewsVisibility } from '@/types/news';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  return null;
}

function docToPost(d: QueryDocumentSnapshot<DocumentData>): NewsPost {
  const data = d.data();
  return {
    id: d.id,
    title: data.title ?? '',
    body: data.body ?? '',
    summary: data.summary ?? '',
    departmentId: data.departmentId ?? 'general',
    tags: data.tags ?? [],
    priority: data.priority ?? 'NORMAL',
    pinned: data.pinned ?? false,
    status: data.status ?? 'DRAFT',
    visibility: data.visibility ?? 'ALL',
    allowedDepartmentIds: data.allowedDepartmentIds ?? [],
    allowedUserIds: data.allowedUserIds ?? [],
    authorId: data.authorId ?? '',
    authorName: data.authorName ?? '',
    link: data.link ?? undefined,
    source: data.source ?? undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    publishedAt: toDate(data.publishedAt),
    publishAt: toDate(data.publishAt),
    expiresAt: toDate(data.expiresAt),
  };
}

/** Check if a post is currently visible (timing rules). */
function isVisibleNow(p: NewsPost): boolean {
  const now = new Date();
  if (p.publishAt && p.publishAt > now) return false;
  if (p.expiresAt && p.expiresAt <= now) return false;
  return true;
}

/** Check if user can see the post based on visibility. */
function isVisibleToUser(p: NewsPost, userId: string, _userDepartmentId?: string): boolean {
  if (p.visibility === 'ALL') return true;
  if (p.visibility === 'USERS') return p.allowedUserIds.includes(userId);
  if (p.visibility === 'DEPARTMENTS' && _userDepartmentId) {
    return p.allowedDepartmentIds.includes(_userDepartmentId);
  }
  // If DEPARTMENTS but no dept on user, default show
  if (p.visibility === 'DEPARTMENTS' && !_userDepartmentId) return true;
  return true;
}

/** Sort: CRITICAL first, then pinned, then by publishedAt desc */
function sortPosts(a: NewsPost, b: NewsPost): number {
  // 1) Priority order: CRITICAL > NORMAL > FYI
  const prioMap: Record<string, number> = { CRITICAL: 0, NORMAL: 1, FYI: 2 };
  const ap = prioMap[a.priority] ?? 1;
  const bp = prioMap[b.priority] ?? 1;
  if (ap !== bp) return ap - bp;

  // 2) Pinned first
  if (a.pinned && !b.pinned) return -1;
  if (!a.pinned && b.pinned) return 1;

  // 3) publishedAt desc
  const aTime = a.publishedAt?.getTime() ?? 0;
  const bTime = b.publishedAt?.getTime() ?? 0;
  return bTime - aTime;
}

// ─── Filter state ────────────────────────────────────────────────────────────

export interface NewsFilters {
  department: string; // '' = all
  tag: string;        // '' = all
  search: string;     // '' = all
}

const DEFAULT_FILTERS: NewsFilters = { department: '', tag: '', search: '' };

// ─── Hook ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

interface UseCompanyNewsParams {
  userId: string;
  userRole: 'admin' | 'user' | 'superadmin';
  userName: string;
  userDepartmentId?: string;
}

export function useCompanyNews({ userId, userRole, userName, userDepartmentId }: UseCompanyNewsParams) {
  // Published posts (for feed)
  const [allPosts, setAllPosts] = useState<NewsPost[]>([]);
  // Admin drafts (only loaded for admins)
  const [drafts, setDrafts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [filters, setFilters] = useState<NewsFilters>(DEFAULT_FILTERS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  // ── Realtime listener for published posts ─────────────────────────────────
  useEffect(() => {
    if (!db || !userId) return;

    const colRef = collection(db, 'news_posts');
    // Query all published posts; client-side filter for visibility/timing
    const q = query(
      colRef,
      where('status', '==', 'PUBLISHED'),
      orderBy('publishedAt', 'desc'),
      limit(100),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const posts = snap.docs.map(docToPost).filter((p) => {
          return isVisibleNow(p) && isVisibleToUser(p, userId, userDepartmentId);
        });
        setAllPosts(posts);
        setLastUpdated(new Date());
        setLoading(false);
      },
      (err) => {
        console.error('[CompanyNews] snapshot error:', err);
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [userId, userDepartmentId]);

  // ── Admin: listen for drafts ──────────────────────────────────────────────
  useEffect(() => {
    if (!db || !isAdmin) return;

    const colRef = collection(db, 'news_posts');
    const q = query(
      colRef,
      where('status', 'in', ['DRAFT', 'ARCHIVED']),
      orderBy('updatedAt', 'desc'),
      limit(50),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setDrafts(snap.docs.map(docToPost));
      },
      (err) => {
        console.error('[CompanyNews] drafts snapshot error:', err);
      },
    );

    return () => unsub();
  }, [isAdmin]);

  // ── Filtered & sorted views ───────────────────────────────────────────────

  const filteredPosts = useMemo(() => {
    let list = [...allPosts];

    if (filters.department) {
      list = list.filter((p) => p.departmentId === filters.department);
    }
    if (filters.tag) {
      list = list.filter((p) => p.tags.includes(filters.tag));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.body.toLowerCase().includes(q) ||
          p.summary.toLowerCase().includes(q),
      );
    }

    list.sort(sortPosts);
    return list;
  }, [allPosts, filters]);

  const criticalPost = useMemo(
    () => filteredPosts.find((p) => p.priority === 'CRITICAL'),
    [filteredPosts],
  );

  const pinnedPosts = useMemo(
    () => filteredPosts.filter((p) => p.pinned && p.priority !== 'CRITICAL').slice(0, 3),
    [filteredPosts],
  );

  const feedPosts = useMemo(() => {
    const pinnedIds = new Set(pinnedPosts.map((p) => p.id));
    return filteredPosts.filter(
      (p) => p.priority !== 'CRITICAL' && !pinnedIds.has(p.id),
    );
  }, [filteredPosts, pinnedPosts]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const audit = useCallback(
    async (postId: string, action: string, diff?: string) => {
      try {
        await addDoc(collection(db, 'news_audit'), {
          postId,
          action,
          actorId: userId,
          actorName: userName,
          timestamp: serverTimestamp(),
          diff: diff ?? null,
        });
      } catch (e) {
        console.warn('[CompanyNews] audit write failed:', e);
      }
    },
    [userId, userName],
  );

  const createPost = useCallback(
    async (post: Partial<NewsPost>): Promise<string> => {
      setSaving(true);
      setError(null);
      try {
        const now = serverTimestamp();
        const docRef = await addDoc(collection(db, 'news_posts'), {
          title: post.title ?? '',
          body: post.body ?? '',
          summary: post.summary || (post.body ?? '').slice(0, 160),
          departmentId: post.departmentId ?? 'general',
          tags: post.tags ?? [],
          priority: post.priority ?? 'NORMAL',
          pinned: post.pinned ?? false,
          status: post.status ?? 'DRAFT',
          visibility: post.visibility ?? 'ALL',
          allowedDepartmentIds: post.allowedDepartmentIds ?? [],
          allowedUserIds: post.allowedUserIds ?? [],
          authorId: userId,
          authorName: userName,
          link: post.link ?? null,
          source: post.source ?? 'manual',
          createdAt: now,
          updatedAt: now,
          publishedAt: post.status === 'PUBLISHED' ? now : null,
          publishAt: post.publishAt ? Timestamp.fromDate(new Date(post.publishAt as any)) : null,
          expiresAt: post.expiresAt ? Timestamp.fromDate(new Date(post.expiresAt as any)) : null,
        });
        await audit(docRef.id, 'CREATE');
        return docRef.id;
      } catch (e: any) {
        setError(e.message);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [userId, userName, audit],
  );

  const updatePost = useCallback(
    async (postId: string, updates: Partial<NewsPost>) => {
      setSaving(true);
      setError(null);
      try {
        const ref = doc(db, 'news_posts', postId);
        const payload: Record<string, any> = {
          ...updates,
          updatedAt: serverTimestamp(),
        };
        // Remove id & dates that shouldn't be overwritten directly
        delete payload.id;
        delete payload.createdAt;
        // Convert date fields to Timestamps
        if (updates.publishAt !== undefined) {
          payload.publishAt = updates.publishAt ? Timestamp.fromDate(new Date(updates.publishAt as any)) : null;
        }
        if (updates.expiresAt !== undefined) {
          payload.expiresAt = updates.expiresAt ? Timestamp.fromDate(new Date(updates.expiresAt as any)) : null;
        }
        if (updates.publishedAt !== undefined) {
          payload.publishedAt = updates.publishedAt ? Timestamp.fromDate(new Date(updates.publishedAt as any)) : null;
        }
        // Auto-generate summary if body changed and no explicit summary
        if (updates.body && !updates.summary) {
          payload.summary = updates.body.slice(0, 160);
        }
        await updateDoc(ref, payload);
        await audit(postId, 'UPDATE', Object.keys(updates).join(', '));
      } catch (e: any) {
        setError(e.message);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [audit],
  );

  const publishPost = useCallback(
    async (postId: string) => {
      setSaving(true);
      try {
        const ref = doc(db, 'news_posts', postId);
        await updateDoc(ref, {
          status: 'PUBLISHED',
          publishedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await audit(postId, 'PUBLISH');
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    },
    [audit],
  );

  const archivePost = useCallback(
    async (postId: string) => {
      setSaving(true);
      try {
        const ref = doc(db, 'news_posts', postId);
        await updateDoc(ref, {
          status: 'ARCHIVED',
          updatedAt: serverTimestamp(),
        });
        await audit(postId, 'ARCHIVE');
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    },
    [audit],
  );

  const togglePin = useCallback(
    async (postId: string, currentlyPinned: boolean) => {
      setSaving(true);
      try {
        const ref = doc(db, 'news_posts', postId);
        await updateDoc(ref, {
          pinned: !currentlyPinned,
          updatedAt: serverTimestamp(),
        });
        await audit(postId, currentlyPinned ? 'UNPIN' : 'PIN');
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    },
    [audit],
  );

  return {
    // Data slices
    allPosts: filteredPosts,
    criticalPost,
    pinnedPosts,
    feedPosts,
    drafts,

    // State
    loading,
    saving,
    error,
    lastUpdated,
    isAdmin,

    // Filters
    filters,
    setFilters,
    resetFilters: () => setFilters(DEFAULT_FILTERS),

    // Mutations (admin only, but guard at component level)
    createPost,
    updatePost,
    publishPost,
    archivePost,
    togglePin,
  };
}
