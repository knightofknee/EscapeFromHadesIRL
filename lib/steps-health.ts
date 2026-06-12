// Platform-split module: Metro resolves steps-health.ios.ts on iOS and
// steps-health.android.ts on Android. Each platform file STATICALLY imports
// only its own health library, so the other platform's native module is
// never bundled at all — the strongest form of the launch-crash guard the
// Nitro-based HealthKit module needs (it constructs native bindings at
// module evaluation). Dynamic import() was tried first and broke under
// Metro's dev-mode lazy bundling ("Requiring unknown module").
//
// THIS file is what TypeScript type-checks against (tsc has no platform
// suffix resolution) and what any non-native platform would load — keep the
// three signatures in lockstep with both platform files.

/** Whether step data is available on this device. */
export async function isStepsHealthAvailable(): Promise<boolean> {
  return false;
}

/**
 * Prompt the user for read access to step count. iOS doesn't tell us whether
 * the user actually granted (privacy); we treat success as "ready to try a
 * read." Android returns the list of granted permissions so we can actually
 * confirm `Steps` was granted.
 */
export async function requestStepsPermission(): Promise<boolean> {
  return false;
}

/**
 * Sum step samples across the given local day. Returns `null` if the health
 * platform isn't available (simulator, denied, etc.) and 0 if there
 * genuinely are no samples for the day.
 */
export async function getStepsForDay(_dateStr: string): Promise<number | null> {
  return null;
}
