import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Bundled alarm sound (see app.json expo-notifications `sounds`). It's a ~12s
 * clip with three chimes 5s apart, so ONE notification gives a repeating "nag"
 * without scheduling multiple notifications that would clutter the lock screen.
 * iOS references the filename directly; Android needs it carried by a channel.
 */
const ALARM_SOUND = 'alarm.wav';
const ANDROID_CHANNEL_ID = 'meditation-alarm';

/**
 * Android only: ensure the high-importance channel that plays the bell exists.
 * Idempotent — safe to call before every schedule. No-op on iOS (the sound is
 * set per-notification there).
 */
async function ensureAlarmChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Meditation timer',
      importance: Notifications.AndroidImportance.MAX,
      sound: ALARM_SOUND,
      vibrationPattern: [0, 400, 200, 400],
      enableVibrate: true,
    });
  } catch (e) {
    console.warn('ensureAlarmChannel failed:', e);
  }
}

/**
 * Three buckets the tile-settings pre-prompt cares about:
 *  - `granted`: nothing to do, the alarm will ring.
 *  - `undetermined`: the system sheet has never been shown — this is the
 *    only state where we should display the in-app pre-prompt explaining
 *    our limited use BEFORE iOS shows its system sheet.
 *  - `denied`: iOS won't re-prompt programmatically; sending the user to
 *    Settings is the only path. We surface nothing here.
 */
type NotificationPermissionBucket = 'granted' | 'undetermined' | 'denied';

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
    await ensureAlarmChannel();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Meditation complete',
        body: `Your ${habitName} session is done.`,
        sound: ALARM_SOUND,
        // Time-Sensitive breaks through Focus / Do Not Disturb (free
        // capability, no Apple approval). It does NOT override the hardware
        // ring/silent switch — only Apple's Critical Alerts can, which a
        // meditation app won't be granted.
        interruptionLevel: 'timeSensitive',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: endTime,
        channelId: ANDROID_CHANNEL_ID,
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
