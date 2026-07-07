import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { ActivityIndicator, ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { QuestCard } from '@/components/quests/quest-card';
import { AscentSheet } from '@/components/quests/ascent-sheet';
import { ScoreBar, flameColor } from '@/components/quests/score-bar';
import { useQuests } from '@/hooks/use-quests';
import { useHabits } from '@/hooks/use-habits';
import { useTour, useTourTarget } from '@/contexts/tour-context';
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
import { runScoreWaypoint, ASCENT_BANDS } from '@/lib/quest-narrative';
import { useTodayDate } from '@/hooks/use-today-date';


export default function QuestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { quests, isLoading: questsLoading } = useQuests();
  const { habits } = useHabits();
  // Genesis-tour spotlight targets. The tour's quest step points at the first
  // unstarted Begin stub (the one-tap path); '+ NEW' stays registered as the
  // fallback for a user who already began every challenge.
  const forgeQuestRef = useTourTarget('forge-quest');
  const beginChallengeRef = useTourTarget('begin-challenge');
  const [ascentVisible, setAscentVisible] = useState(false);

  // While the tour spotlights the Begin stub (which lives INSIDE this
  // ScrollView), pin the list to the top and freeze scrolling — a flick
  // through the interactive spotlight hole could otherwise scroll the target
  // away, collapsing the hole into a full-screen dim with no way through.
  const { isActive: tourActive, steps: tourSteps, index: tourIndex } = useTour();
  const spotlightingStub = tourActive && tourSteps?.[tourIndex]?.target === 'begin-challenge';
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (spotlightingStub) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [spotlightingStub]);
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

  // The six trials are two 3-rung ladders — same climb, two windows.
  const trials30 = useMemo(() => autoQuests.filter((q) => q.scoreWindow === '30d'), [autoQuests]);
  const trials18 = useMemo(() => autoQuests.filter((q) => q.scoreWindow === '18mo'), [autoQuests]);

  // Trials score the single best habit for their bar — name it on the card
  // so score shifts aren't mysterious.
  const carriedBy = (questId: string): string | undefined => {
    const id = scores.byQuest.get(questId)?.bestHabitId;
    return id ? habits.find((h) => h.id === id)?.name : undefined;
  };

  // Tour target lands on the FIRST unstarted challenge stub.
  const firstStubKey = selectedChallenges.find((c) => !c.quest)?.template.key ?? null;


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
        <Pressable
          style={styles.headerRight}
          onPress={() => setAscentVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={`Run score ${scores.runScore} of ${scores.totalAvailable} points`}
          accessibilityHint="Opens the Ascent scoring guide"
        >
          <ThemedText style={[styles.runScore, { color: flameColor(scores.runPct) }]}>
            {scores.runScore}
          </ThemedText>
          <ThemedText style={styles.runScoreLabel}>RUN SCORE · MAX {scores.totalAvailable}</ThemedText>
        </Pressable>
        <Pressable
          ref={forgeQuestRef}
          style={styles.addButton}
          onPress={() => router.push('/(tabs)/(quests)/create')}
        >
          <ThemedText style={styles.addButtonText}>+ NEW</ThemedText>
        </Pressable>
      </View>

      {/* The run bar IS the band ladder — ticks mark the shore thresholds. */}
      <ScoreBar
        score={scores.runPct}
        showLabel={false}
        height={6}
        ticks={ASCENT_BANDS.filter((b) => b.min > 0).map((b) => b.min)}
      />

      {/* Ascent waypoint — current shore with the run %, and the next shore's
          fixed threshold. Taps open the full ladder + scoring explainer. */}
      {(() => {
        const wp = runScoreWaypoint(scores.runPct);
        return (
          <Pressable
            style={styles.waypointRow}
            onPress={() => setAscentVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`${wp.band}, ${scores.runPct}%`}
            accessibilityHint="Opens the Ascent scoring guide"
            hitSlop={{ top: 4, bottom: 10 }}
          >
            <ThemedText style={styles.waypointBand} numberOfLines={1}>
              {wp.band}
              <ThemedText style={styles.waypointPct}> · {scores.runPct}%</ThemedText>
            </ThemedText>
            <ThemedText style={styles.waypointNext}>
              {wp.next ? `next: ${wp.next.name} at ${wp.next.min}%  ›` : 'the highest shore  ›'}
            </ThemedText>
          </Pressable>
        );
      })()}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!spotlightingStub}
      >
        {/* CHALLENGES — the quests you choose. Started ones show their score;
            the rest show a "Begin" stub that links a habit + starts them. */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionHeader, { color: QuestColors.flameMid }]}>
            CHALLENGES
          </ThemedText>
          <ThemedText style={styles.sectionSub}>
            Ready-made quests. Begin one and link a habit.
          </ThemedText>
          {selectedChallenges.map(({ template, quest }) =>
            quest ? (
              <QuestCard
                key={template.key}
                quest={quest}
                questScore={scores.byQuest.get(quest.id)}
                kind="challenge"
                onPress={() => router.push(`/(tabs)/(quests)/${quest.id}`)}
              />
            ) : (
              <ChallengeStub
                key={template.key}
                template={template}
                targetRef={template.key === firstStubKey ? beginChallengeRef : undefined}
                onPress={() => router.push(`/(tabs)/(quests)/create?templateKey=${template.key}`)}
              />
            ),
          )}
        </View>

        {/* ETERNAL TRIALS — the always-on all-habit ladders. No Begin, no
            linking: they watch every habit automatically, forever. */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionHeader, { color: QuestColors.gold }]}>
            ETERNAL TRIALS
          </ThemedText>
          <ThemedText style={styles.sectionSub}>
            Always on. They watch every habit automatically, nothing to start.
          </ThemedText>

          <ThemedText style={styles.ladderHeader}>THE 30-DAY LADDER</ThemedText>
          <ThemedText style={styles.ladderSub}>
            Any habit, four days a week. Three rising bars.
          </ThemedText>
          {trials30.map((q) => (
            <QuestCard
              key={q.id}
              quest={q}
              questScore={scores.byQuest.get(q.id)}
              kind="trial"
              carriedBy={carriedBy(q.id)}
              onPress={() => router.push(`/(tabs)/(quests)/${q.id}`)}
            />
          ))}

          <ThemedText style={[styles.ladderHeader, styles.ladderHeaderGap]}>
            THE 18-MONTH LADDER
          </ThemedText>
          <ThemedText style={styles.ladderSub}>
            The same climb, held for eighteen months.
          </ThemedText>
          {trials18.map((q) => (
            <QuestCard
              key={q.id}
              quest={q}
              questScore={scores.byQuest.get(q.id)}
              kind="trial"
              carriedBy={carriedBy(q.id)}
              onPress={() => router.push(`/(tabs)/(quests)/${q.id}`)}
            />
          ))}
        </View>

        {/* Custom pacts + any legacy quests. Always rendered so "+ NEW" has a
            visible destination even before the first pact exists. */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionHeader, { color: QuestColors.custom }]}>
            YOUR PACTS
          </ThemedText>
          <ThemedText style={styles.sectionSub}>Quests you write yourself.</ThemedText>
          {otherQuests.length === 0 ? (
            <Pressable
              style={styles.emptyPactStub}
              onPress={() => router.push('/(tabs)/(quests)/create')}
              accessibilityRole="button"
              accessibilityLabel="No pacts yet. Forge one."
            >
              <ThemedText style={styles.emptyPactText}>
                No pacts yet. Forge one with + NEW ›
              </ThemedText>
            </Pressable>
          ) : (
            otherQuests.map((q) => (
              <QuestCard
                key={q.id}
                quest={q}
                questScore={scores.byQuest.get(q.id)}
                kind="pact"
                onPress={() => router.push(`/(tabs)/(quests)/${q.id}`)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <AscentSheet
        visible={ascentVisible}
        onClose={() => setAscentVisible(false)}
        runPct={scores.runPct}
        runScore={scores.runScore}
        totalAvailable={scores.totalAvailable}
      />
    </View>
  );
}

// A not-yet-started base challenge: dashed/dimmed card with a "Begin" tap that
// routes into the link-habit flow (with the template + matching auto-record
// habit pre-selected). `targetRef` lets the Genesis tour spotlight the first
// stub as the one-tap way to swear a quest.
function ChallengeStub({
  template,
  onPress,
  targetRef,
}: {
  template: QuestTemplate;
  onPress: () => void;
  targetRef?: Ref<View>;
}) {
  return (
    <Pressable ref={targetRef} style={styles.stubCard} onPress={onPress}>
      <View style={styles.stubHeader}>
        <ThemedText style={styles.stubName} numberOfLines={1}>
          {template.name}
        </ThemedText>
        <View style={styles.beginPill}>
          <ThemedText style={styles.beginText}>BEGIN ›</ThemedText>
        </View>
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
      <ThemedText style={styles.stubHint}>Links one habit. You choose which.</ThemedText>
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
  waypointRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  waypointBand: {
    fontSize: 12,
    fontWeight: '700',
    color: QuestColors.gold,
    letterSpacing: 0.5,
    // The band name yields before the tappable "next" label clips.
    flexShrink: 1,
    marginRight: 8,
  },
  waypointPct: {
    fontSize: 12,
    fontWeight: '700',
    color: QuestColors.textDim,
  },
  waypointNext: {
    fontSize: 11,
    color: QuestColors.textDim,
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
  },
  // One plain-words line naming what the section's quests ARE — the kind
  // distinction lives here, not in myth literacy.
  sectionSub: {
    fontSize: 11,
    color: QuestColors.textDim,
    marginBottom: 4,
  },
  ladderHeader: {
    fontSize: 9,
    fontWeight: '800',
    color: QuestColors.textDim,
    letterSpacing: 1.5,
  },
  ladderHeaderGap: {
    marginTop: 8,
  },
  ladderSub: {
    fontSize: 11,
    color: QuestColors.textDim,
    marginBottom: 2,
  },
  emptyPactStub: {
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  emptyPactText: {
    fontSize: 12,
    color: QuestColors.textDim,
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
  // BEGIN reads as a button, not a label — same pill treatment as "+ NEW".
  beginPill: {
    borderWidth: 1,
    borderColor: QuestColors.flameMid,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  stubHint: {
    fontSize: 10,
    color: QuestColors.textDim,
    opacity: 0.8,
  },
});
