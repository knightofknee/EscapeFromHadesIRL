import { useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSuccessColors, DEFAULT_SUCCESS_COLORS } from '@/hooks/use-success-colors';
import type { SuccessLevel } from '@/hooks/use-success-colors';

const PALETTE = [
  // Row 1 — warm
  '#E74C3C', '#FF6B6B', '#F39C12', '#F1C40F',
  // Row 2 — green/teal
  '#2ECC71', '#27AE60', '#1ABC9C', '#16A085',
  // Row 3 — blue/purple
  '#3498DB', '#2980B9', '#9B59B6', '#8E44AD',
  // Row 4 — neutral/misc
  '#E67E22', '#D35400', '#95A5A6', '#7F8C8D',
  // Row 5 — pastels & extras
  '#FF9FF3', '#54A0FF', '#5F27CD', '#01A3A4',
  '#D5D8DC', '#4A4D52', '#2C3E50', '#34495E',
];

const LEVEL_LABELS: Record<SuccessLevel, string> = {
  unrecorded: 'Not Done',
  recorded: 'Showed Up',
  double: 'Goal Met',
  triple: 'Ideal',
};

const LEVEL_ORDER: SuccessLevel[] = ['unrecorded', 'recorded', 'double', 'triple'];

export function SuccessColorPicker() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const { colors, setSuccessColor, resetColors, isCustom } = useSuccessColors(colorScheme);
  const [editingLevel, setEditingLevel] = useState<SuccessLevel | null>(null);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.gridBackground }]}>
      <View style={styles.headerRow}>
        <ThemedText style={styles.title}>Colors of Success</ThemedText>
        {isCustom && (
          <Pressable onPress={resetColors} style={[styles.resetButton, { borderColor: themeColors.tileBorder }]}>
            <ThemedText style={styles.resetText}>Reset</ThemedText>
          </Pressable>
        )}
      </View>

      <ThemedText style={[styles.subtitle, { color: themeColors.icon }]}>
        Tap a level to customize its color
      </ThemedText>

      {/* Level chips */}
      <View style={styles.levelsRow}>
        {LEVEL_ORDER.map((level) => {
          const isActive = editingLevel === level;
          return (
            <Pressable
              key={level}
              onPress={() => setEditingLevel(isActive ? null : level)}
              style={[
                styles.levelChip,
                { backgroundColor: colors[level] },
                isActive && styles.levelChipActive,
              ]}
            >
              <ThemedText style={styles.levelChipText}>
                {LEVEL_LABELS[level]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {/* Color grid — only shown when a level is selected */}
      {editingLevel && (
        <View style={styles.paletteSection}>
          <ThemedText style={[styles.paletteLabel, { color: themeColors.icon }]}>
            Pick a color for "{LEVEL_LABELS[editingLevel]}"
          </ThemedText>
          <View style={styles.paletteGrid}>
            {PALETTE.map((color) => {
              const isSelected = colors[editingLevel] === color;
              return (
                <Pressable
                  key={color}
                  onPress={() => setSuccessColor(editingLevel, color)}
                  style={[
                    styles.swatch,
                    { backgroundColor: color },
                    isSelected && styles.swatchSelected,
                  ]}
                >
                  {isSelected && (
                    <ThemedText style={styles.checkmark}>✓</ThemedText>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Preview row */}
      <View style={styles.previewSection}>
        <ThemedText style={[styles.previewLabel, { color: themeColors.icon }]}>Preview</ThemedText>
        <View style={styles.previewRow}>
          {LEVEL_ORDER.map((level) => (
            <View key={level} style={styles.previewItem}>
              <View style={[styles.previewTile, { backgroundColor: colors[level] }]} />
              <ThemedText style={[styles.previewText, { color: themeColors.icon }]}>
                {LEVEL_LABELS[level]}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    marginHorizontal: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  resetButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  resetText: {
    fontSize: 12,
    fontWeight: '600',
  },
  levelsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  levelChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  levelChipActive: {
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  levelChipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  paletteSection: {
    marginBottom: 12,
  },
  paletteLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swatchSelected: {
    borderWidth: 2.5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  previewSection: {
    marginTop: 4,
  },
  previewLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  previewItem: {
    alignItems: 'center',
    gap: 4,
  },
  previewTile: {
    width: 40,
    height: 24,
    borderRadius: 4,
  },
  previewText: {
    fontSize: 10,
  },
});
