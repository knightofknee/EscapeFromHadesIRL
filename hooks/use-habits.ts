import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  db,
  collection,
  query,
  where,
} from '@/lib/firebase/firestore';
import { subscribeWithOfflineState } from '@/lib/firebase/subscribe';
import { useHabitsContext } from '@/contexts/habits-context';
import type { Habit } from '@/types/habit';

/**
 * Active-habits data + mutations. Backed by the app-wide HabitsProvider
 * (one shared listener) — see contexts/habits-context.tsx. Return shape is
 * unchanged so call sites don't change.
 */
export function useHabits() {
  return useHabitsContext();
}

/**
 * Archived habits — a separate, rarely-used query consumed only by the
 * revive-habit modal. Left as a standalone listener (not a duplicate-listener
 * problem, and not part of the provider migration).
 */
export function useArchivedHabits() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (!user) {
      setHabits([]);
      // Stay "loading" while signed out / auth restoring — see HabitsProvider.
      setIsLoading(true);
      setIsOffline(false);
      return;
    }

    setIsLoading(true);

    const q = query(
      collection(db, 'habits'),
      where('userId', '==', user.uid),
      where('isArchived', '==', true),
    );

    return subscribeWithOfflineState(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }) as Habit);
        setHabits(data);
        setIsLoading(false);
      },
      {
        onError: (error) => {
          console.error('[useArchivedHabits] snapshot error:', error);
          setIsLoading(false);
        },
        setOffline: (offline) => {
          setIsOffline(offline);
          if (offline) setIsLoading(false);
        },
      },
    );
  }, [user]);

  return { habits, isLoading, isOffline };
}
