import {
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
