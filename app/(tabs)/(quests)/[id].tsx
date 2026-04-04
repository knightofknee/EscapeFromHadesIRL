import { useMemo, useState, useRef, useEffect } from 'react';
import { ScrollView, View, Pressable, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ScoreBar } from '@/components/quests/score-bar';
import { useQuests } from '@/hooks/use-quests';
import { useHabits } from '@/hooks/use-habits';
import { useHabitRecords } from '@/hooks/use-habit-records';
import { useQuestScores } from '@/hooks/use-quest-scores';
import { QuestColors } from '@/constants/theme';
import { CATEGORY_NAMES, TEMPLATE_BY_KEY } from '@/constants/quest-templates';
import { formatDate } from '@/lib/date-utils';
import { setPendingHabitCallback } from '@/lib/pending-habit-link';

function get30DayWindow() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

export default function QuestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { quests, updateQuest, pauseQuest, deleteQuest } = useQuests();
  const { habits } = useHabits();
  const { startDate, endDate } = useMemo(get30DayWindow, []);
  const { records } = useHabitRecords(startDate, endDate);
  const [deleting, setDeleting] = useState(false);
  const [editingHabits, setEditingHabits] = useState(false);

  const quest = quests.find((q) => q.id === id);
  const questsRef = useRef(quests);
  useEffect(() => { questsRef.current = quests; }, [quests]);
  const scores = useQuestScores(quest ? [quest] : [], habits, records);
  const questScore = quest ? scores.byQuest.get(quest.id) : undefined;
  const linkedHabits = useMemo(
    () => habits.filter((h) => quest?.linkedHabitIds.includes(h.id)),
    [habits, quest],
  );

  if (!quest) {
    return (
      <View style={styles.root}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <ThemedText style={styles.backText}>← Back</ThemedText>
        </Pressable>
        <ThemedText style={styles.notFound}>Quest not found.</ThemedText>
      </View>
    );
  }

  const template = quest.templateKey ? TEMPLATE_BY_KEY[quest.templateKey] : null;
  const categoryColor = QuestColors[quest.category] ?? QuestColors.custom;

  function confirmDelete() {
    Alert.alert(
      'Abandon quest?',
      `"${quest!.name}" will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Abandon',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            await deleteQuest(quest!.id);
            router.back();
          },
        },
      ],
    );
  }

  function confirmPause() {
    Alert.alert(
      'Pause quest?',
      'This quest will no longer count toward your run score.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pause',
          onPress: async () => {
            await pauseQuest(quest!.id);
            router.back();
          },
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()}>
          <ThemedText style={styles.backText}>← Back</ThemedText>
        </Pressable>
        {template?.isFoundation && (
          <ThemedText style={styles.foundationLabel}>FOUNDATION</ThemedText>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Title block */}
        <View style={styles.titleBlock}>
          <View style={[styles.categoryBar, { backgroundColor: categoryColor }]} />
          <View style={styles.titleText}>
            <ThemedText style={styles.name}>{quest.name}</ThemedText>
            <ThemedText style={styles.category}>
              {CATEGORY_NAMES[quest.category]}
              {quest.questType === 'reduce' ? ' · REDUCE' : ''}
            </ThemedText>
            {quest.description ? (
              <ThemedText style={styles.description}>{quest.description}</ThemedText>
            ) : null}
          </View>
        </View>

        {/* Score block */}
        <View style={styles.scoreBlock}>
          <View style={styles.scoreRow}>
            <View style={styles.scoreMain}>
              <ThemedText style={[styles.scoreBig, {
                color: (questScore?.score ?? 0) >= 80
                  ? QuestColors.flameHigh
                  : (questScore?.score ?? 0) >= 50
                  ? QuestColors.flameMid
                  : QuestColors.flameLow
              }]}>
                {questScore?.score ?? 0}%
              </ThemedText>
              <ThemedText style={styles.scoreLabel}>30-DAY SCORE</ThemedText>
            </View>
            <View style={styles.scoreSide}>
              <ThemedText style={styles.scoreDetail}>
                {quest.targetDaysPerWeek}×/wk target
              </ThemedText>
              {questScore && (
                <ThemedText style={styles.scoreDetail}>
                  {questScore.completedDays} days done · {questScore.targetDays} day goal per last 30 days
                </ThemedText>
              )}
              {(questScore?.doubleDays ?? 0) > 0 && (
                <ThemedText style={styles.doubleDetail}>
                  ★ {questScore!.doubleDays} days extra effort
                </ThemedText>
              )}
              {(questScore?.idealDays ?? 0) > 0 && (
                <ThemedText style={styles.doubleDetail}>
                  ★ {questScore!.idealDays} ideal days
                </ThemedText>
              )}
            </View>
          </View>
          <ScoreBar score={questScore?.score ?? 0} height={8} />
        </View>

        {/* Linked habits */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionLabel}>LINKED HABITS</ThemedText>
            <Pressable onPress={() => setEditingHabits((v) => !v)}>
              <ThemedText style={styles.editLink}>
                {editingHabits ? 'Done' : 'Edit'}
              </ThemedText>
            </Pressable>
          </View>
          {editingHabits ? (
            <>
              {habits.map((h) => {
                const isLinked = quest.linkedHabitIds.includes(h.id);
                return (
                  <Pressable
                    key={h.id}
                    style={[
                      styles.habitRow,
                      isLinked && { borderColor: h.color },
                    ]}
                    onPress={() => {
                      const next = isLinked ? [] : [h.id];
                      updateQuest(quest.id, { linkedHabitIds: next });
                    }}
                  >
                    <View style={[styles.habitDot, { backgroundColor: h.color }]} />
                    <ThemedText style={styles.habitName}>{h.name}</ThemedText>
                    <ThemedText style={[styles.toggleIcon, isLinked && { color: h.color }]}>
                      {isLinked ? '✓' : '+'}
                    </ThemedText>
                  </Pressable>
                );
              })}
              <Pressable
                style={styles.createHabitBtn}
                onPress={() => {
                  const questId = quest.id;
                  setPendingHabitCallback((habitId) => {
                    const latest = questsRef.current.find((q) => q.id === questId);
                    if (latest) {
                      updateQuest(questId, { linkedHabitIds: [...latest.linkedHabitIds, habitId] });
                    }
                  });
                  router.push({ pathname: '/tile-settings', params: { mode: 'create', prefillName: quest.name } });
                }}>
                <ThemedText style={styles.createHabitText}>＋ Create New Habit</ThemedText>
              </Pressable>
            </>
          ) : linkedHabits.length === 0 ? (
            <ThemedText style={styles.dimText}>
              No habits linked. Tap Edit to link habits.
            </ThemedText>
          ) : (
            linkedHabits.map((h) => (
              <View key={h.id} style={styles.habitRow}>
                <View style={[styles.habitDot, { backgroundColor: h.color }]} />
                <ThemedText style={styles.habitName}>{h.name}</ThemedText>
                <ThemedText style={styles.habitMode}>{h.recordingMode}</ThemedText>
              </View>
            ))
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.pauseBtn} onPress={confirmPause}>
            <ThemedText style={styles.pauseText}>PAUSE QUEST</ThemedText>
          </Pressable>
          <Pressable style={styles.deleteBtn} onPress={confirmDelete} disabled={deleting}>
            <ThemedText style={styles.deleteText}>
              {deleting ? 'Abandoning...' : 'ABANDON QUEST'}
            </ThemedText>
          </Pressable>
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
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: QuestColors.border,
  },
  backBtn: {
    padding: 4,
  },
  backText: {
    fontSize: 15,
    color: QuestColors.textDim,
  },
  foundationLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: QuestColors.gold,
    letterSpacing: 1.5,
  },
  notFound: {
    fontSize: 16,
    color: QuestColors.textDim,
    margin: 24,
  },
  content: {
    padding: 16,
    gap: 24,
    paddingBottom: 48,
  },
  titleBlock: {
    flexDirection: 'row',
    gap: 12,
  },
  categoryBar: {
    width: 4,
    borderRadius: 2,
    flexShrink: 0,
  },
  titleText: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: QuestColors.text,
  },
  category: {
    fontSize: 11,
    color: QuestColors.textDim,
    letterSpacing: 1,
  },
  description: {
    fontSize: 14,
    color: QuestColors.textDim,
    fontStyle: 'italic',
    marginTop: 4,
  },
  scoreBlock: {
    backgroundColor: QuestColors.surface,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 10,
    padding: 16,
    gap: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
  },
  scoreMain: {
    gap: 2,
  },
  scoreBig: {
    fontSize: 48,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    lineHeight: 52,
  },
  scoreLabel: {
    fontSize: 9,
    color: QuestColors.textDim,
    letterSpacing: 1.5,
  },
  scoreSide: {
    flex: 1,
    gap: 4,
    paddingBottom: 6,
  },
  scoreDetail: {
    fontSize: 12,
    color: QuestColors.textDim,
  },
  doubleDetail: {
    fontSize: 12,
    color: QuestColors.gold,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: QuestColors.textDim,
    letterSpacing: 1.5,
  },
  editLink: {
    fontSize: 13,
    fontWeight: '600',
    color: QuestColors.flameHigh,
  },
  toggleIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: QuestColors.textDim,
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
  dimText: {
    fontSize: 13,
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
  habitMode: {
    fontSize: 11,
    color: QuestColors.textDim,
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
  pauseBtn: {
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  pauseText: {
    fontSize: 12,
    fontWeight: '700',
    color: QuestColors.textDim,
    letterSpacing: 1,
  },
  deleteBtn: {
    borderWidth: 1,
    borderColor: '#7B1A1A',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  deleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: QuestColors.flameLow,
    letterSpacing: 1,
  },
});
