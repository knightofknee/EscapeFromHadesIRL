import { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  Pressable,
  ScrollView,
  useWindowDimensions,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  EnrichedTextInput,
  type EnrichedTextInputInstance,
  type OnChangeStateEvent,
} from 'react-native-enriched-html';
import * as ImagePicker from 'expo-image-picker';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from './tag-chip';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/contexts/auth-context';
import { emitError } from '@/lib/error-bus';
import { UndoHistory, caretAfterRestore, type UndoSnapshot } from '@/lib/undo-history';
import {
  applySuggestionToText,
  getSuggestions,
  learnFromEdit,
  learnWord,
  type Suggestion,
} from '@/lib/word-suggestions';
import {
  IMAGE_CHAR,
  hiddenCharOffsets,
  htmlToEditorText,
  selectionToEditorOffset,
  imageSources,
  insertImageBlock,
  replaceEditorRange,
} from '@/lib/note-html';
import { noteBodyHtml } from '@/lib/note-content';
import {
  editorImageTag,
  importPhoto,
  importVideo,
  isVideoPoster,
  nameFromSrc,
  toEditorHtml,
  toStorageHtml,
} from '@/lib/note-media';
import type { MediaChip } from './suggestion-bar';
import type { Note, Tag, InlineTag } from '@/types/note';

/** Which toolbar toggles are active at the caret (drives their tint). */
export type FormatState = {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  heading: boolean;
  bullets: boolean;
  numbers: boolean;
};

const NO_FORMAT: FormatState = {
  bold: false,
  italic: false,
  strike: false,
  heading: false,
  bullets: false,
  numbers: false,
};

type NoteEditorProps = {
  note: Note;
  tags: Tag[];
  isNew?: boolean;
  onUpdateTitle: (title: string) => void;
  /** Receives the body as STORED HTML (efh-media:// image refs). */
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
  /** The photo/video the caret is touching, or null (see SuggestionBar). */
  onMediaChip?: (chip: MediaChip | null) => void;
  /** Toolbar toggle states; fires only when one flips. */
  onFormatState?: (state: FormatState) => void;
  /** True while picked/pasted media is being copied in. */
  onImportingChange?: (importing: boolean) => void;
};

export type NoteEditorHandle = {
  applyStrikethrough: () => void;
  applyBullets: () => void;
  applyNumberedList: () => void;
  applyBold: () => void;
  applyItalic: () => void;
  applyHeading: () => void;
  /** Open the photo library and insert the picked photos/videos at the caret. */
  addMedia: () => void;
  /** Step the title+content back/forward one history chunk. */
  undo: () => void;
  redo: () => void;
  /** Drop the keyboard. Keyboard.dismiss() can't blur the rich input. */
  blur: () => void;
  /**
   * Snapshot of the editor's *local* body as STORED HTML — including any
   * unsaved typing that hasn't yet been debounced into Firestore. The
   * parent's `note.content` prop can lag this by up to 500ms.
   */
  getLatestContent: () => string;
  /**
   * The body's text in the editor's offset model (one line per paragraph,
   * each photo one IMAGE_CHAR) — the space getSelection() offsets index.
   */
  getLatestText: () => string;
  /** Same as getLatestContent, for the title field. */
  getLatestTitle: () => string;
  /**
   * The content field's current selection (caret/highlight) as offsets into
   * getLatestText(). The text→checklist toggle reads this so a highlight
   * scopes which lines become items. Snapshot it on the button's onPressIn —
   * by the time the press completes the input may have blurred.
   */
  getSelection: () => { start: number; end: number };
  /** Accept a suggestion chip: replace the typed span with the full word/
   *  tag name (+ trailing space) and move the caret past it. */
  applySuggestion: (suggestion: Suggestion) => void;
};

/** Firestore's document cap is 1 MiB; leave headroom for the other fields. */
const MAX_STORED_HTML = 900_000;
// Editor body padding — photos are sized to the width inside it.
const BODY_PAD_H = 16;

