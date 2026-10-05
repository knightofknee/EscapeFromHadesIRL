import {
  addCompletion,
  choreStatus,
  formatDue,
  formatDuePreset,
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

function task(name: string, dueDate: string, created: string, completions: string[] = []): Chore {
  const [y, m, d] = created.split('-').map(Number);
  return {
    ...chore(name, 0, completions),
    kind: 'once',
    dueDate,
    createdAt: new Date(y, m - 1, d, 12).getTime(),
  };
}

describe('one-time tasks', () => {
  test('judged by due date: soon in the last quarter (at least the day before), late after', () => {
    // Created Sep 30, due Oct 30: 30-day span, soon window 7 days.
    expect(choreStatus(task('t', '2026-10-30', TODAY), TODAY)).toMatchObject({ state: 'fresh', dueIn: 30 });
    expect(choreStatus(task('t', '2026-10-30', '2026-09-01'), '2026-10-23').state).toBe('soon');
    // Short span: due tomorrow is already yellow.
    expect(choreStatus(task('t', '2026-10-01', TODAY), TODAY).state).toBe('soon');
    expect(choreStatus(task('t', '2026-10-02', TODAY), TODAY).state).toBe('fresh');
    expect(choreStatus(task('t', TODAY, '2026-09-20'), TODAY).state).toBe('soon');
    expect(choreStatus(task('t', '2026-09-28', '2026-09-20'), TODAY)).toMatchObject({ state: 'late', dueIn: -2 });
  });

  test('any completion makes it done, regardless of due date', () => {
    const s = choreStatus(task('t', '2026-09-28', '2026-09-20', ['2026-09-29']), TODAY);
    expect(s).toMatchObject({ state: 'done', daysSince: 1, dueIn: null });
    expect(formatDue(s)).toBe('Done yesterday');
  });

  test('pill text matches recurring wording', () => {
    expect(formatDue(choreStatus(task('t', '2026-09-28', '2026-09-20'), TODAY))).toBe('2 days late');
    expect(formatDue(choreStatus(task('t', TODAY, '2026-09-20'), TODAY))).toBe('Due today');
    expect(formatDue(choreStatus(task('t', '2026-10-01', TODAY), TODAY))).toBe('Due tomorrow');
  });

  test('sorts alongside chores, done last (most recent first)', () => {
    const order = sortChores(
      [
        task('old done', '2026-09-20', '2026-09-10', ['2026-09-21']),
        task('new done', '2026-09-20', '2026-09-10', ['2026-09-29']),
        task('late task', '2026-09-28', '2026-09-20'),
        chore('fresh chore', 7, ['2026-09-29']),
        task('later task', '2026-11-30', TODAY),
      ],
      TODAY,
    ).map((x) => x.chore.name);
    expect(order).toEqual(['late task', 'fresh chore', 'later task', 'new done', 'old done']);
  });

  test('due presets', () => {
    expect([0, 1, 3, 7, 14, 30].map(formatDuePreset)).toEqual([
      'Today',
      'Tomorrow',
      'In 3 days',
      'In a week',
      'In 2 weeks',
      'In a month',
    ]);
  });
});
