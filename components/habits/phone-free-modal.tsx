import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { PhoneFreeSelectionSheet } from '@/components/habits/phone-free-selection-sheet';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePhoneFreeNights } from '@/hooks/use-phone-free-nights';
import { addDays, getTodayString } from '@/lib/date-utils';
import { computePhoneFreeLevel, formatHoursMinutes, nightWindow } from '@/lib/phone-free';
import { SNAPSHOT_LOOKBACK_DAYS } from '@/lib/phone-free-sync';
import type { Habit } from '@/types/habit';

type PhoneFreeModalProps = {
  visible: boolean;
  habit: Habit | null;
  date: string;
  onClose: () => void;
};

const LEVEL_TEXT = ['Below Level 1', 'Level 1: yes', 'Level 2: goal', 'Level 3: ideal'];

/**
 * Tap-on-tile modal for Phone-free Nights habits: the night behind the
 * viewed day (longest phone-free stretch, when it ran, pickups), the goal
 * ladder, and the setup steps while permission or the iOS app selection is
 * still missing. Nothing here is entered by hand.
 */
export function PhoneFreeModal({ visible, habit, date, onClose }: PhoneFreeModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const tint = colors.tint;
  const { status, nights, checkedAt, requestPermission, saveSelection } = usePhoneFreeNights(
    visible ? [date] : [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!habit) return null;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const night = nights[date];
  const goals = habit.phoneFreeGoals ?? [];
  const ms = night?.phoneFreeMs ?? 0;
  const level = ['no', 'yes', 'goal', 'ideal'].indexOf(computePhoneFreeLevel(ms, goals));

  // Why a date has no night: still running, too old to read back, or the
  // sources never saw it (app wasn't opened in time).
  const noNightReason = (() => {
    const today = getTodayString();
    const window = nightWindow(date);
    if (window.end > checkedAt) {
      return date === today
        ? 'Last night is still being measured. The number appears after noon.'
        : 'This night has not ended yet.';
    }
    if (date < addDays(today, -(SNAPSHOT_LOOKBACK_DAYS - 1))) {
      return 'Nights older than a week cannot be read back.';
    }
    return 'No night recorded for this date. Open the app within a week of a night for it to count.';
  })();

  const setupHint =
    Platform.OS === 'ios'
      ? 'Reads when your phone is in use through Screen Time. Nothing is blocked and nothing leaves the phone.'
      : 'Reads when your phone is locked and unlocked. Nothing leaves the phone.';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.tileBackground }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <ThemedText type="defaultSemiBold" style={styles.title}>
              {habit.name}
            </ThemedText>
            <Pressable onPress={onClose} hitSlop={12}>
              <ThemedText style={[styles.close, { color: tint }]}>Close</ThemedText>
            </Pressable>
          </View>

          <View style={styles.body}>
            {status === 'loading' ? null : status === 'unavailable' ? (
              <ThemedText style={styles.hint}>
                Phone-free nights cannot be measured on this device.
              </ThemedText>
            ) : status === 'needs-permission' ? (
              <View style={styles.center}>
                <ThemedText style={styles.hint}>{setupHint}</ThemedText>
                <Pressable
                  disabled={busy}
                  style={[styles.primary, { backgroundColor: tint, opacity: busy ? 0.6 : 1 }]}
                  onPress={() => run(requestPermission)}
                >
                  <ThemedText style={styles.primaryText}>
                    {Platform.OS === 'ios' ? 'Allow Screen Time access' : 'Allow usage access'}
                  </ThemedText>
                </Pressable>
              </View>
            ) : status === 'needs-selection' ? (
              <View style={styles.center}>
                <ThemedText style={styles.hint}>
                  Apple needs you to choose which apps count. Tick every category so all phone
                  use counts.
                </ThemedText>
                <Pressable
                  disabled={busy}
                  style={[styles.primary, { backgroundColor: tint, opacity: busy ? 0.6 : 1 }]}
                  onPress={() => setPickerOpen(true)}
                >
                  <ThemedText style={styles.primaryText}>Choose apps</ThemedText>
                </Pressable>
                <PhoneFreeSelectionSheet
                  visible={pickerOpen}
                  onClose={(token) => {
                    setPickerOpen(false);
                    if (token) run(() => saveSelection(token));
                  }}
                />
              </View>
            ) : night ? (
              <>
                <View style={styles.center}>
                  <ThemedText style={[styles.bigNumber, { color: tint }]}>
                    {formatHoursMinutes(night.phoneFreeMs)}
                  </ThemedText>
                  <ThemedText style={styles.bigNumberCaption}>phone-free</ThemedText>
                </View>
                <ThemedText style={styles.tierText}>{LEVEL_TEXT[Math.max(0, level)]}</ThemedText>
                <ThemedText style={styles.detail}>
                  {`${timeLabel(night.start)} to ${timeLabel(night.end)}`}
                  {night.pickups > 0
                    ? ` · ${night.pickups} ${night.pickups === 1 ? 'pickup' : 'pickups'}, ${formatHoursMinutes(night.usageMs)} on phone`
                    : ' · no pickups'}
                </ThemedText>
                <View style={styles.divider} />
                {goals.length === 0 ? (
                  <ThemedText style={styles.hint}>No goals set yet.</ThemedText>
                ) : (
                  goals.map((g, i) => {
                    const hit = ms >= g * 60 * 60 * 1000;
                    return (
                      <View key={i} style={styles.goalRow}>
                        <ThemedText style={styles.goalLabel}>Level {i + 1}</ThemedText>
                        <ThemedText style={styles.goalValue}>{`${g}h`}</ThemedText>
                        <ThemedText style={[styles.goalMark, hit && { color: tint }]}>
                          {hit ? '✓' : '—'}
                        </ThemedText>
                      </View>
                    );
                  })
                )}
              </>
            ) : (
              <ThemedText style={styles.hint}>{noNightReason}</ThemedText>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
    fontSize: 48,
    lineHeight: 58,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  bigNumberCaption: {
    fontSize: 14,
    opacity: 0.7,
  },
  tierText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  detail: {
    fontSize: 13,
    opacity: 0.7,
    textAlign: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(128,128,128,0.4)',
    marginVertical: 4,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  goalLabel: {
    width: 64,
    fontSize: 14,
    opacity: 0.7,
  },
  goalValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  goalMark: {
    fontSize: 16,
    opacity: 0.6,
    width: 24,
    textAlign: 'right',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.8,
    textAlign: 'center',
  },
  primary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
