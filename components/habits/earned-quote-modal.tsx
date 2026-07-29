import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { QuestColors } from '@/constants/theme';
import type { PendingEarnedQuote } from '@/lib/earned-quotes';

/**
 * Milestone reveal: every 10 distinct days of use earns the next quote in the
 * collection (constants/earned-quotes.ts). Styled after the Genesis tour
 * callout — same underworld dim, surface card, flame eyebrow, and left-accent
 * quote block — so the reveal reads as part of the same world.
 */
export function EarnedQuoteModal({
  pending,
  onClose,
}: {
  pending: PendingEarnedQuote | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={pending != null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {pending && (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>MILESTONE</Text>
            <Text style={styles.title}>
              {pending.activeDays} days on the path.
            </Text>
            <Text style={styles.body}>
              You keep showing up, and the road keeps rising to meet you. You&apos;ve earned a
              new quote for the climb.
            </Text>
            <View style={styles.quoteBlock}>
              <Text style={styles.quoteText}>“{pending.quote.text}”</Text>
              <Text style={styles.quoteSource}>{pending.quote.source}</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.cta}
              accessibilityRole="button"
              accessibilityLabel="Continue"
            >
              <Text style={styles.ctaText}>Carry on ›</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,6,18,0.82)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: QuestColors.surface,
    borderColor: QuestColors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    color: QuestColors.flameHigh,
  },
  title: {
    marginTop: 8,
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 27,
    color: QuestColors.text,
  },
  body: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: QuestColors.text,
    opacity: 0.92,
  },
  quoteBlock: {
    marginTop: 14,
    borderLeftWidth: 2,
    borderLeftColor: QuestColors.flameMid,
    paddingLeft: 12,
  },
  quoteText: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
    color: QuestColors.text,
  },
  quoteSource: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: QuestColors.textDim,
  },
  cta: {
    marginTop: 16,
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: QuestColors.flameMid,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
});
