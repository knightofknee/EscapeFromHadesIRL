import {
  computeStepsLevel,
  unconfirmedStepDays,
  STEPS_CONFIRM_CATCHUP_DAYS,
  STEPS_CONFIRM_INITIAL_DAYS,
} from '../lib/steps';
import { addDays, parseDate } from '../lib/date-utils';

const TODAY = '2026-06-12';
const OLD_CREATED_AT = new Date(2020, 0, 1).getTime();

describe('unconfirmedStepDays', () => {
  it('returns nothing when yesterday is already confirmed', () => {
    expect(unconfirmedStepDays(addDays(TODAY, -1), TODAY, OLD_CREATED_AT)).toEqual([]);
  });

  it('returns nothing when the pointer is at or past today', () => {
    expect(unconfirmedStepDays(TODAY, TODAY, OLD_CREATED_AT)).toEqual([]);
    expect(unconfirmedStepDays(addDays(TODAY, 3), TODAY, OLD_CREATED_AT)).toEqual([]);
  });

  it('lists every ended day after the pointer, ascending, through yesterday', () => {
    expect(unconfirmedStepDays(addDays(TODAY, -3), TODAY, OLD_CREATED_AT)).toEqual([
      '2026-06-10',
      '2026-06-11',
    ]);
  });

  it('never includes today — it has not ended', () => {
    for (const days of [
      unconfirmedStepDays(undefined, TODAY, OLD_CREATED_AT),
      unconfirmedStepDays(addDays(TODAY, -10), TODAY, OLD_CREATED_AT),
    ]) {
      expect(days).not.toContain(TODAY);
    }
  });

  it('crosses month boundaries correctly', () => {
    expect(unconfirmedStepDays('2026-02-27', '2026-03-02', OLD_CREATED_AT)).toEqual([
      '2026-02-28',
      '2026-03-01',
    ]);
  });

  it('opens the initial window without a pointer', () => {
    const days = unconfirmedStepDays(undefined, TODAY, OLD_CREATED_AT);
    expect(days).toHaveLength(STEPS_CONFIRM_INITIAL_DAYS);
    expect(days[0]).toBe(addDays(TODAY, -STEPS_CONFIRM_INITIAL_DAYS));
    expect(days[days.length - 1]).toBe(addDays(TODAY, -1));
  });

  it('floors the initial window at the habit creation day', () => {
    const createdAt = parseDate(addDays(TODAY, -3)).getTime();
    expect(unconfirmedStepDays(undefined, TODAY, createdAt)).toEqual([
      '2026-06-09',
      '2026-06-10',
      '2026-06-11',
    ]);
  });

  it('returns nothing for a habit created today', () => {
    const createdAt = parseDate(TODAY).getTime() + 9 * 3_600_000;
    expect(unconfirmedStepDays(undefined, TODAY, createdAt)).toEqual([]);
  });

  it('caps catch-up after a long-dormant stretch', () => {
    const days = unconfirmedStepDays(addDays(TODAY, -200), TODAY, OLD_CREATED_AT);
    expect(days).toHaveLength(STEPS_CONFIRM_CATCHUP_DAYS);
    expect(days[0]).toBe(addDays(TODAY, -STEPS_CONFIRM_CATCHUP_DAYS));
    expect(days[days.length - 1]).toBe(addDays(TODAY, -1));
  });
});

describe('computeStepsLevel', () => {
  const GOALS = [5000, 8000, 12000];

  it('maps thresholds onto quad tiers', () => {
    expect(computeStepsLevel(0, GOALS)).toBe('no');
    expect(computeStepsLevel(4999, GOALS)).toBe('no');
    expect(computeStepsLevel(5000, GOALS)).toBe('yes');
    expect(computeStepsLevel(7999, GOALS)).toBe('yes');
    expect(computeStepsLevel(8000, GOALS)).toBe('goal');
    expect(computeStepsLevel(12000, GOALS)).toBe('ideal');
  });

  it('is "no" with missing steps or no goals', () => {
    expect(computeStepsLevel(undefined, GOALS)).toBe('no');
    expect(computeStepsLevel(9000, [])).toBe('no');
  });
});
