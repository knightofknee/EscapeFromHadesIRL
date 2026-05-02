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
  /** Active list when `type === 'checklist'`. Order in the array =
   *  creation order; completion state is per-item. UI handles sort. */
  checklist?: ChecklistItem[];
};
