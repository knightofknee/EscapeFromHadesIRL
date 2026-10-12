import type { ReactNode } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useUserSettingsContext } from '@/contexts/user-settings-context';
import { GlyphRenderer } from './glyph-renderer';
import type { Habit, HabitRecord, TripleValue, QuadValue, GlyphData } from '@/types/habit';
import { isValueRecorded, valueGoalsOn, valueLevel } from '@/lib/habit-scoring';

/**
 * Design space
 * ------------
 * The tile face is laid out once on a 100-unit square and every dimension is
 * multiplied by a single scale factor (min(tileW, tileH) / 100). Proportions
 * are identical at every tile count and size — if the layout works at one
 * size it works at all of them.
 *
 * Rules that keep the face collision-free:
 * - The name is a REAL BAND at the tile bottom, not an overlay: its height
 *   comes off the top before the face is scaled, and the design-space scale
 *   derives from the REMAINING area (min(width, contentHeight) / 100).
 * - The footer (count/value) is an overlay in the free space UNDER the ink,
 *   with a collision guard: each branch measures the gap between its ink
 *   bottom and the face bottom, and the face rises only by the deficit if
 *   the footer wouldn't fit (usually 0). Treating it as a band re-centered
 *   the face in a shorter area and bumped the letter up on every tile with
 *   a value, even when there was room to spare. A blind overlay (no guard)
 *   was the earlier failure: it clipped the glyph on some tile shapes.
 * - Record-state marks (ring, star) live inside the face's own square, so
 *   the letter sits in the same spot in every record state.
 * - The letter box is derived FROM the ring (≈ its inscribed rect), never
 *   from the tile, so no abbreviation can cross the ring. Long abbreviations
 *   shrink via a deterministic per-character font size — NOT
 *   adjustsFontSizeToFit, whose iOS re-measure can collapse the glyph to a
 *   few pixels when the text's style (opacity on record) changes in place.
 * - No per-element minimum sizes inside the face: a Math.max floor breaks
 *   uniform scaling and is what made small tiles collide. The bands keep
 *   small legibility floors (they hold text, and they push instead of
 *   overlap).
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
  /**
   * Footer (step count / counter count / value text). One size rule for all
   * of them: the text fills the free room under the ring/ink (less a gap so
   * it never touches the ring), capped at footerMaxFont. Per-mode sizes made
   * a value read smaller than a step count on the same grid.
   */
  footerGap: 2,
  footerMaxFont: 16,
  /** glyph branch */
  glyphPad: 8,
  glyphStarTop: 3,
  barWidth: 64,
  barHeight: 4.5,
  barBottom: 3,
} as const;

/** Extract unique colors from glyph paths (excluding eraser strokes, stored with the '__eraser__' sentinel) */
/**
 * User-visible glyph count. `Array.from` alone counts CODE POINTS, which
 * shrinks a single emoji built from several of them (skin tones 👍🏽, flags
 * 🇺🇸, ZWJ families 👨‍👩‍👧) as if it were a multi-letter label. Joins ZWJ
 * sequences, skin-tone/variation modifiers, keycaps, and regional-indicator
 * pairs into one visible glyph.
 */
function splitGlyphs(label: string): string[] {
  const cps = Array.from(label);
  const out: string[] = [];
  let i = 0;
  while (i < cps.length) {
    const start = i;
    const cur = cps[i].codePointAt(0) ?? 0;
    i++;
    // A flag is a pair of regional indicators.
    if (cur >= 0x1f1e6 && cur <= 0x1f1ff && i < cps.length) {
      const next = cps[i].codePointAt(0) ?? 0;
      if (next >= 0x1f1e6 && next <= 0x1f1ff) i++;
    }
    // Absorb trailing modifiers; ZWJ glues the following code point on too.
    while (i < cps.length) {
      const cp = cps[i].codePointAt(0) ?? 0;
      if (cp === 0x200d) {
        i += 2;
        continue;
      }
      if ((cp >= 0x1f3fb && cp <= 0x1f3ff) || cp === 0xfe0f || cp === 0x20e3) {
        i++;
        continue;
      }
      break;
    }
    out.push(cps.slice(start, i).join(''));
  }
  return out;
}

function countGlyphs(label: string): number {
  return splitGlyphs(label).length;
}

/**
 * An emoji's advance width in ems. Apple Color Emoji is about square, but
 * Android's emoji fonts (Noto, Samsung) run about a quarter wider than the
 * font size: at the full letter size a single emoji overflowed the letter box
 * and numberOfLines={1} replaced it with a tile-colored "…". Generous on
 * Android so OEM emoji fonts fit too.
 */
const EMOJI_EM = Platform.OS === 'android' ? 1.35 : 1.0;

/**
 * Approximate advance width of the label in ems of the heavy-caps face. A
 * flat per-character width let "WA" overflow its box and ellipsize to "W.."
 * — W and M run nearly a full em at weight 800, narrow letters half of one,
 * and emoji are square. Deliberately generous so the sized text can never
 * exceed the letter box and trip numberOfLines={1} into an ellipsis.
 */
