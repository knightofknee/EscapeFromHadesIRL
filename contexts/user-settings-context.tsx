import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

type UserSettingsContextValue = {
  /** Raw stored success-color overrides, or null when using the defaults. */
  successColors: SuccessColors | null;
  winOnlyWeekends: boolean;
  /** One global switch: show every habit's name on its tile (overrides the
   * per-habit showName when on). */
  showAllTileNames: boolean;
  /** Persist (or clear, with null) the success-color overrides. */
  setSuccessColors: (next: SuccessColors | null) => void;
  setWinOnlyWeekends: (value: boolean) => void;
  setShowAllTileNames: (value: boolean) => void;
};

const UserSettingsContext = createContext<UserSettingsContextValue>({
  successColors: null,
  winOnlyWeekends: false,
  showAllTileNames: false,
  setSuccessColors: () => {},
  setWinOnlyWeekends: () => {},
  setShowAllTileNames: () => {},
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

  useEffect(() => {
    if (!user) {
      setSuccessColorsState(null);
      setWinOnlyWeekendsState(false);
      setShowAllTileNamesState(false);
      return;
    }
    return subscribeWithOfflineState(
      doc(db, 'userSettings', user.uid),
      (snap) => {
        const data = snap.data();
        setSuccessColorsState(data?.successColors ? (data.successColors as SuccessColors) : null);
        setWinOnlyWeekendsState(data?.winOnlyWeekends === true);
        setShowAllTileNamesState(data?.showAllTileNames === true);
      },
      // Offline state is owned by OfflineProvider's own heartbeat on this doc.
      { setOffline: () => {} },
    );
  }, [user]);

  const setSuccessColors = useCallback(
    (next: SuccessColors | null) => {
      if (!user) return;
      if (!requireOnline()) return;
      // Optimistic local update before the round-trip; the listener reconfirms.
      setSuccessColorsState(next);
      setDoc(doc(db, 'userSettings', user.uid), { successColors: next }, { merge: true });
    },
    [user, requireOnline],
  );

  const setWinOnlyWeekends = useCallback(
    (value: boolean) => {
      if (!user) return;
      if (!requireOnline()) return;
      setWinOnlyWeekendsState(value);
      setDoc(doc(db, 'userSettings', user.uid), { winOnlyWeekends: value }, { merge: true });
    },
    [user, requireOnline],
  );

  const setShowAllTileNames = useCallback(
    (value: boolean) => {
      if (!user) return;
      if (!requireOnline()) return;
      setShowAllTileNamesState(value);
      setDoc(doc(db, 'userSettings', user.uid), { showAllTileNames: value }, { merge: true });
    },
    [user, requireOnline],
  );

  const value = useMemo(
    () => ({
      successColors,
      winOnlyWeekends,
      showAllTileNames,
      setSuccessColors,
      setWinOnlyWeekends,
      setShowAllTileNames,
    }),
    [successColors, winOnlyWeekends, showAllTileNames, setSuccessColors, setWinOnlyWeekends, setShowAllTileNames],
  );

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}

export function useUserSettingsContext(): UserSettingsContextValue {
  return useContext(UserSettingsContext);
}
