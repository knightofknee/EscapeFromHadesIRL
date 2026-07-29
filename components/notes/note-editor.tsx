import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, TextInput, View, Pressable, ScrollView, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from './tag-chip';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { UndoHistory, caretAfterRestore } from '@/lib/undo-history';
import {
  applySuggestionToText,
  getSuggestions,
  learnFromEdit,
  learnWord,
  type Suggestion,
} from '@/lib/word-suggestions';
import type { Note, Tag, InlineTag } from '@/types/note';

type NoteEditorProps = {
  note: Note;
  tags: Tag[];
  isNew?: boolean;
  onUpdateTitle: (title: string) => void;
  onUpdateContent: (content: string) => void;
  onUpdateTags: (tags: InlineTag[]) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onOpenTagPicker?: () => void;
  onTouchStart?: (e: { nativeEvent: { pageY: number } }) => void;
  /**
   * Reports the window-Y of the caret's bottom edge, but only while the
   * caret is at (or near) the end of the content. The parent uses it to
   * scroll the page so the caret stays above the keyboard while typing.
   * It fires only at the end because that's the one caret position we can
   * reliably derive from the input's measured rect (its bottom edge).
   */
  onCaretBottom?: (windowY: number) => void;
  /**
   * Fires when undo/redo availability flips, so the parent can enable/
   * disable its toolbar buttons without re-rendering on every keystroke.
   */
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  /**
   * Autocomplete chips for the word at the caret (personal vocabulary +
   * tag matches), recomputed on every caret/content change. The parent
   * forwards these to the SuggestionBar's imperative handle so only the
   * strip re-renders while typing.
   */
  onSuggestions?: (suggestions: Suggestion[]) => void;
};

export type NoteEditorHandle = {
  applyStrikethrough: () => void;
  applyBullets: () => void;
  applyNumberedList: () => void;
  /** Step the title+content back/forward one history chunk. */
  undo: () => void;
  redo: () => void;
  /**
   * Snapshot of the editor's *local* content — including any unsaved
   * typing that hasn't yet been debounced into Firestore. The parent's
   * `note.content` prop can lag this by up to 500ms, so callers (notably
   * the text↔checklist toggle parsing the content into items) should
   * prefer this over `note.content` to avoid losing recent edits.
   */
  getLatestContent: () => string;
  /** Same as getLatestContent, for the title field. */
  getLatestTitle: () => string;
  /**
   * The content field's current selection (caret/highlight) as char offsets.
   * The text→checklist toggle reads this so a highlight scopes which lines
   * become items. Snapshot it on the button's onPressIn — by the time the
   * press completes the input may have blurred and collapsed the selection.
   */
  getSelection: () => { start: number; end: number };
  /** Accept a suggestion chip: replace the typed span with the full word/
   *  tag name (+ trailing space) and move the caret past it. */
  applySuggestion: (suggestion: Suggestion) => void;
};

// U+0336 is the Unicode combining long stroke overlay — visually strikes through
// the preceding character. Works in any plain-text field including TextInput.
const STRIKE_CHAR = '\u0336';

/** Toggle actual visual strikethrough on the selected text using U+0336 overlay. */
function formatStrikethrough(content: string, sel: { start: number; end: number }) {
  if (sel.end <= sel.start) return { content, newSelection: sel };
  const before = content.slice(0, sel.start);
  const middle = content.slice(sel.start, sel.end);
  const after = content.slice(sel.end);
  // If already striked (contains the overlay), remove it
  if (middle.includes(STRIKE_CHAR)) {
    const stripped = middle.split(STRIKE_CHAR).join('');
    return {
      content: before + stripped + after,
      newSelection: { start: sel.start, end: sel.start + stripped.length },
    };
  }
  // Otherwise strike each visible character
  const striked = Array.from(middle).map((c) => (c === '\n' ? c : c + STRIKE_CHAR)).join('');
  return {
    content: before + striked + after,
    newSelection: { start: sel.start, end: sel.start + striked.length },
  };
}

