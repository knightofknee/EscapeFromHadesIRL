import { StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { SHAPE_PATHS, type BadgeDesign } from '@/lib/badge-designs';
import type { MaintenanceStatus } from '@/lib/habit-strength';

/** Blend a #RRGGBB color toward another; t = how much of `a` survives. Non-hex passes through. */
function mix(a: string, b: string, t: number): string {
  const parse = (hex: string) =>
    /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : null;
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return a;
  return `#${pa.map((v, i) => Math.round(v * t + pb[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
}

/** Scale a 100 x 100 shape about its center. */
const inset = (scale: number) => `translate(${50 * (1 - scale)} ${50 * (1 - scale)}) scale(${scale})`;

/** Level Two's blue for text (light enough to read on the dark surfaces). */
export const LEVEL_TWO_INK = '#4FA8FF';
/**
 * Level Two's blue for glows and filled squares: a saturated royal blue.
 * A light blue at glow opacity over the dark tiles reads as gray; this one
 * stays blue, the way the green glow stays green.
 */
export const LEVEL_TWO_BLUE = '#2F6BFF';
/**
 * Ideal's purple (amethyst, leaning magenta so it never reads as Level Two's
 * blue): ideal days on the grid and ideal strength. A strong ideal badge
 * glows this, as green is Level 1 and blue is Level 2.
 */
export const IDEAL_PURPLE = '#A64DFF';
/** Ideal's purple for text on the dark surfaces. */
export const IDEAL_INK = '#C59BFF';

/** The upgraded badge's edge: deep blues, as dark as the other patch edges. */
const LEVEL_TWO_EDGE = ['#141C52', '#1A3488', '#1F4F96'] as const;
/** The upgraded badge's field and thread: royal blue cloth, pale silver-blue stitching. */
const LEVEL_TWO_FIELD = '#24489E';
const LEVEL_TWO_THREAD = '#D6E6FF';

/**
 * A 60-day badge as an embroidered patch, like a scout merit badge or a
 * gym badge: its own shape and colors, a rolled edge, a stitched border,
 * and the emblem in thread. Each badge earned is a new, preselected design
 * (lib/badge-designs). Blended into what it sits on (`bg`) by `tint`
 * (about 0.6 on a tile, so it's quiet; 1 in the earned-badge modal).
 * ×N when the habit has earned more than one.
 * Level 2 (upgraded by a Level Two quest): the same patch with a blue foil
 * edge and a second stitched ring, so it reads as the same badge, evolved.
 */
export function BadgePatch({
  design,
  size,
  bg,
  tint = 0.6,
  count = 1,
  level = 1,
}: {
  design: BadgeDesign;
  size: number;
  bg: string;
  tint?: number;
  count?: number;
  level?: 1 | 2;
}) {
  const upgraded = level === 2;
  // Upgraded, the whole patch goes blue (field and thread too), so the
  // design's own greens and golds don't fight the blue edge and glow. Shape
  // and emblem stay: it's the same badge, evolved.
  const edge = mix(design.edge, bg, Math.min(1, tint + 0.25));
  const field = mix(upgraded ? LEVEL_TWO_FIELD : design.field, bg, tint);
  const thread = mix(upgraded ? LEVEL_TWO_THREAD : design.thread, bg, Math.min(1, tint + 0.15));
  const outline = SHAPE_PATHS[design.shape];
  const edgeTint = Math.min(1, tint + 0.25);
  const gradientId = `edge2-${design.name.replace(/\W/g, '')}-${Math.round(edgeTint * 100)}`;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {upgraded && (
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              {LEVEL_TWO_EDGE.map((c, i) => (
                <Stop key={c} offset={i / (LEVEL_TWO_EDGE.length - 1)} stopColor={mix(c, bg, edgeTint)} />
              ))}
            </LinearGradient>
          </Defs>
        )}
        <Path d={outline} fill={upgraded ? `url(#${gradientId})` : edge} />
        {upgraded && (
          <Path
            d={outline}
            fill="none"
            stroke={mix('#7FB2FF', bg, edgeTint)}
            strokeWidth={2.2}
            strokeDasharray="4 3.5"
            transform={inset(0.93)}
          />
        )}
        <Path d={outline} fill={field} transform={inset(0.84)} />
        <Path d={outline} fill="none" stroke={thread} strokeWidth={2.6} strokeDasharray="5 4" transform={inset(0.76)} />
        <G transform={inset(0.96)}>
          <Path
            d={design.emblem}
            fill="none"
            stroke={thread}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      </Svg>
      {count > 1 && (
        <View
          style={[
            styles.count,
            { minWidth: size * 0.44, height: size * 0.44, borderRadius: size * 0.22, borderColor: thread, backgroundColor: edge },
          ]}
        >
          <Text style={[styles.countText, { fontSize: Math.max(8, size * 0.24), color: thread }]}>{count}</Text>
        </View>
      )}
    </View>
  );
}

export const STATUS_LABELS: Record<MaintenanceStatus, { label: string; ink: string }> = {
  strong: { label: 'Strong', ink: '#58D68D' },
  kept: { label: 'Kept up', ink: '#E2C25A' },
  remission: { label: 'In remission', ink: '#F1948A' },
};

/**
 * What a badge shows for how it's holding up. A plain badge: its status
 * over any level. An upgraded badge: its status over goal days only, with
 * blue in place of green for strong (gold and red as usual).
 */
export function badgeStatus(badge: {
  status: MaintenanceStatus | null;
  strength: number;
  levelTwo: { strength: number; status: MaintenanceStatus | null } | null;
}): { status: MaintenanceStatus; ink: string; glow: string; label: string; strength: number } | null {
  const upgraded = badge.levelTwo != null;
  const status = upgraded ? badge.levelTwo!.status : badge.status;
  if (!status) return null;
  const strength = upgraded ? badge.levelTwo!.strength : badge.strength;
  const base = STATUS_LABELS[status];
  // The blue already says "level 2", so the words stay the same at both levels.
  if (upgraded && status === 'strong') {
    return { status, ink: LEVEL_TWO_INK, glow: LEVEL_TWO_BLUE, label: base.label, strength };
  }
  return { status, ink: base.ink, glow: base.ink, label: base.label, strength };
}

/** Gentle strokes on a 10 x 10 canvas: a soft rise, a lazy wave, a soft fall. */
const MARK_PATHS: Record<MaintenanceStatus, string> = {
  strong: 'M2 6.5 L5 3.5 L8 6.5',
  kept: 'M1.5 5.6 Q3.2 3.6 5 5 Q6.8 6.4 8.5 4.4',
  remission: 'M2 3.5 L5 6.5 L8 3.5',
};

/**
 * How a badged habit is holding up, as one small, soft mark: a green rise
 * while strong, a yellow wave while kept up, a red fall in remission.
 * Muted on purpose, so it informs without competing with the patch.
 */
export function StatusMark({ status, size, color }: { status: MaintenanceStatus; size: number; color?: string }) {
  const ink = mix(color ?? STATUS_LABELS[status].ink, '#2C2F33', 0.62);
  return (
    <View accessibilityLabel={STATUS_LABELS[status].label}>
      <Svg width={size} height={size} viewBox="0 0 10 10">
        <Path
          d={MARK_PATHS[status]}
          fill="none"
          stroke={ink}
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/**
 * How a badged habit is holding up, as a soft light pulsing from behind its
 * patch: green while strong, gold while kept up, red in remission. Slow
 * eased breathing at an uneven pace (never a bounce); holds still when the phone asks for
 * reduced motion. `size` is the patch's size; the glow reaches about
 * three-eighths of a patch past its edge.
 */
/** One breath in or out takes a random time in this range. */
const BREATH_MS = { min: 2000, max: 2800 };

export function StatusGlow({
  status,
  size,
  color: colorOverride,
}: {
  status: MaintenanceStatus;
  size: number;
  /** Replaces the status color (an upgraded badge glows blue while strong). */
  color?: string;
}) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    if (reduceMotion) {
      pulse.set(0.5);
      return;
    }
    // Every breath in or out gets its own length in the range, and each glow
    // starts at a random point, so badges never pulse in step or in a fixed
    // rhythm.
    // The next breath is picked back on the JS side when one finishes (a
    // worklet can't call itself).
    let alive = true;
    const breathe = (to: number) => {
      if (!alive) return;
      const duration = BREATH_MS.min + Math.random() * (BREATH_MS.max - BREATH_MS.min);
      pulse.set(
        withTiming(to, { duration, easing: Easing.inOut(Easing.sin) }, (finished) => {
          'worklet';
          if (finished) runOnJS(breathe)(to === 1 ? 0 : 1);
        }),
      );
    };
    const start = Math.random();
    pulse.set(start);
    breathe(start < 0.5 ? 1 : 0);
    return () => {
      alive = false;
      cancelAnimation(pulse);
    };
  }, [reduceMotion, pulse]);
  const style = useAnimatedStyle(() => ({
    // Dims only partway, so it reads as a glow that breathes, not one that blinks.
    opacity: interpolate(pulse.value, [0, 1], [0.72, 0.95]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.88, 1.06]) }],
  }));
  const d = size * 1.75;
  const color = colorOverride ?? STATUS_LABELS[status].ink;
  const id = `glow-${status}-${color.replace('#', '')}`;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: d, height: d, left: (size - d) / 2, top: (size - d) / 2 }, style]}
      accessibilityLabel={STATUS_LABELS[status].label}
    >
      <Svg width={d} height={d} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={id} cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0.35" stopColor={color} stopOpacity={0.75} />
            <Stop offset="0.6" stopColor={color} stopOpacity={0.3} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={50} r={50} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  count: {
    position: 'absolute',
    right: -4,
    top: -2,
    paddingHorizontal: 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontWeight: '900',
  },
});
