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

/**
 * Single full-grid tile rendered in place of the habit grid when the
 * viewed day is a vacation day. Long-press opens the edit modal.
 */
export function VacationTile({ label, color, onLongPress }: VacationTileProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [size, setSize] = useState({ w: 0, h: 0 });
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  }, []);

  // Auto-shrink: choose font size so the longest line fits horizontally
  // and the whole text fits vertically. Floor at 16pt so very long labels
  // wrap rather than vanish.
  const fontSize = computeFontSize(label, size.w, size.h);
  const lineHeight = fontSize * 1.1;

  return (
    <View style={[styles.container, { backgroundColor: colors.gridBackground }]}>
      <Pressable
        style={[styles.tile, { backgroundColor: color }]}
        onLayout={handleLayout}
        onLongPress={() => {
          if (Platform.OS === 'ios' && !Platform.isPad) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          onLongPress();
        }}
        delayLongPress={GRID.dragActivationDelay}
        accessibilityLabel={`Vacation day: ${label}. Long press to edit.`}
      >
        {size.w > 0 && size.h > 0 && (
          <Text
            style={[styles.label, { fontSize, lineHeight }]}
            adjustsFontSizeToFit
            numberOfLines={0}
          >
            {label}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

/**
 * Heuristic font sizing for the V tile. With short labels (e.g. "V") we
 * want a giant glyph; with long labels we shrink down to a 16pt floor
 * and let RN wrap onto multiple lines.
 */
function computeFontSize(label: string, width: number, height: number): number {
  if (width === 0 || height === 0) return 64;
  const trimmed = label.trim() || 'V';
  const longestLine = Math.max(...trimmed.split('\n').map((l) => l.length));
  const len = Math.max(longestLine, 1);

  // Width-bounded size: assume an avg glyph ≈ 0.6 * fontSize wide.
  const widthBound = (width * 0.85) / (len * 0.6);
  // Height-bounded size: leave room for at least one line, more if wrapping.
  const totalLines = Math.max(trimmed.split('\n').length, Math.ceil(len / 12));
  const heightBound = (height * 0.85) / (totalLines * 1.1);

  const target = Math.min(widthBound, heightBound);
  // Floor 16, ceiling 240.
  return Math.max(16, Math.min(240, target));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: GRID.cellGap,
  },
  tile: {
    flex: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
  },
});
