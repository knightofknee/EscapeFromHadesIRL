/**
 * Chore due dates and reminder times. No imports, on purpose: the app
 * (local reminders, the editor) and the Cloud Functions (shared-chore
 * reminders) both use this one file, so a phone and the server can never
 * disagree about when something is due or when a reminder rings.
 *
 * Dates are YYYY-MM-DD strings in the person's own time zone. Times are
 * "HH:MM" local. Converting to an instant is the caller's job: the app
 * uses the phone's clock, the server uses zonedTimeToUtc below.
 */

export type ChoreReminder = {
  /** 0 = on the due day; N = N days before it. */
  daysBefore: number;
  /** "HH:MM", 24-hour, local to whoever gets the reminder. */
  time: string;
};

export type ScheduleChore = {
  userId: string;
  kind?: 'recurring' | 'once';
  frequencyDays: number;
  dueDate?: string;
  completions: string[];
  createdAt?: number;
  /** Per person, keyed by uid, up to MAX_REMINDERS each. */
  reminders?: Record<string, ChoreReminder[]>;
  /** Legacy one-time-task reminder (owner only, on the due day). */
  reminderTime?: string | null;
};

export const MAX_REMINDERS = 2;
export const DEFAULT_REMINDER_TIME = '12:00';
/** Offered "days before" choices; a recurring chore only offers ones shorter than its cycle. */
export const REMINDER_DAYS_BEFORE = [0, 1, 2, 3, 7] as const;

export function addDaysStr(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export function isValidTime(time: string | null | undefined): time is string {
  const m = time?.match(/^(\d{1,2}):(\d{2})$/);
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

/** This person's reminders on this chore (the legacy task reminder reads as the owner's). */
export function remindersFor(chore: ScheduleChore, uid: string): ChoreReminder[] {
  const own = chore.reminders?.[uid];
  if (own) return own.filter((r) => isValidTime(r.time)).slice(0, MAX_REMINDERS);
  if (uid === chore.userId && chore.kind === 'once' && isValidTime(chore.reminderTime)) {
    return [{ daysBefore: 0, time: chore.reminderTime }];
  }
  return [];
}

/**
 * The date the chore is next due, or null when it never is (a "Whenever"
 * chore, or a one-time task that's done). `createdDate` is the creation day
 * in the same time zone: a never-logged recurring chore counts from it.
 */
export function nextDueDate(chore: ScheduleChore, createdDate: string): string | null {
  if (chore.kind === 'once') return chore.completions.length > 0 ? null : (chore.dueDate ?? null);
  if (chore.frequencyDays <= 0) return null;
  const base = chore.completions[0] ?? createdDate;
  return addDaysStr(base, chore.frequencyDays);
}

export type ReminderSlot = { index: number; daysBefore: number; date: string; time: string; due: string };

/**
 * When this person's reminders ring for the chore's current due date.
 * A recurring chore's reminder never lands on or before the day it was last
 * done (a "1 day before" on a daily chore would otherwise ring the day you
 * already did it).
 */
export function reminderSlots(chore: ScheduleChore, uid: string, createdDate: string): ReminderSlot[] {
  const due = nextDueDate(chore, createdDate);
  if (!due) return [];
  const floor = chore.kind === 'once' ? null : (chore.completions[0] ?? createdDate);
  return remindersFor(chore, uid).flatMap((r, index) => {
    const date = addDaysStr(due, -Math.max(0, Math.floor(r.daysBefore)));
    if (floor && date <= floor) return [];
    return [{ index, daysBefore: r.daysBefore, date, time: r.time, due }];
  });
}

/** Notification title for a reminder slot. */
export function reminderTitle(daysBefore: number): string {
  if (daysBefore <= 0) return 'Due today';
  if (daysBefore === 1) return 'Due tomorrow';
  return `Due in ${daysBefore} days`;
}

/** "On the due day" / "1 day before" / ... for the editor. */
export function formatDaysBefore(daysBefore: number): string {
  if (daysBefore <= 0) return 'On the due day';
  if (daysBefore === 7) return '1 week before';
  return `${daysBefore} day${daysBefore === 1 ? '' : 's'} before`;
}

// ---------- Time zones (server side) ----------

function zoneParts(utcMs: number, timeZone: string): Record<string, number> {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const out: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

function offsetMs(utcMs: number, timeZone: string): number {
  const p = zoneParts(utcMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** A valid IANA zone, or 'UTC' when it's missing or unknown. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** The instant a local wall-clock date + time happens in `timeZone`. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = offsetMs(guess, timeZone);
  const utc = guess - first;
  // Across a DST change the offset at the answer can differ from the guess's.
  const second = offsetMs(utc, timeZone);
  return second === first ? utc : guess - second;
}

/** The local date (YYYY-MM-DD) of an instant in `timeZone`. */
export function localDateOf(utcMs: number, timeZone: string): string {
  const p = zoneParts(utcMs, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
