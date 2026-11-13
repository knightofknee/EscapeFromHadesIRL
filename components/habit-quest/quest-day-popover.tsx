import { StyleSheet, Text, View } from 'react-native';
import { QuestColors } from '@/constants/theme';
import type { PopoverAnchor } from '@/components/habits/day-breakdown-popover';

type Props = {
  /** Rect of the tapped day cell, relative to the host view; null = closed. */
  anchor: PopoverAnchor | null;
  /** Width of the host view the popover is laid out in. */
  hostWidth: number;
  title: string;
  /** One line on how the day counts toward the quest. */
  status: string;
  statusColor: string;
  /** What was recorded, when anything was. */
  detail?: string;
  ink: string;
};

const WIDTH = 140;
const GAP = 6;
const ARROW = 7;
const MARGIN = 4;

/**
 * The quest grid's day card: the date, how the day counts, and what was
 * recorded. Sits above the tapped cell, like the month calendar's day card.
 * Not a Modal: the host closes it on any touch (onTouchStart) while the
 * touch still reaches the cells, so tapping another day swaps straight to
 * it. Touches on the card itself stop there.
 */
export function QuestDayPopover({ anchor, hostWidth, title, status, statusColor, detail, ink }: Props) {
  if (!anchor) return null;
  const cellCenterX = anchor.x + anchor.width / 2;
  const left = Math.min(Math.max(MARGIN, cellCenterX - WIDTH / 2), hostWidth - WIDTH - MARGIN);
  const arrowLeft = Math.min(Math.max(ARROW + 6, cellCenterX - left - ARROW), WIDTH - ARROW * 3);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        // Its bottom edge sits just above the cell (translateY -100% lifts it by its own height).
        style={[styles.card, { left, top: anchor.y - GAP - ARROW, borderColor: ink }]}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <View style={styles.inner}>
          <Text style={styles.title}>{title}</Text>
          <Text style={[styles.status, { color: statusColor }]}>{status}</Text>
          {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        </View>
        <View style={[styles.arrow, { left: arrowLeft, borderTopColor: ink }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: WIDTH,
    transform: [{ translateY: '-100%' }],
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#14142A',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  inner: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: QuestColors.text,
  },
  status: {
    fontSize: 13,
    fontWeight: '600',
  },
  detail: {
    fontSize: 12,
    color: QuestColors.textDim,
  },
  arrow: {
    position: 'absolute',
    bottom: -ARROW,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW,
    borderRightWidth: ARROW,
    borderTopWidth: ARROW,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
