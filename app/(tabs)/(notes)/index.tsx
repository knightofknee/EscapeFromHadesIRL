import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, FlatList, TextInput, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NoteListItem } from '@/components/notes/note-list-item';
import { TagChip } from '@/components/notes/tag-chip';
import { useNotes } from '@/hooks/use-notes';
import { useTags } from '@/hooks/use-tags';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function NotesListScreen() {
  const { notes, isLoading, createNote, deleteNote } = useNotes();
  const { tags } = useTags();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  const filteredNotes = useMemo(() => {
    let result = notes;

    // Filter by tag
    if (selectedTagId) {
      result = result.filter((note) => note.tags.some((t) => t.tagId === selectedTagId));
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (note) =>
          note.title.toLowerCase().includes(q) || note.content.toLowerCase().includes(q),
      );
    }

    return result;
  }, [notes, searchQuery, selectedTagId]);

  const handleCreateNote = useCallback(async () => {
    const note = await createNote('');
    if (note) {
      router.push(`/(tabs)/(notes)/${note.id}`);
    }
  }, [createNote]);


  return (
    <ThemedView style={styles.container}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, { color: colors.text, backgroundColor: colors.gridBackground }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search notes..."
          placeholderTextColor={colors.icon}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Tag filters */}
      {tags.length > 0 && (
        <View style={styles.tagFilters}>
          <TagChip
            name="All"
            selected={!selectedTagId}
            onPress={() => setSelectedTagId(null)}
            small
          />
          {tags.map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.name}
              color={tag.color}
              selected={selectedTagId === tag.id}
              onPress={() => setSelectedTagId(selectedTagId === tag.id ? null : tag.id)}
              small
            />
          ))}
        </View>
      )}

      {/* Notes list */}
      <FlatList
        data={filteredNotes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <NoteListItem
            note={item}
            tags={tags}
            onPress={() => router.push(`/(tabs)/(notes)/${item.id}`)}
            onDelete={(noteId) => deleteNote(noteId)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText style={styles.emptyText}>
              {isLoading ? 'Loading...' : searchQuery || selectedTagId ? 'No matching notes' : 'No notes yet'}
            </ThemedText>
          </View>
        }
      />

      {/* FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.tint }]}
        onPress={handleCreateNote}
      >
        <ThemedText style={styles.fabText}>+</ThemedText>
      </Pressable>

      {/* Export link */}
      <Pressable
        style={styles.exportLink}
        onPress={() => router.push('/export-notes')}
      >
        <ThemedText style={[styles.exportText, { color: colors.tint }]}>Export Notes</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInput: {
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  tagFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
    gap: 10,
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    opacity: 0.5,
    fontSize: 16,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 30,
  },
  exportLink: {
    position: 'absolute',
    left: 20,
    bottom: 88,
  },
  exportText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
