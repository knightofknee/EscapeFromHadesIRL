import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  itemsQuery,
  itemDocRef,
  noteDocRef,
  makeItemId,
  toItemDoc,
  fromSnapshot,
  serializeItem,
  summaryOf,
  writeItemsBatch,
  deleteAllItems,
  migrateNoteChecklistToItems,
} from '@/lib/firebase/checklist-items';
import {
  db,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  writeBatch,
} from '@/lib/firebase/firestore';
import type {
  ChecklistItem,
  ChecklistItemDoc,
  ChecklistSummary,
} from '@/types/note';

// Matches the editor's old debounce: typing in an item text field writes
// the item doc once the user pauses, not on every keystroke.
const SAVE_DEBOUNCE_MS = 400;

type PendingOp =
  | { kind: 'write'; item: ChecklistItemDoc }
  | { kind: 'delete' };

// Two item snapshots are "the same" (so a pending optimistic op can be
// retired) when the fields we mutate match. userId/createdAt never change
// after creation, so they're irrelevant to confirmation.
function sameItem(a: ChecklistItemDoc, b: ChecklistItemDoc): boolean {
  return (
    a.text === b.text &&
    a.completed === b.completed &&
    (a.completedAt ?? null) === (b.completedAt ?? null) &&
    a.order === b.order
  );
}

function sameSummary(a: ChecklistSummary | undefined, b: ChecklistSummary): boolean {
  return (
    !!a &&
    a.total === b.total &&
    a.completed === b.completed &&
    a.firstUncompleted === b.firstUncompleted
  );
}

export type UseChecklistItems = {
  items: ChecklistItemDoc[];
  /** Latest display items, including not-yet-flushed typing — for the
   *  checklist→text dump. */
  getItems: () => ChecklistItemDoc[];
  addItem: () => string;
  toggleItem: (id: string) => void;
  setItemText: (id: string, text: string) => void;
  deleteItem: (id: string) => void;
  restoreItem: (item: ChecklistItemDoc) => void;
  reorderUncompleted: (newUncompleted: ChecklistItemDoc[]) => void;
  /** Seed a fresh subcollection from parsed items (text→checklist). */
  seedItems: (items: ChecklistItemDoc[], summary: ChecklistSummary) => void;
  /** Drop the whole subcollection (checklist→text). */
  clearItems: () => Promise<void>;
};

type Params = {
  noteId: string;
  userId: string | undefined;
  /** Only subscribe/migrate while the note is actually a checklist. */
  enabled: boolean;
  /** Legacy array source for the one-time migration. */
  legacyChecklist: ChecklistItem[] | undefined;
  itemsMigrated: boolean | undefined;
  /** The note's stored summary, used to seed the no-op guard so we don't
   *  rewrite an unchanged summary on open. */
  initialSummary: ChecklistSummary | undefined;
};

/**
 * Live view + mutations for a note's checklist, backed by the
 * `notes/{noteId}/items` subcollection (the "ideal" data model). Each
 * mutation is one small per-item write, NOT a full-array rewrite.
 *
 * Optimism + listener: a `pending` overlay of in-flight ops is applied on
 * top of the latest server snapshot, so the UI reflects edits instantly
 * and a snapshot can never clobber a keystroke the user just typed. A
 * pending op retires automatically once the server snapshot confirms it.
 *
 * Migration: opening a legacy note (array present, `itemsMigrated` false)
 * seeds the display from the array immediately (no empty flash) and moves
 * the items into the subcollection atomically — see
 * migrateNoteChecklistToItems.
 */
