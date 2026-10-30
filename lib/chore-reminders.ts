import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { formatDate, parseDate } from '@/lib/date-utils';
import { DEFAULT_REMINDER_TIME, reminderSlots, reminderTitle } from '@/functions/src/chore-schedule';
import type { Chore } from '@/types/chore';

/**
 * Reminders for PERSONAL chores and tasks: local notifications, scheduled
 * by each phone from the synced list, so a reminder set on one phone also
 * rings on the other once it opens the app. A SHARED chore's reminders are
 * sent by the server instead (functions/src), because only it knows at send
 * time whether a friend already did it. `syncChoreReminders` is the single
 * place that schedules or cancels local ones; it diffs what should be
 * scheduled against what is.
 */

export const CHORE_REMINDER_KIND = 'chore-reminder';
export { DEFAULT_REMINDER_TIME };
const ANDROID_CHANNEL_ID = 'chore-reminders';
let channelEnsured = false;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelEnsured) return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Chore reminders',
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

/** A chore other people can see and mark. */
export function isSharedChore(chore: Pick<Chore, 'userId' | 'memberIds'>): boolean {
  return (chore.memberIds ?? []).some((uid) => uid !== chore.userId);
}

/** Everyone on a shared chore except `uid`, by name: "Sam, Alex". */
export function sharedNames(
  chore: Pick<Chore, 'userId' | 'memberIds'>,
  uid: string,
  nameOf: (uid: string) => string,
): string {
  return Array.from(new Set([chore.userId, ...(chore.memberIds ?? [])]))
    .filter((m) => m !== uid)
    .map(nameOf)
    .join(', ');
}

/** The local instants this person's reminders ring for a chore's current due date. */
export function localReminders(chore: Chore, uid: string): { index: number; daysBefore: number; at: number }[] {
  const createdDate = formatDate(new Date(chore.createdAt || Date.now()));
  return reminderSlots(chore, uid, createdDate).flatMap((slot) => {
    const t = parseReminderTime(slot.time);
    if (!t) return [];
    const at = parseDate(slot.date);
    at.setHours(t.hours, t.minutes, 0, 0);
    return [{ index: slot.index, daysBefore: slot.daysBefore, at: at.getTime() }];
  });
}

const identifier = (choreId: string, index: number) => `${CHORE_REMINDER_KIND}-${choreId}-${index}`;

/**
 * Make the scheduled local reminders match `chores` for this user: schedule
 * missing or changed ones, cancel ones for chores that are done, deleted,
 * shared (the server takes over), or no longer have a reminder. Never
 * prompts for permission (the editor does that when the user turns a
 * reminder on); without permission it does nothing.
 */
export async function syncChoreReminders(chores: Chore[], uid: string, now = Date.now()): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter((n) => n.content.data?.kind === CHORE_REMINDER_KIND);
    const wanted = new Map<string, { chore: Chore; at: number; title: string }>();
    if (perm.status === 'granted' && uid) {
      for (const chore of chores) {
        if (isSharedChore(chore)) continue;
        for (const r of localReminders(chore, uid)) {
          if (r.at > now) wanted.set(identifier(chore.id, r.index), { chore, at: r.at, title: reminderTitle(r.daysBefore) });
        }
      }
    }
    for (const n of ours) {
      const want = wanted.get(n.identifier);
      if (
        want &&
        n.content.data?.at === want.at &&
        n.content.body === choreBody(want.chore) &&
        n.content.title === want.title
      ) {
        wanted.delete(n.identifier); // already scheduled as wanted
      } else {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
    if (wanted.size === 0) return;
    await ensureChannel();
    for (const [id, { chore, at, title }] of wanted) {
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title,
          body: choreBody(chore),
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

function choreBody(chore: Chore): string {
  return `${chore.emoji ? `${chore.emoji} ` : ''}${chore.name}`;
}
