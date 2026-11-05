import type { UsageInterval } from '@/lib/phone-free';

// Platform-split module, same contract as lib/steps-health.ts: Metro
// resolves phone-free-source.ios.ts on iOS and phone-free-source.android.ts
// on Android, each statically importing only its own native library.
// THIS file is what tsc type-checks against — keep the signatures in
// lockstep with both platform files.

export type PhoneFreeStatus =
  /** No way to read phone use on this device/OS. */
  | 'unavailable'
  /** The OS-level permission has not been granted. */
  | 'needs-permission'
  /** iOS only: permission granted, but the user has not picked which apps
   *  count yet (Apple requires an explicit selection). */
  | 'needs-selection'
  /** Monitoring is set up; nights can be read. */
  | 'ready';

export async function getPhoneFreeStatus(): Promise<PhoneFreeStatus> {
  return 'unavailable';
}

/**
 * Ask for the OS permission. iOS shows Apple's Screen Time sheet and
 * resolves when it closes. Android can only open the Usage Access settings
 * page; the grant is detected on the next foreground via getPhoneFreeStatus.
 */
export async function requestPhoneFreePermission(): Promise<void> {}

/**
 * iOS only: save the user's app selection and (re)start the nightly
 * monitor. No-op elsewhere.
 */
export async function savePhoneFreeSelection(_selectionToken: string): Promise<void> {}

/**
 * The phone-use timeline over [startMs, endMs). Null means UNKNOWN (no
 * permission, monitor not running, history aged out): the caller must not
 * record a night from it. An empty array is a real "untouched" answer.
 */
export async function getUsageIntervals(
  _startMs: number,
  _endMs: number,
): Promise<UsageInterval[] | null> {
  return null;
}
