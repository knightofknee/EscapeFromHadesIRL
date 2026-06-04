import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  StyleSheet,
  TextInput,
  View,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from './tag-chip';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ChecklistItemDoc, Note, Tag, InlineTag } from '@/types/note';

const DESCRIPTION_COLLAPSED_LINES = 3;
const DESCRIPTION_LINE_HEIGHT = 24; // matches styles.descriptionInput.lineHeight
const SAVE_DEBOUNCE_MS = 400;

type ChecklistEditorProps = {
  note: Note;
  tags: Tag[];
  /**
   * Checklist items, sourced from the `notes/{id}/items` subcollection via
   * useChecklistItems (display-sorted: uncompleted by order, then completed
   * by completedAt desc). Each mutation below is one small per-item write.
   */
  items: ChecklistItemDoc[];
  onUpdateTitle: (title: string) => void;
  onUpdateDescription: (description: string) => void;
  onUpdateTags: (tags: InlineTag[]) => void;
  /** Create a blank item at the end; returns its new id (for focusing). */
  onAddItem: () => string;
  onToggleItem: (id: string) => void;
  onSetItemText: (id: string, text: string) => void;
  onDeleteItem: (id: string) => void;
  /** Undo a delete by re-creating the item with its original fields. */
  onRestoreItem: (item: ChecklistItemDoc) => void;
  onReorderUncompleted: (newUncompleted: ChecklistItemDoc[]) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onOpenTagPicker?: () => void;
  onTouchStart?: (e: { nativeEvent: { pageY: number } }) => void;
  /**
   * Reports the window-Y of the focused input's caret bottom so the
   * parent can keep it above the keyboard while typing — the same
   * mechanism the text editor uses, applied to the description and to
   * every checklist row (a freshly-added row is often focused right
   * under the keyboard).
   */
  onCaretBottom?: (windowY: number) => void;
};

export type ChecklistEditorHandle = {
  /** Focus the first item (or create + focus one if list is empty). */
  focusFirstItem: () => void;
  /**
   * Snapshot of the editor's *local* description — including any unsaved
   * typing that hasn't yet been debounced into Firestore. The parent's
   * `note` prop can lag this by up to SAVE_DEBOUNCE_MS, so the
   * text↔checklist toggle should prefer this over `note.description` to
   * avoid losing recent edits. (Items live in the subcollection and are
   * read by the parent directly from the hook.)
   */
  getLatestState: () => { description: string };
};