function labelWidthEm(glyphs: string[]): number {
  let em = 0;
  for (const g of glyphs) {
    if (g.length > 1 || (g.codePointAt(0) ?? 0) > 0x2000) em += EMOJI_EM; // emoji/symbol
    else if (/[wm]/i.test(g)) em += 1.0;
    else if (/[ijl1]/i.test(g)) em += 0.55;
    else em += 0.75;
  }
  return em;
}

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
  footer: { text: string } | null;
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
      // A zero step count says nothing — drop the footer band (same rule as
      // a counter at 0) so the letter sits level with footerless neighbors.
      if (habit.recordingMode === 'steps' && record?.steps != null && record.steps > 0) {
        face.footer = { text: formatStepCount(record.steps) };
      }
      break;
    }

    case 'counter': {
      const count = getCounterValue(record);
      face.opacity = count > 0 ? 1 : 0.35;
      if (count > 0) face.footer = { text: String(count) };
      break;
    }

    case 'value': {
      const val = getStringValue(record);
      // "0" is an entry the user zeroed back out, not a completion — dim it
      // and drop the footer, same as a counter at 0 (isValueRecorded owns
      // that rule). With goals the entry climbs the steps-style ladder: an
      // amount under goal 1 stays dim but still shows its number.
      const level = valueLevel(val, valueGoalsOn(habit, record?.date));
      face.opacity = level > 0 ? 1 : 0.35;
      face.showCircle = level >= 2;
      face.showStar = level >= 3;
      if (isValueRecorded(val)) face.footer = { text: val.trim() };
      break;
    }
  }

  return face;
}