/** Collapse the editor's pretty-print whitespace for change detection. */
function normalize(html: string): string {
  return html.replace(/>\s*\n\s*</g, '><').trim();
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
    onHistoryChange,
    onSuggestions,
    onMediaChip,
    onFormatState,
    onImportingChange,
  },
  ref,
) {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { width: windowWidth } = useWindowDimensions();
  const imageMaxWidth = windowWidth - BODY_PAD_H * 2;

  const [title, setTitle] = useState(note.title);
  const editorRef = useRef<EnrichedTextInputInstance>(null);

  // The body the editor starts from, computed once per note: stored HTML (or
  // a converted legacy string) with efh-media:// refs swapped for this
  // phone's file URLs. The editor is uncontrolled; later content flows out
  // through onChangeHtml and in only via setValue (undo, chips, photos).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per note id
  const initialHtml = useMemo(() => toEditorHtml(noteBodyHtml(note), uid, imageMaxWidth), [note.id, uid]);

  // Live mirrors of the editor (editor-form HTML, its text model, selection).
  const htmlRef = useRef(initialHtml);
  const textRef = useRef(htmlToEditorText(initialHtml));
  const selRef = useRef({ start: 0, end: 0 });
  const lastNormRef = useRef(normalize(initialHtml));
  // The editor emits an onChangeHtml for its initial value; that one is the
  // baseline, not an edit (saving it would convert/bump every opened note).
  const baselinedRef = useRef(false);
  // Set around programmatic setValue / format toggles: the change they cause
  // must be saved but not recorded as a fresh typing edit (the action has
  // already pushed its own undo boundary).
  const suppressRecordRef = useRef(false);
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Chunked undo/redo for title+content. Lives for the editing session of
  // one note; reset when the note id changes. See lib/undo-history.ts for
  // the chunk-boundary policy (deletes always seal the pre-delete state).
  const historyRef = useRef<UndoHistory | null>(null);
  if (historyRef.current === null) historyRef.current = new UndoHistory();
  const history = historyRef.current;
  const notifyHistory = () => onHistoryChange?.(history.canUndo, history.canRedo);

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
      clearTimeout(suppressTimer.current);
      clearTimeout(applyTimer.current);
      if (pendingTitleRef.current != null) onUpdateTitleRef.current(pendingTitleRef.current);
      if (pendingContentRef.current != null) onUpdateContentRef.current(pendingContentRef.current);
    };
  }, []);

  useEffect(() => {
    setTitle(note.title);
    history.reset();
    onHistoryChange?.(false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync when switching notes, not on every content change
  }, [note.id]);

  const titleValueRef = useRef(title);
  useEffect(() => {
    titleValueRef.current = title;
  }, [title]);

  const snapshot = (): UndoSnapshot => ({ title: titleValueRef.current, content: htmlRef.current, text: textRef.current });

  // --- saving ---------------------------------------------------------------

  function persistBody(editorHtml: string) {
    const stored = toStorageHtml(editorHtml);
    if (stored.length > MAX_STORED_HTML) {
      emitError('This note is too long to save. Split it into two notes.');
      return;
    }
    onUpdateContentRef.current(stored);
  }

  function scheduleSave(editorHtml: string) {
    clearTimeout(saveTimeout.current);
    pendingContentRef.current = toStorageHtml(editorHtml);
    saveTimeout.current = setTimeout(() => {
      pendingContentRef.current = null;
      persistBody(editorHtml);
    }, 500);
  }

  function saveNow(editorHtml: string) {
    clearTimeout(saveTimeout.current);
    pendingContentRef.current = null;
    persistBody(editorHtml);
  }

  function suppressNextRecord() {
    suppressRecordRef.current = true;
    clearTimeout(suppressTimer.current);
    // A toggle that changes nothing emits no event — don't let the flag
    // linger and swallow a real keystroke's history entry.
    suppressTimer.current = setTimeout(() => {
      suppressRecordRef.current = false;
    }, 400);
  }

  // True while a programmatic setValue is being applied. The editor emits
  // SEVERAL change events for one setValue, including a half-built one
  // (text in, list styles not yet applied — seen on device). Recording that
  // one as the "before" state corrupted undo, and saving it would flatten
  // lists, so every event in the window is ignored; settleBody() then reads
  // the editor's settled HTML once.
  const applyingRef = useRef(false);
  const applyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Replace the whole body programmatically and park the caret. */
  function setBody(nextHtml: string, caret: number) {
    htmlRef.current = nextHtml;
    textRef.current = htmlToEditorText(nextHtml);
    lastNormRef.current = normalize(nextHtml);
    applyingRef.current = true;
    clearTimeout(applyTimer.current);
    editorRef.current?.setValue(nextHtml);
    editorRef.current?.setSelection(caret, caret);
    selRef.current = { start: caret, end: caret };
    saveNow(nextHtml);
    refreshChips();
    const expected = textRef.current;
    applyTimer.current = setTimeout(() => void settleBody(expected), 300);
  }

  async function settleBody(expected: string) {
    let html: string | undefined;
    try {
      html = await editorRef.current?.getHTML();
    } catch {
      html = undefined;
    }
    applyingRef.current = false;
    if (!html) return;
    const text = htmlToEditorText(html);
    lastNormRef.current = normalize(html);
    // The editor drops a trailing empty line when serializing; that's not an edit.
    const trimEnd = (t: string) => t.replace(/\n+$/, '');
    if (trimEnd(text) === trimEnd(expected)) {
      htmlRef.current = html;
      textRef.current = text;
      return;
    }
    // Typing landed inside the window: keep it as a normal edit.
    const prev = snapshot();
    history.record(prev, { title: prev.title, content: html, text });
    notifyHistory();
    htmlRef.current = html;
    textRef.current = text;
    scheduleSave(html);
    refreshChips();
  }

  // --- caret follow -----------------------------------------------------------

  // When the caret is at the end of the note, the editor's bottom edge is
  // where the caret is, so the page scrolls to keep that edge above the
  // keyboard. "At the end" must mean NOTHING but whitespace follows the
  // caret: a character-count slack wrongly matched a caret with a photo
  // after it (a photo is 1 char but hundreds of px tall) and scrolled the
  // page to the bottom of the photo. iOS also reports the new caret BEFORE
  // the new text (e.g. accepting a keyboard suggestion), so a caret past the
  // stale text's end counts as at the end too.
  function reportCaretIfAtEnd() {
    if (!onCaretBottom) return;
    if (/\S/.test(textRef.current.slice(selRef.current.end))) return;
    editorRef.current?.measureInWindow((_x, y, _w, h) => onCaretBottom(y + h));
  }

  // --- suggestion strip -------------------------------------------------------

  // While the TITLE input has focus the body's selection/content don't
  // change, so without this gate the strip would keep showing stale body
  // chips — and a tap would splice text into the body and yank focus away
  // from the title mid-word.
  const titleFocusedRef = useRef(false);
  const [, setTitleFocused] = useState(false);
  // Pre-apply text of the last accepted chip (same-frame double-tap guard).
  const lastApplyTextRef = useRef<string | null>(null);

  function mediaAt(caret: number): MediaChip | null {
    const text = textRef.current;
    const at = text[caret - 1] === IMAGE_CHAR ? caret - 1 : text[caret] === IMAGE_CHAR ? caret : -1;
    if (at < 0) return null;
    let index = 0;
    for (let i = 0; i < at; i++) if (text[i] === IMAGE_CHAR) index++;
    const src = imageSources(htmlRef.current)[index];
    const name = src ? nameFromSrc(src) : null;
    if (!name) return null;
    return { name, kind: isVideoPoster(name) ? 'video' : 'photo' };
  }

  function refreshChips() {
    lastApplyTextRef.current = null;
    const { start, end } = selRef.current;
    if (start !== end || titleFocusedRef.current) {
      onSuggestions?.([]);
      onMediaChip?.(null);
      return;
    }
    const text = textRef.current;
    onSuggestions?.(getSuggestions(text.slice(0, start), tags, text[start]));
    onMediaChip?.(mediaAt(start));
  }

  // Tags can change while the caret sits still (a new tag created).
  useEffect(() => {
    refreshChips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags]);

  function handleApplySuggestion(suggestion: Suggestion) {
    const { start, end } = selRef.current;
    if (start !== end || titleFocusedRef.current) return;
    const text = textRef.current;
    if (lastApplyTextRef.current === text) return; // same-frame double-tap
    const result = applySuggestionToText(text, start, suggestion);
    if (!result) return; // stale tap racing a keystroke — safe no-op
    // Reduce the text change to one splice and apply it to the HTML.
    let a = 0;
    while (a < text.length && a < result.content.length && text[a] === result.content[a]) a++;
    let b = 0;
    while (
      b < text.length - a &&
      b < result.content.length - a &&
      text[text.length - 1 - b] === result.content[result.content.length - 1 - b]
    ) {
      b++;
    }
    const nextHtml = replaceEditorRange(htmlRef.current, a, text.length - b, result.content.slice(a, result.content.length - b));
    if (!nextHtml) return;
    lastApplyTextRef.current = text;
    history.recordAction(snapshot());
    notifyHistory();
    setBody(nextHtml, result.caret);
    // An accepted chip is a deliberate use — reinforce it.
    if (suggestion.kind === 'word') learnWord(suggestion.display);
    editorRef.current?.focus();
  }

  // --- editor events ------------------------------------------------------------

  function handleChangeHtml(html: string) {
    if (applyingRef.current) return;
    const text = htmlToEditorText(html);
    const norm = normalize(html);
    if (!baselinedRef.current) {
      baselinedRef.current = true;
      if (text === textRef.current) {
        htmlRef.current = html;
        lastNormRef.current = norm;
        return;
      }
    }
    if (norm === lastNormRef.current) return;
    lastNormRef.current = norm;
    const prev = snapshot();
    const next: UndoSnapshot = { title: prev.title, content: html, text };
    if (suppressRecordRef.current) {
      suppressRecordRef.current = false;
    } else {
      history.record(prev, next);
      notifyHistory();
      // Feed the personal-vocabulary model whenever this edit committed a
      // word boundary (separator keystroke, autocorrect replacement, paste).
      learnFromEdit(prev.text ?? '', text);
    }
    htmlRef.current = html;
    textRef.current = text;
    scheduleSave(html);
    refreshChips();
    reportCaretIfAtEnd();
  }

  // Reported selections count the editor's hidden placeholder chars;
  // convert them to the editor-text model (lib/note-html hiddenCharOffsets).
  const hiddenRef = useRef<{ html: string; offsets: number[] }>({ html: '', offsets: [] });
  function handleSelection(reportedStart: number, reportedEnd: number) {
    // Our own setValue jumps the native caret to the END of the note before
    // setBody puts it back. Following that event scrolled the page to the
    // bottom of the note on every accepted suggestion chip; setBody already
    // set selRef, so ignore selection events while it applies.
    if (applyingRef.current) return;
    if (hiddenRef.current.html !== htmlRef.current) {
      hiddenRef.current = { html: htmlRef.current, offsets: hiddenCharOffsets(htmlRef.current) };
    }
    const hidden = hiddenRef.current.offsets;
    const start = selectionToEditorOffset(reportedStart, hidden);
    const end = selectionToEditorOffset(reportedEnd, hidden);
    selRef.current = { start, end };
    refreshChips();
    reportCaretIfAtEnd();
  }

  const formatRef = useRef<FormatState>(NO_FORMAT);
  function handleState(e: NativeSyntheticEvent<OnChangeStateEvent>) {
    const s = e.nativeEvent;
    const next: FormatState = {
      bold: s.bold.isActive,
      italic: s.italic.isActive,
      strike: s.strikeThrough.isActive,
      heading: s.h2.isActive,
      bullets: s.unorderedList.isActive,
      numbers: s.orderedList.isActive,
    };
    const prev = formatRef.current;
    if ((Object.keys(next) as (keyof FormatState)[]).every((k) => prev[k] === next[k])) return;
    formatRef.current = next;
    onFormatState?.(next);
  }

  // One formatting tap = one undo step.
  function format(toggle: (e: EnrichedTextInputInstance) => void) {
    const editor = editorRef.current;
    if (!editor) return;
    history.recordAction(snapshot());
    notifyHistory();
    suppressNextRecord();
    toggle(editor);
    editor.focus();
  }

  // --- undo / redo ------------------------------------------------------------

  // Restore a history snapshot: swap the fields, move the caret to the edge
  // of the restored region, and persist immediately — an undo/redo is an
  // explicit action, so it shouldn't sit in the debounce window where a
  // pending autosave could race it.
  function applySnapshot(snap: UndoSnapshot) {
    clearTimeout(titleSaveTimeout.current);
    pendingTitleRef.current = null;
    if (snap.title !== titleValueRef.current) {
      setTitle(snap.title);
      titleValueRef.current = snap.title;
      onUpdateTitle(snap.title);
    }
    if (snap.content !== htmlRef.current) {
      const restoredText = snap.text ?? htmlToEditorText(snap.content);
      setBody(snap.content, caretAfterRestore(textRef.current, restoredText));
    }
    notifyHistory();
  }

  function handleUndo() {
    const snap = history.undo(snapshot());
    if (snap) applySnapshot(snap);
    // A null result still mutates the stacks (snapshots identical to the
    // live state are popped and discarded) — keep the buttons honest.
    else notifyHistory();
  }

  function handleRedo() {
    const snap = history.redo(snapshot());
    if (snap) applySnapshot(snap);
    else notifyHistory();
  }

  function handleTitleChange(text: string) {
    history.record(snapshot(), { title: text, content: htmlRef.current, text: textRef.current });
    notifyHistory();
    setTitle(text);
    titleValueRef.current = text;
    clearTimeout(titleSaveTimeout.current);
    pendingTitleRef.current = text;
    titleSaveTimeout.current = setTimeout(() => {
      pendingTitleRef.current = null;
      onUpdateTitle(text);
    }, 500);
  }

  // --- photos & videos ----------------------------------------------------------

  const importingRef = useRef(false);
  async function insertMedia(items: { uri: string; type: 'photo' | 'video'; mime?: string }[]) {
    if (!uid || items.length === 0 || importingRef.current) return;
    importingRef.current = true;
    onImportingChange?.(true);
    let html = htmlRef.current;
    let caret = selRef.current.end;
    const before = snapshot();
    let added = 0;
    try {
      for (const item of items) {
        try {
          const stored = item.type === 'video' ? await importVideo(uid, item.uri) : await importPhoto(uid, item.uri, item.mime);
          // After the first item, insert at the END of the previous image's
          // line (caret - 1) so a batch stays together even when the line
          // after it is a list item (which would push the next one below
          // the whole list).
          const at = added > 0 ? caret - 1 : caret;
          const r = insertImageBlock(html, at, editorImageTag(uid, stored, imageMaxWidth));
          html = r.html;
          caret = r.caret;
          added++;
        } catch (e) {
          console.error('[note-editor] media import failed', e);
          emitError(item.type === 'video' ? "Couldn't add that video." : "Couldn't add that photo.");
        }
      }
      if (added > 0) {
        history.recordAction(before);
        notifyHistory();
        setBody(html, caret);
      }
    } finally {
      importingRef.current = false;
      onImportingChange?.(false);
      editorRef.current?.focus();
    }
  }

  async function handleAddMedia() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      orderedSelection: true,
      quality: 1,
    });
    if (result.canceled) {
      editorRef.current?.focus();
      return;
    }
    await insertMedia(
      result.assets.map((a) => ({
        uri: a.uri,
        type: a.type === 'video' ? 'video' : 'photo',
        mime: a.mimeType ?? undefined,
      })),
    );
  }

  useImperativeHandle(ref, () => ({
    applyStrikethrough: () => format((e) => e.toggleStrikeThrough()),
    applyBullets: () => format((e) => e.toggleUnorderedList()),
    applyNumberedList: () => format((e) => e.toggleOrderedList()),
    applyBold: () => format((e) => e.toggleBold()),
    applyItalic: () => format((e) => e.toggleItalic()),
    applyHeading: () => format((e) => e.toggleH2()),
    addMedia: () => void handleAddMedia(),
    undo: handleUndo,
    redo: handleRedo,
    blur: () => editorRef.current?.blur(),
    getLatestContent: () => toStorageHtml(htmlRef.current),
    getLatestText: () => textRef.current,
    getLatestTitle: () => titleValueRef.current,
    getSelection: () => selRef.current,
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

  const htmlStyle = useMemo(
    () => ({
      h2: { fontSize: 22, bold: true },
      h1: { fontSize: 26, bold: true },
      h3: { fontSize: 19, bold: true },
      ul: { bulletColor: colors.text, bulletSize: 6, marginLeft: 8, gapWidth: 12 },
      ol: { markerColor: colors.text, marginLeft: 8, gapWidth: 10 },
      ulCheckbox: { boxColor: colors.tint, marginLeft: 8, gapWidth: 10 },
      blockquote: { borderColor: colors.tint, borderWidth: 3, gapWidth: 12, color: colors.text },
      codeblock: { color: colors.text, backgroundColor: colors.tileBackground, borderRadius: 8 },
      code: { color: colors.text, backgroundColor: colors.tileBackground },
      a: { color: colors.tint, textDecorationLine: 'underline' as const },
    }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.titleInput, { color: colors.text }]}
        value={title}
        onChangeText={handleTitleChange}
        maxLength={500}
        placeholder="Note title..."
        placeholderTextColor={colors.icon}
        keyboardAppearance={colorScheme === 'dark' ? 'dark' : 'light'}
        onFocus={() => {
          titleFocusedRef.current = true;
          setTitleFocused(true);
          refreshChips();
          // The body's styles don't apply to the title — unlight the toggles.
          formatRef.current = NO_FORMAT;
          onFormatState?.(NO_FORMAT);
          onFocus?.();
        }}
        onBlur={() => {
          titleFocusedRef.current = false;
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
      <View onLayout={reportCaretIfAtEnd}>
        <EnrichedTextInput
          key={note.id}
          ref={editorRef}
          defaultValue={initialHtml}
          style={{ ...styles.contentInput, color: colors.text }}
          htmlStyle={htmlStyle}
          placeholder="Start writing..."
          placeholderTextColor={colors.icon}
          selectionColor={colors.tint}
          cursorColor={colors.tint}
          scrollEnabled={false}
          autoFocus={isNew}
          onFocus={() => {
            refreshChips();
            onFocus?.();
          }}
          onBlur={() => onBlur?.()}
          onTouchStart={onTouchStart}
          onChangeHtml={(e) => handleChangeHtml(e.nativeEvent.value)}
          onChangeSelection={(e) => handleSelection(e.nativeEvent.start, e.nativeEvent.end)}
          onChangeState={handleState}
          onPasteImages={(e) =>
            void insertMedia(e.nativeEvent.images.map((img) => ({ uri: img.uri, type: 'photo' as const, mime: img.type })))
          }
        />
      </View>
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
    fontSize: 16,
    lineHeight: 28,
    paddingHorizontal: BODY_PAD_H,
    paddingVertical: 12,
    minHeight: 200,
  },
});
