import { useState, useMemo, useCallback, useEffect } from 'react';
import { StyleSheet, FlatList, TextInput, View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useNotesSort } from '@/hooks/use-notes-sort';
import { useTags } from '@/hooks/use-tags';
import { recordListView } from '@/lib/last-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Note } from '@/types/note';
import { notePlainText } from '@/lib/note-content';

const SHOW_BOOKMARKED_KEY = '@showBookmarkedNotes';

export default function NotesListScreen() {
  const { notes, isLoading, isOffline, createNote, deleteNote, togglePinNote, loadMore, loadAll, allLoaded, hasLoadedOnce, listenerError, isLoadingMore } = useNotes();
  const { tags, deleteTags } = useTags();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const tabBarHeight = useBottomTabBarHeight();
  const { height: kbHeight, progress } = useReanimatedKeyboardAnimation();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  // Sort: last edited (default) vs created. The notes provider re-orders its
  // Firestore window by the same field, so pagination stays correct.
  const { notesSort, setNotesSort } = useNotesSort();
  // Bookmark priority toggle: ON (default) floats bookmarked notes to the
  // top; OFF keeps them in the list but sorted by date like everything else.
  // Persisted across launches.
  const [showBookmarked, setShowBookmarked] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(SHOW_BOOKMARKED_KEY).then((v) => {
      if (v === 'hidden') setShowBookmarked(false);
    });
  }, []);
  const toggleBookmarked = useCallback(() => {
    setShowBookmarked((prev) => {
      AsyncStorage.setItem(SHOW_BOOKMARKED_KEY, prev ? 'hidden' : 'shown');
      return !prev;
    });
  }, []);

  // The bottom row (search + new note) sits on the tab bar and rides up with
  // the keyboard while searching. The keyboard covers the tab bar, so its
  // height is handed back as the keyboard opens to keep the row flush.
  const bottomRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: kbHeight.value + tabBarHeight * progress.value }],
  }));

  // Only show tags that are actually attached to at least one note.
  const visibleTags = useMemo(() => {
    const inUse = new Set<string>();
    for (const n of notes) {
      for (const t of n.tags) inUse.add(t.tagId);
    }
    return tags.filter((t) => inUse.has(t.id));
  }, [notes, tags]);

  // Remember "the user was on the list" for the reopen-where-you-were restore.
  useFocusEffect(
    useCallback(() => {
      recordListView();
    }, []),
  );

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
      // Belt-and-suspenders: if the listener is currently in an error state,
      // the note set may be stale/empty — never GC tags against it.
      if (listenerError) return;
      const timer = setTimeout(() => {
        const inUse = new Set<string>();
        for (const n of notes) {
          for (const t of n.tags) inUse.add(t.tagId);
        }
        const orphans = tags.filter((t) => !inUse.has(t.id)).map((t) => t.id);
        if (orphans.length > 0) deleteTags(orphans);
      }, 500);
      return () => clearTimeout(timer);
    }, [notes, tags, isLoading, allLoaded, hasLoadedOnce, listenerError, deleteTags]),
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
        sortBy={notesSort}
        onPress={handleOpenNote}
        onDelete={deleteNote}
        onTogglePin={togglePinNote}
      />
    ),
    [tags, notesSort, handleOpenNote, deleteNote, togglePinNote],
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
        return notePlainText(note).toLowerCase().includes(q);
      });
    }

    // With bookmark priority on, pinned notes float first; within each group
    // (or across all notes when priority is off), the active sort field desc.
    return [...result].sort((a, b) => {
      if (showBookmarked) {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
      }
      return notesSort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt;
    });
  }, [notes, searchQuery, selectedTagId, notesSort, showBookmarked]);

  const hasBookmarked = useMemo(() => notes.some((n) => n.pinned), [notes]);

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
      {/* One slim top row: tag filters scroll sideways on a single line, the
          sort toggle stays pinned at the right. Search and New Note live at
          the bottom, so the notes get the rest of the screen. */}
      <View style={styles.topRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagScroll}
          contentContainerStyle={styles.tagScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {visibleTags.length > 0 && (
            <TagChip
              name="All"
              selected={!selectedTagId}
              onPress={() => setSelectedTagId(null)}
              small
            />
          )}
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
        </ScrollView>
        {/* Bookmark priority (only when something is bookmarked), then the
            sort toggle: last edited (default) vs created. */}
        {hasBookmarked && (
          <Pressable
            onPress={toggleBookmarked}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              showBookmarked
                ? 'Bookmarked notes float to top. Tap to sort them by date instead.'
                : 'Bookmarked notes sorted by date. Tap to float them to top.'
            }
          >
            <IconSymbol
              name={showBookmarked ? 'bookmark.fill' : 'bookmark.slash'}
              size={18}
              color={showBookmarked ? colors.tint : colors.icon}
            />
          </Pressable>
        )}
        <Pressable
          onPress={() => setNotesSort(notesSort === 'created' ? 'updated' : 'created')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${notesSort === 'created' ? 'date created' : 'last edited'}. Tap to change.`}
        >
          <ThemedText style={[styles.sortText, { color: colors.tint }]}>
            {notesSort === 'created' ? 'Created' : 'Edited'} ⇅
          </ThemedText>
        </Pressable>
      </View>

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
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
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
            {/* Offline BEFORE anything ever loaded keeps the loading
                treatment (plus a note) — the listener retries on its own and
                the list fills in when service returns. A confirmed-empty list
                that then goes offline shows the normal empty text instead.
                Filtered searches skip it: those run over already-loaded
                notes. */}
            {isLoading || (isOffline && !hasLoadedOnce && !searchQuery && !selectedTagId) ? (
              <>
                <ActivityIndicator size="large" color={colors.tint} />
                {isOffline ? (
                  <ThemedText style={[styles.emptyText, styles.emptyWaiting]}>
                    Waiting for connection...
                  </ThemedText>
                ) : null}
              </>
            ) : (
              <ThemedText style={styles.emptyText}>
                {searchQuery || selectedTagId ? 'No matching notes' : 'No notes yet'}
              </ThemedText>
            )}
          </View>
        }
      />

      {/* Bottom row: search + new note, right above the tab bar. Rides up
          with the keyboard while searching; dragging the list dismisses it. */}
      <Animated.View
        style={[
          styles.bottomRow,
          { backgroundColor: colors.background, borderTopColor: colors.tileBorder },
          bottomRowStyle,
        ]}
      >
        <TextInput
          style={[styles.searchInput, { color: colors.text, backgroundColor: colors.gridBackground }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search notes..."
          placeholderTextColor={colors.icon}
          clearButtonMode="while-editing"
          returnKeyType="search"
          keyboardAppearance={colorScheme === 'dark' ? 'dark' : 'light'}
        />
        <Pressable
          style={[styles.newButton, { backgroundColor: colors.tint }]}
          onPress={handleCreateNote}
          accessibilityRole="button"
          accessibilityLabel="New note"
        >
          <ThemedText style={styles.newButtonText}>+</ThemedText>
        </Pressable>
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 6,
    gap: 10,
  },
  tagScroll: {
    flex: 1,
  },
  tagScrollContent: {
    alignItems: 'center',
    gap: 6,
  },
  sortText: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.85,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 12,
    gap: 6,
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
  emptyWaiting: {
    marginTop: 16,
    fontSize: 14,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  newButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newButtonText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '400',
    lineHeight: 28,
  },
});
