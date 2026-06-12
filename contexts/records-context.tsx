import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useOfflineGuard } from '@/contexts/offline-context';
import { db, collection, query, where, doc, setDoc, onSnapshot } from '@/lib/firebase/firestore';
import { addDays } from '@/lib/date-utils';
import type { HabitRecord, TripleValue, QuadValue } from '@/types/habit';

type Range = { start: string; end: string };

type RecordsContextValue = {
  /**
   * All loaded records, keyed by docId (`habitId_date`). Held as state (not a
   * ref) so React Compiler tracks it as the real dependency of consumer memos.
   */
  recordsMap: Map<string, HabitRecord>;
  /** Range covered by the last delivered snapshot, or null before first load. */
  loadedRange: Range | null;
  /**
   * True until the FIRST snapshot of the session (or account) delivers —
   * the boot signal screens gate on so tiles don't render "unrecorded" and
   * then pop to their real states. Window growth after that never flips it
   * back (already-loaded views keep their data).
   */
  isLoading: boolean;
  /**
   * Grow the shared window to cover [start, end]. Monotonic within a session
   * (never shrinks) — narrower views just filter recordsMap. Called by
   * consumers in an effect.
   */
  ensureRange: (start: string, end: string) => void;
  /**
   * Synchronous single lookup straight off the latest map (so rapid cycle/
   * toggle taps see their own optimistic write before the next render).
   */
  getRecordForDay: (habitId: string, date: string) => HabitRecord | undefined;
  recordHabit: (
    habitId: string,
    date: string,
    value: boolean | TripleValue | QuadValue | number | string,
  ) => void;
};

// Over-fetch this many days past the earliest requested date when the window
// grows backward, so sustained day-by-day back-swiping on the habits home
// loads in batches instead of re-subscribing per day. Trades a bounded
// up-front read for far fewer listener churns (the explicit perf ask).
const SWIPE_CHUNK_DAYS = 30;

const noopRecordsContext: RecordsContextValue = {
  recordsMap: new Map(),
  loadedRange: null,
  isLoading: true,
  ensureRange: () => {},
  getRecordForDay: () => undefined,
  recordHabit: () => {},
};

const RecordsContext = createContext<RecordsContextValue>(noopRecordsContext);

/**
 * Single app-wide records listener over a monotonic "union" window. Every
 * date-parameterized view (today/day-swipe, week, month, 30-day quests,
 * ~3-year stats) registers its range via ensureRange; the provider keeps one
 * onSnapshot covering the widest active window and serves narrower views by
 * in-memory filtering. Because tabs stay mounted, this is strictly fewer
 * listeners than the old per-screen hooks, and a day-swipe within the loaded
 * window no longer tears down + reopens a listener.
 *
 * Records track no offline state today (the habits screen reads offline from
 * useHabits), so this uses a plain onSnapshot to match.
 */
