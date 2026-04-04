import { scoreQuest } from '../hooks/use-quest-scores';
import type { Quest } from '../types/quest';
import type { Habit, HabitRecord } from '../types/habit';

function makeQuest(overrides?: Partial<Quest>): Quest {
  return {
    id: 'q1',
    userId: 'u1',
    templateKey: null,
    name: 'Test Quest',
    description: '',
    category: 'custom',
    questType: 'positive',
    linkedHabitIds: ['h1'],
    targetDaysPerWeek: 7,
    status: 'active',
    activatedAt: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeHabit(id: string, mode: Habit['recordingMode'] = 'boolean'): Habit {
  return {
    id,
    userId: 'u1',
    name: 'Test',
    abbreviation: 'T',
    recordingMode: mode,
    tileSize: 1,
    position: { row: 0, col: 0 },
    color: '#000',
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeDates(count: number): string[] {
  const dates: string[] = [];
  const d = new Date(2026, 3, 4); // April 4, 2026
  for (let i = 0; i < count; i++) {
    const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dates.unshift(str);
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

function makeRecordIndex(entries: [string, any][]): Map<string, HabitRecord> {
  const map = new Map<string, HabitRecord>();
  for (const [key, value] of entries) {
    const [habitId, date] = key.split('_', 2);
    map.set(key, {
      id: key,
      habitId: habitId!,
      userId: 'u1',
      date: date!,
      value,
      recordedAt: 0,
    });
  }
  return map;
}

describe('scoreQuest - positive quests', () => {
  const dates = makeDates(30);
  const habits = [makeHabit('h1', 'boolean')];

  test('all days completed = 100%', () => {
    const entries = dates.map((d) => [`h1_${d}`, true] as [string, any]);
    const result = scoreQuest(makeQuest(), habits, makeRecordIndex(entries), dates);
    expect(result.completedDays).toBe(30);
    expect(result.score).toBe(100);
  });

  test('no days completed = 0%', () => {
    const result = scoreQuest(makeQuest(), habits, new Map(), dates);
    expect(result.completedDays).toBe(0);
    expect(result.score).toBe(0);
  });

  test('half days completed with 7x/wk target', () => {
    const entries = dates.slice(0, 15).map((d) => [`h1_${d}`, true] as [string, any]);
    const result = scoreQuest(makeQuest(), habits, makeRecordIndex(entries), dates);
    expect(result.completedDays).toBe(15);
    // target = round(7/7 * 30) = 30, so 15/30 = 50%
    expect(result.score).toBe(50);
  });

  test('5x/wk target: completing 21+ days = 100%', () => {
    const quest = makeQuest({ targetDaysPerWeek: 5 });
    // target = round(5/7 * 30) = 21
    const entries = dates.slice(0, 22).map((d) => [`h1_${d}`, true] as [string, any]);
    const result = scoreQuest(quest, habits, makeRecordIndex(entries), dates);
    expect(result.completedDays).toBe(22);
    expect(result.score).toBe(100);
  });
});

describe('scoreQuest - triple bonus', () => {
  const dates = makeDates(30);
  const habits = [makeHabit('h1', 'triple')];

  test('double days add goal bonus', () => {
    // All 30 days completed, 10 as double
    const entries: [string, any][] = dates.map((d, i) => [
      `h1_${d}`,
      i < 10 ? 'double' : 'yes',
    ]);
    const result = scoreQuest(makeQuest(), habits, makeRecordIndex(entries), dates);
    expect(result.completedDays).toBe(30);
    expect(result.doubleDays).toBe(10);
    expect(result.score).toBe(100); // already at 100, bonus can't exceed
  });

  test('double bonus pushes score above raw execution', () => {
    const quest = makeQuest({ targetDaysPerWeek: 7 });
    // 25 days completed, 10 as double
    const entries: [string, any][] = dates.slice(0, 25).map((d, i) => [
      `h1_${d}`,
      i < 10 ? 'double' : 'yes',
    ]);
    const result = scoreQuest(quest, habits, makeRecordIndex(entries), dates);
    expect(result.completedDays).toBe(25);
    expect(result.doubleDays).toBe(10);
    expect(result.executionPct).toBe(83); // 25/30
    expect(result.score).toBeGreaterThan(result.executionPct);
  });
});

describe('scoreQuest - quad bonus', () => {
  const dates = makeDates(30);
  const habits = [makeHabit('h1', 'quad')];

  test('ideal days count as both double and ideal', () => {
    const entries: [string, any][] = dates.map((d) => [`h1_${d}`, 'ideal']);
    const result = scoreQuest(makeQuest(), habits, makeRecordIndex(entries), dates);
    expect(result.completedDays).toBe(30);
    expect(result.doubleDays).toBe(30);
    expect(result.idealDays).toBe(30);
  });

  test('goal days count as double but not ideal', () => {
    const entries: [string, any][] = dates.map((d) => [`h1_${d}`, 'goal']);
    const result = scoreQuest(makeQuest(), habits, makeRecordIndex(entries), dates);
    expect(result.doubleDays).toBe(30);
    expect(result.idealDays).toBe(0);
  });

  test('ideal gets higher bonus than goal', () => {
    const quest = makeQuest({ targetDaysPerWeek: 7 });
    // 15 days as goal (won't hit 100% cap)
    const goalEntries: [string, any][] = dates.slice(0, 15).map((d) => [`h1_${d}`, 'goal']);
    const goalResult = scoreQuest(quest, habits, makeRecordIndex(goalEntries), dates);
    // 15 days as ideal
    const idealEntries: [string, any][] = dates.slice(0, 15).map((d) => [`h1_${d}`, 'ideal']);
    const idealResult = scoreQuest(quest, habits, makeRecordIndex(idealEntries), dates);
    expect(idealResult.score).toBeGreaterThan(goalResult.score);
  });
});

describe('scoreQuest - reduce quests', () => {
  const dates = makeDates(30);
  const habits = [makeHabit('h1', 'boolean')];

  test('no records = all good days', () => {
    const quest = makeQuest({ questType: 'reduce' });
    const result = scoreQuest(quest, habits, new Map(), dates);
    expect(result.completedDays).toBe(30);
    expect(result.score).toBe(100);
  });

  test('all days recorded = 0 good days', () => {
    const quest = makeQuest({ questType: 'reduce' });
    const entries = dates.map((d) => [`h1_${d}`, true] as [string, any]);
    const result = scoreQuest(quest, habits, makeRecordIndex(entries), dates);
    expect(result.completedDays).toBe(0);
    expect(result.score).toBe(0);
  });

  test('quad habit in reduce quest: "yes"/"goal"/"ideal" all count as done', () => {
    const quadHabits = [makeHabit('h1', 'quad')];
    const quest = makeQuest({ questType: 'reduce' });
    const entries: [string, any][] = [
      [`h1_${dates[0]}`, 'yes'],
      [`h1_${dates[1]}`, 'goal'],
      [`h1_${dates[2]}`, 'ideal'],
    ];
    const result = scoreQuest(quest, quadHabits, makeRecordIndex(entries), dates);
    // 3 days were "done" so 27 good days
    expect(result.completedDays).toBe(27);
  });

  test('quad habit in reduce quest: "no" does not count as done', () => {
    const quadHabits = [makeHabit('h1', 'quad')];
    const quest = makeQuest({ questType: 'reduce' });
    const entries: [string, any][] = dates.map((d) => [`h1_${d}`, 'no']);
    const result = scoreQuest(quest, quadHabits, makeRecordIndex(entries), dates);
    expect(result.completedDays).toBe(30); // all good days
  });
});
