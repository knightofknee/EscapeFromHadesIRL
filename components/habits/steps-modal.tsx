import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { persistHabitRecord } from '@/lib/persist-record';
import { computeStepsLevel, levelForStepsQuad } from '@/lib/steps';
import {
  getStepsForDay,
  isStepsHealthAvailable,
  openStepsHealthSettings,
  requestStepsPermission,
} from '@/lib/steps-health';
import type { Habit, HabitRecord } from '@/types/habit';

// Walkthrough for turning steps access back on after it was denied. iOS
// never re-shows its one-shot sheet, so the Health app is the only path;
// Health Connect keeps permissions in its own settings screen. The lines
// describe what to do AFTER the open button below them.
const HEALTH_SETTINGS_BUTTON = Platform.OS === 'android' ? 'Open Health Connect' : 'Open Health';
const HEALTH_SETTINGS_STEPS =
  Platform.OS === 'android'
    ? [
        'Tap App permissions.',
        'Tap Escape from Hades IRL.',
        'Turn on Steps.',
        'Come back here and tap Refresh.',
      ]
    : [
        'Tap your profile picture at the top right.',
        'Tap Apps, under Privacy.',
        'Tap Escape from Hades IRL.',
        'Turn on Steps.',
        'Come back here and tap Refresh.',
      ];

type StepsModalProps = {
  visible: boolean;
  habit: Habit | null;
  record: HabitRecord | undefined;
  date: string;
  userId: string;
  onClose: () => void;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'needs-permission' }
  | { kind: 'loading' }
  | { kind: 'ready'; steps: number }
  | { kind: 'error'; message: string };

/**
 * Tap-on-tile modal for Steps Counter habits. On open, checks HealthKit
 * availability and reads the day's step count, then persists tier + raw
 * steps to the record so the tile updates without the user having to do
 * anything else. First open prompts for HealthKit permission.
 */
