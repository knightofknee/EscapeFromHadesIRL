import { isSnapshotStale, mergeWithLive, SNAPSHOT_TTL_MS } from '@/lib/records-snapshot-store';
import type { HabitRecord } from '@/types/habit';

jest.mock(
  '@react-native-async-storage/async-storage',
  () => ({ default: { getItem: jest.fn(), setItem: jest.fn(), getAllKeys: jest.fn(), multiRemove: jest.fn() } }),
  { virtual: true },
);
jest.mock('@/lib/firebase/firestore', () => ({
  db: {},
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(),
}));

const rec = (habitId: string, date: string, value: HabitRecord['value'] = true): HabitRecord => ({
  id: `${habitId}_${date}`,
  habitId,
  userId: 'u1',
  date,
  value,
  recordedAt: 0,
});

describe('mergeWithLive', () => {
  const snapshot = [rec('a', '2025-06-01'), rec('a', '2026-09-20'), rec('b', '2026-10-01', false)];

  it('uses the snapshot alone before the live window has loaded', () => {
    expect(mergeWithLive(snapshot, [], null, '2025-04-01', '2026-10-05')).toBe(snapshot);
  });

  it('lets live records own the live window, including deletions', () => {
    const live = [rec('a', '2026-10-05'), rec('b', '2026-10-01', true)];
    const out = mergeWithLive(snapshot, live, { start: '2026-09-25', end: '2026-10-05' }, '2025-04-01', '2026-10-05');
    expect(out.map((r) => `${r.id}:${r.value}`).sort()).toEqual([
      'a_2025-06-01:true',
      'a_2026-09-20:true',
      'a_2026-10-05:true',
      'b_2026-10-01:true',
    ]);
    // a_2026-09-20 is outside the live window, so the snapshot keeps it.
    const removed = mergeWithLive(snapshot, [], { start: '2026-09-15', end: '2026-10-05' }, '2025-04-01', '2026-10-05');
    expect(removed.map((r) => r.id)).toEqual(['a_2025-06-01']);
  });

  it('drops live records outside the requested window', () => {
    const out = mergeWithLive([], [rec('a', '2023-01-01'), rec('a', '2026-10-04')], { start: '2022-12-01', end: '2026-10-05' }, '2025-04-01', '2026-10-05');
    expect(out.map((r) => r.date)).toEqual(['2026-10-04']);
  });
});

describe('isSnapshotStale', () => {
  const base = { uid: 'u1', start: '2025-04-01', end: '2026-10-05', records: [] };
  it('is fresh for the same window inside the TTL', () => {
    expect(isSnapshotStale({ ...base, at: Date.now() }, base.start, base.end)).toBe(false);
  });
  it('is stale when the window moved (a new day) or the TTL passed', () => {
    expect(isSnapshotStale({ ...base, at: Date.now() }, '2025-04-02', '2026-10-06')).toBe(true);
    expect(isSnapshotStale({ ...base, at: Date.now() - SNAPSHOT_TTL_MS - 1 }, base.start, base.end)).toBe(true);
  });
});
