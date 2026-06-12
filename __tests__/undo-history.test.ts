import { UndoHistory, caretAfterRestore, type UndoSnapshot } from '../lib/undo-history';

const s = (content: string, title = ''): UndoSnapshot => ({ title, content });

// Feed a typing run into the history one character at a time, returning the
// final state. `t0` spaces keystrokes 100ms apart (well under the idle gap).
function type(h: UndoHistory, from: UndoSnapshot, text: string, t0: number): UndoSnapshot {
  let prev = from;
  for (let i = 0; i < text.length; i++) {
    const next = s(prev.content + text[i], prev.title);
    h.record(prev, next, t0 + i * 100);
    prev = next;
  }
  return prev;
}

// Delete `n` chars off the end, one at a time.
function backspace(h: UndoHistory, from: UndoSnapshot, n: number, t0: number): UndoSnapshot {
  let prev = from;
  for (let i = 0; i < n; i++) {
    const next = s(prev.content.slice(0, -1), prev.title);
    h.record(prev, next, t0 + i * 100);
    prev = next;
  }
  return prev;
}

describe('UndoHistory chunking', () => {
  test('a continuous typing run is ONE chunk: single undo returns the baseline', () => {
    const h = new UndoHistory();
    const end = type(h, s(''), 'hello world', 1000);
    expect(end.content).toBe('hello world');
    expect(h.undo(end)?.content).toBe('');
    expect(h.canUndo).toBe(false);
  });

  test('deletions seal the pre-delete state (the core promise)', () => {
    const h = new UndoHistory();
    const typed = type(h, s(''), 'hello world', 1000);
    const deleted = backspace(h, typed, 5, 1000 + 11 * 100);
    expect(deleted.content).toBe('hello ');
    // One undo: back to the full pre-delete text.
    const back1 = h.undo(deleted);
    expect(back1?.content).toBe('hello world');
    // Second undo: back to the baseline.
    expect(h.undo(back1!)?.content).toBe('');
  });

  test('typing after a deletion seals the trough', () => {
    const h = new UndoHistory();
    const a = type(h, s(''), 'abcdef', 1000); // A → 'abcdef'
    const b = backspace(h, a, 3, 2000); // trough 'abc'
    const c = type(h, b, 'XYZ', 2600); // 'abcXYZ'
    expect(c.content).toBe('abcXYZ');
    expect(h.undo(c)?.content).toBe('abc'); // post-delete trough
    expect(h.undo(s('abc'))?.content).toBe('abcdef'); // pre-delete
    expect(h.undo(s('abcdef'))?.content).toBe(''); // baseline
  });

  test('an idle pause starts a new chunk', () => {
    const h = new UndoHistory();
    const a = type(h, s(''), 'first burst', 1000);
    // 10s later — new burst.
    const b = type(h, a, ' second', 20000);
    expect(h.undo(b)?.content).toBe('first burst');
    expect(h.undo(s('first burst'))?.content).toBe('');
  });

  test('a paste is its own chunk (boundary on both sides)', () => {
    const h = new UndoHistory();
    const a = type(h, s(''), 'intro ', 1000);
    const pasted = s(a.content + 'a-pasted-block-of-many-chars');
    h.record(a, pasted, 1700);
    const b = type(h, pasted, ' tail', 1800);
    expect(h.undo(b)?.content).toBe(pasted.content); // peel the tail
    expect(h.undo(pasted)?.content).toBe('intro '); // peel the paste alone
    expect(h.undo(s('intro '))?.content).toBe('');
  });

  test('redo restores what undo removed; a fresh edit clears redo', () => {
    const h = new UndoHistory();
    const a = type(h, s(''), 'keep me', 1000);
    const back = h.undo(a)!;
    expect(back.content).toBe('');
    expect(h.canRedo).toBe(true);
    const again = h.redo(back)!;
    expect(again.content).toBe('keep me');
    // Undo once more, then type something new → redo branch dies.
    const back2 = h.undo(again)!;
    const fresh = type(h, back2, 'different', 50000);
    expect(h.canRedo).toBe(false);
    expect(fresh.content).toBe('different');
  });

  test('title edits share the same history as content', () => {
    const h = new UndoHistory();
    const a = type(h, s(''), 'body', 1000);
    const titled = s(a.content, 'My Title');
    h.record(a, titled, 10000);
    const back = h.undo(titled)!;
    expect(back.title).toBe('');
    expect(back.content).toBe('body');
  });

  test('explicit actions force a boundary', () => {
    const h = new UndoHistory();
    const a = type(h, s(''), 'some text', 1000);
    h.recordAction(a); // e.g. formatting tap
    const formatted = s('SOME TEXT');
    expect(h.undo(formatted)?.content).toBe('some text');
  });

  test('no duplicate consecutive snapshots', () => {
    const h = new UndoHistory();
    const a = type(h, s(''), 'x', 1000);
    h.recordAction(a);
    h.recordAction(a); // same state twice
    expect(h.undo(a)?.content).toBe(''); // dedupe means baseline is next
  });

  test('history is capped: oldest chunks evict first', () => {
    const h = new UndoHistory();
    let prev = s('');
    // 150 idle-separated single-char chunks → far over the 100-entry cap.
    for (let i = 0; i < 150; i++) {
      const next = s(prev.content + 'x');
      h.record(prev, next, i * 10000);
      prev = next;
    }
    let steps = 0;
    let cur: UndoSnapshot | null = prev;
    while (cur && h.canUndo) {
      cur = h.undo(cur);
      steps++;
    }
    expect(steps).toBe(100);
    // The oldest states (incl. the empty baseline) were evicted.
    expect(cur?.content).toBe('x'.repeat(50));
  });

  test('reset drops everything', () => {
    const h = new UndoHistory();
    const a = type(h, s(''), 'abc', 1000);
    h.undo(a);
    expect(h.canRedo).toBe(true);
    h.reset();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });
});

describe('caretAfterRestore', () => {
  test('caret lands after the restored region', () => {
    // Deleted "world" gets restored → caret after "world".
    expect(caretAfterRestore('hello ', 'hello world')).toBe(11);
    // Mid-text restore: caret at the right edge of the changed region.
    // ('a c' → 'a B c' has an ambiguous diff; prefix-first resolution puts
    // the change as 'B ' and the caret after it.)
    expect(caretAfterRestore('a c', 'a B c')).toBe(4);
    // Restore removes text (redo of a delete): caret at the seam.
    expect(caretAfterRestore('hello world', 'hello ')).toBe(6);
  });
});
