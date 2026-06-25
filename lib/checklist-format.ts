import type { ChecklistItem } from '@/types/note';

/**
 * Format a checklist back to plain markdown text. Used when toggling a
 * checklist note → text mode (and by the markdown export). Items dump as
 * `- [ ] X` / `- [x] X`, which `parseChecklistFromText` reads straight
 * back into the same items with the same checked states — so a
 * checklist→text→checklist round trip restores the list.
 *
 * Format: description (if any) on top, blank line, then items in
 *   `- [ ] X` / `- [x] X` markdown style.
 *
 *   Sorting at dump time follows the on-screen order (uncompleted first
 *   in creation order, then completed), so the round-trip preserves
 *   that ordering too. (A leading description, being plain lines, comes
 *   back as leading items on re-parse rather than as a description.)
 */
export function formatChecklistAsText(
  description: string,
  items: ChecklistItem[],
): string {
  const lines: string[] = [];
  const desc = description?.trim() ?? '';
  if (desc.length > 0) {
    lines.push(desc);
  }
  if (items.length > 0) {
    if (desc.length > 0) lines.push(''); // blank line separator
    for (const item of items) {
      const box = item.completed ? '[x]' : '[ ]';
      lines.push(`- ${box} ${item.text}`);
    }
  }
  return lines.join('\n');
}

/**
 * Match a markdown checkbox line, tolerant of how both the dump and
 * humans actually write them: an optional leading bullet (`-`, `*`, `•`),
 * any spacing, and `[ ]` / `[]` / `[x]` / `[X]`. Captures the `x`/`X`
 * (undefined when unchecked) and the trailing item text.
 *   matches: "- [ ] buy milk", "- [x] done", "-[] terse", "[ ] no dash"
 */
const CHECKBOX_LINE_RE = /^\s*[-*•]?\s*\[\s*([xX])?\s*\]\s?(.*)$/;
// A plain bullet line (no checkbox), e.g. "- milk" / "* milk" / "• milk".
const BULLET_MARKER_RE = /^[-*•]\s+(.*)$/;
// A numbered line, e.g. "1. milk" / "2) milk".
const NUMBER_MARKER_RE = /^\d+[.)]\s+(.*)$/;

type ParsedChecklist = {
  /** Text NOT turned into items — kept as the checklist's description. */
  description: string;
  /** Parsed items in source order. */
  items: ChecklistItem[];
};

/** A character range (TextInput selection offsets) into the note content. */
export type TextRange = { start: number; end: number };

/**
 * Parse note text into checklist items + a leftover description, for the
 * "Create Checklist" toggle. Two modes — the user is in control of which:
 *
 * SELECTION MODE (a non-empty `selection` is passed — the user highlighted
 * lines before tapping): ONLY the highlighted lines become items. The
 * selection is expanded to whole lines; blank lines in it are skipped; a
 * checkbox line keeps its checked state, any other line becomes an
 * unchecked item with its bullet/number marker stripped. Everything OUTSIDE
 * the highlight is preserved verbatim as the description. This is the
 * deliberate, non-heavy-handed path: write a description, highlight the
 * part that's a list, convert just that.
 *
 * NO-SELECTION MODE (no/empty `selection`): only lines already written as
 * checkboxes (`- [ ]` / `- [x]`) become items; all other prose stays as the
 * description. This is the revert path — "Undo Checklist" dumps items as
 * `- [ ]` lines (see formatChecklistAsText), so re-tapping Create Checklist
 * restores them without needing a highlight, while a plain note is NOT
 * sloppily turned into items.
 *
 * @param genId      caller-supplied id generator so the parser stays pure.
 * @param selection  the editor's current selection; only its line span
 *                   matters. Omitted or collapsed (start === end) → no-sel.
 */
export function parseChecklistFromText(
  text: string,
  genId: () => string = defaultId,
  selection?: TextRange,
): ParsedChecklist {
  if (!text) return { description: '', items: [] };

  const lines = text.split('\n');
  const range =
    selection && selection.end > selection.start
      ? selectedLineRange(lines, selection)
      : null;

  const items: ChecklistItem[] = [];
  const descLines: string[] = [];

  lines.forEach((rawLine, i) => {
    if (range) {
      // SELECTION MODE: highlighted lines → items, the rest → description.
      if (i >= range.first && i <= range.last) {
        const item = lineToItem(rawLine, genId);
        if (item) items.push(item); // blank lines in the selection are skipped
      } else {
        descLines.push(rawLine);
      }
      return;
    }
    // NO-SELECTION MODE: only checkbox lines → items, the rest → description.
    const checkbox = parseCheckboxLine(rawLine);
    if (checkbox) {
      if (checkbox.text.length > 0) {
        items.push({ id: genId(), text: checkbox.text, completed: checkbox.completed });
      }
      // an empty checkbox carries nothing — drop it from both
    } else {
      descLines.push(rawLine);
    }
  });

  return { description: descLines.join('\n').trim(), items };
}

/** Parse a checkbox line → {text, completed}, or null if it isn't one. */
function parseCheckboxLine(rawLine: string): { text: string; completed: boolean } | null {
  const m = rawLine.trim().match(CHECKBOX_LINE_RE);
  if (!m) return null;
  return { text: m[2].trim(), completed: !!m[1] };
}

/** A highlighted line → an item. Checkbox lines keep their state; other
 *  lines become unchecked items (bullet/number marker stripped). Blank
 *  lines yield null so they're skipped. */
function lineToItem(rawLine: string, genId: () => string): ChecklistItem | null {
  const checkbox = parseCheckboxLine(rawLine);
  if (checkbox) {
    if (checkbox.text.length === 0) return null;
    return { id: genId(), text: checkbox.text, completed: checkbox.completed };
  }
  const text = stripLineMarker(rawLine.trim());
  if (text.length === 0) return null;
  return { id: genId(), text, completed: false };
}

/** Map a character selection to the inclusive [first,last] line indices it
 *  covers, expanded to whole lines. Returns null if the selection touches no
 *  line's content (degenerate — caller falls back to no-selection mode).
 *  A line counts as selected when the selection overlaps its span; `end >
 *  lineStart` is strict so a selection ending exactly at a line's first char
 *  doesn't pull that whole line in. */
function selectedLineRange(
  lines: string[],
  selection: TextRange,
): { first: number; last: number } | null {
  let first = -1;
  let last = -1;
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineStart = pos;
    const lineEnd = pos + lines[i].length; // position of this line's '\n'
    if (selection.start <= lineEnd && selection.end > lineStart) {
      if (first === -1) first = i;
      last = i;
    }
    pos = lineEnd + 1; // + 1 for the '\n'
  }
  return first === -1 ? null : { first, last };
}

/** Strip a leading bullet/number list marker so "- milk" / "1. milk"
 *  convert to the item text "milk". Non-list lines pass through. */
function stripLineMarker(line: string): string {
  const bullet = line.match(BULLET_MARKER_RE);
  if (bullet) return bullet[1].trim();
  const numbered = line.match(NUMBER_MARKER_RE);
  if (numbered) return numbered[1].trim();
  return line;
}

function defaultId(): string {
  // Sufficient for client-side checklist item identity. Not a security
  // boundary; collisions are vanishingly unlikely within a single note.
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
