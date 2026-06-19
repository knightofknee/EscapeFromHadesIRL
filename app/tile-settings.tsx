import { useState, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, ScrollView, TextInput, Pressable, Switch, View, Alert, Modal } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GlyphEditor } from '@/components/habits/glyph-editor';
import { GlyphRenderer } from '@/components/habits/glyph-renderer';
import { Colors } from '@/constants/theme';
import { TILE_COLORS, DEFAULT_TILE_COLOR } from '@/constants/grid';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHabits } from '@/hooks/use-habits';
import { useTodayRecords } from '@/hooks/use-today-records';
import { useUserSettingsContext } from '@/contexts/user-settings-context';
import { consumePendingHabitCallback, clearPendingHabitCallback } from '@/lib/pending-habit-link';
import { addDays, getTodayString } from '@/lib/date-utils';
import type { RecordingMode, GlyphData } from '@/types/habit';
import { requestStepsPermission } from '@/lib/steps-health';
import {
  getNotificationPermissionBucket,
  requestNotificationPermission,
} from '@/lib/meditation-notifications';

type ModeOption = { value: RecordingMode; label: string; description: string; auto?: boolean };

const RECORDING_MODES: ModeOption[] = [
  // quad leads: 3 success tiers feed the tiered quests, so it's the
  // recommended default recording style.
  { value: 'quad', label: 'No / Yes / Goal / Ideal · Recommended', description: 'Tap to cycle through 4 levels — powers tiered quests' },
  { value: 'boolean', label: 'Yes / No', description: 'Tap to toggle' },
  { value: 'triple', label: 'No / Yes / Goal', description: 'Tap to cycle through 3 levels' },
  { value: 'counter', label: 'Counter', description: 'Tap to increment' },
  { value: 'value', label: 'Value', description: 'Enter a value' },
  { value: 'steps', label: 'Steps Counter', description: 'Auto-filled from your step count', auto: true },
  { value: 'meditation', label: 'Meditation', description: 'Tap to start a timer; pause/resume, log sessions', auto: true },
  { value: 'creativeWriting', label: 'Creative Writing', description: "Auto-bumps to 'yes' the first time you write a note today", auto: true },
];

const MANUAL_MODES = RECORDING_MODES.filter((m) => !m.auto);
const AUTO_MODES = RECORDING_MODES.filter((m) => m.auto);

const DEFAULT_MEDITATION_SESSIONS = 1;
const DEFAULT_MEDITATION_MINUTES = 5;
const DEFAULT_MEDITATION_IDEAL_TOTAL_MINUTES = 30;

