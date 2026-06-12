import { scoreQuest, scoreAllHabitsQuest, questPointValue } from '../hooks/use-quest-scores';
import { isWeekend } from '../lib/date-utils';
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

  test('reduce: doing it every day blows past the max → 0', () => {
    // max 2/week over 30 days ≈ 9 allowed; doing it all 30 days is way over.
    const quest = makeQuest({ questType: 'reduce', targetDaysPerWeek: 2 });
    const entries = dates.map((d) => [`h1_${d}`, true] as [string, any]);
    const result = scoreQuest(quest, habits, makeRecordIndex(entries), dates);
    expect(result.completedDays).toBe(0); // 0 clean days
    expect(result.score).toBe(0);
  });

  test('reduce: staying within the weekly max scores 100', () => {
    const quest = makeQuest({ questType: 'reduce', targetDaysPerWeek: 2 });
    // Did it on ~9 days (the allowance over 30 days) → still within budget.
    const entries = dates.slice(0, 9).map((d) => [`h1_${d}`, true] as [string, any]);
    const result = scoreQuest(quest, habits, makeRecordIndex(entries), dates);
    expect(result.score).toBe(100);
  });

  test('reduce: exceeding the weekly max scales the score down', () => {
    const quest = makeQuest({ questType: 'reduce', targetDaysPerWeek: 2 });
    // Did it 20 of 30 days — well over the ~9 allowed, but not every day.
    const entries = dates.slice(0, 20).map((d) => [`h1_${d}`, true] as [string, any]);
    const result = scoreQuest(quest, habits, makeRecordIndex(entries), dates);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
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

describe('scoreQuest - vacation handling', () => {
  // Spec invariants we're locking in:
  //   1. Vacation days are removed from the timeline entirely. The window
  //      shrinks; targetDays scales with the active window so the user
  //      isn't punished.
  //   2. A user who hits their target on every active day gets 100% even
  //      if the rest of the calendar window was vacation.
  //   3. A user who took a vacation and did nothing on active days gets 0%
  //      (vacation alone shouldn't grant credit).
  const habits = [makeHabit('h1', 'boolean')];

  test('range with vacation days excluded → smaller active window, full credit on active days', () => {
    const allDates = makeDates(30);
    // Caller (useQuestScores) has already filtered out vacation dates;
    // pass only the 23 active days.
    const activeDates = allDates.slice(0, 23);
    const entries = activeDates.map((d) => [`h1_${d}`, true] as [string, any]);
    const result = scoreQuest(makeQuest(), habits, makeRecordIndex(entries), activeDates);
    expect(result.completedDays).toBe(23);
    // target = round(7/7 * 23) = 23 → 23/23 = 100%
    expect(result.targetDays).toBe(23);
    expect(result.score).toBe(100);
  });

  test('vacation user with zero active completions → 0%, no spurious credit', () => {
    const allDates = makeDates(30);
    const activeDates = allDates.slice(0, 5); // 25 days vacation, 5 active
    const result = scoreQuest(makeQuest(), habits, new Map(), activeDates);
    expect(result.completedDays).toBe(0);
    expect(result.targetDays).toBe(5);
    expect(result.score).toBe(0);
  });

  test('partial completion within active window scales correctly', () => {
    const allDates = makeDates(30);
    const activeDates = allDates.slice(0, 14); // 14-day active window
    // 7 done out of 14 active days = 50% with a 7x/wk target.
    const entries = activeDates.slice(0, 7).map((d) => [`h1_${d}`, true] as [string, any]);
    const result = scoreQuest(makeQuest(), habits, makeRecordIndex(entries), activeDates);
    expect(result.completedDays).toBe(7);
    expect(result.targetDays).toBe(14); // round(7/7 * 14)
    expect(result.score).toBe(50);
  });

  test('reduce quest with vacation days: only active days count toward the window', () => {
    const allDates = makeDates(30);
    const activeDates = allDates.slice(0, 10); // 10 active days
    const quest = makeQuest({ questType: 'reduce' });
    // No habit done at all on the 10 active days → 100% (all good days).
    const result = scoreQuest(quest, habits, new Map(), activeDates);
    expect(result.completedDays).toBe(10);
    expect(result.score).toBe(100);
  });
});

describe('scoreQuest - Win only Weekends', () => {
  const habits = [makeHabit('h1', 'boolean')];
  // makeDates ends at 2026-04-04 (Saturday). Working backward 30 days, the
  // window includes 8 weekend days (4 Sat + 4 Sun across 4 full weeks plus
  // partial endpoints).

  test('positive quest: unmarked weekends are pruned from target denominator', () => {
    const dates = makeDates(30);
    // User completes every WEEKDAY in the window, but nothing on weekends.
    // Use the same isWeekend helper scoreQuest does internally so the test
    // matches in any timezone (new Date("YYYY-MM-DD") would parse as UTC).
    const weekdayDates = dates.filter((d) => !isWeekend(d));
    const entries = weekdayDates.map((d) => [`h1_${d}`, true] as [string, any]);
    const recordIndex = makeRecordIndex(entries);

    const without = scoreQuest(makeQuest(), habits, recordIndex, dates, false);
    expect(without.completedDays).toBe(weekdayDates.length);
    // Target counts every weekend day as a miss → score < 100.
    expect(without.score).toBeLessThan(100);

    const withWoW = scoreQuest(makeQuest(), habits, recordIndex, dates, true);
    expect(withWoW.completedDays).toBe(weekdayDates.length);
    // With WoW, target shrinks to the weekday window → 100%.
    expect(withWoW.targetDays).toBe(weekdayDates.length);
    expect(withWoW.score).toBe(100);
  });

  test('positive quest: weekend completions still count as wins', () => {
    const dates = makeDates(30);
    // User completes every day including weekends.
    const entries = dates.map((d) => [`h1_${d}`, true] as [string, any]);
    const result = scoreQuest(makeQuest(), habits, makeRecordIndex(entries), dates, true);
    expect(result.completedDays).toBe(30);
    expect(result.targetDays).toBe(30);
    expect(result.score).toBe(100);
  });

  test('reduce quest is unaffected by WoW (weekend non-completion is already the win)', () => {
    const dates = makeDates(30);
    const quest = makeQuest({ questType: 'reduce' });
    // No habit done on any day → 100% for reduce. WoW shouldn't change that.
    const without = scoreQuest(quest, habits, new Map(), dates, false);
    const withWoW = scoreQuest(quest, habits, new Map(), dates, true);
    expect(without.score).toBe(100);
    expect(withWoW.score).toBe(100);
    expect(withWoW.targetDays).toBe(without.targetDays);
  });
});

describe('questPointValue', () => {
  test('positive quest: value scales with weekly commitment, 18mo worth 6x', () => {
    // 5x/wk basic: 50 + 300 = 350
    const v = questPointValue(makeQuest({ targetDaysPerWeek: 5 }));
    expect(v.value30).toBe(50);
    expect(v.value18).toBe(300);
    expect(v.total).toBe(350);
    // 3x/wk basic: 30 + 180 = 210
    expect(questPointValue(makeQuest({ targetDaysPerWeek: 3 })).total).toBe(210);
  });

  test('success level raises the value: goal x2, ideal x4', () => {
    const base = questPointValue(makeQuest({ targetDaysPerWeek: 5 }));
    const goal = questPointValue(makeQuest({ targetDaysPerWeek: 5, successLevel: 2 }));
    const ideal = questPointValue(makeQuest({ targetDaysPerWeek: 5, successLevel: 3 }));
    expect(goal.value30).toBe(base.value30 * 2);
    expect(ideal.value30).toBe(base.value30 * 4);
    expect(goal.value18).toBe(goal.value30 * 6);
    expect(ideal.total).toBe(ideal.value30 * 7);
  });

  test('reduce quest: commitment is the days abstained beyond the allowance', () => {
    // Max 2x/wk allowed → 5 abstain days/wk of commitment → 50 + 300 = 350
    const v = questPointValue(makeQuest({ questType: 'reduce', targetDaysPerWeek: 2 }));
    expect(v.value30).toBe(50);
    expect(v.total).toBe(350);
    // Allowance covers the whole week → minimum commitment of 1 → 70 total
    expect(
      questPointValue(makeQuest({ questType: 'reduce', targetDaysPerWeek: 7 })).total,
    ).toBe(70);
  });
});

describe('questPointValue scoreWindow', () => {
  test('30d-window quest earns only the 30-day value', () => {
    const v = questPointValue(makeQuest({ targetDaysPerWeek: 4, scoreWindow: '30d' }));
    expect(v.value30).toBe(40);
    expect(v.value18).toBe(0);
    expect(v.total).toBe(40);
  });

  test('18mo-window quest earns only the (6x) 18-month value', () => {
    const v = questPointValue(makeQuest({ targetDaysPerWeek: 4, scoreWindow: '18mo' }));
    expect(v.value30).toBe(0);
    expect(v.value18).toBe(240);
    expect(v.total).toBe(240);
  });

  test('tier multipliers compose with the window: the template ladder', () => {
    // Charon's Crossing (30d, any): 4x10 = 40
    expect(
      questPointValue(makeQuest({ targetDaysPerWeek: 4, scoreWindow: '30d' })).total,
    ).toBe(40);
    // Hermes' Stride (30d, goal): 4x10x2 = 80
    expect(
      questPointValue(makeQuest({ targetDaysPerWeek: 4, scoreWindow: '30d', successLevel: 2 })).total,
    ).toBe(80);
    // The Golden Bough (30d, ideal): 4x10x4 = 160
    expect(
      questPointValue(makeQuest({ targetDaysPerWeek: 4, scoreWindow: '30d', successLevel: 3 })).total,
    ).toBe(160);
    // Charon's Vigil (18mo, any): 40x6 = 240
    expect(
      questPointValue(makeQuest({ targetDaysPerWeek: 4, scoreWindow: '18mo' })).total,
    ).toBe(240);
    // Sisyphus' Resolve (18mo, goal): 80x6 = 480
    expect(
      questPointValue(makeQuest({ targetDaysPerWeek: 4, scoreWindow: '18mo', successLevel: 2 })).total,
    ).toBe(480);
    // Heracles' Ascent (18mo, ideal): 160x6 = 960
    expect(
      questPointValue(makeQuest({ targetDaysPerWeek: 4, scoreWindow: '18mo', successLevel: 3 })).total,
    ).toBe(960);
  });

  test("'both'/undefined keeps the dual-window value", () => {
    expect(questPointValue(makeQuest({ targetDaysPerWeek: 5 })).total).toBe(350);
    expect(questPointValue(makeQuest({ targetDaysPerWeek: 5, scoreWindow: 'both' })).total).toBe(350);
  });
});

describe('windowSize backfill', () => {
  const habits = [makeHabit('h1')];

  test('scores only the most recent N counting days from a deep pool', () => {
    const dates = makeDates(60);
    // Complete every day in the OLD half only — the recent 30 are all misses.
    const entries = dates.slice(0, 30).map((d) => [`h1_${d}`, true] as [string, any]);
    const result = scoreQuest(
      makeQuest({ targetDaysPerWeek: 7 }),
      habits,
      makeRecordIndex(entries),
      dates,
      false,
      30,
    );
    expect(result.windowDays).toBe(30);
    expect(result.targetDays).toBe(30);
    expect(result.completedDays).toBe(0);
  });

  test('window stays full when earlier days are skipped (always-30 rule)', () => {
    const dates = makeDates(60);
    const result = scoreQuest(
      makeQuest({ targetDaysPerWeek: 5 }),
      habits,
      new Map(),
      dates,
      false,
      30,
    );
    // Full 30-day window from a 60-day pool → fixed 21-day goal for 5x/wk.
    expect(result.windowDays).toBe(30);
    expect(result.targetDays).toBe(21);
  });
});

describe('legacy tierless-link fallback (linked quests only)', () => {
  test('a goal-bar quest linked to a boolean habit scores plain true days', () => {
    const dates = makeDates(30);
    const entries: [string, any][] = [
      [`b1_${dates[0]}`, true],
      [`b1_${dates[1]}`, true],
    ];
    const quest = makeQuest({ linkedHabitIds: ['b1'], successLevel: 2 });
    const result = scoreQuest(
      quest, [makeHabit('b1', 'boolean')], makeRecordIndex(entries), dates,
    );
    // The stored bar (2) is unreachable on a tierless habit — the quest is
    // enforced at basic instead of silently flatlining to 0 forever.
    expect(result.completedDays).toBe(2);
  });
});

describe('all-habit quests (best single habit, not a union of days)', () => {
  const manyHabits = [
    makeHabit('b1', 'boolean'),
    makeHabit('t1', 'triple'),
    makeHabit('q1', 'quad'),
  ];

  test('the tierless fallback NEVER applies to all-habit trials — strict bar even when a tierless habit would win', () => {
    const dates = makeDates(30);
    const entries: [string, any][] = [
      [`b1_${dates[0]}`, true],
      [`b1_${dates[1]}`, true],
      [`b1_${dates[2]}`, true], // boolean would win with 3 days IF the fallback applied
      [`q1_${dates[3]}`, 'goal'], // quad: 1 genuine tier-2 day
    ];
    const quest = makeQuest({ allHabits: true, linkedHabitIds: [], successLevel: 2 });
    const { qs, bestHabitId } = scoreAllHabitsQuest(
      quest, manyHabits, makeRecordIndex(entries), dates,
    );
    expect(qs.completedDays).toBe(1);
    expect(bestHabitId).toBe('q1');
  });

  test('shows the single best habit — days across habits never combine', () => {
    const dates = makeDates(30);
    const entries: [string, any][] = [
      [`b1_${dates[0]}`, true], // boolean: 1 day
      [`q1_${dates[1]}`, 'yes'], // quad: 1 day (different day)
      [`q1_${dates[2]}`, 'yes'], // quad: 2nd day → quad is the best habit
    ];
    const quest = makeQuest({ allHabits: true, linkedHabitIds: [] });
    const { qs, bestHabitId } = scoreAllHabitsQuest(
      quest, manyHabits, makeRecordIndex(entries), dates,
    );
    // Union would be 3 days; best single habit (q1) has 2.
    expect(qs.completedDays).toBe(2);
    expect(bestHabitId).toBe('q1');
  });

  test('tier quests gate every recording mode on the unified level scale', () => {
    const dates = makeDates(30);
    const entries: [string, any][] = [
      [`b1_${dates[0]}`, true], // boolean tops out at level 1 — not tier 2
      [`t1_${dates[1]}`, 'double'], // triple double = level 2 ✓ (1 day)
      [`q1_${dates[2]}`, 'goal'], // quad goal = level 2 ✓ (1 day)
      [`q1_${dates[3]}`, 'goal'], // quad: 2nd tier-2 day → quad wins
    ];
    const quest = makeQuest({ allHabits: true, linkedHabitIds: [], successLevel: 2 });
    const { qs, bestHabitId } = scoreAllHabitsQuest(
      quest, manyHabits, makeRecordIndex(entries), dates,
    );
    expect(qs.completedDays).toBe(2);
    expect(bestHabitId).toBe('q1');
  });

  test('ideal-tier quests only count ideal days', () => {
    const dates = makeDates(30);
    const entries: [string, any][] = [
      [`q1_${dates[0]}`, 'goal'],
      [`q1_${dates[1]}`, 'ideal'],
      [`t1_${dates[2]}`, 'double'], // triple cannot reach level 3
    ];
    const quest = makeQuest({ allHabits: true, linkedHabitIds: [], successLevel: 3 });
    const { qs, bestHabitId } = scoreAllHabitsQuest(
      quest, manyHabits, makeRecordIndex(entries), dates,
    );
    expect(qs.completedDays).toBe(1);
    expect(bestHabitId).toBe('q1');
  });

  test('no records at all → zero score, no best habit', () => {
    const dates = makeDates(30);
    const quest = makeQuest({ allHabits: true, linkedHabitIds: [] });
    const { qs, bestHabitId } = scoreAllHabitsQuest(quest, manyHabits, new Map(), dates);
    expect(qs.completedDays).toBe(0);
    // All habits tie at 0 — the first is reported (stable), or none without habits.
    expect(bestHabitId).toBe('b1');
  });
});
