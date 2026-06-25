import { db, doc, setDoc } from '@/lib/firebase/firestore';
import { emitError } from '@/lib/error-bus';
import type { HabitRecord } from '@/types/habit';

/**
 * Single write path for a habit record (doc id = `${habitId}_${date}`), shared
 * by the steps modal, meditation modal, and steps backfill so the write shape
 * + failure handling live in one place. On failure it surfaces a toast with a
 * Retry that re-attempts the same write. Returns whether the write succeeded.
 *
 * Pass `silent: true` for background/best-effort writes (e.g. the backfill's
 * bulk catch-up) where a per-day toast would be noise.
 */
export async function persistHabitRecord(
  record: HabitRecord,
  opts?: { errorMessage?: string; silent?: boolean },
): Promise<boolean> {
  try {
    await setDoc(doc(db, 'records', record.id), record);
    return true;
  } catch (e) {
    console.error('persistHabitRecord failed:', record.id, e);
    if (!opts?.silent) {
      emitError(
        opts?.errorMessage ?? "Couldn't save. Check your connection and try again.",
        () => void persistHabitRecord(record, opts),
      );
    }
    return false;
  }
}
