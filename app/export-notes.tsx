import { useState, useMemo } from 'react';
import { StyleSheet, ScrollView, View, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TagChip } from '@/components/notes/tag-chip';
import { useNotes } from '@/hooks/use-notes';
import { useTags } from '@/hooks/use-tags';
import { allNotesToMarkdown } from '@/lib/export/markdown-export';
import { saveAndShareFiles } from '@/lib/export/file-saver';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ExportScreen() {
  const { notes } = useNotes();
  const { tags } = useTags();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const filteredNotes = useMemo(() => {
    if (!filterTagId) return notes;
    return notes.filter((note) => note.tags.some((t) => t.tagId === filterTagId));
  }, [notes, filterTagId]);

  async function handleExport() {
    if (filteredNotes.length === 0) {
      Alert.alert('No notes', 'No notes to export.');
      return;
    }

    setExporting(true);
    try {
      const files = allNotesToMarkdown(filteredNotes, tags);
      await saveAndShareFiles(files);
    } catch (e: any) {
      Alert.alert('Export failed', e.message ?? 'Unknown error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title">Export Notes</ThemedText>
        <ThemedText style={styles.description}>
          Export as Markdown (.md) with YAML frontmatter — optimized for AI agents and standard editors.
        </ThemedText>

        {/* Filter */}
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Filter by tag (optional)
        </ThemedText>
        <View style={styles.tagRow}>
          <TagChip name="All Notes" selected={!filterTagId} onPress={() => setFilterTagId(null)} />
          {tags.map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.name}
              color={tag.color}
              selected={filterTagId === tag.id}
              onPress={() => setFilterTagId(filterTagId === tag.id ? null : tag.id)}
            />
          ))}
        </View>

        <ThemedText style={styles.count}>
          {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''} will be exported
        </ThemedText>

        {/* Preview */}
        {filteredNotes.length > 0 && (
          <View style={[styles.preview, { backgroundColor: colors.gridBackground }]}>
            <ThemedText type="defaultSemiBold" style={styles.previewTitle}>
              Format Preview
            </ThemedText>
            <ThemedText style={[styles.previewCode, { fontFamily: 'monospace' }]}>
              {`---\ntitle: "${filteredNotes[0].title || 'Untitled'}"\ntags: [...]\ncreated: 2026-...\nupdated: 2026-...\n---\n\n(note content)`}
            </ThemedText>
          </View>
        )}

        <Pressable
          style={[styles.exportButton, { backgroundColor: colors.tint, opacity: exporting ? 0.6 : 1 }]}
          onPress={handleExport}
          disabled={exporting}
        >
          <ThemedText style={styles.exportText}>
            {exporting ? 'Exporting...' : 'Export as Markdown'}
          </ThemedText>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <ThemedText style={[styles.cancelText, { color: colors.tint }]}>Cancel</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  description: { opacity: 0.6, lineHeight: 20 },
  label: { marginTop: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  count: { fontSize: 14, opacity: 0.5 },
  preview: { borderRadius: 8, padding: 12, gap: 8 },
  previewTitle: { fontSize: 13 },
  previewCode: { fontSize: 12, opacity: 0.7, lineHeight: 18 },
  exportButton: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  exportText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  cancelButton: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: { fontWeight: '600', fontSize: 16 },
});
