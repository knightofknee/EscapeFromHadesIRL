import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KeyboardDismissBar, KEYBOARD_DISMISS_BAR_HEIGHT } from '@/components/ui/keyboard-dismiss-bar';
import { DateCalendar } from '@/components/chores/date-calendar';
import { Colors } from '@/constants/theme';
import { CHORE_EMOJI_CHOICES } from '@/constants/chore-presets';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTodayDate } from '@/hooks/use-today-date';
import { useChores, type ChoreDraft } from '@/contexts/chores-context';
import { DUE_PRESETS, FREQUENCY_PRESETS, UNSCHEDULED, formatDuePreset, formatFrequency, formatShortDate } from '@/lib/chores';
import { addDays } from '@/lib/date-utils';
import { formatReminderTime, parseReminderTime, toReminderTime } from '@/lib/chore-reminders';
import {
  DEFAULT_REMINDER_TIME,
  MAX_REMINDERS,
  REMINDER_DAYS_BEFORE,
  formatDaysBefore,
  remindersFor,
} from '@/functions/src/chore-schedule';
import { getNotificationPermissionBucket, requestNotificationPermission } from '@/lib/meditation-notifications';
import { registerPushToken } from '@/lib/push-tokens';
import { useAuth } from '@/contexts/auth-context';
import { useFriends } from '@/contexts/friends-context';
import type { ChoreKind, ChoreReminder } from '@/types/chore';

const DEFAULT_EMOJI = '🧹';
/** Ten years, leap days included: the longest interval a preset uses. */
const MAX_DAYS = 3653;

/** A new task is due in a week unless the user picks otherwise. */
const DEFAULT_DUE_DAYS = 7;

const KIND_CHOICES: { kind: ChoreKind; emoji: string; title: string; body: string }[] = [
  {
    kind: 'recurring',
    emoji: '🔁',
    title: 'Recurring',
    body: 'Repeats on a schedule, like washing sheets every week.',
  },
  {
    kind: 'once',
    emoji: '📌',
    title: 'One time',
    body: 'Done once by a due date, like renewing a passport.',
  },
];

/**
 * Create or edit one chore. New ones start by choosing recurring (name,
 * emoji, how often) or one time (name, description, due date).
 */
