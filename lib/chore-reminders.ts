import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { parseDate } from '@/lib/date-utils';
import { isTask } from '@/lib/chores';
import type { Chore } from '@/types/chore';

/**
 * Due-date reminders for one-time tasks. Local notifications only (no
 * server): every phone schedules its own from the synced chore list, so a
 * reminder set on one phone also rings on the other once it opens the app.
 * `syncChoreReminders` is the single place that schedules or cancels them;
 * it diffs what should be scheduled against what is.
 */

export const CHORE_REMINDER_KIND = 'chore-reminder';
/** Preset when a reminder is first switched on. */
export const DEFAULT_REMINDER_TIME = '15:00';
const ANDROID_CHANNEL_ID = 'chore-reminders';
let channelEnsured = false;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelEnsured) return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Task reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
    channelEnsured = true;
  } catch (e) {
    console.warn('[chore-reminders] channel failed', e);
  }
}

/** "15:00" → { hours: 15, minutes: 0 }, or null if malformed. */
export function parseReminderTime(time: string | null | undefined): { hours: number; minutes: number } | null {
  const m = time?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export function formatReminderTime(time: string): string {
  const t = parseReminderTime(time);
  if (!t) return time;
  return new Date(2000, 0, 1, t.hours, t.minutes).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function toReminderTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** When this task's reminder should fire, or null if it has none / is done. */
export function reminderAt(chore: Chore): Date | null {
  if (!isTask(chore) || chore.completions.length > 0 || !chore.dueDate) return null;
  const t = parseReminderTime(chore.reminderTime);
  if (!t) return null;
  const at = parseDate(chore.dueDate);
  at.setHours(t.hours, t.minutes, 0, 0);
  return at;
}

const identifier = (choreId: string) => `${CHORE_REMINDER_KIND}-${choreId}`;

/**
 * Make the scheduled reminders match `chores`: schedule missing or changed
 * ones, cancel ones for tasks that are done, deleted, or no longer have a
 * reminder. Never prompts for permission (the editor does that when the
 * user switches a reminder on); without permission it does nothing.
 */
export async function syncChoreReminders(chores: Chore[], now = Date.now()): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter((n) => n.content.data?.kind === CHORE_REMINDER_KIND);
    const wanted = new Map<string, { chore: Chore; at: number }>();
    if (perm.status === 'granted') {
      for (const chore of chores) {
        const at = reminderAt(chore);
        if (at && at.getTime() > now) wanted.set(identifier(chore.id), { chore, at: at.getTime() });
      }
    }
    for (const n of ours) {
      const want = wanted.get(n.identifier);
      if (want && n.content.data?.at === want.at && n.content.body === want.chore.name) {
        wanted.delete(n.identifier); // already scheduled as wanted
      } else {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
    if (wanted.size === 0) return;
    await ensureChannel();
    for (const [id, { chore, at }] of wanted) {
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: 'Task due today',
          body: chore.name,
          sound: 'default',
          data: { kind: CHORE_REMINDER_KIND, choreId: chore.id, at },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(at),
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
        },
      });
    }
  } catch (e) {
    console.warn('[chore-reminders] sync failed', e);
  }
}
