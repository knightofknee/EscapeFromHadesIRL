import { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TextInput, Pressable, View, Alert, Modal } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GlyphEditor } from '@/components/habits/glyph-editor';
import { GlyphRenderer } from '@/components/habits/glyph-renderer';
import { Colors } from '@/constants/theme';
import { TILE_COLORS, DEFAULT_TILE_COLOR } from '@/constants/grid';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHabits } from '@/hooks/use-habits';
import type { RecordingMode, TileSize, GlyphData } from '@/types/habit';

const RECORDING_MODES: { value: RecordingMode; label: string; description: string }[] = [
  { value: 'boolean', label: 'Yes / No', description: 'Tap to toggle' },
  { value: 'triple', label: 'No / Yes / Double', description: 'Tap to cycle' },
  { value: 'counter', label: 'Counter', description: 'Tap to increment' },
  { value: 'value', label: 'Value', description: 'Enter a value' },
];

const TILE_SIZES: { value: TileSize; label: string }[] = [
  { value: '1x1', label: '1×1' },
  { value: '2x1', label: '2×1' },
  { value: '1x2', label: '1×2' },
  { value: '2x2', label: '2×2' },
];

export default function TileSettingsModal() {
  const params = useLocalSearchParams<{ habitId?: string; mode?: string }>();
  const isCreating = params.mode === 'create' || !params.habitId;
  const { habits, createHabit, updateHabit, archiveHabit } = useHabits();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const existingHabit = habits.find((h) => h.id === params.habitId);

  const [name, setName] = useState(existingHabit?.name ?? '');
  const [abbreviation, setAbbreviation] = useState(existingHabit?.abbreviation ?? '');
  const [icon, setIcon] = useState(existingHabit?.icon ?? '');
  const [recordingMode, setRecordingMode] = useState<RecordingMode>(
    existingHabit?.recordingMode ?? 'boolean',
  );
  const [tileSize, setTileSize] = useState<TileSize>(existingHabit?.tileSize ?? '1x1');
  const [color, setColor] = useState(existingHabit?.color ?? DEFAULT_TILE_COLOR);
  const [glyph, setGlyph] = useState<GlyphData | undefined>(existingHabit?.glyph);
  const [showGlyphEditor, setShowGlyphEditor] = useState(false);

  useEffect(() => {
    if (existingHabit) {
      setName(existingHabit.name);
      setAbbreviation(existingHabit.abbreviation);
      setIcon(existingHabit.icon ?? '');
      setRecordingMode(existingHabit.recordingMode);
      setTileSize(existingHabit.tileSize);
      setColor(existingHabit.color);
      setGlyph(existingHabit.glyph);
    }
  }, [existingHabit]);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a name for this habit.');
      return;
    }

    const abbr = abbreviation.trim() || name.trim().slice(0, 2).toUpperCase();

    if (isCreating) {
      // Find next available position
      const maxRow = habits.reduce((max, h) => Math.max(max, h.position.row), -1);
      await createHabit({
        name: name.trim(),
        abbreviation: abbr,
        icon: icon.trim() || undefined,
        glyph: glyph && glyph.paths.length > 0 ? glyph : undefined,
        recordingMode,
        tileSize,
        position: { row: maxRow + 1, col: 0 },
        color,
        isArchived: false,
      });
    } else if (existingHabit) {
      await updateHabit(existingHabit.id, {
        name: name.trim(),
        abbreviation: abbr,
        icon: icon.trim() || undefined,
        glyph: glyph && glyph.paths.length > 0 ? glyph : undefined,
        recordingMode,
        tileSize,
        color,
      });
    }

    router.back();
  }

  function handleDelete() {
    if (!existingHabit) return;
    Alert.alert(
      'Archive Habit',
      `Archive "${existingHabit.name}"? It will be hidden but data will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            await archiveHabit(existingHabit.id);
            router.back();
          },
        },
      ],
    );
  }

  function handleGlyphSave(newGlyph: GlyphData) {
    setGlyph(newGlyph.paths.length > 0 ? newGlyph : undefined);
    setShowGlyphEditor(false);
  }

  const hasGlyph = glyph && glyph.paths.length > 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.modalHeader}>
          <ThemedText type="title" style={styles.sectionTitle}>
            {isCreating ? 'New Habit' : 'Edit Habit'}
          </ThemedText>
          <Pressable onPress={() => router.back()} style={styles.cancelLink}>
            <ThemedText style={[styles.cancelText, { color: colors.tint }]}>Cancel</ThemedText>
          </Pressable>
        </View>

        {/* Name */}
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Name
        </ThemedText>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.tileBorder }]}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Exercise"
          placeholderTextColor={colors.icon}
          autoFocus={isCreating}
        />

        {/* Abbreviation */}
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Abbreviation (1-2 letters)
        </ThemedText>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.tileBorder }]}
          value={abbreviation}
          onChangeText={(t) => setAbbreviation(t.slice(0, 4))}
          placeholder={name ? name.slice(0, 2).toUpperCase() : 'Ex'}
          placeholderTextColor={colors.icon}
        />

        {/* Icon (optional) */}
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Icon (emoji, optional — overrides abbreviation)
        </ThemedText>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.tileBorder }]}
          value={icon}
          onChangeText={(t) => setIcon(t.slice(0, 2))}
          placeholder="🏃"
          placeholderTextColor={colors.icon}
        />

        {/* Custom Drawn Symbol */}
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Custom Symbol (draw your own — overrides icon & abbreviation)
        </ThemedText>
        <View style={styles.glyphRow}>
          {hasGlyph ? (
            <View
              style={[
                styles.glyphPreview,
                { backgroundColor: colors.tileBackground, borderColor: color },
              ]}
            >
              <GlyphRenderer glyph={glyph!} width={60} height={60} />
            </View>
          ) : (
            <View
              style={[
                styles.glyphPreview,
                { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder },
              ]}
            >
              <ThemedText style={{ opacity: 0.3, fontSize: 12 }}>None</ThemedText>
            </View>
          )}
          <View style={styles.glyphActions}>
            <Pressable
              style={[styles.glyphButton, { backgroundColor: colors.tint }]}
              onPress={() => setShowGlyphEditor(true)}
            >
              <ThemedText style={styles.glyphButtonText}>
                {hasGlyph ? 'Redraw' : 'Draw Symbol'}
              </ThemedText>
            </Pressable>
            {hasGlyph && (
              <Pressable
                style={[styles.glyphButton, { backgroundColor: '#E74C3C' }]}
                onPress={() => setGlyph(undefined)}
              >
                <ThemedText style={styles.glyphButtonText}>Remove</ThemedText>
              </Pressable>
            )}
          </View>
        </View>

        {/* Recording Mode */}
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Recording Type
        </ThemedText>
        <View style={styles.optionGroup}>
          {RECORDING_MODES.map((mode) => (
            <Pressable
              key={mode.value}
              style={[
                styles.optionButton,
                {
                  borderColor: recordingMode === mode.value ? colors.tint : colors.tileBorder,
                  backgroundColor:
                    recordingMode === mode.value ? `${colors.tint}20` : 'transparent',
                },
              ]}
              onPress={() => setRecordingMode(mode.value)}
            >
              <ThemedText type="defaultSemiBold" style={{ fontSize: 14 }}>
                {mode.label}
              </ThemedText>
              <ThemedText style={{ fontSize: 12, opacity: 0.6 }}>{mode.description}</ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Tile Size */}
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Tile Size
        </ThemedText>
        <View style={styles.sizeRow}>
          {TILE_SIZES.map((size) => (
            <Pressable
              key={size.value}
              style={[
                styles.sizeButton,
                {
                  borderColor: tileSize === size.value ? colors.tint : colors.tileBorder,
                  backgroundColor:
                    tileSize === size.value ? `${colors.tint}20` : 'transparent',
                },
              ]}
              onPress={() => setTileSize(size.value)}
            >
              <ThemedText type="defaultSemiBold">{size.label}</ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Color */}
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Color
        </ThemedText>
        <View style={styles.colorGrid}>
          {TILE_COLORS.map((c) => (
            <Pressable
              key={c}
              style={[
                styles.colorSwatch,
                {
                  backgroundColor: c,
                  borderWidth: color === c ? 3 : 0,
                  borderColor: colors.text,
                },
              ]}
              onPress={() => setColor(c)}
            />
          ))}
        </View>

        {/* Preview */}
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Preview
        </ThemedText>
        <View style={[styles.preview, { backgroundColor: colors.tileBackground, borderColor: color }]}>
          {hasGlyph ? (
            <GlyphRenderer glyph={glyph!} width={60} height={60} />
          ) : (
            <ThemedText style={{ color, fontWeight: '700', fontSize: 20 }}>
              {icon || abbreviation || name.slice(0, 2).toUpperCase() || '??'}
            </ThemedText>
          )}
        </View>

        {/* Actions */}
        <Pressable style={[styles.saveButton, { backgroundColor: colors.tint }]} onPress={handleSave}>
          <ThemedText style={styles.saveText}>{isCreating ? 'Create Habit' : 'Save Changes'}</ThemedText>
        </Pressable>

        {!isCreating && (
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <ThemedText style={styles.deleteText}>Archive Habit</ThemedText>
          </Pressable>
        )}
      </ScrollView>

      {/* Glyph Editor Modal */}
      <Modal visible={showGlyphEditor} animationType="slide" presentationStyle="fullScreen">
        <GlyphEditor
          initialGlyph={glyph}
          habitColor={color}
          onSave={handleGlyphSave}
          onCancel={() => setShowGlyphEditor(false)}
        />
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 8,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    marginBottom: 16,
  },
  cancelLink: {
    padding: 8,
    marginBottom: 16,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  label: {
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  optionGroup: {
    gap: 8,
  },
  optionButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 2,
  },
  sizeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sizeButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  preview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginVertical: 8,
  },
  saveButton: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  saveText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  deleteButton: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  deleteText: {
    color: '#E74C3C',
    fontWeight: '600',
    fontSize: 16,
  },
  // Glyph section
  glyphRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  glyphPreview: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glyphActions: {
    gap: 8,
    flex: 1,
  },
  glyphButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  glyphButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
