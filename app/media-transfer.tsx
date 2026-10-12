import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { mediaStats } from '@/lib/note-media';
import { createTransferFile, importTransferFile } from '@/lib/media-transfer';

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Settings → Move Photos & Videos. Note photos/videos are stored only on the
 * phone they were added on (no cloud storage); notes themselves sync. This
 * screen packs them into one file to send (AirDrop, Files, Drive, email)
 * and imports that file on the other phone.
 */
export default function MediaTransferScreen() {
  // React Compiler memoization breaks the native Switch slide animation.
  'use no memo';
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const offTrack = colorScheme === 'dark' ? '#5A5E66' : '#D8DBE0';

  // A quick directory listing; read once on open and again after an import.
  const [stats, setStats] = useState(() =>
    user ? mediaStats(user.uid) : { photos: 0, videos: 0, photoBytes: 0, videoBytes: 0 },
  );
  const [includeVideos, setIncludeVideos] = useState(false);
  const [busy, setBusy] = useState<'send' | 'receive' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => {
    if (user) setStats(mediaStats(user.uid));
  };

  async function handleSend() {
    if (!user || busy) return;
    setBusy('send');
    setMessage(null);
    try {
      const file = await createTransferFile(user.uid, includeVideos);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/zip',
        UTI: 'public.zip-archive',
        dialogTitle: 'Send Photos',
      });
    } catch (e) {
      console.error('[media-transfer] create failed', e);
      setMessage("Couldn't create the transfer file. Check that the phone has free space and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReceive() {
    if (!user || busy) return;
    setMessage(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    setBusy('receive');
    try {
      const { added, skipped } = await importTransferFile(user.uid, picked.assets[0].uri);
      refresh();
      if (added === 0 && skipped === 0) {
        setMessage('That file has no photos or videos from this app.');
      } else if (added === 0) {
        setMessage('This phone already had everything in that file.');
      } else {
        setMessage(added === 1 ? 'Added 1 file. It now shows in its note.' : `Added ${added} files. They now show in their notes.`);
      }
    } catch (e) {
      console.error('[media-transfer] import failed', e);
      setMessage("Couldn't read that file. Make sure it's the transfer file from your other phone.");
    } finally {
      setBusy(null);
    }
  }

  const sendBytes = stats.photoBytes + (includeVideos ? stats.videoBytes : 0);
  const nothing = stats.photos === 0 && stats.videos === 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerButton} accessibilityRole="button">
            <ThemedText style={[styles.headerButtonText, { color: colors.tint }]}>Done</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title">Move Photos &amp; Videos</ThemedText>
        <ThemedText style={styles.intro}>
          Your notes sync to every phone you sign in on. Their photos and videos are stored only on the phone they
          were added on. To see them on another phone, send them with a transfer file.
        </ThemedText>

        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Send from this phone
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <View style={styles.row}>
            <ThemedText style={styles.label}>On this phone</ThemedText>
            <ThemedText style={styles.value}>
              {nothing
                ? 'None yet'
                : `${plural(stats.photos, 'photo', 'photos')}, ${plural(stats.videos, 'video', 'videos')}`}
            </ThemedText>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Include videos</ThemedText>
              <ThemedText style={styles.hint}>
                {stats.videos > 0 ? `Adds ${formatBytes(stats.videoBytes)}` : 'No videos to send'}
              </ThemedText>
            </View>
            <Switch
              value={includeVideos}
              onValueChange={setIncludeVideos}
              disabled={stats.videos === 0}
              trackColor={{ false: offTrack, true: colors.tint }}
              ios_backgroundColor={offTrack}
              thumbColor="#fff"
            />
          </View>
        </View>
        <Pressable
          style={[styles.button, { backgroundColor: colors.tint, opacity: nothing || busy ? 0.5 : 1 }]}
          onPress={handleSend}
          disabled={nothing || !!busy}
          accessibilityRole="button"
        >
          {busy === 'send' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.buttonText}>
              {nothing ? 'Create Transfer File' : `Create Transfer File (${formatBytes(sendBytes)})`}
            </ThemedText>
          )}
        </Pressable>
        <ThemedText style={styles.hint}>
          Send it with AirDrop, Files, Google Drive, or email. Big files are easiest with AirDrop or Drive.
        </ThemedText>

        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Receive on this phone
        </ThemedText>
        <Pressable
          style={[styles.button, styles.outlineButton, { borderColor: colors.tint, opacity: busy ? 0.5 : 1 }]}
          onPress={handleReceive}
          disabled={!!busy}
          accessibilityRole="button"
        >
          {busy === 'receive' ? (
            <ActivityIndicator color={colors.tint} />
          ) : (
            <ThemedText style={[styles.buttonText, { color: colors.tint }]}>Import Transfer File</ThemedText>
          )}
        </Pressable>
        <ThemedText style={styles.hint}>
          Photos land in the notes they belong to, even if those notes are already on this phone. A notes export
          .zip works here too.
        </ThemedText>

        {message && (
          <View style={[styles.card, styles.message, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
            <ThemedText style={styles.messageText}>{message}</ThemedText>
          </View>
        )}

        <ThemedText style={[styles.hint, styles.footnote]}>
          Moving to a new iPhone? Restoring it from an iCloud backup brings photos and videos along on its own.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8, paddingVertical: 6 },
  headerButton: { padding: 8 },
  headerButtonText: { fontSize: 16, fontWeight: '600' },
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  intro: { opacity: 0.7, lineHeight: 21 },
  sectionHeader: { fontSize: 13, opacity: 0.5, marginTop: 16, marginLeft: 4, textTransform: 'uppercase' },
  card: { borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
    gap: 12,
  },
  label: { fontSize: 15 },
  value: { fontSize: 15, opacity: 0.6 },
  hint: { fontSize: 13, opacity: 0.55, lineHeight: 18 },
  button: { height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  outlineButton: { borderWidth: 1 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  message: { padding: 14 },
  messageText: { fontSize: 15, lineHeight: 21 },
  footnote: { marginTop: 16 },
});
