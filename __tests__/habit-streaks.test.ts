import { computeStreak } from '../lib/habit-streaks';
import type { Habit, HabitRecord } from '../types/habit';

function makeHabit(id: string = 'h1'): Habit {
  return {
    id,
    userId: 'u1',
    name: 'Test',
    abbreviation: 'T',
    recordingMode: 'boolean',
    tileSize: 1,
    position: { row: 0, col: 0 },
    color: '#000',
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

const checker = (_h: Habit, r?: HabitRecord) =>
  r != null && r.value !== false && r.value !== 'no';

function makeRecord(habitId: string, date: string, value: boolean = true): HabitRecord {
  return {
    id: `${habitId}_${date}`,
    habitId,
    userId: 'u1',
    date,
    value,
    recordedAt: 0,
  };
}

function buildIndex(records: HabitRecord[]): Map<string, HabitRecord> {
  const m = new Map<string, HabitRecord>();
  for (const r of records) m.set(`${r.habitId}_${r.date}`, r);
  return m;
}

// Pin "now" to a specific Date so tests are deterministic regardless of
// when they run.
const NOW = new Date(2026, 3, 30); // April 30, 2026

describe('computeStreak - basic behavior (no vacation)', () => {
  const habit = makeHabit();
  const empty = new Set<string>();

  test('no records → both streaks zero', () => {
    const result = computeStreak(habit, new Map(), checker, empty, { now: NOW });
    expect(result.current).toBe(0);
    expect(result.longest).toBe(0);
  });

  test('three consecutive yesterday-back days → 3-day current streak', () => {
    const records = [
      makeRecord('h1', '2026-04-27'),
      makeRecord('h1', '2026-04-28'),
      makeRecord('h1', '2026-04-29'),
    ];
    const result = computeStreak(habit, buildIndex(records), checker, empty, { now: NOW });
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
  });

  test('today completed adds one to the streak', () => {
    const records = [
      makeRecord('h1', '2026-04-28'),
      makeRecord('h1', '2026-04-29'),
      makeRecord('h1', '2026-04-30'), // today
    ];
    const result = computeStreak(habit, buildIndex(records), checker, empty, { now: NOW });
    expect(result.current).toBe(3);
  });

  test('a missed day in the middle breaks the streak', () => {
    // Apr 25, 26 done; Apr 27 missed; Apr 28, 29 done.
    const records = [
      makeRecord('h1', '2026-04-25'),
      makeRecord('h1', '2026-04-26'),
      makeRecord('h1', '2026-04-28'),
      makeRecord('h1', '2026-04-29'),
    ];
    const result = computeStreak(habit, buildIndex(records), checker, empty, { now: NOW });
    expect(result.current).toBe(2); // 28–29 (29 = yesterday)
    expect(result.longest).toBe(2);
  });
});

describe('computeStreak - vacation handling', () => {
  const habit = makeHabit();

  test('vacation days bridge a streak — completion → vacation → completion stays unbroken', () => {
    // Apr 25, 26 done; 27, 28 vacation; 29 done. Streak should be 3.
    const records = [
      makeRecord('h1', '2026-04-25'),
      makeRecord('h1', '2026-04-26'),
      makeRecord('h1', '2026-04-29'),
    ];
    const vac = new Set(['2026-04-27', '2026-04-28']);
    const result = computeStreak(habit, buildIndex(records), checker, vac, { now: NOW });
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
  });

  test('today is vacation → current streak preserved from yesterday but not incremented', () => {
    const records = [
      makeRecord('h1', '2026-04-28'),
      makeRecord('h1', '2026-04-29'),
    ];
    const vac = new Set(['2026-04-30']); // today
    const result = computeStreak(habit, buildIndex(records), checker, vac, { now: NOW });
    expect(result.current).toBe(2);
  });

  test('vacation does not grant credit on its own — empty completions = 0 streak', () => {
    const vac = new Set(['2026-04-27', '2026-04-28', '2026-04-29']);
    const result = computeStreak(habit, new Map(), checker, vac, { now: NOW });
    expect(result.current).toBe(0);
    expect(result.longest).toBe(0);
  });

  test('non-vacation gap still breaks the streak', () => {
    // Apr 25, 26 done; 27 missed (not vacation); 28, 29 done.
    const records = [
      makeRecord('h1', '2026-04-25'),
      makeRecord('h1', '2026-04-26'),
      makeRecord('h1', '2026-04-28'),
      makeRecord('h1', '2026-04-29'),
    ];
    const result = computeStreak(habit, buildIndex(records), checker, new Set(), { now: NOW });
    expect(result.current).toBe(2);
    expect(result.longest).toBe(2);
  });

  test('long streak with multiple vacation periods stays intact', () => {
    // Done daily Apr 1–29 except 10–12 and 20–22 which are vacation.
    const records: HabitRecord[] = [];
    for (let d = 1; d <= 29; d++) {
      const date = `2026-04-${String(d).padStart(2, '0')}`;
      if (d >= 10 && d <= 12) continue;
      if (d >= 20 && d <= 22) continue;
      records.push(makeRecord('h1', date));
    }
    const vac = new Set([
      '2026-04-10', '2026-04-11', '2026-04-12',
      '2026-04-20', '2026-04-21', '2026-04-22',
    ]);
    const result = computeStreak(habit, buildIndex(records), checker, vac, { now: NOW });
    expect(result.current).toBe(23); // 29 days minus 6 vacation days
    expect(result.longest).toBe(23);
  });
});

describe('computeStreak - termination', () => {
  test('terminates well before the safety cap when records are sparse', () => {
    const habit = makeHabit();
    const records = [makeRecord('h1', '2026-04-29')];
    // safetyCap is 36500 by default — set it very low and confirm we
    // still terminate correctly via the earliest-record check.
    const result = computeStreak(
      habit,
      buildIndex(records),
      checker,
      new Set(),
      { now: NOW, safetyCap: 5 },
    );
    expect(result.current).toBe(1);
  });
});
