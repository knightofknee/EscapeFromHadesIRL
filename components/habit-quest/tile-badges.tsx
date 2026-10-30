import { StyleSheet, View } from 'react-native';
import { BadgePatch, STATUS_LABELS, StatusGlow } from './badge-patch';
import type { HabitBadge } from '@/hooks/use-habit-badges';

/**
 * The little guy in a habit tile's top-left corner: the patch of the latest
 * badge earned on the habit, blended into the tile, with a soft light pulsing
 * from behind it for how it's holding up (green strong, gold kept up, red in
 * remission).
 * Overlay only; the tile face underneath is untouched.
 */
export function TileBadges({
  badge,
  size,
  bg,
}: {
  badge: HabitBadge;
  size: number;
  bg: string;
}) {
  const d = Math.round(Math.max(18, Math.min(26, size * 0.18)));
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityLabel={`Badge earned${badge.earned > 1 ? ` ${badge.earned} times` : ''}${
        badge.status ? `, ${STATUS_LABELS[badge.status].label.toLowerCase()}` : ''
      }`}
    >
      <View style={[styles.corner, { width: d, height: d }]}>
        {badge.status && <StatusGlow status={badge.status} size={d} />}
        <BadgePatch design={badge.design} size={d} bg={bg} count={badge.earned} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Inset a little more than before so the glow has room before the tile edge.
  corner: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
});
