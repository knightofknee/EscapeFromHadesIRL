import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { GlyphRenderer } from './glyph-renderer';
import type { Habit, HabitRecord, TripleValue, QuadValue, GlyphData } from '@/types/habit';

/** Extract unique colors from glyph paths (excluding eraser strokes which are transparent) */
function getGlyphColors(glyph: GlyphData): string[] {
  const seen = new Set<string>();
  for (const p of glyph.paths) {
    if (p.color && p.color !== 'transparent') seen.add(p.color);
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

export function TileContent({ habit, record, tileWidth, tileHeight }: TileContentProps) {
  const smallerDim = Math.min(tileWidth, tileHeight);
  const isCompact = smallerDim < 72;
  const fontSize = isCompact ? 14 : Math.min(smallerDim * 0.12, 24);

  const hasGlyph = habit.glyph && habit.glyph.paths.length > 0;

  // Show-name slot: a fixed bottom band so the centered content sits above it
  // consistently and bars still pin to the very bottom. Off by default.
  // All three values scale with the tile so the name looks proportional at
  // any tile size, and the slot's bottom padding always clears the bar so
  // the name never collides with it.
  const showName = !!habit.showName && !!habit.name;
  const nameSlotHeight = showName ? Math.max(30, smallerDim * 0.25) : 0;
  const nameSlotPadBottom = Math.max(6, smallerDim * 0.05);
  const nameFontSize = nameSlotHeight * 0.5;

  // Glyph fills the tile with some padding; subtract the name slot so the
  // glyph doesn't run into it.
  const pad = Math.max(smallerDim * 0.08, 6);
  const glyphW = tileWidth - pad * 2;
  const glyphH = tileHeight - pad * 2 - nameSlotHeight;

  // Bar (underline) info — rendered absolutely at the outer wrapper's bottom
  // so it never shifts the glyph/letter when it appears, and so it sits
  // under the name slot when showName is on.
  let barInfo: { colors: string[]; width: number; height: number } | null = null;
  if (hasGlyph && habit.glyph) {
    let show = false;
    switch (habit.recordingMode) {
      case 'triple':
        show = getTripleState(record) === 'double';
        break;
      case 'quad':
      case 'steps':
      case 'meditation': {
        const s = getQuadState(record);
        show = s === 'goal' || s === 'ideal';
        break;
      }
    }
    if (show) {
      barInfo = {
        colors: getGlyphColors(habit.glyph),
        width: glyphW * 0.7,
        height: Math.max(6, smallerDim * 0.04),
      };
    }
  }

  let content: ReactNode = null;

  if (hasGlyph && habit.glyph) {
    const glyph = habit.glyph;

    switch (habit.recordingMode) {
      case 'boolean': {
        const done = getBooleanState(record);
        content = (
          <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={done ? 1 : 0.35} />
        );
        break;
      }

      case 'triple': {
        const state = getTripleState(record);
        const opacity = state === 'no' ? 0.35 : 1;
        content = (
          <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={opacity} />
        );
        break;
      }

      case 'quad': {
        const state = getQuadState(record);
        const opacity = state === 'no' ? 0.35 : 1;
        const gStarSize = Math.max(18, smallerDim * 0.15);
        const gSpaceAbove = (tileHeight - glyphH) / 2;
        const gStarTop = gSpaceAbove > gStarSize * 1.5
          ? gSpaceAbove / 2 - gStarSize / 2
          : gSpaceAbove + gStarSize * 0.3;
        content = (
          <>
            {state === 'ideal' && (
              <ThemedText style={[styles.idealStar, { fontSize: gStarSize, lineHeight: gStarSize * 1.5, top: Math.max(4, Math.min(gStarTop, tileHeight * 0.15)) }]}>★</ThemedText>
            )}
            <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={opacity} />
          </>
        );
        break;
      }

      case 'steps': {
        const state = getQuadState(record);
        const opacity = state === 'no' ? 0.35 : 1;
        const gStarSize = Math.max(18, smallerDim * 0.15);
        const gSpaceAbove = (tileHeight - glyphH) / 2;
        const gStarTop = gSpaceAbove > gStarSize * 1.5
          ? gSpaceAbove / 2 - gStarSize / 2
          : gSpaceAbove + gStarSize * 0.3;
        const steps = record?.steps;
        content = (
          <>
            {state === 'ideal' && (
              <ThemedText style={[styles.idealStar, { fontSize: gStarSize, lineHeight: gStarSize * 1.5, top: Math.max(4, Math.min(gStarTop, tileHeight * 0.15)) }]}>★</ThemedText>
            )}
            <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={opacity} />
            {steps != null && (
              <ThemedText style={[styles.stepCount, { fontSize: Math.max(9, smallerDim * 0.13) }]} numberOfLines={1}>
                {formatStepCount(steps)}
              </ThemedText>
            )}
          </>
        );
        break;
      }

      case 'meditation': {
        const state = getQuadState(record);
        const opacity = state === 'no' ? 0.35 : 1;
        const gStarSize = Math.max(18, smallerDim * 0.15);
        const gSpaceAbove = (tileHeight - glyphH) / 2;
        const gStarTop = gSpaceAbove > gStarSize * 1.5
          ? gSpaceAbove / 2 - gStarSize / 2
          : gSpaceAbove + gStarSize * 0.3;
        // No subtitle on the tile itself — the tier (bright/circle/star)
        // speaks for itself; the qualifying/target count lives in the modal.
        content = (
          <>
            {state === 'ideal' && (
              <ThemedText style={[styles.idealStar, { fontSize: gStarSize, lineHeight: gStarSize * 1.5, top: Math.max(4, Math.min(gStarTop, tileHeight * 0.15)) }]}>★</ThemedText>
            )}
            <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={opacity} />
          </>
        );
        break;
      }

      case 'counter': {
        const count = getCounterValue(record);
        if (count === 0) {
          content = (
            <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={0.35} />
          );
        } else {
          content = (
            <>
              <GlyphRenderer glyph={glyph} width={glyphW * 0.6} height={glyphH * 0.6} opacity={1} />
              <ThemedText style={[styles.counterOverlay, { fontSize: fontSize + 4 }]}>{count}</ThemedText>
            </>
          );
        }
        break;
      }

      case 'value': {
        const val = getStringValue(record);
        if (!val) {
          content = (
            <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={0.35} />
          );
        } else {
          content = (
            <>
              <GlyphRenderer glyph={glyph} width={glyphW * 0.6} height={glyphH * 0.5} opacity={1} />
              <ThemedText style={[styles.valueOverlay, { fontSize }]} numberOfLines={1}>{val}</ThemedText>
            </>
          );
        }
        break;
      }
    }
  } else {
    // Fallback: abbreviation-based rendering. The letter IS the tile.
    const label = habit.icon ?? habit.abbreviation;
    const contentW = tileWidth * 0.85;
    const contentH = tileHeight * 0.85 - nameSlotHeight;
    const contentSmaller = Math.min(contentW, contentH);
    const letterSize = contentSmaller * 0.75;
    const circleSize = contentSmaller * 0.95;
    const starSize = Math.max(18, contentSmaller * 0.15);

    function renderLetter(
      opacity: number,
      showCircle: boolean,
      showStar: boolean = false,
      subtitle?: string,
    ): ReactNode {
      const descenderCompensation = letterSize * 0.15;
      const circleTop = (contentH - circleSize) / 2;
      const spaceAboveCircle = circleTop;
      const starTop = spaceAboveCircle > starSize * 1.5
        ? spaceAboveCircle / 2 - starSize / 2
        : circleTop + starSize * 0.8;
      return (
        <>
          {showStar && (
            <ThemedText style={[styles.idealStar, { fontSize: starSize, lineHeight: starSize * 1.5, top: Math.max(4, Math.min(starTop - starSize * 0.25, contentH * 0.15)) }]}>★</ThemedText>
          )}
          {showCircle && (
            <View
              style={[
                styles.letterCircle,
                {
                  width: circleSize,
                  height: circleSize,
                  borderRadius: circleSize / 2,
                  borderColor: habit.color,
                },
              ]}
            />
          )}
          <ThemedText
            style={[
              styles.bigLetter,
              {
                fontSize: letterSize,
                lineHeight: letterSize,
                width: contentW,
                color: habit.color,
                opacity,
                marginTop: descenderCompensation,
              },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {label}
          </ThemedText>
          {subtitle != null && (
            <ThemedText
              style={[styles.stepCount, { fontSize: Math.max(9, contentSmaller * 0.13) }]}
              numberOfLines={1}
            >
              {subtitle}
            </ThemedText>
          )}
        </>
      );
    }

    switch (habit.recordingMode) {
      case 'boolean': {
        const done = getBooleanState(record);
        content = renderLetter(done ? 1 : 0.35, false);
        break;
      }

      case 'triple': {
        const state = getTripleState(record);
        content = renderLetter(state === 'no' ? 0.35 : 1, state === 'double');
        break;
      }

      case 'quad': {
        const state = getQuadState(record);
        content = renderLetter(state === 'no' ? 0.35 : 1, state === 'goal' || state === 'ideal', state === 'ideal');
        break;
      }

      case 'counter': {
        const count = getCounterValue(record);
        const counterLetterSize = contentSmaller * 0.45;
        const counterNumSize = contentSmaller * 0.3;
        content = (
          <>
            <ThemedText
              style={[styles.bigLetter, { fontSize: counterLetterSize, lineHeight: counterLetterSize, color: habit.color, opacity: count > 0 ? 1 : 0.35 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {label}
            </ThemedText>
            {count > 0 && (
              <ThemedText style={[styles.counterOverlay, { fontSize: counterNumSize, lineHeight: counterNumSize }]}>
                {count}
              </ThemedText>
            )}
          </>
        );
        break;
      }

      case 'value': {
        const val = getStringValue(record);
        const valLetterSize = contentSmaller * 0.45;
        const valTextSize = contentSmaller * 0.2;
        content = (
          <>
            <ThemedText
              style={[styles.bigLetter, { fontSize: valLetterSize, lineHeight: valLetterSize, color: habit.color, opacity: val ? 1 : 0.35 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {label}
            </ThemedText>
            {!!val && (
              <ThemedText style={[styles.valueOverlay, { fontSize: valTextSize, lineHeight: valTextSize }]} numberOfLines={1} adjustsFontSizeToFit>{val}</ThemedText>
            )}
          </>
        );
        break;
      }

      case 'steps': {
        const state = getQuadState(record);
        const steps = record?.steps;
        content = renderLetter(
          state === 'no' ? 0.35 : 1,
          state === 'goal' || state === 'ideal',
          state === 'ideal',
          steps != null ? formatStepCount(steps) : undefined,
        );
        break;
      }

      case 'meditation': {
        const state = getQuadState(record);
        // No subtitle on the tile — circles/stars communicate the tier.
        content = renderLetter(
          state === 'no' ? 0.35 : 1,
          state === 'goal' || state === 'ideal',
          state === 'ideal',
        );
        break;
      }
    }
  }

  return (
    <View style={styles.outer}>
      <View style={styles.container}>{content}</View>
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
          <View style={[styles.underline, { backgroundColor: barInfo.colors[0] ?? habit.color, width: barInfo.width, height: barInfo.height, borderRadius: barInfo.height / 2 }]} />
        ) : (
          <LinearGradient
            colors={candyCaneColors(barInfo.colors)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.underline, { width: barInfo.width, height: barInfo.height, borderRadius: barInfo.height / 2 }]}
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
  nameSlot: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tileName: {
    textAlign: 'center',
    fontWeight: '600',
    opacity: 0.9,
  },
  bigLetter: {
    fontWeight: '800',
    textAlign: 'center',
    zIndex: 1,
  },
  letterCircle: {
    position: 'absolute',
    borderWidth: 3,
    zIndex: 0,
  },
  idealStar: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    color: '#D4AC0D',
    zIndex: 2,
  },
  underline: {
    position: 'absolute',
    bottom: 2,
    alignSelf: 'center',
    zIndex: 3,
  },
  counterOverlay: {
    fontWeight: '700',
    marginTop: -4,
  },
  valueOverlay: {
    opacity: 0.8,
    marginTop: 2,
  },
  stepCount: {
    fontWeight: '600',
    opacity: 0.7,
    marginTop: 2,
  },
});
