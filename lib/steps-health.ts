import { Platform } from 'react-native';

// Both health modules load LAZILY inside their platform branches.
// `@kingstinct/react-native-healthkit` v14 is Nitro-based and constructs its
// native hybrid objects at module-evaluation time — a static import gets
// bundled and EVALUATED on Android too, where the Nitro object doesn't
// exist, so app launch itself can throw. Dynamic import() defers module
// evaluation to first use on the platform that actually has the native side.
// `react-native-health-connect` gets the mirror treatment on iOS.
type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');
type HealthConnectModule = typeof import('react-native-health-connect');

let healthKitPromise: Promise<HealthKitModule> | null = null;
function healthKit(): Promise<HealthKitModule> {
  healthKitPromise ??= import('@kingstinct/react-native-healthkit');
  return healthKitPromise;
}

let healthConnectPromise: Promise<HealthConnectModule> | null = null;
function healthConnect(): Promise<HealthConnectModule> {
  healthConnectPromise ??= import('react-native-health-connect');
  return healthConnectPromise;
}

/** HealthKit identifier for cumulative daily step count (iOS). */
const HK_STEPS_ID = 'HKQuantityTypeIdentifierStepCount' as const;

/** Whether step data is available on this device. */
export async function isStepsHealthAvailable(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    try {
      const hk = await healthKit();
      return await hk.isHealthDataAvailableAsync();
    } catch (e) {
      console.error('isStepsHealthAvailable iOS failed:', e);
      return false;
    }
  }
  if (Platform.OS === 'android') {
    try {
      const hc = await healthConnect();
      const status = await hc.getSdkStatus();
      return status === hc.SdkAvailabilityStatus.SDK_AVAILABLE;
    } catch (e) {
      console.error('isStepsHealthAvailable Android failed:', e);
      return false;
    }
  }
  return false;
}

/**
 * Prompt the user for read access to step count. iOS doesn't tell us whether
 * the user actually granted (privacy); we treat success as "ready to try a
 * read." Android returns the list of granted permissions so we can actually
 * confirm `Steps` was granted.
 */
export async function requestStepsPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    try {
      const hk = await healthKit();
      return await hk.requestAuthorization({ toShare: [], toRead: [HK_STEPS_ID] });
    } catch (e) {
      console.error('requestStepsPermission iOS failed:', e);
      return false;
    }
  }
  if (Platform.OS === 'android') {
    try {
      const hc = await healthConnect();
      const ok = await hc.initialize();
      if (!ok) return false;
      const granted = await hc.requestPermission([
        { accessType: 'read', recordType: 'Steps' },
      ]);
      return granted.some(
        (p) => 'recordType' in p && p.recordType === 'Steps' && p.accessType === 'read',
      );
    } catch (e) {
      console.error('requestStepsPermission Android failed:', e);
      return false;
    }
  }
  return false;
}

/**
 * Sum step samples across the given local day. Returns `null` if the health
 * platform isn't available (simulator, denied, etc.) and 0 if there
 * genuinely are no samples for the day.
 */
export async function getStepsForDay(dateStr: string): Promise<number | null> {
  const [y, m, d] = dateStr.split('-').map(Number);
  const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
  const endDate = new Date(y, m - 1, d, 23, 59, 59, 999);

  if (Platform.OS === 'ios') {
    try {
      const hk = await healthKit();
      // Must be a statistics query: iPhone and Apple Watch write overlapping
      // step samples, and HealthKit de-duplicates them only in statistics.
      // Summing raw queryQuantitySamples double-counts watch wearers.
      const stats = await hk.queryStatisticsForQuantity(HK_STEPS_ID, ['cumulativeSum'], {
        filter: { date: { startDate, endDate } },
      });
      return Math.round(stats.sumQuantity?.quantity ?? 0);
    } catch (e) {
      console.error('getStepsForDay iOS failed:', e);
      return null;
    }
  }
  if (Platform.OS === 'android') {
    try {
      const hc = await healthConnect();
      const result = await hc.aggregateRecord({
        recordType: 'Steps',
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
      });
      return result.COUNT_TOTAL;
    } catch (e) {
      console.error('getStepsForDay Android failed:', e);
      return null;
    }
  }
  return null;
}
