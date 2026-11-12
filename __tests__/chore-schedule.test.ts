import {
  formatDaysBefore,
  localDateOf,
  nextDueDate,
  reminderSlots,
  reminderTitle,
  remindersFor,
  safeTimeZone,
  zonedTimeToUtc,
  type ScheduleChore,
} from '../functions/src/chore-schedule';

function recurring(freq: number, completions: string[] = [], extra: Partial<ScheduleChore> = {}): ScheduleChore {
  return { userId: 'a', kind: 'recurring', frequencyDays: freq, completions, ...extra };
}

describe('nextDueDate', () => {
  it('recurring counts from the last done day', () => {
    expect(nextDueDate(recurring(7, ['2026-10-20']), '2026-01-01')).toBe('2026-10-27');
  });
  it('a never-logged recurring chore counts from creation', () => {
    expect(nextDueDate(recurring(3), '2026-10-29')).toBe('2026-11-01');
  });
  it('whenever chores and done tasks are never due', () => {
    expect(nextDueDate(recurring(0), '2026-10-29')).toBeNull();
    expect(nextDueDate({ userId: 'a', kind: 'once', frequencyDays: 0, dueDate: '2026-11-05', completions: ['2026-11-01'] }, 'x')).toBeNull();
  });
  it('an open task is due on its date', () => {
    expect(nextDueDate({ userId: 'a', kind: 'once', frequencyDays: 0, dueDate: '2026-11-05', completions: [] }, 'x')).toBe('2026-11-05');
  });
});

describe('remindersFor', () => {
  it('each person has their own', () => {
    const c = recurring(7, [], { reminders: { a: [{ daysBefore: 0, time: '12:00' }], b: [{ daysBefore: 1, time: '08:30' }] } });
    expect(remindersFor(c, 'b')).toEqual([{ daysBefore: 1, time: '08:30' }]);
    expect(remindersFor(c, 'z')).toEqual([]);
  });
  it('reads the legacy task reminder as the owner\'s, due day', () => {
    const c: ScheduleChore = { userId: 'a', kind: 'once', frequencyDays: 0, dueDate: '2026-11-05', completions: [], reminderTime: '15:00' };
    expect(remindersFor(c, 'a')).toEqual([{ daysBefore: 0, time: '15:00' }]);
    expect(remindersFor(c, 'b')).toEqual([]);
  });
  it('drops malformed times and keeps every valid reminder', () => {
    const c = recurring(7, [], {
      reminders: { a: [{ daysBefore: 0, time: '25:00' }, { daysBefore: 0, time: '12:00' }, { daysBefore: 1, time: '09:00' }, { daysBefore: 2, time: '10:00' }] },
    });
    expect(remindersFor(c, 'a')).toEqual([
      { daysBefore: 0, time: '12:00' },
      { daysBefore: 1, time: '09:00' },
      { daysBefore: 2, time: '10:00' },
    ]);
  });
});

describe('reminderSlots', () => {
  it('lands N days before the due date', () => {
    const c = recurring(7, ['2026-10-20'], { reminders: { a: [{ daysBefore: 0, time: '12:00' }, { daysBefore: 2, time: '18:00' }] } });
    expect(reminderSlots(c, 'a', '2026-01-01')).toEqual([
      { index: 0, daysBefore: 0, date: '2026-10-27', time: '12:00', due: '2026-10-27' },
      { index: 1, daysBefore: 2, date: '2026-10-25', time: '18:00', due: '2026-10-27' },
    ]);
  });
  it('never rings on or before the day it was last done', () => {
    const c = recurring(1, ['2026-10-29'], { reminders: { a: [{ daysBefore: 1, time: '12:00' }] } });
    expect(reminderSlots(c, 'a', '2026-01-01')).toEqual([]);
  });
  it('done tasks have none', () => {
    const c: ScheduleChore = {
      userId: 'a', kind: 'once', frequencyDays: 0, dueDate: '2026-11-05', completions: ['2026-11-01'],
      reminders: { a: [{ daysBefore: 0, time: '12:00' }] },
    };
    expect(reminderSlots(c, 'a', 'x')).toEqual([]);
  });
});

describe('time zones', () => {
  it('converts local wall time to the right instant', () => {
    expect(new Date(zonedTimeToUtc('2026-07-01', '12:00', 'America/New_York')).toISOString()).toBe('2026-07-01T16:00:00.000Z');
    expect(new Date(zonedTimeToUtc('2026-12-01', '12:00', 'America/New_York')).toISOString()).toBe('2026-12-01T17:00:00.000Z');
    expect(new Date(zonedTimeToUtc('2026-12-01', '09:30', 'Asia/Kolkata')).toISOString()).toBe('2026-12-01T04:00:00.000Z');
  });
  it('handles the DST change days', () => {
    expect(new Date(zonedTimeToUtc('2026-03-08', '12:00', 'America/New_York')).toISOString()).toBe('2026-03-08T16:00:00.000Z');
    expect(new Date(zonedTimeToUtc('2026-11-01', '12:00', 'America/New_York')).toISOString()).toBe('2026-11-01T17:00:00.000Z');
  });
  it('local date of an instant', () => {
    expect(localDateOf(Date.UTC(2026, 9, 30, 2, 0), 'America/Los_Angeles')).toBe('2026-10-29');
  });
  it('bad zones fall back to UTC', () => {
    expect(safeTimeZone('Not/AZone')).toBe('UTC');
    expect(safeTimeZone(undefined)).toBe('UTC');
    expect(safeTimeZone('Europe/Paris')).toBe('Europe/Paris');
  });
});

describe('copy', () => {
  it('titles and labels', () => {
    expect(reminderTitle(0)).toBe('Due today');
    expect(reminderTitle(1)).toBe('Due tomorrow');
    expect(reminderTitle(3)).toBe('Due in 3 days');
    expect(formatDaysBefore(0)).toBe('On the due day');
    expect(formatDaysBefore(7)).toBe('1 week before');
    expect(formatDaysBefore(2)).toBe('2 days before');
  });
});