export default function TileSettingsModal() {
  'use no memo';

  const params = useLocalSearchParams<{
    habitId?: string;
    mode?: string;
    prefillName?: string;
    /** Optional date (YYYY-MM-DD) for per-day edits — defaults to today. */
    date?: string;
  }>();
  const isCreating = params.mode === 'create' || !params.habitId;
  const { habits, createHabit, updateHabit, archiveHabit } = useHabits();
  const { getRecord, recordHabit } = useTodayRecords(params.date);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const existingHabit = habits.find((h) => h.id === params.habitId);

  const [name, setName] = useState(existingHabit?.name ?? params.prefillName ?? '');
  const [abbreviation, setAbbreviation] = useState(existingHabit?.abbreviation ?? '');
  const [icon, setIcon] = useState(existingHabit?.icon ?? '');
  const [recordingMode, setRecordingMode] = useState<RecordingMode>(
    existingHabit?.recordingMode ?? 'boolean',
  );
  const [stepGoals, setStepGoals] = useState<number[]>(existingHabit?.stepGoals ?? []);
  const [meditationSessions, setMeditationSessions] = useState<number>(
    existingHabit?.meditationSessions ?? DEFAULT_MEDITATION_SESSIONS,
  );
  const [meditationMinutes, setMeditationMinutes] = useState<number>(
    existingHabit?.meditationMinutes ?? DEFAULT_MEDITATION_MINUTES,
  );
  const [meditationIdealTotalMinutes, setMeditationIdealTotalMinutes] = useState<number>(
    existingHabit?.meditationIdealTotalMinutes ?? DEFAULT_MEDITATION_IDEAL_TOTAL_MINUTES,
  );
  const [showName, setShowName] = useState<boolean>(existingHabit?.showName ?? false);
  // Global "show name on all tiles" — one on/off for the whole grid, surfaced
  // in every tile's settings. Staged like every other field: the toggle edits
  // local state, Save commits it, Cancel discards it. It must NOT write through
  // on toggle (it used to) — that left Save unable to see it as a change and
  // Cancel unable to undo it.
  const { showAllTileNames: savedShowAllNames, setShowAllTileNames } = useUserSettingsContext();
  const [showAllNames, setShowAllNames] = useState<boolean>(savedShowAllNames);
  const showAllNamesTouched = useRef(false);
  // Until the user actually flips the switch, follow the saved value: the
  // app-wide settings doc can resolve a frame after this screen mounts, and we
  // must not snapshot a stale `false` and write it back on Save.
  useEffect(() => {
    if (!showAllNamesTouched.current) setShowAllNames(savedShowAllNames);
  }, [savedShowAllNames]);
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

  // Scroll-into-view plumbing for the "auto" recording-type subgroup.
  // We capture the auto-section's y in scroll content and each auto tile's
  // y/height within that section, then scroll on auto-mode selection so the
  // selected sits near the top with the previous auto half-visible above.
  const scrollRef = useRef<ScrollView>(null);
  const autoSectionYRef = useRef<number>(0);
  const autoTileLayouts = useRef<Map<RecordingMode, { y: number; height: number }>>(new Map());
  // True only when the user explicitly tapped an auto mode — keeps us from
  // auto-scrolling on initial mount when editing an existing auto habit.
  const userTappedAutoRef = useRef<boolean>(false);

  // Sort autos so the currently-selected one is last. Stable order for the
  // others (driven by AUTO_MODES). When no auto is selected, leave the
  // natural order.
  const sortedAutoModes = useMemo(() => {
    const selectedIsAuto = AUTO_MODES.some((m) => m.value === recordingMode);
    if (!selectedIsAuto) return AUTO_MODES;
    return [
      ...AUTO_MODES.filter((m) => m.value !== recordingMode),
      ...AUTO_MODES.filter((m) => m.value === recordingMode),
    ];
  }, [recordingMode]);

  // After the user taps an auto mode, wait for the reorder to land in
  // layout, then scroll so the selected tile is positioned with the
  // next-to-last auto tile half-visible above it. Also fire the auto
  // mode's required permission request here — declaring intent (picking
  // the type) is the right moment to ask, not later when they tap the
  // tile.
  useEffect(() => {
    if (!userTappedAutoRef.current) return;
    userTappedAutoRef.current = false;
    const selectedIsAuto = AUTO_MODES.some((m) => m.value === recordingMode);
    if (!selectedIsAuto) return;
    const tid = setTimeout(() => {
      const selectedPos = autoTileLayouts.current.get(recordingMode);
      if (selectedPos) {
        const selectedIdx = sortedAutoModes.findIndex((m) => m.value === recordingMode);
        const prevMode = selectedIdx > 0 ? sortedAutoModes[selectedIdx - 1].value : null;
        const prevHeight = prevMode ? autoTileLayouts.current.get(prevMode)?.height ?? 0 : 0;
        const targetY = autoSectionYRef.current + selectedPos.y - prevHeight * 0.5;
        scrollRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
      }
    }, 60);
    // Permission prompts:
    //  - Steps: straight to the iOS Health system sheet (it explains itself).
    //  - Meditation: gate on a status check first. Only show our in-app
    //    pre-prompt when the system permission is `undetermined`. If the
    //    user already granted or denied, skip — iOS won't re-prompt anyway.
    if (recordingMode === 'steps') {
      void requestStepsPermission();
    } else if (recordingMode === 'meditation') {
      void (async () => {
        const bucket = await getNotificationPermissionBucket();
        if (bucket === 'undetermined') setNotifPrePromptVisible(true);
      })();
    }
    return () => clearTimeout(tid);
  }, [recordingMode, sortedAutoModes]);

  // Visibility of the in-app pre-prompt that explains our limited use of
  // notifications BEFORE the iOS system sheet is shown.
  const [notifPrePromptVisible, setNotifPrePromptVisible] = useState<boolean>(false);

  // Clear pending habit callback if user leaves without saving
  useEffect(() => {
    return () => {
      if (!didSave.current) clearPendingHabitCallback();
    };
  }, []);

  // Seed the form only when a DIFFERENT habit loads. Habit objects get new
  // identities on every snapshot (any habit-doc write — e.g. the steps
  // backfill advancing its pointer), and re-seeding mid-edit would wipe the
  // user's typing.
  const seededHabitIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (existingHabit && seededHabitIdRef.current !== existingHabit.id) {
      seededHabitIdRef.current = existingHabit.id;
      setName(existingHabit.name);
      setAbbreviation(existingHabit.abbreviation);
      setIcon(existingHabit.icon ?? '');
      setRecordingMode(existingHabit.recordingMode);
      setStepGoals(existingHabit.stepGoals ?? []);
      setMeditationSessions(existingHabit.meditationSessions ?? DEFAULT_MEDITATION_SESSIONS);
      setMeditationMinutes(existingHabit.meditationMinutes ?? DEFAULT_MEDITATION_MINUTES);
      setMeditationIdealTotalMinutes(
        existingHabit.meditationIdealTotalMinutes ?? DEFAULT_MEDITATION_IDEAL_TOTAL_MINUTES,
      );
      setShowName(existingHabit.showName ?? false);
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

  // Seed sensible defaults when a habit is switched to steps mode:
  // Level 1 = 7,000 (a common "active" threshold), Level 2 = 10,000.
  useEffect(() => {
    if (recordingMode === 'steps' && stepGoals.length === 0) {
      setStepGoals([7000, 10000]);
    }
  }, [recordingMode, stepGoals.length]);

  // Any unsaved edit? Each field compares against the same source its state
  // initializes (and re-syncs) from, so late-arriving data — the habit doc,
  // the counter record, the position index, the app-wide settings doc — never
  // reads as dirty. Drives the pinned Save/Cancel in the nav header below.
  const isDirty =
    name !== (existingHabit?.name ?? params.prefillName ?? '') ||
    abbreviation !== (existingHabit?.abbreviation ?? '') ||
    icon !== (existingHabit?.icon ?? '') ||
    recordingMode !== (existingHabit?.recordingMode ?? 'boolean') ||
    showName !== (existingHabit?.showName ?? false) ||
    showAllNames !== savedShowAllNames ||
    tileSize !== (existingHabit?.tileSize ?? 1) ||
    color !== (existingHabit?.color ?? DEFAULT_TILE_COLOR) ||
    glyph !== existingHabit?.glyph ||
    meditationSessions !== (existingHabit?.meditationSessions ?? DEFAULT_MEDITATION_SESSIONS) ||
    meditationMinutes !== (existingHabit?.meditationMinutes ?? DEFAULT_MEDITATION_MINUTES) ||
    meditationIdealTotalMinutes !==
      (existingHabit?.meditationIdealTotalMinutes ?? DEFAULT_MEDITATION_IDEAL_TOTAL_MINUTES) ||
    JSON.stringify(stepGoals) !== JSON.stringify(existingHabit?.stepGoals ?? []) ||
    (counterInitialized && counterValue !== String(currentCounterValue)) ||
    (positionInitialized && existingHabit != null && position !== currentIndex + 1);

  const canSave = isCreating ? name.trim().length > 0 : isDirty;

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a name for this habit.');
      return;
    }

    const abbr = abbreviation.trim() || name.trim().slice(0, 2).toUpperCase();

    // Sanitize step goals: positive whole numbers, ascending, max 3 levels.
    const cleanGoals = stepGoals
      .map((n) => Math.max(0, Math.round(n)))
      .filter((n) => n > 0)
      .sort((a, b) => a - b)
      .slice(0, 3);
    if (recordingMode === 'steps' && cleanGoals.length === 0) {
      Alert.alert('Step goal required', 'Set at least a Level 1 step goal.');
      return;
    }
    const goalsToSave = recordingMode === 'steps' ? cleanGoals : undefined;

    // Pointer rules (see useStepsBackfill): becoming a steps habit → start
    // confirming with the first full day (yesterday; days before the switch
    // are out of scope); STAYING steps → omit the key entirely, since the
    // backfill may have advanced the pointer after this form snapshotted the
    // habit and writing the snapshot back would regress it; leaving steps →
    // undefined, which updateHabit turns into deleteField.
    const wasSteps = existingHabit?.recordingMode === 'steps';
    const stepsPointerUpdate =
      recordingMode === 'steps'
        ? wasSteps
          ? {}
          : { stepsConfirmedThrough: addDays(getTodayString(), -1) }
        : wasSteps
          ? { stepsConfirmedThrough: undefined }
          : {};

    // Only persist meditation config when this habit IS a meditation habit;
    // otherwise drop the fields so switching away cleans up the doc.
    const isMeditation = recordingMode === 'meditation';
    const meditationSessionsToSave = isMeditation ? Math.max(1, Math.round(meditationSessions)) : undefined;
    const meditationMinutesToSave = isMeditation ? Math.max(1, Math.round(meditationMinutes)) : undefined;
    const meditationIdealTotalMinutesToSave = isMeditation
      ? Math.max(1, Math.round(meditationIdealTotalMinutes))
      : undefined;

    // Commit the staged global "show name on all tiles" toggle (app-wide, not
    // part of the habit doc) — deferred to Save so Cancel can discard it.
    if (showAllNames !== savedShowAllNames) {
      setShowAllTileNames(showAllNames);
    }

    if (isCreating) {
      // Find next available position
      const maxRow = habits.reduce((max, h) => Math.max(max, h.position.row), -1);
      const newHabit = await createHabit({
        name: name.trim(),
        abbreviation: abbr,
        icon: icon.trim() || undefined,
        glyph: glyph && glyph.paths.length > 0 ? glyph : undefined,
        recordingMode,
        stepGoals: goalsToSave,
        ...(recordingMode === 'steps'
          ? { stepsConfirmedThrough: addDays(getTodayString(), -1) }
          : {}),
        meditationSessions: meditationSessionsToSave,
        meditationMinutes: meditationMinutesToSave,
        meditationIdealTotalMinutes: meditationIdealTotalMinutesToSave,
        showName,
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
        stepGoals: goalsToSave,
        ...stepsPointerUpdate,
        meditationSessions: meditationSessionsToSave,
        meditationMinutes: meditationMinutesToSave,
        meditationIdealTotalMinutes: meditationIdealTotalMinutesToSave,
        showName,
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
      {/* Custom header (native bar hidden — see root layout): plain-text
          buttons, no system capsules. Cancel is always available; Save is
          always visible but disabled/grayed until something is edited. */}
      <SafeAreaView edges={['top']}>
        <View style={styles.navHeader}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText style={[styles.cancelText, { color: colors.tint }]}>Cancel</ThemedText>
          </Pressable>
          <View style={styles.navTitleWrap} pointerEvents="none">
            <ThemedText style={styles.navTitle}>Habit Settings</ThemedText>
          </View>
          {/* Create mode enables Save whenever the name is valid — a
              prefilled form (quest flow's prefillName) starts clean, and a
              dirty-only gate would leave Save dead with no explanation. */}
          <Pressable onPress={handleSave} disabled={!canSave} hitSlop={8}>
            <ThemedText
              style={[
                styles.headerSaveText,
                { color: canSave ? colors.tint : colors.icon },
                !canSave && styles.headerSaveDisabled,
              ]}
            >
              Save
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent}>
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

        {/* Show Name — when on, the habit's name renders at the bottom of the
            tile below any counter/value/step subtitle. Off by default. While
            the global "all tiles" switch is on it takes over: this row grays
            out, shows the effective ON state, and can't be toggled. The
            stored per-tile value is untouched, so turning the global off
            restores each tile's own setting. */}
        <View style={[styles.toggleRow, showAllNames && { opacity: 0.4 }]}>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontSize: 14, fontWeight: '600' }}>Show name on tile</ThemedText>
            <ThemedText style={{ fontSize: 12, opacity: 0.6 }}>
              {showAllNames
                ? 'On for every tile — controlled by the switch below.'
                : 'Adds the name as a small label at the bottom of the tile.'}
            </ThemedText>
          </View>
          <Switch
            value={showAllNames ? true : showName}
            onValueChange={setShowName}
            disabled={showAllNames}
            trackColor={{ false: colors.tileBorder, true: colors.tint }}
            thumbColor="#fff"
          />
        </View>

        {/* Show name on ALL tiles — one global setting for the whole grid,
            shown in every tile's settings for convenience. Staged: it commits
            on Save and is discarded on Cancel, like every other field. */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontSize: 14, fontWeight: '600' }}>Show name on all tiles</ThemedText>
            <ThemedText style={{ fontSize: 12, opacity: 0.6 }}>
              One switch for every tile — overrides the per-tile setting above.
            </ThemedText>
          </View>
          <Switch
            value={showAllNames}
            onValueChange={(v) => {
              showAllNamesTouched.current = true;
              setShowAllNames(v);
            }}
            trackColor={{ false: colors.tileBorder, true: colors.tint }}
            thumbColor="#fff"
          />
        </View>

        {/* Abbreviation */}
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Abbreviation (1-2 letters)
        </ThemedText>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.tileBorder }]}
          value={abbreviation}
          onChangeText={(t) => setAbbreviation(t.slice(0, 4))}
          placeholder={name ? name.slice(0, 1).toUpperCase() : 'E'}
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
          {MANUAL_MODES.map((mode) => (
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

        {/* Small gap + 'auto' label separating manual from automated modes.
            The selected auto mode floats to the bottom of this subgroup so
            its config UI (rendered just below) sits adjacent to it. */}
        <ThemedText style={styles.autoLabel}>auto</ThemedText>
        <View
          style={styles.optionGroup}
          onLayout={(e) => {
            autoSectionYRef.current = e.nativeEvent.layout.y;
          }}
        >
          {sortedAutoModes.map((mode) => (
            <Pressable
              key={mode.value}
              onLayout={(e) => {
                autoTileLayouts.current.set(mode.value, {
                  y: e.nativeEvent.layout.y,
                  height: e.nativeEvent.layout.height,
                });
              }}
              style={[
                styles.optionButton,
                {
                  borderColor: recordingMode === mode.value ? colors.tint : colors.tileBorder,
                  backgroundColor:
                    recordingMode === mode.value ? `${colors.tint}20` : 'transparent',
                },
              ]}
              onPress={() => {
                userTappedAutoRef.current = true;
                setRecordingMode(mode.value);
              }}
            >
              <ThemedText type="defaultSemiBold" style={{ fontSize: 14 }}>
                {mode.label}
              </ThemedText>
              <ThemedText style={{ fontSize: 12, opacity: 0.6 }}>{mode.description}</ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Step goals (steps mode) */}
        {recordingMode === 'steps' && (
          <>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Step Goals
            </ThemedText>
            {stepGoals.map((goal, i) => (
              <View key={i} style={styles.goalRow}>
                <ThemedText style={styles.goalLabel}>Level {i + 1}</ThemedText>
                <TextInput
                  style={[styles.goalInput, { color: colors.text, borderColor: colors.tileBorder }]}
                  value={goal ? goal.toLocaleString() : ''}
                  onChangeText={(t) => {
                    const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                    setStepGoals((prev) => {
                      const next = [...prev];
                      next[i] = isNaN(n) ? 0 : n;
                      return next;
                    });
                  }}
                  keyboardType="number-pad"
                  placeholder="10,000"
                  placeholderTextColor={colors.icon}
                  maxLength={9}
                />
                <ThemedText style={styles.goalUnit}>steps</ThemedText>
                {stepGoals.length > 1 && i === stepGoals.length - 1 && (
                  <Pressable
                    style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
                    onPress={() => setStepGoals((prev) => prev.slice(0, -1))}
                  >
                    <ThemedText style={styles.stepperText}>−</ThemedText>
                  </Pressable>
                )}
              </View>
            ))}
            {stepGoals.length < 3 && (
              <Pressable
                style={[styles.addLevelButton, { borderColor: colors.tint }]}
                onPress={() => setStepGoals((prev) => [...prev, 0])}
              >
                <ThemedText style={[styles.addLevelText, { color: colors.tint }]}>+ Add Level</ThemedText>
              </Pressable>
            )}
            <ThemedText style={styles.hint}>
              Level 1 is required. Higher goals light up the next tier — a circle
              for Level 2, a star for Level 3.
            </ThemedText>
          </>
        )}

        {/* Meditation config (meditation mode) — labels on their own row
            above the steppers (same layout as Relative Size / Position) so
            "Sessions/day" and "Minutes/session" don't wrap. */}
        {recordingMode === 'meditation' && (
          <>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Sessions per day
            </ThemedText>
            <View style={styles.sizeRow}>
              <Pressable
                style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
                onPress={() => setMeditationSessions((n) => Math.max(1, n - 1))}
              >
                <ThemedText style={styles.stepperText}>−</ThemedText>
              </Pressable>
              <TextInput
                style={[styles.sizeInput, { color: colors.text, borderColor: colors.tileBorder }]}
                value={String(meditationSessions)}
                onChangeText={(t) => {
                  const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                  if (!isNaN(n)) setMeditationSessions(Math.max(1, Math.min(20, n)));
                  else if (t === '') setMeditationSessions(1);
                }}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Pressable
                style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
                onPress={() => setMeditationSessions((n) => Math.min(20, n + 1))}
              >
                <ThemedText style={styles.stepperText}>+</ThemedText>
              </Pressable>
            </View>

            <ThemedText type="defaultSemiBold" style={styles.label}>
              Minutes per session
            </ThemedText>
            <View style={styles.sizeRow}>
              <Pressable
                style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
                onPress={() => setMeditationMinutes((n) => Math.max(1, n - 1))}
              >
                <ThemedText style={styles.stepperText}>−</ThemedText>
              </Pressable>
              <TextInput
                style={[styles.sizeInput, { color: colors.text, borderColor: colors.tileBorder }]}
                value={String(meditationMinutes)}
                onChangeText={(t) => {
                  const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                  if (!isNaN(n)) setMeditationMinutes(Math.max(1, Math.min(180, n)));
                  else if (t === '') setMeditationMinutes(1);
                }}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Pressable
                style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
                onPress={() => setMeditationMinutes((n) => Math.min(180, n + 1))}
              >
                <ThemedText style={styles.stepperText}>+</ThemedText>
              </Pressable>
            </View>

            <ThemedText type="defaultSemiBold" style={styles.label}>
              Ideal total minutes
            </ThemedText>
            <View style={styles.sizeRow}>
              <Pressable
                style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
                onPress={() => setMeditationIdealTotalMinutes((n) => Math.max(1, n - 5))}
              >
                <ThemedText style={styles.stepperText}>−</ThemedText>
              </Pressable>
              <TextInput
                style={[styles.sizeInput, { color: colors.text, borderColor: colors.tileBorder }]}
                value={String(meditationIdealTotalMinutes)}
                onChangeText={(t) => {
                  const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                  if (!isNaN(n)) setMeditationIdealTotalMinutes(Math.max(1, Math.min(600, n)));
                  else if (t === '') setMeditationIdealTotalMinutes(1);
                }}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Pressable
                style={[styles.stepperButton, { borderColor: colors.tileBorder }]}
                onPress={() => setMeditationIdealTotalMinutes((n) => Math.min(600, n + 5))}
              >
                <ThemedText style={styles.stepperText}>+</ThemedText>
              </Pressable>
            </View>

            <ThemedText style={styles.hint}>
              Any session counts as a first-level win. Hitting your target sessions
              of at least your set minutes each lights up the circle (goal).
              Meditating {meditationIdealTotalMinutes} total minutes in a day lights
              up the star (ideal).
            </ThemedText>
          </>
        )}

        {/* Creative Writing — no goals to configure, just an explanation of
            how the auto-bump behaves. Wording locked with the user. */}
        {recordingMode === 'creativeWriting' && (
          <ThemedText style={styles.hint}>
            Writing or editing the first non-checklist note of the day marks
            this tile &quot;yes.&quot; After that we don&apos;t touch it again today —
            even if you tap it back to zero. Tap the tile yourself for goal
            or ideal. Checklists don&apos;t count toward this habit.
          </ThemedText>
        )}

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

        {/* Save/Cancel live solely in the pinned header now. */}
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

      {/* Notification pre-prompt — shown only when the user picks Meditation
          for the first time (system permission undetermined). Wording is
          locked with the user; "Continue" triggers the iOS system sheet,
          "Not now" closes without ever calling iOS so the system prompt is
          preserved for next time. */}
      <Modal
        visible={notifPrePromptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotifPrePromptVisible(false)}
      >
        <Pressable style={styles.notifOverlay} onPress={() => setNotifPrePromptVisible(false)}>
          <Pressable
            style={[styles.notifSheet, { backgroundColor: colors.tileBackground }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ThemedText type="defaultSemiBold" style={styles.notifTitle}>
              Allow meditation alarm?
            </ThemedText>
            <ThemedText style={styles.notifBody}>
              Notifications let your timer ring on time — even when the app
              is closed or your phone is locked. That&apos;s the only thing we
              use them for. We won&apos;t send anything else.
            </ThemedText>
            <View style={styles.notifButtons}>
              <Pressable
                style={[styles.notifSecondary, { borderColor: colors.tileBorder }]}
                onPress={() => setNotifPrePromptVisible(false)}
              >
                <ThemedText style={styles.notifSecondaryText}>Not now</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.notifPrimary, { backgroundColor: colors.tint }]}
                onPress={async () => {
                  setNotifPrePromptVisible(false);
                  await requestNotificationPermission();
                }}
              >
                <ThemedText style={styles.notifPrimaryText}>Continue</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    // Tight to the nav header — the title row that used to occupy this
    // space is gone, so a big top inset just reads as dead space.
    paddingTop: 8,
    gap: 8,
    paddingBottom: 40,
  },
  // Custom header row — plain text buttons, centered title, no capsules.
  navHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  navTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerSaveText: {
    fontWeight: '600',
    fontSize: 16,
  },
  headerSaveDisabled: {
    opacity: 0.4,
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
  autoLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.5,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  goalLabel: {
    width: 56,
    fontSize: 14,
    fontWeight: '600',
  },
  goalInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  goalUnit: {
    fontSize: 13,
    opacity: 0.6,
  },
  addLevelButton: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  addLevelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    opacity: 0.6,
    lineHeight: 16,
    marginTop: 4,
  },
  notifOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
  },
  notifSheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    padding: 20,
    gap: 14,
  },
  notifTitle: {
    fontSize: 17,
    textAlign: 'center',
  },
  notifBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    opacity: 0.85,
  },
  notifButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  notifSecondary: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifSecondaryText: {
    fontWeight: '600',
    fontSize: 14,
  },
  notifPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
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
