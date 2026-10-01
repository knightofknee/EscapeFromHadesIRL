import {
  computeMonthlyRates,
  computeMonthlyValueAverages,
  computeValueAverages,
  formatStatValue,
  isValueTrendHabit,
  recordNumericValue,
} from '../lib/habit-stats';
import { formatDate } from '../lib/date-utils';
import { LEVEL_CHECKERS } from '../lib/habit-scoring';
import type { Habit, HabitRecord } from '../types/habit';

function makeHabit(mode: Habit['recordingMode']): Habit {
  return {
    id: 'h1',
    userId: 'u1',
    name: 'Coding',
    abbreviation: 'C',
    recordingMode: mode,
    tileSize: 1,
    position: { row: 0, col: 0 },
    color: '#000',
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeRecord(date: string, value: any): HabitRecord {
  return {
    id: `r_${date}`,
    habitId: 'h1',
    userId: 'u1',
    date,
    value,
    recordedAt: 0,
  };
}

function indexOf(records: HabitRecord[]): Map<string, HabitRecord> {
  const map = new Map<string, HabitRecord>();
  for (const r of records) map.set(`${r.habitId}_${r.date}`, r);
  return map;
}

describe('isValueTrendHabit', () => {
  test('only value mode charts by trend', () => {
    expect(isValueTrendHabit(makeHabit('value'))).toBe(true);
    expect(isValueTrendHabit(makeHabit('boolean'))).toBe(false);
    expect(isValueTrendHabit(makeHabit('counter'))).toBe(false);
    expect(isValueTrendHabit(makeHabit('quad'))).toBe(false);
  });
});

describe('recordNumericValue', () => {
  test('parses numeric strings', () => {
    expect(recordNumericValue(makeRecord('2026-09-01', '2.5'))).toBe(2.5);
    expect(recordNumericValue(makeRecord('2026-09-01', ' 4 '))).toBe(4);
  });
  test('missing record is 0', () => {
    expect(recordNumericValue(undefined)).toBe(0);
  });
  test('blank and non-numeric text contribute 0', () => {
    expect(recordNumericValue(makeRecord('2026-09-01', ''))).toBe(0);
    expect(recordNumericValue(makeRecord('2026-09-01', 'skipped early'))).toBe(0);
  });
});

describe('formatStatValue', () => {
  test('one decimal below 100, trimmed', () => {
    expect(formatStatValue(2.54)).toBe('2.5');
    expect(formatStatValue(8)).toBe('8');
    expect(formatStatValue(0.25)).toBe('0.3');
  });
  test('whole numbers at 100 and above', () => {
    expect(formatStatValue(123.4)).toBe('123');
  });
  test('non-finite renders as 0', () => {
    expect(formatStatValue(NaN)).toBe('0');
  });
});

describe('computeValueAverages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // A Thursday, so the trailing 7 days hold exactly one weekend.
    jest.setSystemTime(new Date(2026, 8, 3, 12, 0, 0)); // 2026-09-03
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('blank days count as 0 in the denominator', () => {
    const habit = makeHabit('value');
    // 2 hours on two of the trailing 7 days, nothing on the rest.
    const records = indexOf([
      makeRecord('2026-09-02', '2'),
      makeRecord('2026-09-01', '2'),
    ]);
    const { week } = computeValueAverages(habit, records, new Set(), false);
    expect(week).toBeCloseTo(4 / 7);
  });

  test('vacation days leave the timeline', () => {
    const habit = makeHabit('value');
    const records = indexOf([makeRecord('2026-09-02', '3')]);
    const vacation = new Set(['2026-09-01', '2026-08-31', '2026-08-30']);
    const { week } = computeValueAverages(habit, records, vacation, false);
    expect(week).toBeCloseTo(3 / 4);
  });

  test('win-only weekends drop empty weekend days', () => {
    const habit = makeHabit('value');
    // Trailing 7 days from Sep 3: Aug 27 - Sep 2, weekend = Aug 29/30.
    const records = indexOf([makeRecord('2026-09-02', '5')]);
    const { week } = computeValueAverages(habit, records, new Set(), true);
    expect(week).toBeCloseTo(5 / 5);
  });
});

describe('computeMonthlyValueAverages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 3, 12, 0, 0)); // 2026-09-03
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('each month averages over its active days, zeros included', () => {
    const habit = makeHabit('value');
    // August 2026: 62 total hours over 31 days.
    const records: HabitRecord[] = [];
    for (let d = 1; d <= 31; d++) {
      records.push(makeRecord(formatDate(new Date(2026, 7, d)), '2'));
    }
    const data = computeMonthlyValueAverages(habit, indexOf(records), 3, new Set(), false);
    expect(data).toHaveLength(3);
    const august = data.find((d) => d.date === '2026-08');
    expect(august!.value).toBeCloseTo(2);
    const july = data.find((d) => d.date === '2026-07');
    expect(july!.value).toBe(0);
  });

  test('rolling average spans the displayed months', () => {
    const habit = makeHabit('value');
    const records: HabitRecord[] = [];
    for (let d = 1; d <= 31; d++) {
      records.push(makeRecord(formatDate(new Date(2026, 7, d)), '3'));
    }
    const data = computeMonthlyValueAverages(habit, indexOf(records), 2, new Set(), false);
    // Window = Aug (avg 3) + Sep (avg 0 so far, 2 counted days) with no
    // pre-window activity: rolling avg after Sep = (3 + 0) / 2.
    const september = data[data.length - 1];
    expect(september.date).toBe('2026-09');
    expect(september.avg).toBeCloseTo(1.5);
  });

  test('months before the first entry stay out of the rolling average', () => {
    const habit = makeHabit('value');
    const records: HabitRecord[] = [];
    for (let d = 1; d <= 31; d++) {
      records.push(makeRecord(formatDate(new Date(2026, 7, d)), '3'));
    }
    const data = computeMonthlyValueAverages(habit, indexOf(records), 6, new Set(), false);
    // Apr–Jul predate the habit's first entry: no bar, no line, no dilution.
    for (const m of data.slice(0, 4)) expect(m.avg).toBe(0);
    const august = data[data.length - 2];
    expect(august.date).toBe('2026-08');
    expect(august.avg).toBeCloseTo(3);
    // Once started, an empty month is a real drop and counts.
    expect(data[data.length - 1].avg).toBeCloseTo(1.5);
    // The full-window line counts all 6 months: 3 / 6.
    expect(data[data.length - 1].avgFull).toBeCloseTo(0.5);
  });
});

describe('computeMonthlyRates', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 3, 12, 0, 0)); // 2026-09-03
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('percent habits use the same live-since-started rolling average', () => {
    const habit = makeHabit('boolean');
    const records: HabitRecord[] = [];
    for (let d = 1; d <= 31; d++) {
      records.push(makeRecord(formatDate(new Date(2026, 7, d)), true));
    }
    const data = computeMonthlyRates(habit, indexOf(records), 6, LEVEL_CHECKERS[0], new Set(), false);
    for (const m of data.slice(0, 4)) expect(m.avg).toBe(0);
    const august = data[data.length - 2];
    expect(august.date).toBe('2026-08');
    expect(august.value).toBe(100);
    expect(august.avg).toBe(100);
    // Sep so far is 0% over its 2 counted days: (100 + 0) / 2, rounded.
    expect(data[data.length - 1].avg).toBe(50);
  });
});
