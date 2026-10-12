import {
  htmlToDisplayLines,
  htmlToPlainText,
  plainToHtml,
} from '@/lib/note-html';
import type { Note } from '@/types/note';

/**
 * Format-aware readers for a note's body. Every consumer that shows,
 * searches, or exports `note.content` goes through these instead of reading
 * the raw field: rich notes store HTML, older notes store a plain string
 * (see Note.format).
 */

export function isRichNote(note: Pick<Note, 'format'>): boolean {
  return note.format === 'html';
}

/** The body as editor HTML (legacy plain strings are converted). */
export function noteBodyHtml(note: Pick<Note, 'content' | 'format'>): string {
  return isRichNote(note) ? note.content : plainToHtml(note.content);
}

// Previews and search re-read every visible note on each list render, so
// cache the HTML walk per content string. Bounded: oldest entries evict.
const CACHE_MAX = 500;
const plainCache = new Map<string, string>();
const linesCache = new Map<string, string[]>();

function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, value);
  return value;
}

/** Plain text of the body: one line per paragraph, photos dropped. */
export function notePlainText(note: Pick<Note, 'content' | 'format'>): string {
  if (!isRichNote(note)) return note.content;
  return plainCache.get(note.content) ?? remember(plainCache, note.content, htmlToPlainText(note.content));
}

/** Lines as the reader sees them (list items keep their marker). */
export function noteDisplayLines(note: Pick<Note, 'content' | 'format'>): string[] {
  if (!isRichNote(note)) return note.content.split('\n');
  return linesCache.get(note.content) ?? remember(linesCache, note.content, htmlToDisplayLines(note.content));
}
