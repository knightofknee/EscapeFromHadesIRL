import { useState, useMemo } from 'react';
import {
  ScrollView,
  View,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useQuests } from '@/hooks/use-quests';
import { useHabits } from '@/hooks/use-habits';
import { setPendingHabitCallback } from '@/lib/pending-habit-link';
import { QuestColors } from '@/constants/theme';
import { QUEST_TEMPLATES, CATEGORY_NAMES } from '@/constants/quest-templates';
import type { QuestCategory, QuestType } from '@/types/quest';

const DAYS = [1, 2, 3, 4, 5, 6, 7];

export default function CreateQuestScreen() {
  const router = useRouter();
  const { quests, createQuest } = useQuests();
  const { habits } = useHabits();

  // For templates: 'pick' = choose template, 'habits' = link habits step
  const [templateStep, setTemplateStep] = useState<'pick' | 'habits'>('pick');

  const [mode, setMode] = useState<'template' | 'custom'>('template');
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);

  // Custom fields
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customCategory, setCustomCategory] = useState<QuestCategory>('custom');
  const [customQuestType, setCustomQuestType] = useState<QuestType>('positive');
  const [targetDays, setTargetDays] = useState(5);
  const [linkedHabitIds, setLinkedHabitIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const activeTemplateKeys = useMemo(
    () => new Set(quests.filter((q) => q.status === 'active' && q.templateKey).map((q) => q.templateKey)),
    [quests],
  );

  const selectedTemplate = useMemo(
    () => QUEST_TEMPLATES.find((t) => t.key === selectedTemplateKey) ?? null,
    [selectedTemplateKey],
  );

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
          category: customCategory,
          questType: customQuestType,
          targetDaysPerWeek: targetDays,
          linkedHabitIds: habitIds,
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
        <View style={styles.navBar}>
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
            Link a habit to {questName}?
          </ThemedText>

          <Pressable
            style={[styles.skipBtn, linkedHabitIds.length === 0 && styles.skipBtnActive]}
            onPress={() => handleSave([])}>
            <ThemedText style={styles.skipText}>No thank you</ThemedText>
          </Pressable>

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
      <View style={styles.navBar}>
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
                    selectedTemplateKey === t.key && styles.templateCardSelected,
                    t.isFoundation && styles.templateCardFoundation,
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
            />

            <ThemedText style={styles.sectionLabel}>CATEGORY</ThemedText>
            <View style={styles.chipRow}>
              {(['physical', 'mental', 'creative', 'wellness', 'custom'] as QuestCategory[]).map(
                (cat) => (
                  <Pressable
                    key={cat}
                    style={[
                      styles.chip,
                      customCategory === cat && {
                        backgroundColor: QuestColors[cat],
                        borderColor: QuestColors[cat],
                      },
                    ]}
                    onPress={() => setCustomCategory(cat)}>
                    <ThemedText
                      style={[styles.chipText, customCategory === cat && styles.chipTextActive]}>
                      {cat.toUpperCase()}
                    </ThemedText>
                  </Pressable>
                ),
              )}
            </View>

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
            <ThemedText style={styles.sectionLabel}>LINK HABITS (OPTIONAL)</ThemedText>
            <ThemedText style={styles.sectionHint}>
              Linked habits auto-feed your quest score.
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
    paddingTop: 56,
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
