import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlyphRenderer } from './glyph-renderer';
import type { Habit, HabitRecord, TripleValue, GlyphData } from '@/types/habit';

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
  return record?.value === true;
}

function getTripleState(record?: HabitRecord): TripleValue {
  return (record?.value as TripleValue) ?? 'no';
}

function getCounterValue(record?: HabitRecord): number {
  return (record?.value as number) ?? 0;
}

function getStringValue(record?: HabitRecord): string {
  return (record?.value as string) ?? '';
}

export function TileContent({ habit, record, tileWidth, tileHeight }: TileContentProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

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
            <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={done ? 1 : 0.15} />
          </View>
        );
      }

      case 'triple': {
        const state = getTripleState(record);
        const opacity = state === 'no' ? 0.15 : 1;
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

      case 'counter': {
        const count = getCounterValue(record);
        if (count === 0) {
          return (
            <View style={styles.container}>
              <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={0.15} />
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
              <GlyphRenderer glyph={glyph} width={glyphW} height={glyphH} opacity={0.15} />
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
  // Use 60% of the smaller dimension so the letter fills the tile but doesn't clip
  const letterSize = Math.min(tileWidth, tileHeight) * 0.8;
  const circleSize = Math.min(letterSize * 1.2, smallerDim * 0.85);

  function renderLetter(opacity: number, showCircle: boolean) {
    // Fonts reserve ~20% of em-box below baseline for descenders (g, p, y).
    // Capital letters don't use that space, so they appear to sit high.
    // We shift the letter down by adding positive marginTop to visually center it.
    const descenderCompensation = letterSize * 0.15;
    return (
      <View style={styles.container}>
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
      return renderLetter(done ? 1 : 0.2, false);
    }

    case 'triple': {
      const state = getTripleState(record);
      return renderLetter(state === 'no' ? 0.2 : 1, state === 'double');
    }

    case 'counter': {
      const count = getCounterValue(record);
      return (
        <View style={styles.container}>
          <View style={{ width: tileWidth * 0.85, height: tileHeight * 0.5 }}>
            <ThemedText
              style={[styles.bigLetter, { fontSize: letterSize * 0.7, lineHeight: letterSize * 0.8, color: habit.color, opacity: count > 0 ? 1 : 0.2 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {label}
            </ThemedText>
          </View>
          {count > 0 && (
            <ThemedText style={[styles.counterOverlay, { fontSize: letterSize * 0.4 }]}>{count}</ThemedText>
          )}
        </View>
      );
    }

    case 'value': {
      const val = getStringValue(record);
      return (
        <View style={styles.container}>
          <View style={{ width: tileWidth * 0.85, height: tileHeight * 0.45 }}>
            <ThemedText
              style={[styles.bigLetter, { fontSize: letterSize * 0.6, lineHeight: letterSize * 0.7, color: habit.color, opacity: val ? 1 : 0.2 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {label}
            </ThemedText>
          </View>
          {!!val && (
            <ThemedText style={[styles.valueOverlay, { fontSize: letterSize * 0.3 }]} numberOfLines={1}>{val}</ThemedText>
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
