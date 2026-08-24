import { computeMeditationTier, shouldRingInApp } from '../lib/meditation';
import type { MeditationSession } from '../types/habit';

const session = (minutes: number): MeditationSession => ({
  durationSec: minutes * 60,
  source: 'timer',
  loggedAt: 0,
});

describe('computeMeditationTier', () => {
  it('is "no" with no sessions', () => {
    expect(computeMeditationTier(undefined, 1, 5)).toBe('no');
    expect(computeMeditationTier([], 1, 5)).toBe('no');
  });

  it('any session earns at least "yes"', () => {
    expect(computeMeditationTier([session(2)], 1, 5)).toBe('yes');
  });

  it('reaches "goal" at target sessions of target minutes', () => {
    // ideal threshold high enough that ideal can't trigger
    expect(computeMeditationTier([session(10), session(10)], 2, 10, 999)).toBe('goal');
  });

  describe('ideal — configured total minutes', () => {
    it('lights the star once the day total reaches the threshold, any session shape', () => {
      // 3×10 = 30 total → ideal at threshold 30
      expect(computeMeditationTier([session(10), session(10), session(10)], 1, 5, 30)).toBe(
        'ideal',
      );
      // one long session also counts toward the total
      expect(computeMeditationTier([session(30)], 1, 5, 30)).toBe('ideal');
    });

    it('is not ideal below the threshold', () => {
      // 25 total < 30 → not ideal (falls to goal/yes)
      expect(computeMeditationTier([session(25)], 1, 5, 30)).not.toBe('ideal');
    });

    it('the configured total REPLACES the legacy 2×15 rule', () => {
      // 2×15 = 30 total but threshold is 45 → NOT ideal, even though the old
      // gold-standard rule would have triggered.
      expect(computeMeditationTier([session(15), session(15)], 1, 5, 45)).not.toBe('ideal');
    });
  });

  describe('ideal — legacy fallback (no configured total)', () => {
    it('keeps the 2×15-minute gold standard when threshold is unset', () => {
      expect(computeMeditationTier([session(15), session(15)], 1, 5)).toBe('ideal');
    });

    it('one long session is not enough under the legacy rule', () => {
      expect(computeMeditationTier([session(20)], 1, 5)).not.toBe('ideal');
    });
  });
});

describe('shouldRingInApp', () => {
  const END = 1_700_000_000_000;

  it('rings for a completion the user is present for', () => {
    expect(shouldRingInApp(END, END, true)).toBe(true);
    expect(shouldRingInApp(END, END + 250, true)).toBe(true);
  });

  it('stays silent when the app only just came back', () => {
    // The interval was frozen while the app was suspended and catches up on
    // resume — the user opened the app, they did not sit through the timer.
    expect(shouldRingInApp(END, END + 30_000, true)).toBe(false);
    expect(shouldRingInApp(END, END + 4 * 60 * 60 * 1000, true)).toBe(false);
  });

  it('stays silent when the app is not in the foreground', () => {
    expect(shouldRingInApp(END, END, false)).toBe(false);
  });
});
