import {
  DISMISS_SNOOZE_MS,
  isNewerVersion,
  isSnoozed,
} from '@/lib/app-update';

// Plain ts-jest environment (no Expo/RN transforms) — stub the native modules
// app-update imports for its Firestore/storage paths; only the pure helpers
// are under test here. jest hoists these above the import.
jest.mock(
  'expo-application',
  () => ({ applicationId: null, nativeApplicationVersion: null }),
  { virtual: true },
);
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }), { virtual: true });
jest.mock(
  '@react-native-async-storage/async-storage',
  () => ({ default: { getItem: jest.fn(), setItem: jest.fn() } }),
  { virtual: true },
);
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn() }));
jest.mock('@/lib/firebase/firestore', () => ({ db: {} }));

describe('isNewerVersion', () => {
  it('detects a newer released version', () => {
    expect(isNewerVersion('1.0.16', '1.0.15')).toBe(true);
    expect(isNewerVersion('1.1.0', '1.0.15')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('1.0.10', '1.0.9')).toBe(true);
  });

  it('returns false when equal or older', () => {
    expect(isNewerVersion('1.0.15', '1.0.15')).toBe(false);
    expect(isNewerVersion('1.0.14', '1.0.15')).toBe(false);
    expect(isNewerVersion('0.9.9', '1.0.0')).toBe(false);
  });

  it('treats missing segments as zero', () => {
    expect(isNewerVersion('1.1', '1.1.0')).toBe(false);
    expect(isNewerVersion('1.1.1', '1.1')).toBe(true);
    expect(isNewerVersion('1.1', '1.0.9')).toBe(true);
  });

  it('never prompts on malformed versions', () => {
    expect(isNewerVersion('abc', '1.0.15')).toBe(false);
    expect(isNewerVersion('1.0.x', '1.0.15')).toBe(false);
    expect(isNewerVersion('', '1.0.15')).toBe(false);
  });
});

describe('isSnoozed', () => {
  const now = 1_000_000_000;

  it('is quiet within the snooze window for the dismissed version', () => {
    expect(isSnoozed('1.0.18', { version: '1.0.18', at: now - 1 }, now)).toBe(true);
    expect(
      isSnoozed('1.0.18', { version: '1.0.18', at: now - DISMISS_SNOOZE_MS + 1 }, now),
    ).toBe(true);
  });

  it('re-prompts once the snooze window has passed', () => {
    expect(
      isSnoozed('1.0.18', { version: '1.0.18', at: now - DISMISS_SNOOZE_MS }, now),
    ).toBe(false);
  });

  it('prompts immediately for a newer release than the one dismissed', () => {
    expect(isSnoozed('1.0.19', { version: '1.0.18', at: now - 1 }, now)).toBe(false);
  });

  it('prompts when nothing was dismissed', () => {
    expect(isSnoozed('1.0.18', null, now)).toBe(false);
  });
});
