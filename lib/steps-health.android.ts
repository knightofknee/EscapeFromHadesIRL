import {
  aggregateRecord,
  getSdkStatus,
  initialize,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

// Android implementation — Metro resolves this file ONLY in Android bundles;
// iOS never ships Health Connect. See lib/steps-health.ts for the
// platform-resolution contract and shared docs.

export async function isStepsHealthAvailable(): Promise<boolean> {
  try {
    const status = await getSdkStatus();
    return status === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch (e) {
    console.error('isStepsHealthAvailable Android failed:', e);
    return false;
  }
}

export async function requestStepsPermission(): Promise<boolean> {
  try {
    const ok = await initialize();
    if (!ok) return false;
    const granted = await requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
    return granted.some(
      (p) => 'recordType' in p && p.recordType === 'Steps' && p.accessType === 'read',
    );
  } catch (e) {
    console.error('requestStepsPermission Android failed:', e);
    return false;
  }
}

export async function getStepsForDay(dateStr: string): Promise<number | null> {
  // Local-midnight day bounds (duplicated in the .ios file — a shared helper
  // can't live in steps-health.ts, which platform resolution shadows).
  const [y, m, d] = dateStr.split('-').map(Number);
  const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
  const endDate = new Date(y, m - 1, d, 23, 59, 59, 999);

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
