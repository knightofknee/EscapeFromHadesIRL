import { addDays } from '@/lib/date-utils';

/**
 * Win-only days for 60-day quests: a day recorded in one counts as done, a
 * missed one is ignored (excused, like vacation). The source is the
 * birthday week, set once in Settings (month and day, no year, never
 * prompted). It runs from the day before the birthday through 6 days
 * after, every year: a birthday of Oct 16 covers Oct 15 to 22.
 */

type DateRange = { start: string; end: string };

/** "MM-DD", or null when it isn't a real calendar day (Feb 29 allowed). */
export function parseBirthday(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const daysIn = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysIn[month - 1] ? value : null;
}

/** Days before and after the birthday that its week covers. */
export const BIRTHDAY_WEEK = { before: 1, after: 6 } as const;

/** The birthday week in a given year, as [start, end] dates. Feb 29 lands on Feb 28 in other years. */
export function birthdayWeek(birthday: string, year: number): DateRange {
  let [month, day] = birthday.split('-').map(Number);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (month === 2 && day === 29 && !leap) day = 28;
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { start: addDays(date, -BIRTHDAY_WEEK.before), end: addDays(date, BIRTHDAY_WEEK.after) };
}

/** Every win-only date from `from` through `to` (inclusive). */
export function winOnlyDates(params: { birthday: string | null; from: string; to: string }): Set<string> {
  const { birthday, from, to } = params;
  const out = new Set<string>();
  const add = ({ start, end }: DateRange) => {
    const s = start > from ? start : from;
    const e = end < to ? end : to;
    for (let d = s; d <= e; d = addDays(d, 1)) out.add(d);
  };
  if (birthday) {
    // A week near New Year can start in the year before.
    for (let y = Number(from.slice(0, 4)) - 1; y <= Number(to.slice(0, 4)); y++) add(birthdayWeek(birthday, y));
  }
  return out;
}
