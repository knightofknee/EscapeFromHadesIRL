import { Modal, Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { QuestColors } from '@/constants/theme';
import { ASCENT_BANDS } from '@/lib/quest-narrative';
import { flameColor } from './score-bar';

type Props = {
  visible: boolean;
  onClose: () => void;
  runPct: number;
  runScore: number;
  totalAvailable: number;
};

// Plain-words scoring explainer. Everything here describes math that already
// exists in use-quest-scores.ts — this sheet only names it.
const HOW_LINES = [
  'Every active quest is worth points, set by its weekly commitment and its tier. Participation ×1, goal ×2, ideal ×4.',
  'Your run score is the share of those points your rolling averages currently hold. Points drift with the averages. They are held, not banked.',
  'The 18-month window is worth six times the month. The long road dominates.',
  'The 18-month bars count the full window, even the time before you started. They fill as your history grows.',
  'Beginning a new quest raises your MAX, so your percent can dip at first. That is the cost of ambition, not a penalty.',
];

/**
 * "THE ASCENT" — tappable from the quests header. Shows the four shores as a
 * ladder with your position, then how the run is scored, in plain words.
 */
export function AscentSheet({ visible, onClose, runPct, runScore, totalAvailable }: Props) {
  // Highest band whose threshold is met = where you stand.
  let currentIdx = 0;
  for (let i = 0; i < ASCENT_BANDS.length; i++) {
    if (runPct >= ASCENT_BANDS[i].min) currentIdx = i;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText style={styles.title}>THE ASCENT</ThemedText>
            <ThemedText style={styles.subtitle}>
              Your run score is {runScore} of {totalAvailable} points. That is{' '}
              <ThemedText style={[styles.subtitlePct, { color: flameColor(runPct) }]}>
                {runPct}%
              </ThemedText>{' '}
              of the climb.
            </ThemedText>

            {/* The four shores, top of the mountain first. */}
            <View style={styles.ladder}>
              {[...ASCENT_BANDS].reverse().map((band) => {
                const idx = ASCENT_BANDS.findIndex((b) => b.name === band.name);
                const reached = idx <= currentIdx;
                const current = idx === currentIdx;
                return (
                  <View
                    key={band.name}
                    style={[styles.bandRow, current && styles.bandRowCurrent]}
                  >
                    <ThemedText
                      style={[
                        styles.bandThreshold,
                        reached && styles.bandThresholdReached,
                      ]}
                    >
                      {band.min}%
                    </ThemedText>
                    <ThemedText
                      style={[styles.bandName, reached && styles.bandNameReached]}
                      numberOfLines={1}
                    >
                      {band.name}
                    </ThemedText>
                    {current && (
                      <ThemedText style={styles.youAreHere}>you are here</ThemedText>
                    )}
                  </View>
                );
              })}
            </View>

            <ThemedText style={styles.howLabel}>HOW THE RUN IS SCORED</ThemedText>
            {HOW_LINES.map((line) => (
              <ThemedText key={line} style={styles.howLine}>
                {line}
              </ThemedText>
            ))}

            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <ThemedText style={styles.closeText}>Back to the climb</ThemedText>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: QuestColors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: QuestColors.border,
    maxHeight: '85%',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: QuestColors.text,
    letterSpacing: 2,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: QuestColors.textDim,
    textAlign: 'center',
    lineHeight: 19,
  },
  subtitlePct: {
    fontSize: 13,
    fontWeight: '800',
  },
  ladder: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: QuestColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: QuestColors.border,
  },
  bandRowCurrent: {
    backgroundColor: QuestColors.goldDim,
  },
  bandThreshold: {
    width: 38,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    color: QuestColors.textDim,
  },
  bandThresholdReached: {
    color: QuestColors.gold,
  },
  bandName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: QuestColors.textDim,
  },
  bandNameReached: {
    color: QuestColors.text,
  },
  youAreHere: {
    fontSize: 10,
    fontWeight: '700',
    color: QuestColors.gold,
    letterSpacing: 0.5,
  },
  howLabel: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: '800',
    color: QuestColors.textDim,
    letterSpacing: 1.5,
  },
  howLine: {
    fontSize: 13,
    color: QuestColors.text,
    lineHeight: 19,
    opacity: 0.9,
  },
  closeBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: QuestColors.border,
    backgroundColor: QuestColors.surface,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeText: {
    fontSize: 13,
    fontWeight: '700',
    color: QuestColors.text,
    letterSpacing: 0.5,
  },
});
