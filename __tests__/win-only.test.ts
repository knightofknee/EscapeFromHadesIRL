import { birthdayWeek, parseBirthday, winOnlyDates } from '../lib/win-only';

describe('birthday', () => {
  it('a birthday of Oct 16 covers Oct 15 to 22', () => {
    expect(birthdayWeek('10-16', 2026)).toEqual({ start: '2026-10-15', end: '2026-10-22' });
  });

  it('a New Year birthday starts the week before', () => {
    expect(birthdayWeek('01-01', 2027)).toEqual({ start: '2026-12-31', end: '2027-01-07' });
  });

  it('Feb 29 lands on Feb 28 in other years', () => {
    expect(birthdayWeek('02-29', 2027).start).toBe('2027-02-27');
    expect(birthdayWeek('02-29', 2028).start).toBe('2028-02-28');
  });

  it('only real calendar days parse', () => {
    expect(parseBirthday('10-16')).toBe('10-16');
    expect(parseBirthday('02-29')).toBe('02-29');
    expect(parseBirthday('02-30')).toBeNull();
    expect(parseBirthday('13-01')).toBeNull();
    expect(parseBirthday(null)).toBeNull();
  });
});

describe('winOnlyDates', () => {
  it('collects the birthday week in every year of the range', () => {
    const set = winOnlyDates({ birthday: '10-16', from: '2025-10-01', to: '2026-12-31' });
    expect(set.has('2025-10-15')).toBe(true);
    expect(set.has('2026-10-22')).toBe(true);
    expect(set.has('2026-10-23')).toBe(false);
    expect(set.size).toBe(16);
  });

  it('clips to the range, and no birthday means no days', () => {
    expect([...winOnlyDates({ birthday: '10-16', from: '2026-10-20', to: '2026-10-30' })].sort()).toEqual([
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
    ]);
    expect(winOnlyDates({ birthday: null, from: '2026-01-01', to: '2026-12-31' }).size).toBe(0);
  });
});
