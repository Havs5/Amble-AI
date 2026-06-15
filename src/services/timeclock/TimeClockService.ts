/**
 * TimeClockService — employee punch in/out + manager timesheet management.
 *
 * Backed by the Firestore `time_entries` collection. One document per punch
 * pair: `clockIn` set on punch-in, `clockOut` stays `null` until punch-out
 * (so an open entry == currently clocked in).
 *
 * Security: see firestore.rules `time_entries` — a user reads/writes their own
 * entries; admins (role admin/superadmin) read/write everyone's.
 */
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  Timestamp,
} from 'firebase/firestore';

const COL = 'time_entries';

export interface TimeEntry {
  id: string;
  userId: string; // Firebase Auth uid (must equal request.auth.uid on create)
  userName: string;
  userEmail?: string;
  clockIn: Timestamp;
  clockOut: Timestamp | null;
  note?: string;
  edited?: boolean;
  editedBy?: string;
  editedAt?: Timestamp;
  createdAt?: Timestamp;
}

export interface DirectoryUser {
  id: string;
  uid: string;
  name: string;
  email: string;
  department?: string;
}

// ─── Week helpers (week runs Monday → Sunday) ──────────────────────────────
export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  x.setDate(x.getDate() - dow);
  return x;
}

export function endOfWeek(d: Date): Date {
  const e = startOfWeek(d);
  e.setDate(e.getDate() + 7);
  e.setMilliseconds(-1); // Sunday 23:59:59.999
  return e;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function entryDurationMs(e: TimeEntry, now = Date.now()): number {
  const start = e.clockIn.toDate().getTime();
  const end = e.clockOut ? e.clockOut.toDate().getTime() : now;
  return Math.max(0, end - start);
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

export function fmtTime(ts: Timestamp | null): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function mapDoc(d: any): TimeEntry {
  return { id: d.id, ...(d.data() as Omit<TimeEntry, 'id'>) };
}

// ─── Realtime subscriptions ────────────────────────────────────────────────

// NOTE: user-scoped subscriptions query by `userId` equality only (a single
// auto-created index) and then filter/sort in the client. This avoids any
// dependency on composite indexes being built and works the instant the
// feature ships. A user's entry count is small (a few punches per day).

/** Current open (un-punched-out) entry for a user, or null. */
export function subscribeOpenEntry(userId: string, cb: (entry: TimeEntry | null) => void): () => void {
  if (!db || !userId) return () => {};
  const q = query(collection(db, COL), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const open = snap.docs
        .map(mapDoc)
        .filter((e) => e.clockOut == null)
        .sort((a, b) => b.clockIn.toMillis() - a.clockIn.toMillis())[0] || null;
      cb(open);
    },
    (err) => {
      console.warn('[TimeClock] open-entry subscription error', err);
      cb(null);
    }
  );
}

/** All of one user's entries for the week containing `weekStart`. */
export function subscribeUserWeek(userId: string, weekStart: Date, cb: (entries: TimeEntry[]) => void): () => void {
  if (!db || !userId) return () => {};
  const s = startOfWeek(weekStart).getTime();
  const e = endOfWeek(weekStart).getTime();
  const q = query(collection(db, COL), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const entries = snap.docs
        .map(mapDoc)
        .filter((en) => {
          const t = en.clockIn.toMillis();
          return t >= s && t <= e;
        })
        .sort((a, b) => a.clockIn.toMillis() - b.clockIn.toMillis());
      cb(entries);
    },
    (err) => {
      console.warn('[TimeClock] user-week subscription error', err);
      cb([]);
    }
  );
}

/** Every user's entries for the week (manager view). */
export function subscribeAllWeek(weekStart: Date, cb: (entries: TimeEntry[]) => void): () => void {
  if (!db) return () => {};
  const q = query(
    collection(db, COL),
    where('clockIn', '>=', Timestamp.fromDate(startOfWeek(weekStart))),
    where('clockIn', '<=', Timestamp.fromDate(endOfWeek(weekStart))),
    orderBy('clockIn', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(mapDoc)),
    (err) => {
      console.warn('[TimeClock] all-week subscription error', err);
      cb([]);
    }
  );
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export async function clockIn(p: { userId: string; userName: string; userEmail?: string; note?: string }) {
  return addDoc(collection(db, COL), {
    userId: p.userId,
    userName: p.userName,
    userEmail: p.userEmail || '',
    clockIn: Timestamp.now(),
    clockOut: null,
    note: p.note || '',
    createdAt: Timestamp.now(),
  });
}

export async function clockOut(entryId: string) {
  return updateDoc(doc(db, COL, entryId), { clockOut: Timestamp.now() });
}

/** Manager/self adjustment of an existing entry's times or note. */
export async function updateEntry(
  entryId: string,
  patch: { clockIn?: Date; clockOut?: Date | null; note?: string },
  editorUid: string
) {
  const data: Record<string, unknown> = { edited: true, editedBy: editorUid, editedAt: Timestamp.now() };
  if (patch.clockIn) data.clockIn = Timestamp.fromDate(patch.clockIn);
  if (patch.clockOut !== undefined) data.clockOut = patch.clockOut ? Timestamp.fromDate(patch.clockOut) : null;
  if (patch.note !== undefined) data.note = patch.note;
  return updateDoc(doc(db, COL, entryId), data);
}

/** Manager-created entry for any employee. */
export async function addManualEntry(p: {
  userId: string;
  userName: string;
  userEmail?: string;
  clockIn: Date;
  clockOut: Date | null;
  note?: string;
  editorUid: string;
}) {
  return addDoc(collection(db, COL), {
    userId: p.userId,
    userName: p.userName,
    userEmail: p.userEmail || '',
    clockIn: Timestamp.fromDate(p.clockIn),
    clockOut: p.clockOut ? Timestamp.fromDate(p.clockOut) : null,
    note: p.note || '',
    edited: true,
    editedBy: p.editorUid,
    editedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
  });
}

export async function deleteEntry(entryId: string) {
  return deleteDoc(doc(db, COL, entryId));
}

/** Directory of users for the manager's "add entry for employee" picker. */
export async function fetchUsers(): Promise<DirectoryUser[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map((d) => {
      const u = d.data() as any;
      return {
        id: d.id,
        uid: u.uid || '',
        name: u.displayName || u.name || d.id,
        email: u.email || d.id,
        department: u.department || '',
      };
    })
    .filter((u) => u.uid) // need a Firebase uid to attribute entries
    .sort((a, b) => a.name.localeCompare(b.name));
}
