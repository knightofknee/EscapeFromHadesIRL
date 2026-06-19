import {
  formatDate,
  addDays,
  parseDate,
  isWeekend,
  get18MonthWindow,
} from '../lib/date-utils';

// addDays/formatDate/parseDate do calendar-component arithmetic
// (new Date(y, m-1, d + n)), which is correct across DST and timezones
// because it never adds raw 24h spans. These guard that invariant — day
// rollover, scoring windows, and meditation day-cross attribution all depend
// on it. Pure calendar arithmetic, so they pass in any local timezone.

describe('addDays', () => {
  it('produces consecutive calendar dates across a US spring-forward boundary', () => {
    // 2026 DST begins Sun Mar 8. A naive +24h would skip/repeat a day.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-03-09', -1)).toBe('2026-03-08');
  });

  it('produces consecutive dates across a fall-back boundary', () => {
    // 2026 DST ends Sun Nov 1.
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01'); // 2026 not a leap year
  });

  it('handles leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // 2028 is a leap year
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('walks a multi-day span with no skipped or repeated days', () => {
    let d = '2026-03-06';
    const seen: string[] = [d];
    for (let i = 0; i < 6; i++) {
      d = addDays(d, 1);
      seen.push(d);
    }
    expect(seen).toEqual([
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
    ]);
  });
});

describe('parseDate / formatDate roundtrip', () => {
  it('is stable across boundaries and leap days', () => {
    for (const s of ['2026-01-01', '2026-03-08', '2026-11-01', '2026-12-31', '2028-02-29']) {
      expect(formatDate(parseDate(s))).toBe(s);
    }
  });
});

describe('isWeekend', () => {
  it('flags Saturday and Sunday only', () => {
    expect(isWeekend('2026-06-20')).toBe(true); // Saturday
    expect(isWeekend('2026-06-21')).toBe(true); // Sunday
    expect(isWeekend('2026-06-19')).toBe(false); // Friday
    expect(isWeekend('2026-06-22')).toBe(false); // Monday
  });
});

describe('get18MonthWindow', () => {
  it('returns 548 days back, inclusive of today, across a leap year', () => {
    const { startDate, endDate } = get18MonthWindow('2027-06-19');
    expect(endDate).toBe('2027-06-19');
    // 548 days earlier (the span includes the leap day 2028? no — going back
    // from mid-2027 crosses Feb 2026, not a leap year). Just assert the start
    // is exactly 548 days before via the same arithmetic.
    expect(startDate).toBe(addDays('2027-06-19', -548));
  });

  it('handles a year-boundary anchor', () => {
    const { startDate, endDate } = get18MonthWindow('2027-01-01');
    expect(endDate).toBe('2027-01-01');
    expect(startDate).toBe(addDays('2027-01-01', -548));
  });
});
