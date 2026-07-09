import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { QuestColors } from '@/constants/theme';

type Props = {
  score: number; // 0-100
  showLabel?: boolean;
  height?: number;
  /** Override the score-based flame color (e.g. styx for 18-month bars). */
  color?: string;
};

/** Flame color thresholds for a 0-100 score — one product decision, one
 * definition (bars, headline numbers, run score all use this). */
export function flameColor(score: number): string {
  if (score >= 80) return QuestColors.flameHigh;
  if (score >= 50) return QuestColors.flameMid;
  return QuestColors.ember;
}

export function ScoreBar({ score, showLabel = true, height = 6, color: colorOverride }: Props) {
  const color = colorOverride ?? flameColor(score);
  const pct = Math.max(0, Math.min(100, score));

  return (
    <View style={styles.container}>
      <View style={[styles.track, { height }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color, height }]} />
      </View>
      {showLabel && (
        <ThemedText style={[styles.label, { color }]}>{score}%</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    flex: 1,
    backgroundColor: QuestColors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    width: 36,
    textAlign: 'right',
  },
});
