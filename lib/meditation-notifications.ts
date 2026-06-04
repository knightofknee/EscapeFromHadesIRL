import * as Notifications from 'expo-notifications';

/**
 * Three buckets the tile-settings pre-prompt cares about:
 *  - `granted`: nothing to do, the alarm will ring.
 *  - `undetermined`: the system sheet has never been shown — this is the
 *    only state where we should display the in-app pre-prompt explaining
 *    our limited use BEFORE iOS shows its system sheet.
 *  - `denied`: iOS won't re-prompt programmatically; sending the user to
 *    Settings is the only path. We surface nothing here.
 */
export type NotificationPermissionBucket = 'granted' | 'undetermined' | 'denied';

export async function getNotificationPermissionBucket(): Promise<NotificationPermissionBucket> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return 'granted';
    if (current.status === 'undetermined') return 'undetermined';
    // Some iOS provisional / canAskAgain edges fall through to denied for
    // our purposes — we never re-prompt automatically.
    if (current.status === 'denied' && current.canAskAgain) return 'undetermined';
    return 'denied';
  } catch (e) {
    console.error('getNotificationPermissionBucket failed:', e);
    return 'denied';
  }
}

/**
 * Trigger the actual iOS system permission sheet. Call this AFTER the user
 * confirms the in-app pre-prompt, never directly.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const req = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: false,
      },
    });
    return req.status === 'granted';
  } catch (e) {
    console.error('requestNotificationPermission failed:', e);
    return false;
  }
}

/**
 * Convenience helper kept for code paths that don't need a pre-prompt
 * (anywhere already inside an explicit "you opted in" flow). Resolves to
 * the granted state without surfacing any UI of its own.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    if (!current.canAskAgain) return false;
    return await requestNotificationPermission();
  } catch (e) {
    console.error('ensureNotificationPermission failed:', e);
    return false;
  }
}

/**
 * Schedule a one-shot "meditation complete" alarm at `endTime`. Returns the
 * notification id so callers can cancel it on pause/reset. Returns `null` if
 * scheduling fails (e.g. permission denied) — callers should treat that as
 * "alarm won't fire when backgrounded; foreground tick still completes."
 */
export async function scheduleMeditationAlarm(
  endTime: Date,
  habitName: string,
): Promise<string | null> {
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Meditation complete',
        body: `Your ${habitName} session is done.`,
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: endTime,
      },
    });
    return id;
  } catch (e) {
    console.error('scheduleMeditationAlarm failed:', e);
    return null;
  }
}

/** Cancel a previously-scheduled alarm. Safe to call with a stale/null id. */
export async function cancelMeditationAlarm(id: string | null | undefined): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (e) {
    // Already fired or already cancelled — not worth surfacing.
    console.warn('cancelMeditationAlarm: cancel skipped:', e);
  }
}
