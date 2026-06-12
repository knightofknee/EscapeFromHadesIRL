import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View, Pressable, Keyboard, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useNavigation, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
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
import { useNotes, useNote } from '@/hooks/use-notes';
import { useTags } from '@/hooks/use-tags';
import { useOfflineGuard } from '@/contexts/offline-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { InlineTag } from '@/types/note';
import {
  formatChecklistAsText,
  parseChecklistFromText,
} from '@/lib/checklist-format';
import { useAuth } from '@/contexts/auth-context';
import { useChecklistItems } from '@/hooks/use-checklist-items';
import { toItemDoc, summaryOf, makeItemId } from '@/lib/firebase/checklist-items';

const DISMISS_BAR_HEIGHT = 40;
// Two-line clearance below the cursor, above the dismiss bar.
const BUFFER_ABOVE_BAR = 60;

export default function NoteEditorScreen() {
  const { id, new: isNewParam } = useLocalSearchParams<{ id: string; new?: string }>();
  const isNew = isNewParam === '1';
  // Mutations come from useNotes(); the displayed note is resolved by id via
  // useNote() so it opens correctly even when it's outside the paginated list
  // window. (useNotes' own window still backs updateNote's no-op/creative-
  // writing context for recently-edited notes.)
  const { updateNote, deleteNote } = useNotes();
  const { tags, createTag } = useTags();
  const { isOffline } = useOfflineGuard();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const tabBarHeight = useBottomTabBarHeight();
  const { height: kbHeight, progress } = useReanimatedKeyboardAnimation();
  const { height: screenHeight } = useWindowDimensions();
  const [isFocused, setIsFocused] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  // Undo/redo availability, reported by NoteEditor only when it flips —
  // so typing doesn't re-render this screen on every keystroke.
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const handleHistoryChange = useCallback((canUndo: boolean, canRedo: boolean) => {
    setHistoryState((prev) =>
      prev.canUndo === canUndo && prev.canRedo === canRedo ? prev : { canUndo, canRedo },
    );
  }, []);

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

  // Keep the caret visible while typing. Every editable input (the note
  // body, the checklist description, each checklist row) reports the
  // window-Y of its caret's bottom edge whenever its selection or content
  // size changes. If that point would sit behind the keyboard + dismiss
  // bar + buffer, we scroll the page just enough to lift it back into the
  // clear zone — a true scroll-into-view, not an incremental delta nudge.
  //
  // Why measure in window coordinates instead of tracking content-height
  // deltas: the delta approach only ever moved the caret one line per
  // event, so a caret that was already several lines under the keyboard
  // would inch up forever without clearing it (the reported bug). The
  // measured window-Y tells us exactly how far the caret actually is from
  // the keyboard top, so one scroll fully reveals it.
  //
  // CRITICAL: Reanimated's `scrollTo` worklet only runs on the UI thread.
  // This callback runs on JS, so we use the ScrollView's imperative
  // `scrollTo` via the ref. animated:false is deliberate — an instant
  // reposition reads as "the line stays put under my finger"; an animated
  // catch-up would visibly lag the caret on every keystroke.
  //
  // Gate on the canonical Reanimated `progress` (never the custom
  // keyboardIsOpen flag, which goes stale — see memory). We only act once
  // the keyboard is FULLY open (progress === 1): while it's still
  // animating open, the useKeyboardHandler worklet owns the scroll offset
  // and fighting it from JS causes jitter. progress < 1 also covers the
  // closed (0) and closing cases.
  const ensureCaretVisible = useCallback(
    (caretBottomWindowY: number) => {
      if (progress.value < 1) return;
      const keyboardPx = Math.abs(kbHeight.value); // height is signed; magnitude only
      const desiredCaretY =
        screenHeight - keyboardPx - DISMISS_BAR_HEIGHT - BUFFER_ABOVE_BAR;
      const overflow = caretBottomWindowY - desiredCaretY;
      if (overflow > 0) {
        scrollRef.current?.scrollTo({
          y: scrollOffset.value + overflow,
          animated: false,
        });
      }
    },
    [progress, kbHeight, screenHeight, scrollOffset, scrollRef],
  );

  // Dismiss bar slides with keyboard via Reanimated
  const animatedBarStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: DISMISS_BAR_HEIGHT * (1 - progress.value) + tabBarHeight + kbHeight.value,
    }],
  }));

  const { note, isLoading: noteLoading } = useNote(id);
  const noteRef = useRef(note);
  noteRef.current = note;

  const { user } = useAuth();
  // Checklist items now live in the `notes/{id}/items` subcollection. This
  // hook owns the live listener, per-item writes, optimistic state, and the
  // one-time legacy-array migration. It's a no-op for text notes (enabled
  // gates the subscription/migration).
  const checklist = useChecklistItems({
    noteId: id ?? '',
    userId: user?.uid,
    enabled: note?.type === 'checklist',
    legacyChecklist: note?.checklist,
    itemsMigrated: note?.itemsMigrated,
    initialSummary: note?.checklistSummary,
  });

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
      // Judge emptiness by the EDITOR's local state, not the saved doc —
      // keystrokes inside the 500ms save debounce aren't in Firestore yet,
      // and deleting based on the stale doc would discard them.
      const latestTitle = noteEditorRef.current?.getLatestTitle() ?? n.title;
      const latestContent = noteEditorRef.current?.getLatestContent() ?? n.content;
      if (!latestTitle.trim() && !latestContent.trim()) {
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
      // Going checklist → text. Description comes from the editor's local
      // state (the `note` prop can lag by the save-debounce window); items
      // come straight from the subcollection hook, which already reflects
      // any not-yet-flushed typing via its optimistic overlay. Read items
      // BEFORE clearing the subcollection.
      const desc = checklistEditorRef.current?.getLatestState()?.description ?? note.description ?? '';
      const items = checklist.getItems();
      const dumped = formatChecklistAsText(desc, items);
      // Flip first (optimistic — unmounts the checklist editor), then drop
      // the item docs in the background. The dumped content is the backstop
      // if the delete is interrupted.
      updateNote(id, {
        type: 'text',
        content: dumped,
        description: '',
      });
      checklist.clearItems().catch((e) =>
        console.error('handleToggleType: clearItems failed', e),
      );
    } else {
      // Going text → checklist. Pull the freshest content from the
      // editor's local state — `note.content` (the prop) can lag by up
      // to the save-debounce window, so reading it would silently lose
      // any in-flight typing. Falls back to the prop value if the
      // editor handle isn't available yet.
      const latestContent = noteEditorRef.current?.getLatestContent() ?? note.content ?? '';
      const { description, items: parsed } = parseChecklistFromText(latestContent, makeItemId);
      const now = Date.now();
      const itemDocs = parsed.map((it, idx) => toItemDoc(it, idx, user?.uid ?? '', now));
      const summary = summaryOf(itemDocs);
      // Seed the subcollection (the hook also shows them optimistically so
      // the editor isn't briefly empty), then flip the note doc.
      checklist.seedItems(itemDocs, summary);
      updateNote(id, {
        type: 'checklist',
        description,
        checklistSummary: summary,
        itemsMigrated: true,
        // Leave content as-is for safety. Active rendering branches on
        // type, so the stale content is harmless until re-toggled.
      });
      // The type prop won't actually flip until the Firestore snapshot
      // returns and re-renders. The effect below watches for that
      // transition and focuses the first item once ChecklistEditor has
      // mounted — a fixed-delay setTimeout was unreliable here.
      justToggledToChecklist.current = true;
    }
  }, [id, note, updateNote, checklist, user?.uid]);

  // Going text → checklist is one tap (non-destructive). The reverse
  // ("Undo Checklist") discards every checkbox's completed state, so gate
  // that direction behind a confirm — it's a top-center button that's
  // easy to hit by accident, and the loss isn't recoverable.
  const confirmToggleType = useCallback(() => {
    if (note?.type !== 'checklist') {
      handleToggleType();
      return;
    }
    Alert.alert(
      'Convert to text?',
      "This removes the checklist's completed states. The text is preserved.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Convert', style: 'destructive', onPress: handleToggleType },
      ],
    );
  }, [note?.type, handleToggleType]);

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
        {noteLoading ? (
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
          <Pressable
            onPress={() => router.replace('/(tabs)/(notes)')}
            style={styles.headerButton}
            hitSlop={8}
          >
            <IconSymbol name="chevron.left" size={22} color={'#3B82F6'} />
            <ThemedText style={[styles.headerButtonText, { color: '#3B82F6' }]}>Notes</ThemedText>
          </Pressable>
          {/* Centered toggle: text ↔ checklist. Always visible — round-trip
              is data-preserving via the markdown dump format. */}
          <Pressable
            onPress={confirmToggleType}
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
              {note.type === 'checklist' ? 'Undo Checklist' : 'Create Checklist'}
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

      {isOffline && (
        <View style={styles.offlineBanner}>
          <ThemedText style={styles.offlineBannerText}>
            Offline — force-quitting the app may lose unsaved changes.
          </ThemedText>
        </View>
      )}

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
            items={checklist.items}
            onUpdateTitle={handleUpdateTitle}
            onUpdateDescription={handleUpdateDescription}
            onUpdateTags={handleUpdateTags}
            onAddItem={checklist.addItem}
            onToggleItem={checklist.toggleItem}
            onSetItemText={checklist.setItemText}
            onDeleteItem={checklist.deleteItem}
            onRestoreItem={checklist.restoreItem}
            onReorderUncompleted={checklist.reorderUncompleted}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onOpenTagPicker={() => setTagPickerOpen(true)}
            onTouchStart={handleTouchStart}
            onCaretBottom={ensureCaretVisible}
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
            onCaretBottom={ensureCaretVisible}
            onHistoryChange={handleHistoryChange}
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
            {/* Undo/redo lead the toolbar — losing content is the editor's
                cardinal sin, so recovery sits closest to the thumb. */}
            <Pressable
              onPress={() => noteEditorRef.current?.undo()}
              disabled={!historyState.canUndo}
              style={[styles.toolbarButton, !historyState.canUndo && styles.toolbarButtonDisabled]}
              hitSlop={8}
              accessibilityLabel="Undo"
            >
              <IconSymbol name="arrow.uturn.backward" size={20} color={colors.icon} />
            </Pressable>
            <Pressable
              onPress={() => noteEditorRef.current?.redo()}
              disabled={!historyState.canRedo}
              style={[styles.toolbarButton, !historyState.canRedo && styles.toolbarButtonDisabled]}
              hitSlop={8}
              accessibilityLabel="Redo"
            >
              <IconSymbol name="arrow.uturn.forward" size={20} color={colors.icon} />
            </Pressable>
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
  toolbarButtonDisabled: {
    opacity: 0.3,
  },
  offlineBanner: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F59E0B',
  },
  offlineBannerText: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '600',
    textAlign: 'center',
  },
});
