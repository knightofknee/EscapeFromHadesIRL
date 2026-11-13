import { StyleSheet, View } from 'react-native';
import { BadgePatch, StatusGlow, badgeStatus } from './badge-patch';
import type { HabitBadge } from '@/hooks/use-habit-badges';

/**
 * The little guy in a habit tile's top-left corner: the patch of the latest
 * badge earned on the habit, blended into the tile, with a soft light pulsing
 * from behind it for how it's holding up (green strong, gold kept up, red in
 * remission). An upgraded badge (Level Two) wears its blue edge and glows
 * blue instead of green while strong at goal.
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
  const shown = badgeStatus(badge);
  const upgraded = badge.levelTwo != null;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityLabel={`${upgraded ? 'Upgraded badge' : 'Badge'} earned${badge.earned > 1 ? ` ${badge.earned} times` : ''}${
        shown ? `, ${shown.label.toLowerCase()}` : ''
      }`}
    >
      <View style={[styles.corner, { width: d, height: d }]}>
        {shown && <StatusGlow status={shown.status} size={d} color={shown.glow} />}
        <BadgePatch design={badge.design} size={d} bg={bg} count={badge.earned} level={upgraded ? 2 : 1} />
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
