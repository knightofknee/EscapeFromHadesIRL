// Pure (Firestore-free) mapping + rollup helpers for the checklist items
// subcollection. Kept separate from lib/firebase/checklist-items.ts — which
// owns the actual reads/writes — so the data-shape logic that the migration
// depends on can be unit-tested without booting the Firebase SDK.
import type {
  ChecklistItem,
  ChecklistItemDoc,
  ChecklistSummary,
} from '@/types/note';

/** The persisted body of an item doc (the synthetic `id` is the doc id and
 *  is NOT stored inside; `completedAt` is omitted when absent because
 *  Firestore rejects `undefined`). */
export type ItemDocData = {
  userId: string;
  text: string;
  completed: boolean;
  completedAt?: number;
  order: number;
  createdAt: number;
};

/** Client-side item identity. Not a security boundary; collisions are
 *  vanishingly unlikely within a single note. Matches the old editor id
 *  scheme so migrated ids and freshly-created ids look alike. */
export function makeItemId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Map a legacy array `ChecklistItem` (or a freshly parsed one) to the
 * subcollection doc shape. `order = index` preserves the array's implicit
 * ordering exactly — the canonical uncompleted order used to BE the array
 * order, so the on-screen result is unchanged after migration.
 */
export function toItemDoc(
  item: ChecklistItem,
  index: number,
  userId: string,
  now: number,
): ChecklistItemDoc {
  const out: ChecklistItemDoc = {
    id: item.id,
    userId,
    text: item.text ?? '',
    completed: !!item.completed,
    order: index,
    createdAt: now,
  };
  if (typeof item.completedAt === 'number') out.completedAt = item.completedAt;
  return out;
}

/** Reconstruct an item from its Firestore snapshot (doc id IS the item id;
 *  it is not duplicated in the doc body). Defensive coercion so a stray
 *  field can't crash the editor. */
export function fromSnapshot(
  id: string,
  data: Record<string, unknown>,
): ChecklistItemDoc {
  const out: ChecklistItemDoc = {
    id,
    userId: typeof data.userId === 'string' ? data.userId : '',
    text: typeof data.text === 'string' ? data.text : '',
    completed: !!data.completed,
    order: typeof data.order === 'number' ? data.order : 0,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
  };
  if (typeof data.completedAt === 'number') out.completedAt = data.completedAt;
  return out;
}

/** Doc payload for a write — strips the synthetic `id` (it's the doc id)
 *  and omits an undefined `completedAt` (Firestore rejects undefined). */
export function serializeItem(item: ChecklistItemDoc): ItemDocData {
  const payload: ItemDocData = {
    userId: item.userId,
    text: item.text,
    completed: item.completed,
    order: item.order,
    createdAt: item.createdAt,
  };
  if (typeof item.completedAt === 'number') payload.completedAt = item.completedAt;
  return payload;
}

/**
 * Compute the denormalized list-preview rollup. Mirrors the per-item logic
 * that note-list-item.tsx used to run over the full array: only items with
 * non-empty text count, and `firstUncompleted` is the first uncompleted
 * item in DISPLAY order (uncompleted sorted by `order`). Accepts items in
 * any order — it sorts internally.
 */
export function summaryOf(items: ChecklistItemDoc[]): ChecklistSummary {
  const withText = items.filter((i) => i.text.trim().length > 0);
  const firstUncompleted = withText
    .filter((i) => !i.completed)
    .sort((a, b) => a.order - b.order)[0];
  return {
    total: withText.length,
    completed: withText.filter((i) => i.completed).length,
    firstUncompleted: (firstUncompleted?.text ?? '').slice(0, 100),
  };
}
