import { useCallback } from 'react';
import { StyleSheet, ScrollView, View, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { NoteEditor } from '@/components/notes/note-editor';
import { useNotes } from '@/hooks/use-notes';
import { useTags } from '@/hooks/use-tags';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { InlineTag } from '@/types/note';

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { notes, updateNote, deleteNote } = useNotes();
  const { tags, createTag } = useTags();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const note = notes.find((n) => n.id === id);

  const handleUpdateTitle = useCallback(
    (title: string) => {
      if (id) updateNote(id, { title });
    },
    [id, updateNote],
  );

  const handleUpdateContent = useCallback(
    (content: string) => {
      if (id) updateNote(id, { content });
    },
    [id, updateNote],
  );

  const handleUpdateTags = useCallback(
    (noteTags: InlineTag[]) => {
      if (id) updateNote(id, { tags: noteTags });
    },
    [id, updateNote],
  );

  const handleCreateTag = useCallback(
    async (name: string) => {
      await createTag(name);
    },
    [createTag],
  );

  if (!note) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Note not found</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View />
        <Pressable
          onPress={() => {
            // Delete the note if it's completely empty
            if (note && !note.title.trim() && !note.content.trim()) {
              deleteNote(note.id);
            }
            router.back();
          }}
          style={styles.headerButton}
        >
          <ThemedText style={[styles.headerButtonText, { color: colors.tint }]}>Done</ThemedText>
        </Pressable>
      </View>

      <ScrollView style={styles.scrollView} keyboardDismissMode="interactive">
        <NoteEditor
          note={note}
          tags={tags}
          onUpdateTitle={handleUpdateTitle}
          onUpdateContent={handleUpdateContent}
          onUpdateTags={handleUpdateTags}
          onCreateTag={handleCreateTag}
        />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  headerButton: {
    padding: 8,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
