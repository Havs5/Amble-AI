'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock, LogIn, LogOut, ChevronLeft, ChevronRight, Pencil, Trash2, Plus,
  Check, X, CalendarDays, Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContextRefactored';
import { auth as fbAuth } from '@/lib/firebase';
import * as TC from '@/services/timeclock/TimeClockService';
import type { TimeEntry, DirectoryUser } from '@/services/timeclock/TimeClockService';

type Tab = 'punch' | 'timecard' | 'manage';

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
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
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

  const doClockIn = async () => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      await TC.clockIn({ userId: uid, userName, userEmail, note: note.trim() });
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
      await TC.clockOut(openEntry.id);
    } catch (e) {
      console.error('[TimeClock] clock-out failed', e);
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'punch', label: 'Punch', icon: <Clock size={15} /> },
    { id: 'timecard', label: 'My Timecard', icon: <CalendarDays size={15} /> },
    ...(isAdmin ? [{ id: 'manage' as Tab, label: 'Manage', icon: <Users size={15} /> }] : []),
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
          />
        )}

        {tab === 'manage' && isAdmin && <ManageTab now={now} editorUid={uid} />}
      </div>
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
  entries, weekStart, setWeekStart, now,
}: {
  entries: TimeEntry[];
  weekStart: Date;
  setWeekStart: (d: Date) => void;
  now: number;
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
        <div className="text-right">
          <div className="text-xs text-slate-400 dark:text-slate-500">Week total</div>
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{TC.fmtDuration(weekMs)}</div>
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
                    <li key={e.id} className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-2">
                        {TC.fmtTime(e.clockIn)} → {e.clockOut ? TC.fmtTime(e.clockOut) : <span className="text-emerald-600 dark:text-emerald-400">in progress</span>}
                        {e.edited && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">edited</span>}
                        {e.note && <span className="text-xs text-slate-400 italic">· {e.note}</span>}
                      </span>
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">{TC.fmtDuration(TC.entryDurationMs(e, now))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Manager view ──────────────────────────────────────────────────────────
function ManageTab({ now, editorUid }: { now: number; editorUid: string }) {
  const [weekStart, setWeekStart] = useState(() => TC.startOfWeek(new Date()));
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [filterUser, setFilterUser] = useState<string>('all');
  const [editing, setEditing] = useState<{ id: string; clockIn: string; clockOut: string } | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => TC.subscribeAllWeek(weekStart, setEntries), [weekStart]);
  useEffect(() => {
    TC.fetchUsers().then(setUsers).catch((e) => console.warn('[TimeClock] fetchUsers', e));
  }, []);

  const visible = filterUser === 'all' ? entries : entries.filter((e) => e.userId === filterUser);

  // Group by user for per-employee totals.
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; entries: TimeEntry[]; total: number }>();
    for (const e of visible) {
      const g = m.get(e.userId) || { name: e.userName, entries: [], total: 0 };
      g.entries.push(e);
      g.total += TC.entryDurationMs(e, now);
      m.set(e.userId, g);
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [visible, now]);

  const saveEdit = async () => {
    if (!editing) return;
    await TC.updateEntry(
      editing.id,
      { clockIn: new Date(editing.clockIn), clockOut: editing.clockOut ? new Date(editing.clockOut) : null },
      editorUid
    );
    setEditing(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
        <div className="flex items-center gap-2">
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            <option value="all">All employees</option>
            {Array.from(new Map(entries.map((e) => [e.userId, e.userName])).entries()).map(([id, name]) => (
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

      {adding && (
        <AddEntryForm users={users} editorUid={editorUid} defaultDate={weekStart} onClose={() => setAdding(false)} />
      )}

      {groups.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500 text-sm">No entries for this week.</div>
      ) : (
        groups.map((g) => (
          <div key={g.name} className="mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">{g.name}</span>
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
                                onClick={() => { if (confirm('Delete this entry?')) TC.deleteEntry(e.id); }}
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
    </div>
  );
}

// ─── Manager: add manual entry ─────────────────────────────────────────────
function AddEntryForm({
  users, editorUid, defaultDate, onClose,
}: {
  users: DirectoryUser[];
  editorUid: string;
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
      await TC.addManualEntry({
        userId: u.uid,
        userName: u.name,
        userEmail: u.email,
        clockIn: new Date(clockIn),
        clockOut: clockOut ? new Date(clockOut) : null,
        note: note.trim(),
        editorUid,
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
            {users.map((u) => <option key={u.uid} value={u.uid}>{u.name}</option>)}
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
