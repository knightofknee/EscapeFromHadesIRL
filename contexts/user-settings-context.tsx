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
import { db, doc, setDoc } from '@/lib/firebase/firestore';
import { subscribeWithOfflineState } from '@/lib/firebase/subscribe';
// Type-only import (erased at compile time, so no runtime import cycle with
// the hook that re-reads this context). The SuccessColors shape + default
// palettes live in hooks/use-success-colors.ts because external components
// import the type from there.
import type { SuccessColors } from '@/hooks/use-success-colors';
import { parseBirthday } from '@/lib/win-only';
import type { WeekStart } from '@/lib/date-utils';

type UserSettingsContextValue = {
  /** Raw stored success-color overrides, or null when using the defaults. */
  successColors: SuccessColors | null;
  winOnlyWeekends: boolean;
  /** One global switch: show every habit's name on its tile (overrides the
   * per-habit showName when on). */
  showAllTileNames: boolean;
  /** Show 60-day badges and their status marks on habit tiles (default on). */
  showTileBadges: boolean;
  /** "MM-DD" or null. Its week is win-only for 60-day quests (lib/win-only). */
  birthday: string | null;
  /** First day of the week on every grid: 1 = Monday (default), 0 = Sunday. */
  weekStartsOn: WeekStart;
  /** Persist (or clear, with null) the success-color overrides. */
  setSuccessColors: (next: SuccessColors | null) => void;
  setWinOnlyWeekends: (value: boolean) => void;
  setShowAllTileNames: (value: boolean) => void;
  setShowTileBadges: (value: boolean) => void;
  setBirthday: (value: string | null) => void;
  setWeekStartsOn: (value: WeekStart) => void;
};

const UserSettingsContext = createContext<UserSettingsContextValue>({
  successColors: null,
  winOnlyWeekends: false,
  showAllTileNames: false,
  showTileBadges: true,
  birthday: null,
  weekStartsOn: 1,
  setSuccessColors: () => {},
  setWinOnlyWeekends: () => {},
  setShowAllTileNames: () => {},
  setShowTileBadges: () => {},
  setBirthday: () => {},
  setWeekStartsOn: () => {},
});

/**
 * Single app-wide subscription to the signed-in user's `userSettings/{uid}`
 * doc, folding what used to be two separate listeners (useSuccessColors +
 * useWinOnlyWeekends) into one — they always read the same doc. (The
 * OfflineProvider keeps its own independent heartbeat on this doc; it must
 * stay foundational, so it isn't merged here.) The scheme-dependent color
 * resolution stays in useSuccessColors(scheme); this provider only holds the
 * raw stored values + the write paths.
 */
export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { requireOnline } = useOfflineGuard();
  const [successColors, setSuccessColorsState] = useState<SuccessColors | null>(null);
  const [winOnlyWeekends, setWinOnlyWeekendsState] = useState(false);
  const [showAllTileNames, setShowAllTileNamesState] = useState(false);
  const [showTileBadges, setShowTileBadgesState] = useState(true);
  const [birthday, setBirthdayState] = useState<string | null>(null);
  const [weekStartsOn, setWeekStartsOnState] = useState<WeekStart>(1);

  useEffect(() => {
    if (!user) {
      setSuccessColorsState(null);
      setWinOnlyWeekendsState(false);
      setShowAllTileNamesState(false);
      setShowTileBadgesState(true);
      setBirthdayState(null);
      setWeekStartsOnState(1);
      return;
    }
    return subscribeWithOfflineState(
      doc(db, 'userSettings', user.uid),
      (snap) => {
        const data = snap.data();
        setSuccessColorsState(data?.successColors ? (data.successColors as SuccessColors) : null);
        setWinOnlyWeekendsState(data?.winOnlyWeekends === true);
        setShowAllTileNamesState(data?.showAllTileNames === true);
        // Stored as an opt-out so a missing field means on.
        setShowTileBadgesState(data?.hideTileBadges !== true);
        setBirthdayState(parseBirthday(data?.birthday));
        setWeekStartsOnState(data?.weekStartsOn === 0 ? 0 : 1);
      },
      // Offline state is owned by OfflineProvider's own heartbeat on this doc.
      { setOffline: () => {} },
    );
  }, [user]);

  // Coalesce rapid setting changes into a single merged write. Each setter
  // updates local state optimistically (immediate UI) and queues its field;
  // a short debounce flushes one setDoc(merge) for all pending fields — the
  // three settings used to fire three separate writes to the same doc.
  const pendingWritesRef = useRef<Record<string, unknown>>({});
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSettingWrite = useCallback(
    (fields: Record<string, unknown>) => {
      if (!user) return;
      Object.assign(pendingWritesRef.current, fields);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        const payload = pendingWritesRef.current;
        pendingWritesRef.current = {};
        if (Object.keys(payload).length === 0) return;
        setDoc(doc(db, 'userSettings', user.uid), payload, { merge: true }).catch((e) =>
          console.error('[userSettings] write failed', e),
        );
      }, 250);
    },
    [user],
  );

  // Clear any pending debounce timer on unmount so it can't fire a
  // stale-closure write after the provider is gone.
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  const setSuccessColors = useCallback(
    (next: SuccessColors | null) => {
      if (!user || !requireOnline()) return;
      setSuccessColorsState(next); // optimistic; the listener reconfirms
      queueSettingWrite({ successColors: next });
    },
    [user, requireOnline, queueSettingWrite],
  );

  const setWinOnlyWeekends = useCallback(
    (value: boolean) => {
      if (!user || !requireOnline()) return;
      setWinOnlyWeekendsState(value);
      queueSettingWrite({ winOnlyWeekends: value });
    },
    [user, requireOnline, queueSettingWrite],
  );

  const setShowAllTileNames = useCallback(
    (value: boolean) => {
      if (!user || !requireOnline()) return;
      setShowAllTileNamesState(value);
      queueSettingWrite({ showAllTileNames: value });
    },
    [user, requireOnline, queueSettingWrite],
  );

  const setShowTileBadges = useCallback(
    (value: boolean) => {
      if (!user || !requireOnline()) return;
      setShowTileBadgesState(value);
      queueSettingWrite({ hideTileBadges: !value });
    },
    [user, requireOnline, queueSettingWrite],
  );

  const setBirthday = useCallback(
    (value: string | null) => {
      if (!user || !requireOnline()) return;
      const next = value ? parseBirthday(value) : null;
      setBirthdayState(next);
      queueSettingWrite({ birthday: next });
    },
    [user, requireOnline, queueSettingWrite],
  );

  const setWeekStartsOn = useCallback(
    (value: WeekStart) => {
      if (!user || !requireOnline()) return;
      setWeekStartsOnState(value);
      queueSettingWrite({ weekStartsOn: value });
    },
    [user, requireOnline, queueSettingWrite],
  );

  const value = useMemo(
    () => ({
      successColors,
      winOnlyWeekends,
      showAllTileNames,
      showTileBadges,
      birthday,
      weekStartsOn,
      setSuccessColors,
      setWinOnlyWeekends,
      setShowAllTileNames,
      setShowTileBadges,
      setBirthday,
      setWeekStartsOn,
    }),
    [
      successColors,
      winOnlyWeekends,
      showAllTileNames,
      showTileBadges,
      birthday,
      weekStartsOn,
      setSuccessColors,
      setWinOnlyWeekends,
      setShowAllTileNames,
      setShowTileBadges,
      setBirthday,
      setWeekStartsOn,
    ],
  );

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}

export function useUserSettingsContext(): UserSettingsContextValue {
  return useContext(UserSettingsContext);
}
