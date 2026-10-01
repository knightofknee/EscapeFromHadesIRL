import {
  isTieredHabit,
  nextValueGoalHistory,
  recordLevel,
  valueGoalsOn,
  valueLevel,
} from '../lib/habit-scoring';
import {
  computeMonthHabitStats,
  formatMinutes,
  formatSteps,
  median,
} from '../lib/month-habit-stats';
import { monotoneCurvePath, monotoneSlopes, smoothSeries } from '../lib/sparkline';
import type { Habit, HabitRecord } from '../types/habit';

function habit(recordingMode: Habit['recordingMode'], extra: Partial<Habit> = {}): Habit {
  return {
    id: 'h',
    userId: 'u1',
    name: 'h',
    abbreviation: 'H',
    recordingMode,
    tileSize: 1,
    position: { row: 0, col: 0 },
    color: '#000',
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

function rec(value: HabitRecord['value'], extra: Partial<HabitRecord> = {}): HabitRecord {
  return { id: 'r', habitId: 'h', userId: 'u1', date: '2026-09-01', value, recordedAt: 0, ...extra };
}

describe('valueLevel', () => {
  test('no goals: any entry is level 1, "0" and blank are 0', () => {
    expect(valueLevel('2.5', undefined)).toBe(1);
    expect(valueLevel('skipped', [])).toBe(1);
    expect(valueLevel('0', undefined)).toBe(0);
    expect(valueLevel('', undefined)).toBe(0);
  });

  test('goals: level = goals reached, below goal 1 is 0', () => {
    const goals = [1, 2, 4];
    expect(valueLevel('0.5', goals)).toBe(0);
    expect(valueLevel('1', goals)).toBe(1);
    expect(valueLevel('3', goals)).toBe(2);
    expect(valueLevel('4', goals)).toBe(3);
    expect(valueLevel('text', goals)).toBe(0);
  });

  test('recordLevel routes value habits through the goals', () => {
    expect(recordLevel(habit('value', { valueGoals: [1, 2] }), rec('2'))).toBe(2);
    expect(recordLevel(habit('value'), rec('2'))).toBe(1);
  });
});

describe('computeMonthHabitStats', () => {
  test('value: total, per-day average with blanks as 0, median, excluded days dropped', () => {
    const s = computeMonthHabitStats(habit('value'), [
      { day: 1, record: rec('2'), excluded: false },
      { day: 2, record: undefined, excluded: false },
      { day: 3, record: rec('4'), excluded: false },
      { day: 4, record: rec('9'), excluded: true },
    ]);
    expect(s.activeDays).toBe(3);
    expect(s.completed).toBe(2);
    expect(s.rate).toBe(67);
    expect(s.amount).toMatchObject({ kind: 'value', total: 6, average: 2, median: 2, showMedian: true });
    expect(s.series).toEqual([
      { day: 1, y: 2 },
      { day: 2, y: 0 },
      { day: 3, y: 4 },
    ]);
    expect(s.yMax).toBe(4);
  });

  test('meditation: minutes from sessions, no median', () => {
    const sessions = [
      { durationSec: 600, source: 'timer' as const, loggedAt: 0 },
      { durationSec: 300, source: 'manual' as const, loggedAt: 0 },
    ];
    const s = computeMonthHabitStats(habit('meditation'), [
      { day: 1, record: rec('goal', { sessions }), excluded: false },
      { day: 2, record: undefined, excluded: false },
    ]);
    expect(s.amount).toMatchObject({ kind: 'minutes', total: 15, average: 7.5, showMedian: false });
  });

  test('steps: raw counts', () => {
    const s = computeMonthHabitStats(habit('steps', { stepGoals: [7000] }), [
      { day: 1, record: rec('yes', { steps: 8000 }), excluded: false },
      { day: 2, record: rec('no', { steps: 2000 }), excluded: false },
      { day: 3, record: rec('yes', { steps: 12000 }), excluded: false },
    ]);
    expect(s.amount).toMatchObject({ kind: 'steps', total: 22000, median: 8000 });
    expect(s.completed).toBe(2);
  });

  test('tier habits: no amount, series is the level, fixed ceiling', () => {
    const s = computeMonthHabitStats(habit('quad'), [
      { day: 1, record: rec('goal'), excluded: false },
      { day: 2, record: rec('no'), excluded: false },
    ]);
    expect(s.amount).toBeNull();
    expect(s.series.map((p) => p.y)).toEqual([2, 0]);
    expect(s.yMax).toBe(3);
  });

  test('no counted days: rate and averages are null', () => {
    const s = computeMonthHabitStats(habit('value'), []);
    expect(s.rate).toBeNull();
    expect(s.amount?.average).toBeNull();
    expect(s.amount?.median).toBeNull();
  });
});

describe('formatting', () => {
  test('median of even/odd lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  test('minutes and steps', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(200)).toBe('3h 20m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatSteps(9500)).toBe((9500).toLocaleString());
    expect(formatSteps(45230)).toBe('45.2k');
    expect(formatSteps(312400)).toBe('312k');
    expect(formatSteps(1_240_000)).toBe('1.2M');
  });
});

