import { computeDayBreakdown } from '../lib/day-breakdown';
import type { Habit, HabitRecord } from '../types/habit';

function habit(id: string, recordingMode: Habit['recordingMode']): Habit {
  return {
    id,
    userId: 'u1',
    name: id,
    abbreviation: id[0].toUpperCase(),
    recordingMode,
    tileSize: 1,
    position: { row: 0, col: 0 },
    color: '#000',
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

function record(habitId: string, value: HabitRecord['value'], extra: Partial<HabitRecord> = {}): HabitRecord {
  return { id: `${habitId}_d`, habitId, userId: 'u1', date: '2026-09-16', value, recordedAt: 0, ...extra };
}

describe('computeDayBreakdown', () => {
  test('weights ideal 1.5, goal 1.25, done 1 over active habits × 1.5', () => {
    const habits = [habit('a', 'quad'), habit('b', 'triple'), habit('c', 'boolean'), habit('d', 'boolean')];
    const records: Record<string, HabitRecord> = {
      a: record('a', 'ideal'),
      b: record('b', 'double'),
      c: record('c', true),
    };
    const b = computeDayBreakdown(habits, '2026-09-16', (h) => records[h.id], false);
    expect(b.active).toBe(4);
    expect(b.done).toBe(3);
    expect(b.ratio).toBeCloseTo((1.5 + 1.25 + 1) / (4 * 1.5));
    expect(b.rows.map((r) => r.detail)).toEqual(['ideal', 'goal', 'done', 'missed']);
  });

  test('value and steps rows show the amount', () => {
    const habits = [habit('v', 'value'), habit('s', 'steps')];
    const records: Record<string, HabitRecord> = {
      v: record('v', '2.5'),
      s: record('s', 'goal', { steps: 12000 }),
    };
    const b = computeDayBreakdown(habits, '2026-09-16', (h) => records[h.id], false);
    expect(b.rows[0].detail).toBe('2.5');
    expect(b.rows[1].detail).toBe('12,000 · goal');
  });

  test('win-only weekends: an undone weekend habit is listed but not counted', () => {
    const habits = [habit('a', 'boolean'), habit('b', 'boolean')];
    // 2026-09-19 is a Saturday.
    const b = computeDayBreakdown(habits, '2026-09-19', (h) => (h.id === 'a' ? record('a', true) : undefined), true);
    expect(b.rows[1].weekendOff).toBe(true);
    expect(b.active).toBe(1);
    expect(b.ratio).toBeCloseTo(1 / 1.5);
  });
});
