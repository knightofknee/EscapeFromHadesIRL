import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Vibration,
  View,
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
import {
  cancelMeditationAlarm,
  scheduleMeditationAlarm,
} from '@/lib/meditation-notifications';
import {
  clearTimerState,
  computeRemainingSec,
  isStaleForDay,
  loadTimerState,
  saveTimerState,
} from '@/lib/meditation-timer-storage';
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
 * Phase B in place:
 * - AsyncStorage persists in-flight timer state per-habit, so paused or
 *   running timers survive app close and modal close.
 * - Scheduled local notifications fire the completion alarm with the
 *   default system sound + vibration even when the app is backgrounded
 *   or killed. The notification handler in app/_layout.tsx makes them
 *   ring in the foreground too. If notification permission is denied,
 *   the foreground tick still detects completion and just vibrates.
 * - Day-cross attribution: the persisted state records the START day, and
 *   the resulting session logs to that day even if completion happens
 *   after midnight.
 * - Day rollover: a stale persisted state from a previous local day is
 *   discarded on load (and any pending completion is logged to its start
 *   day before clearing), so users start each day with a fresh timer.
 * - AppState 'active' re-syncs the visible modal from AsyncStorage so
 *   backgrounded completions land immediately when the user reopens.
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
  // startedAt of the run whose completion has already been logged. The tick
  // path and the resync paths (modal open / app foreground) can all observe
  // the same completion before clearTimerState lands — without this guard
  // the same session gets appended twice.
  const loggedCompletionRef = useRef<number | null>(null);
  // Day-cross attribution: the START day for the active timer. Sessions get
  // logged to this date even if completion happens after midnight.
  const activeDateRef = useRef<string>(date);
  // Currently-scheduled completion notification id (so we can cancel on
  // pause/reset).
  const notificationIdRef = useRef<string | null>(null);

  // Sub-modal for "Log Session" — small minutes-input prompt so the user
  // explicitly picks how long the manually-logged session is. Prefilled to
  // whatever the timer is currently set to so the connection is obvious.
  const [logModalVisible, setLogModalVisible] = useState<boolean>(false);
  const [logMinutes, setLogMinutes] = useState<string>('');

  const sessions = record?.sessions ?? [];
  const qualifying = getMeditationQualifyingCount(sessions, targetMinutes);

  // persistSession can fire from the tick interval, whose closure is frozen
  // at run start — a session logged or removed DURING the run would be
  // clobbered by a completion write built on the pre-run list. Read the
  // latest record through a ref instead of the closure.
  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = record;
  });

  const persistSession = useCallback(
    async (newSession: MeditationSession, sessionDate: string) => {
      if (!habit) return;
      const existing = recordRef.current?.sessions ?? [];
      const nextSessions = [...existing, newSession];
      const value = computeMeditationTier(nextSessions, targetSessions, targetMinutes);
      const docId = `${habit.id}_${sessionDate}`;
      const next: HabitRecord = {
        id: docId,
        habitId: habit.id,
        userId,
        date: sessionDate,
        value,
        recordedAt: Date.now(),
        sessions: nextSessions,
      };
      try {
        await setDoc(doc(db, 'records', docId), next);
      } catch (err) {
        console.error('Failed to save meditation session:', err);
      }
    },
    [habit, targetSessions, targetMinutes, userId],
  );

  const removeSession = useCallback(
    async (index: number) => {
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
    },
    [habit, sessions, targetSessions, targetMinutes, userId, date],
  );

  // Re-sync UI state from whatever's in AsyncStorage. Handles: fresh state,
  // stale (prior-day) state, completed-while-backgrounded state, and
  // currently-running/paused state. Called on visible→true and on each
  // AppState 'active' transition.
  const syncFromPersisted = useCallback(async () => {
    if (!habit) return;
    const persisted = await loadTimerState(habit.id);

    const resetFresh = () => {
      setTotalSec(defaultDurationSec);
      setRemainingSec(defaultDurationSec);
      setRunning(false);
      startRef.current = null;
      notificationIdRef.current = null;
      activeDateRef.current = date;
    };

    if (!persisted) {
      resetFresh();
      return;
    }

    if (isStaleForDay(persisted, todayStr)) {
      // Yesterday's timer (or older). If it completed offline, log the
      // session to its start day, then clear and show today fresh.
      if (persisted.startedAt != null) {
        const remaining = computeRemainingSec(persisted, Date.now());
        if (remaining === 0 && loggedCompletionRef.current !== persisted.startedAt) {
          loggedCompletionRef.current = persisted.startedAt;
          await persistSession(
            {
              durationSec: persisted.totalSec,
              source: 'timer',
              loggedAt: Date.now(),
            },
            persisted.date,
          );
        }
      }
      await cancelMeditationAlarm(persisted.notificationId);
      await clearTimerState(habit.id);
      resetFresh();
      return;
    }

    // Same-day persisted state.
    notificationIdRef.current = persisted.notificationId;
    activeDateRef.current = persisted.date;
    setTotalSec(persisted.totalSec);

    if (persisted.startedAt != null) {
      // Was running when last saved. May have completed while we were away.
      const remaining = computeRemainingSec(persisted, Date.now());
      if (remaining === 0) {
        if (loggedCompletionRef.current !== persisted.startedAt) {
          loggedCompletionRef.current = persisted.startedAt;
          await persistSession(
            {
              durationSec: persisted.totalSec,
              source: 'timer',
              loggedAt: Date.now(),
            },
            persisted.date,
          );
        }
        await cancelMeditationAlarm(persisted.notificationId);
        await clearTimerState(habit.id);
        setRemainingSec(persisted.totalSec);
        setRunning(false);
        startRef.current = null;
        notificationIdRef.current = null;
        activeDateRef.current = date;
      } else {
        // Still running — restore the tick anchor.
        setRemainingSec(remaining);
        startRef.current = {
          at: persisted.startedAt,
          remainingAtStart: persisted.remainingAtStart,
        };
        setRunning(true);
      }
    } else {
      // Paused.
      setRemainingSec(persisted.remainingAtStart);
      setRunning(false);
      startRef.current = null;
    }
  }, [habit, todayStr, defaultDurationSec, date, persistSession]);

  // Sync on open.
  useEffect(() => {
    if (!visible) return;
    void syncFromPersisted();
  }, [visible, syncFromPersisted]);

  // Re-sync whenever the app foregrounds (the modal could be visible and the
  // timer could have completed in the background).
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncFromPersisted();
    });
    return () => sub.remove();
  }, [visible, syncFromPersisted]);

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
        // Natural completion. The session is logged to activeDateRef
        // (the start day), so cross-midnight runs attribute correctly.
        clearInterval(id);
        setRunning(false);
        // Claim this run's completion before the async log so a foreground
        // resync racing the write can't log it again.
        loggedCompletionRef.current = s.at;
        startRef.current = null;
        if (Platform.OS === 'ios' && !Platform.isPad) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        Vibration.vibrate([0, 400, 200, 400]);
        const sessionDate = activeDateRef.current;
        const sessionTotal = totalSec;
        const fireId = notificationIdRef.current;
        void (async () => {
          await persistSession(
            { durationSec: sessionTotal, source: 'timer', loggedAt: Date.now() },
            sessionDate,
          );
          // The notification may fire ~simultaneously — cancelling is a
          // no-op if it already did. Clearing persisted state prevents
          // double-logging on next open.
          await cancelMeditationAlarm(fireId);
          if (habit) await clearTimerState(habit.id);
          notificationIdRef.current = null;
        })();
        // Reset display ready for another run.
        setRemainingSec(totalSec);
      }
    }, 250);
    return () => clearInterval(id);
    // totalSec is stable for the duration of a run (set on Start).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  async function handleStart() {
    if (!habit) return;
    if (Platform.OS === 'ios' && !Platform.isPad) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const now = Date.now();
    const remainAtStart = remainingSec;
    startRef.current = { at: now, remainingAtStart: remainAtStart };
    activeDateRef.current = date;
    setRunning(true);

    // Schedule completion alarm (best-effort; null if perms denied).
    const endTime = new Date(now + remainAtStart * 1000);
    const newId = await scheduleMeditationAlarm(endTime, habit.name);
    notificationIdRef.current = newId;

    await saveTimerState({
      habitId: habit.id,
      date,
      totalSec,
      startedAt: now,
      remainingAtStart: remainAtStart,
      notificationId: newId,
    });
  }

  async function handlePause() {
    if (!habit) return;
    if (Platform.OS === 'ios' && !Platform.isPad) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const currentRemaining = remainingSec;
    startRef.current = null;
    setRunning(false);

    await cancelMeditationAlarm(notificationIdRef.current);
    notificationIdRef.current = null;

    await saveTimerState({
      habitId: habit.id,
      date,
      totalSec,
      startedAt: null,
      remainingAtStart: currentRemaining,
      notificationId: null,
    });
  }

  async function handleReset() {
    if (!habit) return;
    if (Platform.OS === 'ios' && !Platform.isPad) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    startRef.current = null;
    setRunning(false);
    setRemainingSec(totalSec);
    await cancelMeditationAlarm(notificationIdRef.current);
    notificationIdRef.current = null;
    await clearTimerState(habit.id);
  }

  function handleLogSession() {
    setLogMinutes(String(Math.floor(totalSec / 60)));
    setLogModalVisible(true);
  }

  function confirmLogSession() {
    const mins = parseInt(logMinutes.replace(/[^0-9]/g, ''), 10);
    if (isNaN(mins) || mins <= 0) {
      setLogModalVisible(false);
      return;
    }
    // Manual logs are always attributed to the modal's viewed date — they're
    // a user action *for that day*, not tied to any cross-midnight clock.
    void persistSession(
      { durationSec: mins * 60, source: 'manual', loggedAt: Date.now() },
      date,
    );
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
                onPress={() => void handleStart()}
              >
                <ThemedText style={styles.primaryText}>
                  {remainingSec === totalSec ? 'Start' : 'Resume'}
                </ThemedText>
              </Pressable>
            )}
            {isToday && running && (
              <Pressable
                style={[styles.primary, { backgroundColor: tint }]}
                onPress={() => void handlePause()}
              >
                <ThemedText style={styles.primaryText}>Pause</ThemedText>
              </Pressable>
            )}
            <Pressable
              style={[styles.secondary, { borderColor: colors.tileBorder }]}
              onPress={() => void handleReset()}
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
});
