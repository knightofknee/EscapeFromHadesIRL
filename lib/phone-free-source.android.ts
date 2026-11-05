import { Platform } from 'react-native';
import { intervalsFromScreenEvents, type ScreenEvent, type UsageInterval } from '@/lib/phone-free';
import * as UsageEvents from '@/modules/usage-events';
import type { PhoneFreeStatus } from '@/lib/phone-free-source';

// Android implementation — Metro resolves this file ONLY in Android bundles.
// Reads lock/unlock history from UsageStatsManager through the local
// usage-events module. Needs the Usage Access special permission, which the
// user grants on a system Settings page (no runtime dialog exists for it).

/** Screen/keyguard events exist from Android 9 (API 28). */
const MIN_API = 28;

export async function getPhoneFreeStatus(): Promise<PhoneFreeStatus> {
  try {
    if (Number(Platform.Version) < MIN_API || !UsageEvents.isAvailable()) return 'unavailable';
    return UsageEvents.hasPermission() ? 'ready' : 'needs-permission';
  } catch (e) {
    console.error('getPhoneFreeStatus android failed:', e);
    return 'unavailable';
  }
}

export async function requestPhoneFreePermission(): Promise<void> {
  try {
    UsageEvents.openSettings();
  } catch (e) {
    console.error('requestPhoneFreePermission android failed:', e);
  }
}

export async function savePhoneFreeSelection(_selectionToken: string): Promise<void> {}

export async function getUsageIntervals(
  startMs: number,
  endMs: number,
): Promise<UsageInterval[] | null> {
  try {
    if (!UsageEvents.hasPermission()) return null;
    const events: ScreenEvent[] = await UsageEvents.queryScreenEvents(startMs, endMs);
    // Zero events across a whole night range means the system has no
    // history for it (aged out, permission just granted), not an untouched
    // phone: every phone emits a lock or screen-off at some point.
    if (events.length === 0) return null;
    return intervalsFromScreenEvents(events, startMs, endMs);
  } catch (e) {
    console.error('getUsageIntervals android failed:', e);
    return null;
  }
}
