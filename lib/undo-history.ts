/**
 * Chunked undo/redo history for the note editor.
 *
 * Snapshot-based: each undo step is a full {title, content} state (notes are
 * small enough that diff storage would be over-engineering). The value is in
 * WHERE chunk boundaries fall, so undo steps feel like meaningful chunks of
 * work instead of per-keystroke twitches or one giant blob:
 *
 * - entering a deletion after typing  → boundary (the pre-delete state must
 *   always be one undo away — deletions are how content gets lost)
 * - resuming typing after a deletion  → boundary (the post-delete trough)
 * - an idle pause (IDLE_MS)           → boundary (bursts of writing)
 * - a large single insert (paste)     → boundary on both sides
 * - an explicit action (formatting)   → boundary (one tap = one undo step)
 * - safety cap: a continuous run longer than MAX_RUN_CHARS splits
 *
 * Redo clears on any fresh edit (industry standard). Memory is bounded by
 * MAX_ENTRIES snapshots and ~MAX_TOTAL_CHARS stored characters — oldest
 * entries evict first.
 */

export type UndoSnapshot = { title: string; content: string };

const IDLE_MS = 2000;
const PASTE_CHARS = 24;
const MAX_RUN_CHARS = 200;
const MAX_ENTRIES = 100;
const MAX_TOTAL_CHARS = 2_000_000;

type EditKind = 'insert' | 'delete';

function sameSnapshot(a: UndoSnapshot, b: UndoSnapshot): boolean {
  return a.title === b.title && a.content === b.content;
}

export class UndoHistory {
  private undoStack: UndoSnapshot[] = [];
  private redoStack: UndoSnapshot[] = [];
  private lastEditAt = 0;
  private lastKind: EditKind | null = null;
  private runChars = 0;

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Drop everything (switching notes). */
  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastEditAt = 0;
    this.lastKind = null;
    this.runChars = 0;
  }

  /**
   * Record an edit moving the editor from `prev` to `next`. Pushes `prev`
   * as an undo snapshot when this edit starts a new chunk (see policy
   * above); otherwise the edit joins the current chunk.
   */
  record(prev: UndoSnapshot, next: UndoSnapshot, now: number = Date.now()): void {
    if (sameSnapshot(prev, next)) return;

    const delta =
      next.content.length - prev.content.length + (next.title.length - prev.title.length);
    const kind: EditKind = delta < 0 ? 'delete' : 'insert';
    const size = Math.max(1, Math.abs(delta));

    const isFirst = this.lastKind === null;
    const idle = now - this.lastEditAt > IDLE_MS;
    const kindChanged = !isFirst && kind !== this.lastKind;
    const isPaste = kind === 'insert' && delta >= PASTE_CHARS;
    const runExceeded = this.runChars + size > MAX_RUN_CHARS;

    if (isFirst || idle || kindChanged || isPaste || runExceeded) {
      this.push(prev);
      this.runChars = 0;
    }

    this.runChars += size;
    // A paste closes its own chunk too: the next edit (whatever kind) starts
    // fresh, so undo peels the paste off as a single step.
    this.lastKind = isPaste ? null : kind;
    this.lastEditAt = now;
    // Any fresh edit invalidates the redo branch.
    this.redoStack = [];
  }

  /**
   * Force a boundary for an explicit action (formatting tap, etc.): `prev`
   * becomes an undo snapshot and whatever follows starts a fresh chunk.
   */
  recordAction(prev: UndoSnapshot): void {
    this.push(prev);
    this.lastKind = null;
    this.lastEditAt = 0;
    this.runChars = 0;
    this.redoStack = [];
  }

  /** Step back. `current` is the live editor state (it becomes redo-able). */
  undo(current: UndoSnapshot): UndoSnapshot | null {
    // Skip snapshots identical to the live state (e.g. a recorded action
    // that ended up changing nothing) — an undo press must never no-op.
    let snap = this.undoStack.pop();
    while (snap && sameSnapshot(snap, current)) snap = this.undoStack.pop();
    if (!snap) return null;
    this.redoStack.push(current);
    this.sealRun();
    return snap;
  }

  /** Step forward again. `current` goes back onto the undo stack. */
  redo(current: UndoSnapshot): UndoSnapshot | null {
    let snap = this.redoStack.pop();
    while (snap && sameSnapshot(snap, current)) snap = this.redoStack.pop();
    if (!snap) return null;
    this.undoStack.push(current);
    this.sealRun();
    return snap;
  }

  /** After undo/redo, the next edit always starts a new chunk. */
  private sealRun(): void {
    this.lastKind = null;
    this.lastEditAt = 0;
    this.runChars = 0;
  }

  private push(snap: UndoSnapshot): void {
    const top = this.undoStack[this.undoStack.length - 1];
    if (top && sameSnapshot(top, snap)) return;
    this.undoStack.push(snap);

    // Evict oldest beyond the entry/char budgets (keep at least one so the
    // baseline never fully disappears mid-session).
    let total = 0;
    for (const s of this.undoStack) total += s.content.length + s.title.length;
    while (
      this.undoStack.length > MAX_ENTRIES ||
      (total > MAX_TOTAL_CHARS && this.undoStack.length > 1)
    ) {
      const dropped = this.undoStack.shift()!;
      total -= dropped.content.length + dropped.title.length;
    }
  }
}

/**
 * Where the caret should land after restoring `to` over `from`: right after
 * the changed region (common prefix/suffix excluded).
 */
export function caretAfterRestore(from: string, to: string): number {
  const minLen = Math.min(from.length, to.length);
  let prefix = 0;
  while (prefix < minLen && from[prefix] === to[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    from[from.length - 1 - suffix] === to[to.length - 1 - suffix]
  ) {
    suffix++;
  }
  return to.length - suffix;
}
