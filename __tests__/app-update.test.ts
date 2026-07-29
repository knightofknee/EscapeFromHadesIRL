import { isNewerVersion } from '@/lib/app-update';

// Plain ts-jest environment (no Expo/RN transforms) — stub the native
// modules app-update imports for its fetch path; only the pure
// comparator is under test here. jest hoists these above the import.
jest.mock(
  'expo-application',
  () => ({ applicationId: null, nativeApplicationVersion: null }),
  { virtual: true },
);
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }), { virtual: true });

describe('isNewerVersion', () => {
  it('detects a newer store version', () => {
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
