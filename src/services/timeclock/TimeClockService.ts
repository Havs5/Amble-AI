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
  setDoc,
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

/** A teammate who is currently clocked in (from the `presence` mirror). */
export interface OnlineUser {
  uid: string;
  name: string;
  email?: string;
  department?: string;
  since: Timestamp | null; // when they clocked in
}

/** A staff-submitted request to correct (edit) or add a punch, for manager review. */
export interface EditRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  entryId?: string | null;            // existing entry (edit) or null (add)
  type: 'edit' | 'add';
  currentClockIn?: Timestamp | null;  // snapshot for context
  currentClockOut?: Timestamp | null;
  proposedClockIn: Timestamp;
  proposedClockOut: Timestamp | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
  reviewedBy?: string;
  reviewedAt?: Timestamp | null;
  reviewNote?: string;
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

export function fmtDateTime(ts: Timestamp | null): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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

/** Every user's entries within an arbitrary [start, end] range (manager view). */
export function subscribeRange(start: Date, end: Date, cb: (entries: TimeEntry[]) => void): () => void {
  if (!db) return () => {};
  const q = query(
    collection(db, COL),
    where('clockIn', '>=', Timestamp.fromDate(start)),
    where('clockIn', '<=', Timestamp.fromDate(end)),
    orderBy('clockIn', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(mapDoc)),
    (err) => {
      console.warn('[TimeClock] range subscription error', err);
      cb([]);
    }
  );
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export async function clockIn(p: { userId: string; userName: string; userEmail?: string; department?: string; note?: string }) {
  const ref = await addDoc(collection(db, COL), {
    userId: p.userId,
    userName: p.userName,
    userEmail: p.userEmail || '',
    clockIn: Timestamp.now(),
    clockOut: null,
    note: p.note || '',
    createdAt: Timestamp.now(),
  });
  // Mirror to presence so teammates see the user as online (best-effort).
  setPresence({ uid: p.userId, name: p.userName, email: p.userEmail, department: p.department, online: true }).catch(() => {});
  return ref;
}

export async function clockOut(entryId: string, who?: { uid: string; name: string; email?: string; department?: string }) {
  const res = await updateDoc(doc(db, COL, entryId), { clockOut: Timestamp.now() });
  if (who?.uid) {
    setPresence({ uid: who.uid, name: who.name, email: who.email, department: who.department, online: false }).catch(() => {});
  }
  return res;
}

// ─── Presence mirror (team "who's online") ─────────────────────────────────
// Truth for "on the clock" is an open `time_entries` doc; `presence/{uid}` is a
// world-readable mirror so non-admins can see the online board without reading
// everyone's time entries. Each user writes only their own presence doc.

export async function setPresence(p: {
  uid: string; name: string; email?: string; department?: string; online: boolean; since?: Date;
}) {
  if (!db || !p.uid) return;
  return setDoc(
    doc(db, 'presence', p.uid),
    {
      uid: p.uid,
      name: p.name || '',
      email: p.email || '',
      department: p.department || '',
      online: p.online,
      since: p.online ? Timestamp.fromDate(p.since || new Date()) : null,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/** Everyone currently clocked in (presence.online == true). */
export function subscribeOnlineUsers(cb: (users: OnlineUser[]) => void): () => void {
  if (!db) return () => {};
  const q = query(collection(db, 'presence'), where('online', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const users = snap.docs
        .map((d) => {
          const u = d.data() as any;
          return {
            uid: u.uid || d.id,
            name: u.name || 'User',
            email: u.email || '',
            department: u.department || '',
            since: u.since || null,
          } as OnlineUser;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      cb(users);
    },
    (err) => {
      console.warn('[TimeClock] online-users subscription error', err);
      cb([]);
    }
  );
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

// ─── Time-edit requests (staff → manager) ──────────────────────────────────
const REQ = 'time_edit_requests';

function mapReq(d: any): EditRequest {
  return { id: d.id, ...(d.data() as Omit<EditRequest, 'id'>) };
}

/** Staff submits a correction (edit an entry) or addition (missing punch). */
export async function createEditRequest(p: {
  userId: string; userName: string; userEmail?: string;
  entryId?: string | null; type: 'edit' | 'add';
  currentClockIn?: Timestamp | null; currentClockOut?: Timestamp | null;
  proposedClockIn: Date; proposedClockOut: Date | null; reason: string;
}) {
  return addDoc(collection(db, REQ), {
    userId: p.userId,
    userName: p.userName,
    userEmail: p.userEmail || '',
    entryId: p.entryId || null,
    type: p.type,
    currentClockIn: p.currentClockIn || null,
    currentClockOut: p.currentClockOut || null,
    proposedClockIn: Timestamp.fromDate(p.proposedClockIn),
    proposedClockOut: p.proposedClockOut ? Timestamp.fromDate(p.proposedClockOut) : null,
    reason: p.reason || '',
    status: 'pending',
    createdAt: Timestamp.now(),
  });
}

/** A user's own correction requests (newest first). */
export function subscribeMyRequests(userId: string, cb: (reqs: EditRequest[]) => void): () => void {
  if (!db || !userId) return () => {};
  const q = query(collection(db, REQ), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(mapReq).sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())),
    (err) => { console.warn('[TimeClock] my-requests error', err); cb([]); }
  );
}

/** All pending requests (manager review queue, oldest first). */
export function subscribePendingRequests(cb: (reqs: EditRequest[]) => void): () => void {
  if (!db) return () => {};
  const q = query(collection(db, REQ), where('status', '==', 'pending'));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(mapReq).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())),
    (err) => { console.warn('[TimeClock] pending-requests error', err); cb([]); }
  );
}

/** Manager approves: apply the change to time_entries, then mark approved. */
export async function approveRequest(req: EditRequest, reviewerUid: string) {
  if (req.type === 'add') {
    await addManualEntry({
      userId: req.userId,
      userName: req.userName,
      userEmail: req.userEmail,
      clockIn: req.proposedClockIn.toDate(),
      clockOut: req.proposedClockOut ? req.proposedClockOut.toDate() : null,
      note: 'Approved correction request',
      editorUid: reviewerUid,
    });
  } else if (req.entryId) {
    await updateEntry(
      req.entryId,
      { clockIn: req.proposedClockIn.toDate(), clockOut: req.proposedClockOut ? req.proposedClockOut.toDate() : null },
      reviewerUid
    );
  }
  return updateDoc(doc(db, REQ, req.id), {
    status: 'approved', reviewedBy: reviewerUid, reviewedAt: Timestamp.now(),
  });
}

/** Manager rejects with an optional note. */
export async function rejectRequest(reqId: string, reviewerUid: string, note?: string) {
  return updateDoc(doc(db, REQ, reqId), {
    status: 'rejected', reviewedBy: reviewerUid, reviewedAt: Timestamp.now(), reviewNote: note || '',
  });
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
