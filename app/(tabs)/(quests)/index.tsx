import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { QuestCard } from '@/components/quests/quest-card';
import { ScoreBar, flameColor } from '@/components/quests/score-bar';
import { useQuests } from '@/hooks/use-quests';
import { useHabits } from '@/hooks/use-habits';
import { useQuestScores, questPointValue } from '@/hooks/use-quest-scores';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { useWinOnlyWeekends } from '@/hooks/use-win-only-weekends';
import { useRecordsSnapshot } from '@/hooks/use-records-snapshot';
import { QuestColors } from '@/constants/theme';
import {
  QUEST_TEMPLATES,
  TEMPLATE_BY_KEY,
  getVirtualQuests,
  type QuestTemplate,
} from '@/constants/quest-templates';
import { get18MonthWindow } from '@/lib/date-utils';
import { useTodayDate } from '@/hooks/use-today-date';


export default function QuestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { quests, isLoading: questsLoading } = useQuests();
  const { habits } = useHabits();
  const { todayStr } = useTodayDate();
  const { startDate, endDate } = useMemo(() => get18MonthWindow(todayStr), [todayStr]);
  const { records, isLoading: recordsLoading } = useRecordsSnapshot(startDate, endDate, isFocused);
  const { dateSet: vacationSet } = useVacationDays();
  const { winOnlyWeekends } = useWinOnlyWeekends();

  // All-habit challenges are ALWAYS-ON: no Begin, no quest doc — each is a
  // synthesized virtual quest that tracks every habit automatically. Any
  // legacy started docs for these templates are ignored (the virtual
  // replaces them) so nothing double-counts.
  const autoQuests = useMemo(() => getVirtualQuests(), []);
  const singleInstanceKeys = useMemo(
    () => new Set(QUEST_TEMPLATES.map((t) => t.key)),
    [],
  );
  // Score exactly what renders. Base templates show ONE card each (the first
  // active doc) — data from before the duplicate-Begin guard can hold extra
  // active copies of a template, which must not silently inflate the run
  // score as invisible, unabandonable quests.
  const scoredQuests = useMemo(() => {
    const firstActivePerTemplate = new Map<string, string>();
    for (const q of quests) {
      if (
        q.status === 'active' &&
        q.templateKey &&
        singleInstanceKeys.has(q.templateKey) &&
        !firstActivePerTemplate.has(q.templateKey)
      ) {
        firstActivePerTemplate.set(q.templateKey, q.id);
      }
    }
    return [
      ...quests.filter((q) => {
        if (q.templateKey && TEMPLATE_BY_KEY[q.templateKey]?.allHabits) return false;
        if (q.templateKey && singleInstanceKeys.has(q.templateKey)) {
          return firstActivePerTemplate.get(q.templateKey) === q.id;
        }
        return true;
      }),
      ...autoQuests,
    ];
  }, [quests, autoQuests, singleInstanceKeys]);
  const scores = useQuestScores(scoredQuests, habits, records, vacationSet, winOnlyWeekends, isFocused);

  // CHALLENGES (top section): the curated base templates you opt into.
  // Each maps to its active quest (if started) or null (→ a "Begin" stub
  // that links a habit of the right type). The always-on all-habit quests
  // live in their own ETERNAL TRIALS section.
  const selectedChallenges = useMemo(
    () =>
      QUEST_TEMPLATES.filter((t) => !t.allHabits).map((t) => ({
        template: t,
        quest: quests.find((q) => q.status === 'active' && q.templateKey === t.key) ?? null,
      })),
    [quests],
  );
  // Everything that isn't a base challenge: custom pacts + any legacy
  // template quests whose template is no longer in the base set.
  const otherQuests = useMemo(
    () => quests.filter((q) => !(q.templateKey && singleInstanceKeys.has(q.templateKey))),
    [quests, singleInstanceKeys],
  );


  // Hold until quests and the score history arrive — otherwise started
  // quests flash as "Begin" stubs and the run score flashes 0. Keeps the
  // quests theme (dark background) rather than the themed LoadingScreen.
  if (questsLoading || recordsLoading) {
    return (
      <View style={[styles.root, styles.loadingRoot, { paddingTop: insets.top + 8 }]}>
        {isFocused && <StatusBar style="light" />}
        <ActivityIndicator size="large" color={QuestColors.flameMid} />
      </View>
    );
  }

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
          <ThemedText style={styles.headerSub}>Current run</ThemedText>
        </View>
        <View style={styles.headerRight}>
          <ThemedText style={[styles.runScore, { color: flameColor(scores.runPct) }]}>
            {scores.runScore}
          </ThemedText>
          <ThemedText style={styles.runScoreLabel}>RUN SCORE · MAX {scores.totalAvailable}</ThemedText>
        </View>
        <Pressable style={styles.addButton} onPress={() => router.push('/(tabs)/(quests)/create')}>
          <ThemedText style={styles.addButtonText}>+ NEW</ThemedText>
        </Pressable>
      </View>

      <ScoreBar score={scores.runPct} showLabel={false} height={3} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* CHALLENGES — the quests you choose. Started ones show their score;
            the rest show a "Begin" stub that links a habit + starts them. */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionHeader, { color: QuestColors.flameMid }]}>
            CHALLENGES
          </ThemedText>
          {selectedChallenges.map(({ template, quest }) =>
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

        {/* ETERNAL TRIALS — the always-on all-habit ladder. No Begin, no
            linking: they watch every habit automatically, forever. */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionHeader, { color: QuestColors.gold }]}>
            ETERNAL TRIALS
          </ThemedText>
          {autoQuests.map((q) => (
            <QuestCard
              key={q.id}
              quest={q}
              questScore={scores.byQuest.get(q.id)}
              onPress={() => router.push(`/(tabs)/(quests)/${q.id}`)}
            />
          ))}
        </View>

        {/* Custom pacts + any legacy quests. "+ NEW" in the header is the
            create entry point. */}
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
      {/* Wraps — never truncate the description to an ellipsis. */}
      <ThemedText style={styles.stubDesc}>
        {template.description}
      </ThemedText>
      <ThemedText style={styles.stubMeta}>
        {`${template.targetDaysPerWeek}×/wk${
          template.scoreWindow === '18mo'
            ? ' · 18-month'
            : template.scoreWindow === '30d'
              ? ' · 30-day'
              : ''
        } · worth ${questPointValue(template).total} pts`}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    justifyContent: 'center',
    alignItems: 'center',
  },
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
