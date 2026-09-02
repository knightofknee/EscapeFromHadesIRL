import { Linking } from 'react-native';
import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailableAsync,
  queryStatisticsCollectionForQuantity,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

// iOS implementation — Metro resolves this file ONLY in iOS bundles, so the
// Nitro-based HealthKit module (which constructs native bindings at module
// evaluation) never even ships to Android. See lib/steps-health.ts for the
// platform-resolution contract and shared docs.

/** HealthKit identifier for cumulative daily step count. */
const HK_STEPS_ID = 'HKQuantityTypeIdentifierStepCount' as const;

export async function isStepsHealthAvailable(): Promise<boolean> {
  try {
    return await isHealthDataAvailableAsync();
  } catch (e) {
    console.error('isStepsHealthAvailable iOS failed:', e);
    return false;
  }
}

export async function requestStepsPermission(): Promise<boolean> {
  try {
    return await requestAuthorization({ toShare: [], toRead: [HK_STEPS_ID] });
  } catch (e) {
    console.error('requestStepsPermission iOS failed:', e);
    return false;
  }
}

export async function getStepsPermissionRequestStatus(): Promise<'not-asked' | 'asked'> {
  try {
    const status = await getRequestStatusForAuthorization({ toShare: [], toRead: [HK_STEPS_ID] });
    // `unknown` (an error state) maps to 'asked': skipping the explanation
    // just means the caller goes straight to the (then harmless) request.
    return status === AuthorizationRequestStatus.shouldRequest ? 'not-asked' : 'asked';
  } catch (e) {
    console.error('getStepsPermissionRequestStatus iOS failed:', e);
    return 'asked';
  }
}

export async function openStepsHealthSettings(): Promise<void> {
  // Read access lives in the Health app (profile > Apps), not on the app's
  // own Settings page — open Health directly, falling back to our Settings
  // page if the scheme ever stops resolving.
  try {
    await Linking.openURL('x-apple-health://');
  } catch {
    try {
      await Linking.openSettings();
    } catch (e) {
      console.error('openStepsHealthSettings iOS failed:', e);
    }
  }
}

export async function getStepsForDay(dateStr: string): Promise<number | null> {
  // The day is [local midnight, next local midnight). Anchoring a 1-day
  // interval at this day's midnight makes the bucket boundaries line up with
  // the local day.
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const nextDayStart = new Date(y, m - 1, d + 1, 0, 0, 0, 0);

  try {
    // Take the SAME number Apple Health shows for the day — no custom math.
    //
    // This must be a statistics COLLECTION query (HKStatisticsCollectionQuery),
    // not a plain statistics query, for two reasons that both inflate the count
    // otherwise:
    //   1. De-dup: iPhone and Apple Watch write overlapping step samples;
    //      statistics collapse them (raw queryQuantitySamples double-counts).
    //   2. Boundary attribution: a sample that straddles midnight (a watch
    //      "merge"/workout sample, or a walk across 12:00am) must contribute
    //      only its in-day slice. A plain statistics query over a non-strict
    //      day predicate adds the WHOLE straddling sample to the day, so a day
    //      reads high by that sample's out-of-day portion — and stays high on
    //      every re-read. A collection query anchored at local midnight with a
    //      1-day interval apportions the sample by time overlap, exactly the
    //      way the Health app attributes steps to a day.
    const buckets = await queryStatisticsCollectionForQuantity(
      HK_STEPS_ID,
      ['cumulativeSum'],
      dayStart, // anchor — aligns interval boundaries to local midnight
      { day: 1 },
      { filter: { date: { startDate: dayStart, endDate: nextDayStart } } },
    );
    const startMs = dayStart.getTime();
    const endMs = nextDayStart.getTime();
    const bucket = buckets.find((b) => {
      if (b.startDate == null) return false;
      const t = new Date(b.startDate).getTime();
      return t >= startMs && t < endMs;
    });
    return Math.round(bucket?.sumQuantity?.quantity ?? 0);
  } catch (e) {
    console.error('getStepsForDay iOS failed:', e);
    return null;
  }
}
