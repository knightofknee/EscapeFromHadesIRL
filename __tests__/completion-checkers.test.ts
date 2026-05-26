import { isRecordCompleted, isRecordGoal, isRecordIdeal, shouldSkipWeekend } from '../lib/habit-scoring';
import type { Habit, HabitRecord } from '../types/habit';

function makeHabit(mode: Habit['recordingMode']): Habit {
  return {
    id: 'h1',
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

function makeRecord(value: any): HabitRecord {
  return {
    id: 'r1',
    habitId: 'h1',
    userId: 'u1',
    date: '2026-04-04',
    value,
    recordedAt: 0,
  };
}

describe('isRecordCompleted', () => {
  test('returns false with no record', () => {
    expect(isRecordCompleted(makeHabit('boolean'))).toBe(false);
    expect(isRecordCompleted(makeHabit('triple'))).toBe(false);
    expect(isRecordCompleted(makeHabit('quad'))).toBe(false);
    expect(isRecordCompleted(makeHabit('counter'))).toBe(false);
    expect(isRecordCompleted(makeHabit('value'))).toBe(false);
  });

  describe('boolean mode', () => {
    const habit = makeHabit('boolean');
    test('true is completed', () => {
      expect(isRecordCompleted(habit, makeRecord(true))).toBe(true);
    });
    test('false is not completed', () => {
      expect(isRecordCompleted(habit, makeRecord(false))).toBe(false);
    });
    test('"no" is not completed', () => {
      expect(isRecordCompleted(habit, makeRecord('no'))).toBe(false);
    });
    // Cross-mode compatibility: old triple/quad values should count as completed
    test('"yes" from old triple data counts as completed', () => {
      expect(isRecordCompleted(habit, makeRecord('yes'))).toBe(true);
    });
    test('"double" from old triple data counts as completed', () => {
      expect(isRecordCompleted(habit, makeRecord('double'))).toBe(true);
    });
    test('"goal" from old quad data counts as completed', () => {
      expect(isRecordCompleted(habit, makeRecord('goal'))).toBe(true);
    });
    test('"ideal" from old quad data counts as completed', () => {
      expect(isRecordCompleted(habit, makeRecord('ideal'))).toBe(true);
    });
  });

  describe('triple mode', () => {
    const habit = makeHabit('triple');
    test('"yes" is completed', () => {
      expect(isRecordCompleted(habit, makeRecord('yes'))).toBe(true);
    });
    test('"double" is completed', () => {
      expect(isRecordCompleted(habit, makeRecord('double'))).toBe(true);
    });
    test('"no" is not completed', () => {
      expect(isRecordCompleted(habit, makeRecord('no'))).toBe(false);
    });
  });

  describe('quad mode', () => {
    const habit = makeHabit('quad');
    test('"yes" is completed', () => {
      expect(isRecordCompleted(habit, makeRecord('yes'))).toBe(true);
    });
    test('"goal" is completed', () => {
      expect(isRecordCompleted(habit, makeRecord('goal'))).toBe(true);
    });
    test('"ideal" is completed', () => {
      expect(isRecordCompleted(habit, makeRecord('ideal'))).toBe(true);
    });
    test('"no" is not completed', () => {
      expect(isRecordCompleted(habit, makeRecord('no'))).toBe(false);
    });
  });

  describe('counter mode', () => {
    const habit = makeHabit('counter');
    test('value > 0 is completed', () => {
      expect(isRecordCompleted(habit, makeRecord(5))).toBe(true);
    });
    test('value 0 is not completed', () => {
      expect(isRecordCompleted(habit, makeRecord(0))).toBe(false);
    });
  });

  describe('value mode', () => {
    const habit = makeHabit('value');
    test('non-empty string is completed', () => {
      expect(isRecordCompleted(habit, makeRecord('hello'))).toBe(true);
    });
    test('empty string is not completed', () => {
      expect(isRecordCompleted(habit, makeRecord(''))).toBe(false);
    });
  });
});

describe('isRecordGoal', () => {
  test('triple: "double" counts as goal', () => {
    expect(isRecordGoal(makeHabit('triple'), makeRecord('double'))).toBe(true);
  });
  test('triple: "yes" does not count as goal', () => {
    expect(isRecordGoal(makeHabit('triple'), makeRecord('yes'))).toBe(false);
  });
  test('quad: "goal" counts', () => {
    expect(isRecordGoal(makeHabit('quad'), makeRecord('goal'))).toBe(true);
  });
  test('quad: "ideal" counts', () => {
    expect(isRecordGoal(makeHabit('quad'), makeRecord('ideal'))).toBe(true);
  });
  test('quad: "yes" does not count', () => {
    expect(isRecordGoal(makeHabit('quad'), makeRecord('yes'))).toBe(false);
  });
  test('boolean: always false', () => {
    expect(isRecordGoal(makeHabit('boolean'), makeRecord(true))).toBe(false);
  });
  test('counter: always false', () => {
    expect(isRecordGoal(makeHabit('counter'), makeRecord(10))).toBe(false);
  });
});

describe('isRecordIdeal', () => {
  test('quad: "ideal" counts', () => {
    expect(isRecordIdeal(makeHabit('quad'), makeRecord('ideal'))).toBe(true);
  });
  test('quad: "goal" does not count', () => {
    expect(isRecordIdeal(makeHabit('quad'), makeRecord('goal'))).toBe(false);
  });
  test('triple: "double" does not count', () => {
    expect(isRecordIdeal(makeHabit('triple'), makeRecord('double'))).toBe(false);
  });
  test('no record returns false', () => {
    expect(isRecordIdeal(makeHabit('quad'))).toBe(false);
  });
});

describe('shouldSkipWeekend', () => {
  const habit = makeHabit('boolean');
  // Calendar reference: 2026-04-25 = Saturday, 2026-04-26 = Sunday,
  // 2026-04-27 = Monday, 2026-04-28 = Tuesday.

  test('returns false when winOnlyWeekends is off, regardless of day or record', () => {
    expect(shouldSkipWeekend(habit, undefined, '2026-04-25', false)).toBe(false);
    expect(shouldSkipWeekend(habit, makeRecord(true), '2026-04-25', false)).toBe(false);
    expect(shouldSkipWeekend(habit, makeRecord(false), '2026-04-27', false)).toBe(false);
  });

  test('returns false on weekdays even when winOnlyWeekends is on', () => {
    expect(shouldSkipWeekend(habit, undefined, '2026-04-27', true)).toBe(false);
    expect(shouldSkipWeekend(habit, makeRecord(false), '2026-04-28', true)).toBe(false);
  });

  test('returns true on a weekend day when the record is missing', () => {
    expect(shouldSkipWeekend(habit, undefined, '2026-04-25', true)).toBe(true);
    expect(shouldSkipWeekend(habit, undefined, '2026-04-26', true)).toBe(true);
  });

  test('returns true on a weekend day when the record is non-positive', () => {
    expect(shouldSkipWeekend(habit, makeRecord(false), '2026-04-25', true)).toBe(true);
    expect(shouldSkipWeekend(habit, makeRecord('no'), '2026-04-26', true)).toBe(true);
  });

  test('returns false on a weekend day when the record is positive (no loss to skip)', () => {
    expect(shouldSkipWeekend(habit, makeRecord(true), '2026-04-25', true)).toBe(false);
  });

  test('uses the provided checker to decide what counts as positive', () => {
    const tripleHabit = makeHabit('triple');
    // With the default (any completion) checker: "yes" counts as positive → not skipped.
    expect(shouldSkipWeekend(tripleHabit, makeRecord('yes'), '2026-04-25', true)).toBe(false);
    // With isRecordGoal (level 1): "yes" is NOT positive → skipped on weekend.
    expect(shouldSkipWeekend(tripleHabit, makeRecord('yes'), '2026-04-25', true, isRecordGoal)).toBe(true);
    // But "double" still counts at level 1.
    expect(shouldSkipWeekend(tripleHabit, makeRecord('double'), '2026-04-25', true, isRecordGoal)).toBe(false);
  });
});