export function TileContent({ habit, record, tileWidth, tileHeight }: TileContentProps) {
  const face = getFaceState(habit, record);
  const hasGlyph = habit.glyph && habit.glyph.paths.length > 0;
  const hasIconImage = !!habit.iconImage;

  // Name band. Sized from the raw tile (it holds fixed text, so it must not
  // shrink with the face it shrinks), then SUBTRACTED from the face's
  // available height — it pushes, it never overlaps.
  // The global "show name on all tiles" switch overrides per-habit showName.
  const { showAllTileNames } = useUserSettingsContext();
  const showName = (!!habit.showName || showAllTileNames) && !!habit.name;
  const base = Math.min(tileWidth, tileHeight);
  const nameSlotHeight = showName ? Math.max(26, base * 0.2) : 0;
  const nameFontSize = nameSlotHeight * 0.5;
  // Smallest footer slot that keeps the number legible; on roomy tiles the
  // slot grows to fill the free space under the ring/ink (see fitFooter).
  const footerMinSlot = face.footer ? Math.max(16, base * 0.15) : 0;

  // The face is laid out as if there were NO footer: the footer band is an
  // overlay in the free space under the ink, so a tile with a value shows
  // its letter at exactly the same height as its footerless neighbors.
  // Subtracting the footer band (the old model) re-centered the face in a
  // shorter area and bumped the letter up by half the band, even when the
  // band would have fit under the ink with room to spare. The face only
  // moves when the footer would actually collide with its ink, and then
  // only by the deficit (faceShift, computed per branch below).
  // The 35% floor only matters on a pathological sliver of a tile.
  const contentHeight = Math.max(tileHeight - nameSlotHeight, tileHeight * 0.35);
  const square = Math.min(tileWidth, contentHeight);
  const s = square / 100; // px per design unit

  let content: ReactNode;
  let barInfo: { colors: string[]; width: number; height: number } | null = null;
  // Star geometry is computed per branch (in tile space) and rendered once
  // at the container level so it stays horizontally centered in the tile.
  let starFontPx = D.starFont * s;
  let starTopPx = D.glyphStarTop * s;
  // How far the face must rise so the footer clears its ink (0 = it fits).
  let faceShift = 0;
  let footerSlotHeight = 0;
  // Size the footer slot from the free room under the ink: it fills that
  // room (the number grows with the tile instead of sitting at a fixed small
  // size), and only when the room is below the legible minimum does the
  // face rise, by exactly the deficit.
  const fitFooter = (room: number) => {
    if (!face.footer) return;
    footerSlotHeight = Math.max(footerMinSlot, room);
    faceShift = Math.max(0, footerSlotHeight - room);
  };

  if (hasIconImage) {
    // Uploaded icon: a square image centered in the tile with the same
    // proportional padding as the glyph. State marks follow the glyph rules —
    // a ring would fight the image, so 2nd level is the underline bar and
    // 3rd level the star badge.
    const pad = D.glyphPad * s;
    const imgSize = square - pad * 2;

    // Footer gets the room under the image, less the pad the bar lives in.
    const freeBelow = (contentHeight - imgSize) / 2;
    fitFooter(freeBelow - pad);

    if (face.showCircle) {
      barInfo = {
        colors: [habit.color],
        width: D.barWidth * s,
        height: D.barHeight * s,
      };
    }

    content = (
      <Image
        source={{ uri: habit.iconImage }}
        style={{ width: imgSize, height: imgSize, borderRadius: 6 * s, opacity: face.opacity }}
        resizeMode="contain"
      />
    );
  } else if (hasGlyph && habit.glyph) {
    // Glyph fills the tile with proportional padding; the renderer preserves
    // the drawing's aspect and centers it.
    const pad = D.glyphPad * s;
    const glyphW = tileWidth - pad * 2;
    const glyphH = contentHeight - pad * 2;

    // The renderer aspect-fits and centers the drawing in its box, so the
    // ink height is known: the footer (plus the pad the bar lives in) must
    // fit under it. A wide drawing like a hand-drawn W leaves plenty of
    // room and doesn't move; a tall one rises only by the deficit.
    const { width: vbW, height: vbH } = habit.glyph.viewBox;
    const inkH = vbW > 0 && vbH > 0 ? Math.min(glyphW / vbW, glyphH / vbH) * vbH : glyphH;
    const freeBelow = (contentHeight - inkH) / 2;
    fitFooter(freeBelow - pad);

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

    // Deterministic shrink: scale the font until the label's estimated
    // advance width fits the letter box. Any single letter (and a single
    // emoji on iOS) is narrower than the box, so it keeps the full
    // design-space size; a single emoji on Android shrinks to fit (EMOJI_EM).
    const glyphs = splitGlyphs(label ?? '');
    const letterFontPx =
      glyphs.length === 0
        ? D.letterFont * s
        : Math.min(D.letterFont * s, letterBoxPx / labelWidthEm(glyphs));

    // The footer lives between the ring's bottom edge (plus a gap, so the
    // number never touches the ring) and the face bottom. Measured against
    // the ring in EVERY record state (not just when it's drawn) so neither
    // the letter nor the number moves when the ring appears.
    const freeBelowRing = (contentHeight - circlePx) / 2;
    fitFooter(freeBelowRing - D.footerGap * s);

    // Free band between the tile top and the ring's top edge (the ring is
    // centered in the tile, less any footer shift). The star centers in it,
    // shrinking only when the band is too shallow for the full-size star.
    const gapAbove = (contentHeight - circlePx) / 2 - faceShift;
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
              fontSize: letterFontPx,
              lineHeight: letterBoxPx,
              width: letterBoxPx,
              height: letterBoxPx,
              marginTop: D.letterShift * s,
              color: habit.color,
              opacity: face.opacity,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </ThemedText>
      </View>
    );
  }

  // The bar sits just above the footer (inside the glyph pad, as before).
  const barBottomPx = footerSlotHeight + D.barBottom * s;

  // Footer text: fills its slot (line box = slot height), capped at the
  // design max, then shrunk per character (digits ~0.6em at weight 600) so
  // a long value fits the tile width without any runtime re-measure.
  let footerFontPx = 0;
  if (face.footer) {
    const cap = Math.min(D.footerMaxFont * s, footerSlotHeight / 1.25);
    const availW = tileWidth - 8 * s;
    const chars = Math.max(1, countGlyphs(face.footer.text));
    footerFontPx = Math.min(cap, availW / (chars * 0.6));
  }

  return (
    <View style={styles.outer}>
      <View style={[styles.container, { height: contentHeight }]}>
        <View style={faceShift > 0 ? { transform: [{ translateY: -faceShift }] } : undefined}>
          {content}
        </View>
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
        {barInfo &&
          (barInfo.colors.length <= 1 ? (
            <View
              style={[
                styles.underline,
                {
                  backgroundColor: barInfo.colors[0] ?? habit.color,
                  width: barInfo.width,
                  height: barInfo.height,
                  borderRadius: barInfo.height / 2,
                  bottom: barBottomPx,
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
                  bottom: barBottomPx,
                },
              ]}
            />
          ))}
        {face.footer && (
          <View
            pointerEvents="none"
            style={[styles.footer, { height: footerSlotHeight, paddingHorizontal: 4 * s }]}
          >
            <ThemedText
              // No adjustsFontSizeToFit: on iOS it can collapse a mounted Text
              // to a few pixels when its style changes in place (the "tiny
              // value" bug, same as the big letter). The size is deterministic
              // instead — capped so its line height fits the slot, and
              // shrunk per character for long values so they can't overflow.
              style={[styles.footerText, { fontSize: footerFontPx, lineHeight: footerFontPx * 1.25 }]}
              numberOfLines={1}
            >
              {face.footer.text}
            </ThemedText>
          </View>
        )}
      </View>
      {showName && (
        <View style={[styles.nameSlot, { height: nameSlotHeight }]}>
          <ThemedText
            style={[styles.tileName, { fontSize: nameFontSize, lineHeight: nameFontSize * 1.2 }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {habit.name}
          </ThemedText>
        </View>
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
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  footerText: {
    fontWeight: '600',
    opacity: 0.8,
    textAlign: 'center',
  },
  nameSlot: {
    alignSelf: 'stretch',
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
