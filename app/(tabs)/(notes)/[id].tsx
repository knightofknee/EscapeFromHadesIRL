import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, Keyboard, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useNavigation, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  useReanimatedKeyboardAnimation,
  useKeyboardHandler,
} from 'react-native-keyboard-controller';
import Animated, {
  useAnimatedStyle,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
  scrollTo,
} from 'react-native-reanimated';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NoteEditor, type NoteEditorHandle } from '@/components/notes/note-editor';
import { ChecklistEditor, type ChecklistEditorHandle } from '@/components/notes/checklist-editor';
import { TagPicker } from '@/components/notes/tag-picker';
import { useNotes } from '@/hooks/use-notes';
import { useTags } from '@/hooks/use-tags';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ChecklistItem, InlineTag } from '@/types/note';
import {
  formatChecklistAsText,
  parseChecklistFromText,
} from '@/lib/checklist-format';

const DISMISS_BAR_HEIGHT = 40;
// Two-line clearance below the cursor, above the dismiss bar.
const BUFFER_ABOVE_BAR = 60;

export default function NoteEditorScreen() {
  const { id, new: isNewParam } = useLocalSearchParams<{ id: string; new?: string }>();
  const isNew = isNewParam === '1';
  const { notes, isLoading: notesLoading, updateNote, deleteNote } = useNotes();
  const { tags, createTag } = useTags();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const tabBarHeight = useBottomTabBarHeight();
  const { height: kbHeight, progress } = useReanimatedKeyboardAnimation();
  const { height: screenHeight } = useWindowDimensions();
  const [isFocused, setIsFocused] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  // Ref to NoteEditor for imperative formatting commands
  const noteEditorRef = useRef<NoteEditorHandle>(null);
  // Ref to ChecklistEditor (only valid when in checklist mode)
  const checklistEditorRef = useRef<ChecklistEditorHandle>(null);
  // Set when the user just hit the Checklist toggle (text → checklist).
  // Watched by an effect below to focus the first item once
  // ChecklistEditor has actually mounted (the Firestore round-trip means
  // the type transition is async, so we can't focus inline).
  const justToggledToChecklist = useRef(false);

  // Animated scroll ref — required for scrollTo worklet from Reanimated.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useSharedValue(0);
  const tapY = useSharedValue(0); // screen Y of the user's most recent tap
  const scrollAtStart = useSharedValue(0);
  const scrollDelta = useSharedValue(0);
  const targetKbHeight = useSharedValue(0);
  const keyboardIsOpen = useSharedValue(0); // 0 closed, 1 opening/open
  // Last reported pixel height of the editor's content TextInput.
  // Used by the cursor-follow logic to detect content growth (Enter
  // adds a line height; typing wraps at line ends).
  const lastContentHeight = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      scrollOffset.value = e.contentOffset.y;
    },
  });

  // Move content in sync with keyboard animation. Compute the required scroll
  // delta ONCE when the keyboard starts opening from a closed state, based on
  // where the user tapped. Each `onMove` frame scales that delta by keyboard
  // progress, so content animates frame-by-frame with the keyboard. Subsequent
  // `onStart` calls while keyboard is already open (e.g. predictive bar frame
  // changes) are ignored — otherwise a stale `tapY` would scroll to the wrong
  // spot.
  useKeyboardHandler(
    {
      onStart: (e) => {
        'worklet';
        if (e.height === 0) {
          keyboardIsOpen.value = 0;
          scrollDelta.value = 0;
          targetKbHeight.value = 0;
          return;
        }
        if (keyboardIsOpen.value === 1) {
          // Already open — don't re-scroll on frame changes.
          return;
        }
        keyboardIsOpen.value = 1;
        targetKbHeight.value = e.height;
        scrollAtStart.value = scrollOffset.value;
        const desiredCursorY = screenHeight - e.height - DISMISS_BAR_HEIGHT - BUFFER_ABOVE_BAR;
        scrollDelta.value = Math.max(0, tapY.value - desiredCursorY);
      },
      onMove: (e) => {
        'worklet';
        if (scrollDelta.value <= 0 || targetKbHeight.value <= 0) return;
        const p = Math.min(1, Math.max(0, e.height / targetKbHeight.value));
        scrollTo(scrollRef, 0, scrollAtStart.value + scrollDelta.value * p, false);
      },
    },
    [screenHeight],
  );

  // Capture tap Y synchronously on touch — fires before keyboard animation
  const handleTouchStart = useCallback((e: { nativeEvent: { pageY: number } }) => {
    tapY.value = e.nativeEvent.pageY;
  }, [tapY]);

  // Cursor-follow while typing. Fires on every contentSize change (Enter,
  // wrap, paste) and every selection change (cursor move). When the
  // content grows AND the cursor is at/near the end, scroll the page by
  // the growth delta — this is what keeps the cursor visible while you
  // type instead of letting it slide below the keyboard.
  //
  // CRITICAL: Reanimated's `scrollTo` worklet only works from the UI
  // thread. This callback runs on JS, so we call the ScrollView's
  // imperative `scrollTo` method via the ref instead. (Earlier version
  // called `scrollTo(ref, ...)` from JS — silently no-op'd.)
  //
  // We only follow when cursor is at the end because mid-content edits
  // also grow content but should NOT scroll the user away from where
  // they're editing.
  const handleContentMetrics = useCallback(
    (m: { contentHeight: number; cursorPos: number; cursorAtEnd: boolean }) => {
      // First measurement after mount — record the height, never scroll.
      // Otherwise the initial 0 → real-height delta would scroll a lot.
      if (lastContentHeight.value === 0 || m.contentHeight === 0) {
        lastContentHeight.value = m.contentHeight;
        return;
      }
      // Keyboard not up → just track height. Nothing to follow.
      if (keyboardIsOpen.value !== 1) {
        lastContentHeight.value = m.contentHeight;
        return;
      }
      const delta = m.contentHeight - lastContentHeight.value;
      lastContentHeight.value = m.contentHeight;
      if (delta > 0 && m.cursorAtEnd) {
        const next = scrollOffset.value + delta;
        // ScrollView's native imperative scrollTo — JS-callable. The
        // useAnimatedRef returns an object whose .current is the actual
        // ScrollView instance, so this hits the same RCT method as a
        // regular ref would.
        scrollRef.current?.scrollTo({ y: next, animated: false });
      }
    },
    [keyboardIsOpen, lastContentHeight, scrollOffset, scrollRef],
  );

  // Dismiss bar slides with keyboard via Reanimated
  const animatedBarStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: DISMISS_BAR_HEIGHT * (1 - progress.value) + tabBarHeight + kbHeight.value,
    }],
  }));

  const note = notes.find((n) => n.id === id);
  const noteRef = useRef(note);
  noteRef.current = note;

  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      const n = noteRef.current;
      if (!n) return;
      // Per spec: empty checklist notes should NOT auto-delete (the user
      // explicitly chose checklist mode; "Empty checklist" is a valid
      // state). Only text-mode (or untyped) notes get auto-killed when
      // both title and content are empty.
      if (n.type === 'checklist') return;
      if (!n.title.trim() && !n.content.trim()) {
        deleteNote(n.id);
      }
    });
    return unsubscribe;
  }, [navigation, deleteNote]);

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

  const handleUpdateDescription = useCallback(
    (description: string) => {
      if (id) updateNote(id, { description });
    },
    [id, updateNote],
  );

  const handleUpdateChecklist = useCallback(
    (checklist: ChecklistItem[]) => {
      if (id) updateNote(id, { checklist });
    },
    [id, updateNote],
  );

  // Toggle between text and checklist modes. Round-trip is data-preserving:
  //   text → checklist: parse the bottom of `content` for markdown checkbox
  //                     lines as items; everything above becomes description.
  //   checklist → text: dump description + items as markdown content. The
  //                     dump format is round-trip parseable so a clean cycle
  //                     restores everything exactly.
  const handleToggleType = useCallback(() => {
    if (!id || !note) return;
    // Dismiss keyboard before swapping editors. Without this, the
    // currently-focused input (NoteEditor's content or a checklist row)
    // briefly fights with the new editor's focus call, producing a
    // keyboard flicker as focus is yanked across the unmount.
    Keyboard.dismiss();
    const isChecklist = note.type === 'checklist';
    if (isChecklist) {
      // Going checklist → text. Pull the freshest description + items
      // from the editor's local state — the `note` prop can lag by up
      // to the save-debounce window, and reading the prop here would
      // silently lose any in-flight typing. Falls back to prop values
      // if the editor handle isn't available yet.
      const latest = checklistEditorRef.current?.getLatestState();
      const desc = latest?.description ?? note.description ?? '';
      const items = latest?.items ?? note.checklist ?? [];
      const dumped = formatChecklistAsText(desc, items);
      updateNote(id, {
        type: 'text',
        content: dumped,
        description: '',
        checklist: [],
      });
    } else {
      // Going text → checklist. Pull the freshest content from the
      // editor's local state — `note.content` (the prop) can lag by up
      // to the save-debounce window, so reading it would silently lose
      // any in-flight typing. Falls back to the prop value if the
      // editor handle isn't available yet.
      const latestContent = noteEditorRef.current?.getLatestContent() ?? note.content ?? '';
      const { description, items } = parseChecklistFromText(latestContent);
      updateNote(id, {
        type: 'checklist',
        description,
        checklist: items,
        // Leave content as-is for safety. Active rendering branches on
        // type, so the stale content is harmless until re-toggled.
      });
      // The type prop won't actually flip until the Firestore snapshot
      // returns and re-renders. The effect below watches for that
      // transition and focuses the first item once ChecklistEditor has
      // mounted — a fixed-delay setTimeout was unreliable here.
      justToggledToChecklist.current = true;
    }
  }, [id, note, updateNote]);

  // Focus first item once ChecklistEditor has actually mounted following
  // a text→checklist toggle. requestAnimationFrame defers one render
  // tick so the new editor's refs are wired up.
  useEffect(() => {
    if (note?.type === 'checklist' && justToggledToChecklist.current) {
      justToggledToChecklist.current = false;
      requestAnimationFrame(() => {
        checklistEditorRef.current?.focusFirstItem();
      });
    }
  }, [note?.type]);

  const handleCreateTag = useCallback(
    async (name: string) => {
      if (!id) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const normalized = trimmed.toLowerCase();

      // Attach an existing tag (case-insensitive match) rather than creating a duplicate.
      const existing = tags.find((t) => t.name.trim().toLowerCase() === normalized);
      const tagId = existing ? existing.id : (await createTag(trimmed))?.id;
      if (!tagId) return;

      const currentTags = noteRef.current?.tags ?? [];
      if (currentTags.some((t) => t.tagId === tagId)) return;
      await updateNote(id, {
        tags: [...currentTags, { tagId, startIndex: 0, endIndex: 0 }],
      });
    },
    [createTag, id, tags, updateNote],
  );

  const handleToggleTag = useCallback(
    (tagId: string) => {
      if (!id) return;
      const currentTags = noteRef.current?.tags ?? [];
      const isAttached = currentTags.some((t) => t.tagId === tagId);
      const nextTags = isAttached
        ? currentTags.filter((t) => t.tagId !== tagId)
        : [...currentTags, { tagId, startIndex: 0, endIndex: 0 }];
      updateNote(id, { tags: nextTags });
    },
    [id, updateNote],
  );

  const noteTagIds = note ? [...new Set(note.tags.map((t) => t.tagId))] : [];

  if (!note) {
    // Still loading notes — show spinner. Only show "not found" once loading is done.
    return (
      <ThemedView style={styles.centered}>
        {notesLoading ? (
          <ActivityIndicator size="large" color={colors.tint} />
        ) : (
          <ThemedText>Note not found</ThemedText>
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerButton} hitSlop={8}>
            <IconSymbol name="chevron.left" size={22} color={'#3B82F6'} />
            <ThemedText style={[styles.headerButtonText, { color: '#3B82F6' }]}>Notes</ThemedText>
          </Pressable>
          {/* Centered toggle: text ↔ checklist. Always visible — round-trip
              is data-preserving via the markdown dump format. */}
          <Pressable
            onPress={handleToggleType}
            style={styles.headerCenterButton}
            hitSlop={8}
            accessibilityLabel={
              note.type === 'checklist'
                ? 'Convert checklist back to text'
                : 'Convert note to checklist'
            }
            accessibilityRole="button"
          >
            <ThemedText style={[styles.headerButtonText, { color: colors.tint }]}>
              {note.type === 'checklist' ? 'Undo Checklist' : 'Checklist'}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => { setIsFocused(false); Keyboard.dismiss(); }}
            disabled={!isFocused}
            style={styles.headerButton}
            hitSlop={8}
          >
            <ThemedText style={[styles.headerButtonText, { color: isFocused ? colors.tint : colors.icon }]}>Done</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        // Stop iOS from auto-scrolling to "keep cursor visible" in the
        // multiline TextInput child — that behavior yanks the view to the
        // bottom of the note the first time the user drags near the text.
        automaticallyAdjustContentInsets={false}
        automaticallyAdjustKeyboardInsets={false}
        contentInsetAdjustmentBehavior="never"
      >
        {note.type === 'checklist' ? (
          <ChecklistEditor
            ref={checklistEditorRef}
            note={note}
            tags={tags}
            onUpdateTitle={handleUpdateTitle}
            onUpdateDescription={handleUpdateDescription}
            onUpdateChecklist={handleUpdateChecklist}
            onUpdateTags={handleUpdateTags}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onOpenTagPicker={() => setTagPickerOpen(true)}
            onTouchStart={handleTouchStart}
          />
        ) : (
          <NoteEditor
            ref={noteEditorRef}
            note={note}
            tags={tags}
            isNew={isNew}
            onUpdateTitle={handleUpdateTitle}
            onUpdateContent={handleUpdateContent}
            onUpdateTags={handleUpdateTags}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onOpenTagPicker={() => setTagPickerOpen(true)}
            onTouchStart={handleTouchStart}
            onContentMetricsChange={handleContentMetrics}
          />
        )}
      </Animated.ScrollView>

      <Animated.View
        pointerEvents={tagPickerOpen ? 'none' : 'auto'}
        style={[
          styles.dismissBar,
          { backgroundColor: colors.background, borderTopColor: colors.tileBorder },
          tagPickerOpen && { opacity: 0 },
          animatedBarStyle,
        ]}
      >
        {/* Markdown formatting toolbar applies only to text-mode notes.
            In checklist mode the items are short single-line inputs and
            formatting tools would conflict with the checklist semantics. */}
        {note.type !== 'checklist' && (
          <>
            <Pressable
              onPress={() => noteEditorRef.current?.applyStrikethrough()}
              style={styles.toolbarButton}
              hitSlop={8}
            >
              <IconSymbol name="strikethrough" size={20} color={colors.icon} />
            </Pressable>
            <Pressable
              onPress={() => noteEditorRef.current?.applyBullets()}
              style={styles.toolbarButton}
              hitSlop={8}
            >
              <IconSymbol name="list.bullet" size={20} color={colors.icon} />
            </Pressable>
            <Pressable
              onPress={() => noteEditorRef.current?.applyNumberedList()}
              style={styles.toolbarButton}
              hitSlop={8}
            >
              <IconSymbol name="list.number" size={20} color={colors.icon} />
            </Pressable>
          </>
        )}
        <View style={styles.dismissSpacer} />
        <Pressable onPress={Keyboard.dismiss} style={styles.dismissButton} hitSlop={8}>
          <IconSymbol name="keyboard.chevron.compact.down" size={22} color={colors.icon} />
        </Pressable>
      </Animated.View>

      <TagPicker
        visible={tagPickerOpen}
        tags={tags}
        selectedTagIds={noteTagIds}
        onToggleTag={handleToggleTag}
        onCreateTag={handleCreateTag}
        onClose={() => setTagPickerOpen(false)}
      />
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
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  headerCenterButton: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 8,
    pointerEvents: 'box-none',
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    // Room to scroll the focused line up out of the keyboard's way.
    // NOTE: deliberately no flexGrow here — adding it stretches the multiline
    // TextInput (flex:1 inside) to fill the visible area, which triggers iOS's
    // native "keep TextInput cursor visible" scroll-correction on short scrolls
    // and jumps the view to the bottom of the content.
    paddingBottom: 600,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  toolbarButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
