import { useMemo, useState, useRef, useEffect } from 'react';
import { ActivityIndicator, ScrollView, View, Pressable, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ScoreBar, flameColor } from '@/components/quests/score-bar';
import { useQuests } from '@/hooks/use-quests';
import { useHabits } from '@/hooks/use-habits';
import { useQuestScores, questPointValue } from '@/hooks/use-quest-scores';
import { useRecordsSnapshot } from '@/hooks/use-records-snapshot';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { useWinOnlyWeekends } from '@/hooks/use-win-only-weekends';
import { useTodayDate } from '@/hooks/use-today-date';
import { QuestColors } from '@/constants/theme';
import { CATEGORY_NAMES, TEMPLATE_BY_KEY, findVirtualQuestById, CUSTOM_QUEST_PHILOSOPHY } from '@/constants/quest-templates';
import { QuestPhilosophy } from '@/components/quests/quest-philosophy';
import { get18MonthWindow } from '@/lib/date-utils';
import { isTieredMode } from '@/lib/habit-scoring';
import { setPendingHabitCallback } from '@/lib/pending-habit-link';


export default function QuestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { quests, isLoading: questsLoading, updateQuest, deleteQuest } = useQuests();
  const { habits } = useHabits();
  const { todayStr } = useTodayDate();
  const { startDate, endDate } = useMemo(() => get18MonthWindow(todayStr), [todayStr]);
  const { records, isLoading: recordsLoading } = useRecordsSnapshot(startDate, endDate, isFocused);
  const { dateSet: vacationSet } = useVacationDays();
  const { winOnlyWeekends } = useWinOnlyWeekends();
  const [deleting, setDeleting] = useState(false);
  const [editingHabits, setEditingHabits] = useState(false);

  // All-habit challenges are always-on virtual quests (id `auto-<key>`),
  // not Firestore docs — resolve via the shared helper so the id scheme
  // lives in exactly one place.
  const virtualQuest = useMemo(() => findVirtualQuestById(id ?? ''), [id]);
  const quest = virtualQuest ?? quests.find((q) => q.id === id);
  const isVirtual = virtualQuest != null;
  const questsRef = useRef(quests);
  useEffect(() => { questsRef.current = quests; }, [quests]);
  // Memoized — a fresh array literal here would invalidate useQuestScores'
  // memo and re-run full 548-day scoring on every render of this screen.
  const questList = useMemo(() => (quest ? [quest] : []), [quest]);
  const scores = useQuestScores(questList, habits, records, vacationSet, winOnlyWeekends, isFocused);
  const questScore = quest ? scores.byQuest.get(quest.id) : undefined;
  const linkedHabits = useMemo(
    () => habits.filter((h) => quest?.linkedHabitIds.includes(h.id)),
    [habits, quest],
  );
  // Success-level editing only applies to a tiered (quad-family) habit.
  const isQuadHabit = linkedHabits.length > 0 && isTieredMode(linkedHabits[0].recordingMode);

  // Hold while quests/scores load — otherwise a deep link flashes
  // "Quest not found" and scores flash 0 before the data arrives.
  if (questsLoading || recordsLoading) {
    return (
      <View style={[styles.root, styles.loadingRoot]}>
        {/* Dark screen — focused override keeps status-bar icons visible in
            light mode (the index's own override unmounts when it blurs). */}
        {isFocused && <StatusBar style="light" />}
        <ActivityIndicator size="large" color={QuestColors.flameMid} />
      </View>
    );
  }

  if (!quest) {
    // The latency-compensated listener removes the doc before deleteQuest's
    // await resolves — don't flash "Quest not found" mid-abandon.
    if (deleting) {
      return (
        <View style={[styles.root, styles.loadingRoot]}>
          <ActivityIndicator size="large" color={QuestColors.flameMid} />
        </View>
      );
    }
    return (
      <View style={styles.root}>
        {isFocused && <StatusBar style="light" />}
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <ThemedText style={styles.backText}>← Back</ThemedText>
        </Pressable>
        <ThemedText style={styles.notFound}>Quest not found.</ThemedText>
      </View>
    );
  }

  const template = quest.templateKey ? TEMPLATE_BY_KEY[quest.templateKey] : null;
  const categoryColor = QuestColors[quest.category] ?? QuestColors.custom;

  // Captured after the !quest guard above — keeps the async delete closure
  // free of non-null assertions.
  const q = quest;
  function confirmDelete() {
    Alert.alert(
      'Abandon quest?',
      `"${q.name}" will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Abandon',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            await deleteQuest(q.id);
            router.back();
          },
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
      {isFocused && <StatusBar style="light" />}
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

        {/* Expandable philosophy/inspiration — the "why" behind the quest. */}
        <QuestPhilosophy text={template?.philosophy ?? CUSTOM_QUEST_PHILOSOPHY} />

        {/* Score block. Single-window quests headline the window they're
            scored on and hide the other bar entirely. */}
        {(() => {
          const window = quest.scoreWindow ?? 'both';
          const is18 = window === '18mo';
          const headlineScore = (is18 ? questScore?.score18mo : questScore?.score) ?? 0;
          const headlineColor = is18 ? QuestColors.gold : flameColor(headlineScore);
          // Day counts for the scored window (18mo quests show their own run).
          const done = (is18 ? questScore?.completedDays18 : questScore?.completedDays) ?? 0;
          const goal = (is18 ? questScore?.targetDays18 : questScore?.targetDays) ?? 0;
          return (
            <View style={styles.scoreBlock}>
              <View style={styles.scoreRow}>
                <View style={styles.scoreMain}>
                  <ThemedText style={[styles.scoreBig, { color: headlineColor }]}>
                    {headlineScore}%
                  </ThemedText>
                  <ThemedText style={styles.scoreLabel}>
                    {is18 ? '18-MONTH SCORE' : '30-DAY SCORE'}
                  </ThemedText>
                </View>
                <View style={styles.scoreSide}>
                  <ThemedText style={styles.scoreDetail}>
                    {quest.targetDaysPerWeek}×/wk target ·{' '}
                    {questScore?.pointsEarned ?? 0}/{questScore?.pointsAvailable ?? questPointValue(quest).total} pts
                  </ThemedText>
                  {questScore && (
                    <ThemedText style={styles.scoreDetail}>
                      {quest.questType === 'reduce'
                        ? `${done} clean ${done === 1 ? 'day' : 'days'} · max ${quest.targetDaysPerWeek}×/wk`
                        : `${done} ${done === 1 ? 'day' : 'days'} done · ${goal} day goal`}
                    </ThemedText>
                  )}
                  {questScore != null && questScore.doubleDays > 0 && (
                    <ThemedText style={styles.doubleDetail}>
                      ★ {questScore.doubleDays} {questScore.doubleDays === 1 ? 'day' : 'days'} extra effort
                    </ThemedText>
                  )}
                  {questScore != null && questScore.idealDays > 0 && (
                    <ThemedText style={styles.doubleDetail}>
                      ★ {questScore.idealDays} ideal {questScore.idealDays === 1 ? 'day' : 'days'}
                    </ThemedText>
                  )}
                </View>
              </View>
              <ScoreBar
                score={headlineScore}
                height={8}
                color={is18 ? QuestColors.gold : undefined}
              />

              {window === 'both' && (
                <>
                  <View style={styles.scoreDivider} />
                  <View style={styles.score18Header}>
                    <ThemedText style={styles.scoreLabel}>18-MONTH AVERAGE</ThemedText>
                    <ThemedText style={[styles.score18Value, { color: QuestColors.gold }]}>
                      {questScore?.score18mo ?? 0}%
                    </ThemedText>
                  </View>
                  <ScoreBar score={questScore?.score18mo ?? 0} height={8} color={QuestColors.gold} />
                </>
              )}
            </View>
          );
        })()}

        {/* Linked habits. All-habit quests watch everything automatically and
            show the habit currently being counted — the highest scorer for
            this goal. */}
        {quest.allHabits ? (
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>TRACKING</ThemedText>
            {(() => {
              const best = habits.find((h) => h.id === questScore?.bestHabitId);
              return best ? (
                <View style={styles.habitRow}>
                  <View style={[styles.habitDot, { backgroundColor: best.color }]} />
                  <ThemedText style={styles.habitName}>{best.name}</ThemedText>
                  <ThemedText style={styles.habitMode}>{best.recordingMode}</ThemedText>
                </View>
              ) : (
                <ThemedText style={styles.dimText}>
                  No habit has reached this goal&apos;s bar yet.
                </ThemedText>
              );
            })()}
            <ThemedText style={styles.dimText}>
              Watches every habit automatically — showing your highest scorer
              for this goal. No linking needed.
            </ThemedText>
          </View>
        ) : (
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
                      // A quest must always track a habit (create enforces
                      // the same rule): unlinking to empty leaves a quest
                      // that tracks nothing — positive flatlines at 0 and
                      // reduce banks a perpetual 100%. Switch by tapping a
                      // different habit instead.
                      if (isLinked) {
                        Alert.alert(
                          'Linked habit required',
                          'A quest always tracks a habit. Tap a different habit to switch the link.',
                        );
                        return;
                      }
                      const next = [h.id];
                      // LINKING a tierless habit resets a goal/ideal bar (it
                      // could never be reached — the quest would silently
                      // zero out). Switching between tiered habits must NOT
                      // reset: the level survives the relink.
                      const linkingTierless = !isTieredMode(h.recordingMode);
                      if (linkingTierless && (quest.successLevel ?? 1) > 1) {
                        updateQuest(quest.id, { linkedHabitIds: next, successLevel: 1 });
                      } else {
                        updateQuest(quest.id, { linkedHabitIds: next });
                      }
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
                      // Replace, not append — quests link exactly one habit
                      // (same model as the toggle above).
                      updateQuest(questId, { linkedHabitIds: [habitId] });
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
        )}

        {/* Level of success. Challenges DEFINED by their tier (Hermes' Stride,
            The Golden Bough, …) show it locked — changing it would defeat the
            goal. Custom/base quests on a quad habit stay editable (editing
            just re-scores existing records, so it's reversible). */}
        {quest.questType === 'positive' && (template?.successLevel != null || isQuadHabit) && (() => {
          const locked = template?.successLevel != null;
          return (
            <View style={styles.section}>
              <ThemedText style={styles.sectionLabel}>LEVEL OF SUCCESS</ThemedText>
              <ThemedText style={styles.dimText}>
                {locked
                  ? 'Fixed for this challenge — the tier is the quest.'
                  : `Which tier of ${linkedHabits[0]?.name} counts as a win. Changing it just re-scores your existing records — nothing is lost.`}
              </ThemedText>
              <View style={styles.levelRow}>
                {([1, 2, 3] as const).map((lvl) => {
                  const active = (quest.successLevel ?? 1) === lvl;
                  return (
                    <Pressable
                      key={lvl}
                      disabled={locked}
                      style={[
                        styles.levelChip,
                        active && styles.levelChipActive,
                        locked && !active && styles.levelChipLocked,
                      ]}
                      onPress={() => updateQuest(quest.id, { successLevel: lvl })}>
                      <ThemedText style={[styles.levelChipText, active && styles.levelChipTextActive]}>
                        {lvl === 1 ? 'BASIC' : lvl === 2 ? 'GOAL' : 'IDEAL'}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {/* Actions. Always-on (virtual) challenges can't be edited or
            abandoned — there's no quest doc behind them. */}
        {!isVirtual && (
          <View style={styles.actions}>
            {/* Personal pacts reopen the create form in edit mode with every
                create-time field prefilled. */}
            {quest.templateKey === null && (
              <Pressable
                style={styles.editBtn}
                onPress={() => router.push(`/(tabs)/(quests)/create?editQuestId=${quest.id}`)}
              >
                <ThemedText style={styles.editBtnText}>EDIT PACT</ThemedText>
              </Pressable>
            )}
            <Pressable style={styles.deleteBtn} onPress={confirmDelete} disabled={deleting}>
              <ThemedText style={styles.deleteText}>
                {deleting ? 'Abandoning...' : 'ABANDON QUEST'}
              </ThemedText>
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
  loadingRoot: {
    justifyContent: 'center',
    alignItems: 'center',
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
  levelChipLocked: {
    opacity: 0.35,
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
  editBtn: {
    borderWidth: 1,
    borderColor: QuestColors.border,
    backgroundColor: QuestColors.surface,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: QuestColors.text,
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
