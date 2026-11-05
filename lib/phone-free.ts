import { addDays, parseDate } from '@/lib/date-utils';

/**
 * Phone-free nights: the longest stretch overnight with the phone untouched,
 * computed from a timeline of when the phone was in use.
 *
 * Where the usage timeline comes from differs per platform (see
 * lib/phone-free-source.*): Android reads exact lock/unlock events; iOS
 * reconstructs ~1-minute usage slices from Screen Time threshold callbacks.
 * Everything in THIS file is source-agnostic and pure, so it is unit-tested.
 *
 * Rules (the user's calls, 2026-11-03):
 *  - A pickup shorter than FORGIVE_MS does not end the night. An idea jotted
 *    down at 2am is not "doing bad things instead of sleep".
 *  - EVERY minute of phone use inside the night is subtracted, forgiven
 *    pickups included. The number is literally "hours with no phone".
 *  - A longer pickup ends the night UNLESS it is followed (or, on the
 *    evening side, preceded) by a quiet stretch that reads as going back to
 *    sleep: at least BACK_TO_SLEEP_MS long, at least as long as the pickup
 *    itself, at least ABSORB_RATIO of the night gathered so far, and ended
 *    by another pickup rather than the window edge. That is how a 40-minute
 *    3am scroll stays inside the night (subtracted) while the first morning
 *    pickup ends it, even when the phone then sits untouched through a
 *    shower, a commute, or a morning at a desk.
 */

/** Half-open [start, end) span of phone use, ms since epoch. */
export type UsageInterval = { start: number; end: number };

export type NightWindow = { start: number; end: number };

export type PhoneFreeNight = {
  /** YYYY-MM-DD of the morning this night ended on. */
  date: string;
  /** Night start (phone put down), ms. Equals the window start if the phone
   *  was already down at 6pm (we can't see earlier). */
  start: number;
  /** Night end (first real pickup), ms. Equals the window end if the phone
   *  was still down at noon. */
  end: number;
  /** end - start - usageMs: the headline number. */
  phoneFreeMs: number;
  /** Total phone use inside [start, end), all subtracted. */
  usageMs: number;
  /** Number of pickups inside the night (forgiven and absorbed). */
  pickups: number;
};

/** A pickup shorter than this never ends the night. */
export const FORGIVE_MS = 5 * 60 * 1000;
/** Floor on a quiet stretch that counts as going back to sleep. */
export const BACK_TO_SLEEP_MS = 60 * 60 * 1000;
/** A back-to-sleep stretch must also be at least this fraction of the
 *  phone-free time gathered so far. A morning routine (75 quiet minutes
 *  between the alarm scroll and the commute) is tiny next to an 8-hour
 *  night; the second half of a night split by insomnia is not. */
export const ABSORB_RATIO = 0.5;
/** Night window: 6pm the evening before through noon on the attributed day. */
export const WINDOW_START_HOUR = 18;
export const WINDOW_END_HOUR = 12;

/**
 * The night attributed to `dateStr`: 6pm the previous evening to noon that
 * day, in local time. Calendar arithmetic (not +hours) so DST nights get
 * the real wall-clock bounds.
 */
export function nightWindow(dateStr: string): NightWindow {
  const eve = parseDate(addDays(dateStr, -1));
  const morn = parseDate(dateStr);
  return {
    start: new Date(eve.getFullYear(), eve.getMonth(), eve.getDate(), WINDOW_START_HOUR).getTime(),
    end: new Date(morn.getFullYear(), morn.getMonth(), morn.getDate(), WINDOW_END_HOUR).getTime(),
  };
}

/** Sort, drop empties, merge overlaps/touching, clip to the window. */
export function normalizeUsage(usage: UsageInterval[], window: NightWindow): UsageInterval[] {
  const clipped = usage
    .map((u) => ({ start: Math.max(u.start, window.start), end: Math.min(u.end, window.end) }))
    .filter((u) => u.end > u.start)
    .sort((a, b) => a.start - b.start);
  const out: UsageInterval[] = [];
  for (const u of clipped) {
    const last = out[out.length - 1];
    if (last && u.start <= last.end) {
      last.end = Math.max(last.end, u.end);
    } else {
      out.push({ ...u });
    }
  }
  return out;
}

