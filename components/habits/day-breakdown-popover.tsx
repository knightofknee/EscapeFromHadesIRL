import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { DayBreakdown } from '@/lib/day-breakdown';

export type PopoverAnchor = { x: number; y: number; width: number; height: number };

type Props = {
  /** Rect of the tapped calendar cell, relative to the host view; null = closed. */
  anchor: PopoverAnchor | null;
  /** Size of the host view the popover is laid out in. */
  bounds: { width: number; height: number };
  title: string;
  breakdown: DayBreakdown | null;
};

const WIDTH = 250;
const GAP = 8;
const ARROW = 8;
const MARGIN = 12;

/** Abbreviations run up to 4 characters; 3-4 step down so they stay on one
 * line in the 24pt column. (adjustsFontSizeToFit mis-shrinks single letters.) */
function abbrFontSize(text: string | undefined): number {
  const len = [...(text ?? '')].length;
  return len >= 4 ? 9 : len === 3 ? 11 : 13;
}

/**
 * Small card that pops up above the tapped heatmap day (below it when the
 * day is near the top) and explains the cell's shade: each habit's tier and
 * the day's weighted score.
 *
 * Deliberately NOT a Modal with a backdrop: the host closes it on any touch
 * (onTouchStart) while the touch still reaches whatever was under it, so
 * tapping another day swaps straight to that day instead of only closing.
 * Touches on the card itself stop there so reading it doesn't dismiss it.
 */
export function DayBreakdownPopover({ anchor, bounds, title, breakdown }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { width: winW, height: winH } = bounds;
  // Card height, measured after the first layout (rows vary per account).
  const [cardH, setCardH] = useState(0);
  if (!anchor || !breakdown) return null;

  const cellCenterX = anchor.x + anchor.width / 2;
  const left = Math.min(Math.max(MARGIN, cellCenterX - WIDTH / 2), winW - WIDTH - MARGIN);
  const arrowLeft = Math.min(Math.max(ARROW + 6, cellCenterX - left - ARROW), WIDTH - ARROW * 3);
  // Above by default; below when the row is near the top. Once the card's
  // height is known: flip sides if only the other side fits, and if neither
  // does (many habits on a short screen like iPhone SE), take the roomier
  // side and slide the card back inside the host so no row is cut off.
  const preferBelow = anchor.y < winH * 0.35;
  const belowTop = anchor.y + anchor.height + GAP + ARROW;
  const aboveBottom = winH - anchor.y + GAP + ARROW;
  const spaceBelow = winH - belowTop - MARGIN;
  const spaceAbove = anchor.y - GAP - ARROW - MARGIN;
  let below = preferBelow;
  let clampedTop: number | null = null;
  if (cardH > 0) {
    const fitsBelow = cardH <= spaceBelow;
    const fitsAbove = cardH <= spaceAbove;
    if (preferBelow ? !fitsBelow : !fitsAbove) {
      if (preferBelow ? fitsAbove : fitsBelow) below = !preferBelow;
      else {
        below = spaceBelow >= spaceAbove;
        const top = below ? belowTop : winH - aboveBottom - cardH;
        clampedTop = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, winH - cardH - MARGIN));
      }
    }
  }
  const placement = clampedTop != null
    ? { top: clampedTop }
    : below
      ? { top: belowTop }
      : { bottom: aboveBottom };

  const percent = Math.round(breakdown.ratio * 100);
  const arrowStyle = below
    ? { top: -ARROW, borderBottomWidth: ARROW, borderBottomColor: colors.tileBorder }
    : { bottom: -ARROW, borderTopWidth: ARROW, borderTopColor: colors.tileBorder };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        style={[
          styles.card,
          placement,
          { left, backgroundColor: colors.tileBackground, borderColor: colors.tileBorder },
          // Hidden for the one frame before the first measurement so it
          // never flashes in the wrong spot.
          cardH === 0 && { opacity: 0 },
        ]}
        onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <View style={styles.header}>
          <ThemedText type="defaultSemiBold" style={styles.title}>{title}</ThemedText>
          <ThemedText style={[styles.score, { color: colors.tileRecorded }]}>
            {breakdown.active === 0 ? '—' : `${percent}%`}
          </ThemedText>
        </View>
        <ThemedText style={styles.sub}>
          {breakdown.active === 0
            ? 'No habits counted this day'
            : `${breakdown.done} of ${breakdown.active} done · ideal 1.5, goal 1.25, done 1`}
        </ThemedText>
        {breakdown.rows.map(({ habit, level, detail, weekendOff }) => (
          <View key={habit.id} style={[styles.row, weekendOff && styles.rowOff]}>
            <ThemedText
              style={[styles.abbr, { color: habit.color, fontSize: habit.icon ? 13 : abbrFontSize(habit.abbreviation) }]}
              numberOfLines={1}
            >
              {habit.icon ?? habit.abbreviation}
            </ThemedText>
            <ThemedText style={styles.name} numberOfLines={1}>{habit.name}</ThemedText>
            <ThemedText
              style={[
                styles.detail,
                level === 0 && !weekendOff && styles.detailMissed,
                level >= 2 && { color: colors.tileRecorded },
              ]}
              numberOfLines={1}
            >
              {weekendOff ? 'weekend off' : detail}
            </ThemedText>
          </View>
        ))}
        {/* No arrow once the card had to slide off its anchor. */}
        {clampedTop == null && <View style={[styles.arrow, arrowStyle, { left: arrowLeft }]} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: WIDTH,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: 14 },
  score: { fontSize: 18, fontWeight: '700' },
  sub: { fontSize: 11, opacity: 0.55, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowOff: { opacity: 0.4 },
  // Wide enough for a two-letter abbreviation ("WG") at full size; see
  // abbrFontSize for 3-4 letters.
  abbr: { width: 24, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  name: { flex: 1, fontSize: 13 },
  detail: { fontSize: 12, fontWeight: '600', maxWidth: 110, textAlign: 'right' },
  detailMissed: { opacity: 0.45, fontWeight: '400' },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: ARROW,
    borderRightWidth: ARROW,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
