import { Pressable, View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ScoreBar } from './score-bar';
import { QuestColors } from '@/constants/theme';
import { CATEGORY_NAMES } from '@/constants/quest-templates';
import type { Quest } from '@/types/quest';
import type { QuestScore } from '@/hooks/use-quest-scores';

type Props = {
  quest: Quest;
  questScore: QuestScore | undefined;
  onPress: () => void;
};

export function QuestCard({ quest, questScore, onPress }: Props) {
  const score = questScore?.score ?? 0;
  const doubleDays = questScore?.doubleDays ?? 0;
  const categoryColor = QuestColors[quest.category] ?? QuestColors.custom;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
        <ThemedText style={styles.name} numberOfLines={1}>
          {quest.name}
        </ThemedText>
        {quest.questType === 'reduce' && (
          <View style={styles.reduceBadge}>
            <ThemedText style={styles.reduceText}>REDUCE</ThemedText>
          </View>
        )}
        {doubleDays > 0 && (
          <View style={styles.doubleBadge}>
            <ThemedText style={styles.doubleText}>★×{doubleDays}</ThemedText>
          </View>
        )}
      </View>
      <ScoreBar score={score} height={5} />
      <View style={styles.meta}>
        <ThemedText style={styles.metaText}>
          {quest.targetDaysPerWeek}×/wk · {CATEGORY_NAMES[quest.category]}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: QuestColors.surface,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: QuestColors.text,
  },
  reduceBadge: {
    backgroundColor: QuestColors.goldDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  reduceText: {
    fontSize: 10,
    fontWeight: '700',
    color: QuestColors.reduce,
    letterSpacing: 0.5,
  },
  doubleBadge: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  doubleText: {
    fontSize: 11,
    color: QuestColors.gold,
    fontWeight: '700',
  },
  meta: {
    flexDirection: 'row',
  },
  metaText: {
    fontSize: 11,
    color: QuestColors.textDim,
  },
});