type Segment = { start: number; end: number; usageMs: number; pickups: number };

/**
 * Compute the night for `window` from the raw usage timeline. Returns null
 * only when the window itself is empty; "no phone use at all" is a valid
 * (full-window) night and is the caller's problem to sanity-check.
 */
export function computePhoneFreeNight(
  date: string,
  usage: UsageInterval[],
  window: NightWindow = nightWindow(date),
): PhoneFreeNight | null {
  if (window.end <= window.start) return null;
  const used = normalizeUsage(usage, window);

  // Long pickups are the only candidate night boundaries. Short ones live
  // inside whichever segment they fall in (forgiven, but counted).
  const long = used.filter((u) => u.end - u.start >= FORGIVE_MS);
  const short = used.filter((u) => u.end - u.start < FORGIVE_MS);

  // Segments between consecutive long pickups (and the window edges).
  const segments: Segment[] = [];
  let cursor = window.start;
  for (const l of long) {
    segments.push(makeSegment(cursor, l.start, short));
    cursor = l.end;
  }
  segments.push(makeSegment(cursor, window.end, short));

  // Core = the segment with the most phone-free time.
  let coreIdx = 0;
  for (let i = 1; i < segments.length; i++) {
    if (free(segments[i]) > free(segments[coreIdx])) coreIdx = i;
  }

  // Extend across long pickups while the quiet stretch beyond each one
  // reads as a return to sleep (see the rules above). A segment touching a
  // window edge never qualifies: "no pickup until noon" is just as likely a
  // phone left on a desk, and the night must never be inflated by it.
  let lo = coreIdx;
  let hi = coreIdx;
  let gathered = free(segments[coreIdx]);
  const absorbs = (seg: Segment, pickup: UsageInterval): boolean => {
    const quiet = free(seg);
    return (
      quiet >= BACK_TO_SLEEP_MS &&
      quiet >= pickup.end - pickup.start &&
      quiet >= ABSORB_RATIO * gathered
    );
  };
  // Forward: segments[hi + 1] follows pickup long[hi]; it is edge-bounded
  // when it is the last segment.
  while (hi + 1 < segments.length - 1 && absorbs(segments[hi + 1], long[hi])) {
    hi++;
    gathered += free(segments[hi]);
  }
  // Backward: segments[lo - 1] precedes pickup long[lo - 1]; edge-bounded
  // when it is the first segment.
  while (lo - 1 > 0 && absorbs(segments[lo - 1], long[lo - 1])) {
    lo--;
    gathered += free(segments[lo]);
  }

  const start = segments[lo].start;
  const end = segments[hi].end;
  let usageMs = 0;
  let pickups = 0;
  for (let i = lo; i <= hi; i++) {
    usageMs += segments[i].usageMs;
    pickups += segments[i].pickups;
  }
  // Absorbed long pickups sit between segments lo..hi: long[lo] .. long[hi-1].
  for (let i = lo; i < hi; i++) {
    usageMs += long[i].end - long[i].start;
    pickups += 1;
  }

  return { date, start, end, phoneFreeMs: end - start - usageMs, usageMs, pickups };
}

function makeSegment(start: number, end: number, short: UsageInterval[]): Segment {
  let usageMs = 0;
  let pickups = 0;
  for (const s of short) {
    if (s.start >= start && s.end <= end) {
      usageMs += s.end - s.start;
      pickups += 1;
    }
  }
  return { start, end, usageMs, pickups };
}

function free(s: Segment): number {
  return s.end - s.start - s.usageMs;
}

// ---------------------------------------------------------------------------
// Source adapters (pure): turn each platform's raw events into UsageIntervals.
// ---------------------------------------------------------------------------

