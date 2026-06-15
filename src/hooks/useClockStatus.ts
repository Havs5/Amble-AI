'use client';

import { useEffect, useState } from 'react';
import { auth as fbAuth } from '@/lib/firebase';
import { useAuth } from '@/components/auth/AuthContextRefactored';
import { subscribeOpenEntry } from '@/services/timeclock/TimeClockService';

/**
 * Current user's clock status. "Online" === currently clocked in (has an open
 * `time_entries` doc). Drives the sidebar logo dot + the dashboard indicator.
 * Sourced from the user's OWN open entry (the source of truth), so it works
 * even if the presence mirror hasn't been written yet.
 */
export function useClockStatus() {
  const { user } = useAuth();
  const uid = fbAuth?.currentUser?.uid || (user as any)?.uid || user?.id || '';
  const [online, setOnline] = useState(false);
  const [since, setSince] = useState<Date | null>(null);

  useEffect(() => {
    if (!uid) {
      setOnline(false);
      setSince(null);
      return;
    }
    return subscribeOpenEntry(uid, (entry) => {
      setOnline(!!entry);
      setSince(entry ? entry.clockIn.toDate() : null);
    });
  }, [uid]);

  return { online, since };
}
