import type { Note, Tag } from '@/types/note';

export function noteToMarkdown(note: Note, tags: Tag[]): string {
  const noteTagIds = [...new Set(note.tags.map((t) => t.tagId))];
  const noteTagNames = noteTagIds
    .map((id) => tags.find((t) => t.id === id)?.name)
    .filter(Boolean);

  const frontmatter = [
    '---',
    `title: "${note.title.replace(/"/g, '\\"')}"`,
    `tags: [${noteTagNames.map((n) => `"${n}"`).join(', ')}]`,
    `created: ${new Date(note.createdAt).toISOString()}`,
    `updated: ${new Date(note.updatedAt).toISOString()}`,
    '---',
    '',
  ].join('\n');

  return frontmatter + note.content;
}

export function noteToFilename(note: Note): string {
  const sanitized = (note.title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `${sanitized}.md`;
}

export function allNotesToMarkdown(notes: Note[], tags: Tag[]): { filename: string; content: string }[] {
  return notes.map((note) => ({
    filename: noteToFilename(note),
    content: noteToMarkdown(note, tags),
  }));
}
