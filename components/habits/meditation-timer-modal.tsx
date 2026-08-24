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
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { persistHabitRecord } from '@/lib/persist-record';
import {
  formatTimerDuration,
  getMeditationQualifyingCount,
  shouldRingInApp,
} from '@/lib/meditation';
import {
  cancelMeditationAlarm,
  scheduleMeditationAlarm,
} from '@/lib/meditation-notifications';
import { buildMeditationRecord, requestMeditationSweep } from '@/lib/meditation-completion';
import { startActivity, endActivity } from '@/modules/meditation-activity';
import {
  clearTimerState,
  computeRemainingSec,
  isStaleForDay,
  loadTimerState,
  saveTimerState,
} from '@/lib/meditation-timer-storage';
import { useTodayDate } from '@/hooks/use-today-date';
import type { Habit, HabitRecord, MeditationSession } from '@/types/habit';

// Bundled chime (also registered as the notification sound in app.json). A
// single soft bowl strike with ~1.4s of trailing silence, so looping it
// re-rings about every 5.6s — a reminder, not a nag.
const BELL_SOUND = require('../../assets/bell.wav');
const KEEP_AWAKE_TAG = 'meditation-timer';

/** Length of bell.wav, strike through trailing silence — the loop period. */
const BELL_LOOP_MS = 5600;

/**
 * How many times the bell rings before it gives up and goes quiet on its own.
 * A meditation bell marks the end and stops; it doesn't nag you out of the
 * state you just spent twenty minutes getting into. The takeover stays up
 * afterwards, so nothing is missed by not hearing ring four.
 */
const MAX_RINGS = 3;

/**
 * 'ringing' — finished just now, with the user here: bell + buzz + takeover.
 * 'silent'  — finished while we were away: the takeover says so, quietly.
 * 'off'     — no takeover.
 */
