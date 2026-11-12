import { useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSuccessColors } from '@/hooks/use-success-colors';
import type { SuccessLevel } from '@/hooks/use-success-colors';
import { COLOR_PALETTE, isPaletteColor } from '@/constants/grid';
import { ColorHexField } from '@/components/ui/color-field';

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
  const [customOpen, setCustomOpen] = useState(false);
  const editingColor = editingLevel ? colors[editingLevel] : null;
  const isCustomEditing = editingColor != null && !isPaletteColor(editingColor);

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
              onPress={() => {
                setCustomOpen(false);
                setEditingLevel(isActive ? null : level);
              }}
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
            Pick a color for &ldquo;{LEVEL_LABELS[editingLevel]}&rdquo;
          </ThemedText>
          <View style={styles.paletteGrid}>
            {COLOR_PALETTE.map((color) => {
              const isSelected = colors[editingLevel].toUpperCase() === color;
              return (
                <Pressable
                  key={color}
                  onPress={() => {
                    setCustomOpen(false);
                    setSuccessColor(editingLevel, color);
                  }}
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
            {/* Custom: any #RRGGBB. Shows the custom color once one is chosen. */}
            <Pressable
              onPress={() => setCustomOpen((open) => !open)}
              style={[
                styles.swatch,
                isCustomEditing
                  ? { backgroundColor: colors[editingLevel] }
                  : { backgroundColor: themeColors.tileBackground, borderWidth: 1, borderColor: themeColors.tileBorder },
                isCustomEditing && styles.swatchSelected,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Custom color"
            >
              <ThemedText style={[styles.checkmark, !isCustomEditing && { color: themeColors.text }]}>+</ThemedText>
            </Pressable>
          </View>
          {customOpen && (
            <ColorHexField
              key={editingLevel}
              value={colors[editingLevel]}
              onChange={(hex) => setSuccessColor(editingLevel, hex)}
              autoFocus
            />
          )}
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
