import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, TextInput, View, Pressable, ScrollView, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from './tag-chip';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
};

export type NoteEditorHandle = {
  applyStrikethrough: () => void;
  applyBullets: () => void;
  applyNumberedList: () => void;
  /**
   * Snapshot of the editor's *local* content — including any unsaved
   * typing that hasn't yet been debounced into Firestore. The parent's
   * `note.content` prop can lag this by up to 500ms, so callers (notably
   * the text↔checklist toggle parsing the content into items) should
   * prefer this over `note.content` to avoid losing recent edits.
   */
  getLatestContent: () => string;
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
  },
  ref,
) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [pendingSelection, setPendingSelection] = useState<{ start: number; end: number } | null>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync when switching notes, not on every content change
  }, [note.id]);

  // Release controlled selection after it's applied so the user can move the cursor freely
  useEffect(() => {
    if (pendingSelection) {
      const t = setTimeout(() => setPendingSelection(null), 50);
      return () => clearTimeout(t);
    }
  }, [pendingSelection]);

  function handleTitleChange(text: string) {
    setTitle(text);
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => onUpdateTitle(text), 500);
  }

  function scheduleSave(text: string) {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => onUpdateContent(text), 500);
  }

  function handleContentChange(text: string) {
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
            setContent(newContent);
            scheduleSave(newContent);
            setPendingSelection({ start: prevLineStart, end: prevLineStart });
            return;
          }
          const insert = BULLET_PREFIX;
          const newContent = text.slice(0, nlPos + 1) + insert + text.slice(nlPos + 1);
          setContent(newContent);
          scheduleSave(newContent);
          const caret = nlPos + 1 + insert.length;
          setPendingSelection({ start: caret, end: caret });
          return;
        }

        const nm = prevLine.match(NUM_LINE_RE);
        if (nm) {
          const num = parseInt(nm[2], 10);
          const itemText = nm[3];
          if (itemText.trim().length === 0) {
            const newContent = text.slice(0, prevLineStart) + text.slice(nlPos + 1);
            setContent(newContent);
            scheduleSave(newContent);
            setPendingSelection({ start: prevLineStart, end: prevLineStart });
            return;
          }
          const insert = `  ${num + 1}. `;
          const newContent = text.slice(0, nlPos + 1) + insert + text.slice(nlPos + 1);
          setContent(newContent);
          scheduleSave(newContent);
          const caret = nlPos + 1 + insert.length;
          setPendingSelection({ start: caret, end: caret });
          return;
        }
      }
    }

    setContent(text);
    scheduleSave(text);
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
    setContent(result.content);
    clearTimeout(saveTimeout.current);
    onUpdateContent(result.content); // save immediately on formatting
    setSelection(result.newSelection);
    setPendingSelection(result.newSelection);
    // Keep focus on the content input
    contentRef.current?.focus();
  }

  // Mirror `content` into a ref so `getLatestContent()` always returns
  // the latest committed state, even when the imperative handle's
  // closure was created on an earlier render.
  const contentValueRef = useRef(content);
  useEffect(() => {
    contentValueRef.current = content;
  }, [content]);

  useImperativeHandle(ref, () => ({
    applyStrikethrough: () => applyFormatting(formatStrikethrough(content, selection)),
    applyBullets: () => applyFormatting(toggleList(content, selection, 'bullet')),
    applyNumberedList: () => applyFormatting(toggleList(content, selection, 'number')),
    getLatestContent: () => contentValueRef.current,
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
        onFocus={onFocus}
        onBlur={onBlur}
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
        maxLength={50000}
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
