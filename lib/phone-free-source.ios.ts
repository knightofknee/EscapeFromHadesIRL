import {
  AuthorizationStatus,
  getActivities,
  getAuthorizationStatus,
  getEvents,
  requestAuthorization,
  startMonitoring,
  stopMonitoring,
} from 'react-native-device-activity';
import {
  intervalsFromThresholdCrossings,
  IOS_THRESHOLD_MINUTES,
  iosThresholdEventName,
  WINDOW_END_HOUR,
  WINDOW_START_HOUR,
  type ThresholdCrossing,
  type UsageInterval,
} from '@/lib/phone-free';
import { loadIosSelection, saveIosSelection } from '@/lib/phone-free-storage';
import type { PhoneFreeStatus } from '@/lib/phone-free-source';

// iOS implementation — Metro resolves this file ONLY in iOS bundles.
//
// Apple exposes no unlock history to apps. The one sanctioned signal is the
// Screen Time API (DeviceActivity): we register a nightly schedule and a
// ladder of cumulative-use thresholds ("1 minute of use", "2 minutes", ...)
// against the apps the user selected. The monitor extension records WHEN
// each threshold was crossed; lib/phone-free.ts turns those crossings into
// an approximate usage timeline. Known caveats: thresholds can fire late,
// the extension can go quiet (Low Power Mode, Screen Time sync), and the
// user must select every app category for "use" to mean the whole phone.
//
// Needs the Family Controls entitlement: development builds sign with it
// freely; App Store / TestFlight builds need Apple's per-bundle approval.

/** No underscores: the library splits its storage keys on "_". */
export const PHONE_FREE_ACTIVITY = 'phoneFreeNight';

export async function getPhoneFreeStatus(): Promise<PhoneFreeStatus> {
  try {
    if (getAuthorizationStatus() !== AuthorizationStatus.approved) return 'needs-permission';
    const token = await loadIosSelection();
    if (!token) return 'needs-selection';
    if (!getActivities().includes(PHONE_FREE_ACTIVITY)) {
      // Selection saved but the monitor is gone (OS reset, reinstall):
      // re-arm silently rather than bouncing the user through setup.
      await startNightMonitor(token);
    }
    return 'ready';
  } catch (e) {
    console.error('getPhoneFreeStatus ios failed:', e);
    return 'unavailable';
  }
}

/** Apple's authorization flow can stall (its passcode step on a device
 *  without one, the Family Controls agent not answering): never let the
 *  caller's UI hang on it. The status read afterwards says what happened. */
const AUTHORIZATION_TIMEOUT_MS = 30_000;

export async function requestPhoneFreePermission(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      requestAuthorization('individual'),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, AUTHORIZATION_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    // Denied surfaces as a throw; the status read afterwards reports it.
    console.error('requestPhoneFreePermission ios failed:', e);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function savePhoneFreeSelection(selectionToken: string): Promise<void> {
  await saveIosSelection(selectionToken);
  await startNightMonitor(selectionToken);
}

async function startNightMonitor(selectionToken: string): Promise<void> {
  try {
    stopMonitoring([PHONE_FREE_ACTIVITY]);
  } catch {
    // Not running — fine.
  }
  await startMonitoring(
    PHONE_FREE_ACTIVITY,
    {
      intervalStart: { hour: WINDOW_START_HOUR, minute: 0 },
      intervalEnd: { hour: WINDOW_END_HOUR, minute: 0 },
      repeats: true,
    },
    IOS_THRESHOLD_MINUTES.map((minutes) => ({
      eventName: iosThresholdEventName(minutes),
      familyActivitySelection: selectionToken,
      threshold: { minute: minutes },
      includesPastActivity: false,
    })),
  );
}

export async function getUsageIntervals(
  startMs: number,
  endMs: number,
): Promise<UsageInterval[] | null> {
  try {
    if (!getActivities().includes(PHONE_FREE_ACTIVITY)) return null;
    const events = getEvents(PHONE_FREE_ACTIVITY);
    // Proof the monitor was alive for this night: its interval started
    // inside the range. The extension overwrites each key nightly, so a
    // stale or missing start means this range was never observed.
    const started = events.some(
      (e) =>
        e.callbackName === 'intervalDidStart' &&
        e.lastCalledAt.getTime() >= startMs &&
        e.lastCalledAt.getTime() < endMs,
    );
    if (!started) return null;
    const crossings: ThresholdCrossing[] = [];
    for (const e of events) {
      if (e.callbackName !== 'eventDidReachThreshold' || !e.eventName) continue;
      const at = e.lastCalledAt.getTime();
      if (at >= startMs && at < endMs) crossings.push({ eventName: e.eventName, at });
    }
    return intervalsFromThresholdCrossings(crossings);
  } catch (e) {
    console.error('getUsageIntervals ios failed:', e);
    return null;
  }
}
