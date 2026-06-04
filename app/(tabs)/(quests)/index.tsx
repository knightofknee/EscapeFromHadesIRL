import { useMemo } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { QuestCard } from '@/components/quests/quest-card';
import { ScoreBar } from '@/components/quests/score-bar';
import { useQuests } from '@/hooks/use-quests';
import { useHabits } from '@/hooks/use-habits';
import { useQuestScores } from '@/hooks/use-quest-scores';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { useWinOnlyWeekends } from '@/hooks/use-win-only-weekends';
import { useRecordsSnapshot } from '@/hooks/use-records-snapshot';
import { QuestColors } from '@/constants/theme';
import {
  CATEGORY_NAMES,
  QUEST_TEMPLATES,
  type QuestTemplate,
} from '@/constants/quest-templates';
import { formatDate } from '@/lib/date-utils';

// 18-month window for the long-term quest average. Fetched one-shot on focus
// (not a live listener) — see useRecordsSnapshot. The 30-day score is derived
// from the same data inside useQuestScores.
function get18MonthWindow() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 548);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

export default function QuestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { quests } = useQuests();
  const { habits } = useHabits();
  const { startDate, endDate } = useMemo(get18MonthWindow, []);
  const records = useRecordsSnapshot(startDate, endDate, isFocused);
  const { dateSet: vacationSet } = useVacationDays();
  const { winOnlyWeekends } = useWinOnlyWeekends();
  const scores = useQuestScores(quests, habits, records, vacationSet, winOnlyWeekends, isFocused);

  // Base challenges: always shown, in template order. Each maps to its active
  // quest (if started) or null (→ a "Begin" stub).
  const baseChallenges = useMemo(
    () =>
      QUEST_TEMPLATES.map((t) => ({
        template: t,
        quest:
          quests.find((q) => q.status === 'active' && q.templateKey === t.key) ?? null,
      })),
    [quests],
  );
  // Everything that isn't a base challenge: custom quests + any legacy
  // template quests whose template is no longer in the base set.
  const baseKeys = useMemo(() => new Set(QUEST_TEMPLATES.map((t) => t.key)), []);
  const otherQuests = useMemo(
    () => quests.filter((q) => !(q.templateKey && baseKeys.has(q.templateKey))),
    [quests, baseKeys],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      {/* Only apply the light-content override when this tab is focused.
          Tab screens stay mounted; without the guard, white status-bar icons
          would leak to light-mode screens in other tabs and become invisible. */}
      {isFocused && <StatusBar style="light" />}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ThemedText style={styles.headerTitle}>QUESTS</ThemedText>
          <ThemedText style={styles.headerSub}>30-day run</ThemedText>
        </View>
        <View style={styles.headerRight}>
          <ThemedText style={[styles.runScore, { color: scores.runScore >= 80 ? QuestColors.flameHigh : scores.runScore >= 50 ? QuestColors.flameMid : QuestColors.flameLow }]}>
            {scores.runScore}
          </ThemedText>
          <ThemedText style={styles.runScoreLabel}>RUN SCORE</ThemedText>
        </View>
        <Pressable style={styles.addButton} onPress={() => router.push('/(tabs)/(quests)/create')}>
          <ThemedText style={styles.addButtonText}>+ NEW</ThemedText>
        </Pressable>
      </View>

      <ScoreBar score={scores.runScore} showLabel={false} height={3} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Base challenges — always shown. Started ones show their score;
            the rest show a "Begin" stub that links a habit + starts them. */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionHeader, { color: QuestColors.flameMid }]}>
            CHALLENGES
          </ThemedText>
          {baseChallenges.map(({ template, quest }) =>
            quest ? (
              <QuestCard
                key={template.key}
                quest={quest}
                questScore={scores.byQuest.get(quest.id)}
                onPress={() => router.push(`/(tabs)/(quests)/${quest.id}`)}
              />
            ) : (
              <ChallengeStub
                key={template.key}
                template={template}
                onPress={() => router.push(`/(tabs)/(quests)/create?templateKey=${template.key}`)}
              />
            ),
          )}
        </View>

        {/* Custom pacts + any legacy quests */}
        {otherQuests.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={[styles.sectionHeader, { color: QuestColors.custom }]}>
              YOUR PACTS
            </ThemedText>
            {otherQuests.map((q) => (
              <QuestCard
                key={q.id}
                quest={q}
                questScore={scores.byQuest.get(q.id)}
                onPress={() => router.push(`/(tabs)/(quests)/${q.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// A not-yet-started base challenge: dashed/dimmed card with a "Begin" tap that
// routes into the link-habit flow (with the template + matching auto-record
// habit pre-selected).
function ChallengeStub({
  template,
  onPress,
}: {
  template: QuestTemplate;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.stubCard} onPress={onPress}>
      <View style={styles.stubHeader}>
        <ThemedText style={styles.stubName} numberOfLines={1}>
          {template.name}
        </ThemedText>
        <ThemedText style={styles.beginText}>BEGIN ›</ThemedText>
      </View>
      <ThemedText style={styles.stubDesc} numberOfLines={1}>
        {template.description}
      </ThemedText>
      <ThemedText style={styles.stubMeta}>
        {template.targetDaysPerWeek}×/wk · {CATEGORY_NAMES[template.category]}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: QuestColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: QuestColors.text,
    letterSpacing: 2,
  },
  headerSub: {
    fontSize: 11,
    color: QuestColors.textDim,
    letterSpacing: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  runScore: {
    fontSize: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    lineHeight: 38,
  },
  runScoreLabel: {
    fontSize: 9,
    color: QuestColors.textDim,
    letterSpacing: 1.5,
  },
  addButton: {
    backgroundColor: QuestColors.surface,
    borderWidth: 1,
    borderColor: QuestColors.flameMid,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: QuestColors.flameMid,
    letterSpacing: 1,
  },
  scroll: {
    flex: 1,
    marginTop: 10,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  stubCard: {
    backgroundColor: QuestColors.surface,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  stubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stubName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: QuestColors.text,
  },
  beginText: {
    fontSize: 11,
    fontWeight: '800',
    color: QuestColors.flameMid,
    letterSpacing: 0.5,
  },
  stubDesc: {
    fontSize: 12,
    color: QuestColors.textDim,
    fontStyle: 'italic',
  },
  stubMeta: {
    fontSize: 11,
    color: QuestColors.textDim,
  },
});
