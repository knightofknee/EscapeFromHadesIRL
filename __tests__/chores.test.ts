import {
  addCompletion,
  choreStatus,
  countDue,
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
  test('daily: done today is fresh, due the next day, still due after', () => {
    expect(choreStatus(chore('a', 1, ['2026-09-30']), TODAY).state).toBe('fresh');
    expect(choreStatus(chore('a', 1, ['2026-09-29']), TODAY).state).toBe('due');
    expect(choreStatus(chore('a', 1, ['2026-09-28']), TODAY).state).toBe('due');
  });

  test('weekly: blue for the 2 days before, gold from the due day', () => {
    expect(choreStatus(chore('a', 7, ['2026-09-26']), TODAY).state).toBe('fresh'); // 4 days
    expect(choreStatus(chore('a', 7, ['2026-09-25']), TODAY).state).toBe('soon'); // 5 days, due in 2
    expect(choreStatus(chore('a', 7, ['2026-09-24']), TODAY).state).toBe('soon'); // 6 days
    expect(choreStatus(chore('a', 7, ['2026-09-23']), TODAY).state).toBe('due'); // 7 days, due
    expect(choreStatus(chore('a', 7, ['2026-09-22']), TODAY).state).toBe('due'); // 8 days
  });

  test('monthly: nearly due a week out; crosses month boundaries', () => {
    expect(soonWindow(30)).toBe(7);
    const s = choreStatus(chore('toilet', 30, ['2026-09-05']), TODAY);
    expect(s).toMatchObject({ state: 'soon', daysSince: 25, dueIn: 5 });
    expect(choreStatus(chore('toilet', 30, ['2026-08-25']), TODAY).state).toBe('due');
  });

  test('never logged counts from the day it was created', () => {
    const created = (date: string) => {
      const [y, m, d] = date.split('-').map(Number);
      return { ...chore('a', 7), createdAt: new Date(y, m - 1, d, 12).getTime() };
    };
    expect(choreStatus(created(TODAY), TODAY)).toMatchObject({ state: 'fresh', daysSince: null, dueIn: 7 });
    expect(choreStatus(created('2026-09-25'), TODAY)).toMatchObject({ state: 'soon', dueIn: 2 });
    expect(choreStatus(created('2026-09-20'), TODAY)).toMatchObject({ state: 'due', dueIn: -3 });
    expect(choreStatus(created('2026-09-16'), TODAY)).toMatchObject({ state: 'overdue', dueIn: -7 });
    expect(formatDue(choreStatus(created(TODAY), TODAY))).toBe('Due in 7 days');
  });

  test('late is gold for under a week past due, then red', () => {
    expect(choreStatus(chore('a', 7, ['2026-09-17']), TODAY)).toMatchObject({ state: 'due', dueIn: -6 });
    expect(choreStatus(chore('a', 7, ['2026-09-16']), TODAY)).toMatchObject({ state: 'overdue', dueIn: -7 });
    expect(choreStatus(task('t', '2026-09-23', '2026-09-10'), TODAY).state).toBe('overdue');
    expect(choreStatus(task('t', '2026-09-24', '2026-09-10'), TODAY).state).toBe('due');
  });

  test('pill says how long only from 3 days past due', () => {
    expect(formatDue(choreStatus(chore('a', 7, ['2026-09-21']), TODAY))).toBe('Due'); // 2 days
    expect(formatDue(choreStatus(chore('a', 7, ['2026-09-20']), TODAY))).toBe('Due 3 days ago');
    expect(formatDue(choreStatus(chore('a', 7, ['2026-09-16']), TODAY))).toBe('Overdue by 7 days');
    expect(formatDue(choreStatus(chore('a', 7, ['2026-09-02']), TODAY))).toBe('Overdue by 3 weeks');
  });

  test('blue window: at least 2 days, always leaving a green day', () => {
    expect([1, 2, 3, 7, 14, 30, 365].map(soonWindow)).toEqual([0, 1, 2, 2, 3, 7, 91]);
  });
});

describe('whenever (unscheduled) chores', () => {
  test('always green, says how long it has been', () => {
    const s = choreStatus(chore('a', 0, ['2026-09-25']), TODAY);
    expect(s).toMatchObject({ state: 'fresh', unscheduled: true, daysSince: 5, dueIn: null });
    expect(formatDue(s)).toBe('5 days ago');
    expect(choreStatus(chore('a', 0, ['2025-01-01']), TODAY).state).toBe('fresh');
    expect(formatDue(choreStatus(chore('a', 0, ['2026-08-30']), TODAY))).toBe('4 weeks ago');
    expect(formatDue(choreStatus(chore('a', 0, ['2026-07-01']), TODAY))).toBe('3 months ago');
    expect(formatDue(choreStatus(chore('a', 0, ['2026-09-29']), TODAY))).toBe('Yesterday');
    expect(formatDue(choreStatus(chore('a', 0, [TODAY]), TODAY))).toBe('Done today');
    expect(formatDue(choreStatus(chore('a', 0), TODAY))).toBe('Not done yet');
    expect(formatFrequency(0)).toBe('Whenever');
  });

  test('sit after scheduled chores, longest since first, never done last', () => {
    const sorted = sortChores(
      [
        chore('never', 0),
        chore('recent', 0, ['2026-09-28']),
        chore('scheduled', 30, ['2026-09-29']),
        chore('long ago', 0, ['2026-06-01']),
      ],
      TODAY,
    );
    expect(sorted.map((x) => x.chore.name)).toEqual(['scheduled', 'long ago', 'recent', 'never']);
    expect(sorted.every((x) => x.section === 'chores')).toBe(true);
  });
});

