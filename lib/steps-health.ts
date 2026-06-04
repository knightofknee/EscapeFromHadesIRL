import { Platform } from 'react-native';
// `@kingstinct/react-native-healthkit` is iOS-only at the native layer but
// ships a JS stub that no-ops on Android, so this import is safe on both
// platforms. Every iOS-branched call gates on Platform.OS === 'ios'.
import {
  isHealthDataAvailableAsync,
  queryQuantitySamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
// `react-native-health-connect` is Android-only. Importing on iOS is safe at
// JS-bundle time (it's just function refs); calling any function on iOS
// would throw, so we gate every Android call on Platform.OS === 'android'.
import {
  aggregateRecord,
  getSdkStatus,
  initialize,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

/** HealthKit identifier for cumulative daily step count (iOS). */
const HK_STEPS_ID = 'HKQuantityTypeIdentifierStepCount' as const;

/** Whether step data is available on this device. */
export async function isStepsHealthAvailable(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    try {
      return await isHealthDataAvailableAsync();
    } catch (e) {
      console.error('isStepsHealthAvailable iOS failed:', e);
      return false;
    }
  }
  if (Platform.OS === 'android') {
    try {
      const status = await getSdkStatus();
      return status === SdkAvailabilityStatus.SDK_AVAILABLE;
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
      return await requestAuthorization({ toShare: [], toRead: [HK_STEPS_ID] });
    } catch (e) {
      console.error('requestStepsPermission iOS failed:', e);
      return false;
    }
  }
  if (Platform.OS === 'android') {
    try {
      const ok = await initialize();
      if (!ok) return false;
      const granted = await requestPermission([
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
      const samples = await queryQuantitySamples(HK_STEPS_ID, {
        filter: { date: { startDate, endDate } },
        limit: 0,
      });
      return Math.round(
        samples.reduce((sum, s) => sum + (s.quantity ?? 0), 0),
      );
    } catch (e) {
      console.error('getStepsForDay iOS failed:', e);
      return null;
    }
  }
  if (Platform.OS === 'android') {
    try {
      const result = await aggregateRecord({
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