export const ChecklistEditor = forwardRef<ChecklistEditorHandle, ChecklistEditorProps>(
  function ChecklistEditor(
    {
      note,
      tags,
      items,
      onUpdateTitle,
      onUpdateDescription,
      onUpdateTags,
      onAddItem,
      onToggleItem,
      onSetItemText,
      onDeleteItem,
      onRestoreItem,
      onReorderUncompleted,
      onFocus,
      onBlur,
      onOpenTagPicker,
      onTouchStart,
      onCaretBottom,
    },
    ref,
  ) {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'light'];

    // Ref to the description TextInput (distinct from `descriptionRef`
    // below, which mirrors the description *string* for the unmount
    // flush). Used to measure the caret for keyboard-follow.
    const descriptionInputRef = useRef<TextInput>(null);
    // Measure an input's on-screen rect and hand the parent the window-Y
    // of its bottom edge, so the parent can lift it above the keyboard.
    const reportCaret = useCallback(
      (inputRef: { current: TextInput | null }) => {
        if (!onCaretBottom) return;
        inputRef.current?.measureInWindow((_x, y, _w, h) => onCaretBottom(y + h));
      },
      [onCaretBottom],
    );

    const [title, setTitle] = useState(note.title);
    const [description, setDescription] = useState(note.description ?? '');
    const [descriptionFocused, setDescriptionFocused] = useState(false);
    const [descriptionExpanded, setDescriptionExpanded] = useState(false);
    const [descriptionLineCount, setDescriptionLineCount] = useState(0);
    // Single-step undo for the most recent item delete. We only retain
    // ONE — a second delete overwrites the buffer; an undo clears it.
    // Stores the full item doc so re-creation restores its original
    // order/completion exactly.
    const [lastDeleted, setLastDeleted] = useState<ChecklistItemDoc | null>(null);

    // Local state owns title/description while the editor is mounted. We do
    // NOT sync from prop on every snapshot — that would let in-flight
    // Firestore round-trips clobber mid-typing keystrokes. Instead we
    // re-init whenever the *note id* changes, so navigating to a different
    // note still shows fresh data. (Items are owned by the parent hook and
    // arrive via the `items` prop with their own optimistic overlay.)
    const lastNoteId = useRef(note.id);
    useEffect(() => {
      if (note.id !== lastNoteId.current) {
        lastNoteId.current = note.id;
        setTitle(note.title);
        setDescription(note.description ?? '');
      }
    }, [note.id, note.title, note.description]);

    // Keep refs synced for the unmount-flush below (need latest values).
    const titleRef = useRef(title);
    const descriptionRef = useRef(description);
    useEffect(() => {
      titleRef.current = title;
    }, [title]);
    useEffect(() => {
      descriptionRef.current = description;
    }, [description]);

    // Refs to each item input for focus management. Keyed by item id.
    const inputRefs = useRef<Map<string, TextInput | null>>(new Map());
    // After an Enter-creates-new-item or +Add tap, this id is set so
    // the next render focuses that input.
    const pendingFocusId = useRef<string | null>(null);

    // Debounced save timers — title and description only. Item edits are
    // debounced inside useChecklistItems (per-item writes).
    const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const descSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // On unmount: flush any pending debounced title/description saves so we
    // don't lose the last few keystrokes before navigating away.
    useEffect(() => {
      return () => {
        if (titleSaveTimer.current) {
          clearTimeout(titleSaveTimer.current);
          titleSaveTimer.current = null;
          onUpdateTitle(titleRef.current);
        }
        if (descSaveTimer.current) {
          clearTimeout(descSaveTimer.current);
          descSaveTimer.current = null;
          onUpdateDescription(descriptionRef.current);
        }
      };
      // Run cleanup only on unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleTitleChange(text: string) {
      setTitle(text);
      if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
      titleSaveTimer.current = setTimeout(() => onUpdateTitle(text), SAVE_DEBOUNCE_MS);
    }

    function handleDescriptionChange(text: string) {
      setDescription(text);
      if (descSaveTimer.current) clearTimeout(descSaveTimer.current);
      descSaveTimer.current = setTimeout(() => onUpdateDescription(text), SAVE_DEBOUNCE_MS);
    }

    // Display order is owned by the parent (items prop is already sorted:
    // uncompleted by `order`, then completed by completedAt desc). Split
    // for rendering — uncompleted go through DraggableFlatList for
    // drag-to-reorder; completed render below as a normal map.
    const uncompletedItems = useMemo(
      () => items.filter((i) => !i.completed),
      [items],
    );
    const completedItems = useMemo(
      () => items.filter((i) => i.completed),
      [items],
    );

    // ----- Item operations -----
    // All per-item writes happen in useChecklistItems; the editor only
    // dispatches intent + owns focus/undo UI state.

    const addNewItem = useCallback(
      (focus = true): string => {
        const id = onAddItem();
        if (focus) pendingFocusId.current = id;
        return id;
      },
      [onAddItem],
    );

    const handleDelete = useCallback(
      (item: ChecklistItemDoc) => {
        // Snapshot the full item so undo can re-create it exactly.
        setLastDeleted(item);
        onDeleteItem(item.id);
        inputRefs.current.delete(item.id);
      },
      [onDeleteItem],
    );

    // Restore the most recently deleted item (its original `order` puts it
    // back in place). Single-shot — clears the buffer so the button hides.
    const undoDelete = useCallback(() => {
      if (!lastDeleted) return;
      onRestoreItem(lastDeleted);
      setLastDeleted(null);
    }, [lastDeleted, onRestoreItem]);

    // Apply pending focus after items render.
    useEffect(() => {
      if (!pendingFocusId.current) return;
      const id = pendingFocusId.current;
      pendingFocusId.current = null;
      // Defer until next tick so the new TextInput is mounted.
      const t = setTimeout(() => {
        inputRefs.current.get(id)?.focus();
      }, 0);
      return () => clearTimeout(t);
    }, [items]);

    useImperativeHandle(ref, () => ({
      focusFirstItem: () => {
        if (items.length === 0) {
          addNewItem(true);
        } else {
          // Focus the first displayed item directly via its ref. No
          // setState here — the existing input is already mounted.
          const first = items[0];
          if (first) inputRefs.current.get(first.id)?.focus();
        }
      },
      getLatestState: () => ({
        description: descriptionRef.current,
      }),
    }));

    // ----- Tag handling (same pattern as NoteEditor) -----
    const noteTagIds = [...new Set(note.tags.map((t) => t.tagId))];
    const noteTags = noteTagIds
      .map((id) => tags.find((t) => t.id === id))
      .filter(Boolean) as Tag[];

    function handleToggleTag(tagId: string) {
      const existing = note.tags.filter((t) => t.tagId === tagId);
      let newTags: InlineTag[];
      if (existing.length > 0) {
        newTags = note.tags.filter((t) => t.tagId !== tagId);
      } else {
        newTags = [...note.tags, { tagId, startIndex: 0, endIndex: 0 }];
      }
      onUpdateTags(newTags);
    }

    // ----- Description display logic -----
    // Collapsed: clamp to N lines unless expanded. Tap = expand + focus.
    // "More" button only shows when content overflows the line cap.
    const isLong = descriptionLineCount > DESCRIPTION_COLLAPSED_LINES;
    const showDescriptionFull = descriptionFocused || descriptionExpanded || !isLong;

    return (
      <View style={styles.container}>
        <TextInput
          style={[styles.titleInput, { color: colors.text }]}
          value={title}
          onChangeText={handleTitleChange}
          placeholder="Note title..."
          placeholderTextColor={colors.icon}
          keyboardAppearance={colorScheme === 'dark' ? 'dark' : 'light'}
          onFocus={onFocus}
          onBlur={onBlur}
          onTouchStart={onTouchStart}
        />

        {/* Tags bar */}
        <View style={[styles.tagsBar, { borderBottomColor: 'rgba(128,128,128,0.2)' }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsScroll}>
            {noteTags.map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                color={tag.color}
                selected
                small
                onPress={() => handleToggleTag(tag.id)}
              />
            ))}
            <Pressable
              style={[styles.addTagButton, { borderColor: colors.tileBorder }]}
              onPress={() => onOpenTagPicker?.()}
            >
              <ThemedText style={[styles.addTagText, { color: colors.icon }]}>+ Tag</ThemedText>
            </Pressable>
          </ScrollView>
        </View>

        {/* Description: tap-to-expand-and-focus. Empty state shows
            "Description" placeholder so the option is discoverable.
            Collapse uses maxHeight on a wrapping View (NOT
            `numberOfLines` on TextInput, which is Android-only). */}
        <View style={[styles.descriptionWrap, { borderBottomColor: 'rgba(128,128,128,0.2)' }]}>
          <View
            style={[
              styles.descriptionClip,
              !showDescriptionFull && {
                maxHeight: DESCRIPTION_COLLAPSED_LINES * DESCRIPTION_LINE_HEIGHT,
              },
            ]}
          >
            <TextInput
              ref={descriptionInputRef}
              style={[styles.descriptionInput, { color: colors.text }]}
              value={description}
              onChangeText={handleDescriptionChange}
              placeholder="Description"
              placeholderTextColor={colors.icon}
              multiline
              scrollEnabled={false}
              onFocus={() => {
                setDescriptionFocused(true);
                onFocus?.();
              }}
              onBlur={() => {
                setDescriptionFocused(false);
                onBlur?.();
              }}
              onTouchStart={onTouchStart}
              onSelectionChange={(e) => {
                // Follow the caret while typing at the end of the
                // description (mid-edits shouldn't yank the page).
                if (e.nativeEvent.selection.end >= description.length - 5) {
                  reportCaret(descriptionInputRef);
                }
              }}
              keyboardAppearance={colorScheme === 'dark' ? 'dark' : 'light'}
              // Track total line count for the "more"-toggle decision. RN
              // doesn't expose line count directly; estimate from layout.
              onContentSizeChange={(e) => {
                const lines = Math.round(
                  e.nativeEvent.contentSize.height / DESCRIPTION_LINE_HEIGHT,
                );
                setDescriptionLineCount(lines);
                // Description grew while focused — keep the caret in view.
                if (descriptionFocused) reportCaret(descriptionInputRef);
              }}
            />
          </View>
          {isLong && !descriptionFocused && (
            <Pressable
              onPress={() => setDescriptionExpanded((v) => !v)}
              hitSlop={8}
              style={styles.moreButton}
            >
              <ThemedText style={[styles.moreText, { color: colors.tint }]}>
                {descriptionExpanded ? 'less' : 'more'}
              </ThemedText>
            </Pressable>
          )}
        </View>

        {/* Checklist — uncompleted items go through DraggableFlatList
            so they can be drag-handle-reordered; completed items render
            below as a normal map (their display order is driven by
            completedAt, not user-arrangeable). */}
        <View style={styles.checklistWrap}>
          <DraggableFlatList
            data={uncompletedItems}
            keyExtractor={(item) => item.id}
            onDragEnd={({ data }) => onReorderUncompleted(data)}
            // Inner FlatList shouldn't scroll — the parent ScrollView
            // owns scroll. The library still handles long-press-and-drag
            // for reorder gesture inside this flat list.
            scrollEnabled={false}
            activationDistance={5}
            renderItem={({ item, drag, isActive }: RenderItemParams<ChecklistItemDoc>) => (
              <ScaleDecorator>
                <ChecklistRow
                  item={item}
                  colors={colors}
                  registerRef={(t) => inputRefs.current.set(item.id, t)}
                  onToggle={() => onToggleItem(item.id)}
                  onChangeText={(text) => onSetItemText(item.id, text)}
                  onSubmitEditing={() => {
                    if (item.text.trim().length > 0) {
                      addNewItem(true);
                    } else {
                      Keyboard.dismiss();
                    }
                  }}
                  onDelete={() => handleDelete(item)}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  onTouchStart={onTouchStart}
                  onCaretBottom={onCaretBottom}
                  drag={drag}
                  isActive={isActive}
                />
              </ScaleDecorator>
            )}
          />

          {completedItems.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              colors={colors}
              registerRef={(t) => inputRefs.current.set(item.id, t)}
              onToggle={() => onToggleItem(item.id)}
              onChangeText={(text) => onSetItemText(item.id, text)}
              onSubmitEditing={() => {
                if (item.text.trim().length > 0) {
                  addNewItem(true);
                } else {
                  Keyboard.dismiss();
                }
              }}
              onDelete={() => handleDelete(item)}
              onFocus={onFocus}
              onBlur={onBlur}
              onTouchStart={onTouchStart}
              onCaretBottom={onCaretBottom}
              // No drag/isActive — completed items aren't user-reorderable.
            />
          ))}

          {/* "+ Add item" inline ghost row at bottom. Always enabled. */}
          <Pressable
            onPress={() => addNewItem(true)}
            style={[styles.addRow, { borderColor: colors.tileBorder }]}
            hitSlop={6}
          >
            <Ionicons name="add" size={18} color={colors.tint} />
            <ThemedText style={[styles.addRowText, { color: colors.tint }]}>
              Add item
            </ThemedText>
          </Pressable>

          {/* Single-shot undo for the most recent delete. Hidden until
              a delete happens; vanishes after use or after a second
              delete (which overwrites the buffer). */}
          {lastDeleted && (
            <Pressable
              onPress={undoDelete}
              style={[styles.undoRow, { borderColor: colors.tint }]}
              hitSlop={6}
              accessibilityLabel="Undo delete"
            >
              <Ionicons name="arrow-undo" size={16} color={colors.tint} />
              <ThemedText style={[styles.undoText, { color: colors.tint }]}>
                Undo delete
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    );
  },
);

