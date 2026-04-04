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

export function TileContent({ habit, record, tileWidth, tileHeight }: TileContentProps) {
  const smallerDim = Math.min(tileWidth, tileHeight);
  const isCompact = smallerDim < 72;
  const fontSize = isCompact ? 14 : Math.min(smallerDim * 0.12, 24);

  const hasGlyph = habit.glyph && habit.glyph.paths.length > 0;

  // Glyph fills the tile with some padding
  const pad = Math.max(smallerDim * 0.08, 6);
  const glyphW = tileWidth - pad * 2;
  const glyphH = tileHeight - pad * 2;

  if (hasGlyph && habit.glyph) {
    const glyph = habit.glyph;

    switch (habit.recordingMode) {
      case 'boolean': {
        const done = getBooleanState(record);
        return (
          <View style={styles.container}>
            <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={done ? 1 : 0.35} />
          </View>
        );
      }

      case 'triple': {
        const state = getTripleState(record);
        const opacity = state === 'no' ? 0.35 : 1;
        const glyphColors = getGlyphColors(glyph);
        const barWidth = glyphW * 0.7;
        const barHeight = Math.max(6, smallerDim * 0.04);
        return (
          <View style={styles.container}>
            <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={opacity} />
            {state === 'double' && (
              glyphColors.length <= 1 ? (
                <View style={[styles.underline, { backgroundColor: glyphColors[0] ?? habit.color, width: barWidth, height: barHeight, borderRadius: barHeight / 2 }]} />
              ) : (
                <LinearGradient
                  colors={candyCaneColors(glyphColors)}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.underline, { width: barWidth, height: barHeight, borderRadius: barHeight / 2 }]}
                />
              )
            )}
          </View>
        );
      }

      case 'quad': {
        const state = getQuadState(record);
        const opacity = state === 'no' ? 0.35 : 1;
        const glyphColors = getGlyphColors(glyph);
        const barWidth = glyphW * 0.7;
        const barHeight = Math.max(6, smallerDim * 0.04);
        const showBar = state === 'goal' || state === 'ideal';
        const gStarSize = Math.max(18, smallerDim * 0.15);
        const gSpaceAbove = (tileHeight - glyphH) / 2;
        const gStarTop = gSpaceAbove > gStarSize * 1.5
          ? gSpaceAbove / 2 - gStarSize / 2
          : gSpaceAbove + gStarSize * 0.3;
        return (
          <View style={styles.container}>
            {state === 'ideal' && (
              <ThemedText style={[styles.idealStar, { fontSize: gStarSize, lineHeight: gStarSize * 1.5, top: Math.max(4, gStarTop) }]}>★</ThemedText>
            )}
            <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={opacity} />
            {showBar && (
              glyphColors.length <= 1 ? (
                <View style={[styles.underline, { backgroundColor: glyphColors[0] ?? habit.color, width: barWidth, height: barHeight, borderRadius: barHeight / 2 }]} />
              ) : (
                <LinearGradient
                  colors={candyCaneColors(glyphColors)}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.underline, { width: barWidth, height: barHeight, borderRadius: barHeight / 2 }]}
                />
              )
            )}
          </View>
        );
      }

      case 'counter': {
        const count = getCounterValue(record);
        if (count === 0) {
          return (
            <View style={styles.container}>
              <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={0.35} />
            </View>
          );
        }
        return (
          <View style={styles.container}>
            <GlyphRenderer glyph={glyph} width={glyphW * 0.6} height={glyphH * 0.6} opacity={1} />
            <ThemedText style={[styles.counterOverlay, { fontSize: fontSize + 4 }]}>{count}</ThemedText>
          </View>
        );
      }

      case 'value': {
        const val = getStringValue(record);
        if (!val) {
          return (
            <View style={styles.container}>
              <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={0.35} />
            </View>
          );
        }
        return (
          <View style={styles.container}>
            <GlyphRenderer glyph={glyph} width={glyphW * 0.6} height={glyphH * 0.5} opacity={1} />
            <ThemedText style={[styles.valueOverlay, { fontSize }]} numberOfLines={1}>{val}</ThemedText>
          </View>
        );
      }
    }
  }

  // Fallback: abbreviation-based rendering
  // The letter IS the tile. State shown via opacity + circle around letter for double.
  const label = habit.icon ?? habit.abbreviation;
  // Size the letter to fit within the tile with breathing room
  const contentW = tileWidth * 0.85;
  const contentH = tileHeight * 0.85;
  const contentSmaller = Math.min(contentW, contentH);
  const letterSize = contentSmaller * 0.75;
  const circleSize = contentSmaller * 0.95;

  const starSize = Math.max(18, contentSmaller * 0.15);

  function renderLetter(opacity: number, showCircle: boolean, showStar: boolean = false) {
    const descenderCompensation = letterSize * 0.15;
    // Circle top edge is at (tileHeight - circleSize) / 2 from content top.
    // Place star halfway between content top and circle top.
    const circleTop = (contentH - circleSize) / 2;
    // If there's room above the circle for the star, place it there; otherwise tuck inside
    const spaceAboveCircle = circleTop;
    const starTop = spaceAboveCircle > starSize * 1.5
      ? spaceAboveCircle / 2 - starSize / 2
      : circleTop + starSize * 0.8;
    return (
      <View style={styles.container}>
        {showStar && (
          <ThemedText style={[styles.idealStar, { fontSize: starSize, lineHeight: starSize * 1.5, top: Math.max(4, starTop - starSize * 0.25) }]}>★</ThemedText>
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
      </View>
    );
  }

  switch (habit.recordingMode) {
    case 'boolean': {
      const done = getBooleanState(record);
      return renderLetter(done ? 1 : 0.35, false);
    }

    case 'triple': {
      const state = getTripleState(record);
      return renderLetter(state === 'no' ? 0.35 : 1, state === 'double');
    }

    case 'quad': {
      const state = getQuadState(record);
      return renderLetter(state === 'no' ? 0.35 : 1, state === 'goal' || state === 'ideal', state === 'ideal');
    }

    case 'counter': {
      const count = getCounterValue(record);
      const counterLetterSize = contentSmaller * 0.45;
      const counterNumSize = contentSmaller * 0.3;
      return (
        <View style={styles.container}>
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
        </View>
      );
    }

    case 'value': {
      const val = getStringValue(record);
      const valLetterSize = contentSmaller * 0.45;
      const valTextSize = contentSmaller * 0.2;
      return (
        <View style={styles.container}>
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
        </View>
      );
    }
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginTop: 4,
  },
  counterOverlay: {
    fontWeight: '700',
    marginTop: -4,
  },
  valueOverlay: {
    opacity: 0.8,
    marginTop: 2,
  },
});
