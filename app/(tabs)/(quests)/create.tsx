import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ScrollView,
  View,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useQuests } from '@/hooks/use-quests';
import { useHabits } from '@/hooks/use-habits';
import { setPendingHabitCallback } from '@/lib/pending-habit-link';
import { QuestColors } from '@/constants/theme';
import { QUEST_TEMPLATES } from '@/constants/quest-templates';
import { QuestPhilosophy } from '@/components/quests/quest-philosophy';
import { suggestPactWhy } from '@/lib/quest-narrative';
import { isTieredMode } from '@/lib/habit-scoring';
import type { QuestType } from '@/types/quest';

const DAYS = [1, 2, 3, 4, 5, 6, 7];

// Base challenges started from a home stub pre-link the matching auto-record
// habit so the quest works immediately.
const AUTO_RECORD_MODE_BY_TEMPLATE: Record<string, string> = {
  walk: 'steps',
  meditate: 'meditation',
  write: 'creativeWriting',
};

export default function CreateQuestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { quests, createQuest, updateQuest } = useQuests();
  const { habits } = useHabits();

  // A home "Begin" stub routes here as ?templateKey=walk — preselect that
  // template and jump straight to the link-habit step. (All-habit templates
  // are always-on virtual quests and never route here — reject their keys.)
  // An ?editQuestId param instead opens this form in EDIT mode for an
  // existing personal pact.
  const params = useLocalSearchParams<{ templateKey?: string; editQuestId?: string }>();
  const paramTemplate =
    params.templateKey &&
    QUEST_TEMPLATES.some((t) => t.key === params.templateKey && !t.allHabits)
      ? params.templateKey
      : null;
  const editQuest = useMemo(
    () => (params.editQuestId ? (quests.find((q) => q.id === params.editQuestId) ?? null) : null),
    [quests, params.editQuestId],
  );

  // Two entry modes, no toggle: a ?templateKey param (from a home Begin
  // stub) renders the link-habit step for that challenge; otherwise this
  // screen IS the custom pact form. There's no template browser here — the
  // home already shows every template.

  // Custom fields
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customWhy, setCustomWhy] = useState('');
  const [customQuestType, setCustomQuestType] = useState<QuestType>('positive');
  const [targetDays, setTargetDays] = useState(5);
  const [successLevel, setSuccessLevel] = useState<1 | 2 | 3>(1);
  const [linkedHabitIds, setLinkedHabitIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Which rolling average the pact targets — the single-window choice that
  // used to live on the Stygian Pact template. BOTH keeps the classic
  // dual-bar behavior.
  const [customWindow, setCustomWindow] = useState<'30d' | '18mo' | 'both'>('both');

  // Edit mode: prefill every create-time field from the pact, once.
  const didPrefill = useRef(false);
  useEffect(() => {
    if (!editQuest || didPrefill.current) return;
    didPrefill.current = true;
    setCustomName(editQuest.name);
    setCustomDescription(editQuest.description);
    setCustomWhy(editQuest.personalPactWhy ?? '');
    setCustomQuestType(editQuest.questType);
    setTargetDays(editQuest.targetDaysPerWeek);
    setSuccessLevel((editQuest.successLevel ?? 1) as 1 | 2 | 3);
    setCustomWindow(editQuest.scoreWindow ?? 'both');
    setLinkedHabitIds(editQuest.linkedHabitIds);
  }, [editQuest]);

  // Auto-link the matching auto-record habit once habits load (async), so a
  // walk/meditate/write challenge works immediately.
  const didAutoLink = useRef(false);
  useEffect(() => {
    if (didAutoLink.current || !paramTemplate) return;
    const recMode = AUTO_RECORD_MODE_BY_TEMPLATE[paramTemplate];
    if (!recMode) {
      didAutoLink.current = true;
      return;
    }
    const match = habits.find((h) => h.recordingMode === recMode);
    if (match) {
      setLinkedHabitIds([match.id]);
      didAutoLink.current = true;
    }
  }, [paramTemplate, habits]);

  const selectedTemplate = useMemo(
    () => QUEST_TEMPLATES.find((t) => t.key === paramTemplate) ?? null,
    [paramTemplate],
  );

  // The single linked habit (custom quests link exactly one). The success-
  // level field only applies to quad-type habits (yes/goal/ideal tiers).
  const linkedHabit = habits.find((h) => h.id === linkedHabitIds[0]);
  const isQuadHabit = !!linkedHabit && isTieredMode(linkedHabit.recordingMode);

  function toggleHabit(id: string) {
    setLinkedHabitIds((prev) =>
      prev.includes(id) ? [] : [id],
    );
  }

  async function handleSave(overrideLinkedHabitIds?: string[]) {
    // Edit deep link raced the quests listener: saving before the pact doc
    // arrives would fall through to the CREATE branch and duplicate it.
    if (params.editQuestId && !editQuest) {
      Alert.alert('Still loading', 'Give it a beat and try again.');
      return;
    }
    if (!selectedTemplate && !customName.trim()) {
      Alert.alert('Name your quest.');
      return;
    }

    const habitIds = overrideLinkedHabitIds ?? linkedHabitIds;
    // A quest with no linked habit can't track anything, so require one.
    if (habitIds.length === 0) {
      Alert.alert('Link a habit', 'A quest needs a linked habit to track progress.');
      return;
    }

    setSaving(true);
    try {
      // Edit mode: write the changed fields back to the existing pact.
      if (editQuest) {
        const saved = await updateQuest(editQuest.id, {
          name: customName.trim(),
          description: customDescription.trim(),
          questType: customQuestType,
          targetDaysPerWeek: targetDays,
          successLevel: customQuestType === 'positive' && isQuadHabit ? successLevel : 1,
          scoreWindow: customWindow,
          personalPactWhy: customWhy.trim(),
          linkedHabitIds: habitIds,
        });
        // Blocked write (offline guard already alerted) → stay on the form
        // instead of silently discarding the user's edits.
        if (saved) router.back();
        return;
      }

      let newQuest;
      if (selectedTemplate) {
        // One active instance per template: a double-tapped Begin stub (or a
        // stale deep link) must not create a hidden duplicate — the home
        // renders only the first match while both would be scored.
        const existing = quests.find(
          (q) => q.status === 'active' && q.templateKey === selectedTemplate.key,
        );
        if (existing) {
          router.replace(`/(tabs)/(quests)/${existing.id}`);
          return;
        }
        newQuest = await createQuest({
          templateKey: selectedTemplate.key,
          name: selectedTemplate.name,
          description: selectedTemplate.description,
          category: selectedTemplate.category,
          questType: selectedTemplate.questType,
          targetDaysPerWeek: selectedTemplate.targetDaysPerWeek,
          successLevel: selectedTemplate.successLevel ?? 1,
          scoreWindow: selectedTemplate.scoreWindow ?? 'both',
          allHabits: false,
          linkedHabitIds: habitIds,
          status: 'active',
        });
      } else {
        newQuest = await createQuest({
          templateKey: null,
          name: customName.trim(),
          description: customDescription.trim(),
          category: 'custom',
          questType: customQuestType,
          targetDaysPerWeek: targetDays,
          linkedHabitIds: habitIds,
          // Only meaningful for a positive quest on a quad habit; else basic.
          successLevel: customQuestType === 'positive' && isQuadHabit ? successLevel : 1,
          scoreWindow: customWindow,
          personalPactWhy: customWhy.trim(),
          allHabits: false,
          status: 'active',
        });
      }
      if (newQuest) {
        router.replace(`/(tabs)/(quests)/${newQuest.id}`);
      }
      // No quest back = the write was blocked (offline guard already
      // alerted) — keep the filled-in form instead of throwing it away.
    } catch (e) {
      console.error(e);
      Alert.alert('Failed to save quest.');
    } finally {
      setSaving(false);
    }
  }

  // --- Begin-a-challenge flow (?templateKey): link a habit of the right
  // type and save. This is the only template path — there's no in-screen
  // template browser.
  if (selectedTemplate) {
    const questName = selectedTemplate.name;
    return (
      <View style={styles.root}>
        {/* Dark screen — focused override keeps status-bar icons visible in
            light mode (the index's own override unmounts when it blurs). */}
        {isFocused && <StatusBar style="light" />}
        <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()}>
            <ThemedText style={styles.cancel}>Back</ThemedText>
          </Pressable>
          <ThemedText style={styles.navTitle}>LINK HABITS</ThemedText>
          <Pressable onPress={() => handleSave()} disabled={saving}>
            <ThemedText style={[styles.save, saving && styles.saveDim]}>
              {saving ? 'Saving...' : 'Save'}
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* The "why" behind this quest — expandable, collapsed by default. */}
          <QuestPhilosophy text={selectedTemplate.philosophy} />

          <ThemedText style={styles.linkQuestion}>
            Link a habit to {questName} to track it.
          </ThemedText>

          {habits.map((h) => {
            const linked = linkedHabitIds.includes(h.id);
            return (
              <Pressable
                key={h.id}
                style={[styles.habitRow, linked && styles.habitRowLinked]}
                onPress={() => toggleHabit(h.id)}>
                <View style={[styles.habitDot, { backgroundColor: h.color }]} />
                <ThemedText style={styles.habitName}>{h.name}</ThemedText>
                <ThemedText style={[styles.habitCheck, linked && styles.habitCheckLinked]}>
                  {linked ? '✓' : '+'}
                </ThemedText>
              </Pressable>
            );
          })}

          <Pressable
            style={styles.createHabitBtn}
            onPress={() => {
              setPendingHabitCallback((habitId) => {
                // Replace, not append — quests link exactly one habit.
                setLinkedHabitIds([habitId]);
              });
              router.push({ pathname: '/tile-settings', params: { mode: 'create', prefillName: questName } });
            }}>
            <ThemedText style={styles.createHabitText}>＋ Create New Habit</ThemedText>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // --- Custom pact form (the only thing "+ NEW" creates) ---
  return (
    <View style={styles.root}>
      {isFocused && <StatusBar style="light" />}
      <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()}>
          <ThemedText style={styles.cancel}>Cancel</ThemedText>
        </Pressable>
        <ThemedText style={styles.navTitle}>{editQuest ? 'EDIT PACT' : 'NEW PACT'}</ThemedText>
        <Pressable onPress={() => handleSave()} disabled={saving}>
          <ThemedText style={[styles.save, saving && styles.saveDim]}>
            {saving ? 'Saving...' : 'Save'}
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>QUEST NAME</ThemedText>
            <TextInput
              style={styles.input}
              value={customName}
              onChangeText={setCustomName}
              placeholder="Name your pact..."
              placeholderTextColor={QuestColors.textDim}
              maxLength={100}
            />

            <ThemedText style={styles.sectionLabel}>DESCRIPTION</ThemedText>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={customDescription}
              onChangeText={setCustomDescription}
              placeholder="What does this quest demand?"
              placeholderTextColor={QuestColors.textDim}
              multiline
              numberOfLines={3}
              maxLength={1000}
            />

            <View style={styles.whyHeader}>
              <ThemedText style={styles.sectionLabel}>WHY THIS PACT</ThemedText>
              <Pressable
                onPress={() =>
                  setCustomWhy(
                    suggestPactWhy({
                      name: customName,
                      habitName: linkedHabit?.name,
                      targetDays,
                      questType: customQuestType,
                    }),
                  )
                }
              >
                <ThemedText style={styles.suggestLink}>Suggest</ThemedText>
              </Pressable>
            </View>
            <ThemedText style={styles.sectionHint}>
              The stakes, in your own words. Shown as this pact&apos;s &ldquo;why&rdquo; on its
              detail screen. Leave blank for the default.
            </ThemedText>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={customWhy}
              onChangeText={setCustomWhy}
              placeholder="Why does this pact matter?"
              placeholderTextColor={QuestColors.textDim}
              multiline
              numberOfLines={4}
              maxLength={2000}
            />

            <ThemedText style={styles.sectionLabel}>QUEST TYPE</ThemedText>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, customQuestType === 'positive' && styles.chipPositiveActive]}
                onPress={() => setCustomQuestType('positive')}>
                <ThemedText style={[styles.chipText, customQuestType === 'positive' && styles.chipTextActive]}>
                  DO MORE
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.chip, customQuestType === 'reduce' && styles.chipReduceActive]}
                onPress={() => setCustomQuestType('reduce')}>
                <ThemedText style={[styles.chipText, customQuestType === 'reduce' && styles.chipTextActive]}>
                  REDUCE
                </ThemedText>
              </Pressable>
            </View>

            {/* Target days */}
            <ThemedText style={styles.sectionLabel}>
              {customQuestType === 'reduce' ? 'MAX DAYS/WEEK ALLOWED' : 'TARGET DAYS/WEEK'}
            </ThemedText>
            <View style={styles.chipRow}>
              {DAYS.map((d) => (
                <Pressable
                  key={d}
                  style={[styles.dayChip, targetDays === d && styles.dayChipActive]}
                  onPress={() => setTargetDays(d)}>
                  <ThemedText style={[styles.dayChipText, targetDays === d && styles.dayChipTextActive]}>
                    {d}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            {/* Scored window — the single-window choice that used to live on
                the Stygian Pact template. BOTH = the classic dual bars. */}
            <ThemedText style={styles.sectionLabel}>ROLLING AVERAGE</ThemedText>
            <View style={styles.chipRow}>
              {(
                [
                  { value: '30d', label: '30 DAYS' },
                  { value: '18mo', label: '18 MONTHS' },
                  { value: 'both', label: 'BOTH' },
                ] as const
              ).map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.chip, customWindow === opt.value && styles.chipPositiveActive]}
                  onPress={() => setCustomWindow(opt.value)}>
                  <ThemedText
                    style={[styles.chipText, customWindow === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            {/* Habit linker */}
            <ThemedText style={styles.sectionLabel}>LINK A HABIT</ThemedText>
            <ThemedText style={styles.sectionHint}>
              A linked habit feeds this quest&apos;s score. Required, or the
              quest has nothing to track.
            </ThemedText>
            {habits.map((h) => {
              const linked = linkedHabitIds.includes(h.id);
              return (
                <Pressable
                  key={h.id}
                  style={[styles.habitRow, linked && styles.habitRowLinked]}
                  onPress={() => toggleHabit(h.id)}>
                  <View style={[styles.habitDot, { backgroundColor: h.color }]} />
                  <ThemedText style={styles.habitName}>{h.name}</ThemedText>
                  <ThemedText style={[styles.habitCheck, linked && styles.habitCheckLinked]}>
                    {linked ? '✓' : '+'}
                  </ThemedText>
                </Pressable>
              );
            })}
            <Pressable
              style={styles.createHabitBtn}
              onPress={() => {
                setPendingHabitCallback((habitId) => {
                  // Replace, not append — quests link exactly one habit.
                  setLinkedHabitIds([habitId]);
                });
                router.push({ pathname: '/tile-settings', params: { mode: 'create', prefillName: customName.trim() } });
              }}>
              <ThemedText style={styles.createHabitText}>＋ Create New Habit</ThemedText>
            </Pressable>

            {customQuestType === 'positive' && isQuadHabit && (
              <>
                <ThemedText style={styles.sectionLabel}>LEVEL OF SUCCESS</ThemedText>
                <ThemedText style={styles.sectionHint}>
                  Which tier of {linkedHabit?.name} counts as a win. Make a second
                  quest at a higher tier for a tougher goal on the same habit.
                </ThemedText>
                <View style={styles.chipRow}>
                  {([1, 2, 3] as const).map((lvl) => (
                    <Pressable
                      key={lvl}
                      style={[styles.chip, successLevel === lvl && styles.chipPositiveActive]}
                      onPress={() => setSuccessLevel(lvl)}>
                      <ThemedText
                        style={[styles.chipText, successLevel === lvl && styles.chipTextActive]}>
                        {lvl === 1 ? 'BASIC' : lvl === 2 ? 'GOAL' : 'IDEAL'}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: QuestColors.background,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: QuestColors.border,
  },
  navTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: QuestColors.text,
    letterSpacing: 2,
  },
  cancel: {
    fontSize: 15,
    color: QuestColors.textDim,
  },
  save: {
    fontSize: 15,
    fontWeight: '700',
    color: QuestColors.flameHigh,
  },
  saveDim: {
    opacity: 0.5,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: QuestColors.textDim,
    letterSpacing: 1.5,
  },
  sectionHint: {
    fontSize: 12,
    color: QuestColors.textDim,
    lineHeight: 17,
  },
  whyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestLink: {
    fontSize: 12,
    fontWeight: '700',
    color: QuestColors.flameHigh,
  },
  input: {
    backgroundColor: QuestColors.surface,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 8,
    padding: 12,
    color: QuestColors.text,
    fontSize: 15,
  },
  inputMulti: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: QuestColors.surface,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: QuestColors.textDim,
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: '#fff',
  },
  chipPositiveActive: {
    backgroundColor: QuestColors.flameMid,
    borderColor: QuestColors.flameMid,
  },
  chipReduceActive: {
    backgroundColor: QuestColors.reduce,
    borderColor: QuestColors.reduce,
  },
  dayChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: QuestColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: QuestColors.surface,
  },
  dayChipActive: {
    backgroundColor: QuestColors.flameMid,
    borderColor: QuestColors.flameMid,
  },
  dayChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: QuestColors.textDim,
  },
  dayChipTextActive: {
    color: '#fff',
  },
  // Step 2: Habit linking (template flow)
  linkQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: QuestColors.text,
    marginBottom: 4,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: QuestColors.surface,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 8,
  },
  habitRowLinked: {
    borderColor: QuestColors.flameMid,
  },
  habitDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  habitName: {
    flex: 1,
    fontSize: 14,
    color: QuestColors.text,
  },
  habitCheck: {
    fontSize: 16,
    color: QuestColors.textDim,
  },
  habitCheckLinked: {
    color: QuestColors.flameMid,
    fontWeight: '700',
  },
  createHabitBtn: {
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 8,
    borderStyle: 'dashed',
    paddingVertical: 12,
    alignItems: 'center',
  },
  createHabitText: {
    fontSize: 14,
    fontWeight: '600',
    color: QuestColors.flameHigh,
  },
});