// ---------- Single checklist row (with checkbox + swipe-to-delete) ----------

type ChecklistRowProps = {
  item: ChecklistItemDoc;
  colors: (typeof Colors)['light'];
  registerRef: (t: TextInput | null) => void;
  onToggle: () => void;
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  onDelete: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onTouchStart?: (e: { nativeEvent: { pageY: number } }) => void;
  /** Reports this row's caret-bottom window-Y for keyboard-follow. */
  onCaretBottom?: (windowY: number) => void;
  /** Provided by DraggableFlatList for uncompleted items only. When
   *  present, a drag handle is rendered on the right; long-pressing it
   *  initiates the row drag. Completed items don't pass this. */
  drag?: () => void;
  /** True while this row is being dragged. Used for visual styling. */
  isActive?: boolean;
};

function ChecklistRow({
  item,
  colors,
  registerRef,
  onToggle,
  onChangeText,
  onSubmitEditing,
  onDelete,
  onFocus,
  onBlur,
  onTouchStart,
  onCaretBottom,
  drag,
  isActive,
}: ChecklistRowProps) {
  // Local handle on this row's input so we can measure its caret. We also
  // forward it up via registerRef (the parent keeps a map for focus mgmt).
  const itemInputRef = useRef<TextInput>(null);
  // Single-line row, so the input's bottom edge IS the caret's line —
  // report it so the parent can keep a freshly-focused row above the
  // keyboard.
  const measureCaret = () => {
    itemInputRef.current?.measureInWindow((_x, y, _w, h) => onCaretBottom?.(y + h));
  };
  // Swipe-to-delete renders a red "Delete" action behind the row that
  // becomes visible as the user swipes left. Tapping it triggers delete.
  const renderRightActions = () => (
    <Pressable style={[styles.swipeDelete, { backgroundColor: colors.tint }]} onPress={onDelete}>
      <ThemedText style={styles.swipeDeleteText}>Delete</ThemedText>
    </Pressable>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <View
        style={[
          styles.itemRow,
          { backgroundColor: colors.background },
          isActive && { opacity: 0.85, backgroundColor: colors.tileBackground },
        ]}
      >
        <Pressable onPress={onToggle} hitSlop={8} style={styles.checkbox}>
          <Ionicons
            name={item.completed ? 'checkbox' : 'square-outline'}
            size={22}
            color={item.completed ? colors.tint : colors.icon}
          />
        </Pressable>
        <TextInput
          ref={(t) => {
            itemInputRef.current = t;
            registerRef(t);
          }}
          style={[
            styles.itemInput,
            { color: item.completed ? colors.icon : colors.text },
            item.completed && styles.itemInputCompleted,
          ]}
          value={item.text}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => {
            onFocus?.();
            // A newly-created row is often focused below the keyboard;
            // lift it into view as soon as it gains focus.
            measureCaret();
          }}
          onBlur={onBlur}
          onSelectionChange={measureCaret}
          onTouchStart={onTouchStart}
          placeholder=""
          // Single line per item so Enter triggers onSubmitEditing.
          // blurOnSubmit defaults to true on iOS — we set false because
          // we handle our own focus shifting.
          blurOnSubmit={false}
          returnKeyType="next"
          keyboardAppearance={Platform.OS === 'ios' ? 'default' : undefined}
        />
        {drag && (
          // Drag handle on the right edge of uncompleted rows. Long-press
          // to grab; DraggableFlatList takes over the rest of the gesture.
          <Pressable
            onLongPress={drag}
            delayLongPress={200}
            hitSlop={8}
            style={styles.dragHandle}
            accessibilityLabel="Drag to reorder"
          >
            <Ionicons name="reorder-three" size={22} color={colors.icon} />
          </Pressable>
        )}
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tagsBar: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tagsScroll: {
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addTagButton: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addTagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  descriptionWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // Clipping wrapper around the description TextInput. Applying maxHeight
  // here (instead of via TextInput's `numberOfLines` prop, which is
  // Android-only) makes the collapse work on iOS too. `overflow: hidden`
  // ensures the clipped lines don't bleed into siblings.
  descriptionClip: {
    flex: 1,
    overflow: 'hidden',
  },
  descriptionInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 24,
    minHeight: 24, // single-line slim sliver when empty
    paddingTop: 0,
    paddingBottom: 0,
  },
  moreButton: {
    paddingLeft: 8,
    paddingTop: 2,
  },
  moreText: {
    fontSize: 12,
    fontWeight: '600',
  },
  checklistWrap: {
    paddingTop: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 40,
  },
  checkbox: {
    paddingRight: 10,
    paddingVertical: 4,
  },
  itemInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 4,
  },
  itemInputCompleted: {
    textDecorationLine: 'line-through',
  },
  dragHandle: {
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 6,
  },
  swipeDelete: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  swipeDeleteText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 6,
  },
  addRowText: {
    fontSize: 14,
    fontWeight: '600',
  },
  undoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start', // doesn't span full width — quieter visual
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  undoText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
