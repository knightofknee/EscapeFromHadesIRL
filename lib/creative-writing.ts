import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, doc, getDoc, setDoc } from '@/lib/firebase/firestore';
import type { Habit, HabitRecord, QuadValue } from '@/types/habit';

const FLAG_KEY_PREFIX = 'creativeWriting:bumped:v1:';

function flagKey(habitId: string): string {
  return `${FLAG_KEY_PREFIX}${habitId}`;
}

/** Remove every "already bumped today" flag. Used on sign-out/account deletion
 *  so no per-habit local flag outlives the account. */
export async function clearAllCreativeWritingFlags(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(FLAG_KEY_PREFIX));
    if (mine.length > 0) await AsyncStorage.multiRemove(mine);
  } catch (e) {
    console.error('clearAllCreativeWritingFlags failed:', e);
  }
}

/**
 * Auto-bump every active Creative Writing habit to 'yes' on the FIRST note
 * save of the day — and only the first.
 *
 * Behavior contract (locked with user):
 *  - Skips entirely when `isChecklist === true` (checklists don't count).
 *  - For each Creative Writing habit, checks an AsyncStorage flag keyed by
 *    habit id. If the flag is today's date, returns immediately — no
 *    Firestore reads or writes for the rest of the day.
 *  - First save of the day: reads the day's record. If `value` is missing
 *    or 'no', writes 'yes' (source 'auto'). If the user has already tapped
 *    the tile higher today, we leave it alone. Either way we set the flag
 *    so we don't read again for the rest of the day.
 *  - We never lower the tier, and we never bump twice in one day — not even
 *    if the user manually clears the tile back to zero between saves.
 *
 * Safe to call concurrently; subsequent invocations within the same day are
 * AsyncStorage reads only.
 */
export async function maybeBumpCreativeWriting(params: {
  habits: Habit[];
  userId: string;
  todayStr: string;
  isChecklist: boolean;
}): Promise<void> {
  const { habits, userId, todayStr, isChecklist } = params;
  if (isChecklist) return;

  const cwHabits = habits.filter((h) => h.recordingMode === 'creativeWriting');
  if (cwHabits.length === 0) return;

  for (const habit of cwHabits) {
    try {
      const flag = await AsyncStorage.getItem(flagKey(habit.id));
      if (flag === todayStr) continue; // already bumped today — skip everything

      const docId = `${habit.id}_${todayStr}`;
      const recordRef = doc(db, 'records', docId);
      const snap = await getDoc(recordRef);
      const currentValue =
        snap.exists() ? (snap.data().value as QuadValue | undefined) : undefined;

      if (currentValue == null || currentValue === 'no') {
        const next: HabitRecord = {
          id: docId,
          habitId: habit.id,
          userId,
          date: todayStr,
          value: 'yes',
          recordedAt: Date.now(),
          source: 'auto',
        };
        await setDoc(recordRef, next);
      }

      // Always set the flag, even if we didn't write (e.g. user already
      // tapped to 'goal' earlier today). Prevents repeat reads.
      await AsyncStorage.setItem(flagKey(habit.id), todayStr);
    } catch (err) {
      console.error('maybeBumpCreativeWriting failed for habit', habit.id, err);
    }
  }
}
