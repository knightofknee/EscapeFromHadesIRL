import { db, doc, setDoc, deleteDoc, writeBatch } from '@/lib/firebase/firestore';
import { collection } from 'firebase/firestore';
import type { VacationDay } from '@/types/habit';
import { addDays } from '@/lib/date-utils';

export const VACATION_COLLECTION = 'vacationDays';

export function vacationDocId(userId: string, date: string): string {
  return `${userId}_${date}`;
}

/** Build the date strings (inclusive) between two YYYY-MM-DD dates. */
export function buildDateRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  let cursor = startStr;
  // Safety cap — avoid infinite loops on bad input.
  for (let i = 0; i < 366 * 5 && cursor <= endStr; i++) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/**
 * Mark each date in `dates` as a vacation day for the user, **skipping**
 * dates that already have a vacation record. Returns the new dates that
 * were actually created.
 */
export async function createVacationDays(params: {
  userId: string;
  dates: string[];
  existingDates: Set<string>;
  defaultLabel: string;
  defaultColor: string;
}): Promise<string[]> {
  const { userId, dates, existingDates, defaultLabel, defaultColor } = params;
  const toCreate = dates.filter((d) => !existingDates.has(d));
  if (toCreate.length === 0) return [];

  const now = Date.now();
  const batch = writeBatch(db);
  for (const date of toCreate) {
    const id = vacationDocId(userId, date);
    const record: VacationDay = {
      id,
      userId,
      date,
      label: defaultLabel,
      color: defaultColor,
      createdAt: now,
      updatedAt: now,
    };
    const ref = doc(db, VACATION_COLLECTION, id);
    batch.set(ref, record);
  }
  await batch.commit();
  return toCreate;
}

/** Update label/color on a single vacation day. */
export async function updateVacationDay(params: {
  userId: string;
  date: string;
  label?: string;
  color?: string;
}): Promise<void> {
  const { userId, date, label, color } = params;
  const id = vacationDocId(userId, date);
  const ref = doc(db, VACATION_COLLECTION, id);
  const patch: Partial<VacationDay> = { updatedAt: Date.now() };
  if (label !== undefined) patch.label = label;
  if (color !== undefined) patch.color = color;
  await setDoc(ref, patch, { merge: true });
}

/** Update label/color on every date in `dates`. */
export async function updateVacationDaysBulk(params: {
  userId: string;
  dates: string[];
  label?: string;
  color?: string;
}): Promise<void> {
  const { userId, dates, label, color } = params;
  if (dates.length === 0) return;
  const now = Date.now();
  const batch = writeBatch(db);
  for (const date of dates) {
    const id = vacationDocId(userId, date);
    const ref = doc(db, VACATION_COLLECTION, id);
    const patch: Partial<VacationDay> = { updatedAt: now };
    if (label !== undefined) patch.label = label;
    if (color !== undefined) patch.color = color;
    batch.set(ref, patch, { merge: true });
  }
  await batch.commit();
}

/** Remove a vacation day (un-vacation). Underlying habit records resurface. */
export async function deleteVacationDay(params: {
  userId: string;
  date: string;
}): Promise<void> {
  const { userId, date } = params;
  const id = vacationDocId(userId, date);
  const ref = doc(db, VACATION_COLLECTION, id);
  await deleteDoc(ref);
}

// Re-export `collection` so callers can build queries without hitting two
// import paths. Keeps vacation-day plumbing in one file.
export { collection };
