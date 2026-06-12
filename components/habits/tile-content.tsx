import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useUserSettingsContext } from '@/contexts/user-settings-context';
import { GlyphRenderer } from './glyph-renderer';
import type { Habit, HabitRecord, TripleValue, QuadValue, GlyphData } from '@/types/habit';

/**
 * Design space
 * ------------
 * The tile face is laid out once on a 100-unit square and every dimension is
 * multiplied by a single scale factor (min(tileW, tileH) / 100). Proportions
 * are identical at every tile count and size — if the layout works at one
 * size it works at all of them.
 *
 * Rules that keep the face collision-free:
 * - The letter box is derived FROM the ring (≈ its inscribed rect), never
 *   from the tile, so no abbreviation can cross the ring. Long abbreviations
 *   shrink to the box via adjustsFontSizeToFit.
 * - Record-state marks (ring, star, counts) and the name are absolute
 *   overlays in reserved slots; they never reflow or resize the centered
 *   content, so the letter sits in the same spot in every state.
 * - No per-element minimum sizes: a Math.max floor breaks uniform scaling
 *   and is what made small tiles collide. The only exceptions are overlays
 *   that cannot push anything (hairline ring stroke, the name label).
 */
const D = {
  /** 2nd-level success ring */
  circle: 82,
  ringStroke: 3.5,
  /** letter box ≈ rect inscribed in the ring; ink stays inside the ring */
  letterBox: 56,
  letterFont: 52,
  /** caps sit high in their line box; nudge ink down to optical center */
  letterShift: 6,
  /**
   * 3rd-level star: horizontally centered, vertically centered in the tile's
   * free band above the ring. On tall tiles (e.g. the 9-tile grid) that band
   * is large and the star floats at full size; on squarer tiles it shrinks
   * to fit the band, never below starMinFont.
   */
  starFont: 20,
  starMinFont: 12,
  starGapPad: 4,
  /** footer slot (step count / counter count / value text) */
  footerGap: 2,
  footerSteps: 12,
  footerCounter: 16,
  footerValue: 13,
  /** glyph branch */
  glyphPad: 8,
  glyphStarTop: 3,
  barWidth: 64,
  barHeight: 4.5,
  barBottom: 3,
} as const;

/** Extract unique colors from glyph paths (excluding eraser strokes, stored with the '__eraser__' sentinel) */
function getGlyphColors(glyph: GlyphData): string[] {
  const seen = new Set<string>();
  for (const p of glyph.paths) {
    if (p.color && p.color !== 'transparent' && p.color !== '__eraser__') seen.add(p.color);
  }
  return [...seen];
}

/** Build candy-cane gradient colors array: repeating stripe pattern */
function candyCaneColors(colors: string[], stripes: number = 12): [string, string, ...string[]] {
  const result: string[] = [];
  for (let i = 0; i < stripes; i++) {
    result.push(colors[i % colors.length]);
  }
  // Ensure at least 2 entries for LinearGradient's tuple type
  if (result.length < 2) result.push(result[0] ?? '#000');
  return result as [string, string, ...string[]];
}

type TileContentProps = {
  habit: Habit;
  record?: HabitRecord;
  tileWidth: number;
  tileHeight: number;
};

function getBooleanState(record?: HabitRecord): boolean {
  return record?.value !== false && record?.value !== 'no' && record?.value != null;
}

function getTripleState(record?: HabitRecord): TripleValue {
  return (record?.value as TripleValue) ?? 'no';
}

function getQuadState(record?: HabitRecord): QuadValue {
  return (record?.value as QuadValue) ?? 'no';
}

function getCounterValue(record?: HabitRecord): number {
  return (record?.value as number) ?? 0;
}

function getStringValue(record?: HabitRecord): string {
  return (record?.value as string) ?? '';
}

function formatStepCount(n: number): string {
  return n.toLocaleString();
}

/** What the tile face shows for the current record state. */
type FaceState = {
  opacity: number;
  showCircle: boolean;
  showStar: boolean;
  footer: { text: string; size: number } | null;
};

function getFaceState(habit: Habit, record?: HabitRecord): FaceState {
  const face: FaceState = { opacity: 1, showCircle: false, showStar: false, footer: null };

  switch (habit.recordingMode) {
    case 'boolean':
      face.opacity = getBooleanState(record) ? 1 : 0.35;
      break;

    case 'triple': {
      const state = getTripleState(record);
      face.opacity = state === 'no' ? 0.35 : 1;
      face.showCircle = state === 'double';
      break;
    }

    case 'quad':
    case 'steps':
    case 'meditation':
    case 'creativeWriting': {
      const state = getQuadState(record);
      face.opacity = state === 'no' ? 0.35 : 1;
      face.showCircle = state === 'goal' || state === 'ideal';
      face.showStar = state === 'ideal';
      // Meditation/creative writing carry no subtitle — the tier speaks for
      // itself; details live in the modal / editor.
      if (habit.recordingMode === 'steps' && record?.steps != null) {
        face.footer = { text: formatStepCount(record.steps), size: D.footerSteps };
      }
      break;
    }

    case 'counter': {
      const count = getCounterValue(record);
      face.opacity = count > 0 ? 1 : 0.35;
      if (count > 0) face.footer = { text: String(count), size: D.footerCounter };
      break;
    }

    case 'value': {
      const val = getStringValue(record);
      face.opacity = val ? 1 : 0.35;
      if (val) face.footer = { text: val, size: D.footerValue };
      break;
    }
  }

  return face;
}

