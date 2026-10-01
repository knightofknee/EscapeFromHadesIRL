import {
  addCompletion,
  choreStatus,
  formatDue,
  formatFrequency,
  formatSince,
  removeCompletion,
  soonWindow,
  sortChores,
  CHORE_HISTORY_CAP,
} from '../lib/chores';
import type { Chore } from '../types/chore';

const TODAY = '2026-09-30';

function chore(name: string, frequencyDays: number, completions: string[] = []): Chore {
  return { id: name, userId: 'u1', name, emoji: '🧹', frequencyDays, completions, createdAt: 0, updatedAt: 0 };
}

describe('choreStatus', () => {
  test('daily: done today is fresh, yesterday is due, two days is late', () => {
    expect(choreStatus(chore('a', 1, ['2026-09-30']), TODAY).state).toBe('fresh');
    expect(choreStatus(chore('a', 1, ['2026-09-29']), TODAY).state).toBe('soon');
    expect(choreStatus(chore('a', 1, ['2026-09-28']), TODAY).state).toBe('late');
  });

  test('weekly: yellow for the last day before and on the due day', () => {
    expect(choreStatus(chore('a', 7, ['2026-09-25']), TODAY).state).toBe('fresh'); // 5 days
    expect(choreStatus(chore('a', 7, ['2026-09-24']), TODAY).state).toBe('soon'); // 6 days
    expect(choreStatus(chore('a', 7, ['2026-09-23']), TODAY).state).toBe('soon'); // 7 days, due
    expect(choreStatus(chore('a', 7, ['2026-09-22']), TODAY).state).toBe('late'); // 8 days
  });

  test('monthly: nearly due a week out; crosses month boundaries', () => {
    expect(soonWindow(30)).toBe(7);
    const s = choreStatus(chore('toilet', 30, ['2026-09-05']), TODAY);
    expect(s).toMatchObject({ state: 'soon', daysSince: 25, dueIn: 5 });
    expect(choreStatus(chore('toilet', 30, ['2026-08-25']), TODAY).state).toBe('late');
  });

  test('never done is its own state', () => {
    expect(choreStatus(chore('a', 7), TODAY)).toMatchObject({ state: 'never', daysSince: null });
  });
});

describe('sortChores', () => {
  test('late (most overdue first), soon, never, fresh', () => {
    const list = [
      chore('fresh', 30, ['2026-09-29']),
      chore('never', 7),
      chore('slightly late', 7, ['2026-09-21']), // 9/7
      chore('very late', 1, ['2026-09-25']), // 5/1
      chore('due', 7, ['2026-09-23']),
    ];
    expect(sortChores(list, TODAY).map((x) => x.chore.name)).toEqual([
      'very late',
      'slightly late',
      'due',
      'never',
      'fresh',
    ]);
  });
});

describe('completions', () => {
  test('dedupes, keeps newest first, caps', () => {
    expect(addCompletion(['2026-09-20'], '2026-09-25')).toEqual(['2026-09-25', '2026-09-20']);
    expect(addCompletion(['2026-09-25'], '2026-09-20')).toEqual(['2026-09-25', '2026-09-20']);
    expect(addCompletion(['2026-09-25'], '2026-09-25')).toEqual(['2026-09-25']);
    const many = Array.from({ length: CHORE_HISTORY_CAP }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
    expect(addCompletion(many, TODAY)).toHaveLength(CHORE_HISTORY_CAP);
    expect(removeCompletion(['2026-09-25', '2026-09-20'], '2026-09-25')).toEqual(['2026-09-20']);
  });
});

describe('formatting', () => {
  test('frequency', () => {
    expect(formatFrequency(1)).toBe('Daily');
    expect(formatFrequency(21)).toBe('Every 3 weeks');
    expect(formatFrequency(10)).toBe('Every 10 days');
    expect(formatFrequency(120)).toBe('Every 4 months');
    expect(formatFrequency(182)).toBe('Every 6 months');
    expect(formatFrequency(365)).toBe('Yearly');
    expect(formatFrequency(2557)).toBe('Every 7 years');
    expect(formatFrequency(3652)).toBe('Every 10 years');
  });

  test('since and due', () => {
    expect(formatSince(0)).toBe('Today');
    expect(formatSince(1)).toBe('Yesterday');
    expect(formatSince(20)).toBe('2 weeks ago');
    expect(formatDue(choreStatus(chore('a', 7, ['2026-09-21']), TODAY))).toBe('2 days late');
    expect(formatDue(choreStatus(chore('a', 7, ['2026-09-23']), TODAY))).toBe('Due today');
    expect(formatDue(choreStatus(chore('a', 7, ['2026-09-30']), TODAY))).toBe('Done today');
    expect(formatDue(choreStatus(chore('a', 30, ['2026-09-20']), TODAY))).toBe('Due in 2 weeks');
  });
});
