import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useHabits } from '@/hooks/use-habits';
import { useTodayDate } from '@/hooks/use-today-date';
import {
  checkEarnedQuote,
  markEarnedQuoteSeen,
  recordActiveDay,
  type PendingEarnedQuote,
} from '@/lib/earned-quotes';

/**
 * Root-mounted null component that counts today as an active day no matter
 * which tab the session lives in. Without it, a notes-first launch (deep
 * link, notes-as-home) that never visits the habits tab would silently not
 * count — the habits screen is lazy-mounted. Counting is date-deduped and
 * serialized in lib/earned-quotes, so double-counting with the habits
 * screen's own check is impossible.
 */
export function ActiveDayTracker() {
  const { user } = useAuth();
  const { habits, isLoading } = useHabits();
  const { todayStr } = useTodayDate();
  const enabled = !isLoading && habits.length > 0;

  useEffect(() => {
    if (!enabled || !user) return;
    void recordActiveDay(user.uid, todayStr);
  }, [enabled, user, todayStr]);

  return null;
}

/**
 * Drives the milestone-quote reveal on the habits home. Counts today as an
 * active day (at most once — lib/earned-quotes dedupes by date) and surfaces
 * a quote when a 10-day milestone is crossed. `enabled` gates counting until
 * setup is done (the account has habits) and data has loaded.
 */
export function useEarnedQuote(enabled: boolean) {
  const { user } = useAuth();
  const { todayStr } = useTodayDate();
  const [pending, setPending] = useState<PendingEarnedQuote | null>(null);
  // Mirrors `pending` so dismiss is idempotent — a double-fired dismiss must
  // not increment shownCount twice and silently swallow a future quote.
  const pendingRef = useRef<PendingEarnedQuote | null>(null);

  useEffect(() => {
    if (!enabled || !user) return;
    let cancelled = false;
    checkEarnedQuote(user.uid, todayStr).then((q) => {
      if (!cancelled && q) {
        pendingRef.current = q;
        setPending(q);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, user, todayStr]);

  const dismiss = useCallback(() => {
    if (!pendingRef.current) return;
    pendingRef.current = null;
    setPending(null);
    if (user) markEarnedQuoteSeen(user.uid);
  }, [user]);

  return { pendingQuote: pending, dismissQuote: dismiss };
}
