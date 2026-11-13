import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { QuestColors } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { hasSeenStreakFire, markStreakFireSeen, STREAK_FIRE_DAYS } from '@/lib/streak-fire';
import { BURST_MS, type QuestBurst } from './quest-celebration';

/**
 * Once, ever: the day a quest habit's streak first reaches 10, after that
 * day's celebration has played, a card about keeping the fire fed.
 * Copy agreed with the user 2026-11-12; the quote checked against George
 * Long's translation (Project Gutenberg #15877, Meditations 7.2).
 *
 * `burst` is the day's celebration; its `streak` decides. `blocked` holds
 * the card while another modal is up (the earned quote), so two modals
 * never stack.
 */
export function StreakFireMoment({ burst, blocked = false }: { burst: QuestBurst | null; blocked?: boolean }) {
  const { user } = useAuth();
  const [due, setDue] = useState(false);
  const [open, setOpen] = useState(false);
  const handledKey = useRef<number | null>(null);

  useEffect(() => {
    if (!burst || !user || handledKey.current === burst.key) return;
    handledKey.current = burst.key;
    if ((burst.streak ?? 0) < STREAK_FIRE_DAYS) return;
    let cancelled = false;
    hasSeenStreakFire(user.uid).then((seen) => {
      if (!cancelled && !seen) setDue(true);
    });
    return () => {
      cancelled = true;
    };
  }, [burst, user]);

  // Let the day's celebration play out first.
  useEffect(() => {
    if (!due || blocked || open) return;
    const t = setTimeout(() => setOpen(true), BURST_MS);
    return () => clearTimeout(t);
  }, [due, blocked, open]);

  const close = () => {
    setOpen(false);
    setDue(false);
    if (user) markStreakFireSeen(user.uid);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.flame}>
            <Svg width={34} height={44} viewBox="0 0 14 18">
              <Path
                d="M7 1 C8 4.5 12.5 6.5 12.5 11.5 A5.5 5.5 0 0 1 1.5 11.5 C1.5 8.5 3.5 7 4.5 5.5 C4.8 7.5 5.8 8.5 6.6 8.8 C6.2 6 6.2 3.5 7 1 Z"
                fill={QuestColors.flameHigh}
              />
              <Path d="M7 10 C7.6 11.4 9.2 12 9.2 13.8 A2.2 2.2 0 0 1 4.8 13.8 C4.8 12.4 6.2 11.6 7 10 Z" fill="#FFD27A" />
            </Svg>
          </View>
          <Text style={styles.title}>Ten days strong.</Text>
          <Text style={styles.body}>
            Every day you show up feeds the fire. Skip a day and you&apos;ll have to light it anew.
          </Text>
          <View style={styles.quoteBox}>
            <Text style={styles.quote}>
              “It is in thy power continuously to fan these thoughts into a flame.”
            </Text>
            <Text style={styles.source}>Marcus Aurelius, Meditations</Text>
          </View>
          <Pressable
            onPress={close}
            style={({ pressed }) => [styles.done, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
          >
            <Text style={styles.doneText}>DONE</Text>
          </Pressable>
        </Pressable>
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
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  flame: {
    alignSelf: 'center',
  },
  title: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '900',
    color: QuestColors.text,
  },
  body: {
    textAlign: 'center',
    fontSize: 16,
    color: QuestColors.text,
  },
  // No fixed lineHeight on the italic quote: iOS drops lines with one set.
  quoteBox: {
    borderLeftWidth: 2,
    borderLeftColor: QuestColors.flameHigh,
    paddingLeft: 12,
    gap: 6,
    marginTop: 4,
  },
  quote: {
    fontSize: 15,
    fontStyle: 'italic',
    color: QuestColors.text,
  },
  source: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: QuestColors.textDim,
  },
  done: {
    marginTop: 6,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: QuestColors.flameHigh,
  },
  doneText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#0D0D1A',
  },
});
