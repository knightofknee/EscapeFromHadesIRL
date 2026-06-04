import { useMemo, useState, useRef, useEffect } from 'react';
import { ScrollView, View, Pressable, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ScoreBar } from '@/components/quests/score-bar';
import { useQuests } from '@/hooks/use-quests';
import { useHabits } from '@/hooks/use-habits';
import { useQuestScores } from '@/hooks/use-quest-scores';
import { useRecordsSnapshot } from '@/hooks/use-records-snapshot';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { useWinOnlyWeekends } from '@/hooks/use-win-only-weekends';
import { QuestColors } from '@/constants/theme';
import { CATEGORY_NAMES, TEMPLATE_BY_KEY } from '@/constants/quest-templates';
import { formatDate } from '@/lib/date-utils';
import { setPendingHabitCallback } from '@/lib/pending-habit-link';

// 18-month window so the detail screen shows the same 30-day + 18-month scores
// as the home. One-shot fetch on focus (see useRecordsSnapshot), not a live
// listener — the 30-day score is derived from the same data.
function get18MonthWindow() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 548);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

export default function QuestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { quests, updateQuest, deleteQuest } = useQuests();
  const { habits } = useHabits();
  const { startDate, endDate } = useMemo(get18MonthWindow, []);
  const records = useRecordsSnapshot(startDate, endDate, isFocused);
  const { dateSet: vacationSet } = useVacationDays();
  const { winOnlyWeekends } = useWinOnlyWeekends();
  const [deleting, setDeleting] = useState(false);
  const [editingHabits, setEditingHabits] = useState(false);

  const quest = quests.find((q) => q.id === id);
  const questsRef = useRef(quests);
  useEffect(() => { questsRef.current = quests; }, [quests]);
  const scores = useQuestScores(quest ? [quest] : [], habits, records, vacationSet, winOnlyWeekends, isFocused);
  const questScore = quest ? scores.byQuest.get(quest.id) : undefined;
  const linkedHabits = useMemo(
    () => habits.filter((h) => quest?.linkedHabitIds.includes(h.id)),
    [habits, quest],
  );
  // Success-level editing only applies to a quad-type linked habit.
  const isQuadHabit =
    linkedHabits.length > 0 &&
    ['quad', 'steps', 'meditation', 'creativeWriting'].includes(linkedHabits[0].recordingMode);

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

  return (
    <View style={styles.root}>
      <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
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
                  {quest.questType === 'reduce'
                    ? `${questScore.completedDays} clean ${questScore.completedDays === 1 ? 'day' : 'days'} · max ${quest.targetDaysPerWeek}×/wk over last 30 days`
                    : `${questScore.completedDays} ${questScore.completedDays === 1 ? 'day' : 'days'} done · ${questScore.targetDays} day goal per last 30 days`}
                </ThemedText>
              )}
              {(questScore?.doubleDays ?? 0) > 0 && (
                <ThemedText style={styles.doubleDetail}>
                  ★ {questScore!.doubleDays} {questScore!.doubleDays === 1 ? 'day' : 'days'} extra effort
                </ThemedText>
              )}
              {(questScore?.idealDays ?? 0) > 0 && (
                <ThemedText style={styles.doubleDetail}>
                  ★ {questScore!.idealDays} ideal {questScore!.idealDays === 1 ? 'day' : 'days'}
                </ThemedText>
              )}
            </View>
          </View>
          <ScoreBar score={questScore?.score ?? 0} height={8} />

          <View style={styles.scoreDivider} />

          <View style={styles.score18Header}>
            <ThemedText style={styles.scoreLabel}>18-MONTH AVERAGE</ThemedText>
            <ThemedText style={[styles.score18Value, { color: QuestColors.gold }]}>
              {questScore?.score18mo ?? 0}%
            </ThemedText>
          </View>
          <ScoreBar score={questScore?.score18mo ?? 0} height={8} color={QuestColors.gold} />
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

        {/* Level of success — only for a quad-type linked habit on a positive
            quest. Editing just re-scores existing records, so it's reversible. */}
        {quest.questType === 'positive' && isQuadHabit && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>LEVEL OF SUCCESS</ThemedText>
            <ThemedText style={styles.dimText}>
              Which tier of {linkedHabits[0]?.name} counts as a win. Changing it
              just re-scores your existing records — nothing is lost.
            </ThemedText>
            <View style={styles.levelRow}>
              {([1, 2, 3] as const).map((lvl) => {
                const active = (quest.successLevel ?? 1) === lvl;
                return (
                  <Pressable
                    key={lvl}
                    style={[styles.levelChip, active && styles.levelChipActive]}
                    onPress={() => updateQuest(quest.id, { successLevel: lvl })}>
                    <ThemedText style={[styles.levelChipText, active && styles.levelChipTextActive]}>
                      {lvl === 1 ? 'BASIC' : lvl === 2 ? 'GOAL' : 'IDEAL'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
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
  scoreDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: QuestColors.border,
  },
  score18Header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  score18Value: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
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
  levelRow: {
    flexDirection: 'row',
    gap: 8,
  },
  levelChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: QuestColors.surface,
  },
  levelChipActive: {
    backgroundColor: QuestColors.goldDim,
    borderColor: QuestColors.gold,
  },
  levelChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: QuestColors.textDim,
    letterSpacing: 0.5,
  },
  levelChipTextActive: {
    color: QuestColors.gold,
  },
  actions: {
    gap: 10,
    marginTop: 8,
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