const BULLET_PREFIX = '  • ';
// Matches a line like `  • anything` — permissive about whitespace
const BULLET_LINE_RE = /^(\s*•\s+)(.*)$/;
// Matches a line like `  1. anything` — permissive about whitespace
const NUM_LINE_RE = /^(\s*)(\d+)\.\s+(.*)$/;

type ListKind = 'bullet' | 'number';

/** Toggle a list style on the lines touched by the selection.
 *  - Same kind clicked again → strip the prefix (un-list).
 *  - Other kind clicked on an existing list → swap the prefix.
 *  - No list → add the prefix. */
function toggleList(
  content: string,
  sel: { start: number; end: number },
  kind: ListKind,
) {
  const lineStart = content.lastIndexOf('\n', sel.start - 1) + 1;
  const nlAt = content.indexOf('\n', sel.end);
  const lineEnd = nlAt === -1 ? content.length : nlAt;

  const block = content.slice(lineStart, lineEnd);
  const lines = block.split('\n');

  const currentRe = kind === 'bullet' ? BULLET_LINE_RE : NUM_LINE_RE;
  const otherRe = kind === 'bullet' ? NUM_LINE_RE : BULLET_LINE_RE;
  const firstLineHasCurrent = currentRe.test(lines[0] ?? '');

  let transformed: string[];
  if (firstLineHasCurrent) {
    // Un-list: strip the current kind's prefix from any line that has it.
    transformed = lines.map((l) => {
      const m = l.match(currentRe);
      if (!m) return l;
      // Bullet regex: [2]=text. Number regex: [3]=text.
      return kind === 'bullet' ? m[2] : m[3];
    });
  } else {
    // Apply (or swap from the other kind): strip any existing other-kind
    // prefix, then add this kind's prefix. Skip lines that already have
    // this kind's prefix (mixed selection).
    transformed = lines.map((l, i) => {
      const om = l.match(otherRe);
      const stripped = om ? (kind === 'bullet' ? om[3] : om[2]) : l;
      if (currentRe.test(stripped)) return stripped;
      const prefix = kind === 'bullet' ? BULLET_PREFIX : `  ${i + 1}. `;
      return prefix + stripped;
    });
  }

  const rebuilt = transformed.join('\n');
  const newContent = content.slice(0, lineStart) + rebuilt + content.slice(lineEnd);
  const endOfBlock = lineStart + rebuilt.length;
  return {
    content: newContent,
    newSelection: { start: endOfBlock, end: endOfBlock },
  };
}

