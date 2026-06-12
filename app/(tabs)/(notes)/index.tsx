import { useState, useMemo, useCallback, useEffect } from 'react';
import { StyleSheet, FlatList, TextInput, View, Pressable, Keyboard, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
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
import type { Note } from '@/types/note';

const DISMISS_BAR_HEIGHT = 40;

export default function NotesListScreen() {
  const { notes, isLoading, isOffline, createNote, deleteNote, togglePinNote, loadMore, loadAll, allLoaded, hasLoadedOnce, isLoadingMore } = useNotes();
  const { tags, deleteTags } = useTags();
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

  // Only show tags that are actually attached to at least one note.
  const visibleTags = useMemo(() => {
    const inUse = new Set<string>();
    for (const n of notes) {
      for (const t of n.tags) inUse.add(t.tagId);
    }
    return tags.filter((t) => inUse.has(t.id));
  }, [notes, tags]);

  // Delete orphaned tags whenever the notes page is focused. 500ms debounce
  // lets Firestore snapshots settle after any in-flight tag attachment writes.
  useFocusEffect(
    useCallback(() => {
      if (isLoading) return;
      // Only GC once we hold the COMPLETE note set. On a partial page we can't
      // tell a truly-orphaned tag from one still referenced by an unloaded
      // note — deleting the latter would lose that reference. So defer GC
      // until everything is loaded ("load all", or a library small enough to
      // fit one page) rather than risk a wrong delete.
      if (!allLoaded) return;
      // And never against an error/empty-state note set: a failed listener
      // leaves notes=[] with loading finished, and sweeping against that
      // would mass-delete every tag.
      if (!hasLoadedOnce) return;
      const timer = setTimeout(() => {
        const inUse = new Set<string>();
        for (const n of notes) {
          for (const t of n.tags) inUse.add(t.tagId);
        }
        const orphans = tags.filter((t) => !inUse.has(t.id)).map((t) => t.id);
        if (orphans.length > 0) deleteTags(orphans);
      }, 500);
      return () => clearTimeout(timer);
    }, [notes, tags, isLoading, allLoaded, hasLoadedOnce, deleteTags]),
  );

  // Drop the active filter if its tag is no longer in use.
  useEffect(() => {
    if (selectedTagId && !visibleTags.some((t) => t.id === selectedTagId)) {
      setSelectedTagId(null);
    }
  }, [selectedTagId, visibleTags]);

  // Stable so the memoized NoteListItem rows don't re-render on every
  // keystroke/pin toggle (router is a module singleton, no deps needed).
  const handleOpenNote = useCallback((noteId: string) => {
    router.push(`/(tabs)/(notes)/${noteId}`);
  }, []);

  // Hoisted + stable so NoteListItem's memo actually skips re-renders while
  // typing in the search field (an inline closure re-created per keystroke
  // is fine for memo'd children only if its props are stable — keep them so).
  const renderNote = useCallback(
    ({ item }: { item: Note }) => (
      <NoteListItem
        note={item}
        tags={tags}
        onPress={handleOpenNote}
        onDelete={deleteNote}
        onTogglePin={togglePinNote}
      />
    ),
    [tags, handleOpenNote, deleteNote, togglePinNote],
  );

  const filteredNotes = useMemo(() => {
    let result = notes;

    // Filter by tag
    if (selectedTagId) {
      result = result.filter((note) => note.tags.some((t) => t.tagId === selectedTagId));
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((note) => {
        if (note.title.toLowerCase().includes(q)) return true;
        // Checklist notes keep `content` as a stale pre-toggle snapshot
        // (live items are in a subcollection) — search what the list doc
        // actually knows: the description and the summary preview.
        if (note.type === 'checklist') {
          return (
            (note.description ?? '').toLowerCase().includes(q) ||
            (note.checklistSummary?.firstUncompleted ?? '').toLowerCase().includes(q)
          );
        }
        return note.content.toLowerCase().includes(q);
      });
    }

    // Pinned notes first, then unpinned. Within each group, preserve updatedAt desc.
    return [...result].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return b.updatedAt - a.updatedAt;
    });
  }, [notes, searchQuery, selectedTagId]);

  // A search query or tag filter only covers the loaded window; "load all"
  // (the affordance below) extends coverage to every note on demand.
  const isFiltering = searchQuery.trim().length > 0 || selectedTagId !== null;

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
      {visibleTags.length > 0 && (
        <View style={styles.tagFilters}>
          <TagChip
            name="All"
            selected={!selectedTagId}
            onPress={() => setSelectedTagId(null)}
            small
          />
          {visibleTags.map((tag) => (
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

      {/* Search-all affordance: search/tag filter only covers the loaded
          window until the user opts to load everything. */}
      {isFiltering && !allLoaded && !isLoadingMore && (
        <Pressable style={styles.loadAllButton} onPress={loadAll}>
          <ThemedText style={[styles.loadAllText, { color: colors.tint }]}>
            {searchQuery.trim() ? 'Search all notes' : 'Load all notes'}
          </ThemedText>
        </Pressable>
      )}

      {/* Notes list */}
      <FlatList
        data={filteredNotes}
        extraData={tags}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        // Infinite scroll while browsing. Disabled while filtering so a short
        // filtered list doesn't silently page through everything — the
        // "load all" button above is the explicit path for full coverage.
        onEndReached={isFiltering ? undefined : loadMore}
        onEndReachedThreshold={0.5}
        renderItem={renderNote}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {isLoading ? (
              <ActivityIndicator size="large" color={colors.tint} />
            ) : (
              <ThemedText style={styles.emptyText}>
                {searchQuery || selectedTagId
                  ? 'No matching notes'
                  : isOffline
                    ? 'No internet connection'
                    : 'No notes yet'}
              </ThemedText>
            )}
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
  loadAllButton: {
    marginHorizontal: 16,
    marginBottom: 4,
    paddingVertical: 8,
    alignItems: 'center',
  },
  loadAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
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
