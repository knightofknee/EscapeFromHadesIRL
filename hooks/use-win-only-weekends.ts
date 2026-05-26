import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useOfflineGuard } from '@/contexts/offline-context';
import { db, doc, setDoc } from '@/lib/firebase/firestore';
import { subscribeWithOfflineState } from '@/lib/firebase/subscribe';

/**
 * Per-user toggle that controls whether weekend days where a habit wasn't
 * completed are skipped from stats (instead of counted as misses). Stored
 * on `userSettings/{uid}` alongside the success-color customizations so
 * the same single doc carries every cross-device user preference.
 */
export function useWinOnlyWeekends() {
  const { user } = useAuth();
  const { requireOnline } = useOfflineGuard();
  const [winOnlyWeekends, setLocal] = useState(false);

  useEffect(() => {
    if (!user) {
      setLocal(false);
      return;
    }
    return subscribeWithOfflineState(
      doc(db, 'userSettings', user.uid),
      (snap) => {
        const data = snap.data();
        setLocal(data?.winOnlyWeekends === true);
      },
      { setOffline: () => {} },
    );
  }, [user]);

  const setWinOnlyWeekends = useCallback(
    (value: boolean) => {
      if (!user) return;
      if (!requireOnline()) return;
      setLocal(value);
      setDoc(
        doc(db, 'userSettings', user.uid),
        { winOnlyWeekends: value },
        { merge: true },
      );
    },
    [user, requireOnline],
  );

  return { winOnlyWeekends, setWinOnlyWeekends };
}
