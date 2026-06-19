import { Pressable, View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ScoreBar } from './score-bar';
import { QuestColors } from '@/constants/theme';
import { questPointValue } from '@/hooks/use-quest-scores';
import type { Quest } from '@/types/quest';
import type { QuestScore } from '@/hooks/use-quest-scores';

type Props = {
  quest: Quest;
  questScore: QuestScore | undefined;
  onPress: () => void;
};

export function QuestCard({ quest, questScore, onPress }: Props) {
  const score = questScore?.score ?? 0;
  const score18mo = questScore?.score18mo ?? 0;
  const doubleDays = questScore?.doubleDays ?? 0;
  const categoryColor = QuestColors[quest.category] ?? QuestColors.custom;
  const pointsEarned = questScore?.pointsEarned ?? 0;
  const pointsAvailable = questScore?.pointsAvailable ?? questPointValue(quest).total;

  // VoiceOver label — the card is icon/color/bar heavy, so spell out name,
  // category, enforced level, and progress for screen readers.
  const level = questScore?.effectiveSuccessLevel ?? quest.successLevel ?? 1;
  const levelLabel = level === 3 ? 'ideal' : level === 2 ? 'goal' : 'basic';
  const a11yLabel =
    `${quest.name}, ${quest.category} quest, ${levelLabel} level. ` +
    `${quest.targetDaysPerWeek}× per week. ${pointsEarned} of ${pointsAvailable} points earned.`;

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      <View style={styles.header}>
        <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
        <ThemedText style={styles.name} numberOfLines={1}>
          {quest.name}
        </ThemedText>
        {/* Badge the bar that's actually ENFORCED — the legacy tierless-link
            fallback can score a stored goal/ideal quest at basic. */}
        {(questScore?.effectiveSuccessLevel ?? quest.successLevel ?? 1) >= 2 && (
          <View style={styles.levelBadge}>
            <ThemedText style={styles.levelText}>
              {(questScore?.effectiveSuccessLevel ?? quest.successLevel) === 3 ? 'IDEAL' : 'GOAL'}
            </ThemedText>
          </View>
        )}
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
      {/* The mythic names alone aren't recognizable — keep the description
          on active cards. Wraps; never truncates to an ellipsis. */}
      {!!quest.description && (
        <ThemedText style={styles.description}>{quest.description}</ThemedText>
      )}
      {/* Single-window quests show only the bar they're scored on. */}
      {(quest.scoreWindow ?? 'both') !== '18mo' && (
        <View style={styles.barRow}>
          <ThemedText style={styles.barLabel}>30D</ThemedText>
          <View style={styles.barFill}>
            <ScoreBar score={score} height={5} />
          </View>
        </View>
      )}
      {(quest.scoreWindow ?? 'both') !== '30d' && (
        <View style={styles.barRow}>
          <ThemedText style={styles.barLabel}>18MO</ThemedText>
          <View style={styles.barFill}>
            <ScoreBar score={score18mo} height={5} color={QuestColors.gold} />
          </View>
        </View>
      )}
      <View style={styles.meta}>
        <ThemedText style={styles.metaText}>
          {quest.targetDaysPerWeek}×/wk · {pointsEarned}/{pointsAvailable} pts
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  description: {
    fontSize: 12,
    color: QuestColors.textDim,
    fontStyle: 'italic',
    marginTop: -2,
  },
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
  levelBadge: {
    backgroundColor: QuestColors.goldDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  levelText: {
    fontSize: 10,
    fontWeight: '700',
    color: QuestColors.gold,
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
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: QuestColors.textDim,
    letterSpacing: 0.5,
    width: 30,
  },
  barFill: {
    flex: 1,
  },
  meta: {
    flexDirection: 'row',
  },
  metaText: {
    fontSize: 11,
    color: QuestColors.textDim,
  },
});
