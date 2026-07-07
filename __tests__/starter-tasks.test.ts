import {
  pickAcronym,
  pickColor,
  computeFreePositions,
  isStarterAdded,
  findExistingStarter,
  resolveStarterTasks,
} from '../lib/starter-tasks';
import { STARTER_TASKS } from '../constants/starter-tasks';
import type { Habit, RecordingMode } from '../types/habit';
import type { Quest } from '../types/quest';

const task = (key: string) => STARTER_TASKS.find((t) => t.key === key)!;

// Minimal habit factory — only the fields the helpers read.
function h(partial: Partial<Habit>): Habit {
  return {
    id: partial.id ?? 'id',
    userId: 'u',
    name: partial.name ?? '',
    abbreviation: partial.abbreviation ?? '',
    recordingMode: (partial.recordingMode ?? 'quad') as RecordingMode,
    tileSize: 1,
    position: partial.position ?? { row: 0, col: 0 },
    color: partial.color ?? '#000000',
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as Habit;
}

describe('pickAcronym — 1 letter unless taken, per the spec', () => {
  test('the full set in order yields W, M, R, CW, E, Y, Mu', () => {
    const used = new Set<string>();
    const out = STARTER_TASKS.map((t) => {
      const a = pickAcronym(t, used);
      used.add(a.toUpperCase());
      return a;
    });
    expect(out).toEqual(['W', 'M', 'R', 'CW', 'E', 'Y', 'Mu']);
  });

  test('falls back to the alt form when the first letter is taken', () => {
    const used = new Set(['M']); // Meditate already claimed M
    expect(pickAcronym(task('music'), used)).toBe('Mu');
  });

  test('Write is CW regardless (creative writing, and W is Walk’s)', () => {
    expect(pickAcronym(task('write'), new Set(['W']))).toBe('CW');
  });
});

describe('pickColor — no repeats', () => {
  test('preferred colors across the set are all distinct', () => {
    const used = new Set<string>();
    const colors = STARTER_TASKS.map((t) => {
      const c = pickColor(t, used);
      used.add(c.toUpperCase());
      return c;
    });
    expect(new Set(colors).size).toBe(colors.length);
  });

  test('when the preferred color is taken, the next free palette color is used', () => {
    const used = new Set(['#2ECC71']); // Walk’s green already in use
    const c = pickColor(task('walk'), used);
    expect(c).not.toBe('#2ECC71');
    expect(used.has(c.toUpperCase())).toBe(false);
  });
});

describe('computeFreePositions — row-major over 4 columns', () => {
  test('empty grid fills (0,0)…(1,2) for 7 tiles', () => {
    expect(computeFreePositions([], 7)).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ]);
  });

  test('skips occupied cells', () => {
    const existing = [h({ position: { row: 0, col: 1 } }), h({ position: { row: 0, col: 0 } })];
    expect(computeFreePositions(existing, 2)).toEqual([
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ]);
  });
});

describe('already-added detection', () => {
  test('typed presets match by recording mode', () => {
    const habits = [h({ recordingMode: 'steps' })];
    expect(isStarterAdded(task('walk'), habits)).toBe(true);
    expect(isStarterAdded(task('meditate'), habits)).toBe(false);
  });

  test('quad presets match by name (case-insensitive), not mode', () => {
    const habits = [h({ recordingMode: 'quad', name: 'read' })];
    expect(isStarterAdded(task('read'), habits)).toBe(true);
    // A different quad habit doesn’t count as Yoga.
    expect(isStarterAdded(task('yoga'), habits)).toBe(false);
    expect(findExistingStarter(task('read'), habits)?.name).toBe('read');
  });
});

describe('resolveStarterTasks', () => {
  test('keeps selected, drops already-added, in canonical order', () => {
    const habits = [h({ recordingMode: 'steps' })]; // walk already added
    const out = resolveStarterTasks(['music', 'walk', 'read'], habits);
    expect(out.map((t) => t.key)).toEqual(['read', 'music']); // canonical order, walk dropped
  });
});

describe('partial-failure heal (habit created, quest failed)', () => {
  const q = (partial: Partial<Quest>): Quest =>
    ({
      id: 'q',
      userId: 'u',
      templateKey: null,
      name: '',
      description: '',
      category: 'custom',
      questType: 'positive',
      linkedHabitIds: [],
      targetDaysPerWeek: 5,
      status: 'active',
      createdAt: 0,
      updatedAt: 0,
      ...partial,
    }) as Quest;

  test('walk with a habit but NO quest is not "added" when quests are known', () => {
    const walk = task('walk');
    const habits = [h({ id: 'hw', recordingMode: 'steps' })];
    // habit-only check (no quests) still reports added — back-compat.
    expect(isStarterAdded(walk, habits)).toBe(true);
    // With quests supplied and none linked, it is NOT fully added.
    expect(isStarterAdded(walk, habits, [])).toBe(false);
    // So it survives resolve and can be re-run to create the missing quest.
    expect(resolveStarterTasks(['walk'], habits, []).map((t) => t.key)).toEqual(['walk']);
  });

  test('walk with both habit and its linked quest is fully added', () => {
    const walk = task('walk');
    const habits = [h({ id: 'hw', recordingMode: 'steps' })];
    const quests = [q({ templateKey: walk.questTemplateKey, linkedHabitIds: ['hw'] })];
    expect(isStarterAdded(walk, habits, quests)).toBe(true);
    expect(resolveStarterTasks(['walk'], habits, quests)).toEqual([]);
  });
});
