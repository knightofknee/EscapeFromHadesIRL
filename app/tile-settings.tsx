import { useState, useEffect, useRef } from 'react';
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
import { useTodayRecords } from '@/hooks/use-today-records';
import { consumePendingHabitCallback, clearPendingHabitCallback } from '@/lib/pending-habit-link';
import type { RecordingMode, GlyphData } from '@/types/habit';

const RECORDING_MODES: { value: RecordingMode; label: string; description: string }[] = [
  { value: 'boolean', label: 'Yes / No', description: 'Tap to toggle' },
  { value: 'triple', label: 'No / Yes / Goal', description: 'Tap to cycle through 3 levels' },
  { value: 'quad', label: 'No / Yes / Goal / Ideal', description: 'Tap to cycle through 4 levels' },
  { value: 'counter', label: 'Counter', description: 'Tap to increment' },
  { value: 'value', label: 'Value', description: 'Enter a value' },
];

export default function TileSettingsModal() {
  const params = useLocalSearchParams<{ habitId?: string; mode?: string; prefillName?: string }>();
  const isCreating = params.mode === 'create' || !params.habitId;
  const { habits, createHabit, updateHabit, archiveHabit } = useHabits();
  const { getRecord, recordHabit } = useTodayRecords();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const existingHabit = habits.find((h) => h.id === params.habitId);

  const [name, setName] = useState(existingHabit?.name ?? params.prefillName ?? '');
  const [abbreviation, setAbbreviation] = useState(existingHabit?.abbreviation ?? '');
  const [icon, setIcon] = useState(existingHabit?.icon ?? '');
  const [recordingMode, setRecordingMode] = useState<RecordingMode>(
    existingHabit?.recordingMode ?? 'boolean',
  );
  const [tileSize, setTileSize] = useState<number>(existingHabit?.tileSize ?? 1);

  // Compute current display order for position control
  const sortedHabits = [...habits].sort(
    (a, b) => a.position.row * 100 + a.position.col - (b.position.row * 100 + b.position.col),
  );
  const totalHabits = habits.length;
  const currentIndex = existingHabit ? sortedHabits.findIndex((h) => h.id === existingHabit.id) : -1;
  const [position, setPosition] = useState<number>(1);
  const [positionInitialized, setPositionInitialized] = useState(false);
  const existingRecord = existingHabit ? getRecord(existingHabit.id) : undefined;
  const currentCounterValue = (existingRecord?.value as number) ?? 0;
  const [counterValue, setCounterValue] = useState<string>(String(currentCounterValue));
  const [counterInitialized, setCounterInitialized] = useState(false);
  const [color, setColor] = useState(existingHabit?.color ?? DEFAULT_TILE_COLOR);
  const [glyph, setGlyph] = useState<GlyphData | undefined>(existingHabit?.glyph);
  const [showGlyphEditor, setShowGlyphEditor] = useState(false);
  const didSave = useRef(false);

  // Clear pending habit callback if user leaves without saving
  useEffect(() => {
    return () => {
      if (!didSave.current) clearPendingHabitCallback();
    };
  }, []);

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

  // Set position once habits are loaded
  useEffect(() => {
    if (!positionInitialized && currentIndex >= 0) {
      setPosition(currentIndex + 1);
      setPositionInitialized(true);
    }
  }, [currentIndex, positionInitialized]);

  // Sync counter value once record loads
  useEffect(() => {
    if (!counterInitialized && existingRecord && existingHabit?.recordingMode === 'counter') {
      setCounterValue(String((existingRecord.value as number) ?? 0));
      setCounterInitialized(true);
    }
  }, [existingRecord, counterInitialized, existingHabit]);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a name for this habit.');
      return;
    }

    const abbr = abbreviation.trim() || name.trim().slice(0, 2).toUpperCase();

    if (isCreating) {
      // Find next available position
      const maxRow = habits.reduce((max, h) => Math.max(max, h.position.row), -1);
      const newHabit = await createHabit({
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
      if (newHabit) {
        didSave.current = true;
        consumePendingHabitCallback(newHabit.id);
      }
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

      // Save counter value if changed
      if (recordingMode === 'counter') {
        const newVal = parseInt(counterValue, 10) || 0;
        if (newVal !== currentCounterValue) {
          recordHabit(existingHabit.id, newVal);
        }
      }

      // Reorder if position changed
      const oldIndex = currentIndex;
      const newIndex = position - 1;
      if (oldIndex >= 0 && oldIndex !== newIndex) {
        // Remove from old position, insert at new position
        const reordered = sortedHabits.filter((h) => h.id !== existingHabit.id);
        reordered.splice(newIndex, 0, existingHabit);
        // Update positions for all affected habits
        const updates = reordered.map((h, i) => ({
          id: h.id,
          position: { row: i, col: 0 },
        }));
        await Promise.all(
          updates
            .filter((u) => {
              const orig = habits.find((h) => h.id === u.id);
              return orig && (orig.position.row !== u.position.row || orig.position.col !== u.position.col);
            })
            .map((u) => updateHabit(u.id, { position: u.position })),
        );
      }
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
          <View style={styles.headerActions}>
            <Pressable style={[styles.headerSave, { backgroundColor: colors.tint }]} onPress={handleSave}>
              <ThemedText style={styles.headerSaveText}>Save</ThemedText>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.cancelLink}>
              <ThemedText style={[styles.cancelText, { color: colors.tint }]}>Cancel</ThemedText>
            </Pressable>
          </View>
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

        {/* Counter direct edit (only for existing counter habits) */}
        {!isCreating && recordingMode === 'counter' && (
          <>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Edit Directly
            </ThemedText>
            <View style={styles.sizeRow}>
              <Pressable
                style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
                onPress={() => setCounterValue((v) => String(Math.max(0, (parseInt(v, 10) || 0) - 1)))}
              >
                <ThemedText style={styles.stepperText}>−</ThemedText>
              </Pressable>
              <TextInput
                style={[styles.sizeInput, { color: colors.text, borderColor: colors.tileBorder }]}
                value={counterValue}
                onChangeText={(t) => {
                  const n = parseInt(t, 10);
                  if (!isNaN(n)) setCounterValue(String(Math.max(0, n)));
                  else if (t === '') setCounterValue('0');
                }}
                keyboardType="number-pad"
                maxLength={6}
              />
              <Pressable
                style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
                onPress={() => setCounterValue((v) => String((parseInt(v, 10) || 0) + 1))}
              >
                <ThemedText style={styles.stepperText}>+</ThemedText>
              </Pressable>
            </View>
          </>
        )}

        {/* Tile Size */}
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Relative Size
        </ThemedText>
        <View style={styles.sizeRow}>
          <Pressable
            style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
            onPress={() => setTileSize((s) => Math.max(1, s - 1))}
          >
            <ThemedText style={styles.stepperText}>−</ThemedText>
          </Pressable>
          <TextInput
            style={[styles.sizeInput, { color: colors.text, borderColor: colors.tileBorder }]}
            value={String(tileSize)}
            onChangeText={(t) => {
              const n = parseInt(t, 10);
              if (!isNaN(n)) setTileSize(Math.max(1, Math.min(100, n)));
              else if (t === '') setTileSize(1);
            }}
            keyboardType="number-pad"
            maxLength={3}
          />
          <Pressable
            style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
            onPress={() => setTileSize((s) => Math.min(100, s + 1))}
          >
            <ThemedText style={styles.stepperText}>+</ThemedText>
          </Pressable>
        </View>

        {/* Position (only for existing habits) */}
        {!isCreating && totalHabits > 1 && (
          <>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Position
            </ThemedText>
            <View style={styles.sizeRow}>
              <Pressable
                style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
                onPress={() => setPosition((p) => Math.max(1, p - 1))}
              >
                <ThemedText style={styles.stepperText}>−</ThemedText>
              </Pressable>
              <TextInput
                style={[styles.sizeInput, { color: colors.text, borderColor: colors.tileBorder }]}
                value={String(position)}
                onChangeText={(t) => {
                  const n = parseInt(t, 10);
                  if (!isNaN(n)) setPosition(Math.max(1, Math.min(totalHabits, n)));
                  else if (t === '') setPosition(1);
                }}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Pressable
                style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
                onPress={() => setPosition((p) => Math.min(totalHabits, p + 1))}
              >
                <ThemedText style={styles.stepperText}>+</ThemedText>
              </Pressable>
            </View>
          </>
        )}

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

        {isCreating && (
          <Pressable style={styles.reviveLink} onPress={() => router.push('/revive-habit')}>
            <ThemedText style={[styles.reviveLinkText, { color: colors.icon }]}>
              Revive Archived Habit
            </ThemedText>
          </Pressable>
        )}

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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  headerSave: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  headerSaveText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelLink: {
    padding: 8,
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
    alignItems: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperText: {
    fontSize: 24,
    fontWeight: '600',
  },
  sizeInput: {
    width: 64,
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
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
  reviveLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  reviveLinkText: {
    fontSize: 13,
    fontWeight: '500',
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
