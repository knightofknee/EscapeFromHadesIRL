// In-memory AsyncStorage so the store runs under node.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: jest.fn(async (k: string) => {
        store.delete(k);
      }),
    },
  };
});

import {
  checkEarnedQuote,
  clearEarnedQuoteState,
  markEarnedQuoteSeen,
  recordActiveDay,
} from '@/lib/earned-quotes';
import { QUOTE_EVERY_N_DAYS } from '@/constants/earned-quotes';

let uidCounter = 0;
const freshUid = () => `quote-user-${++uidCounter}`;

const day = (n: number) => `2026-07-${String(n).padStart(2, '0')}`;

describe('active-day counting', () => {
  it('counts a day at most once', async () => {
    const uid = freshUid();
    await recordActiveDay(uid, day(1));
    await recordActiveDay(uid, day(1));
    for (let i = 2; i <= QUOTE_EVERY_N_DAYS; i++) await recordActiveDay(uid, day(i));
    // Exactly QUOTE_EVERY_N_DAYS distinct days → first quote earned.
    const pending = await checkEarnedQuote(uid, day(QUOTE_EVERY_N_DAYS));
    expect(pending).toMatchObject({ number: 1, activeDays: QUOTE_EVERY_N_DAYS });
  });

  it('does not re-count when the local date runs backwards', async () => {
    const uid = freshUid();
    for (let i = 1; i < QUOTE_EVERY_N_DAYS; i++) await recordActiveDay(uid, day(i));
    // Clock set back / date-line crossing: an earlier date must not count.
    await recordActiveDay(uid, day(1));
    expect(await checkEarnedQuote(uid, day(QUOTE_EVERY_N_DAYS - 1))).toBeNull();
  });

  it('re-surfaces an unseen quote and stops after it is marked seen', async () => {
    const uid = freshUid();
    for (let i = 1; i <= QUOTE_EVERY_N_DAYS; i++) await recordActiveDay(uid, day(i));
    const first = await checkEarnedQuote(uid, day(QUOTE_EVERY_N_DAYS));
    expect(first).not.toBeNull();
    // Not yet confirmed → surfaces again.
    const again = await checkEarnedQuote(uid, day(QUOTE_EVERY_N_DAYS));
    expect(again).toMatchObject({ number: 1 });
    await markEarnedQuoteSeen(uid);
    expect(await checkEarnedQuote(uid, day(QUOTE_EVERY_N_DAYS))).toBeNull();
  });

  it('survives interleaved check/mark calls without losing state', async () => {
    const uid = freshUid();
    for (let i = 1; i <= QUOTE_EVERY_N_DAYS; i++) await recordActiveDay(uid, day(i));
    // Dismiss (fire-and-forget) racing the midnight re-check: serialized
    // internally, so the day increment and the seen increment both land.
    const nextDay = day(QUOTE_EVERY_N_DAYS + 1);
    await Promise.all([markEarnedQuoteSeen(uid), checkEarnedQuote(uid, nextDay)]);
    const pending = await checkEarnedQuote(uid, nextDay);
    // Quote 1 was consumed; day count kept the midnight increment.
    expect(pending).toBeNull();
    for (let i = QUOTE_EVERY_N_DAYS + 2; i <= 2 * QUOTE_EVERY_N_DAYS; i++) {
      await recordActiveDay(uid, day(i));
    }
    expect(await checkEarnedQuote(uid, day(2 * QUOTE_EVERY_N_DAYS))).toMatchObject({ number: 2 });
  });

  it('clearEarnedQuoteState removes the stored progress', async () => {
    const uid = freshUid();
    for (let i = 1; i <= QUOTE_EVERY_N_DAYS; i++) await recordActiveDay(uid, day(i));
    await clearEarnedQuoteState(uid);
    // Fresh state: day 1 again, nothing earned.
    expect(await checkEarnedQuote(uid, day(QUOTE_EVERY_N_DAYS))).toBeNull();
  });
});