type AlarmMode = 'off' | 'ringing' | 'silent';

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
 * - Day rollover: a stale persisted state from a previous local day shows as
 *   a fresh timer on load, so users start each day clean; the watcher does
 *   the actual clearing (and logs it first if it had finished).
 * - AppState 'active' re-syncs the visible modal from AsyncStorage so
 *   backgrounded completions land immediately when the user reopens.
 * - The in-app alarm only rings for a completion the user was present for.
 *   Coming back to a timer that ended while you were away shows the takeover
 *   silently instead of greeting you with a bell you have to hunt down.
 * - Writing the finished session is NOT this component's job. A run can
 *   belong to a different day than the one this sheet is showing (it crossed
 *   midnight, or the sheet was opened on a past date), and the record write
 *   replaces a whole day's sessions — so the day's existing sessions have to
 *   come from the run's own date, which only the app-wide watcher looks up.
 *   The modal notices a run ending, shows it, and asks the watcher to settle:
 *   see components/habits/meditation-alarm-watcher.
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
  // startedAt of the run whose "time's up" takeover has already been shown, so
  // a resync landing after the user dismissed it doesn't put it back. Not a
  // write guard — the watcher owns writing, and claimCompletion guards that.
  const surfacedCompletionRef = useRef<number | null>(null);
  // Currently-scheduled completion notification id (so we can cancel on
  // pause/reset).
  const notificationIdRef = useRef<string | null>(null);
  // id of the running lock-screen Live Activity (iOS), managed in lockstep with
  // notificationIdRef at every start/pause/reset/complete/reconcile site.
  const activityIdRef = useRef<string | null>(null);
  // Synchronous re-entrancy guard: setRunning is async, so a fast double-tap on
  // Start could fire handleStart twice and leak a second Live Activity/alarm.
  const startingRef = useRef(false);

  // Sub-modal for "Log Session" — small minutes-input prompt so the user
  // explicitly picks how long the manually-logged session is. Prefilled to
  // whatever the timer is currently set to so the connection is obvious.
  const [logModalVisible, setLogModalVisible] = useState<boolean>(false);
  const [logMinutes, setLogMinutes] = useState<string>('');

  // Completion alarm (in-app, foreground). When a running timer hits 0 with
  // this screen open we ring the bell on a loop and buzz until the user taps
  // to dismiss — see the tick effect and the takeover overlay below.
  const player = useAudioPlayer(BELL_SOUND);
  const [alarmMode, setAlarmMode] = useState<AlarmMode>('off');
  const alarming = alarmMode === 'ringing';
  const [helpVisible, setHelpVisible] = useState<boolean>(false);

  // Keep the screen awake ONLY while a countdown is actively running (or the
  // alarm is ringing) with this screen open — never while idle or paused.
  useEffect(() => {
    if (!(visible && (running || alarming))) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => {});
    };
  }, [visible, running, alarming]);

  // Drive the ringing alarm: loop the bell (its trailing silence makes it
  // re-ring every ~5.6s) and repeat the vibration until the alarm clears.
  // The audio mode is set here rather than on mount: it's a global session
  // change, and claiming playback for the whole app just because a habits
  // screen rendered would pause whatever the user is listening to.
  useEffect(() => {
    if (!alarming) return;
    // Ring on silent too (an alarm the ringer switch mutes defeats the point),
    // but duck other audio rather than stopping it — the user may well be
    // meditating to something.
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(
      () => {},
    );
    player.loop = true;
    player.seekTo(0).catch(() => {});
    player.play();
    Vibration.vibrate([0, 220, 380, 220], true);
    // Said its piece. Go quiet, but keep the takeover up so they still find
    // out what happened whenever they do look.
    const giveUp = setTimeout(() => setAlarmMode('silent'), MAX_RINGS * BELL_LOOP_MS);
    return () => {
      clearTimeout(giveUp);
      player.pause();
      Vibration.cancel();
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(
        () => {},
      );
    };
  }, [alarming, player]);

  // Leaving stops the alarm: closing the sheet, and backgrounding the app.
  // The bell is a foreground affordance — once the app is gone the scheduled
  // notification is what alerts the user, and a bell that kept looping (or
  // resumed on return) would be exactly the alarm-you-can't-stop problem.
  useEffect(() => {
    if (!visible) setAlarmMode('off');
  }, [visible]);

  // Locking the phone (or swiping home) backgrounds us, and that silences the
  // bell — the closest thing we get to the power button stopping an alarm.
  // Strictly 'background', NOT '!== active': iOS reports 'inactive' for a
  // banner or a half-pulled Control Center, and our own completion
  // notification arrives at the same instant the bell starts, so the looser
  // check risked killing the alarm the moment it began.
  useEffect(() => {
    if (alarmMode === 'off') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') setAlarmMode('off');
    });
    return () => sub.remove();
  }, [alarmMode]);

  const stopAlarm = useCallback(() => setAlarmMode('off'), []);

  const sessions = record?.sessions ?? [];
  const qualifying = getMeditationQualifyingCount(sessions, targetMinutes);

  // persistSession runs from the Log Session prompt, whose closure can be a
  // render behind — a session logged or removed in between would be clobbered
  // by a write built on the stale list. Read the latest record through a ref.
  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = record;
  });

  // Manual logs are always attributed to the modal's viewed date — a user
  // action *for that day*, no cross-midnight logic. (Timer completions go
  // through the watcher, not here.)
  const persistSession = useCallback(
    async (newSession: MeditationSession) => {
      if (!habit) return;
      const existing = recordRef.current?.sessions ?? [];
      await persistHabitRecord(
        buildMeditationRecord(habit, userId, date, [...existing, newSession]),
        { errorMessage: "Couldn't save your meditation session. Tap Retry." },
      );
    },
    [habit, userId, date],
  );

  const removeSession = useCallback(
    async (index: number) => {
      if (!habit) return;
      await persistHabitRecord(
        buildMeditationRecord(habit, userId, date, sessions.filter((_, i) => i !== index)),
        { errorMessage: "Couldn't update your meditation sessions. Tap Retry." },
      );
    },
    [habit, sessions, userId, date],
  );

  // Re-sync UI state from whatever's in AsyncStorage. Handles: fresh state,
  // stale (prior-day) state, completed-while-backgrounded state, and
  // currently-running/paused state. Called on visible→true and on each
  // AppState 'active' transition.
  const syncFromPersisted = useCallback(async () => {
    if (!habit) return;
    const persisted = await loadTimerState(habit.id);

    // Deliberately does NOT touch the alarm. The watcher clears the slot of a
    // run that just finished, so a resync landing behind it finds nothing —
    // and used to reset straight over the takeover the user was still reading,
    // which is why "Time's up" only ever flashed up for a moment.
    const resetFresh = () => {
      setTotalSec(defaultDurationSec);
      setRemainingSec(defaultDurationSec);
      setRunning(false);
      startRef.current = null;
      notificationIdRef.current = null;
      activityIdRef.current = null;
    };

    if (!persisted) {
      resetFresh();
      return;
    }

    // STILL RUNNING wins over everything, including staleness: a run started
    // at 11:50pm is legitimately mid-flight after midnight and must keep its
    // alarm, its Live Activity, and its slot — it finishes normally and the
    // watcher logs it to its start day. Only non-running leftovers roll over.
    const remaining =
      persisted.startedAt != null ? computeRemainingSec(persisted, Date.now()) : null;
    if (remaining != null && remaining > 0) {
      notificationIdRef.current = persisted.notificationId;
      // The activity is alive and self-ticking — nothing to recreate.
      activityIdRef.current = persisted.activityId ?? null;
      setTotalSec(persisted.totalSec);
      setRemainingSec(remaining);
      startRef.current = {
        at: persisted.startedAt!,
        remainingAtStart: persisted.remainingAtStart,
      };
      setRunning(true);
      return;
    }

    if (isStaleForDay(persisted, todayStr)) {
      // A finished or paused leftover from a previous day. Show today fresh
      // and let the watcher deal with it — a finished one logs to its own
      // day, a paused one is dropped (start each day fresh). No takeover:
      // "time's up" about yesterday helps nobody.
      resetFresh();
      requestMeditationSweep();
      return;
    }

    // Same-day, not running.
    notificationIdRef.current = persisted.notificationId;
    activityIdRef.current = persisted.activityId ?? null;
    setTotalSec(persisted.totalSec);

    if (persisted.startedAt != null) {
      // Finished while the app was away. Show the takeover so the user
      // learns their session was recorded, but silently — this is a report,
      // not an alarm going off in their hand. Surfaced once per run, so
      // dismissing it doesn't bring it back on the next resync.
      if (surfacedCompletionRef.current !== persisted.startedAt) {
        surfacedCompletionRef.current = persisted.startedAt;
        setAlarmMode((prev) => (prev === 'off' ? 'silent' : prev));
      }
      requestMeditationSweep();
      setRemainingSec(persisted.totalSec);
      setRunning(false);
      startRef.current = null;
      notificationIdRef.current = null;
      activityIdRef.current = null;
    } else {
      // Paused.
      setRemainingSec(persisted.remainingAtStart);
      setRunning(false);
      startRef.current = null;
    }
  }, [habit, todayStr, defaultDurationSec]);

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
        clearInterval(id);
        setRunning(false);
        surfacedCompletionRef.current = s.at;
        startRef.current = null;

        // Did we watch this land, or is the interval just catching up after
        // the app was suspended?
        const live = shouldRingInApp(
          s.at + s.remainingAtStart * 1000,
          Date.now(),
          AppState.currentState === 'active',
        );

        if (live && Platform.OS === 'ios' && !Platform.isPad) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        // Ring (bell + buzz + takeover) only when the user is here for it;
        // otherwise the takeover appears silently.
        setAlarmMode(live ? 'ringing' : 'silent');

        // Hand off to the watcher, which logs the session against the run's
        // own date, cancels the notification (a no-op if it already fired
        // alongside this), ends the Live Activity that would otherwise sit
        // frozen at 00:00, and clears the persisted slot. Our copies of those
        // ids are done either way.
        notificationIdRef.current = null;
        activityIdRef.current = null;
        requestMeditationSweep();
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
    // Block a fast double-tap: setRunning is async, so without this a second
    // tap before the Start button re-renders away would start a second timer,
    // leaking a duplicate Live Activity + notification.
    if (startingRef.current || running) return;
    startingRef.current = true;
    try {
      if (Platform.OS === 'ios' && !Platform.isPad) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      const now = Date.now();
      const remainAtStart = remainingSec;
      startRef.current = { at: now, remainingAtStart: remainAtStart };
      setRunning(true);

      // Schedule completion alarm (best-effort; null if perms denied).
      const endTime = new Date(now + remainAtStart * 1000);
      const newId = await scheduleMeditationAlarm(endTime, habit.name, habit.id);
      notificationIdRef.current = newId;

      // Start the lock-screen / Dynamic Island Live Activity (best-effort: null
      // if Live Activities are disabled — the notification still rings).
      activityIdRef.current = await startActivity(habit.name, now, endTime.getTime());

      await saveTimerState({
        habitId: habit.id,
        date,
        totalSec,
        startedAt: now,
        remainingAtStart: remainAtStart,
        notificationId: newId,
        activityId: activityIdRef.current,
      });
    } finally {
      startingRef.current = false;
    }
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

    // End the Live Activity on pause; Resume starts a fresh one (mirrors the
    // notification's cancel-and-reschedule behavior).
    await endActivity(activityIdRef.current);
    activityIdRef.current = null;

    await saveTimerState({
      habitId: habit.id,
      date,
      totalSec,
      startedAt: null,
      remainingAtStart: currentRemaining,
      notificationId: null,
      activityId: null,
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
    await endActivity(activityIdRef.current);
    activityIdRef.current = null;
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
    void persistSession({ durationSec: mins * 60, source: 'manual', loggedAt: Date.now() });
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
            {/* Centered help button — explains the keep-awake vs notification
                behavior when the timer ends. */}
            <View style={styles.helpWrap} pointerEvents="box-none">
              <Pressable
                onPress={() => setHelpVisible(true)}
                hitSlop={10}
                style={[styles.helpButton, { borderColor: tint }]}
                accessibilityRole="button"
                accessibilityLabel="About the timer"
                accessibilityHint="Explains lock-screen and notification behavior"
              >
                <ThemedText style={[styles.helpMark, { color: tint }]}>?</ThemedText>
              </Pressable>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <ThemedText style={[styles.close, { color: tint }]}>Close</ThemedText>
            </Pressable>
          </View>
          {!isToday && (
            <ThemedText style={styles.subdued}>
              Editing {date}. Live timer disabled. Use Log Session to backfill.
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
                  accessibilityRole="button"
                  accessibilityLabel="Decrease timer minutes"
                >
                  <ThemedText style={styles.stepperText}>−</ThemedText>
                </Pressable>
                <TextInput
                  style={[styles.minutesInput, { color: colors.text, borderColor: colors.tileBorder }]}
                  value={String(Math.floor(totalSec / 60))}
                  onChangeText={setTotalMinutesFromInput}
                  keyboardType="number-pad"
                  maxLength={3}
                  accessibilityLabel="Timer minutes"
                />
                <Pressable
                  style={[styles.stepper, { borderColor: colors.tileBorder }]}
                  onPress={() => adjustTotalMinutes(1)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Increase timer minutes"
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

      {/* Full-screen "time's up" takeover — covers the sheet while the alarm
          rings, and stands in quietly for a session that finished while the
          app was away. Any tap dismisses it. */}
      {alarmMode !== 'off' && (
        <Pressable
          style={[styles.alarmOverlay, { backgroundColor: tint }]}
          onPress={stopAlarm}
          accessibilityRole="button"
          accessibilityLabel={
            alarming ? "Time's up. Tap to stop the alarm." : "Time's up. Tap to dismiss."
          }
        >
          <ThemedText style={styles.alarmTitle}>Time’s up</ThemedText>
          <ThemedText style={styles.alarmHabit}>{habit.name}</ThemedText>
          <ThemedText style={styles.alarmHint}>
            {alarming ? 'Tap anywhere to stop' : 'Session saved. Tap anywhere to dismiss'}
          </ThemedText>
        </Pressable>
      )}

      {/* Help sub-modal — keep-awake vs notification behavior. */}
      <Modal
        visible={helpVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHelpVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setHelpVisible(false)}>
          <Pressable
            style={[styles.logSheet, { backgroundColor: colors.tileBackground }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ThemedText type="defaultSemiBold" style={styles.logTitle}>
              About the timer
            </ThemedText>
            <ThemedText style={styles.helpBody}>
              While a timer is running with this screen open, your device stays awake so it
              can ring a bell when the time’s up. Tap the screen to silence it.
              {'\n\n'}
              If you leave this screen or lock your phone, the timer keeps running, but we
              can only alert you with a notification when it ends. Coming back afterwards
              shows you the finished session instead of ringing at you.
            </ThemedText>
            <Pressable
              style={[styles.primary, { backgroundColor: tint, alignSelf: 'stretch' }]}
              onPress={() => setHelpVisible(false)}
            >
              <ThemedText style={styles.primaryText}>Got it</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
  helpWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpMark: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  helpBody: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.85,
  },
  alarmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
    zIndex: 10,
  },
  alarmTitle: {
    fontSize: 40,
    // ThemedText's base style sets lineHeight: 24 — without an override that
    // wins, a 40pt line gets clipped to 24pt and the word loses its top and
    // bottom. Same reason timerText carries one.
    lineHeight: 48,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  alarmHabit: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  alarmHint: {
    fontSize: 15,
    lineHeight: 21,
    color: '#fff',
    opacity: 0.85,
    marginTop: 8,
    textAlign: 'center',
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
