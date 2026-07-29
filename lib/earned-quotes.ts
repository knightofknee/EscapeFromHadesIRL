import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EARNED_QUOTES,
  QUOTE_EVERY_N_DAYS,
  type EarnedQuote,
} from '@/constants/earned-quotes';

/**
 * Milestone-quote bookkeeping. Uid-scoped AsyncStorage (same pattern as
 * lib/tutorial-flags.ts): counts DISTINCT days the app was used, and tracks
 * how many earned quotes have actually been shown, so a quote earned today is
 * revealed exactly once — and survives an app kill before it was seen.
 *
 * Like onboarding, this must never block the app: every storage failure
 * degrades to "no milestone today".
 */
type EarnedQuoteState = {
  /** Count of distinct days the app has been used (post-setup). */
  activeDays: number;
  /** Last YYYY-MM-DD counted, so one day never counts twice. */
  lastActiveDate: string;
  /** How many earned quotes the user has been shown. */
  shownCount: number;
};

export type PendingEarnedQuote = {
  quote: EarnedQuote;
  /** 1-based milestone number ("your 2nd earned quote"). */
  number: number;
  /** The active-day count that earned it (number × QUOTE_EVERY_N_DAYS). */
  activeDays: number;
};

const keyFor = (uid: string) => `@efh_earned_quotes_v1:${uid}`;

// All mutations are read-modify-write cycles on the same key, and two can
// overlap (dismiss's fire-and-forget markEarnedQuoteSeen racing the midnight
// re-check). Serialize them so the last write never resurrects stale state.
let opChain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = opChain.then(fn, fn);
  opChain = run.catch(() => {});
  return run;
}

async function loadState(uid: string): Promise<EarnedQuoteState> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(uid));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EarnedQuoteState>;
      return {
        activeDays: typeof parsed.activeDays === 'number' ? parsed.activeDays : 0,
        lastActiveDate: typeof parsed.lastActiveDate === 'string' ? parsed.lastActiveDate : '',
        shownCount: typeof parsed.shownCount === 'number' ? parsed.shownCount : 0,
      };
    }
  } catch {
    /* degrade to fresh state */
  }
  return { activeDays: 0, lastActiveDate: '', shownCount: 0 };
}

async function saveState(uid: string, state: EarnedQuoteState): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(uid), JSON.stringify(state));
  } catch {
    /* ignore — never block the app on storage */
  }
}

/** The quote for the 1-based milestone `n`, looping past the end of the list. */
export function quoteForMilestone(n: number): EarnedQuote {
  return EARNED_QUOTES[(n - 1) % EARNED_QUOTES.length];
}

/**
 * Count today as an active day, at most once. Strictly-greater compare (not
 * !==) so a clock set back or a westward date-line crossing can't re-count a
 * day already counted under a later date.
 */
export async function recordActiveDay(uid: string, todayStr: string): Promise<void> {
  return serialized(async () => {
    const state = await loadState(uid);
    if (state.lastActiveDate && todayStr <= state.lastActiveDate) return;
    state.activeDays += 1;
    state.lastActiveDate = todayStr;
    await saveState(uid, state);
  });
}

/**
 * Count today as an active day (once) and return the quote the user has
 * earned but not yet been shown, if any. Callers show it, then confirm with
 * markEarnedQuoteSeen() — an unconfirmed quote re-surfaces next launch.
 */
export async function checkEarnedQuote(
  uid: string,
  todayStr: string,
): Promise<PendingEarnedQuote | null> {
  await recordActiveDay(uid, todayStr);
  return serialized(async () => {
    if (EARNED_QUOTES.length === 0) return null;
    const state = await loadState(uid);
    const earnedCount = Math.floor(state.activeDays / QUOTE_EVERY_N_DAYS);
    if (earnedCount <= state.shownCount) return null;
    const number = state.shownCount + 1;
    return {
      quote: quoteForMilestone(number),
      number,
      activeDays: number * QUOTE_EVERY_N_DAYS,
    };
  });
}

/** Confirm the pending quote was shown so it doesn't re-surface. */
export async function markEarnedQuoteSeen(uid: string): Promise<void> {
  return serialized(async () => {
    const state = await loadState(uid);
    await saveState(uid, { ...state, shownCount: state.shownCount + 1 });
  });
}

/** Remove the stored milestone progress for `uid` (account deletion only —
 *  a plain sign-out keeps it so a returning user's streak survives). */
export async function clearEarnedQuoteState(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(uid));
  } catch {
    /* best-effort */
  }
}
