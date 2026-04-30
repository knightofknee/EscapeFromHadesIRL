import { useState, useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/theme';
import { GRID } from '@/constants/grid';
import { useColorScheme } from '@/hooks/use-color-scheme';

type VacationTileProps = {
  label: string;
  color: string;
  onLongPress: () => void;
};

// Tile inner padding (must match `tile.padding` in styles below).
const TILE_PADDING = 24;
// Empirical: a bold sans-serif glyph is roughly this fraction of fontSize wide.
// Tuned so "Arizona" fits a typical phone-width tile without breaking.
const CHAR_WIDTH_FACTOR = 0.58;
// Line height multiplier (RN default ≈ 1.2 for bold).
const LINE_HEIGHT_FACTOR = 1.15;
// Floor / ceiling for the computed font size.
const FONT_FLOOR = 16;
const FONT_CEILING = 320;

/**
 * Full-grid tile that replaces the habit grid on a vacation day.
 * Visual treatment matches the regular habit tile (see tile-grid.tsx):
 *   - tileBackground fill (theme-aware)
 *   - 2px colored border in the user's vacation color
 *   - centered label rendered in the same color as the border
 *
 * Sizing rule: the **longest word** must fit on a single line, period.
 * We compute the font size from measured tile dimensions so RN never
 * needs to mid-word break — multi-word labels just wrap at spaces.
 */
export function VacationTile({ label, color, onLongPress }: VacationTileProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [size, setSize] = useState({ w: 0, h: 0 });
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  }, []);

  const trimmed = (label ?? '').trim() || 'V';
  const fontSize = computeFontSize(trimmed, size.w, size.h);

  return (
    <View style={[styles.container, { backgroundColor: colors.gridBackground }]}>
      <Pressable
        style={[
          styles.tile,
          {
            backgroundColor: colors.tileBackground,
            borderColor: color,
          },
        ]}
        onLayout={handleLayout}
        onLongPress={() => {
          if (Platform.OS === 'ios' && !Platform.isPad) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          onLongPress();
        }}
        delayLongPress={GRID.dragActivationDelay}
        accessibilityLabel={`Vacation day: ${trimmed}. Long press to edit.`}
      >
        {size.w > 0 && size.h > 0 && (
          <Text
            style={[styles.label, { color, fontSize }]}
            allowFontScaling={false}
          >
            {trimmed}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

/**
 * Pick a font size that:
 *   1. Lets the longest single word fit on one line of the tile width.
 *   2. Lets the worst-case word-per-line layout fit vertically.
 * The smaller of the two bounds wins. Capped at FONT_CEILING for short
 * labels (so "V" doesn't try to render at 1000pt on a tall tile) and
 * floored at FONT_FLOOR for very long labels.
 */
function computeFontSize(label: string, width: number, height: number): number {
  if (!width || !height) return 64;

  const innerW = Math.max(width - TILE_PADDING * 2, 1);
  const innerH = Math.max(height - TILE_PADDING * 2, 1);

  const words = label.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, w) => Math.max(max, w.length), 1);
  const wordCount = Math.max(words.length, 1);

  // Width bound: longest word fits on one line.
  const widthBound = innerW / (longestWord * CHAR_WIDTH_FACTOR);

  // Height bound: worst case = each word on its own line. Conservative;
  // RN may pack multiple short words per line, in which case we'll just
  // use slightly more vertical space than necessary.
  const heightBound = innerH / (wordCount * LINE_HEIGHT_FACTOR);

  const target = Math.min(widthBound, heightBound);
  return Math.max(FONT_FLOOR, Math.min(FONT_CEILING, target));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: GRID.cellGap,
  },
  tile: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    padding: TILE_PADDING,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontWeight: '800',
    textAlign: 'center',
  },
});
