import {
  buildDateRange,
  getContiguousBlock,
  vacationDocId,
} from '../lib/vacation-days';

describe('vacationDocId', () => {
  test('formats userId and date with underscore separator', () => {
    expect(vacationDocId('uABC', '2026-04-30')).toBe('uABC_2026-04-30');
  });
});

describe('buildDateRange', () => {
  test('single-day range returns one date', () => {
    expect(buildDateRange('2026-04-30', '2026-04-30')).toEqual(['2026-04-30']);
  });

  test('inclusive at both ends', () => {
    expect(buildDateRange('2026-04-28', '2026-04-30')).toEqual([
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
    ]);
  });

  test('walks across month boundary', () => {
    expect(buildDateRange('2026-04-29', '2026-05-02')).toEqual([
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
      '2026-05-02',
    ]);
  });

  test('walks across year boundary', () => {
    expect(buildDateRange('2025-12-30', '2026-01-02')).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
  });

  test('empty range when start > end (caller is expected to swap)', () => {
    expect(buildDateRange('2026-04-30', '2026-04-28')).toEqual([]);
  });

  test('handles a leap-day February correctly', () => {
    expect(buildDateRange('2024-02-28', '2024-03-01')).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });

  test('safety cap prevents infinite loops on absurd input', () => {
    // 5-year cap => at most ~1830 entries. Just check it doesn't hang.
    const result = buildDateRange('2026-01-01', '2999-12-31');
    expect(result.length).toBeLessThanOrEqual(366 * 5);
  });
});

describe('getContiguousBlock', () => {
  test('returns empty when target date is not in the set', () => {
    const set = new Set(['2026-04-28', '2026-04-29']);
    expect(getContiguousBlock('2026-04-30', set)).toEqual([]);
  });

  test('isolated single-day vacation returns that one day', () => {
    const set = new Set(['2026-04-30']);
    expect(getContiguousBlock('2026-04-30', set)).toEqual(['2026-04-30']);
  });

  test('contiguous block is returned in chronological order', () => {
    const set = new Set([
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
    ]);
    expect(getContiguousBlock('2026-04-29', set)).toEqual([
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
    ]);
  });

  test('a one-day gap correctly splits two blocks', () => {
    // 28-29 ... gap on 30 ... 01-02
    const set = new Set([
      '2026-04-28',
      '2026-04-29',
      '2026-05-01',
      '2026-05-02',
    ]);
    expect(getContiguousBlock('2026-04-28', set)).toEqual([
      '2026-04-28',
      '2026-04-29',
    ]);
    expect(getContiguousBlock('2026-05-02', set)).toEqual([
      '2026-05-01',
      '2026-05-02',
    ]);
  });

  test('block walks correctly across a month boundary', () => {
    const set = new Set([
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
      '2026-05-02',
    ]);
    expect(getContiguousBlock('2026-04-30', set)).toEqual([
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
      '2026-05-02',
    ]);
  });

  test('any day in the block returns the same block', () => {
    const set = new Set(['2026-04-27', '2026-04-28', '2026-04-29']);
    const expected = ['2026-04-27', '2026-04-28', '2026-04-29'];
    expect(getContiguousBlock('2026-04-27', set)).toEqual(expected);
    expect(getContiguousBlock('2026-04-28', set)).toEqual(expected);
    expect(getContiguousBlock('2026-04-29', set)).toEqual(expected);
  });
});
