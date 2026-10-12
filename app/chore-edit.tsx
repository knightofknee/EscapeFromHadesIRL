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
import { DUE_PRESETS, FREQUENCY_PRESETS, formatDuePreset, formatFrequency, formatShortDate } from '@/lib/chores';
import { addDays } from '@/lib/date-utils';
import {
  DEFAULT_REMINDER_TIME,
  formatReminderTime,
  parseReminderTime,
  toReminderTime,
} from '@/lib/chore-reminders';
import { getNotificationPermissionBucket, requestNotificationPermission } from '@/lib/meditation-notifications';
import type { ChoreKind } from '@/types/chore';

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
  const { chores, createChore, updateChore, deleteChore } = useChores();
  const { todayStr } = useTodayDate();
  const existing = chores.find((c) => c.id === id);
  const isCreating = !existing;
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  // null = still on the "recurring or one time?" step (new chores only).
  const [kind, setKind] = useState<ChoreKind | null>(existing ? (existing.kind ?? 'recurring') : null);
  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? DEFAULT_EMOJI);
  const [frequency, setFrequency] = useState<number>(existing?.frequencyDays || 7);
  const [customText, setCustomText] = useState(String(existing?.frequencyDays || 7));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? addDays(todayStr, DEFAULT_DUE_DAYS));
  const [saving, setSaving] = useState(false);
  // Optional reminder on the due date: off by default, 3pm when switched on.
  const [reminderOn, setReminderOn] = useState(!!parseReminderTime(existing?.reminderTime));
  const [reminderTime, setReminderTime] = useState(
    parseReminderTime(existing?.reminderTime) ? existing!.reminderTime! : DEFAULT_REMINDER_TIME,
  );
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);
  const savedReminder = parseReminderTime(existing?.reminderTime) ? existing!.reminderTime! : null;
  const draftReminder = reminderOn ? reminderTime : null;

  const isTask = kind === 'once';
  const isPreset = (FREQUENCY_PRESETS as readonly number[]).includes(frequency);
  const dirty =
    isCreating ||
    name.trim() !== existing.name ||
    (isTask
      ? description.trim() !== (existing.description ?? '') ||
        dueDate !== existing.dueDate ||
        draftReminder !== savedReminder
      : emoji !== existing.emoji || frequency !== existing.frequencyDays);
  const canSave = kind !== null && name.trim().length > 0 && (isTask || frequency >= 1) && dirty && !saving;
  const title = kind === null ? 'New' : `${isCreating ? 'New' : 'Edit'} ${isTask ? 'Task' : 'Chore'}`;

  function pickFrequency(days: number) {
    setFrequency(days);
    setCustomText(String(days));
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
          reminderTime: draftReminder,
        }
      : { kind: 'recurring', name: name.trim(), emoji: emoji.trim() || DEFAULT_EMOJI, frequencyDays: frequency };
    const ok = isCreating ? !!(await createChore(draft)) : await updateChore(existing.id, draft);
    setSaving(false);
    if (ok) router.back();
  }

  async function toggleReminder(on: boolean) {
    setReminderOn(on);
    if (!on) {
      setNotificationsBlocked(false);
      return;
    }
    let bucket = await getNotificationPermissionBucket();
    if (bucket === 'undetermined') bucket = (await requestNotificationPermission()) ? 'granted' : 'denied';
    setNotificationsBlocked(bucket !== 'granted');
  }

  const reminderDate = (() => {
    const t = parseReminderTime(reminderTime) ?? { hours: 15, minutes: 0 };
    return new Date(2000, 0, 1, t.hours, t.minutes);
  })();

  function openAndroidTimePicker() {
    DateTimePickerAndroid.open({
      value: reminderDate,
      mode: 'time',
      onChange: (event, date) => {
        if (event.type === 'set' && date) setReminderTime(toReminderTime(date));
      },
    });
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

              <View style={[styles.reminderCard, { borderColor: colors.tileBorder, backgroundColor: colors.tileBackground }]}>
                <View style={styles.reminderRow}>
                  <ThemedText style={styles.reminderLabel}>Remind me</ThemedText>
                  <Switch
                    value={reminderOn}
                    onValueChange={(v) => void toggleReminder(v)}
                    trackColor={{ false: scheme === 'dark' ? '#5A5E66' : '#D8DBE0', true: colors.tint }}
                    ios_backgroundColor={scheme === 'dark' ? '#5A5E66' : '#D8DBE0'}
                    thumbColor="#fff"
                  />
                </View>
                {reminderOn && (
                  <View style={[styles.reminderRow, styles.reminderTimeRow, { borderTopColor: colors.tileBorder }]}>
                    <ThemedText style={styles.reminderLabel}>
                      {formatShortDate(dueDate, todayStr)} at
                    </ThemedText>
                    {Platform.OS === 'ios' ? (
                      <DateTimePicker
                        value={reminderDate}
                        mode="time"
                        display="compact"
                        themeVariant={scheme}
                        accentColor={colors.tint}
                        onChange={(_e, date) => date && setReminderTime(toReminderTime(date))}
                      />
                    ) : (
                      <Pressable
                        onPress={openAndroidTimePicker}
                        style={[styles.timeButton, { borderColor: colors.tileBorder }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Reminder time ${formatReminderTime(reminderTime)}`}
                      >
                        <ThemedText style={styles.timeButtonText}>{formatReminderTime(reminderTime)}</ThemedText>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
              {reminderOn && notificationsBlocked && (
                <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button">
                  <ThemedText style={styles.hint}>
                    Notifications are off for this app, so the reminder can&apos;t ring.{' '}
                    <ThemedText style={[styles.hint, { color: colors.tint }]}>Turn them on in Settings</ThemedText>
                  </ThemedText>
                </Pressable>
              )}
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
                {FREQUENCY_PRESETS.map((days) => {
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
                Green while it&apos;s fresh, blue in the last stretch before it&apos;s due, gold once
                it&apos;s due.
              </ThemedText>
            </>
          )}

          {!isCreating && (
            <Pressable style={styles.deleteButton} onPress={handleDelete}>
              <ThemedText style={[styles.deleteText, { color: colors.tint }]}>
                {isTask ? 'Delete task' : 'Delete chore'}
              </ThemedText>
            </Pressable>
          )}
        </KeyboardAwareScrollView>
      )}
      <KeyboardDismissBar />
    </ThemedView>
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
