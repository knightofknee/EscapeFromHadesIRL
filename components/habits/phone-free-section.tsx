import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { PhoneFreeSelectionSheet } from '@/components/habits/phone-free-selection-sheet';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePhoneFreeNights } from '@/hooks/use-phone-free-nights';
import { formatDate } from '@/lib/date-utils';
import { formatHoursMinutes } from '@/lib/phone-free';

/**
 * Phone-free nights for the week on screen. Lives under the Colors of
 * Success legend on the week view for now (placement is provisional per
 * the user, 2026-11-03). Shows the setup step when the OS permission or the
 * iOS app selection is missing, otherwise one row per night.
 */
export function PhoneFreeSection({ dates }: { dates: Date[] }) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const dateStrs = dates.map(formatDate);
  const { status, nights, requestPermission, saveSelection } = usePhoneFreeNights(dateStrs);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status === 'loading' || status === 'unavailable') return null;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (status === 'needs-permission') {
    body = (
      <>
        <ThemedText style={[styles.explain, { color: colors.icon }]}>
          {Platform.OS === 'ios'
            ? 'Reads when your phone is in use through Screen Time. Nothing is blocked and nothing leaves the phone.'
            : 'Reads when your phone is locked and unlocked. Nothing leaves the phone.'}
        </ThemedText>
        <Pressable
          disabled={busy}
          onPress={() => run(requestPermission)}
          style={[styles.button, { backgroundColor: colors.tint, opacity: busy ? 0.6 : 1 }]}
        >
          <ThemedText style={styles.buttonText}>
            {Platform.OS === 'ios' ? 'Allow Screen Time access' : 'Allow usage access'}
          </ThemedText>
        </Pressable>
      </>
    );
  } else if (status === 'needs-selection') {
    body = (
      <>
        <ThemedText style={[styles.explain, { color: colors.icon }]}>
          Apple needs you to choose which apps count. Tick every category so all phone use counts.
        </ThemedText>
        <Pressable
          disabled={busy}
          onPress={() => setPickerOpen(true)}
          style={[styles.button, { backgroundColor: colors.tint, opacity: busy ? 0.6 : 1 }]}
        >
          <ThemedText style={styles.buttonText}>Choose apps</ThemedText>
        </Pressable>
        <PhoneFreeSelectionSheet
          visible={pickerOpen}
          onClose={(token) => {
            setPickerOpen(false);
            if (token) run(() => saveSelection(token));
          }}
        />
      </>
    );
  } else {
    body = (
      <View style={styles.rows}>
        {dateStrs.map((d, i) => {
          const night = nights[d];
          const label = dates[i].toLocaleDateString('en-US', { weekday: 'short' });
          return (
            <View key={d} style={[styles.row, { borderColor: colors.tileBorder }]}>
              <ThemedText style={styles.day}>{label}</ThemedText>
              {night ? (
                <>
                  <ThemedText type="defaultSemiBold" style={styles.hours}>
                    {formatHoursMinutes(night.phoneFreeMs)}
                  </ThemedText>
                  <ThemedText style={[styles.meta, { color: colors.icon }]}>
                    {`${timeLabel(night.start)} to ${timeLabel(night.end)}`}
                    {night.pickups > 0
                      ? ` · ${night.pickups} ${night.pickups === 1 ? 'pickup' : 'pickups'}, ${formatHoursMinutes(night.usageMs)} on phone`
                      : ' · no pickups'}
                  </ThemedText>
                </>
              ) : (
                <ThemedText style={[styles.meta, { color: colors.icon }]}>no data</ThemedText>
              )}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.gridBackground }]}>
      <ThemedText style={styles.title}>Phone-free nights</ThemedText>
      <ThemedText style={[styles.subtitle, { color: colors.icon }]}>
        Longest stretch without your phone, 6pm to noon. Pickups under 5 minutes don't end the
        night. Every minute on the phone is subtracted.
      </ThemedText>
      {body}
    </View>
  );
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    marginHorizontal: 4,
    marginBottom: 24,
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
  explain: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  rows: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  day: {
    width: 36,
    fontSize: 13,
  },
  hours: {
    fontSize: 15,
    minWidth: 64,
  },
  meta: {
    fontSize: 12,
    flexShrink: 1,
  },
});
