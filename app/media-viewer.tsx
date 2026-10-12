import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { MEDIA_NAME_RE, isVideoPoster, mediaFile, videoFileFor } from '@/lib/note-media';

/**
 * Full-screen view of a note's photo or video, opened from the "View photo"
 * / "Play video" chip that appears when the editor caret touches one.
 * Photos pinch-zoom; videos play with the system controls. Share hands the
 * file to the share sheet (Save Image / Save Video live there).
 */
export default function MediaViewerScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // The photo fills exactly the area below the header (centered, contained).
  const [box, setBox] = useState({ width: 0, height: 0 });

  const valid = !!name && MEDIA_NAME_RE.test(name) && !!user;
  const video = valid && isVideoPoster(name);
  const file = useMemo(() => {
    if (!valid) return null;
    if (video) return videoFileFor(user!.uid, name);
    const f = mediaFile(user!.uid, name);
    return f.exists ? f : null;
  }, [valid, video, user, name]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerButton} accessibilityLabel="Close" accessibilityRole="button">
          <IconSymbol name="xmark" size={22} color="#fff" />
        </Pressable>
        {file && (
          <Pressable
            onPress={() => void Sharing.shareAsync(file.uri).catch(() => {})}
            hitSlop={10}
            style={styles.headerButton}
            accessibilityLabel={video ? 'Share video' : 'Share photo'}
            accessibilityRole="button"
          >
            <IconSymbol name="square.and.arrow.up" size={22} color="#fff" />
          </Pressable>
        )}
      </View>

      {!file ? (
        <View style={styles.missing}>
          <ThemedText style={styles.missingTitle}>
            {video ? 'This video is on another phone' : 'This photo is on another phone'}
          </ThemedText>
          <ThemedText style={styles.missingBody}>
            Photos and videos are stored on the phone they were added on. To bring them here, use Move Photos &amp;
            Videos in Settings on that phone, then import the file on this one.
          </ThemedText>
        </View>
      ) : video ? (
        <VideoPane uri={file.uri} />
      ) : (
        <ScrollView
          style={styles.flex}
          onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          contentContainerStyle={styles.zoomContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {box.height > 0 && (
            <Image source={{ uri: file.uri }} style={{ width: box.width, height: box.height }} resizeMode="contain" />
          )}
        </ScrollView>
      )}
    </View>
  );
}

function VideoPane({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });
  return <VideoView player={player} style={styles.flex} nativeControls contentFit="contain" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  headerButton: { padding: 10 },
  zoomContent: { flexGrow: 1 },
  missing: { flex: 1, justifyContent: 'center', padding: 32, gap: 12 },
  missingTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  missingBody: { color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