export function useChecklistItems({
  noteId,
  userId,
  enabled,
  legacyChecklist,
  itemsMigrated,
  initialSummary,
}: Params): UseChecklistItems {
  // Server truth (null until the first snapshot) and the optimistic overlay.
  const [serverItems, setServerItems] = useState<ChecklistItemDoc[] | null>(null);
  const [pending, setPending] = useState<Map<string, PendingOp>>(() => new Map());

  // Refs that callbacks read so their identity stays stable (deps = noteId).
  const itemsRef = useRef<ChecklistItemDoc[]>([]);
  const pendingTextRef = useRef<Map<string, string>>(new Map());
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSummaryRef = useRef<ChecklistSummary | undefined>(initialSummary);
  const migratedRef = useRef(false);
  const migratingRef = useRef(false);
  // Mirror props into refs so the migration effect can read the freshest
  // values without re-running on every notes-listener snapshot.
  const legacyRef = useRef(legacyChecklist);
  legacyRef.current = legacyChecklist;
  const initialSummaryRef = useRef(initialSummary);
  initialSummaryRef.current = initialSummary;

  // Display order: uncompleted by `order` asc, then completed by
  // `completedAt` desc — identical to the old array-based rendering.
  const items = useMemo(() => {
    const map = new Map<string, ChecklistItemDoc>();
    for (const it of serverItems ?? []) map.set(it.id, it);
    for (const [id, op] of pending) {
      if (op.kind === 'delete') map.delete(id);
      else map.set(id, op.item);
    }
    const all = [...map.values()];
    const uncompleted = all
      .filter((i) => !i.completed)
      .sort((a, b) => a.order - b.order);
    const completed = all
      .filter((i) => i.completed)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return [...uncompleted, ...completed];
  }, [serverItems, pending]);
  itemsRef.current = items;

  // Write the denormalized summary (+ optionally bump updatedAt) to the
  // note doc. Direct write — bypasses updateNote's no-op guard so a
  // touch:true edit always bumps recency, mirroring the old array write.
  // touch:false (toggle/reorder) skips when the preview is unchanged.
  const writeNoteState = useCallback(
    (nId: string, list: ChecklistItemDoc[], opts: { touch: boolean }) => {
      const summary = summaryOf(list);
      if (!opts.touch && sameSummary(lastSummaryRef.current, summary)) return;
      lastSummaryRef.current = summary;
      const payload = opts.touch
        ? { checklistSummary: summary, updatedAt: Date.now() }
        : { checklistSummary: summary };
      setDoc(noteDocRef(nId), payload, { merge: true }).catch((e) =>
        console.error('[useChecklistItems] summary write failed', e),
      );
    },
    [],
  );

  // Flush queued item-text writes now (debounce fire, unmount, note change).
  const flushTextWrites = useCallback(
    (flushNoteId: string) => {
      if (textTimer.current) {
        clearTimeout(textTimer.current);
        textTimer.current = null;
      }
      const entries = [...pendingTextRef.current.entries()];
      if (entries.length === 0) return;
      pendingTextRef.current.clear();
      // One batched write for all pending edits instead of N updateDocs — a
      // multi-item edit session was firing 3-8 separate writes.
      const batch = writeBatch(db);
      for (const [id, text] of entries) {
        batch.update(itemDocRef(flushNoteId, id), { text });
      }
      batch.commit().catch((e) =>
        console.error('[useChecklistItems] text batch write failed', e),
      );
      // Item text edits bump recency, like the old array write did.
      writeNoteState(flushNoteId, itemsRef.current, { touch: true });
    },
    [writeNoteState],
  );

  // ----- mutations (read itemsRef.current so identity = [noteId]) -----

  const addItem = useCallback((): string => {
    const id = makeItemId();
    const now = Date.now();
    const cur = itemsRef.current;
    const maxOrder = cur
      .filter((i) => !i.completed)
      .reduce((m, i) => Math.max(m, i.order), -1);
    const item: ChecklistItemDoc = {
      id,
      userId: userId ?? '',
      text: '',
      completed: false,
      order: maxOrder + 1,
      createdAt: now,
    };
    setPending((p) => new Map(p).set(id, { kind: 'write', item }));
    setDoc(itemDocRef(noteId, id), serializeItem(item)).catch((e) =>
      console.error('[useChecklistItems] add failed', e),
    );
    writeNoteState(noteId, [...cur, item], { touch: true });
    return id;
  }, [noteId, userId, writeNoteState]);

  const toggleItem = useCallback(
    (id: string) => {
      const cur = itemsRef.current;
      const target = cur.find((i) => i.id === id);
      if (!target) return;
      let updated: ChecklistItemDoc;
      if (target.completed) {
        // Uncomplete: drop completedAt entirely (keeps its slot among
        // uncompleted via the unchanged `order`).
        updated = { ...target, completed: false };
        delete updated.completedAt;
        updateDoc(itemDocRef(noteId, id), {
          completed: false,
          completedAt: deleteField(),
        }).catch((e) => console.error('[useChecklistItems] toggle failed', e));
      } else {
        const now = Date.now();
        updated = { ...target, completed: true, completedAt: now };
        updateDoc(itemDocRef(noteId, id), {
          completed: true,
          completedAt: now,
        }).catch((e) => console.error('[useChecklistItems] toggle failed', e));
      }
      setPending((p) => new Map(p).set(id, { kind: 'write', item: updated }));
      // Toggling a box isn't a content edit — don't bump updatedAt.
      writeNoteState(
        noteId,
        cur.map((i) => (i.id === id ? updated : i)),
        { touch: false },
      );
    },
    [noteId, writeNoteState],
  );

  const setItemText = useCallback(
    (id: string, text: string) => {
      const cur = itemsRef.current;
      const target = cur.find((i) => i.id === id);
      if (!target) return;
      const updated = { ...target, text };
      setPending((p) => new Map(p).set(id, { kind: 'write', item: updated }));
      pendingTextRef.current.set(id, text);
      if (textTimer.current) clearTimeout(textTimer.current);
      textTimer.current = setTimeout(
        () => flushTextWrites(noteId),
        SAVE_DEBOUNCE_MS,
      );
    },
    [noteId, flushTextWrites],
  );

  const deleteItem = useCallback(
    (id: string) => {
      const cur = itemsRef.current;
      if (!cur.some((i) => i.id === id)) return;
      setPending((p) => new Map(p).set(id, { kind: 'delete' }));
      // Cancel any queued text write for the deleted item.
      pendingTextRef.current.delete(id);
      deleteDoc(itemDocRef(noteId, id)).catch((e) =>
        console.error('[useChecklistItems] delete failed', e),
      );
      writeNoteState(noteId, cur.filter((i) => i.id !== id), { touch: true });
    },
    [noteId, writeNoteState],
  );

  const restoreItem = useCallback(
    (item: ChecklistItemDoc) => {
      // Re-create with the original fields (its `order` lands it back in
      // place; a completed item re-sorts by completedAt).
      setPending((p) => new Map(p).set(item.id, { kind: 'write', item }));
      setDoc(itemDocRef(noteId, item.id), serializeItem(item)).catch((e) =>
        console.error('[useChecklistItems] restore failed', e),
      );
      const cur = itemsRef.current.filter((i) => i.id !== item.id);
      writeNoteState(noteId, [...cur, item], { touch: true });
    },
    [noteId, writeNoteState],
  );

  const reorderUncompleted = useCallback(
    (newUncompleted: ChecklistItemDoc[]) => {
      // Renumber the uncompleted group to its new positions; write only the
      // items whose order actually changed (completed items are untouched —
      // they sort by completedAt).
      const changed: ChecklistItemDoc[] = [];
      newUncompleted.forEach((it, idx) => {
        if (it.order !== idx) changed.push({ ...it, order: idx });
      });
      if (changed.length === 0) return;
      setPending((p) => {
        const next = new Map(p);
        for (const c of changed) next.set(c.id, { kind: 'write', item: c });
        return next;
      });
      for (const c of changed) {
        updateDoc(itemDocRef(noteId, c.id), { order: c.order }).catch((e) =>
          console.error('[useChecklistItems] reorder failed', e),
        );
      }
      const changedMap = new Map(changed.map((c) => [c.id, c]));
      writeNoteState(
        noteId,
        itemsRef.current.map((i) => changedMap.get(i.id) ?? i),
        { touch: false },
      );
    },
    [noteId, writeNoteState],
  );

  const seedItems = useCallback(
    (newItems: ChecklistItemDoc[], summary: ChecklistSummary) => {
      // Optimistic display so the editor shows items the instant it mounts;
      // the union guard keeps them until the listener confirms.
      migratedRef.current = true;
      migratingRef.current = true;
      setServerItems(newItems);
      setPending(new Map());
      lastSummaryRef.current = summary;
      writeItemsBatch(noteId, newItems)
        .then(() => {
          migratingRef.current = false;
        })
        .catch((e) => {
          console.error('[useChecklistItems] seed failed', e);
          migratingRef.current = false;
        });
    },
    [noteId],
  );

  const clearItems = useCallback(async () => {
    // Cancel queued text writes so a late debounce can't re-create a doc
    // after we delete everything.
    if (textTimer.current) {
      clearTimeout(textTimer.current);
      textTimer.current = null;
    }
    pendingTextRef.current.clear();
    setPending(new Map());
    setServerItems([]);
    await deleteAllItems(noteId, userId ?? '');
  }, [noteId, userId]);

  const getItems = useCallback(() => itemsRef.current, []);

  // ----- effects -----

  // Reset all per-note state when the note changes. Declared FIRST so the
  // migration effect's seed (below) isn't nulled out.
  useEffect(() => {
    setServerItems(null);
    setPending(new Map());
    pendingTextRef.current.clear();
    if (textTimer.current) {
      clearTimeout(textTimer.current);
      textTimer.current = null;
    }
    migratedRef.current = false;
    migratingRef.current = false;
    lastSummaryRef.current = initialSummaryRef.current;
  }, [noteId]);

  // Subscribe to the items subcollection. Cleanup flushes queued text for
  // THIS note id (captured in closure) so navigating away never drops the
  // last keystrokes.
  useEffect(() => {
    // userId is required: the items rule scopes on it, so the listen query
    // must filter by userId (see itemsQuery).
    if (!enabled || !noteId || !userId) return;
    const unsub = onSnapshot(
      itemsQuery(noteId, userId),
      (snap) => {
        const incoming = snap.docs.map((d) => fromSnapshot(d.id, d.data()));
        if (migratingRef.current) {
          // Union server over the seed (server wins per id) so an early
          // empty/partial snapshot can't flash over freshly-seeded items.
          setServerItems((prev) => {
            const map = new Map<string, ChecklistItemDoc>();
            for (const it of prev ?? []) map.set(it.id, it);
            for (const it of incoming) map.set(it.id, it);
            return [...map.values()];
          });
          return;
        }
        setServerItems(incoming);
        // Retire any pending op the server now confirms.
        setPending((prev) => {
          if (prev.size === 0) return prev;
          const serverMap = new Map(incoming.map((i) => [i.id, i]));
          let changed = false;
          const next = new Map(prev);
          for (const [id, op] of prev) {
            if (op.kind === 'delete') {
              if (!serverMap.has(id)) {
                next.delete(id);
                changed = true;
              }
            } else {
              const s = serverMap.get(id);
              if (s && sameItem(s, op.item)) {
                next.delete(id);
                changed = true;
              }
            }
          }
          return changed ? next : prev;
        });
      },
      (err) => console.error('[useChecklistItems] listener error', err),
    );
    const flushNoteId = noteId;
    return () => {
      unsub();
      flushTextWrites(flushNoteId);
    };
  }, [noteId, enabled, userId, flushTextWrites]);

  // One-time lazy migration of the legacy array. Guarded by migratedRef so
  // it runs at most once per open even though the note prop (and thus deps)
  // churns as snapshots arrive.
  useEffect(() => {
    if (!enabled || !noteId || !userId) return;
    if (migratedRef.current || itemsMigrated) {
      migratedRef.current = true;
      return;
    }
    const legacy = legacyRef.current ?? [];
    if (legacy.length === 0) {
      migratedRef.current = true;
      return;
    }
    migratedRef.current = true;
    migratingRef.current = true;
    const now = Date.now();
    const seed = legacy.map((it, idx) => toItemDoc(it, idx, userId, now));
    setServerItems(seed); // instant display — no empty flash
    lastSummaryRef.current = summaryOf(seed);
    migrateNoteChecklistToItems(noteId, seed)
      .then(() => {
        migratingRef.current = false;
      })
      .catch((e) => {
        console.error('[useChecklistItems] migration failed', e);
        migratingRef.current = false;
        migratedRef.current = false; // allow retry on next open
      });
  }, [noteId, enabled, userId, itemsMigrated]);

  return {
    items,
    getItems,
    addItem,
    toggleItem,
    setItemText,
    deleteItem,
    restoreItem,
    reorderUncompleted,
    seedItems,
    clearItems,
  };
}
