import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View, Pressable, Keyboard, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
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
import { NoteEditor, type NoteEditorHandle, type FormatState } from '@/components/notes/note-editor';
import { ChecklistEditor, type ChecklistEditorHandle } from '@/components/notes/checklist-editor';
import { TagPicker } from '@/components/notes/tag-picker';
import {
  SuggestionBar,
  SUGGESTION_BAR_HEIGHT,
  type SuggestionBarHandle,
  type MediaChip,
} from '@/components/notes/suggestion-bar';
import {
  loadVocab,
  seedVocabFromNotes,
  flushVocab,
  type Suggestion,
} from '@/lib/word-suggestions';
import { useNotes, useNote } from '@/hooks/use-notes';
import { useTags } from '@/hooks/use-tags';
import { recordNoteView } from '@/lib/last-view';
import { useOfflineGuard } from '@/contexts/offline-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { InlineTag } from '@/types/note';
import {
  formatChecklistAsText,
  parseChecklistFromText,
} from '@/lib/checklist-format';
import { IMAGE_CHAR, appendBlocks, imageParagraphs, isHtmlEmpty, plainToHtml } from '@/lib/note-html';
import { notePlainText } from '@/lib/note-content';
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
  // writing context for recently-edited notes, and seeds the typing
  // vocabulary below.)
  const { updateNote, deleteNote, togglePinNote, notes } = useNotes();
  const { tags, createTag } = useTags();
  const { isOffline } = useOfflineGuard();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const tabBarHeight = useBottomTabBarHeight();
  const { height: kbHeight, progress } = useReanimatedKeyboardAnimation();
  const { height: screenHeight } = useWindowDimensions();
  const [isFocused, setIsFocused] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Snapshot of the editor's selection at the instant "Create Checklist" is
  // pressed (onPressIn) — see NoteEditorHandle.getSelection. A highlight here
  // scopes which lines become items; captured on press-in because completing
  // the tap can blur the input and collapse the selection first.
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  // Undo/redo availability, reported by NoteEditor only when it flips —
  // so typing doesn't re-render this screen on every keystroke.
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const handleHistoryChange = useCallback((canUndo: boolean, canRedo: boolean) => {
    setHistoryState((prev) =>
      prev.canUndo === canUndo && prev.canRedo === canRedo ? prev : { canUndo, canRedo },
    );
  }, []);
  // Toolbar toggle tints, reported by NoteEditor only when one flips.
  const [formatState, setFormatState] = useState<FormatState>({
    bold: false,
    italic: false,
    strike: false,
    heading: false,
    bullets: false,
    numbers: false,
  });
  // Photo/video import in progress (the photo button shows a spinner).
  const [importingMedia, setImportingMedia] = useState(false);

  const { note, isLoading: noteLoading } = useNote(id);
  const noteRef = useRef(note);
  noteRef.current = note;

  // Remember "the user was in this note" for the reopen-where-you-were restore.
  useEffect(() => {
    if (id) recordNoteView(id);
  }, [id]);

  const { user } = useAuth();

  // The suggestion strip auto-hides when empty, so the accessory stack's
  // real height varies. Caret-clearance math budgets the WORST CASE (strip
  // showing) — over-reserving a strip's height when it's hidden is harmless,
  // while under-reserving would put the caret behind the bar.
  const isTextNote = note?.type !== 'checklist';
  const accessoryHeight = DISMISS_BAR_HEIGHT + (isTextNote ? SUGGESTION_BAR_HEIGHT : 0);

  // Personal typing vocabulary: load per user, seed once from the already-
  // loaded notes (no-op after the first run — the flag persists with the
  // vocab), and flush any pending learning when leaving the editor.
  useEffect(() => {
    if (user) void loadVocab(user.uid);
  }, [user]);
  useEffect(() => {
    if (user && notes.length > 0) void seedVocabFromNotes(user.uid, notes);
  }, [user, notes]);
  useEffect(() => () => {
    void flushVocab();
  }, []);

  // Ref to NoteEditor for imperative formatting commands
  const noteEditorRef = useRef<NoteEditorHandle>(null);
  // Suggestions flow NoteEditor → strip through this handle so typing only
  // ever re-renders the strip, never this screen.
  const suggestionBarRef = useRef<SuggestionBarHandle>(null);
  // Ref to ChecklistEditor (only valid when in checklist mode)
  const checklistEditorRef = useRef<ChecklistEditorHandle>(null);
  // Set when the user just hit the Checklist toggle (text → checklist).
  // Watched by an effect below to focus the first item once
  // ChecklistEditor has actually mounted (the Firestore round-trip means
  // the type transition is async, so we can't focus inline).
  const justToggledToChecklist = useRef(false);
  // Re-entrancy guard for the text↔checklist toggle. The conversion isn't
  // reflected until `note.type` flips (an async Firestore round-trip), so
  // without this a second tap before the flip would run the seed again with
  // fresh item ids and DUPLICATE the list. Cleared once the type settles
  // (the effect below). Stays set if a conversion somehow never lands —
  // which safely blocks the dupe spam rather than piling rows up.
  const convertingType = useRef(false);

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
        const desiredCursorY = screenHeight - e.height - accessoryHeight - BUFFER_ABOVE_BAR;
        scrollDelta.value = Math.max(0, tapY.value - desiredCursorY);
      },
      onMove: (e) => {
        'worklet';
        if (scrollDelta.value <= 0 || targetKbHeight.value <= 0) return;
        const p = Math.min(1, Math.max(0, e.height / targetKbHeight.value));
        scrollTo(scrollRef, 0, scrollAtStart.value + scrollDelta.value * p, false);
      },
    },
    [screenHeight, accessoryHeight],
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
        screenHeight - keyboardPx - accessoryHeight - BUFFER_ABOVE_BAR;
      const overflow = caretBottomWindowY - desiredCaretY;
      if (overflow > 0) {
        scrollRef.current?.scrollTo({
          y: scrollOffset.value + overflow,
          animated: false,
        });
      }
    },
    [progress, kbHeight, screenHeight, accessoryHeight, scrollOffset, scrollRef],
  );

  // Accessory stack (suggestion strip + dismiss bar) slides with keyboard
  // via Reanimated. Uses the full stack height so it's fully off-screen
  // when the keyboard is closed.
  const animatedBarStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: accessoryHeight * (1 - progress.value) + tabBarHeight + kbHeight.value,
    }],
  }));

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
      const latestContent = noteEditorRef.current?.getLatestContent();
      // A body holding only a photo is not empty.
      const bodyEmpty =
        latestContent != null
          ? isHtmlEmpty(latestContent)
          : !notePlainText(n).trim() && !(n.format === 'html' && n.content.includes('<img'));
      if (!latestTitle.trim() && bodyEmpty) {
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

  // The editor always hands back rich HTML. The first rich save of a
  // pre-rich-text note also keeps its original string as contentLegacy.
  const handleUpdateContent = useCallback(
    (content: string) => {
      if (!id) return;
      const n = noteRef.current;
      const legacy = n && n.format !== 'html' && n.content && n.contentLegacy === undefined ? n.content : undefined;
      updateNote(id, { content, format: 'html', ...(legacy !== undefined ? { contentLegacy: legacy } : {}) });
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
  //   text → checklist: selection-aware (see parseChecklistFromText) — a
  //                     highlight converts just those lines to items and
  //                     keeps the rest as description; with no highlight,
  //                     only existing `- [ ]` lines convert (revert path).
  //   checklist → text: dump description + items as markdown content. The
  //                     dump format is round-trip parseable so a clean cycle
  //                     restores everything exactly.
  const handleToggleType = useCallback(() => {
    if (!id || !note) return;
    // Ignore taps until the in-flight conversion's type flip lands — see
    // convertingType above. Prevents double-seed duplicates.
    if (convertingType.current) return;
    convertingType.current = true;
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
      // Photos the note held before it became a checklist are still in its
      // (untouched) content — carry them back at the end of the text.
      const photos = note.format === 'html' ? imageParagraphs(note.content) : '';
      // Flip first (optimistic — unmounts the checklist editor), then drop
      // the item docs in the background. The dumped content is the backstop
      // if the delete is interrupted.
      updateNote(id, {
        type: 'text',
        content: appendBlocks(plainToHtml(dumped), photos),
        format: 'html',
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
      // getLatestText is the editor's offset model (each photo one
      // IMAGE_CHAR), the same space the captured selection indexes.
      const latestText = noteEditorRef.current?.getLatestText() ?? notePlainText(note);
      // A highlight (captured on press-in) scopes which lines become items;
      // with none, only existing `- [ ]` lines convert (the revert path).
      const selection = pendingSelection.current ?? undefined;
      pendingSelection.current = null;
      const parsedRaw = parseChecklistFromText(latestText, makeItemId, selection);
      // Photos stay in the note's content (left as-is below) and come back
      // on Undo Checklist; strip their placeholders from the text parts.
      const stripPhotos = (t: string) => t.split(IMAGE_CHAR).join('');
      const description = parsedRaw.description
        .split('\n')
        .filter((l) => l.trim() !== IMAGE_CHAR)
        .map(stripPhotos)
        .join('\n');
      const parsed = parsedRaw.items
        .map((it) => ({ ...it, text: stripPhotos(it.text) }))
        .filter((it) => it.text.trim().length > 0);
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

  // Both directions are one tap and fully reversible: "Undo Checklist" dumps
  // items as `- [ ]` / `- [x]` text (checked state preserved in the box), and
  // re-converting reads that back — so nothing is lost and no confirm alert
  // is needed.

  // Toggle 1. 2. 3. numbering on checklist rows. Presentation-only pref on
  // the note doc; touch:false so flipping it doesn't bump the note to the
  // top of the recency-sorted list.
  const handleToggleNumbered = useCallback(() => {
    if (!id || !noteRef.current) return;
    updateNote(
      id,
      { checklistNumbered: !noteRef.current.checklistNumbered },
      { touch: false },
    );
  }, [id, updateNote]);

  // Focus first item once ChecklistEditor has actually mounted following
  // a text→checklist toggle. requestAnimationFrame defers one render
  // tick so the new editor's refs are wired up.
  useEffect(() => {
    // The type has settled (initial mount, or a conversion landed) — release
    // the re-entrancy guard so the next toggle is allowed.
    convertingType.current = false;
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

  const handleTogglePin = useCallback(() => {
    const n = noteRef.current;
    if (n) togglePinNote(n.id, !n.pinned);
  }, [togglePinNote]);

  const handleSuggestions = useCallback((suggestions: Suggestion[]) => {
    suggestionBarRef.current?.setSuggestions(suggestions);
  }, []);

  const handleMediaChip = useCallback((chip: MediaChip | null) => {
    suggestionBarRef.current?.setMediaChip(chip);
  }, []);

  const handleOpenMedia = useCallback((chip: MediaChip) => {
    noteEditorRef.current?.blur();
    router.push({ pathname: '/media-viewer', params: { name: chip.name } });
  }, []);

  // The rich input ignores Keyboard.dismiss(); blur it explicitly too.
  const dismissKeyboard = useCallback(() => {
    noteEditorRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const handlePickSuggestion = useCallback(
    (suggestion: Suggestion) => {
      // A tag chip both completes the text and formally attaches the tag to
      // the note, so it shows in the tags bar. Attach is idempotent.
      if (suggestion.kind === 'tag' && id) {
        const currentTags = noteRef.current?.tags ?? [];
        if (!currentTags.some((t) => t.tagId === suggestion.tagId)) {
          updateNote(id, {
            tags: [...currentTags, { tagId: suggestion.tagId, startIndex: 0, endIndex: 0 }],
          });
        }
      }
      noteEditorRef.current?.applySuggestion(suggestion);
    },
    [id, updateNote],
  );

  // ••• menu in the header center: Create Checklist (text mode) + Delete.
  // Custom modal, NOT Alert.alert — native alerts follow the SYSTEM
  // appearance, so with the app in dark mode on a light-mode phone they
  // rendered as a glaring light card. This one uses the app theme.
  const [noteMenuOpen, setNoteMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const openNoteMenu = useCallback(() => {
    setConfirmingDelete(false);
    setNoteMenuOpen(true);
  }, []);

  const closeNoteMenu = useCallback(() => {
    setNoteMenuOpen(false);
    setConfirmingDelete(false);
  }, []);

  // Delete is the one action in here that can't be taken back, so it takes
  // two taps: Delete Note, then the confirm step inside the same card.
  const handleDeleteNote = useCallback(() => {
    setNoteMenuOpen(false);
    setConfirmingDelete(false);
    if (!id) return;
    deleteNote(id);
    router.dismissTo('/(tabs)/(notes)');
  }, [id, deleteNote]);

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
            // dismissTo, not back(): pops within THIS stack to the list (real
            // right-slide pop animation) and degrades to replace when the list
            // isn't in the stack (deep link / cold start), so it can never
            // land on a surprising sibling tab the way history-walking does.
            onPress={() => router.dismissTo('/(tabs)/(notes)')}
            style={styles.headerButton}
            hitSlop={8}
          >
            <IconSymbol name="chevron.left" size={22} color={'#3B82F6'} />
            <ThemedText style={[styles.headerButtonText, { color: '#3B82F6' }]}>Notes</ThemedText>
          </Pressable>
          {/* Centered cluster: undo | ••• menu | redo. The ••• menu holds
              Create Checklist (text mode) + Delete Note; the reverse
              checklist action ("Undo Checklist") lives at the bottom of the
              page, far below Add item, so it can't be hit by accident.
              Undo/redo mirror the keyboard toolbar's buttons so recovery is
              reachable with the keyboard down too (text mode only — the
              checklist editor has no history). */}
          <View style={styles.headerCenter} pointerEvents="box-none">
            {note.type !== 'checklist' && (
              <Pressable
                onPress={() => noteEditorRef.current?.undo()}
                disabled={!historyState.canUndo}
                style={[styles.headerIconButton, !historyState.canUndo && styles.headerIconDisabled]}
                hitSlop={8}
                accessibilityLabel="Undo"
                accessibilityRole="button"
              >
                <IconSymbol name="arrow.uturn.backward" size={20} color={colors.icon} />
              </Pressable>
            )}
            <Pressable
              onPress={openNoteMenu}
              // Snapshot the editor's highlight the instant the press starts —
              // opening the menu blurs the input and collapses it. Read in
              // handleToggleType to scope which lines convert to items.
              onPressIn={() => {
                pendingSelection.current = noteEditorRef.current?.getSelection() ?? null;
              }}
              style={styles.headerIconButton}
              hitSlop={8}
              accessibilityLabel="Note options"
              accessibilityRole="button"
            >
              <IconSymbol name="ellipsis" size={22} color={colors.tint} />
            </Pressable>
            {note.type !== 'checklist' && (
              <Pressable
                onPress={() => noteEditorRef.current?.redo()}
                disabled={!historyState.canRedo}
                style={[styles.headerIconButton, !historyState.canRedo && styles.headerIconDisabled]}
                hitSlop={8}
                accessibilityLabel="Redo"
                accessibilityRole="button"
              >
                <IconSymbol name="arrow.uturn.forward" size={20} color={colors.icon} />
              </Pressable>
            )}
          </View>
          <View style={styles.headerRight}>
            {/* Bookmark toggle — same ribbon as the list rows. */}
            <Pressable
              onPress={handleTogglePin}
              style={styles.headerIconButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={note.pinned ? 'Remove bookmark' : 'Bookmark note'}
            >
              <IconSymbol
                name={note.pinned ? 'bookmark.fill' : 'bookmark'}
                size={20}
                color={note.pinned ? colors.tint : colors.icon}
              />
            </Pressable>
            {/* Help for the highlight-to-pick-items flow. Only shown in text
                mode, where "Create Checklist" is the relevant action. */}
            {note.type !== 'checklist' && (
              <Pressable
                onPress={() => setHelpOpen(true)}
                style={styles.headerIconButton}
                hitSlop={8}
                accessibilityLabel="How Create Checklist works"
                accessibilityRole="button"
              >
                <IconSymbol name="questionmark.circle" size={20} color={colors.icon} />
              </Pressable>
            )}
            <Pressable
              onPress={() => { setIsFocused(false); dismissKeyboard(); }}
              disabled={!isFocused}
              style={styles.headerButton}
              hitSlop={8}
            >
              <ThemedText style={[styles.headerButtonText, { color: isFocused ? colors.tint : colors.icon }]}>Done</ThemedText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* Note options — themed card so it matches the app, unlike a native
          alert. Delete flips the card into a confirm step. */}
      <Modal
        visible={noteMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={closeNoteMenu}
      >
        <Pressable style={styles.helpBackdrop} onPress={closeNoteMenu}>
          {/* Inner press swallows taps so tapping the card doesn't dismiss. */}
          <Pressable
            style={[styles.menuCard, { backgroundColor: colors.background, borderColor: colors.tileBorder }]}
            onPress={() => {}}
          >
            {confirmingDelete ? (
              <>
                <ThemedText style={styles.menuTitle}>Delete this note?</ThemedText>
                <ThemedText style={styles.menuSubtitle}>This cannot be undone.</ThemedText>
                <Pressable style={styles.menuRow} onPress={handleDeleteNote} accessibilityRole="button">
                  <ThemedText style={[styles.menuRowText, styles.menuDestructive]}>Delete Note</ThemedText>
                </Pressable>
                <Pressable style={[styles.menuRow, styles.menuRowLast]} onPress={closeNoteMenu} accessibilityRole="button">
                  <ThemedText style={styles.menuRowText}>Cancel</ThemedText>
                </Pressable>
              </>
            ) : (
              <>
                <ThemedText style={styles.menuTitle}>Note Options</ThemedText>
                {note.type !== 'checklist' && (
                  <Pressable
                    style={styles.menuRow}
                    onPress={() => {
                      setNoteMenuOpen(false);
                      handleToggleType();
                    }}
                    accessibilityRole="button"
                  >
                    <ThemedText style={[styles.menuRowText, { color: colors.tint }]}>Create Checklist</ThemedText>
                  </Pressable>
                )}
                <Pressable style={styles.menuRow} onPress={() => setConfirmingDelete(true)} accessibilityRole="button">
                  <ThemedText style={[styles.menuRowText, styles.menuDestructive]}>Delete Note</ThemedText>
                </Pressable>
                <Pressable style={[styles.menuRow, styles.menuRowLast]} onPress={closeNoteMenu} accessibilityRole="button">
                  <ThemedText style={styles.menuRowText}>Cancel</ThemedText>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={helpOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHelpOpen(false)}
      >
        <Pressable style={styles.helpBackdrop} onPress={() => setHelpOpen(false)}>
          {/* Inner press swallows taps so tapping the card doesn't dismiss. */}
          <Pressable
            style={[styles.helpCard, { backgroundColor: colors.background, borderColor: colors.tileBorder }]}
            onPress={() => {}}
          >
            <ThemedText style={styles.helpTitle}>Creating a checklist</ThemedText>
            <ThemedText style={[styles.helpHeading, { color: colors.tint }]}>Highlight to pick items</ThemedText>
            <ThemedText style={styles.helpBody}>
              Select the lines you want as checklist items, then choose Create
              Checklist from the ••• menu above.
              Only the highlighted lines become items (blank lines are skipped). The
              rest of your note stays as the description. A highlighted line already
              written as “- [ ]” / “- [x]” keeps just its text, and the box decides
              whether it starts checked.
            </ThemedText>
            <ThemedText style={[styles.helpHeading, { color: colors.tint }]}>Automatic conversion</ThemedText>
            <ThemedText style={styles.helpBody}>
              With nothing highlighted, lines written as “- [ ]” (to-do) or “- [x]”
              (done) become items. Undo Checklist turns your items back into those
              “- [ ]” / “- [x]” lines, so converting back and forth keeps everything,
              including what’s checked off. A note with no “- [ ]” lines just becomes a
              checklist with your text as the description and an empty list.
            </ThemedText>
            <Pressable
              onPress={() => setHelpOpen(false)}
              style={[styles.helpButton, { backgroundColor: colors.tint }]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.helpButtonText}>Got it</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {isOffline && (
        <View style={styles.offlineBanner}>
          <ThemedText style={styles.offlineBannerText}>
            Offline. Force-quitting the app may lose unsaved changes.
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
          <>
            <ChecklistEditor
              ref={checklistEditorRef}
              note={note}
              tags={tags}
              items={checklist.items}
              numbered={!!note.checklistNumbered}
              onToggleNumbered={handleToggleNumbered}
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
            {/* "Undo Checklist" lives way down here, well clear of Add item
                and the numbers toggle, so reverting the whole checklist
                can't happen by accident. */}
            <Pressable
              onPress={handleToggleType}
              style={[styles.undoChecklistButton, { borderColor: colors.tileBorder }]}
              accessibilityLabel="Convert checklist back to text"
              accessibilityRole="button"
            >
              <ThemedText style={[styles.undoChecklistText, { color: colors.icon }]}>
                Undo Checklist
              </ThemedText>
            </Pressable>
          </>
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
            onSuggestions={handleSuggestions}
            onMediaChip={handleMediaChip}
            onFormatState={setFormatState}
            onImportingChange={setImportingMedia}
          />
        )}
      </Animated.ScrollView>

      <Animated.View
        pointerEvents={tagPickerOpen ? 'none' : 'auto'}
        style={[
          styles.barStack,
          { backgroundColor: colors.background, borderTopColor: colors.tileBorder },
          tagPickerOpen && { opacity: 0 },
          animatedBarStyle,
        ]}
      >
        {/* Word/tag autocomplete strip — text mode only. Renders nothing
            until the personal vocab has a match, then pops in above the
            toolbar (the stack is bottom-anchored, so it grows upward). */}
        {note.type !== 'checklist' && (
          <SuggestionBar ref={suggestionBarRef} onPick={handlePickSuggestion} onOpenMedia={handleOpenMedia} />
        )}
        <View style={styles.dismissBar}>
        {/* Formatting toolbar applies only to text-mode notes. In checklist
            mode the items are short single-line inputs and formatting tools
            would conflict with the checklist semantics. The tools scroll
            sideways on narrow phones; the photo and keyboard buttons stay
            pinned at the right. */}
        {note.type !== 'checklist' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            style={styles.toolScroll}
            contentContainerStyle={styles.toolRow}
          >
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
              accessibilityLabel="Strikethrough"
              accessibilityState={{ selected: formatState.strike }}
            >
              <IconSymbol name="strikethrough" size={20} color={formatState.strike ? colors.tint : colors.icon} />
            </Pressable>
            <Pressable
              onPress={() => noteEditorRef.current?.applyBullets()}
              style={styles.toolbarButton}
              hitSlop={8}
              accessibilityLabel="Bulleted list"
              accessibilityState={{ selected: formatState.bullets }}
            >
              <IconSymbol name="list.bullet" size={20} color={formatState.bullets ? colors.tint : colors.icon} />
            </Pressable>
            <Pressable
              onPress={() => noteEditorRef.current?.applyNumberedList()}
              style={styles.toolbarButton}
              hitSlop={8}
              accessibilityLabel="Numbered list"
              accessibilityState={{ selected: formatState.numbers }}
            >
              <IconSymbol name="list.number" size={20} color={formatState.numbers ? colors.tint : colors.icon} />
            </Pressable>
            <Pressable
              onPress={() => noteEditorRef.current?.applyBold()}
              style={styles.toolbarButton}
              hitSlop={8}
              accessibilityLabel="Bold"
              accessibilityState={{ selected: formatState.bold }}
            >
              <IconSymbol name="bold" size={20} color={formatState.bold ? colors.tint : colors.icon} />
            </Pressable>
            <Pressable
              onPress={() => noteEditorRef.current?.applyItalic()}
              style={styles.toolbarButton}
              hitSlop={8}
              accessibilityLabel="Italic"
              accessibilityState={{ selected: formatState.italic }}
            >
              <IconSymbol name="italic" size={20} color={formatState.italic ? colors.tint : colors.icon} />
            </Pressable>
            <Pressable
              onPress={() => noteEditorRef.current?.applyHeading()}
              style={styles.toolbarButton}
              hitSlop={8}
              accessibilityLabel="Heading"
              accessibilityState={{ selected: formatState.heading }}
            >
              <IconSymbol name="textformat" size={20} color={formatState.heading ? colors.tint : colors.icon} />
            </Pressable>
          </ScrollView>
        ) : (
          <View style={styles.dismissSpacer} />
        )}
        {note.type !== 'checklist' && (
          <Pressable
            onPress={() => noteEditorRef.current?.addMedia()}
            disabled={importingMedia}
            style={styles.toolbarButton}
            hitSlop={8}
            accessibilityLabel="Add photo or video"
          >
            {importingMedia ? (
              <ActivityIndicator size="small" color={colors.icon} />
            ) : (
              <IconSymbol name="photo.on.rectangle" size={20} color={colors.icon} />
            )}
          </Pressable>
        )}
        <Pressable onPress={dismissKeyboard} style={styles.dismissButton} hitSlop={8} accessibilityLabel="Hide keyboard">
          <IconSymbol name="keyboard.chevron.compact.down" size={22} color={colors.icon} />
        </Pressable>
        </View>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    padding: 8,
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    pointerEvents: 'box-none',
  },
  headerIconDisabled: {
    opacity: 0.3,
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
  // Big top margin is the point: distance from Add item / Number items is
  // what prevents accidental full-checklist reverts.
  undoChecklistButton: {
    alignSelf: 'center',
    marginTop: 120,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  undoChecklistText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Accessory stack: the dismiss/toolbar row, anchored to the bottom and
  // slid with the keyboard.
  barStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dismissBar: {
    height: DISMISS_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  dismissSpacer: {
    flex: 1,
  },
  toolScroll: {
    flex: 1,
  },
  toolRow: {
    alignItems: 'center',
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
  menuCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 18,
    paddingBottom: 6,
    paddingHorizontal: 8,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  menuSubtitle: {
    fontSize: 13,
    opacity: 0.55,
    textAlign: 'center',
    marginBottom: 6,
  },
  menuRow: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.25)',
  },
  menuRowLast: {},
  menuRowText: {
    fontSize: 16,
    fontWeight: '600',
  },
  menuDestructive: {
    color: '#E74C3C',
  },
  helpBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  helpCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  helpTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  helpHeading: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  helpBody: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 12,
  },
  helpButton: {
    marginTop: 4,
    alignSelf: 'flex-end',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  helpButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
