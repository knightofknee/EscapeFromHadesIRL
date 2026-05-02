import type { ChecklistItem } from '@/types/note';

/**
 * Format a checklist back to plain markdown text. Used when toggling a
 * checklist note → text mode. Output is round-trip parseable by
 * `parseChecklistFromText` below, so an untouched dump can be cleanly
 * rebuilt into the same items with the same checked states.
 *
 * Format: description (if any) on top, blank line, then items in
 *   `- [ ] X` / `- [x] X` markdown style.
 *
 *   Sorting at dump time follows the on-screen order (uncompleted first
 *   in creation order, then completed), so the round-trip preserves
 *   that ordering too.
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
 * Match a single markdown checkbox line. Captures: "x"/" " for state,
 * the item text. Case-insensitive on `x` so external markdown (e.g.
 * GitHub-flavored using uppercase X) parses correctly too.
 */
const CHECKLIST_LINE_RE = /^- \[([ xX])\] (.*)$/;

export type ParsedChecklist = {
  /** Description = text content above the checklist block, trimmed. */
  description: string;
  /** Parsed items in the order they appeared in the source text. */
  items: ChecklistItem[];
};

/**
 * Parse a text content string into description + checklist items.
 *
 * Rule: scan from the BOTTOM of the text. Take a contiguous run of
 * markdown checkbox lines. Stop at the first non-matching line.
 * Everything above (trimmed) becomes the description. If the scan
 * finds no items, the entire text becomes the description and items
 * is an empty array.
 *
 * The "scan from the bottom" rule is what makes the round-trip work:
 * `formatChecklistAsText` always puts items at the end, so a clean
 * dump → parse cycle restores the original structure exactly.
 *
 * @param genId  caller-supplied id generator so the parser stays pure
 *               (no random imports). Default uses Math.random.
 */
export function parseChecklistFromText(
  text: string,
  genId: () => string = defaultId,
): ParsedChecklist {
  if (!text || text.length === 0) {
    return { description: '', items: [] };
  }

  const lines = text.split('\n');
  // Walk backwards collecting matching lines. Stop at the first line
  // that doesn't match, but skip pure-whitespace trailing lines first
  // (so a trailing newline doesn't break parsing).
  let lastNonEmpty = lines.length - 1;
  while (lastNonEmpty >= 0 && lines[lastNonEmpty].trim() === '') {
    lastNonEmpty--;
  }
  if (lastNonEmpty < 0) return { description: '', items: [] };

  // Scan backwards to find the trailing checkbox block; then assign IDs
  // in display order (top-to-bottom) so id-1 is the first item.
  const matchedReversed: { text: string; completed: boolean }[] = [];
  let firstMatchIndex = lastNonEmpty + 1; // exclusive
  for (let i = lastNonEmpty; i >= 0; i--) {
    const m = lines[i].match(CHECKLIST_LINE_RE);
    if (!m) break;
    matchedReversed.push({
      text: m[2],
      completed: m[1].toLowerCase() === 'x',
    });
    firstMatchIndex = i;
  }

  if (matchedReversed.length === 0) {
    // No trailing checklist block — the whole thing is description.
    return { description: text.trim(), items: [] };
  }

  // Items in original (top-to-bottom) order. IDs assigned now so they
  // align with display order.
  const items: ChecklistItem[] = matchedReversed
    .reverse()
    .map((m) => ({ id: genId(), text: m.text, completed: m.completed }));
  // Description = everything before the matched block, trimmed.
  // Strip a single trailing blank line separator if present.
  const descLines = lines.slice(0, firstMatchIndex);
  while (descLines.length > 0 && descLines[descLines.length - 1].trim() === '') {
    descLines.pop();
  }
  return { description: descLines.join('\n').trim(), items };
}

function defaultId(): string {
  // Sufficient for client-side checklist item identity. Not a security
  // boundary; collisions are vanishingly unlikely within a single note.
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
