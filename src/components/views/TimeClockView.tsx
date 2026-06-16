'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock, LogIn, LogOut, ChevronLeft, ChevronRight, Pencil, Trash2, Plus,
  Check, X, CalendarDays, Users, UserCheck, AlertTriangle, Search,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContextRefactored';
import { auth as fbAuth } from '@/lib/firebase';
import { Timestamp } from 'firebase/firestore';
import * as TC from '@/services/timeclock/TimeClockService';
import type { TimeEntry, DirectoryUser, OnlineUser, EditRequest, AuditEntry } from '@/services/timeclock/TimeClockService';
import { can, roleLabel } from '@/lib/roles';
import { NEWS_DEPARTMENTS } from '@/types/news';

type Tab = 'punch' | 'timecard' | 'online' | 'manage';

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#3b82f6'];
const initials = (name: string) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
const avatarColor = (name: string) => {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDayLabel = (d: Date) =>
  d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const fmtWeekRange = (start: Date) => {
  const end = TC.addDays(start, 6);
  return `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

export function TimeClockView() {
  const { user } = useAuth();
  // Managers and Super Admins get the "Manage" tab (adjust anyone's entries).
  const isAdmin = can(user?.role, 'manageTimeclock');
  const uid = fbAuth?.currentUser?.uid || (user as any)?.uid || user?.id || '';
  const userName = user?.name || 'User';
  const userEmail = user?.email || '';

  const [tab, setTab] = useState<Tab>('punch');

  // Live clock tick (1s) — drives the big clock and running elapsed time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Current open entry + this-week entries for the signed-in user.
  const [openEntry, setOpenEntry] = useState<TimeEntry | null>(null);
  const [myWeekStart, setMyWeekStart] = useState(() => TC.startOfWeek(new Date()));
  const [myEntries, setMyEntries] = useState<TimeEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!uid) return;
    return TC.subscribeOpenEntry(uid, setOpenEntry);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return TC.subscribeUserWeek(uid, myWeekStart, setMyEntries);
  }, [uid, myWeekStart]);

  const userDept = (user as any)?.department || '';

  const doClockIn = async () => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      await TC.clockIn({ userId: uid, userName, userEmail, department: userDept, note: note.trim() });
      setNote('');
    } catch (e) {
      console.error('[TimeClock] clock-in failed', e);
    } finally {
      setBusy(false);
    }
  };

  const doClockOut = async () => {
    if (!openEntry || busy) return;
    setBusy(true);
    try {
      await TC.clockOut(openEntry.id, { uid, name: userName, email: userEmail, department: userDept });
    } catch (e) {
      console.error('[TimeClock] clock-out failed', e);
    } finally {
      setBusy(false);
    }
  };

  // Live team presence (everyone currently clocked in). Managers/IT only.
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    return TC.subscribeOnlineUsers(setOnlineUsers);
  }, [isAdmin]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'punch', label: 'Punch', icon: <Clock size={15} /> },
    { id: 'timecard', label: 'My Timecard', icon: <CalendarDays size={15} /> },
    ...(isAdmin ? [
      { id: 'online' as Tab, label: "Who's In", icon: <UserCheck size={15} /> },
      { id: 'manage' as Tab, label: 'Manage', icon: <Users size={15} /> },
    ] : []),
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-2 mr-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow">
            <Clock size={16} className="text-white" />
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-100">Clock In/Out</span>
        </div>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'punch' && (
          <PunchTab
            userName={userName}
            openEntry={openEntry}
            now={now}
            busy={busy}
            note={note}
            setNote={setNote}
            onClockIn={doClockIn}
            onClockOut={doClockOut}
            todayEntries={myEntries.filter((e) => TC.isSameDay(e.clockIn.toDate(), new Date()))}
          />
        )}

        {tab === 'timecard' && (
          <TimecardTab
            entries={myEntries}
            weekStart={myWeekStart}
            setWeekStart={setMyWeekStart}
            now={now}
            uid={uid}
            userName={userName}
            userEmail={userEmail}
          />
        )}

        {tab === 'online' && isAdmin && <WhoIsInTab online={onlineUsers} now={now} currentUid={uid} />}

        {tab === 'manage' && isAdmin && <ManageTab now={now} editor={{ uid, name: userName, role: (user?.role as string) || '' }} />}
      </div>
    </div>
  );
}

// ─── Who's In (live team presence) ─────────────────────────────────────────
function WhoIsInTab({ online, now, currentUid }: { online: OnlineUser[]; now: number; currentUid: string }) {
  const fmtSince = (since: TimeEntry['clockIn'] | null) =>
    since ? since.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
  const elapsed = (since: TimeEntry['clockIn'] | null) =>
    since ? TC.fmtDuration(Math.max(0, now - since.toMillis())) : '';

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const u of online) { const d = (u.department || '').trim(); if (d) s.add(d); }
    return Array.from(s).sort();
  }, [online]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return online.filter((u) =>
      (deptFilter === 'all' || (u.department || '') === deptFilter) &&
      (!q || u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
    );
  }, [online, search, deptFilter]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {online.length > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${online.length > 0 ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
          </span>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Who's In</h2>
          <span className="text-sm font-medium text-slate-400">{filtered.length}{filtered.length !== online.length ? ` of ${online.length}` : ''} online</span>
        </div>
        {online.length > 0 && (
          <div className="flex items-center gap-2">
            {departments.length > 0 && (
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                <option value="all">All departments</option>
                {departments.map((d) => <option key={d} value={d}>{NEWS_DEPARTMENTS[d] || d}</option>)}
              </select>
            )}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name…" className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 w-44" />
            </div>
          </div>
        )}
      </div>

      {online.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <UserCheck size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">No one is clocked in right now.</p>
          <p className="text-xs mt-1">Punch in and you'll show up here.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500 text-sm">No one matches your filters.</div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((u) => {
            const dept = u.department && NEWS_DEPARTMENTS[u.department] ? NEWS_DEPARTMENTS[u.department] : '';
            return (
              <li key={u.uid} className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 shadow-sm">
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ backgroundColor: avatarColor(u.name) }}>
                    {initials(u.name)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900 dark:text-white truncate">
                    {u.name}{u.uid === currentUid && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{dept || u.email}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{elapsed(u.since)}</div>
                  <div className="text-[11px] text-slate-400">since {fmtSince(u.since)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Punch tab ─────────────────────────────────────────────────────────────
function PunchTab({
  userName, openEntry, now, busy, note, setNote, onClockIn, onClockOut, todayEntries,
}: {
  userName: string;
  openEntry: TimeEntry | null;
  now: number;
  busy: boolean;
  note: string;
  setNote: (v: string) => void;
  onClockIn: () => void;
  onClockOut: () => void;
  todayEntries: TimeEntry[];
}) {
  const nowDate = new Date(now);
  const clockedIn = !!openEntry;
  const todayMs = todayEntries.reduce((sum, e) => sum + TC.entryDurationMs(e, now), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Hello {userName}</h1>
        <div className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          Current Status
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-bold text-white ${
              clockedIn ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'
            }`}
          >
            {clockedIn ? 'IN' : 'OUT'}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 text-center">
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500 tracking-wide">
          {nowDate.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <p className="text-5xl font-bold tabular-nums text-slate-800 dark:text-slate-100 my-3">
          {nowDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        </p>

        {clockedIn && openEntry ? (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
              Clocked in at <strong>{TC.fmtTime(openEntry.clockIn)}</strong> · running{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">
                {TC.fmtDuration(TC.entryDurationMs(openEntry, now))}
              </strong>
            </p>
            <button
              onClick={onClockOut}
              disabled={busy}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold shadow-lg shadow-rose-500/20 transition-colors"
            >
              <LogOut size={18} /> Punch Out
            </button>
          </>
        ) : (
          <>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note (e.g. shift, location)…"
              className="w-full mb-4 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={onClockIn}
              disabled={busy}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold shadow-lg shadow-emerald-500/20 transition-colors"
            >
              <LogIn size={18} /> Punch In
            </button>
          </>
        )}
      </div>

      {/* Today summary */}
      <div className="mt-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Today</h2>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{TC.fmtDuration(todayMs)}</span>
        </div>
        {todayEntries.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No punches yet today.</p>
        ) : (
          <ul className="space-y-1.5">
            {todayEntries.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">
                  {TC.fmtTime(e.clockIn)} → {e.clockOut ? TC.fmtTime(e.clockOut) : <span className="text-emerald-600 dark:text-emerald-400">in progress</span>}
                </span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{TC.fmtDuration(TC.entryDurationMs(e, now))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Week navigation control ───────────────────────────────────────────────
function WeekNav({ weekStart, setWeekStart }: { weekStart: Date; setWeekStart: (d: Date) => void }) {
  const isThisWeek = TC.startOfWeek(new Date()).getTime() === weekStart.getTime();
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setWeekStart(TC.addDays(weekStart, -7))}
        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        title="Previous week"
      >
        <ChevronLeft size={18} />
      </button>
      <div className="text-sm font-medium text-slate-700 dark:text-slate-200 min-w-[180px] text-center">
        {fmtWeekRange(weekStart)}
      </div>
      <button
        onClick={() => setWeekStart(TC.addDays(weekStart, 7))}
        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        title="Next week"
      >
        <ChevronRight size={18} />
      </button>
      {!isThisWeek && (
        <button
          onClick={() => setWeekStart(TC.startOfWeek(new Date()))}
          className="ml-1 text-xs px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          This week
        </button>
      )}
    </div>
  );
}

// ─── Employee weekly timecard ──────────────────────────────────────────────
function TimecardTab({
  entries, weekStart, setWeekStart, now, uid, userName, userEmail,
}: {
  entries: TimeEntry[];
  weekStart: Date;
  setWeekStart: (d: Date) => void;
  now: number;
  uid: string;
  userName: string;
  userEmail: string;
}) {
  const days = Array.from({ length: 7 }, (_, i) => TC.addDays(weekStart, i));
  const byDay = useMemo(() => {
    const m = new Map<string, TimeEntry[]>();
    for (const e of entries) {
      const k = dayKey(e.clockIn.toDate());
      (m.get(k) || m.set(k, []).get(k)!).push(e);
    }
    return m;
  }, [entries]);
  const weekMs = entries.reduce((s, e) => s + TC.entryDurationMs(e, now), 0);

  const [reqModal, setReqModal] = useState<{ mode: 'edit' | 'add'; entry: TimeEntry | null } | null>(null);
  const [myRequests, setMyRequests] = useState<EditRequest[]>([]);
  useEffect(() => {
    if (!uid) return;
    return TC.subscribeMyRequests(uid, setMyRequests);
  }, [uid]);
  const pendingCount = myRequests.filter((r) => r.status === 'pending').length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
        <div className="flex items-center gap-3">
          <button
            onClick={() => setReqModal({ mode: 'add', entry: null })}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
            title="Request a correction or a missing punch"
          >
            <Plus size={15} /> Request fix
          </button>
          <div className="text-right">
            <div className="text-xs text-slate-400 dark:text-slate-500">Week total</div>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{TC.fmtDuration(weekMs)}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {days.map((d) => {
          const dayEntries = byDay.get(dayKey(d)) || [];
          const dayMs = dayEntries.reduce((s, e) => s + TC.entryDurationMs(e, now), 0);
          return (
            <div key={dayKey(d)} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{fmtDayLabel(d)}</span>
                <span className="text-sm tabular-nums font-medium text-slate-600 dark:text-slate-300">{TC.fmtDuration(dayMs)}</span>
              </div>
              {dayEntries.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">—</p>
              ) : (
                <ul className="space-y-1">
                  {dayEntries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300 group">
                      <span className="flex items-center gap-2 min-w-0">
                        {TC.fmtTime(e.clockIn)} → {e.clockOut ? TC.fmtTime(e.clockOut) : <span className="text-emerald-600 dark:text-emerald-400">in progress</span>}
                        {e.edited && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">edited</span>}
                        {e.note && <span className="text-xs text-slate-400 italic truncate">· {e.note}</span>}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="tabular-nums text-slate-500 dark:text-slate-400">{TC.fmtDuration(TC.entryDurationMs(e, now))}</span>
                        <button
                          onClick={() => setReqModal({ mode: 'edit', entry: e })}
                          className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition"
                          title="Request a correction"
                        >
                          <Pencil size={13} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* My correction requests + their status */}
      {myRequests.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            My correction requests
            {pendingCount > 0 && <span className="ml-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">· {pendingCount} pending</span>}
          </h3>
          <ul className="space-y-2">
            {myRequests.slice(0, 8).map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm text-slate-700 dark:text-slate-200">
                    <span className="text-slate-400">{r.type === 'add' ? 'Add' : 'Edit'}:</span>{' '}
                    {TC.fmtDateTime(r.proposedClockIn)} → {r.proposedClockOut ? TC.fmtDateTime(r.proposedClockOut) : '—'}
                  </div>
                  {r.reason && <div className="text-xs text-slate-400 italic truncate">"{r.reason}"</div>}
                </div>
                <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                  r.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                    : r.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                }`}>{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reqModal && (
        <RequestEditModal
          mode={reqModal.mode}
          entry={reqModal.entry}
          uid={uid}
          userName={userName}
          userEmail={userEmail}
          onClose={() => setReqModal(null)}
        />
      )}
    </div>
  );
}

// ─── Staff: request a correction / missing punch ───────────────────────────
function RequestEditModal({
  mode, entry, uid, userName, userEmail, onClose,
}: {
  mode: 'edit' | 'add';
  entry: TimeEntry | null;
  uid: string;
  userName: string;
  userEmail: string;
  onClose: () => void;
}) {
  const base = entry ? entry.clockIn.toDate() : (() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d; })();
  const baseOut = entry?.clockOut ? entry.clockOut.toDate() : (entry ? null : new Date(base.getTime() + 8 * 3600_000));
  const [clockIn, setClockIn] = useState(toLocalInput(base));
  const [clockOut, setClockOut] = useState(baseOut ? toLocalInput(baseOut) : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!clockIn) { setErr('Clock-in time is required.'); return; }
    if (!reason.trim()) { setErr('Please add a short reason for the manager.'); return; }
    setSaving(true);
    try {
      await TC.createEditRequest({
        userId: uid, userName, userEmail,
        entryId: mode === 'edit' ? entry?.id : null,
        type: mode,
        currentClockIn: entry?.clockIn ?? null,
        currentClockOut: entry?.clockOut ?? null,
        proposedClockIn: new Date(clockIn),
        proposedClockOut: clockOut ? new Date(clockOut) : null,
        reason: reason.trim(),
      });
      onClose();
    } catch (e) {
      console.error('[TimeClock] request failed', e);
      setErr('Could not submit. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{mode === 'edit' ? 'Request a correction' : 'Request missing time'}</h3>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          A manager will review and apply this change.
          {mode === 'edit' && entry && (
            <span className="block mt-1 text-slate-400">Current: {TC.fmtTime(entry.clockIn)} → {entry.clockOut ? TC.fmtTime(entry.clockOut) : '—'}</span>
          )}
        </p>
        {err && <div className="mb-3 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{err}</div>}
        <div className="space-y-3">
          <label className="block text-xs text-slate-500 dark:text-slate-400">Correct clock in
            <input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
          </label>
          <label className="block text-xs text-slate-500 dark:text-slate-400">Correct clock out (blank = still open)
            <input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
          </label>
          <label className="block text-xs text-slate-500 dark:text-slate-400">Reason
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Forgot to clock out after my shift" className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 resize-none" />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={submit} disabled={saving} className="text-sm px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium">{saving ? 'Submitting…' : 'Submit request'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Manager view ──────────────────────────────────────────────────────────
function ManageTab({ now, editor }: { now: number; editor: { uid: string; name: string; role: string } }) {
  const [manageView, setManageView] = useState<'records' | 'log'>('records');
  const [auditRows, setAuditRows] = useState<AuditEntry[]>([]);
  useEffect(() => {
    if (manageView !== 'log') return;
    return TC.subscribeAudit(setAuditRows);
  }, [manageView]);
  const [weekStart, setWeekStart] = useState(() => TC.startOfWeek(new Date()));
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [filterDept, setFilterDept] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [editing, setEditing] = useState<{ id: string; clockIn: string; clockOut: string } | null>(null);
  const [adding, setAdding] = useState(false);
  // Custom date range — overrides the week view when both ends are set.
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const customRange = !!(rangeStart && rangeEnd);
  const [pendingReqs, setPendingReqs] = useState<EditRequest[]>([]);

  useEffect(() => {
    if (customRange) {
      const s = new Date(rangeStart + 'T00:00:00');
      const e = new Date(rangeEnd + 'T23:59:59');
      return TC.subscribeRange(s, e, setEntries);
    }
    return TC.subscribeAllWeek(weekStart, setEntries);
  }, [weekStart, customRange, rangeStart, rangeEnd]);

  useEffect(() => {
    TC.fetchUsers().then(setUsers).catch((e) => console.warn('[TimeClock] fetchUsers', e));
  }, []);
  useEffect(() => TC.subscribePendingRequests(setPendingReqs), []);

  // uid → department, plus the distinct department list (from the user directory).
  const deptByUid = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) if (u.uid) m.set(u.uid, (u.department || '').trim());
    return m;
  }, [users]);
  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const u of users) { const d = (u.department || '').trim(); if (d) s.add(d); }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [users]);

  // Changing the department scope resets the employee filter.
  useEffect(() => { setFilterUser('all'); }, [filterDept]);

  // Apply the department filter first, then the per-employee filter.
  const deptMatched = filterDept === 'all'
    ? entries
    : entries.filter((e) => (deptByUid.get(e.userId) || '') === filterDept);
  const visible = filterUser === 'all'
    ? deptMatched
    : deptMatched.filter((e) => e.userId === filterUser);

  // Group by user for per-employee totals.
  const groups = useMemo(() => {
    const m = new Map<string, { userId: string; name: string; department: string; entries: TimeEntry[]; total: number }>();
    for (const e of visible) {
      const g = m.get(e.userId) || { userId: e.userId, name: e.userName, department: deptByUid.get(e.userId) || '', entries: [], total: 0 };
      g.entries.push(e);
      g.total += TC.entryDurationMs(e, now);
      m.set(e.userId, g);
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [visible, now, deptByUid]);

  const saveEdit = async () => {
    if (!editing) return;
    const orig = entries.find((e) => e.id === editing.id);
    const newIn = new Date(editing.clockIn);
    const newOut = editing.clockOut ? new Date(editing.clockOut) : null;
    await TC.updateEntry(editing.id, { clockIn: newIn, clockOut: newOut }, editor.uid);
    await TC.logAudit({
      action: 'edit_entry', actor: editor,
      targetUserId: orig?.userId || '', targetUserName: orig?.userName || '',
      entryId: editing.id,
      before: orig ? { clockIn: orig.clockIn, clockOut: orig.clockOut } : null,
      after: { clockIn: Timestamp.fromDate(newIn), clockOut: newOut ? Timestamp.fromDate(newOut) : null },
    });
    setEditing(null);
  };

  const [confirmDelete, setConfirmDelete] = useState<TimeEntry | null>(null);
  const [rejectReq, setRejectReq] = useState<EditRequest | null>(null);

  const confirmDeleteEntry = async () => {
    const e = confirmDelete;
    if (!e) return;
    setConfirmDelete(null);
    await TC.deleteEntry(e.id);
    await TC.logAudit({
      action: 'delete_entry', actor: editor,
      targetUserId: e.userId, targetUserName: e.userName, entryId: e.id,
      before: { clockIn: e.clockIn, clockOut: e.clockOut },
    });
  };

  const approve = async (req: EditRequest) => {
    try {
      await TC.approveRequest(req, editor.uid);
      await TC.logAudit({
        action: 'approve_request', actor: editor,
        targetUserId: req.userId, targetUserName: req.userName,
        entryId: req.entryId || null, requestId: req.id,
        before: { clockIn: req.currentClockIn || null, clockOut: req.currentClockOut || null },
        after: { clockIn: req.proposedClockIn, clockOut: req.proposedClockOut },
        note: req.reason,
      });
    } catch (e) { console.error('[TimeClock] approve failed', e); }
  };
  const doReject = async (req: EditRequest, note: string) => {
    setRejectReq(null);
    try {
      await TC.rejectRequest(req.id, editor.uid, note);
      await TC.logAudit({
        action: 'reject_request', actor: editor,
        targetUserId: req.userId, targetUserName: req.userName, requestId: req.id,
        note: note || req.reason,
      });
    } catch (e) { console.error('[TimeClock] reject failed', e); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Records / Change Log toggle */}
      <div className="flex items-center gap-1 mb-4 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
        {([['records', 'Records'], ['log', 'Change Log']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setManageView(id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${manageView === id ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {manageView === 'log' ? (
        <ChangeLogTable rows={auditRows} />
      ) : (
      <>
      {/* Pending correction requests */}
      {pendingReqs.length > 0 && (
        <div className="mb-5 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-900/30 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2">
            <Pencil size={15} /> Pending correction requests <span className="text-xs font-medium">· {pendingReqs.length}</span>
          </h3>
          <ul className="space-y-2">
            {pendingReqs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {r.userName} <span className="text-slate-400 font-normal">· {r.type === 'add' ? 'add punch' : 'edit'}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {r.type === 'edit' && r.currentClockIn && (
                      <span className="line-through mr-1 text-slate-400">{TC.fmtDateTime(r.currentClockIn)} → {r.currentClockOut ? TC.fmtDateTime(r.currentClockOut) : '—'}</span>
                    )}
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium">{TC.fmtDateTime(r.proposedClockIn)} → {r.proposedClockOut ? TC.fmtDateTime(r.proposedClockOut) : '—'}</span>
                  </div>
                  {r.reason && <div className="text-xs text-slate-400 italic truncate">"{r.reason}"</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => approve(r)} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"><Check size={13} /> Approve</button>
                  <button onClick={() => setRejectReq(r)} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={13} /> Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        {customRange ? (
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{rangeStart} → {rangeEnd}</div>
        ) : (
          <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
        )}
        <div className="flex items-center gap-2">
          {departments.length > 0 && (
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              <option value="all">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            <option value="all">All employees</option>
            {Array.from(new Map(deptMatched.map((e) => [e.userId, e.userName])).entries()).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
          >
            <Plus size={15} /> Add entry
          </button>
        </div>
      </div>

      {/* Custom date-range filter + total for the current selection */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <CalendarDays size={15} className="text-slate-400" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Date range:</span>
        <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
        <span className="text-slate-400">→</span>
        <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
        {customRange && (
          <button onClick={() => { setRangeStart(''); setRangeEnd(''); }} className="text-xs px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">Clear → week</button>
        )}
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          {filterUser !== 'all' ? 'Selected total' : 'Filtered total'}:{' '}
          <strong className="text-slate-800 dark:text-slate-100 tabular-nums">{TC.fmtDuration(visible.reduce((s, e) => s + TC.entryDurationMs(e, now), 0))}</strong>
        </span>
      </div>

      {adding && (
        <AddEntryForm users={users} editor={editor} defaultDate={weekStart} onClose={() => setAdding(false)} />
      )}

      {groups.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500 text-sm">No entries for this week.</div>
      ) : (
        groups.map((g) => (
          <div key={g.userId} className="mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <span className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">{g.name}</span>
                {g.department && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{g.department}</span>
                )}
              </span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{TC.fmtDuration(g.total)}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 dark:text-slate-500">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Clock In</th>
                  <th className="px-2 py-2 font-medium">Clock Out</th>
                  <th className="px-2 py-2 font-medium">Duration</th>
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {g.entries.map((e) => {
                  const isEditing = editing?.id === e.id;
                  return (
                    <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{fmtDayLabel(e.clockIn.toDate())}</td>
                      {isEditing ? (
                        <>
                          <td className="px-2 py-2">
                            <input
                              type="datetime-local"
                              value={editing!.clockIn}
                              onChange={(ev) => setEditing({ ...editing!, clockIn: ev.target.value })}
                              className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="datetime-local"
                              value={editing!.clockOut}
                              onChange={(ev) => setEditing({ ...editing!, clockOut: ev.target.value })}
                              className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                            />
                          </td>
                          <td className="px-2 py-2 text-slate-400">—</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={saveEdit} className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" title="Save"><Check size={15} /></button>
                              <button onClick={() => setEditing(null)} className="p-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Cancel"><X size={15} /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{TC.fmtTime(e.clockIn)}</td>
                          <td className="px-2 py-2 text-slate-600 dark:text-slate-300">
                            {e.clockOut ? TC.fmtTime(e.clockOut) : <span className="text-emerald-600 dark:text-emerald-400">in progress</span>}
                          </td>
                          <td className="px-2 py-2 tabular-nums text-slate-500 dark:text-slate-400">
                            {TC.fmtDuration(TC.entryDurationMs(e, now))}
                            {e.edited && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">edited</span>}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setEditing({
                                  id: e.id,
                                  clockIn: toLocalInput(e.clockIn.toDate()),
                                  clockOut: e.clockOut ? toLocalInput(e.clockOut.toDate()) : '',
                                })}
                                className="p-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Edit"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                onClick={() => setConfirmDelete(e)}
                                className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                                title="Delete"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
      </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this entry?"
          message="This removes the punch record. The change is recorded in the Change Log."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDeleteEntry}
          onClose={() => setConfirmDelete(null)}
        />
      )}
      {rejectReq && (
        <RejectDialog req={rejectReq} onReject={(note) => doReject(rejectReq, note)} onClose={() => setRejectReq(null)} />
      )}
    </div>
  );
}

// ─── Styled confirm + reject dialogs ────────────────────────────────────────
function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }: { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void; }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${danger ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium">Cancel</button>
          <button onClick={onConfirm} className={`text-sm px-4 py-1.5 rounded-lg text-white font-medium shadow-lg ${danger ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function RejectDialog({ req, onReject, onClose }: { req: EditRequest; onReject: (note: string) => void; onClose: () => void; }) {
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Reject {req.userName}'s request</h3>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <label className="block text-xs text-slate-500 dark:text-slate-400">Reason (optional — shared with the employee)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. Times don't match the schedule" className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 resize-none" />
        </label>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium">Cancel</button>
          <button onClick={() => onReject(note.trim())} className="text-sm px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium shadow-lg shadow-rose-500/20">Reject request</button>
        </div>
      </div>
    </div>
  );
}

// ─── Change log (immutable audit trail) ────────────────────────────────────
function ChangeLogTable({ rows }: { rows: AuditEntry[] }) {
  const actionMeta: Record<AuditEntry['action'], { label: string; cls: string }> = {
    add_entry: { label: 'Added', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    edit_entry: { label: 'Edited', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    delete_entry: { label: 'Deleted', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
    approve_request: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
    reject_request: { label: 'Rejected', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  };
  const fmtRange = (ci?: Timestamp | null, co?: Timestamp | null) =>
    ci ? `${TC.fmtDateTime(ci)} → ${co ? TC.fmtDateTime(co) : '—'}` : '';

  if (rows.length === 0) {
    return <div className="text-center py-16 text-slate-400 dark:text-slate-500 text-sm">No changes recorded yet.</div>;
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-2 py-2.5 font-medium">Action</th>
              <th className="px-2 py-2.5 font-medium">Employee</th>
              <th className="px-2 py-2.5 font-medium">Change</th>
              <th className="px-2 py-2.5 font-medium">By</th>
              <th className="px-4 py-2.5 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => {
              const m = actionMeta[r.action];
              const before = fmtRange(r.beforeClockIn, r.beforeClockOut);
              const after = fmtRange(r.afterClockIn, r.afterClockOut);
              return (
                <tr key={r.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400">{TC.fmtDateTime(r.createdAt)}</td>
                  <td className="px-2 py-2.5"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${m?.cls || ''}`}>{m?.label || r.action}</span></td>
                  <td className="px-2 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">{r.targetUserName || '—'}</td>
                  <td className="px-2 py-2.5 text-xs">
                    {before && <div className="text-slate-400 line-through whitespace-nowrap">{before}</div>}
                    {after && <div className="text-indigo-600 dark:text-indigo-400 font-medium whitespace-nowrap">{after}</div>}
                    {!before && !after && <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <span className="text-slate-700 dark:text-slate-200">{r.actorName || '—'}</span>
                    {r.actorRole && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{roleLabel(r.actorRole)}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 max-w-[220px]">{r.note ? <span className="line-clamp-2">{r.note}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Manager: add manual entry ─────────────────────────────────────────────
function AddEntryForm({
  users, editor, defaultDate, onClose,
}: {
  users: DirectoryUser[];
  editor: { uid: string; name: string; role: string };
  defaultDate: Date;
  onClose: () => void;
}) {
  const base = new Date(defaultDate);
  base.setHours(9, 0, 0, 0);
  const [userId, setUserId] = useState(users[0]?.uid || '');
  const [clockIn, setClockIn] = useState(toLocalInput(base));
  const [clockOut, setClockOut] = useState(toLocalInput(new Date(base.getTime() + 8 * 3600_000)));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!userId && users[0]) setUserId(users[0].uid); }, [users, userId]);

  const save = async () => {
    const u = users.find((x) => x.uid === userId);
    if (!u || saving) return;
    setSaving(true);
    try {
      const inDate = new Date(clockIn);
      const outDate = clockOut ? new Date(clockOut) : null;
      await TC.addManualEntry({
        userId: u.uid,
        userName: u.name,
        userEmail: u.email,
        clockIn: inDate,
        clockOut: outDate,
        note: note.trim(),
        editorUid: editor.uid,
      });
      await TC.logAudit({
        action: 'add_entry', actor: editor,
        targetUserId: u.uid, targetUserName: u.name,
        after: { clockIn: Timestamp.fromDate(inDate), clockOut: outDate ? Timestamp.fromDate(outDate) : null },
        note: note.trim(),
      });
      onClose();
    } catch (e) {
      console.error('[TimeClock] add entry failed', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 bg-white dark:bg-slate-900 rounded-xl border border-indigo-200 dark:border-indigo-800 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Add manual entry</h3>
        <button onClick={onClose} className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-slate-500 dark:text-slate-400">
          Employee
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
            {users.length === 0 && <option value="">No users found</option>}
            {users.map((u) => <option key={u.uid} value={u.uid}>{u.name}{u.department ? ` · ${u.department}` : ''}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500 dark:text-slate-400">
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
        </label>
        <label className="text-xs text-slate-500 dark:text-slate-400">
          Clock In
          <input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
        </label>
        <label className="text-xs text-slate-500 dark:text-slate-400">
          Clock Out (blank = open)
          <input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
        <button onClick={save} disabled={saving || !userId} className="text-sm px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium">Save entry</button>
      </div>
    </div>
  );
}
