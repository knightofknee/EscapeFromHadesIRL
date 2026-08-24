import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Bundled alarm sound (see app.json expo-notifications `sounds`). A ~7.6s
 * singing-bowl phrase: two soft strikes falling a fifth. Deliberately short,
 * because neither platform lets us cut a notification sound off once it
 * starts — so opening the app can't silence it, and the only way to keep it
 * from outstaying its welcome is to not make it long.
 * iOS references the filename directly; Android needs it carried by a channel.
 */
const ALARM_SOUND = 'alarm.wav';

/**
 * Android bakes a channel's sound in at creation and ignores every later
 * change to it — the only way to ship a new sound is a new channel id. Bump
 * this suffix whenever alarm.wav changes, or upgrading users keep hearing the
 * old one forever. `v2` = the gentle bowl that replaced the original alarm
 * clock. Older channels get deleted so Settings doesn't accumulate them.
 */
const ANDROID_CHANNEL_ID = 'meditation-alarm-v2';
const RETIRED_ANDROID_CHANNEL_IDS = ['meditation-alarm'];

// ensureAlarmChannel only needs to succeed once per launch — without this it
// re-ran channel creation (and the retired-channel sweep) on the awaited
// critical path of every Start press.
let channelEnsured = false;

/** Marks our notifications in `content.data` so the foreground handler and the
 *  tray sweep can pick them out. */
export const MEDITATION_ALARM_KIND = 'meditation-alarm';

/**
 * Android only: ensure the high-importance channel that plays the bell exists.
 * Idempotent — safe to call before every schedule. No-op on iOS (the sound is
 * set per-notification there).
 */
async function ensureAlarmChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelEnsured) return;
  try {
    // Retire old channels ONLY when no alarm is scheduled — Android drops a
    // pending notification whose channel is deleted, and a user updating the
    // app mid-run still has their alarm scheduled on the old channel.
    const pending = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    if (pending.length === 0) {
      for (const old of RETIRED_ANDROID_CHANNEL_IDS) {
        await Notifications.deleteNotificationChannelAsync(old).catch(() => {});
      }
    }
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Meditation timer',
      importance: Notifications.AndroidImportance.MAX,
      sound: ALARM_SOUND,
      // Two short taps rather than the old long buzzes — it should match the
      // chime, not fight it.
      vibrationPattern: [0, 180, 240, 180],
      enableVibrate: true,
    });
    channelEnsured = true;
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
  habitId: string,
): Promise<string | null> {
  try {
    await ensureAlarmChannel();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Meditation complete',
        body: `Your ${habitName} session is done.`,
        sound: ALARM_SOUND,
        // Tag so the foreground handler can mute it — the in-app looping bell
        // already covers a foregrounded completion; without this both play.
        // habitId rides along so a tap can be traced back to its timer.
        data: { kind: MEDITATION_ALARM_KIND, habitId },
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

/**
 * Clear delivered meditation alarms out of the notification tray / lock
 * screen. Called when the app comes to the foreground: the user is here now,
 * so the alert has done its job and shouldn't sit there waiting to be swiped.
 *
 * This removes the *entry*, not the sound. Neither iOS nor Android exposes a
 * way to stop a notification sound already playing, which is why alarm.wav is
 * kept short.
 */
export async function dismissDeliveredMeditationAlarms(): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((n) => n.request.content.data?.kind === MEDITATION_ALARM_KIND)
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch (e) {
    console.warn('dismissDeliveredMeditationAlarms failed:', e);
  }
}
