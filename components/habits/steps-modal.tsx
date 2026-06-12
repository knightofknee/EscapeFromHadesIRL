import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { db, doc, setDoc } from '@/lib/firebase/firestore';
import { computeStepsLevel, levelForStepsQuad } from '@/lib/steps';
import {
  getStepsForDay,
  isStepsHealthAvailable,
  requestStepsPermission,
} from '@/lib/steps-health';
import type { Habit, HabitRecord } from '@/types/habit';

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

  const goals = habit?.stepGoals ?? [];
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const persist = useCallback(
    async (steps: number) => {
      if (!habit) return;
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
      try {
        await setDoc(doc(db, 'records', docId), next);
      } catch (err) {
        console.error('Failed to persist steps record:', err);
      }
    },
    [habit, goals, date, userId],
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
    setStatus({ kind: 'ready', steps });
  }, [date, habit, persist]);

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

  // On open: check availability → request permission if needed → fetch.
  useEffect(() => {
    if (!visible || !habit) return;
    let cancelled = false;
    (async () => {
      setStatus({ kind: 'checking' });
      const available = await isStepsHealthAvailable();
      if (cancelled) return;
      if (!available) {
        setStatus({ kind: 'unavailable' });
        return;
      }
      // We don't have a way on iOS to check if read permission is already
      // granted — requestStepsPermission is idempotent and harmless to call.
      // If the user has already granted, no prompt appears; we go straight
      // to fetching.
      const ok = await requestStepsPermission();
      if (cancelled) return;
      if (!ok) {
        setStatus({ kind: 'needs-permission' });
        return;
      }
      await fetchAndPersist();
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, habit, fetchAndPersist]);

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
                        ? 'Level 1 — yes'
                        : currentLevel === 2
                          ? 'Level 2 — goal'
                          : 'Level 3 — ideal'}
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