describe('sortChores', () => {
  test('due (most overdue first), then soonest coming up', () => {
    const list = [
      chore('fresh', 30, ['2026-09-29']),
      chore('slightly late', 7, ['2026-09-21']), // 9/7
      chore('very late', 1, ['2026-09-25']), // 5/1
      chore('due', 7, ['2026-09-23']),
    ];
    const sorted = sortChores(list, TODAY);
    expect(sorted.map((x) => x.chore.name)).toEqual(['very late', 'slightly late', 'due', 'fresh']);
    expect(sorted.map((x) => x.section)).toEqual(['dueChores', 'dueChores', 'dueChores', 'chores']);
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
    expect(formatDue(choreStatus(chore('a', 7, ['2026-09-21']), TODAY))).toBe('Due');
    expect(formatDue(choreStatus(chore('a', 7, ['2026-09-10']), TODAY))).toBe('Overdue by 13 days');
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
  test('judged by due date: soon in the last quarter (at least 2 days out), late after', () => {
    // Created Sep 30, due Oct 30: 30-day span, soon window 7 days.
    expect(choreStatus(task('t', '2026-10-30', TODAY), TODAY)).toMatchObject({ state: 'fresh', dueIn: 30 });
    expect(choreStatus(task('t', '2026-10-30', '2026-09-01'), '2026-10-23').state).toBe('soon');
    // Short span: due within 2 days is already blue.
    expect(choreStatus(task('t', '2026-10-01', TODAY), TODAY).state).toBe('soon');
    expect(choreStatus(task('t', '2026-10-02', TODAY), TODAY).state).toBe('soon');
    expect(choreStatus(task('t', '2026-10-03', TODAY), TODAY).state).toBe('fresh');
    expect(choreStatus(task('t', TODAY, '2026-09-20'), TODAY).state).toBe('due');
    expect(choreStatus(task('t', '2026-09-28', '2026-09-20'), TODAY)).toMatchObject({ state: 'due', dueIn: -2 });
  });

  test('any completion makes it done, regardless of due date', () => {
    const s = choreStatus(task('t', '2026-09-28', '2026-09-20', ['2026-09-29']), TODAY);
    expect(s).toMatchObject({ state: 'done', daysSince: 1, dueIn: null });
    expect(formatDue(s)).toBe('Done yesterday');
  });

  test('pill text matches recurring wording', () => {
    expect(formatDue(choreStatus(task('t', '2026-09-28', '2026-09-20'), TODAY))).toBe('Due');
    expect(formatDue(choreStatus(task('t', TODAY, '2026-09-20'), TODAY))).toBe('Due today');
    expect(formatDue(choreStatus(task('t', '2026-10-01', TODAY), TODAY))).toBe('Due tomorrow');
  });

  test('sections: late tasks, late chores, tasks by due date, chores, done (most recent first)', () => {
    const sorted = sortChores(
      [
        task('old done', '2026-09-20', '2026-09-10', ['2026-09-21']),
        task('new done', '2026-09-20', '2026-09-10', ['2026-09-29']),
        chore('late chore', 7, ['2026-09-01']),
        task('late task', '2026-09-28', '2026-09-20'),
        chore('fresh chore', 7, ['2026-09-29']),
        task('later task', '2026-11-30', TODAY),
        task('sooner task', '2026-10-05', TODAY),
      ],
      TODAY,
    );
    expect(sorted.map((x) => x.chore.name)).toEqual([
      'late task',
      'late chore',
      'sooner task',
      'later task',
      'fresh chore',
      'new done',
      'old done',
    ]);
    expect(sorted.map((x) => x.section)).toEqual([
      'dueTasks',
      'dueChores',
      'tasks',
      'tasks',
      'chores',
      'done',
      'done',
    ]);
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

describe('countDue (tab bubbles)', () => {
  test('splits gold due from red overdue; fresh, soon, whenever and done never count', () => {
    const list: Chore[] = [
      chore('dueToday', 7, ['2026-09-23']),
      chore('lateFew', 7, ['2026-09-20']),
      chore('overdue', 7, ['2026-09-09']),
      chore('fresh', 7, ['2026-09-29']),
      chore('whenever', 0, ['2026-01-01']),
      { ...chore('doneTask', 0), kind: 'once', dueDate: '2026-09-01', completions: ['2026-09-02'] },
      { ...chore('lateTask', 0), kind: 'once', dueDate: '2026-09-29' },
    ];
    expect(countDue(list, TODAY)).toEqual({ due: 3, overdue: 1 });
  });

  test('nothing to do is zero', () => {
    expect(countDue([], TODAY)).toEqual({ due: 0, overdue: 0 });
  });
});
