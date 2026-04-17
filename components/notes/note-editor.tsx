import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, TextInput, View, Pressable, ScrollView, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from './tag-chip';
import { TagPicker } from './tag-picker';
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
  onCreateTag: (name: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onTouchStart?: (e: { nativeEvent: { pageY: number } }) => void;
};

export type NoteEditorHandle = {
  applyStrikethrough: () => void;
  applyBullets: () => void;
  applyNumberedList: () => void;
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
 *  If the first line is already the given list kind, removes the prefix from
 *  all matching lines in the block (un-list). Otherwise adds the prefix. */
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

  const re = kind === 'bullet' ? BULLET_LINE_RE : NUM_LINE_RE;
  const firstLineHasPrefix = re.test(lines[0] ?? '');

  let transformed: string[];
  if (firstLineHasPrefix) {
    // Un-list: strip the prefix from any line that has it
    transformed = lines.map((l) => {
      const m = l.match(re);
      if (!m) return l;
      // Bullet regex: [1]=prefix, [2]=text. Number regex: [1]=indent, [2]=num, [3]=text.
      return kind === 'bullet' ? m[2] : m[3];
    });
  } else {
    // Apply: prefix each line (skip lines that already have the correct prefix)
    transformed = lines.map((l, i) => {
      if (re.test(l)) return l; // already has the correct prefix
      const prefix = kind === 'bullet' ? BULLET_PREFIX : `  ${i + 1}. `;
      return prefix + l;
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
    onCreateTag,
    onFocus,
    onBlur,
    onTouchStart,
  },
  ref,
) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [pendingSelection, setPendingSelection] = useState<{ start: number; end: number } | null>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const contentRef = useRef<TextInput>(null);

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
    setSelection(e.nativeEvent.selection);
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

  useImperativeHandle(ref, () => ({
    applyStrikethrough: () => applyFormatting(formatStrikethrough(content, selection)),
    applyBullets: () => applyFormatting(toggleList(content, selection, 'bullet')),
    applyNumberedList: () => applyFormatting(toggleList(content, selection, 'number')),
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
            onPress={() => setShowTagPicker(true)}
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
      />

      <TagPicker
        visible={showTagPicker}
        tags={tags}
        selectedTagIds={noteTagIds}
        onToggleTag={handleToggleTag}
        onCreateTag={onCreateTag}
        onClose={() => setShowTagPicker(false)}
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
