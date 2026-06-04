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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useQuests } from '@/hooks/use-quests';
import { useHabits } from '@/hooks/use-habits';
import { setPendingHabitCallback } from '@/lib/pending-habit-link';
import { QuestColors } from '@/constants/theme';
import { QUEST_TEMPLATES, CATEGORY_NAMES } from '@/constants/quest-templates';
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
  const { quests, createQuest } = useQuests();
  const { habits } = useHabits();

  // A home "Begin" stub routes here as ?templateKey=walk — preselect that
  // template and jump straight to the link-habit step.
  const params = useLocalSearchParams<{ templateKey?: string }>();
  const paramTemplate =
    params.templateKey && QUEST_TEMPLATES.some((t) => t.key === params.templateKey)
      ? params.templateKey
      : null;

  // For templates: 'pick' = choose template, 'habits' = link habits step.
  const [templateStep, setTemplateStep] = useState<'pick' | 'habits'>(
    paramTemplate ? 'habits' : 'pick',
  );

  // Default to custom: the base challenges live on the quests home now, so
  // "+ NEW" is for custom pacts. A ?templateKey entry forces template mode.
  const [mode, setMode] = useState<'template' | 'custom'>(
    paramTemplate ? 'template' : 'custom',
  );
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(
    paramTemplate,
  );

  // Custom fields
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customQuestType, setCustomQuestType] = useState<QuestType>('positive');
  const [targetDays, setTargetDays] = useState(5);
  const [successLevel, setSuccessLevel] = useState<1 | 2 | 3>(1);
  const [linkedHabitIds, setLinkedHabitIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

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

  const activeTemplateKeys = useMemo(
    () => new Set(quests.filter((q) => q.status === 'active' && q.templateKey).map((q) => q.templateKey)),
    [quests],
  );

  const selectedTemplate = useMemo(
    () => QUEST_TEMPLATES.find((t) => t.key === selectedTemplateKey) ?? null,
    [selectedTemplateKey],
  );

  // The single linked habit (custom quests link exactly one). The success-
  // level field only applies to quad-type habits (yes/goal/ideal tiers).
  const linkedHabit = habits.find((h) => h.id === linkedHabitIds[0]);
  const isQuadHabit =
    !!linkedHabit &&
    ['quad', 'steps', 'meditation', 'creativeWriting'].includes(linkedHabit.recordingMode);

  function toggleHabit(id: string) {
    setLinkedHabitIds((prev) =>
      prev.includes(id) ? [] : [id],
    );
  }

  function handleTemplateNext() {
    if (!selectedTemplate) {
      Alert.alert('Select a template.');
      return;
    }
    setTemplateStep('habits');
  }

  async function handleSave(overrideLinkedHabitIds?: string[]) {
    if (mode === 'custom' && !customName.trim()) {
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
      let newQuest;
      if (mode === 'template' && selectedTemplate) {
        newQuest = await createQuest({
          templateKey: selectedTemplate.key,
          name: selectedTemplate.name,
          description: selectedTemplate.description,
          category: selectedTemplate.category,
          questType: selectedTemplate.questType,
          targetDaysPerWeek: selectedTemplate.targetDaysPerWeek,
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
          status: 'active',
        });
      }
      if (newQuest) {
        router.replace(`/(tabs)/(quests)/${newQuest.id}`);
      } else {
        router.back();
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Failed to save quest.');
    } finally {
      setSaving(false);
    }
  }

  // --- Template mode, step 2: link habits ---
  if (mode === 'template' && templateStep === 'habits') {
    const questName = selectedTemplate?.name ?? '';
    return (
      <View style={styles.root}>
        <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => setTemplateStep('pick')}>
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
                setLinkedHabitIds((prev) => [...prev, habitId]);
              });
              router.push({ pathname: '/tile-settings', params: { mode: 'create', prefillName: questName } });
            }}>
            <ThemedText style={styles.createHabitText}>＋ Create New Habit</ThemedText>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // --- Main screen: template pick OR full custom form ---
  return (
    <View style={styles.root}>
      <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()}>
          <ThemedText style={styles.cancel}>Cancel</ThemedText>
        </Pressable>
        <ThemedText style={styles.navTitle}>NEW QUEST</ThemedText>
        {mode === 'template' ? (
          <Pressable onPress={handleTemplateNext}>
            <ThemedText style={styles.save}>Next</ThemedText>
          </Pressable>
        ) : (
          <Pressable onPress={() => handleSave()} disabled={saving}>
            <ThemedText style={[styles.save, saving && styles.saveDim]}>
              {saving ? 'Saving...' : 'Save'}
            </ThemedText>
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, mode === 'template' && styles.modeBtnActive]}
            onPress={() => setMode('template')}>
            <ThemedText style={[styles.modeBtnText, mode === 'template' && styles.modeBtnTextActive]}>
              TEMPLATES
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === 'custom' && styles.modeBtnActive]}
            onPress={() => setMode('custom')}>
            <ThemedText style={[styles.modeBtnText, mode === 'custom' && styles.modeBtnTextActive]}>
              CUSTOM
            </ThemedText>
          </Pressable>
        </View>

        {mode === 'template' ? (
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>CHOOSE A QUEST</ThemedText>
            {QUEST_TEMPLATES.map((t) => {
              const alreadyActive = activeTemplateKeys.has(t.key);
              return (
                <Pressable
                  key={t.key}
                  style={[
                    styles.templateCard,
                    // Foundation styling first so selection can override its border
                    t.isFoundation && styles.templateCardFoundation,
                    selectedTemplateKey === t.key && styles.templateCardSelected,
                    alreadyActive && styles.templateCardDisabled,
                  ]}
                  onPress={() => {
                    if (alreadyActive) return;
                    if (selectedTemplateKey === t.key) {
                      setSelectedTemplateKey(null);
                    } else {
                      setSelectedTemplateKey(t.key);
                    }
                  }}>
                  <View style={styles.templateCardHeader}>
                    <ThemedText style={[styles.templateName, alreadyActive && styles.templateNameDisabled]}>
                      {t.name}
                    </ThemedText>
                    {alreadyActive ? (
                      <ThemedText style={styles.activeBadge}>ACTIVE</ThemedText>
                    ) : t.isFoundation ? (
                      <ThemedText style={styles.foundationBadge}>FOUNDATION</ThemedText>
                    ) : null}
                  </View>
                  <ThemedText style={styles.templateDesc}>{t.description}</ThemedText>
                  <ThemedText style={styles.templateMeta}>
                    {CATEGORY_NAMES[t.category]} · {t.targetDaysPerWeek}×/wk
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : (
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

            {/* Habit linker */}
            <ThemedText style={styles.sectionLabel}>LINK A HABIT</ThemedText>
            <ThemedText style={styles.sectionHint}>
              A linked habit feeds this quest&apos;s score — required, or the
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
                  setLinkedHabitIds((prev) => [...prev, habitId]);
                });
                router.push({ pathname: '/tile-settings', params: { mode: 'create', prefillName: customName.trim() } });
              }}>
              <ThemedText style={styles.createHabitText}>＋ Create New Habit</ThemedText>
            </Pressable>

            {customQuestType === 'positive' && isQuadHabit && (
              <>
                <ThemedText style={styles.sectionLabel}>LEVEL OF SUCCESS</ThemedText>
                <ThemedText style={styles.sectionHint}>
                  Which tier of {linkedHabit?.name} counts as a win — make a second
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
        )}
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
  modeRow: {
    flexDirection: 'row',
    gap: 0,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: QuestColors.surface,
  },
  modeBtnActive: {
    backgroundColor: QuestColors.flameMid,
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: QuestColors.textDim,
    letterSpacing: 1,
  },
  modeBtnTextActive: {
    color: '#fff',
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
  templateCard: {
    backgroundColor: QuestColors.surface,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  templateCardSelected: {
    borderColor: QuestColors.flameMid,
  },
  templateCardFoundation: {
    borderColor: QuestColors.goldDim,
  },
  templateCardDisabled: {
    opacity: 0.4,
  },
  templateNameDisabled: {
    color: QuestColors.textDim,
  },
  activeBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: QuestColors.textDim,
    letterSpacing: 0.5,
  },
  templateCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  templateName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: QuestColors.text,
  },
  foundationBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: QuestColors.gold,
    letterSpacing: 0.5,
  },
  templateDesc: {
    fontSize: 12,
    color: QuestColors.textDim,
    fontStyle: 'italic',
  },
  templateMeta: {
    fontSize: 11,
    color: QuestColors.textDim,
    marginTop: 2,
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
  skipBtn: {
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: QuestColors.surface,
  },
  skipBtnActive: {
    borderColor: QuestColors.flameMid,
  },
  skipText: {
    fontSize: 14,
    color: QuestColors.textDim,
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
