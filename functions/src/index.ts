import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import {
  localDateOf,
  reminderSlots,
  reminderTitle,
  safeTimeZone,
  zonedTimeToUtc,
  type ScheduleChore,
} from './chore-schedule';

initializeApp();
const db = getFirestore();

/**
 * Server side of shared chores. Personal chores ring locally on the phone;
 * a SHARED chore's reminders come from here, because only the server knows
 * at send time whether a friend already did it. Also sends the "Sam did it"
 * and "Sam shared a chore" pushes. Pushes go through Expo's push service to
 * the tokens the app stores in pushTokens/{uid}.
 */

const CHORES = 'chores';
const PUSH_TOKENS = 'pushTokens';
const PROFILES = 'userProfiles';
const REMINDER_LOG = 'choreReminderLog';
/** A reminder this late (function outage, slow run) is still worth sending; older ones are dropped. */
const GRACE_MS = 6 * 60 * 60 * 1000;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type Chore = ScheduleChore & {
  name: string;
  emoji?: string;
  memberIds?: string[];
  lastDoneBy?: string;
  nextReminderAt?: number | null;
};

type PushTarget = { tokens: string[]; timeZone: string };
type PushMessage = { title: string; body: string; data: Record<string, string> };

function membersOf(chore: Chore): string[] {
  return Array.from(new Set([chore.userId, ...(chore.memberIds ?? [])]));
}

function isShared(chore: Chore): boolean {
  return membersOf(chore).length > 1;
}

async function targetsFor(uids: string[]): Promise<Map<string, PushTarget>> {
  const out = new Map<string, PushTarget>();
  if (uids.length === 0) return out;
  const snaps = await db.getAll(...uids.map((uid) => db.collection(PUSH_TOKENS).doc(uid)));
  for (const snap of snaps) {
    const data = snap.data();
    out.set(snap.id, {
      tokens: Array.isArray(data?.tokens) ? data!.tokens.filter((t: unknown) => typeof t === 'string') : [],
      timeZone: safeTimeZone(data?.timeZone),
    });
  }
  return out;
}

async function displayName(uid: string | undefined): Promise<string> {
  if (!uid) return 'A friend';
  const snap = await db.collection(PROFILES).doc(uid).get();
  const name = snap.data()?.displayName;
  return typeof name === 'string' && name.trim() ? name.trim() : 'A friend';
}

/** Send one message to every token of each uid; prune tokens Expo says are dead. */
async function push(uids: string[], message: PushMessage, targets?: Map<string, PushTarget>): Promise<void> {
  const resolved = targets ?? (await targetsFor(uids));
  const sends: { uid: string; token: string }[] = [];
  for (const uid of uids) for (const token of resolved.get(uid)?.tokens ?? []) sends.push({ uid, token });
  for (let i = 0; i < sends.length; i += 100) {
    const chunk = sends.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(
          chunk.map(({ token }) => ({ to: token, sound: 'default', ...message })),
        ),
      });
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      const tickets = json.data ?? [];
      await Promise.all(
        tickets.map((ticket, j) =>
          ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered'
            ? db
                .collection(PUSH_TOKENS)
                .doc(chunk[j].uid)
                .set({ tokens: FieldValue.arrayRemove(chunk[j].token) }, { merge: true })
            : null,
        ),
      );
    } catch (e) {
      logger.error('push send failed', e);
    }
  }
}

function choreLabel(chore: Chore): string {
  return `${chore.emoji ? `${chore.emoji} ` : ''}${chore.name}`;
}

/** Every member's reminder instants for the chore's current due date. */
function reminderInstants(chore: Chore, targets: Map<string, PushTarget>) {
  const out: { uid: string; at: number; key: string; daysBefore: number }[] = [];
  for (const uid of membersOf(chore)) {
    const tz = targets.get(uid)?.timeZone ?? 'UTC';
    const createdDate = localDateOf(chore.createdAt ?? Date.now(), tz);
    for (const slot of reminderSlots(chore, uid, createdDate)) {
      out.push({
        uid,
        at: zonedTimeToUtc(slot.date, slot.time, tz),
        key: `${uid}_${slot.due}_${slot.index}`,
        daysBefore: slot.daysBefore,
      });
    }
  }
  return out;
}

function nextAfter(instants: { at: number }[], now: number): number | null {
  const future = instants.filter((i) => i.at > now).map((i) => i.at);
  return future.length ? Math.min(...future) : null;
}

export const onChoreWritten = onDocumentWritten(`${CHORES}/{choreId}`, async (event) => {
  const before = event.data?.before.data() as Chore | undefined;
  const after = event.data?.after.data() as Chore | undefined;
  const choreId = event.params.choreId;
  if (!after) return;
  const ref = db.collection(CHORES).doc(choreId);

  if (!isShared(after)) {
    if (after.nextReminderAt != null) await ref.update({ nextReminderAt: null });
    return;
  }

  const members = membersOf(after);
  const data = { kind: 'chore', choreId };

  // Newly shared with someone: tell them.
  const prevMembers = new Set(before ? membersOf(before) : [after.userId]);
  const added = members.filter((uid) => !prevMembers.has(uid));
  if (added.length > 0) {
    const owner = await displayName(after.userId);
    await push(added, { title: `${owner} shared a chore`, body: choreLabel(after), data });
  }

  // Someone logged it: tell everyone else.
  const logged =
    !!before &&
    (after.completions?.length ?? 0) > (before.completions?.length ?? 0) &&
    after.completions[0] !== before.completions?.[0];
  if (logged && after.lastDoneBy) {
    const doer = await displayName(after.lastDoneBy);
    const others = members.filter((uid) => uid !== after.lastDoneBy);
    await push(others, { title: `${doer} did it`, body: choreLabel(after), data });
  }

  // Keep the reminder sweep's pointer current. Writing the same value back
  // fires this trigger again, which then sees no change and stops.
  const targets = await targetsFor(members);
  const next = nextAfter(reminderInstants(after, targets), Date.now());
  if ((after.nextReminderAt ?? null) !== next) await ref.update({ nextReminderAt: next });
});

export const sendChoreReminders = onSchedule('every 5 minutes', async () => {
  const now = Date.now();
  const due = await db.collection(CHORES).where('nextReminderAt', '<=', now).get();
  for (const snap of due.docs) {
    const chore = snap.data() as Chore & DocumentData;
    if (!isShared(chore)) {
      await snap.ref.update({ nextReminderAt: null });
      continue;
    }
    const targets = await targetsFor(membersOf(chore));
    const instants = reminderInstants(chore, targets);
    for (const r of instants) {
      if (r.at > now || r.at <= now - GRACE_MS) continue;
      // The log doc is the once-only guard: create() fails if it was sent.
      try {
        await db.collection(REMINDER_LOG).doc(`${snap.id}_${r.key}`).create({ sentAt: now, choreId: snap.id });
      } catch {
        continue;
      }
      await push(
        [r.uid],
        { title: reminderTitle(r.daysBefore), body: choreLabel(chore), data: { kind: 'chore', choreId: snap.id } },
        targets,
      );
    }
    await snap.ref.update({ nextReminderAt: nextAfter(instants, now) });
  }
});
