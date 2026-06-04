import {
  toItemDoc,
  serializeItem,
  fromSnapshot,
  summaryOf,
} from '../lib/checklist-item-doc';
import type { ChecklistItem, ChecklistItemDoc } from '../types/note';

const NOW = 1_700_000_000_000;

function doc(partial: Partial<ChecklistItemDoc>): ChecklistItemDoc {
  return {
    id: 'x',
    userId: 'u1',
    text: '',
    completed: false,
    order: 0,
    createdAt: NOW,
    ...partial,
  };
}

describe('toItemDoc (legacy array → subcollection doc)', () => {
  test('order = array index; userId/createdAt stamped; text/completed kept', () => {
    const arr: ChecklistItem[] = [
      { id: 'a', text: 'First', completed: false },
      { id: 'b', text: 'Second', completed: true, completedAt: 123 },
    ];
    const docs = arr.map((it, i) => toItemDoc(it, i, 'user-9', NOW));
    expect(docs[0]).toEqual({
      id: 'a',
      userId: 'user-9',
      text: 'First',
      completed: false,
      order: 0,
      createdAt: NOW,
    });
    expect(docs[1]).toEqual({
      id: 'b',
      userId: 'user-9',
      text: 'Second',
      completed: true,
      completedAt: 123,
      order: 1,
      createdAt: NOW,
    });
  });

  test('preserves the item id (so migration is idempotent by doc id)', () => {
    const out = toItemDoc({ id: 'keep-me', text: 't', completed: false }, 3, 'u', NOW);
    expect(out.id).toBe('keep-me');
    expect(out.order).toBe(3);
  });

  test('absent completedAt stays absent (not coerced to a number)', () => {
    const out = toItemDoc({ id: 'a', text: 't', completed: true }, 0, 'u', NOW);
    expect('completedAt' in out).toBe(false);
  });
});

describe('serializeItem (doc → Firestore payload)', () => {
  test('drops the synthetic id and omits undefined completedAt', () => {
    const payload = serializeItem(doc({ id: 'a', text: 'hi', order: 2 }));
    expect(payload).toEqual({
      userId: 'u1',
      text: 'hi',
      completed: false,
      order: 2,
      createdAt: NOW,
    });
    expect('id' in payload).toBe(false);
    expect('completedAt' in payload).toBe(false);
  });

  test('keeps completedAt when present', () => {
    const payload = serializeItem(doc({ completed: true, completedAt: 555 }));
    expect(payload.completedAt).toBe(555);
  });
});

describe('fromSnapshot (Firestore data → doc)', () => {
  test('reconstructs id from the doc id and coerces fields', () => {
    const out = fromSnapshot('doc-1', {
      userId: 'u1',
      text: 'task',
      completed: true,
      completedAt: 999,
      order: 5,
      createdAt: NOW,
    });
    expect(out).toEqual({
      id: 'doc-1',
      userId: 'u1',
      text: 'task',
      completed: true,
      completedAt: 999,
      order: 5,
      createdAt: NOW,
    });
  });

  test('defends against missing/wrong-typed fields', () => {
    const out = fromSnapshot('doc-2', { completed: 'truthy', order: 'nope' });
    expect(out).toEqual({
      id: 'doc-2',
      userId: '',
      text: '',
      completed: true, // !!'truthy'
      order: 0, // non-number → 0
      createdAt: 0,
    });
    expect('completedAt' in out).toBe(false);
  });

  test('round-trips with serializeItem (no data lost across a migration)', () => {
    const original = doc({
      id: 'orig',
      text: 'Pack — sunscreen ☕',
      completed: true,
      completedAt: 42,
      order: 7,
    });
    const restored = fromSnapshot(original.id, serializeItem(original));
    expect(restored).toEqual(original);
  });
});

describe('summaryOf (denormalized list-preview rollup)', () => {
  test('counts only items with non-empty text', () => {
    const s = summaryOf([
      doc({ id: 'a', text: 'Real', order: 0 }),
      doc({ id: 'b', text: '   ', order: 1 }), // whitespace-only → ignored
      doc({ id: 'c', text: '', order: 2 }), // empty → ignored
    ]);
    expect(s.total).toBe(1);
  });

  test('firstUncompleted follows display order (by `order`), not array order', () => {
    const s = summaryOf([
      doc({ id: 'a', text: 'B-second', order: 2, completed: false }),
      doc({ id: 'b', text: 'A-first', order: 1, completed: false }),
    ]);
    expect(s.firstUncompleted).toBe('A-first');
  });

  test('skips completed items when picking firstUncompleted', () => {
    const s = summaryOf([
      doc({ id: 'a', text: 'Done', order: 0, completed: true, completedAt: 1 }),
      doc({ id: 'b', text: 'Todo', order: 1, completed: false }),
    ]);
    expect(s.completed).toBe(1);
    expect(s.total).toBe(2);
    expect(s.firstUncompleted).toBe('Todo');
  });

  test('all complete → firstUncompleted is empty (drives the "✓" preview)', () => {
    const s = summaryOf([
      doc({ id: 'a', text: 'X', completed: true, completedAt: 2 }),
      doc({ id: 'b', text: 'Y', completed: true, completedAt: 1 }),
    ]);
    expect(s).toEqual({ total: 2, completed: 2, firstUncompleted: '' });
  });

  test('empty list → zeroed summary', () => {
    expect(summaryOf([])).toEqual({ total: 0, completed: 0, firstUncompleted: '' });
  });

  test('firstUncompleted is capped at 100 chars', () => {
    const long = 'x'.repeat(150);
    const s = summaryOf([doc({ id: 'a', text: long, order: 0 })]);
    expect(s.firstUncompleted).toHaveLength(100);
  });
});

describe('migration mapping integrity (array → docs → summary)', () => {
  test('a mixed checklist migrates with ordering + summary preserved', () => {
    const legacy: ChecklistItem[] = [
      { id: '1', text: 'Plan', completed: false },
      { id: '2', text: 'Pack', completed: true, completedAt: 200 },
      { id: '3', text: 'Drive', completed: false },
      { id: '4', text: '', completed: false }, // blank row carried over but not counted
    ];
    const docs = legacy.map((it, i) => toItemDoc(it, i, 'u', NOW));

    // order matches original array positions
    expect(docs.map((d) => d.order)).toEqual([0, 1, 2, 3]);
    // ids preserved (idempotent re-runs overwrite the same docs)
    expect(docs.map((d) => d.id)).toEqual(['1', '2', '3', '4']);

    const s = summaryOf(docs);
    expect(s).toEqual({ total: 3, completed: 1, firstUncompleted: 'Plan' });
  });
});