export function TileContent({ habit, record, tileWidth, tileHeight }: TileContentProps) {
  const square = Math.min(tileWidth, tileHeight);
  const s = square / 100; // px per design unit

  const face = getFaceState(habit, record);
  const hasGlyph = habit.glyph && habit.glyph.paths.length > 0;

  // Name overlay, pinned to the tile bottom so the centered content never
  // moves or resizes when the name is toggled. The font floor is a
  // legibility exception — as an overlay it can't push anything.
  // The global "show name on all tiles" switch overrides per-habit showName.
  const { showAllTileNames } = useUserSettingsContext();
  const showName = (!!habit.showName || showAllTileNames) && !!habit.name;
  const nameSlotHeight = Math.max(30, square * 0.25);
  const nameSlotPadBottom = Math.max(6, square * 0.05);
  const nameFontSize = nameSlotHeight * 0.5;

  // Footer overlay (counts/values) stacks above the name when both are on.
  const footerBottom = showName ? nameSlotHeight : D.footerGap * s;

  let content: ReactNode;
  let barInfo: { colors: string[]; width: number; height: number } | null = null;
  // Star geometry is computed per branch (in tile space) and rendered once
  // at the container level so it stays horizontally centered in the tile.
  let starFontPx = D.starFont * s;
  let starTopPx = D.glyphStarTop * s;

  if (hasGlyph && habit.glyph) {
    // Glyph fills the tile with proportional padding; the renderer preserves
    // the drawing's aspect and centers it.
    const pad = D.glyphPad * s;
    const glyphW = tileWidth - pad * 2;
    const glyphH = tileHeight - pad * 2;

    // 2nd level on glyph tiles is the underline bar (a ring would fight the
    // drawing); 3rd level is the same star badge as letter tiles.
    if (face.showCircle) {
      barInfo = {
        colors: getGlyphColors(habit.glyph),
        width: D.barWidth * s,
        height: D.barHeight * s,
      };
    }

    content = (
      <GlyphRenderer glyph={habit.glyph} width={glyphW} height={glyphH} opacity={face.opacity} />
    );
  } else {
    // Letter face: ring, letter, and star badge all live on a centered
    // square so their relationship is fixed at any tile aspect.
    const label = habit.icon ?? habit.abbreviation;
    const circlePx = D.circle * s;
    const ringStroke = Math.max(1.5, D.ringStroke * s);
    const letterBoxPx = D.letterBox * s;

    // Free band between the tile top and the ring's top edge (the ring is
    // centered in the tile). The star centers in it, shrinking only when
    // the band is too shallow for the full-size star.
    const gapAbove = (tileHeight - circlePx) / 2;
    starFontPx = Math.max(
      D.starMinFont * s,
      Math.min(D.starFont * s, gapAbove - D.starGapPad * s),
    );
    starTopPx = Math.max(s, (gapAbove - starFontPx * 1.2) / 2);

    content = (
      <View style={{ width: square, height: square, alignItems: 'center', justifyContent: 'center' }}>
        {face.showCircle && (
          <View
            style={[
              styles.ring,
              {
                width: circlePx,
                height: circlePx,
                borderRadius: circlePx / 2,
                borderWidth: ringStroke,
                borderColor: habit.color,
              },
            ]}
          />
        )}
        <ThemedText
          style={[
            styles.bigLetter,
            {
              fontSize: D.letterFont * s,
              lineHeight: letterBoxPx,
              width: letterBoxPx,
              height: letterBoxPx,
              marginTop: D.letterShift * s,
              color: habit.color,
              opacity: face.opacity,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {label}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.outer}>
      <View style={styles.container}>
        {content}
        {face.showStar && (
          <ThemedText
            style={[
              styles.starBadge,
              { fontSize: starFontPx, lineHeight: starFontPx * 1.2, top: starTopPx },
            ]}
          >
            ★
          </ThemedText>
        )}
      </View>
      {face.footer && (
        <View
          pointerEvents="none"
          style={[styles.footer, { bottom: footerBottom, paddingHorizontal: 4 * s }]}
        >
          <ThemedText
            style={[
              styles.footerText,
              { fontSize: face.footer.size * s, lineHeight: face.footer.size * s * 1.25 },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {face.footer.text}
          </ThemedText>
        </View>
      )}
      {showName && (
        <View style={[styles.nameSlot, { height: nameSlotHeight, paddingBottom: nameSlotPadBottom }]}>
          <ThemedText
            style={[styles.tileName, { fontSize: nameFontSize, lineHeight: nameFontSize * 1.2 }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {habit.name}
          </ThemedText>
        </View>
      )}
      {barInfo && (
        barInfo.colors.length <= 1 ? (
          <View
            style={[
              styles.underline,
              {
                backgroundColor: barInfo.colors[0] ?? habit.color,
                width: barInfo.width,
                height: barInfo.height,
                borderRadius: barInfo.height / 2,
                bottom: D.barBottom * s,
              },
            ]}
          />
        ) : (
          <LinearGradient
            colors={candyCaneColors(barInfo.colors)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.underline,
              {
                width: barInfo.width,
                height: barInfo.height,
                borderRadius: barInfo.height / 2,
                bottom: D.barBottom * s,
              },
            ]}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: '100%',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    zIndex: 0,
  },
  bigLetter: {
    fontWeight: '800',
    textAlign: 'center',
    zIndex: 1,
  },
  starBadge: {
    position: 'absolute',
    alignSelf: 'center',
    textAlign: 'center',
    color: '#D4AC0D',
    zIndex: 2,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  footerText: {
    fontWeight: '600',
    opacity: 0.8,
    textAlign: 'center',
  },
  nameSlot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tileName: {
    textAlign: 'center',
    fontWeight: '600',
    opacity: 0.9,
  },
  underline: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 3,
  },
});
