import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  Vibration,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { db, doc, setDoc } from '@/lib/firebase/firestore';
import {
  computeMeditationTier,
  formatTimerDuration,
  getMeditationQualifyingCount,
} from '@/lib/meditation';
import { useTodayDate } from '@/hooks/use-today-date';
import type { Habit, HabitRecord, MeditationSession } from '@/types/habit';

type MeditationTimerModalProps = {
  visible: boolean;
  habit: Habit | null;
  record: HabitRecord | undefined;
  date: string; // YYYY-MM-DD that this modal targets
  userId: string;
  onClose: () => void;
};

/**
 * Per-day meditation timer + session list.
 *
 * Phase A: foreground-only timer. The countdown ticks via setInterval while
 * the modal is open; pause/resume work locally. On natural completion (or
 * "Log Session"), a session is appended to `record.sessions` and the tier
 * (record.value as QuadValue) is recomputed via computeMeditationTier.
 *
 * Phase B will add: AsyncStorage persistence so paused state survives app
 * close, scheduled local notifications so the alarm fires when the app is
 * backgrounded/killed, a bundled bell sound for the permission-denied case,
 * and day-rollover reset to the habit's configured default.
 */
export function MeditationTimerModal({
  visible,
  habit,
  record,
  date,
  userId,
  onClose,
}: MeditationTimerModalProps) {
  'use no memo';
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { todayStr } = useTodayDate();
  const isToday = date === todayStr;

  const targetSessions = habit?.meditationSessions ?? 1;
  const targetMinutes = habit?.meditationMinutes ?? 5;
  const defaultDurationSec = targetMinutes * 60;

  // Timer state. `totalSec` = the configured run length (editable when idle).
  // `remainingSec` = current displayed countdown.
  const [totalSec, setTotalSec] = useState<number>(defaultDurationSec);
  const [remainingSec, setRemainingSec] = useState<number>(defaultDurationSec);
  const [running, setRunning] = useState<boolean>(false);
  const startRef = useRef<{ at: number; remainingAtStart: number } | null>(null);

  // Sub-modal for "Log Session" — small minutes-input prompt so the user
  // explicitly picks how long the manually-logged session is. Prefilled to
  // whatever the timer is currently set to so the connection is obvious.
  const [logModalVisible, setLogModalVisible] = useState<boolean>(false);
  const [logMinutes, setLogMinutes] = useState<string>('');

  const sessions = record?.sessions ?? [];
  const qualifying = getMeditationQualifyingCount(sessions, targetMinutes);

  // When the modal opens or the habit's default changes, reset to the
  // configured duration (Phase B will instead restore any persisted state).
  useEffect(() => {
    if (visible) {
      setTotalSec(defaultDurationSec);
      setRemainingSec(defaultDurationSec);
      setRunning(false);
      startRef.current = null;
    }
  }, [visible, defaultDurationSec]);

  // Ticking. We compute remaining from start timestamps so render drift
  // doesn't accumulate; the interval just nudges React to re-render.
  useEffect(() => {
    if (!running || !startRef.current) return;
    const id = setInterval(() => {
      const s = startRef.current;
      if (!s) return;
      const elapsedMs = Date.now() - s.at;
      const next = Math.max(0, s.remainingAtStart - Math.floor(elapsedMs / 1000));
      setRemainingSec(next);
      if (next === 0) {
        // Natural completion — log a session of the original full length.
        clearInterval(id);
        setRunning(false);
        startRef.current = null;
        if (Platform.OS === 'ios' && !Platform.isPad) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        Vibration.vibrate([0, 400, 200, 400]);
        void persistSession({
          durationSec: totalSec,
          source: 'timer',
          loggedAt: Date.now(),
        });
        // Reset display ready for another run.
        setRemainingSec(totalSec);
      }
    }, 250);
    return () => clearInterval(id);
    // totalSec is stable for the duration of a run (set on Start).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  async function persistSession(newSession: MeditationSession) {
    if (!habit) return;
    const nextSessions = [...sessions, newSession];
    const value = computeMeditationTier(nextSessions, targetSessions, targetMinutes);
    const docId = `${habit.id}_${date}`;
    const next: HabitRecord = {
      id: docId,
      habitId: habit.id,
      userId,
      date,
      value,
      recordedAt: Date.now(),
      sessions: nextSessions,
    };
    try {
      await setDoc(doc(db, 'records', docId), next);
    } catch (err) {
      console.error('Failed to save meditation session:', err);
    }
  }

  async function removeSession(index: number) {
    if (!habit) return;
    const nextSessions = sessions.filter((_, i) => i !== index);
    const value = computeMeditationTier(nextSessions, targetSessions, targetMinutes);
    const docId = `${habit.id}_${date}`;
    const next: HabitRecord = {
      id: docId,
      habitId: habit.id,
      userId,
      date,
      value,
      recordedAt: Date.now(),
      sessions: nextSessions,
    };
    try {
      await setDoc(doc(db, 'records', docId), next);
    } catch (err) {
      console.error('Failed to remove meditation session:', err);
    }
  }

  function handleStart() {
    if (Platform.OS === 'ios' && !Platform.isPad) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    startRef.current = { at: Date.now(), remainingAtStart: remainingSec };
    setRunning(true);
  }

  function handlePause() {
    if (Platform.OS === 'ios' && !Platform.isPad) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    startRef.current = null;
    setRunning(false);
  }

  function handleReset() {
    if (Platform.OS === 'ios' && !Platform.isPad) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    startRef.current = null;
    setRunning(false);
    setRemainingSec(totalSec);
  }

  function handleLogSession() {
    // Open the minutes-input sub-modal, prefilled with the current timer
    // setting so the connection between the button and the value is obvious.
    setLogMinutes(String(Math.floor(totalSec / 60)));
    setLogModalVisible(true);
  }

  function confirmLogSession() {
    const mins = parseInt(logMinutes.replace(/[^0-9]/g, ''), 10);
    if (isNaN(mins) || mins <= 0) {
      setLogModalVisible(false);
      return;
    }
    void persistSession({
      durationSec: mins * 60,
      source: 'manual',
      loggedAt: Date.now(),
    });
    if (Platform.OS === 'ios' && !Platform.isPad) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setLogModalVisible(false);
  }

  function handleRemoveSession(index: number) {
    Alert.alert(
      'Remove session?',
      `Remove the ${formatTimerDuration(sessions[index].durationSec)} session?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void removeSession(index),
        },
      ],
    );
  }

  // Adjust the configured total when idle. Locked while running so the
  // countdown doesn't jump out from under the user.
  function adjustTotalMinutes(delta: number) {
    if (running) return;
    setTotalSec((prev) => {
      const mins = Math.max(1, Math.min(180, Math.floor(prev / 60) + delta));
      const next = mins * 60;
      setRemainingSec(next);
      return next;
    });
  }

  function setTotalMinutesFromInput(text: string) {
    if (running) return;
    const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (isNaN(n)) {
      setTotalSec(60);
      setRemainingSec(60);
      return;
    }
    const mins = Math.max(1, Math.min(180, n));
    const next = mins * 60;
    setTotalSec(next);
    setRemainingSec(next);
  }

  if (!habit) return null;

  const tint = colors.tint;
  const isIdleAtFull = !running && remainingSec === totalSec;

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
          {!isToday && (
            <ThemedText style={styles.subdued}>
              Editing {date}. Live timer disabled — use Log Session to backfill.
            </ThemedText>
          )}

          {/* Timer display */}
          <View style={styles.timerArea}>
            <ThemedText style={[styles.timerText, { color: tint }]}>
              {formatTimerDuration(remainingSec)}
            </ThemedText>

            {/* Editable minutes when idle at full duration */}
            {isIdleAtFull && (
              <View style={styles.editRow}>
                <Pressable
                  style={[styles.stepper, { borderColor: colors.tileBorder }]}
                  onPress={() => adjustTotalMinutes(-1)}
                  hitSlop={8}
                >
                  <ThemedText style={styles.stepperText}>−</ThemedText>
                </Pressable>
                <TextInput
                  style={[styles.minutesInput, { color: colors.text, borderColor: colors.tileBorder }]}
                  value={String(Math.floor(totalSec / 60))}
                  onChangeText={setTotalMinutesFromInput}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Pressable
                  style={[styles.stepper, { borderColor: colors.tileBorder }]}
                  onPress={() => adjustTotalMinutes(1)}
                  hitSlop={8}
                >
                  <ThemedText style={styles.stepperText}>+</ThemedText>
                </Pressable>
              </View>
            )}
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            {isToday && !running && (
              <Pressable
                style={[styles.primary, { backgroundColor: tint }]}
                onPress={handleStart}
              >
                <ThemedText style={styles.primaryText}>
                  {remainingSec === totalSec ? 'Start' : 'Resume'}
                </ThemedText>
              </Pressable>
            )}
            {isToday && running && (
              <Pressable
                style={[styles.primary, { backgroundColor: tint }]}
                onPress={handlePause}
              >
                <ThemedText style={styles.primaryText}>Pause</ThemedText>
              </Pressable>
            )}
            <Pressable
              style={[styles.secondary, { borderColor: colors.tileBorder }]}
              onPress={handleReset}
            >
              <ThemedText style={styles.secondaryText}>Reset</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.secondary, { borderColor: tint }]}
              onPress={handleLogSession}
            >
              <ThemedText style={[styles.secondaryText, { color: tint }]}>Log Session</ThemedText>
            </Pressable>
          </View>

          {/* Today's progress — qualifying/target with the minimum duration
              the user has to hit for a session to count toward the goal. */}
          <ThemedText style={styles.progressText}>
            {qualifying}/{targetSessions} ({targetMinutes} {targetMinutes === 1 ? 'minute' : 'minutes'} minimum)
          </ThemedText>

          {/* Session list */}
          <View style={styles.divider} />
          <ScrollView style={styles.sessionList} contentContainerStyle={styles.sessionListContent}>
            {sessions.length === 0 ? (
              <ThemedText style={styles.empty}>No sessions logged yet.</ThemedText>
            ) : (
              sessions.map((s, i) => (
                <View
                  key={i}
                  style={[
                    styles.sessionRow,
                    {
                      borderBottomColor: colors.tileBorder,
                      borderBottomWidth: i === sessions.length - 1 ? 0 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <ThemedText style={styles.sessionDuration}>
                    {formatTimerDuration(s.durationSec)}
                  </ThemedText>
                  <ThemedText style={styles.sessionMeta}>
                    {s.source === 'timer' ? 'Timer' : 'Manual'}
                  </ThemedText>
                  <Pressable
                    onPress={() => handleRemoveSession(i)}
                    style={styles.removeBtn}
                    hitSlop={8}
                  >
                    <ThemedText style={[styles.removeBtnText, { color: tint }]}>Remove</ThemedText>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>

      {/* Log Session sub-modal — small minutes-input prompt. Number + the
          word "minutes" only, with a Log Session button to make the
          connection between the prompt and the action explicit. */}
      <Modal
        visible={logModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogModalVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setLogModalVisible(false)}>
          <Pressable
            style={[styles.logSheet, { backgroundColor: colors.tileBackground }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ThemedText type="defaultSemiBold" style={styles.logTitle}>
              Log Session
            </ThemedText>
            <View style={styles.logInputRow}>
              <TextInput
                style={[styles.logInput, { color: colors.text, borderColor: colors.tileBorder }]}
                value={logMinutes}
                onChangeText={(t) => setLogMinutes(t.replace(/[^0-9]/g, '').slice(0, 3))}
                keyboardType="number-pad"
                autoFocus
                selectTextOnFocus
              />
              <ThemedText style={styles.logUnit}>minutes</ThemedText>
            </View>
            <View style={styles.logActions}>
              <Pressable
                style={[styles.secondary, { borderColor: colors.tileBorder }]}
                onPress={() => setLogModalVisible(false)}
              >
                <ThemedText style={styles.secondaryText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.primary, { backgroundColor: tint }]}
                onPress={confirmLogSession}
              >
                <ThemedText style={styles.primaryText}>Log Session</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingBottom: 12,
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
  subdued: {
    fontSize: 12,
    opacity: 0.7,
    fontStyle: 'italic',
  },
  timerArea: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  timerText: {
    fontSize: 64,
    lineHeight: 76,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepper: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperText: {
    fontSize: 20,
    fontWeight: '600',
  },
  minutesInput: {
    width: 60,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
  },
  primary: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondary: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryText: {
    fontWeight: '600',
    fontSize: 14,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(128,128,128,0.3)',
  },
  sessionList: {
    maxHeight: 220,
  },
  sessionListContent: {
    paddingBottom: 0,
  },
  empty: {
    fontSize: 13,
    opacity: 0.6,
    textAlign: 'center',
    paddingVertical: 12,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  logSheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    padding: 20,
    gap: 14,
  },
  logTitle: {
    fontSize: 17,
    textAlign: 'center',
  },
  logInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logInput: {
    width: 90,
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
  },
  logUnit: {
    fontSize: 16,
    opacity: 0.8,
  },
  logActions: {
    flexDirection: 'row',
    gap: 8,
  },
  sessionDuration: {
    fontSize: 15,
    fontWeight: '600',
    width: 70,
    fontVariant: ['tabular-nums'],
  },
  sessionMeta: {
    fontSize: 13,
    opacity: 0.6,
    flex: 1,
  },
  removeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  removeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
