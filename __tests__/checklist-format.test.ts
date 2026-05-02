import {
  formatChecklistAsText,
  parseChecklistFromText,
} from '../lib/checklist-format';
import type { ChecklistItem } from '../types/note';

let idCounter = 0;
const fakeId = () => `id-${++idCounter}`;
beforeEach(() => {
  idCounter = 0;
});

function items(...specs: Array<[string, boolean]>): ChecklistItem[] {
  return specs.map(([text, completed], i) => ({
    id: `seed-${i}`,
    text,
    completed,
  }));
}

describe('formatChecklistAsText', () => {
  test('description only, no items → just description', () => {
    expect(formatChecklistAsText('hello world', [])).toBe('hello world');
  });

  test('items only → list with no leading description', () => {
    const out = formatChecklistAsText(
      '',
      items(['Buy milk', false], ['Get gas', true]),
    );
    expect(out).toBe('- [ ] Buy milk\n- [x] Get gas');
  });

  test('description + items → blank-line separator between', () => {
    const out = formatChecklistAsText(
      'Some thoughts.',
      items(['First', false], ['Second', true]),
    );
    expect(out).toBe('Some thoughts.\n\n- [ ] First\n- [x] Second');
  });

  test('whitespace-only description treated as empty', () => {
    const out = formatChecklistAsText('   \n  ', items(['Item', false]));
    expect(out).toBe('- [ ] Item');
  });

  test('preserves item text including punctuation and unicode', () => {
    const out = formatChecklistAsText(
      'Trip',
      items(['Pack — sunscreen', false], ['Café list ☕', true]),
    );
    expect(out).toBe('Trip\n\n- [ ] Pack — sunscreen\n- [x] Café list ☕');
  });
});

describe('parseChecklistFromText', () => {
  test('empty input → empty desc + empty items', () => {
    expect(parseChecklistFromText('')).toEqual({ description: '', items: [] });
  });

  test('plain text with no checkboxes → all goes to description', () => {
    const r = parseChecklistFromText('Just some notes.\nMore text.');
    expect(r.description).toBe('Just some notes.\nMore text.');
    expect(r.items).toEqual([]);
  });

  test('trailing checkboxes → parsed as items, description empty', () => {
    const r = parseChecklistFromText('- [ ] First\n- [x] Done', fakeId);
    expect(r.description).toBe('');
    expect(r.items).toEqual([
      { id: 'id-1', text: 'First', completed: false },
      { id: 'id-2', text: 'Done', completed: true },
    ]);
  });

  test('description + trailing checkboxes parse cleanly', () => {
    const r = parseChecklistFromText(
      'Trip prep.\n\n- [ ] Pack\n- [x] Reserve',
      fakeId,
    );
    expect(r.description).toBe('Trip prep.');
    expect(r.items).toEqual([
      { id: 'id-1', text: 'Pack', completed: false },
      { id: 'id-2', text: 'Reserve', completed: true },
    ]);
  });

  test('checkboxes in middle (not trailing) → no items parsed', () => {
    const r = parseChecklistFromText(
      '- [ ] Lonely first\n\nMore prose below',
    );
    expect(r.description).toBe('- [ ] Lonely first\n\nMore prose below');
    expect(r.items).toEqual([]);
  });

  test('case-insensitive on the X marker', () => {
    const r = parseChecklistFromText('- [X] Capital X done', fakeId);
    expect(r.items).toEqual([
      { id: 'id-1', text: 'Capital X done', completed: true },
    ]);
  });

  test('trailing blank lines after items are ignored', () => {
    const r = parseChecklistFromText('- [ ] One\n- [ ] Two\n\n\n', fakeId);
    expect(r.items).toHaveLength(2);
    expect(r.description).toBe('');
  });
});

describe('round-trip (format → parse) is lossless', () => {
  test('description + mix of completed/uncompleted items', () => {
    const original = items(
      ['Plan', false],
      ['Pack', true],
      ['Drive', false],
      ['Arrive', true],
    );
    const dumped = formatChecklistAsText('Trip prep notes.', original);
    const parsed = parseChecklistFromText(dumped, fakeId);
    expect(parsed.description).toBe('Trip prep notes.');
    expect(parsed.items.map((i) => ({ text: i.text, completed: i.completed }))).toEqual(
      original.map((i) => ({ text: i.text, completed: i.completed })),
    );
  });

  test('items only (no description)', () => {
    const original = items(['A', false], ['B', true]);
    const dumped = formatChecklistAsText('', original);
    const parsed = parseChecklistFromText(dumped, fakeId);
    expect(parsed.description).toBe('');
    expect(parsed.items.map((i) => ({ text: i.text, completed: i.completed }))).toEqual([
      { text: 'A', completed: false },
      { text: 'B', completed: true },
    ]);
  });

  test('description only, no items', () => {
    const dumped = formatChecklistAsText('Just notes', []);
    const parsed = parseChecklistFromText(dumped, fakeId);
    expect(parsed.description).toBe('Just notes');
    expect(parsed.items).toEqual([]);
  });

  test('multi-line description survives a round trip', () => {
    const desc = 'Line 1\nLine 2\n\nLine 4';
    const original = items(['Task', false]);
    const dumped = formatChecklistAsText(desc, original);
    const parsed = parseChecklistFromText(dumped, fakeId);
    expect(parsed.description).toBe(desc);
    expect(parsed.items[0]?.text).toBe('Task');
  });
});
