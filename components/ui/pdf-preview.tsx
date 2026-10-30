import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { PdfDoc } from '@/lib/pdf-share';

type Props = {
  /** Null while the PDF is still rendering. */
  doc: PdfDoc | null;
  backLabel: string;
  onBack: () => void;
  onShare: () => void;
  sharing: boolean;
};

/**
 * Full-screen look at exactly what Share sends. iOS opens the rendered PDF
 * file itself (pages and all); Android's WebView can't open a PDF, so it
 * shows the same HTML the PDF was printed from.
 */
export function PdfPreview({ doc, backLabel, onBack, onShare, sharing }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const dir = doc ? doc.uri.slice(0, doc.uri.lastIndexOf('/') + 1) : undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.tileBorder }]}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.side} accessibilityRole="button">
          <ThemedText style={[styles.action, { color: colors.tint }]}>{backLabel}</ThemedText>
        </Pressable>
        <ThemedText style={styles.title} numberOfLines={1}>
          {doc?.title ?? 'Preview'}
        </ThemedText>
        <Pressable
          onPress={onShare}
          disabled={!doc || sharing}
          hitSlop={8}
          style={[styles.side, styles.sideRight]}
          accessibilityRole="button"
          accessibilityLabel="Share PDF"
        >
          {sharing ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <ThemedText style={[styles.action, styles.bold, { color: colors.tint, opacity: doc ? 1 : 0.4 }]}>
              Share
            </ThemedText>
          )}
        </Pressable>
      </View>
      {doc ? (
        <WebView
          style={styles.web}
          originWhitelist={['*']}
          source={Platform.OS === 'ios' ? { uri: doc.uri } : { html: doc.html }}
          allowingReadAccessToURL={dir}
          allowFileAccess
        />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.icon} />
        </View>
      )}
      <View style={{ height: insets.bottom, backgroundColor: colors.background }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { minWidth: 64 },
  sideRight: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  action: { fontSize: 16 },
  bold: { fontWeight: '700' },
  web: { flex: 1, backgroundColor: 'transparent' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