export function RecordsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { requireOnline } = useOfflineGuard();

  // Master store. `recordsMap` is state (drives consumer memos under React
  // Compiler); `recordsMapRef` mirrors it so optimistic writes + cycle helpers
  // can read/update the latest value synchronously without waiting on a render.
  const [recordsMap, setRecordsMapState] = useState<Map<string, HabitRecord>>(new Map());
  const recordsMapRef = useRef<Map<string, HabitRecord>>(recordsMap);
  const setRecordsMap = useCallback((map: Map<string, HabitRecord>) => {
    recordsMapRef.current = map;
    setRecordsMapState(map);
  }, []);

  // Range covered by the last delivered snapshot. Updated only when a snapshot
  // arrives (never cleared on re-subscribe) so widening the window doesn't
  // flash consumers already inside the previously-loaded range.
  const [loadedRange, setLoadedRange] = useState<Range | null>(null);

  // The active subscription window. `windowRef` is the synchronous source of
  // truth (so concurrent ensureRange calls in one tick compose); `windowState`
  // mirrors it to drive the subscribe effect.
  const windowRef = useRef<Range | null>(null);
  const [windowState, setWindowState] = useState<Range | null>(null);

  const ensureRange = useCallback((start: string, end: string) => {
    if (!start || !end) return;
    const cur = windowRef.current;
    let newStart: string;
    let newEnd: string;
    if (cur) {
      // Grow-only. Extend the start back by a chunk when it moves earlier.
      newStart = start < cur.start ? addDays(start, -SWIPE_CHUNK_DAYS) : cur.start;
      newEnd = end > cur.end ? end : cur.end;
      if (newStart === cur.start && newEnd === cur.end) return;
    } else {
      // First registration — seed the backward swipe buffer too.
      newStart = addDays(start, -SWIPE_CHUNK_DAYS);
      newEnd = end;
    }
    const next = { start: newStart, end: newEnd };
    windowRef.current = next;
    setWindowState(next);
  }, []);

  // Track the account the cached records belong to, so we can drop them when
  // the account changes before the new listener delivers (no cross-account leak).
  const lastUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      lastUidRef.current = null;
      if (recordsMapRef.current.size > 0) setRecordsMap(new Map());
      setLoadedRange(null);
      return;
    }

    if (lastUidRef.current !== user.uid) {
      // New account: drop the prior account's records so a stale range can't
      // leak across the re-subscribe gap. (Window may persist; it just reloads
      // for the new user — harmless.)
      if (recordsMapRef.current.size > 0) setRecordsMap(new Map());
      setLoadedRange(null);
      lastUidRef.current = user.uid;
    }

    const win = windowState;
    if (!win) return; // nothing requested yet → no listener

    const q = query(
      collection(db, 'records'),
      where('userId', '==', user.uid),
      where('date', '>=', win.start),
      where('date', '<=', win.end),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // Rebuild from the full snapshot: the map then always equals exactly
        // the current query result (no stale/cross-account docs, no per-delta
        // removed-doc bookkeeping). Equivalent cost to the old per-screen
        // listeners, now fired once instead of N times.
        const map = new Map<string, HabitRecord>();
        for (const d of snapshot.docs) {
          map.set(d.id, { id: d.id, ...d.data() } as HabitRecord);
        }
        setRecordsMap(map);
        setLoadedRange({ start: win.start, end: win.end });
      },
      (error) => {
        console.error('[records] snapshot error:', error);
        // Mark the window delivered so gated screens fall through to their
        // normal render instead of spinning forever on a failed listener.
        setLoadedRange({ start: win.start, end: win.end });
      },
    );

    return unsubscribe;
  }, [user, windowState, setRecordsMap]);

  const getRecordForDay = useCallback(
    (habitId: string, date: string) => recordsMapRef.current.get(`${habitId}_${date}`),
    [],
  );

  const recordHabit = useCallback<RecordsContextValue['recordHabit']>(
    (habitId, date, value) => {
      if (!user) return;
      // Same guard as every other user mutation: offline shows the shared
      // "No internet" alert and records nothing. Without it this was the
      // app's only unguarded write — the optimistic update made the tap look
      // recorded while the write sat in Firestore's memory-only cache,
      // silently lost on force-quit.
      if (!requireOnline()) return;
      const docId = `${habitId}_${date}`;
      const record: HabitRecord = {
        id: docId,
        habitId,
        userId: user.uid,
        date,
        value,
        recordedAt: Date.now(),
      };
      // Optimistic local update — instant feel + lets rapid cycle taps read
      // the latest value synchronously. The listener reconfirms shortly after.
      const next = new Map(recordsMapRef.current);
      next.set(docId, record);
      setRecordsMap(next);
      setDoc(doc(db, 'records', docId), record).catch((err) => {
        console.error('Failed to save habit record:', err);
      });
    },
    [user, requireOnline, setRecordsMap],
  );

  const value = useMemo(
    () => ({
      recordsMap,
      loadedRange,
      isLoading: loadedRange === null,
      ensureRange,
      getRecordForDay,
      recordHabit,
    }),
    [recordsMap, loadedRange, ensureRange, getRecordForDay, recordHabit],
  );

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}

export function useRecordsContext(): RecordsContextValue {
  return useContext(RecordsContext);
}