/** Android UsageStatsManager screen/keyguard events. */
export type ScreenEvent = { type: 'unlock' | 'lock' | 'screenOn' | 'screenOff'; ts: number };

/**
 * Build usage intervals from Android screen events over [rangeStart, rangeEnd).
 * Prefers keyguard (unlock/lock) events: the screen lighting up for a
 * notification glance is not phone use. Falls back to screen on/off on
 * devices that report no keyguard events at all.
 *
 * A range that opens mid-use (first event is a lock) counts as in use from
 * rangeStart; a range that ends mid-use closes at rangeEnd.
 */
export function intervalsFromScreenEvents(
  events: ScreenEvent[],
  rangeStart: number,
  rangeEnd: number,
): UsageInterval[] {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const hasKeyguard = sorted.some((e) => e.type === 'unlock' || e.type === 'lock');
  const isOpen = (e: ScreenEvent) => (hasKeyguard ? e.type === 'unlock' : e.type === 'screenOn');
  // screenOff always closes: a locked-but-lit phone and a dark phone are
  // both "not in use", and some devices emit screenOff without a lock event.
  const isClose = (e: ScreenEvent) =>
    hasKeyguard ? e.type === 'lock' || e.type === 'screenOff' : e.type === 'screenOff';

  const out: UsageInterval[] = [];
  let openAt: number | null = null;
  let first = true;
  for (const e of sorted) {
    if (e.ts < rangeStart || e.ts >= rangeEnd) continue;
    if (isOpen(e)) {
      if (openAt == null) openAt = e.ts;
    } else if (isClose(e)) {
      if (openAt != null) {
        out.push({ start: openAt, end: e.ts });
        openAt = null;
      } else if (first) {
        // Mid-use at range start.
        out.push({ start: rangeStart, end: e.ts });
      }
    }
    first = false;
  }
  if (openAt != null) out.push({ start: openAt, end: rangeEnd });
  return out;
}

/**
 * iOS Screen Time thresholds we register: one event per cumulative minute of
 * use for the first two hours, then every 5 minutes up to six hours. After
 * two hours of use in a night window the per-minute resolution no longer
 * matters (the user is clearly up), and fewer events is kinder to a flaky
 * API. Exported so the monitor registration and the parser share one list.
 */
export const IOS_THRESHOLD_MINUTES: number[] = (() => {
  const out: number[] = [];
  for (let m = 1; m <= 120; m++) out.push(m);
  for (let m = 125; m <= 360; m += 5) out.push(m);
  return out;
})();

/** Event name for a cumulative-minute threshold. No underscores: the
 *  library splits its storage keys on "_". */
export function iosThresholdEventName(minutes: number): string {
  return `m${minutes}`;
}

/** Threshold crossings read back from the monitor extension. */
export type ThresholdCrossing = { eventName: string; at: number };

/**
 * Reconstruct usage from cumulative threshold crossings: crossing minute N at
 * time T means the (N - previousThreshold) minutes of use ending at T. The
 * slices are approximate, which is fine: a one-minute pickup registers as a
 * one-minute slice (forgiven), and a morning scroll shows up as a dense run
 * of slices that merge into one long pickup.
 */
export function intervalsFromThresholdCrossings(crossings: ThresholdCrossing[]): UsageInterval[] {
  const out: UsageInterval[] = [];
  for (const c of crossings) {
    const m = /^m(\d+)$/.exec(c.eventName);
    if (!m) continue;
    const minutes = Number(m[1]);
    const idx = IOS_THRESHOLD_MINUTES.indexOf(minutes);
    if (idx < 0) continue;
    const prev = idx === 0 ? 0 : IOS_THRESHOLD_MINUTES[idx - 1];
    const sliceMs = (minutes - prev) * 60 * 1000;
    out.push({ start: c.at - sliceMs, end: c.at });
  }
  return out;
}

/** "7h 42m" style; whole minutes. */
export function formatHoursMinutes(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}
