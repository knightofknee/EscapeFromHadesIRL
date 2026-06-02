import { Platform } from 'react-native';
// `@kingstinct/react-native-healthkit` is iOS-only at the native layer but
// the package ships JS that no-ops on Android, so this import is safe on
// both platforms — every function below gates on Platform.OS === 'ios'
// before touching it for clarity.
//
// IMPORTANT: this requires the package to be installed and a fresh native
// build. After pulling these changes run:
//   npm install
//   npx expo prebuild --clean
//   npx expo run:ios
import {
  isHealthDataAvailableAsync,
  queryQuantitySamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

/** HKQuantityTypeIdentifierStepCount, the daily step count metric. */
const STEPS_ID = 'HKQuantityTypeIdentifierStepCount' as const;

/** Whether HealthKit is available on this device (every modern iPhone). */
export async function isStepsHealthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await isHealthDataAvailableAsync();
  } catch (e) {
    console.error('isStepsHealthAvailable failed:', e);
    return false;
  }
}

/**
 * Prompt the user for read access to step count. `requestAuthorization`
 * resolves to `true` once the system sheet has been presented and the user
 * has tapped through; iOS doesn't tell us whether they actually granted
 * (privacy by design). Callers should treat success as "we can try a read"
 * and surface a friendly empty state if the read returns 0.
 */
export async function requestStepsPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await requestAuthorization({ toShare: [], toRead: [STEPS_ID] });
  } catch (e) {
    console.error('requestStepsPermission failed:', e);
    return false;
  }
}

/**
 * Sum step samples across the given local day. Returns `null` if HealthKit
 * isn't available (Android, simulator, etc.) and 0 if there genuinely are
 * no samples for the day.
 */
export async function getStepsForDay(dateStr: string): Promise<number | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    const endDate = new Date(y, m - 1, d, 23, 59, 59, 999);
    const samples = await queryQuantitySamples(STEPS_ID, {
      filter: { date: { startDate, endDate } },
      // v14 made `limit` required in the options type; 0 means "no cap"
      // (return every sample matching the filter).
      limit: 0,
    });
    return Math.round(
      samples.reduce((sum, s) => sum + (s.quantity ?? 0), 0),
    );
  } catch (e) {
    console.error('getStepsForDay failed:', e);
    return null;
  }
}