export default function ChoreEditScreen() {
  // React Compiler memoization breaks the native Switch slide animation.
  'use no memo';
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { chores, createChore, updateChore, deleteChore, setReminders, setSharedWith, leaveChore } = useChores();
  const { user } = useAuth();
  const { friends, nameOf } = useFriends();
  const uid = user?.uid ?? '';
  const { todayStr } = useTodayDate();
  const existing = chores.find((c) => c.id === id);
  const isCreating = !existing;
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  // null = still on the "recurring or one time?" step (new chores only).
  const [kind, setKind] = useState<ChoreKind | null>(existing ? (existing.kind ?? 'recurring') : null);
  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? DEFAULT_EMOJI);
  // 0 (UNSCHEDULED) is a real choice for a recurring chore: "Whenever".
  const [frequency, setFrequency] = useState<number>(existing ? existing.frequencyDays : 7);
  const [customText, setCustomText] = useState(
    existing && existing.frequencyDays <= UNSCHEDULED ? '' : String(existing?.frequencyDays || 7),
  );
  const [description, setDescription] = useState(existing?.description ?? '');
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? addDays(todayStr, DEFAULT_DUE_DAYS));
  const [saving, setSaving] = useState(false);
  // My reminders (each person sets their own on a shared chore): off by
  // default; switching on starts with "on the due day at noon".
  const savedReminders = existing && uid ? remindersFor(existing, uid) : [];
  const [reminders, setRemindersDraft] = useState<ChoreReminder[]>(savedReminders);
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);
  // Sharing: the owner picks friends; a member sees who shared it.
  const isOwner = !existing || existing.userId === uid;
  const savedShared = (existing?.memberIds ?? []).filter((m) => m !== existing?.userId);
  const [sharedWith, setSharedWithDraft] = useState<string[]>(savedShared);

  const isTask = kind === 'once';
  const unscheduled = frequency <= UNSCHEDULED;
  const isPreset = unscheduled || (FREQUENCY_PRESETS as readonly number[]).includes(frequency);
  const remindersDirty = JSON.stringify(reminders) !== JSON.stringify(savedReminders);
  const sharingDirty = [...sharedWith].sort().join() !== [...savedShared].sort().join();
  const dirty =
    isCreating ||
    remindersDirty ||
    sharingDirty ||
    name.trim() !== existing.name ||
    (isTask
      ? description.trim() !== (existing.description ?? '') || dueDate !== existing.dueDate
      : emoji !== existing.emoji || frequency !== existing.frequencyDays);
  // Reminders need a due date: tasks always, recurring unless "Whenever".
  const canRemind = isTask || !unscheduled;
  // A recurring chore only offers "days before" shorter than its cycle.
  const daysBeforeChoices = REMINDER_DAYS_BEFORE.filter((d) => isTask || d < frequency);
  const canSave = kind !== null && name.trim().length > 0 && dirty && !saving;
  const title = kind === null ? 'New' : `${isCreating ? 'New' : 'Edit'} ${isTask ? 'Task' : 'Chore'}`;

  function pickFrequency(days: number) {
    setFrequency(days);
    setCustomText(days <= UNSCHEDULED ? '' : String(days));
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const draft: ChoreDraft = isTask
      ? {
          kind: 'once',
          name: name.trim(),
          emoji: '',
          frequencyDays: 0,
          description: description.trim(),
          dueDate,
        }
      : { kind: 'recurring', name: name.trim(), emoji: emoji.trim() || DEFAULT_EMOJI, frequencyDays: frequency };
    // Drop reminders the chore can't have (a "Whenever" chore, or a "days
    // before" longer than the new cycle).
    const keptReminders = canRemind ? reminders.filter((r) => daysBeforeChoices.includes(r.daysBefore as never)) : [];
    let ok: boolean;
    if (isCreating) {
      ok = !!(await createChore({
        ...draft,
        reminders: keptReminders.length ? { [uid]: keptReminders } : undefined,
        memberIds: sharedWith.length ? [uid, ...sharedWith] : undefined,
      }));
    } else {
      ok = await updateChore(existing.id, draft);
      if (ok && (remindersDirty || JSON.stringify(keptReminders) !== JSON.stringify(savedReminders))) {
        ok = await setReminders(existing.id, keptReminders);
      }
      if (ok && isOwner && sharingDirty) ok = await setSharedWith(existing.id, sharedWith);
    }
    setSaving(false);
    if (ok) router.back();
  }

  function toggleFriend(friendUid: string) {
    setSharedWithDraft((cur) => (cur.includes(friendUid) ? cur.filter((f) => f !== friendUid) : [...cur, friendUid]));
  }

  function confirmLeave() {
    if (!existing) return;
    Alert.alert('Leave this chore?', `"${existing.name}" goes off your list. ${nameOf(existing.userId)} keeps it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          if (await leaveChore(existing.id)) router.back();
        },
      },
    ]);
  }

  async function toggleReminders(on: boolean) {
    if (!on) {
      setRemindersDraft([]);
      setNotificationsBlocked(false);
      return;
    }
    setRemindersDraft([{ daysBefore: 0, time: DEFAULT_REMINDER_TIME }]);
    let bucket = await getNotificationPermissionBucket();
    if (bucket === 'undetermined') bucket = (await requestNotificationPermission()) ? 'granted' : 'denied';
    setNotificationsBlocked(bucket !== 'granted');
    // Shared chores ring from the server: make sure it can reach this phone.
    if (bucket === 'granted' && uid) void registerPushToken(uid);
  }

  function updateReminder(index: number, change: Partial<ChoreReminder>) {
    setRemindersDraft((cur) => cur.map((r, i) => (i === index ? { ...r, ...change } : r)));
  }

  function addSecondReminder() {
    setRemindersDraft((cur) =>
      cur.length >= MAX_REMINDERS
        ? cur
        : [...cur, { daysBefore: cur[0]?.daysBefore === 0 ? (daysBeforeChoices[1] ?? 0) : 0, time: DEFAULT_REMINDER_TIME }],
    );
  }

  function handleDelete() {
    if (!existing) return;
    Alert.alert(isTask ? 'Delete task?' : 'Delete chore?', `"${existing.name}" and its history will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (await deleteChore(existing.id)) router.back();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.navHeader}>
          {isCreating && kind !== null ? (
            <Pressable onPress={() => setKind(null)} hitSlop={8}>
              <ThemedText style={[styles.cancelText, { color: colors.tint }]}>Back</ThemedText>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <ThemedText style={[styles.cancelText, { color: colors.tint }]}>Cancel</ThemedText>
            </Pressable>
          )}
          <View style={styles.navTitleWrap} pointerEvents="none">
            <ThemedText style={styles.navTitle}>{title}</ThemedText>
          </View>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            hitSlop={8}
            style={kind === null && styles.hidden}
          >
            <ThemedText
              style={[styles.saveText, { color: canSave ? colors.tint : colors.icon }, !canSave && { opacity: 0.5 }]}
            >
              Save
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
      {kind === null ? (
        <View style={styles.content}>
          <ThemedText type="defaultSemiBold" style={styles.label}>
            What kind?
          </ThemedText>
          {KIND_CHOICES.map((choice) => (
            <Pressable
              key={choice.kind}
              onPress={() => setKind(choice.kind)}
              style={[styles.kindCard, { borderColor: colors.tileBorder, backgroundColor: colors.tileBackground }]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.kindEmoji}>{choice.emoji}</ThemedText>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.kindTitle}>{choice.title}</ThemedText>
                <ThemedText style={styles.kindBody}>{choice.body}</ThemedText>
              </View>
              <ThemedText style={[styles.kindChevron, { color: colors.icon }]}>›</ThemedText>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push('/chore-friends')}
            style={[styles.kindCard, styles.friendsCard, { borderColor: colors.tileBorder }]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.kindEmoji}>👥</ThemedText>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.kindTitle}>Chore friends</ThemedText>
              <ThemedText style={styles.kindBody}>
                {friends.length > 0
                  ? `${friends.length} friend${friends.length === 1 ? '' : 's'}. Share chores so either of you can mark them.`
                  : 'Add someone to share chores with. Either of you can mark them.'}
              </ThemedText>
            </View>
            <ThemedText style={[styles.kindChevron, { color: colors.icon }]}>›</ThemedText>
          </Pressable>
        </View>
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bottomOffset={KEYBOARD_DISMISS_BAR_HEIGHT + 16}
          extraKeyboardSpace={KEYBOARD_DISMISS_BAR_HEIGHT}
        >
          <ThemedText type="defaultSemiBold" style={styles.label}>
            Name
          </ThemedText>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.tileBorder }]}
            value={name}
            onChangeText={setName}
            placeholder={isTask ? 'Renew passport' : 'Wash sheets'}
            placeholderTextColor={colors.icon}
            autoFocus={isCreating}
            maxLength={isTask ? 80 : 40}
            returnKeyType="done"
          />

          {isTask ? (
            <>
              <ThemedText type="defaultSemiBold" style={styles.label}>
                Description
              </ThemedText>
              <TextInput
                style={[styles.input, styles.multiline, { color: colors.text, borderColor: colors.tileBorder }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Optional"
                placeholderTextColor={colors.icon}
                multiline
                maxLength={500}
              />

              <ThemedText type="defaultSemiBold" style={styles.label}>
                Due {formatShortDate(dueDate, todayStr)}
              </ThemedText>
              <View style={styles.freqGrid}>
                {DUE_PRESETS.map((days) => {
                  const date = addDays(todayStr, days);
                  const active = dueDate === date;
                  return (
                    <Pressable
                      key={days}
                      onPress={() => setDueDate(date)}
                      style={[
                        styles.freqChip,
                        {
                          borderColor: active ? colors.tint : colors.tileBorder,
                          backgroundColor: active ? `${colors.tint}20` : 'transparent',
                        },
                      ]}
                    >
                      <ThemedText style={styles.freqText}>{formatDuePreset(days)}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              <DateCalendar value={dueDate} today={todayStr} onChange={setDueDate} />

            </>
          ) : (
            <>
              <ThemedText type="defaultSemiBold" style={styles.label}>
                Icon
              </ThemedText>
              <View style={styles.emojiRow}>
                <TextInput
                  style={[styles.emojiInput, { color: colors.text, borderColor: colors.tint }]}
                  value={emoji}
                  onChangeText={(t) => {
                    // Typing after the current emoji replaces it rather than
                    // appending (an emoji can span several code units, so compare
                    // as a prefix instead of counting characters).
                    const typed = t.startsWith(emoji) && t.length > emoji.length ? t.slice(emoji.length) : t;
                    setEmoji(typed.trim());
                  }}
                  maxLength={8}
                />
                <ThemedText style={styles.hint}>Type any emoji, or pick one:</ThemedText>
              </View>
              <View style={styles.emojiGrid}>
                {CHORE_EMOJI_CHOICES.map((e) => (
                  <Pressable
                    key={e}
                    onPress={() => setEmoji(e)}
                    style={[
                      styles.emojiChoice,
                      { borderColor: emoji === e ? colors.tint : 'transparent' },
                    ]}
                  >
                    <ThemedText style={styles.emojiChoiceText}>{e}</ThemedText>
                  </Pressable>
                ))}
              </View>

              <ThemedText type="defaultSemiBold" style={styles.label}>
                How often
              </ThemedText>
              <View style={styles.freqGrid}>
                {[...FREQUENCY_PRESETS, UNSCHEDULED].map((days) => {
                  const active = frequency === days;
                  return (
                    <Pressable
                      key={days}
                      onPress={() => pickFrequency(days)}
                      style={[
                        styles.freqChip,
                        {
                          borderColor: active ? colors.tint : colors.tileBorder,
                          backgroundColor: active ? `${colors.tint}20` : 'transparent',
                        },
                      ]}
                    >
                      <ThemedText style={styles.freqText}>{formatFrequency(days)}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.customRow}>
                <ThemedText style={styles.customLabel}>Every</ThemedText>
                <TextInput
                  style={[
                    styles.customInput,
                    { color: colors.text, borderColor: !isPreset ? colors.tint : colors.tileBorder },
                  ]}
                  value={customText}
                  placeholder="–"
                  placeholderTextColor={colors.icon}
                  onChangeText={(t) => {
                    const digits = t.replace(/[^0-9]/g, '');
                    setCustomText(digits);
                    const n = parseInt(digits, 10);
                    if (!isNaN(n) && n >= 1) setFrequency(Math.min(MAX_DAYS, n));
                  }}
                  keyboardType="number-pad"
                  maxLength={4}
                />
                <ThemedText style={styles.customLabel}>{frequency === 1 ? 'day' : 'days'}</ThemedText>
              </View>
              <ThemedText style={styles.hint}>
                {unscheduled
                  ? 'Never due. Stays green and shows how long it\'s been since you last did it.'
                  : 'Green while it\'s fresh, blue in the last stretch before it\'s due, gold once it\'s due.'}
              </ThemedText>
            </>
          )}

          {canRemind && (
            <>
              <View style={[styles.reminderCard, { borderColor: colors.tileBorder, backgroundColor: colors.tileBackground }]}>
                <View style={styles.reminderRow}>
                  <ThemedText style={styles.reminderLabel}>Remind me</ThemedText>
                  <Switch
                    value={reminders.length > 0}
                    onValueChange={(v) => void toggleReminders(v)}
                    trackColor={{ false: scheme === 'dark' ? '#5A5E66' : '#D8DBE0', true: colors.tint }}
                    ios_backgroundColor={scheme === 'dark' ? '#5A5E66' : '#D8DBE0'}
                    thumbColor="#fff"
                  />
                </View>
                {reminders.map((r, i) => (
                  <View key={i} style={[styles.reminderBlock, { borderTopColor: colors.tileBorder }]}>
                    <View style={styles.freqGrid}>
                      {daysBeforeChoices.map((d) => {
                        const active = r.daysBefore === d;
                        return (
                          <Pressable
                            key={d}
                            onPress={() => updateReminder(i, { daysBefore: d })}
                            style={[
                              styles.freqChip,
                              {
                                borderColor: active ? colors.tint : colors.tileBorder,
                                backgroundColor: active ? `${colors.tint}20` : 'transparent',
                              },
                            ]}
                          >
                            <ThemedText style={styles.freqText}>{formatDaysBefore(d)}</ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={styles.reminderTimeLine}>
                      <ThemedText style={styles.reminderLabel}>at</ThemedText>
                      <ReminderTimePicker
                        time={r.time}
                        onChange={(time) => updateReminder(i, { time })}
                        scheme={scheme}
                        tint={colors.tint}
                        border={colors.tileBorder}
                      />
                      <View style={{ flex: 1 }} />
                      {i > 0 && (
                        <Pressable
                          onPress={() => setRemindersDraft((cur) => cur.filter((_, j) => j !== i))}
                          hitSlop={8}
                          accessibilityRole="button"
                        >
                          <ThemedText style={[styles.removeText, { color: colors.icon }]}>Remove</ThemedText>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
                {reminders.length > 0 && reminders.length < MAX_REMINDERS && (
                  <Pressable
                    onPress={addSecondReminder}
                    style={[styles.reminderRow, styles.reminderTimeRow, { borderTopColor: colors.tileBorder }]}
                    accessibilityRole="button"
                  >
                    <ThemedText style={[styles.reminderLabel, { color: colors.tint }]}>+ Second reminder</ThemedText>
                  </Pressable>
                )}
              </View>
              {reminders.length > 0 && notificationsBlocked && (
                <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button">
                  <ThemedText style={styles.hint}>
                    Notifications are off for this app, so reminders can&apos;t ring.{' '}
                    <ThemedText style={[styles.hint, { color: colors.tint }]}>Turn them on in Settings</ThemedText>
                  </ThemedText>
                </Pressable>
              )}
            </>
          )}

          <ThemedText type="defaultSemiBold" style={styles.label}>
            {isOwner ? 'Shared with' : `Shared by ${nameOf(existing?.userId)}`}
          </ThemedText>
          {isOwner ? (
            <>
              {friends.length > 0 && (
                <View style={styles.freqGrid}>
                  {friends.map((f) => {
                    const active = sharedWith.includes(f.uid);
                    return (
                      <Pressable
                        key={f.uid}
                        onPress={() => toggleFriend(f.uid)}
                        style={[
                          styles.freqChip,
                          {
                            borderColor: active ? colors.tint : colors.tileBorder,
                            backgroundColor: active ? `${colors.tint}20` : 'transparent',
                          },
                        ]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                      >
                        <ThemedText style={styles.freqText}>{`${active ? '✓ ' : ''}${f.name}`}</ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <Pressable onPress={() => router.push('/chore-friends')} accessibilityRole="button">
                <ThemedText style={[styles.hint, { color: colors.tint, opacity: 1 }]}>
                  {friends.length > 0 ? '+ Add a chore friend' : 'Nobody yet. + Add a chore friend'}
                </ThemedText>
              </Pressable>
              {sharedWith.length > 0 && (
                <ThemedText style={styles.hint}>Either of you can mark it done. You both see it.</ThemedText>
              )}
            </>
          ) : (
            <ThemedText style={styles.hint}>
              {(existing?.memberIds ?? [])
                .filter((m) => m !== existing?.userId && m !== uid)
                .map((m) => nameOf(m))
                .concat('you')
                .join(', ')}
            </ThemedText>
          )}

          {!isCreating && isOwner && (
            <Pressable style={styles.deleteButton} onPress={handleDelete}>
              <ThemedText style={[styles.deleteText, { color: colors.tint }]}>
                {isTask ? 'Delete task' : 'Delete chore'}
              </ThemedText>
            </Pressable>
          )}
          {!isCreating && !isOwner && (
            <Pressable style={styles.deleteButton} onPress={confirmLeave}>
              <ThemedText style={[styles.deleteText, { color: colors.tint }]}>Leave this chore</ThemedText>
            </Pressable>
          )}
        </KeyboardAwareScrollView>
      )}
      <KeyboardDismissBar />
    </ThemedView>
  );
}

/** A reminder's time: compact native picker on iOS, a button that opens the dialog on Android. */
function ReminderTimePicker({
  time,
  onChange,
  scheme,
  tint,
  border,
}: {
  time: string;
  onChange: (time: string) => void;
  scheme: 'light' | 'dark';
  tint: string;
  border: string;
}) {
  const t = parseReminderTime(time) ?? { hours: 12, minutes: 0 };
  const value = new Date(2000, 0, 1, t.hours, t.minutes);
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode="time"
        display="compact"
        themeVariant={scheme}
        accentColor={tint}
        onChange={(_e, date) => date && onChange(toReminderTime(date))}
      />
    );
  }
  return (
    <Pressable
      onPress={() =>
        DateTimePickerAndroid.open({
          value,
          mode: 'time',
          onChange: (event, date) => {
            if (event.type === 'set' && date) onChange(toReminderTime(date));
          },
        })
      }
      style={[styles.timeButton, { borderColor: border }]}
      accessibilityRole="button"
      accessibilityLabel={`Reminder time ${formatReminderTime(time)}`}
    >
      <ThemedText style={styles.timeButtonText}>{formatReminderTime(time)}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  navTitleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  navTitle: { fontSize: 17, fontWeight: '600' },
  cancelText: { fontSize: 16, fontWeight: '500' },
  saveText: { fontSize: 16, fontWeight: '600' },
  reminderCard: { borderWidth: 1, borderRadius: 12, marginTop: 16, overflow: 'hidden' },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 52,
  },
  reminderTimeRow: { borderTopWidth: StyleSheet.hairlineWidth },
  reminderBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  reminderTimeLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  removeText: { fontSize: 15, fontWeight: '500' },
  friendsCard: { borderStyle: 'dashed', marginTop: 24 },
  reminderLabel: { fontSize: 16, fontWeight: '500' },
  timeButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  timeButtonText: { fontSize: 16, fontWeight: '600' },
  hidden: { opacity: 0 },
  content: { padding: 16, paddingBottom: 60 },
  label: { marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  multiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: 10 },
  hint: { fontSize: 12, opacity: 0.55, marginTop: 6 },
  kindCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
  },
  kindEmoji: { fontSize: 30, lineHeight: 38 },
  kindTitle: { fontSize: 17, fontWeight: '700' },
  kindBody: { fontSize: 14, opacity: 0.65, marginTop: 2 },
  kindChevron: { fontSize: 26, lineHeight: 30 },
  emojiRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emojiInput: {
    width: 56,
    height: 56,
    borderWidth: 2,
    borderRadius: 14,
    fontSize: 30,
    textAlign: 'center',
  },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 },
  emojiChoice: { width: 44, height: 44, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  emojiChoiceText: { fontSize: 24, lineHeight: 30 },
  freqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  freqText: { fontSize: 14 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  customLabel: { fontSize: 15 },
  customInput: {
    borderWidth: 1,
    borderRadius: 10,
    width: 72,
    paddingVertical: 8,
    fontSize: 16,
    textAlign: 'center',
  },
  deleteButton: { marginTop: 40, alignItems: 'center', paddingVertical: 12 },
  deleteText: { fontSize: 16, fontWeight: '600' },
});
