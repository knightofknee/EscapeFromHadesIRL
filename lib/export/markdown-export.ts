import { formatChecklistAsText } from '@/lib/checklist-format';
import type { ChecklistItem, Note, Tag } from '@/types/note';

/** Escape a string for a double-quoted YAML scalar: backslashes first, then
 * quotes, then literal newlines (a raw newline breaks the frontmatter line). */
function yamlEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function noteToMarkdown(note: Note, tags: Tag[], items?: ChecklistItem[]): string {
  const noteTagIds = [...new Set(note.tags.map((t) => t.tagId))];
  const noteTagNames = noteTagIds
    .map((id) => tags.find((t) => t.id === id)?.name)
    .filter(Boolean);

  const frontmatter = [
    '---',
    `title: "${yamlEscape(note.title)}"`,
    `tags: [${noteTagNames.map((n) => `"${yamlEscape(n ?? '')}"`).join(', ')}]`,
    `created: ${new Date(note.createdAt).toISOString()}`,
    `updated: ${new Date(note.updatedAt).toISOString()}`,
    '---',
    '',
  ].join('\n');

  // Checklist notes keep `content` as a stale snapshot from the last
  // text→checklist toggle — the live data is `description` + the items
  // subcollection (passed in by the export flow). Unmigrated notes fall
  // back to the legacy embedded array.
  const body =
    note.type === 'checklist'
      ? formatChecklistAsText(note.description ?? '', items ?? note.checklist ?? [])
      : note.content;
  return frontmatter + body;
}

function noteToFilename(note: Note): string {
  const sanitized = (note.title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `${sanitized}.md`;
}

export function allNotesToMarkdown(
  notes: Note[],
  tags: Tag[],
  /** Live subcollection items per checklist note id (see noteToMarkdown). */
  checklistItems?: Map<string, ChecklistItem[]>,
): { filename: string; content: string }[] {
  const usedNames = new Map<string, number>();
  return notes.map((note) => {
    let filename = noteToFilename(note);
    const base = filename.replace(/\.md$/, '');
    const count = usedNames.get(base) ?? 0;
    usedNames.set(base, count + 1);
    if (count > 0) {
      filename = `${base}-${count}.md`;
    }
    return {
      filename,
      content: noteToMarkdown(note, tags, checklistItems?.get(note.id)),
    };
  });
}
