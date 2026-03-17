import { useCallback } from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { NoteEditor } from '@/components/notes/note-editor';
import { useNotes } from '@/hooks/use-notes';
import { useTags } from '@/hooks/use-tags';
import type { InlineTag } from '@/types/note';

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { notes, updateNote } = useNotes();
  const { tags, createTag } = useTags();

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
  scrollView: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
