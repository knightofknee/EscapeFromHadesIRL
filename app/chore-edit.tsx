import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { CHORE_EMOJI_CHOICES } from '@/constants/chore-presets';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useChores } from '@/contexts/chores-context';
import { FREQUENCY_PRESETS, formatFrequency } from '@/lib/chores';

const DEFAULT_EMOJI = '🧹';
/** Ten years, leap days included: the longest interval a preset uses. */
const MAX_DAYS = 3653;

/** Create or edit one chore: name, emoji, how often. */
export default function ChoreEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { chores, createChore, updateChore, deleteChore } = useChores();
  const existing = chores.find((c) => c.id === id);
  const isCreating = !existing;
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? DEFAULT_EMOJI);
  const [frequency, setFrequency] = useState<number>(existing?.frequencyDays ?? 7);
  const [customText, setCustomText] = useState(String(existing?.frequencyDays ?? 7));
  const [saving, setSaving] = useState(false);

  const isPreset = (FREQUENCY_PRESETS as readonly number[]).includes(frequency);
  const dirty =
    isCreating ||
    name.trim() !== existing.name ||
    emoji !== existing.emoji ||
    frequency !== existing.frequencyDays;
  const canSave = name.trim().length > 0 && frequency >= 1 && dirty && !saving;

  function pickFrequency(days: number) {
    setFrequency(days);
    setCustomText(String(days));
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const draft = { name: name.trim(), emoji: emoji.trim() || DEFAULT_EMOJI, frequencyDays: frequency };
    const ok = isCreating ? !!(await createChore(draft)) : await updateChore(existing.id, draft);
    setSaving(false);
    if (ok) router.back();
  }

  function handleDelete() {
    if (!existing) return;
    Alert.alert('Delete chore?', `"${existing.name}" and its history will be removed.`, [
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
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText style={[styles.cancelText, { color: colors.tint }]}>Cancel</ThemedText>
          </Pressable>
          <View style={styles.navTitleWrap} pointerEvents="none">
            <ThemedText style={styles.navTitle}>{isCreating ? 'New Chore' : 'Edit Chore'}</ThemedText>
          </View>
          <Pressable onPress={handleSave} disabled={!canSave} hitSlop={8}>
            <ThemedText
              style={[styles.saveText, { color: canSave ? colors.tint : colors.icon }, !canSave && { opacity: 0.5 }]}
            >
              Save
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Name
        </ThemedText>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.tileBorder }]}
          value={name}
          onChangeText={setName}
          placeholder="Wash sheets"
          placeholderTextColor={colors.icon}
          autoFocus={isCreating}
          maxLength={40}
          returnKeyType="done"
        />

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
          Green while it&apos;s fresh, yellow in the last stretch before it&apos;s due, red once
          it&apos;s late.
        </ThemedText>

        {!isCreating && (
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <ThemedText style={[styles.deleteText, { color: colors.tint }]}>Delete chore</ThemedText>
          </Pressable>
        )}
      </ScrollView>
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
  content: { padding: 16, paddingBottom: 60 },
  label: { marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  hint: { fontSize: 12, opacity: 0.55, marginTop: 6 },
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