describe('sparkline curve', () => {
  test('smoothing keeps a constant series constant and damps a sawtooth', () => {
    const flat = smoothSeries([1, 2, 3, 4].map((x) => ({ x, y: 5 })));
    flat.forEach((p) => expect(p.y).toBeCloseTo(5));
    const saw = smoothSeries([1, 2, 3, 4, 5, 6, 7].map((x) => ({ x, y: x % 2 })));
    const mid = saw[3].y;
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
  });

  test('monotone tangents are flat at local extremes (no overshoot)', () => {
    const m = monotoneSlopes([
      { x: 0, y: 0 },
      { x: 1, y: 10 },
      { x: 2, y: 0 },
    ]);
    expect(m[1]).toBe(0);
  });

  test('path passes through every point', () => {
    const d = monotoneCurvePath([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 2 },
    ]);
    expect(d.startsWith('M0,0')).toBe(true);
    expect(d).toContain(' 10,5');
    expect(d.endsWith(' 20,2')).toBe(true);
  });
});

describe('value goal history (finished months keep their goals)', () => {

  test('a goal edit applies from its month on; earlier months keep the old goals', () => {
    const h = habit('value', {
      valueGoals: [2, 4],
      valueGoalHistory: [
        { from: '2026-09', goals: [1, 2, 3] },
        { from: '2026-10', goals: [2, 4] },
      ],
    });
    expect(valueGoalsOn(h, '2026-08-31')).toEqual([]);
    expect(valueGoalsOn(h, '2026-09-15')).toEqual([1, 2, 3]);
    expect(valueGoalsOn(h, '2026-10-01')).toEqual([2, 4]);
    // 3 in September was a star; the same 3 in October is just done.
    expect(recordLevel(h, rec('3', { date: '2026-09-15' }))).toBe(3);
    expect(recordLevel(h, rec('3', { date: '2026-10-02' }))).toBe(1);
  });

  test('editing twice in one month replaces that month only', () => {
    const h = habit('value', { valueGoals: [1], valueGoalHistory: [{ from: '2026-09', goals: [1] }] });
    expect(nextValueGoalHistory(h, [2, 3], '2026-09')).toEqual([{ from: '2026-09', goals: [2, 3] }]);
    expect(nextValueGoalHistory(h, [2, 3], '2026-10')).toEqual([
      { from: '2026-09', goals: [1] },
      { from: '2026-10', goals: [2, 3] },
    ]);
  });

  test('new habit goals apply from the start; pre-history goals get pinned', () => {
    expect(nextValueGoalHistory(undefined, [1], '2026-10')).toEqual([{ from: '0000-00', goals: [1] }]);
    const legacy = habit('value', { valueGoals: [5] });
    expect(nextValueGoalHistory(legacy, [6], '2026-10')).toEqual([
      { from: '0000-00', goals: [5] },
      { from: '2026-10', goals: [6] },
    ]);
  });

  test('value habits with 2+ goals are tiered for quests', () => {
    expect(isTieredHabit(habit('value'))).toBe(false);
    expect(isTieredHabit(habit('value', { valueGoals: [1] }))).toBe(false);
    expect(isTieredHabit(habit('value', { valueGoals: [1, 2, 3] }))).toBe(true);
    expect(isTieredHabit(habit('quad'))).toBe(true);
  });
});
