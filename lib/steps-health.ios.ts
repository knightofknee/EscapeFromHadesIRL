import {
  isHealthDataAvailableAsync,
  queryStatisticsForQuantity,
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
  // Local-midnight day bounds (duplicated in the .android file — a shared
  // helper can't live in steps-health.ts, which platform resolution shadows).
  const [y, m, d] = dateStr.split('-').map(Number);
  const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
  const endDate = new Date(y, m - 1, d, 23, 59, 59, 999);

  try {
    // Must be a statistics query: iPhone and Apple Watch write overlapping
    // step samples, and HealthKit de-duplicates them only in statistics.
    // Summing raw queryQuantitySamples double-counts watch wearers.
    const stats = await queryStatisticsForQuantity(HK_STEPS_ID, ['cumulativeSum'], {
      filter: { date: { startDate, endDate } },
    });
    return Math.round(stats.sumQuantity?.quantity ?? 0);
  } catch (e) {
    console.error('getStepsForDay iOS failed:', e);
    return null;
  }
}
