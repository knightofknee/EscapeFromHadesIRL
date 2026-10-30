import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { HoloFoil, HOLO_COLORS } from './holo-foil';
import { BURST_MS, HoloBurst } from './quest-celebration';
import { BadgePatch } from './badge-patch';
import type { BadgeDesign } from '@/lib/badge-designs';
import { QUEST_LENGTH } from '@/lib/habit-quest';

export type EarnedBadge = {
  /** Bump per award so a second award replays the celebration. */
  key: number;
  habitName: string;
  /** This badge's preselected design (the next in the sequence when earned). */
  design: BadgeDesign;
  daysDone: number;
  strength: number;
};

/**
 * Shown the moment a badge is earned on a habit: taking a ready badge, or
 * closing out a quest that reached day 60. A holo card with the medal and
 * the result, two waves of holo confetti behind it. Eased timing only, no
 * spring (the user finds bounce nauseating).
 */
export function BadgeEarnedModal({ earned, onClose }: { earned: EarnedBadge | null; onClose: () => void }) {
  const enter = useSharedValue(0);
  const burstA = useSharedValue(0);
  const burstB = useSharedValue(0);

  useEffect(() => {
    if (!earned) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    enter.set(0);
    enter.set(withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    burstA.set(0);
    burstA.set(withDelay(120, withTiming(1, { duration: BURST_MS, easing: Easing.out(Easing.quad) })));
    burstB.set(0);
    burstB.set(withDelay(900, withTiming(1, { duration: BURST_MS, easing: Easing.out(Easing.quad) })));
  }, [earned, enter, burstA, burstB]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: interpolate(enter.value, [0, 1], [0.9, 1]) }],
  }));
  const medalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(enter.value, [0, 1], [0.6, 1]) }],
  }));

  return (
    <Modal visible={!!earned} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scrim}>
        {earned && (
          <>
            <Animated.View style={[styles.card, cardStyle]}>
              <LinearGradient
                colors={['#1D1840', '#121228', '#0F2233']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <HoloFoil variant="card" flashKey={earned.key} />
              <View style={styles.topRow}>
                <Animated.View style={medalStyle}>
                  <BadgePatch design={earned.design} size={MEDAL} bg="#121228" tint={1} />
                </Animated.View>
                <Text style={styles.kicker}>BADGE{'\n'}EARNED</Text>
              </View>
              {/* Sized by length, not adjustsFontSizeToFit (its iOS re-measure can
                  collapse the text to a few pixels). */}
              <Text style={[styles.habit, habitNameSize(earned.habitName)]} numberOfLines={2}>
                {earned.habitName}
              </Text>
              <View style={styles.stats}>
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>
                    {earned.daysDone}
                    <Text style={styles.statOf}>{`/${QUEST_LENGTH}`}</Text>
                  </Text>
                  <Text style={styles.statLabel}>DAYS DONE</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>
                    {Math.round(earned.strength * 100)}
                    <Text style={styles.statOf}>%</Text>
                  </Text>
                  <Text style={styles.statLabel}>HABIT STRENGTH</Text>
                </View>
              </View>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.done, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
              >
                <LinearGradient colors={HOLO_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Text style={styles.doneText}>DONE</Text>
              </Pressable>
            </Animated.View>
            {/* Over the card, so the confetti flies across it. */}
            <View style={styles.origin} pointerEvents="none">
              <HoloBurst progress={burstA} burstKey={`a-${earned.key}`} />
            </View>
            <View style={[styles.origin, styles.originLow]} pointerEvents="none">
              <HoloBurst progress={burstB} burstKey={`b-${earned.key}`} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const MEDAL = 56;

function habitNameSize(name: string) {
  const fontSize = name.length <= 10 ? 44 : name.length <= 16 ? 36 : 28;
  return { fontSize, lineHeight: Math.round(fontSize * 1.15) };
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(5,5,14,0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  origin: {
    position: 'absolute',
    top: '42%',
    left: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  originLow: {
    top: '58%',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3,
    lineHeight: 18,
    color: '#7FE9FF',
  },
  habit: {
    marginTop: 14,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  stats: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 54,
    lineHeight: 60,
    fontWeight: '900',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  statOf: {
    fontSize: 22,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.7)',
  },
  statLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.75)',
  },
  statDivider: {
    width: 1,
    height: 56,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  done: {
    marginTop: 22,
    alignSelf: 'stretch',
    overflow: 'hidden',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: '#0D0D1A',
  },
});
