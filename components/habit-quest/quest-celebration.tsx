import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { HoloFoil, HOLO_COLORS } from './holo-foil';
import { QUEST_LENGTH } from '@/lib/habit-quest';

export type QuestBurst = {
  key: number;
  doneCount: number;
  habitName: string;
  /** Where the burst starts, in window coordinates (the quest tile's center). Screen middle when absent. */
  origin?: { x: number; y: number };
};

const PARTICLES = 40;
export const BURST_MS = 1900;

/** Deterministic per-index spread, so the burst looks scattered without Math.random in render. */
function seed(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function Particle({ index, progress }: { index: number; progress: SharedValue<number> }) {
  // Mostly an upward fan, a few thrown sideways.
  const angle = (-Math.PI / 2) + (seed(index, 1) - 0.5) * Math.PI * 1.5;
  const reach = 120 + seed(index, 2) * 200;
  const fall = 160 + seed(index, 3) * 220;
  const spin = (seed(index, 4) - 0.5) * 900;
  const kind = index % 4; // 0 square, 1 strip, 2 dot, 3 star
  const size = 6 + seed(index, 5) * 6;
  const color = HOLO_COLORS[index % HOLO_COLORS.length];
  const nextColor = HOLO_COLORS[(index + 2) % HOLO_COLORS.length];
  const delay = seed(index, 6) * 0.12;

  const style = useAnimatedStyle(() => {
    const raw = progress.value;
    const p = raw <= delay ? 0 : (raw - delay) / (1 - delay);
    // Out-and-up fast, then gravity takes over: a smooth arc, no rebound.
    const out = 1 - Math.pow(1 - p, 3);
    return {
      opacity: raw === 0 ? 0 : interpolate(p, [0, 0.08, 0.7, 1], [0, 1, 1, 0]),
      backgroundColor: kind === 3 ? 'transparent' : interpolateColor(p, [0, 1], [color, nextColor]),
      transform: [
        { translateX: Math.cos(angle) * reach * out },
        { translateY: Math.sin(angle) * reach * out + fall * p * p },
        { rotate: `${spin * p}deg` },
        { scale: interpolate(p, [0, 0.15, 1], [0.3, 1, 0.7]) },
      ],
    };
  });

  if (kind === 3) {
    return (
      <Animated.View style={[styles.particle, style]}>
        <Text style={[styles.star, { color, fontSize: size * 2 }]}>✦</Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: kind === 1 ? size * 0.6 : size,
          height: kind === 1 ? size * 2 : size,
          borderRadius: kind === 2 ? size / 2 : 1.5,
        },
        style,
      ]}
    />
  );
}

function Ring({ progress, delay, color }: { progress: SharedValue<number>; delay: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const raw = progress.value;
    const p = raw <= delay ? 0 : Math.min(1, (raw - delay) / 0.55);
    return {
      opacity: raw === 0 || p === 0 ? 0 : interpolate(p, [0, 0.1, 1], [0, 0.9, 0]),
      transform: [{ scale: interpolate(p, [0, 1], [0.4, 3.2], 'clamp') }],
    };
  });
  return <Animated.View style={[styles.ring, { borderColor: color }, style]} />;
}

/**
 * Holo rings and confetti bursting from the center of a zero-size origin
 * view. `progress` runs 0 to 1 over BURST_MS; a new `burstKey` remounts the
 * particles. Shared by the per-day celebration and the badge-earned modal.
 */
export function HoloBurst({ progress, burstKey }: { progress: SharedValue<number>; burstKey: number | string }) {
  return (
    <>
      <Ring progress={progress} delay={0} color={HOLO_COLORS[2]} />
      <Ring progress={progress} delay={0.08} color={HOLO_COLORS[0]} />
      <Ring progress={progress} delay={0.16} color={HOLO_COLORS[4]} />
      {Array.from({ length: PARTICLES }, (_, i) => (
        <Particle key={`${burstKey}-${i}`} index={i} progress={progress} />
      ))}
    </>
  );
}

/**
 * The per-day 60-day-quest celebration over the Habits grid. Pure spectacle:
 * pointerEvents none, nothing to tap or dismiss, it plays and fades on its
 * own (a new `burst.key` restarts it). Holo confetti and rings burst from the
 * middle while a small foil badge shows the count.
 */
export function QuestCelebration({ burst }: { burst: QuestBurst | null }) {
  const rootRef = useRef<View>(null);
  const [rootOffset, setRootOffset] = useState({ x: 0, y: 0 });
  const progress = useSharedValue(0);
  const badge = useSharedValue(0);

  useEffect(() => {
    if (!burst) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    progress.set(0);
    progress.set(withTiming(1, { duration: BURST_MS, easing: Easing.out(Easing.quad) }));
    badge.set(0);
    badge.set(
      withSequence(
        withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
        withDelay(1100, withTiming(2, { duration: 450, easing: Easing.in(Easing.cubic) })),
      ),
    );
  }, [burst, progress, badge]);

  const badgeStyle = useAnimatedStyle(() => {
    const b = badge.value;
    return {
      opacity: interpolate(b, [0, 1, 2], [0, 1, 0]),
      transform: [
        { translateY: interpolate(b, [0, 1, 2], [18, 0, -14]) },
        { scale: interpolate(b, [0, 1, 2], [0.88, 1, 0.96]) },
      ],
    };
  });

  // The root stays mounted (empty) between bursts so its window offset is
  // already measured when a tile-anchored burst arrives.
  const originStyle = burst?.origin
    ? { left: burst.origin.x - rootOffset.x, top: burst.origin.y - rootOffset.y }
    : styles.originCenter;

  return (
    <View
      ref={rootRef}
      pointerEvents="none"
      style={styles.root}
      onLayout={() => rootRef.current?.measureInWindow((x, y) => setRootOffset({ x, y }))}
    >
      {burst && (
        <>
          <View style={[styles.origin, originStyle]}>
            <HoloBurst progress={progress} burstKey={burst.key} />
          </View>
          <Animated.View style={[styles.badge, badgeStyle]}>
            <HoloFoil variant="card" flashKey={burst.key} />
            <Text style={styles.count}>
              {burst.doneCount}
              <Text style={styles.of}>{` / ${QUEST_LENGTH}`}</Text>
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              {burst.habitName}
            </Text>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  origin: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  originCenter: {
    top: '50%',
    left: '50%',
  },
  particle: {
    position: 'absolute',
  },
  star: {
    fontWeight: '900',
  },
  ring: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
  },
  badge: {
    overflow: 'hidden',
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(13,13,26,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    maxWidth: 260,
  },
  count: {
    fontSize: 40,
    fontWeight: '900',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  of: {
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  name: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
  },
});
