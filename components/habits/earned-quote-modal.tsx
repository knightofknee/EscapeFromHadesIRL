import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { QuestColors } from '@/constants/theme';
import type { PendingEarnedQuote } from '@/lib/earned-quotes';

/**
 * Milestone quote reveal: every 10 distinct days of use surfaces the next
 * quote in constants/earned-quotes.ts.
 *
 * DELIBERATELY just the quote. No headline, no body copy, no "you've
 * earned..." framing — the quote is the value, everything else is the app
 * narrating itself and wasting the user's time (explicit feedback). The day
 * count rides as a one-word eyebrow for context. Tap anywhere dismisses.
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
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss quote"
      >
        {pending && (
          <Pressable style={styles.card} onPress={onClose}>
            <Text style={styles.eyebrow}>DAY {pending.activeDays}</Text>
            <Text style={styles.quoteText}>“{pending.quote.text}”</Text>
            <Text style={styles.quoteSource}>{pending.quote.source}</Text>
          </Pressable>
        )}
      </Pressable>
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
    borderLeftWidth: 2,
    borderLeftColor: QuestColors.flameMid,
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
  quoteText: {
    marginTop: 10,
    fontSize: 17,
    lineHeight: 25,
    fontStyle: 'italic',
    color: QuestColors.text,
  },
  quoteSource: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: QuestColors.textDim,
  },
});
