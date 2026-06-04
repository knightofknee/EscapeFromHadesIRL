export type Tag = {
  id: string;
  userId: string;
  name: string;
  color?: string;
  createdAt: number;
};

export type InlineTag = {
  tagId: string;
  startIndex: number;
  endIndex: number;
};

export type ChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
  /** Timestamp set when the item was last marked complete; used to sort
   *  the completed group (most-recently-completed at the top). Cleared
   *  when toggled back to incomplete. */
  completedAt?: number;
};

/**
 * The per-item document stored at `notes/{noteId}/items/{itemId}` — the
 * "ideal" data model that replaces the single `Note.checklist` array.
 * Each toggle/edit/add/delete is now one small per-item write instead of
 * a full-array rewrite (see hooks/use-checklist-items.ts).
 *
 * `userId` mirrors the parent note's owner so the security rule can scope
 * items without a `get()` of the parent. `order` is the canonical sort
 * key for the *uncompleted* group (the array index used to be implicit
 * ordering); the completed group still sorts by `completedAt` desc.
 */
export type ChecklistItemDoc = {
  id: string;
  userId: string;
  text: string;
  completed: boolean;
  completedAt?: number;
  order: number;
  createdAt: number;
};

/**
 * Denormalized rollup kept on the note doc so the notes LIST can render a
 * checklist preview ("first task" / "✓" / progress) without reading every
 * note's items subcollection. Maintained client-side on each item
 * mutation. Notes migrated before this field existed fall back to the
 * legacy `checklist` array in the list item (see note-list-item.tsx).
 */
export type ChecklistSummary = {
  /** Count of items with non-empty (trimmed) text. */
  total: number;
  /** Count of completed items with non-empty text. */
  completed: number;
  /** Text of the first uncompleted item (display order), '' if none. */
  firstUncompleted: string;
};

export type NoteType = 'text' | 'checklist';

export type Note = {
  id: string;
  userId: string;
  title: string;
  /** Raw markdown when `type === 'text'`. When `type === 'checklist'`,
   *  this still exists but is treated as a fallback / archive — the
   *  active fields are `description` and `checklist`. */
  content: string;
  tags: InlineTag[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  hasBeenPinned?: boolean;
  /** Defaults to 'text' for any pre-existing note (field is missing). */
  type?: NoteType;
  /** Free-text body shown above the checklist when `type === 'checklist'`. */
  description?: string;
  /**
   * LEGACY checklist storage. Source of truth ONLY for notes that predate
   * the items-subcollection migration and haven't been opened since. Once
   * `itemsMigrated` is true this is cleared and items live in
   * `notes/{id}/items`. Read it solely as a migration source / list-item
   * fallback — never write it as the live list.
   */
  checklist?: ChecklistItem[];
  /** True once the legacy `checklist` array has been moved into the
   *  `items` subcollection (or the note was created in the new model).
   *  Gates the one-time lazy migration in use-checklist-items.ts. */
  itemsMigrated?: boolean;
  /** Denormalized checklist rollup for the notes-list preview. */
  checklistSummary?: ChecklistSummary;
};
