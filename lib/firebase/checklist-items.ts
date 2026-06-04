// Firestore I/O for the per-item checklist subcollection
// (`notes/{noteId}/items/{itemId}`). This is the storage layer behind the
// "ideal" checklist data model — see types/note.ts (ChecklistItemDoc) and
// hooks/use-checklist-items.ts (the live listener + mutations). The pure
// data-shape helpers live in lib/checklist-item-doc.ts (re-exported here
// for convenience) so they can be tested without the Firebase SDK.
//
// Why a subcollection: a checklist edit used to rewrite the whole
// `Note.checklist` array, so a 100-item list re-uploaded all 100 items on
// every checkbox tap. Here each item is its own doc, so a toggle is a
// single small write.
import {
  db,
  collection,
  doc,
  query,
  where,
  setDoc,
  getDocs,
  writeBatch,
  deleteField,
} from './firestore';
import type { ChecklistItemDoc, ChecklistSummary } from '@/types/note';
import { serializeItem, summaryOf } from '@/lib/checklist-item-doc';

export {
  makeItemId,
  toItemDoc,
  fromSnapshot,
  serializeItem,
  summaryOf,
} from '@/lib/checklist-item-doc';

// ---------- references ----------

export function itemsCollection(noteId: string) {
  return collection(db, 'notes', noteId, 'items');
}

// Items are read via this filtered query — NOT the bare collection.
// Firestore rules are filters: the items rule scopes on `userId`, so a
// LIST/listen without `where('userId','==',uid)` is denied (same contract
// as every top-level collection in this app). All items under a note share
// the owner's uid, so this returns the whole subcollection.
export function itemsQuery(noteId: string, userId: string) {
  return query(itemsCollection(noteId), where('userId', '==', userId));
}

export function itemDocRef(noteId: string, itemId: string) {
  return doc(db, 'notes', noteId, 'items', itemId);
}

export function noteDocRef(noteId: string) {
  return doc(db, 'notes', noteId);
}

// Firestore caps a batch at 500 writes. Leave headroom for a trailing note
// doc write in the same batch during migration.
const BATCH_LIMIT = 450;

// ---------- I/O ----------

/**
 * Write an array of items as individual docs (idempotent: the doc id is
 * the item id, so re-running overwrites in place — no duplicates). Used to
 * seed a fresh checklist (text→checklist toggle).
 */
export async function writeItemsBatch(
  noteId: string,
  items: ChecklistItemDoc[],
): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const slice = items.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const item of slice) {
      batch.set(itemDocRef(noteId, item.id), serializeItem(item));
    }
    await batch.commit();
  }
}

/**
 * Delete every item doc under a note. Used by the checklist→text toggle and
 * (with the collection-group sweep) account deletion. Re-reads the current
 * docs so it also catches any that arrived after a caller's local snapshot.
 */
export async function deleteAllItems(noteId: string, userId: string): Promise<void> {
  const snap = await getDocs(itemsQuery(noteId, userId));
  const refs = snap.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const slice = refs.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const ref of slice) batch.delete(ref);
    await batch.commit();
  }
}

/**
 * One-time, idempotent migration of a note's legacy `checklist` array into
 * the items subcollection.
 *
 * Crash-safety: for the common case (≤ BATCH_LIMIT items) the item writes
 * AND the note-doc finalize (clear the array, set `itemsMigrated`, set the
 * summary) commit in a SINGLE atomic batch — so the array is never cleared
 * unless its items are durably written. There is no window where data can
 * be lost. For very large lists that exceed one batch, items are written
 * first (idempotent) and the note doc is finalized only after they all
 * commit; an interruption before finalize simply leaves the array intact
 * and the next open re-runs (overwriting the same item ids, no dupes).
 *
 * Returns the summary written, so the caller can prime its local cache and
 * avoid a redundant follow-up write.
 */
export async function migrateNoteChecklistToItems(
  noteId: string,
  items: ChecklistItemDoc[],
): Promise<ChecklistSummary> {
  const summary = summaryOf(items);
  const finalize = {
    checklist: deleteField(),
    itemsMigrated: true,
    checklistSummary: summary,
  };

  if (items.length <= BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const item of items) {
      batch.set(itemDocRef(noteId, item.id), serializeItem(item));
    }
    batch.set(noteDocRef(noteId), finalize, { merge: true });
    await batch.commit();
  } else {
    await writeItemsBatch(noteId, items);
    await setDoc(noteDocRef(noteId), finalize, { merge: true });
  }
  return summary;
}
