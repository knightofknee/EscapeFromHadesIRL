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
import { useHabitRecords } from '@/hooks/use-habit-records';
import { useQuestScores } from '@/hooks/use-quest-scores';
import { QuestColors } from '@/constants/theme';
import { CATEGORY_NAMES, FOUNDATION_KEYS, TEMPLATE_BY_KEY } from '@/constants/quest-templates';
import { formatDate } from '@/lib/date-utils';
import type { QuestCategory } from '@/types/quest';

const CATEGORY_ORDER: QuestCategory[] = ['physical', 'mental', 'creative', 'wellness', 'custom'];

function get30DayWindow() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

export default function QuestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { quests, isLoading: questsLoading } = useQuests();
  const { habits } = useHabits();
  const { startDate, endDate } = useMemo(get30DayWindow, []);
  const { records } = useHabitRecords(startDate, endDate);
  const scores = useQuestScores(quests, habits, records);

  // Group quests by category, preserving order
  const grouped = useMemo(() => {
    const map = new Map<QuestCategory, typeof quests>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const q of quests) {
      map.get(q.category)?.push(q);
    }
    return map;
  }, [quests]);

  // Foundation status: which of the 3 are active
  const activeTemplateKeys = useMemo(
    () => new Set(quests.filter((q) => q.templateKey).map((q) => q.templateKey as string)),
    [quests],
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

      {/* Foundation row */}
      <View style={styles.foundationRow}>
        <ThemedText style={styles.foundationLabel}>FOUNDATION</ThemedText>
        <View style={styles.foundationPips}>
          {FOUNDATION_KEYS.map((key) => {
            const active = activeTemplateKeys.has(key);
            const template = TEMPLATE_BY_KEY[key];
            return (
              <View
                key={key}
                style={[styles.foundationPip, { borderColor: active ? QuestColors.gold : QuestColors.border }]}>
                <ThemedText style={[styles.foundationPipText, { color: active ? QuestColors.gold : QuestColors.textDim }]}>
                  {template?.name.split(' ')[0].toUpperCase()}
                </ThemedText>
              </View>
            );
          })}
          {scores.foundationCount > 0 && (
            <ThemedText style={styles.foundationBonus}>+{scores.foundationCount * 5}%</ThemedText>
          )}
        </View>
      </View>

      <ScoreBar score={scores.runScore} showLabel={false} height={3} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {questsLoading ? (
          <ThemedText style={styles.emptyText}>Loading...</ThemedText>
        ) : quests.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyTitle}>No active quests.</ThemedText>
            <ThemedText style={styles.emptyText}>
              Begin with the three foundations: walk, meditate, read. Each run starts anew. Link your
              existing habits to track progress.
            </ThemedText>
          </View>
        ) : (
          CATEGORY_ORDER.map((cat) => {
            const catQuests = grouped.get(cat) ?? [];
            if (catQuests.length === 0) return null;
            return (
              <View key={cat} style={styles.section}>
                <ThemedText style={[styles.sectionHeader, { color: QuestColors[cat] }]}>
                  {CATEGORY_NAMES[cat].toUpperCase()}
                </ThemedText>
                {catQuests.map((q) => (
                  <QuestCard
                    key={q.id}
                    quest={q}
                    questScore={scores.byQuest.get(q.id)}
                    onPress={() => router.push(`/(tabs)/(quests)/${q.id}`)}
                  />
                ))}
              </View>
            );
          })
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
  foundationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  foundationLabel: {
    fontSize: 9,
    color: QuestColors.textDim,
    letterSpacing: 1.5,
  },
  foundationPips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  foundationPip: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  foundationPipText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  foundationBonus: {
    fontSize: 11,
    color: QuestColors.gold,
    fontWeight: '700',
    marginLeft: 4,
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
  emptyState: {
    paddingTop: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: QuestColors.text,
  },
  emptyText: {
    fontSize: 14,
    color: QuestColors.textDim,
    lineHeight: 20,
  },
});
