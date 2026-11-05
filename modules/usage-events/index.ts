import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { ScreenEvent } from '@/lib/phone-free';

// Android-only local module: reads screen/keyguard history from
// UsageStatsManager (see android/.../UsageEventsModule.kt). Optional so the
// JS keeps loading in a build that predates the module; every call degrades
// to "unavailable".
const Native = requireOptionalNativeModule<{
  hasPermission(): boolean;
  openSettings(): void;
  queryScreenEvents(startMs: number, endMs: number): Promise<ScreenEvent[]>;
}>('UsageEvents');

export function isAvailable(): boolean {
  return Platform.OS === 'android' && Native != null;
}

/** Whether Usage Access is granted (a special permission, toggled in system Settings). */
export function hasPermission(): boolean {
  if (!Native) return false;
  return Native.hasPermission();
}

/** Open the system Usage Access settings page where the user grants it. */
export function openSettings(): void {
  Native?.openSettings();
}

/** Unlock/lock and screen on/off events in [startMs, endMs), oldest first. */
export async function queryScreenEvents(startMs: number, endMs: number): Promise<ScreenEvent[]> {
  if (!Native) return [];
  return Native.queryScreenEvents(startMs, endMs);
}