// The content input's maxLength. Programmatic inserts (accepted suggestion
// chips) bypass TextInput's own enforcement, so they check this too.
const CONTENT_MAX_LENGTH = 50000;

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  {
    note,
    tags,
    isNew,
    onUpdateTitle,
    onUpdateContent,
    onUpdateTags,
    onFocus,
    onBlur,
    onOpenTagPicker,
    onTouchStart,
    onCaretBottom,
    onHistoryChange,
    onSuggestions,
  },
  ref,
) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  // Chunked undo/redo for title+content. Lives for the editing session of
  // one note; reset when the note id changes. See lib/undo-history.ts for
  // the chunk-boundary policy (deletes always seal the pre-delete state).
  const historyRef = useRef<UndoHistory | null>(null);
  if (historyRef.current === null) historyRef.current = new UndoHistory();
  const history = historyRef.current;
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [pendingSelection, setPendingSelection] = useState<{ start: number; end: number } | null>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  // Separate debounce timers: with a single shared timer, a title keystroke
  // cancelled a still-pending content save (and vice versa) — the cancelled
  // edit then never persisted unless that field was typed in again.
  const titleSaveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Values sitting in those debounce windows, so unmount can flush them —
  // navigating away within 500ms of the last keystroke must not drop it.
  const pendingTitleRef = useRef<string | null>(null);
  const pendingContentRef = useRef<string | null>(null);
  const onUpdateTitleRef = useRef(onUpdateTitle);
  const onUpdateContentRef = useRef(onUpdateContent);
  useEffect(() => {
    onUpdateTitleRef.current = onUpdateTitle;
    onUpdateContentRef.current = onUpdateContent;
  });
  useEffect(() => {
    return () => {
      clearTimeout(titleSaveTimeout.current);
      clearTimeout(saveTimeout.current);
      if (pendingTitleRef.current != null) onUpdateTitleRef.current(pendingTitleRef.current);
      if (pendingContentRef.current != null) onUpdateContentRef.current(pendingContentRef.current);
    };
  }, []);
  const contentRef = useRef<TextInput>(null);
  // Threshold (in chars) for "cursor is at end" — a small slack lets
  // typing past trailing whitespace still count as appending.
  const END_SLACK = 5;
  // When the caret is at (or near) the end of the content, measure the
  // content input's on-screen rect and hand the parent the window-Y of
  // its bottom edge — a close proxy for the caret's line when appending.
  // The parent decides whether that point is hidden by the keyboard and
  // scrolls if needed. We bail when the caret is mid-content: the bottom
  // edge wouldn't be where the caret is, and following it would scroll
  // the user away from their edit.
  function reportCaretIfAtEnd(cursorPos: number, contentLength: number) {
    if (!onCaretBottom) return;
    if (cursorPos < contentLength - END_SLACK) return;
    contentRef.current?.measureInWindow((_x, y, _w, h) => onCaretBottom(y + h));
  }

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    history.reset();
    onHistoryChange?.(false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync when switching notes, not on every content change
  }, [note.id]);

  const notifyHistory = () => onHistoryChange?.(history.canUndo, history.canRedo);

  // Release controlled selection after it's applied so the user can move the cursor freely
  useEffect(() => {
    if (pendingSelection) {
      const t = setTimeout(() => setPendingSelection(null), 50);
      return () => clearTimeout(t);
    }
  }, [pendingSelection]);

  function handleTitleChange(text: string) {
    history.record({ title, content }, { title: text, content });
    notifyHistory();
    setTitle(text);
    clearTimeout(titleSaveTimeout.current);
    pendingTitleRef.current = text;
    titleSaveTimeout.current = setTimeout(() => {
      pendingTitleRef.current = null;
      onUpdateTitle(text);
    }, 500);
  }

  function scheduleSave(text: string) {
    clearTimeout(saveTimeout.current);
    pendingContentRef.current = text;
    saveTimeout.current = setTimeout(() => {
      pendingContentRef.current = null;
      onUpdateContent(text);
    }, 500);
  }

  // Single commit path for every content mutation (typing, auto-list
  // continuation, list exit) so history records each one exactly once.
  function commitContent(next: string, caret?: number) {
    history.record({ title, content }, { title, content: next });
    notifyHistory();
    setContent(next);
    scheduleSave(next);
    if (caret != null) setPendingSelection({ start: caret, end: caret });
  }

  // Restore a history snapshot: move the caret to the edge of the restored
  // region, swap the fields, and persist immediately — an undo/redo is an
  // explicit action, so it shouldn't sit in the debounce window where a
  // pending autosave could race it.
  function applySnapshot(snap: { title: string; content: string }) {
    if (snap.content !== content) {
      const caret = caretAfterRestore(content, snap.content);
      setSelection({ start: caret, end: caret });
      setPendingSelection({ start: caret, end: caret });
    }
    clearTimeout(saveTimeout.current);
    clearTimeout(titleSaveTimeout.current);
    pendingTitleRef.current = null;
    pendingContentRef.current = null;
    if (snap.title !== title) {
      setTitle(snap.title);
      onUpdateTitle(snap.title);
    }
    if (snap.content !== content) {
      setContent(snap.content);
      onUpdateContent(snap.content);
    }
    notifyHistory();
  }

  function handleUndo() {
    const snap = history.undo({ title, content });
    if (snap) applySnapshot(snap);
    // A null result still mutates the stacks (snapshots identical to the
    // live state are popped and discarded) — keep the buttons honest.
    else notifyHistory();
  }

  function handleRedo() {
    const snap = history.redo({ title, content });
    if (snap) applySnapshot(snap);
    else notifyHistory();
  }

  function handleContentChange(text: string) {
    // Feed the personal-vocabulary model whenever this edit committed a word
    // boundary (separator keystroke, autocorrect replacement, paste).
    learnFromEdit(content, text);

    // Auto-continue list on Enter. Trigger whenever at least one newline has
    // been added (iOS autocorrect may insert other chars alongside the \n, so
    // we don't require a strict length diff of exactly 1).
    const oldNewlines = (content.match(/\n/g) || []).length;
    const newNewlines = (text.match(/\n/g) || []).length;

    if (newNewlines > oldNewlines) {
      // Find the position of the newly added \n.
      // Start from the first differing position and locate the next \n from there.
      let diffPos = 0;
      while (diffPos < content.length && diffPos < text.length && content[diffPos] === text[diffPos]) {
        diffPos++;
      }
      const nlPos = text.indexOf('\n', diffPos);

      if (nlPos !== -1) {
        const prevLineStart = nlPos > 0 ? text.lastIndexOf('\n', nlPos - 1) + 1 : 0;
        const prevLine = text.slice(prevLineStart, nlPos);

        const bm = prevLine.match(BULLET_LINE_RE);
        if (bm) {
          const itemText = bm[2];
          if (itemText.trim().length === 0) {
            // Empty bullet — exit list: remove the prefix line entirely
            const newContent = text.slice(0, prevLineStart) + text.slice(nlPos + 1);
            commitContent(newContent, prevLineStart);
            return;
          }
          const insert = BULLET_PREFIX;
          const newContent = text.slice(0, nlPos + 1) + insert + text.slice(nlPos + 1);
          commitContent(newContent, nlPos + 1 + insert.length);
          return;
        }

        const nm = prevLine.match(NUM_LINE_RE);
        if (nm) {
          const num = parseInt(nm[2], 10);
          const itemText = nm[3];
          if (itemText.trim().length === 0) {
            const newContent = text.slice(0, prevLineStart) + text.slice(nlPos + 1);
            commitContent(newContent, prevLineStart);
            return;
          }
          const insert = `  ${num + 1}. `;
          const newContent = text.slice(0, nlPos + 1) + insert + text.slice(nlPos + 1);
          commitContent(newContent, nlPos + 1 + insert.length);
          return;
        }
      }
    }

    commitContent(text);
  }

  function handleSelectionChange(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    const sel = e.nativeEvent.selection;
    setSelection(sel);
    // Follow the caret while typing. Uses current `content.length`
    // because onChangeText may not have fired yet for this keystroke
    // (selection often updates first on iOS).
    reportCaretIfAtEnd(sel.end, content.length);
  }

  function applyFormatting(result: { content: string; newSelection: { start: number; end: number } }) {
    // A no-op (e.g. strikethrough with nothing selected) must not pollute
    // history — it would light the undo button with nothing to undo.
    if (result.content === content) {
      contentRef.current?.focus();
      return;
    }
    // One formatting tap = one undo step.
    history.recordAction({ title, content });
    notifyHistory();
    setContent(result.content);
    clearTimeout(saveTimeout.current);
    pendingContentRef.current = null;
    onUpdateContent(result.content); // save immediately on formatting
    setSelection(result.newSelection);
    setPendingSelection(result.newSelection);
    // Keep focus on the content input
    contentRef.current?.focus();
  }

  // Mirror `title`/`content` into refs so `getLatest*()` always returns
  // the latest committed state, even when the imperative handle's
  // closure was created on an earlier render.
  const contentValueRef = useRef(content);
  const titleValueRef = useRef(title);
  useEffect(() => {
    contentValueRef.current = content;
    titleValueRef.current = title;
  }, [content, title]);
  // Mirror the selection too, so getSelection() returns the live caret/
  // highlight even when read from a stale handle closure.
  const selectionValueRef = useRef(selection);
  useEffect(() => {
    selectionValueRef.current = selection;
  }, [selection]);

  // While the TITLE input has focus the body's selection/content don't
  // change, so without this gate the strip would keep showing stale body
  // chips — and a tap would splice text into the body and yank focus away
  // from the title mid-word. (Gate on "title focused", not "content
  // focused": a chip tap must not be blocked by any transient blur it
  // causes on the content input.)
  const [titleFocused, setTitleFocused] = useState(false);
  // Pre-apply content of the last accepted chip. A double-tap lands twice on
  // the SAME rendered content (the re-render hasn't happened yet) — the
  // second commit is deduped by history, but learnWord would double-count.
  const lastApplyContentRef = useRef<string | null>(null);

  // Recompute the suggestion strip on every caret/content change. No chips
  // while a range is highlighted or the caret sits mid-word.
  useEffect(() => {
    lastApplyContentRef.current = null;
    if (!onSuggestions) return;
    if (selection.start !== selection.end || titleFocused) {
      onSuggestions([]);
      return;
    }
    onSuggestions(
      getSuggestions(content.slice(0, selection.start), tags, content[selection.start]),
    );
  }, [content, selection, tags, onSuggestions, titleFocused]);

  function handleApplySuggestion(suggestion: Suggestion) {
    if (selection.start !== selection.end || titleFocused) return;
    if (lastApplyContentRef.current === content) return; // same-frame double-tap
    const result = applySuggestionToText(content, selection.start, suggestion);
    if (!result) return; // stale tap racing a keystroke — safe no-op
    if (result.content.length > CONTENT_MAX_LENGTH) return; // never bypass maxLength
    lastApplyContentRef.current = content;
    commitContent(result.content, result.caret);
    // An accepted chip is a deliberate use — reinforce it.
    if (suggestion.kind === 'word') learnWord(suggestion.display);
    contentRef.current?.focus();
  }

  useImperativeHandle(ref, () => ({
    applyStrikethrough: () => applyFormatting(formatStrikethrough(content, selection)),
    applyBullets: () => applyFormatting(toggleList(content, selection, 'bullet')),
    applyNumberedList: () => applyFormatting(toggleList(content, selection, 'number')),
    undo: handleUndo,
    redo: handleRedo,
    getLatestContent: () => contentValueRef.current,
    getLatestTitle: () => titleValueRef.current,
    getSelection: () => selectionValueRef.current,
    applySuggestion: handleApplySuggestion,
  }));

  const noteTagIds = [...new Set(note.tags.map((t) => t.tagId))];
  const noteTags = noteTagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter(Boolean) as Tag[];

  function handleToggleTag(tagId: string) {
    const existing = note.tags.filter((t) => t.tagId === tagId);
    let newTags: InlineTag[];
    if (existing.length > 0) {
      // Remove all instances of this tag
      newTags = note.tags.filter((t) => t.tagId !== tagId);
    } else {
      // Add tag at document level (position 0-0)
      newTags = [...note.tags, { tagId, startIndex: 0, endIndex: 0 }];
    }
    onUpdateTags(newTags);
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.titleInput, { color: colors.text }]}
        value={title}
        onChangeText={handleTitleChange}
        maxLength={200}
        placeholder="Note title..."
        placeholderTextColor={colors.icon}
        keyboardAppearance={colorScheme === 'dark' ? 'dark' : 'light'}
        onFocus={() => {
          setTitleFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setTitleFocused(false);
          onBlur?.();
        }}
        onTouchStart={onTouchStart}
      />

      {/* Tags bar */}
      <View style={styles.tagsBar}>
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

      {/* Content */}
      <TextInput
        ref={contentRef}
        style={[styles.contentInput, { color: colors.text }]}
        value={content}
        onChangeText={handleContentChange}
        maxLength={CONTENT_MAX_LENGTH}
        onSelectionChange={handleSelectionChange}
        selection={pendingSelection ?? undefined}
        placeholder="Start writing..."
        placeholderTextColor={colors.icon}
        multiline
        textAlignVertical="top"
        scrollEnabled={false}
        autoFocus={isNew}
        keyboardAppearance={colorScheme === 'dark' ? 'dark' : 'light'}
        onFocus={onFocus}
        onBlur={onBlur}
        onTouchStart={onTouchStart}
        onContentSizeChange={() => {
          // Content grew/shrank (Enter, wrap, paste). If the caret is at
          // the end, re-follow so the new last line clears the keyboard.
          reportCaretIfAtEnd(selection.end, content.length);
        }}
      />
    </View>
  );
});

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
    borderBottomColor: 'rgba(128,128,128,0.2)',
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
  contentInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 28,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 200,
  },
});
