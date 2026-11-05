import { computePhoneFreeNight, nightWindow } from '@/lib/phone-free';
import { getPhoneFreeStatus, getUsageIntervals } from '@/lib/phone-free-source';
import type { PhoneFreeStatus } from '@/lib/phone-free-source';
import { loadNights, saveNights, type NightsByDate } from '@/lib/phone-free-storage';
import { addDays } from '@/lib/date-utils';

/**
 * Snapshot ended nights into local storage. The sources forget quickly
 * (Android keeps a few days of events; the iOS monitor overwrites its keys
 * every night), so this runs on every foreground from the habits screen,
 * not just when the week view is open.
 */

/** Nights older than this are never queried: the sources won't have them. */
export const SNAPSHOT_LOOKBACK_DAYS = 7;
/** Query margin before the window start so use that straddles 6pm pairs up. */
const QUERY_LEAD_MS = 6 * 60 * 60 * 1000;

export type SnapshotResult = { status: PhoneFreeStatus; nights: NightsByDate };

/**
 * Read status, then fill in any of `dates` whose night has ended, is within
 * the lookback, and isn't stored yet. Returns the full stored map either
 * way. A night the source can't vouch for (null usage) is skipped, not
 * recorded as empty, and retried on the next pass.
 */
export async function snapshotNights(uid: string, dates: string[], now = Date.now()): Promise<SnapshotResult> {
  const status = await getPhoneFreeStatus();
  let nights = await loadNights(uid);
  if (status !== 'ready') return { status, nights };

  let changed = false;
  for (const date of dates) {
    if (nights[date]) continue;
    const window = nightWindow(date);
    if (window.end > now) continue;
    if (now - window.end > SNAPSHOT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000) continue;
    const usage = await getUsageIntervals(window.start - QUERY_LEAD_MS, window.end);
    if (usage == null) continue;
    const night = computePhoneFreeNight(date, usage, window);
    if (!night) continue;
    if (!changed) nights = { ...nights };
    nights[date] = night;
    changed = true;
  }
  if (changed) await saveNights(uid, nights);
  return { status, nights };
}

/** The dates whose nights the background snapshot keeps fresh: today and
 *  the previous SNAPSHOT_LOOKBACK_DAYS - 1 days. */
export function snapshotDates(todayStr: string): string[] {
  const out: string[] = [];
  for (let i = SNAPSHOT_LOOKBACK_DAYS - 1; i >= 0; i--) out.push(addDays(todayStr, -i));
  return out;
}