export function StepsModal({
  visible,
  habit,
  record,
  date,
  userId,
  onClose,
}: StepsModalProps) {
  'use no memo';
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Memoized: a fresh [] each render would churn the persist/fetch
  // callbacks' deps (and trips the React Compiler's memoization check).
  const goals = useMemo(() => habit?.stepGoals ?? [], [habit]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // "Not seeing your steps?" disclosure in the ready-with-0 state. A zero
  // count is innocent every morning, so the walkthrough hides behind a tap.
  const [showSettingsHelp, setShowSettingsHelp] = useState(false);

  const persist = useCallback(
    async (steps: number) => {
      if (!habit) return;
      // A 0 read can mean "this device can't see health data" (empty
      // simulator store, revoked access) just as easily as a zero-step day —
      // never let it clobber a record that already holds a real count. The
      // modal still DISPLAYS the fresh 0; it just doesn't persist it.
      if (steps === 0 && typeof record?.steps === 'number' && record.steps > 0) return;
      const value = computeStepsLevel(steps, goals);
      const docId = `${habit.id}_${date}`;
      const next: HabitRecord = {
        id: docId,
        habitId: habit.id,
        userId,
        date,
        value,
        recordedAt: Date.now(),
        source: 'auto',
        steps,
      };
      await persistHabitRecord(next, { errorMessage: "Couldn't save your step count. Tap Retry." });
    },
    [habit, goals, date, userId, record],
  );

  const fetchAndPersist = useCallback(async () => {
    if (!habit) return;
    setStatus({ kind: 'loading' });
    const steps = await getStepsForDay(date);
    if (steps == null) {
      setStatus({
        kind: 'error',
        message: 'Could not read step data. Check that Health access is enabled for this app.',
      });
      return;
    }
    await persist(steps);
    // When the 0-guard in persist() kept the record's real count, display
    // that count too — showing a fresh "0 steps" beside the record's tier
    // ring reads as broken on exactly the devices the guard exists for.
    const kept = record?.steps;
    const display = steps === 0 && typeof kept === 'number' && kept > 0 ? kept : steps;
    setStatus({ kind: 'ready', steps: display });
  }, [date, habit, persist, record?.steps]);

  // The recovery button must re-REQUEST permission, not just retry the read —
  // on Android a denied Health Connect grant is re-promptable, and a bare
  // read would just fail again.
  const connectAndFetch = useCallback(async () => {
    const ok = await requestStepsPermission();
    if (!ok) {
      setStatus({ kind: 'needs-permission' });
      return;
    }
    await fetchAndPersist();
  }, [fetchAndPersist]);

  // The full check sequence: availability → permission → fetch. Shared by the
  // open effect and the foreground recheck below.
  const runCheck = useCallback(async () => {
    setStatus({ kind: 'checking' });
    const available = await isStepsHealthAvailable();
    if (!available) {
      setStatus({ kind: 'unavailable' });
      return;
    }
    // No iOS API to query existing permission — requestStepsPermission is
    // idempotent (no prompt if already granted), so just call it.
    const ok = await requestStepsPermission();
    if (!ok) {
      setStatus({ kind: 'needs-permission' });
      return;
    }
    await fetchAndPersist();
  }, [fetchAndPersist]);

  // Latest status kind, for the foreground listener's closure.
  const statusRef = useRef<Status['kind']>('idle');
  useEffect(() => {
    statusRef.current = status.kind;
  }, [status.kind]);

  // The open/foreground effects must NOT depend on runCheck's identity:
  // persisting a read updates the record snapshot, which recreates the
  // callbacks, and an identity-keyed effect would re-run the check after
  // every write (write → snapshot → new callback → check → write, forever).
  const runCheckRef = useRef(runCheck);
  useEffect(() => {
    runCheckRef.current = runCheck;
  });

  const habitId = habit?.id;

  // On open: run the check (and re-collapse the settings walkthrough).
  useEffect(() => {
    if (!visible || !habitId) return;
    setShowSettingsHelp(false);
    void runCheckRef.current();
  }, [visible, habitId]);

  // Returning from system Settings after granting permission would otherwise
  // leave the modal stuck on 'needs-permission' until a manual re-tap. Re-run
  // the check on foreground so a now-granted permission auto-advances.
  useEffect(() => {
    if (!visible || !habitId) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const k = statusRef.current;
      if (k === 'needs-permission' || k === 'unavailable' || k === 'error') {
        void runCheckRef.current();
      }
    });
    return () => {
      sub.remove();
    };
  }, [visible, habitId]);

  if (!habit) return null;

  const tint = colors.tint;
  const healthAppName = Platform.OS === 'android' ? 'Health Connect' : 'Apple Health';
  // Prefer the just-fetched count when ready; fall back to the last
  // persisted record so the modal still says something useful on errors.
  const displaySteps =
    status.kind === 'ready'
      ? status.steps
      : typeof record?.steps === 'number'
        ? record.steps
        : null;
  const currentLevel = levelForStepsQuad(record?.value);

  // Shared across the needs-permission, error, and ready-with-0 states: the
  // full "turn access back on" walkthrough plus the button it describes.
  const settingsHelp = (
    <View style={styles.helpBlock}>
      <ThemedText style={styles.hint}>
        Steps access for this app may be turned off in {healthAppName}. To turn it on, tap{' '}
        {HEALTH_SETTINGS_BUTTON} below, then:
      </ThemedText>
      <View style={styles.helpSteps}>
        {HEALTH_SETTINGS_STEPS.map((line, i) => (
          <ThemedText key={i} style={styles.helpStep}>
            {i + 1}. {line}
          </ThemedText>
        ))}
      </View>
      <Pressable
        style={[styles.secondary, { borderColor: tint }]}
        onPress={() => void openStepsHealthSettings()}
      >
        <ThemedText style={[styles.secondaryText, { color: tint }]}>
          {HEALTH_SETTINGS_BUTTON}
        </ThemedText>
      </Pressable>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.tileBackground }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <ThemedText type="defaultSemiBold" style={styles.title}>
              {habit.name}
            </ThemedText>
            <Pressable onPress={onClose} hitSlop={12}>
              <ThemedText style={[styles.close, { color: tint }]}>Close</ThemedText>
            </Pressable>
          </View>

          {/* Body */}
          <View style={styles.body}>
            {status.kind === 'checking' || status.kind === 'loading' ? (
              <View style={styles.center}>
                <ActivityIndicator color={tint} />
                <ThemedText style={styles.hint}>Reading from {healthAppName}…</ThemedText>
              </View>
            ) : status.kind === 'unavailable' ? (
              <ThemedText style={styles.hint}>
                {healthAppName} isn’t available on this device.
              </ThemedText>
            ) : status.kind === 'needs-permission' ? (
              <View style={styles.center}>
                <ThemedText style={styles.hint}>
                  Allow Health access to read your steps. We use it only to fill in this habit.
                </ThemedText>
                <Pressable
                  style={[styles.primary, { backgroundColor: tint }]}
                  onPress={() => void connectAndFetch()}
                >
                  <ThemedText style={styles.primaryText}>Connect {healthAppName}</ThemedText>
                </Pressable>
                {settingsHelp}
              </View>
            ) : status.kind === 'error' ? (
              <View style={styles.center}>
                <ThemedText style={styles.hint}>{status.message}</ThemedText>
                <Pressable
                  style={[styles.secondary, { borderColor: tint }]}
                  onPress={() => void fetchAndPersist()}
                >
                  <ThemedText style={[styles.secondaryText, { color: tint }]}>Try again</ThemedText>
                </Pressable>
                {settingsHelp}
              </View>
            ) : (
              // status.kind === 'ready' or 'idle' with cached record
              <>
                <View style={styles.center}>
                  <ThemedText style={[styles.bigNumber, { color: tint }]}>
                    {displaySteps?.toLocaleString() ?? '—'}
                  </ThemedText>
                  <ThemedText style={styles.bigNumberCaption}>steps</ThemedText>
                </View>
                <View style={styles.tierRow}>
                  <ThemedText style={styles.tierText}>
                    {currentLevel === 0
                      ? 'Below Level 1'
                      : currentLevel === 1
                        ? 'Level 1: yes'
                        : currentLevel === 2
                          ? 'Level 2: goal'
                          : 'Level 3: ideal'}
                  </ThemedText>
                </View>

                {/* Goals breakdown */}
                <View style={styles.divider} />
                {goals.length === 0 ? (
                  <ThemedText style={styles.hint}>No goals set yet.</ThemedText>
                ) : (
                  goals.map((g, i) => {
                    const hit = (displaySteps ?? 0) >= g;
                    return (
                      <View key={i} style={styles.goalRow}>
                        <ThemedText style={styles.goalLabel}>Level {i + 1}</ThemedText>
                        <ThemedText style={styles.goalValue}>
                          {g.toLocaleString()}
                        </ThemedText>
                        <ThemedText style={[styles.goalMark, hit && { color: tint }]}>
                          {hit ? '✓' : '—'}
                        </ThemedText>
                      </View>
                    );
                  })
                )}

                <Pressable
                  style={[styles.secondary, { borderColor: tint, marginTop: 8 }]}
                  onPress={() => void fetchAndPersist()}
                >
                  <ThemedText style={[styles.secondaryText, { color: tint }]}>
                    Refresh from {healthAppName}
                  </ThemedText>
                </Pressable>
                {/* A count stuck at 0 is how denied access looks on iOS
                    (reads "succeed" empty) — but it's also every ordinary
                    morning, so the recovery walkthrough sits behind a tap. */}
                {(displaySteps ?? 0) === 0 &&
                  (showSettingsHelp ? (
                    settingsHelp
                  ) : (
                    <Pressable onPress={() => setShowSettingsHelp(true)} hitSlop={8}>
                      <ThemedText style={[styles.helpLink, { color: tint }]}>
                        Not seeing your steps?
                      </ThemedText>
                    </Pressable>
                  ))}
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
  },
  close: {
    fontSize: 15,
    fontWeight: '600',
  },
  body: {
    gap: 12,
  },
  center: {
    alignItems: 'center',
    gap: 8,
  },
  bigNumber: {
    fontSize: 56,
    lineHeight: 66,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  bigNumberCaption: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: -4,
  },
  tierRow: {
    alignItems: 'center',
  },
  tierText: {
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(128,128,128,0.3)',
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  goalLabel: {
    width: 70,
    fontSize: 14,
    fontWeight: '600',
  },
  goalValue: {
    flex: 1,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  goalMark: {
    fontSize: 14,
    fontWeight: '700',
    width: 24,
    textAlign: 'right',
    opacity: 0.5,
  },
  hint: {
    fontSize: 13,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 18,
  },
  helpBlock: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  helpSteps: {
    alignSelf: 'stretch',
    gap: 4,
    paddingHorizontal: 8,
  },
  helpStep: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.8,
  },
  helpLink: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  primary: {
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondary: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  secondaryText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
