import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, FlatList, TextInput, View, Pressable, Keyboard } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NoteListItem } from '@/components/notes/note-list-item';
import { TagChip } from '@/components/notes/tag-chip';
import { useNotes } from '@/hooks/use-notes';
import { useTags } from '@/hooks/use-tags';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const DISMISS_BAR_HEIGHT = 40;

export default function NotesListScreen() {
  const { notes, isLoading, createNote, deleteNote, togglePinNote } = useNotes();
  const { tags } = useTags();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const tabBarHeight = useBottomTabBarHeight();
  const { height: kbHeight, progress } = useReanimatedKeyboardAnimation();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  // Dismiss bar slides with keyboard via Reanimated
  const animatedBarStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: DISMISS_BAR_HEIGHT * (1 - progress.value) + tabBarHeight + kbHeight.value,
    }],
  }));

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

    // Pinned notes first, then unpinned. Within each group, preserve updatedAt desc.
    return [...result].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return b.updatedAt - a.updatedAt;
    });
  }, [notes, searchQuery, selectedTagId]);

  const handleCreateNote = useCallback(() => {
    const note = createNote('');
    if (note) {
      router.push(`/(tabs)/(notes)/${note.id}?new=1`);
    }
  }, [createNote]);


  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} />
      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, { color: colors.text, backgroundColor: colors.gridBackground }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search notes..."
          placeholderTextColor={colors.icon}
          clearButtonMode="while-editing"
          keyboardAppearance={colorScheme === 'dark' ? 'dark' : 'light'}
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
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <NoteListItem
            note={item}
            tags={tags}
            onPress={() => router.push(`/(tabs)/(notes)/${item.id}`)}
            onDelete={(noteId) => deleteNote(noteId)}
            onTogglePin={(noteId, pinned) => togglePinNote(noteId, pinned)}
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
        style={[styles.fab, { backgroundColor: colors.tint, bottom: tabBarHeight + 16 }]}
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

      {/* Keyboard dismiss bar — slides with keyboard */}
      <Animated.View
        style={[
          styles.dismissBar,
          { backgroundColor: colors.background, borderTopColor: colors.tileBorder },
          animatedBarStyle,
        ]}
      >
        <View style={styles.dismissSpacer} />
        <Pressable onPress={Keyboard.dismiss} style={styles.dismissButton} hitSlop={8}>
          <IconSymbol name="keyboard.chevron.compact.down" size={22} color={colors.icon} />
        </Pressable>
      </Animated.View>
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
  list: {
    marginBottom: 88, // reserve space for FAB + Export Notes so they never overlap list items
  },
  listContent: {
    padding: 16,
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
    bottom: 34, // vertically centered with FAB (FAB is 56 tall at bottom:16, center at 44)
  },
  exportText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dismissBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dismissSpacer: {
    flex: 1,
  },
  dismissButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
