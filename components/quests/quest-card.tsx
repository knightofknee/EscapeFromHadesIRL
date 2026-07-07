import { Pressable, View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ScoreBar } from './score-bar';
import { QuestColors } from '@/constants/theme';
import { questPointValue } from '@/hooks/use-quest-scores';
import type { Quest } from '@/types/quest';
import type { QuestScore } from '@/hooks/use-quest-scores';

/** The three quest kinds — the card's left accent stripe and a11y wording
 *  bind each card to its section's identity. */
export type QuestKind = 'challenge' | 'trial' | 'pact';

export const KIND_COLOR: Record<QuestKind, string> = {
  challenge: QuestColors.flameMid,
  trial: QuestColors.gold,
  pact: QuestColors.custom,
};

const KIND_WORD: Record<QuestKind, string> = {
  challenge: 'challenge',
  trial: 'eternal trial',
  pact: 'pact',
};

const ROMAN = ['', 'I', 'II', 'III'];

/** Bronze / silver / gold — self-ordering without myth literacy. */
const TIER = {
  1: { label: 'PARTICIPATION', color: QuestColors.tierPart, bg: QuestColors.tierPartDim },
  2: { label: 'GOAL', color: QuestColors.tierGoal, bg: QuestColors.tierGoalDim },
  3: { label: 'IDEAL', color: QuestColors.tierIdeal, bg: QuestColors.tierIdealDim },
} as const;

type Props = {
  quest: Quest;
  questScore: QuestScore | undefined;
  onPress: () => void;
  kind: QuestKind;
  /** Habit name an all-habit trial is currently counting (its best scorer). */
  carriedBy?: string;
};

export function QuestCard({ quest, questScore, onPress, kind, carriedBy }: Props) {
  const score = questScore?.score ?? 0;
  const score18mo = questScore?.score18mo ?? 0;
  const doubleDays = questScore?.doubleDays ?? 0;
  const pointsEarned = questScore?.pointsEarned ?? 0;
  const pointsAvailable = questScore?.pointsAvailable ?? questPointValue(quest).total;
  const missingHabit = questScore?.missingHabit ?? false;

  // Badge the bar that's actually ENFORCED — the legacy tierless-link
  // fallback can score a stored goal/ideal quest at basic.
  const level = (questScore?.effectiveSuccessLevel ?? quest.successLevel ?? 1) as 1 | 2 | 3;
  const tier = quest.questType === 'positive' ? TIER[level] ?? TIER[1] : null;
  // Trials are two 3-rung ladders; the rung numeral IS the tier.
  const rung = kind === 'trial' ? ROMAN[level] : null;

  // VoiceOver label — the card is icon/color/bar heavy, so spell out name,
  // kind, enforced tier, and progress for screen readers.
  const levelLabel = level === 3 ? 'ideal' : level === 2 ? 'goal' : 'participation';
  const a11yLabel = missingHabit
    ? `${quest.name}, ${KIND_WORD[kind]}. Linked habit missing, tap to relink.`
    : `${quest.name}, ${KIND_WORD[kind]}, ${levelLabel} tier. ` +
      `${quest.targetDaysPerWeek}× per week. ${pointsEarned} of ${pointsAvailable} points earned.`;

  return (
    <Pressable
      style={[styles.card, { borderLeftColor: KIND_COLOR[kind] }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      <View style={styles.header}>
        {rung ? (
          <ThemedText style={[styles.rung, { color: tier?.color ?? QuestColors.textDim }]}>
            {rung}
          </ThemedText>
        ) : (
          <View style={[styles.categoryDot, { backgroundColor: QuestColors[quest.category] ?? QuestColors.custom }]} />
        )}
        <ThemedText style={styles.name} numberOfLines={1}>
          {quest.name}
        </ThemedText>
        {tier && (
          <View style={[styles.tierBadge, { backgroundColor: tier.bg }]}>
            <ThemedText style={[styles.tierText, { color: tier.color }]}>{tier.label}</ThemedText>
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
      {missingHabit ? (
        // Broken link: bars and points are meaningless (the quest tracks
        // nothing and is excluded from run totals) — say so and route to fix.
        <ThemedText style={styles.missingText}>
          Linked habit missing. Tap to relink.
        </ThemedText>
      ) : (
        <>
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
                <ScoreBar score={score18mo} height={5} color={QuestColors.styx} />
              </View>
            </View>
          )}
          <View style={styles.meta}>
            <ThemedText style={styles.metaText}>
              {quest.targetDaysPerWeek}×/wk · {pointsEarned}/{pointsAvailable} pts
              {carriedBy ? ` · carried by ${carriedBy}` : ''}
            </ThemedText>
          </View>
        </>
      )}
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
    borderLeftWidth: 3,
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
  rung: {
    fontSize: 12,
    fontWeight: '800',
    width: 16,
    textAlign: 'center',
    flexShrink: 0,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: QuestColors.text,
  },
  reduceBadge: {
    backgroundColor: QuestColors.reduceDim,
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
  tierBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
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
  missingText: {
    fontSize: 12,
    color: QuestColors.reduce,
    fontWeight: '600',
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
