import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlyphRenderer } from './glyph-renderer';
import type { Habit, HabitRecord, TripleValue } from '@/types/habit';

type TileContentProps = {
  habit: Habit;
  record?: HabitRecord;
  cellSize: number;
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

export function TileContent({ habit, record, cellSize }: TileContentProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isCompact = cellSize < 72;
  const fontSize = isCompact ? 14 : 18;

  const hasGlyph = habit.glyph && habit.glyph.paths.length > 0;

  // Glyph display size — fit inside the tile with padding, minimum 24px
  const glyphSize = Math.max(cellSize - 16, 24);

  function renderGlyphContent() {
    if (!hasGlyph || !habit.glyph) return null;

    switch (habit.recordingMode) {
      case 'boolean': {
        const done = getBooleanState(record);
        if (!done) {
          // Not recorded — show glyph faded
          return (
            <View style={styles.glyphContainer}>
              <GlyphRenderer glyph={habit.glyph} width={glyphSize} height={glyphSize} opacity={0.15} />
            </View>
          );
        }
        // Recorded — show glyph full
        return (
          <View style={styles.glyphContainer}>
            <GlyphRenderer glyph={habit.glyph} width={glyphSize} height={glyphSize} opacity={1} />
          </View>
        );
      }

      case 'triple': {
        const state = getTripleState(record);
        if (state === 'no') {
          // Not recorded — faded glyph
          return (
            <View style={styles.glyphContainer}>
              <GlyphRenderer glyph={habit.glyph} width={glyphSize} height={glyphSize} opacity={0.15} />
            </View>
          );
        }
        if (state === 'yes') {
          // Single tap — show glyph
          return (
            <View style={styles.glyphContainer}>
              <GlyphRenderer glyph={habit.glyph} width={glyphSize} height={glyphSize} opacity={1} />
            </View>
          );
        }
        // Double — show glyph with underline
        return (
          <View style={styles.glyphContainer}>
            <GlyphRenderer glyph={habit.glyph} width={glyphSize} height={glyphSize} opacity={1} />
            <View style={[styles.underline, { backgroundColor: habit.color, width: glyphSize * 0.7 }]} />
          </View>
        );
      }

      case 'counter': {
        const count = getCounterValue(record);
        if (count === 0) {
          return (
            <View style={styles.glyphContainer}>
              <GlyphRenderer glyph={habit.glyph} width={glyphSize} height={glyphSize} opacity={0.15} />
            </View>
          );
        }
        // Show glyph + count
        return (
          <View style={styles.glyphContainer}>
            <GlyphRenderer
              glyph={habit.glyph}
              width={glyphSize * 0.7}
              height={glyphSize * 0.7}
              opacity={1}
            />
            <ThemedText style={[styles.counterOverlay, { fontSize: fontSize + 2 }]}>
              {count}
            </ThemedText>
          </View>
        );
      }

      case 'value': {
        const val = getStringValue(record);
        if (!val) {
          return (
            <View style={styles.glyphContainer}>
              <GlyphRenderer glyph={habit.glyph} width={glyphSize} height={glyphSize} opacity={0.15} />
            </View>
          );
        }
        // Show glyph + value text
        return (
          <View style={styles.glyphContainer}>
            <GlyphRenderer
              glyph={habit.glyph}
              width={glyphSize * 0.7}
              height={glyphSize * 0.6}
              opacity={1}
            />
            <ThemedText style={[styles.valueOverlay, { fontSize }]} numberOfLines={1}>
              {val}
            </ThemedText>
          </View>
        );
      }
    }
  }

  // If habit has a glyph, use glyph-based rendering
  if (hasGlyph) {
    return <View style={styles.container}>{renderGlyphContent()}</View>;
  }

  // Fallback: original abbreviation + indicator rendering
  function renderStateIndicator() {
    switch (habit.recordingMode) {
      case 'boolean': {
        const done = getBooleanState(record);
        return (
          <View
            style={[styles.indicator, { backgroundColor: done ? colors.tileRecorded : colors.tileUnrecorded }]}
          >
            {done && (
              <ThemedText style={[styles.checkmark, { fontSize: fontSize + 2 }]}>✓</ThemedText>
            )}
          </View>
        );
      }
      case 'triple': {
        const state = getTripleState(record);
        const bg =
          state === 'double'
            ? colors.tileDouble
            : state === 'yes'
              ? colors.tileRecorded
              : colors.tileUnrecorded;
        return (
          <View style={[styles.indicator, { backgroundColor: bg }]}>
            {state === 'yes' && (
              <ThemedText style={[styles.checkmark, { fontSize: fontSize + 2 }]}>✓</ThemedText>
            )}
            {state === 'double' && (
              <ThemedText style={[styles.checkmark, { fontSize: fontSize + 2 }]}>✓✓</ThemedText>
            )}
          </View>
        );
      }
      case 'counter': {
        const count = getCounterValue(record);
        return (
          <ThemedText style={[styles.counterText, { fontSize: fontSize + 4 }]}>
            {count > 0 ? count : ''}
          </ThemedText>
        );
      }
      case 'value': {
        const val = getStringValue(record);
        return (
          <ThemedText style={[styles.valueText, { fontSize }]} numberOfLines={1}>
            {val}
          </ThemedText>
        );
      }
    }
  }

  return (
    <View style={styles.container}>
      <ThemedText
        style={[styles.abbreviation, { fontSize: fontSize + 2, color: habit.color }]}
        numberOfLines={1}
      >
        {habit.icon ?? habit.abbreviation}
      </ThemedText>
      {renderStateIndicator()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  abbreviation: {
    fontWeight: '700',
    textAlign: 'center',
  },
  indicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    color: '#fff',
    fontWeight: '700',
    lineHeight: 22,
  },
  counterText: {
    fontWeight: '600',
  },
  valueText: {
    opacity: 0.7,
  },
  // Glyph-specific styles
  glyphContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  underline: {
    height: 3,
    borderRadius: 1.5,
    marginTop: 2,
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
