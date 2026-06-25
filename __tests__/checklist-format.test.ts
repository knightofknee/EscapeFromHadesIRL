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

// Selection helper: char offsets for the [startLine, endLine] line span of
// `text` (inclusive), so tests can say "highlight lines 1–2" readably.
function lineSel(text: string, startLine: number, endLine: number) {
  const lines = text.split('\n');
  let start = 0;
  for (let i = 0; i < startLine; i++) start += lines[i].length + 1;
  let end = 0;
  for (let i = 0; i <= endLine; i++) end += lines[i].length + (i < endLine ? 1 : 0);
  return { start, end };
}

describe('parseChecklistFromText — NO selection (revert path)', () => {
  test('empty input → empty items', () => {
    expect(parseChecklistFromText('')).toEqual({ description: '', items: [] });
  });

  test('plain prose stays as description, NOT items', () => {
    const r = parseChecklistFromText('Buy milk\nGet gas\nWalk dog', fakeId);
    expect(r.items).toEqual([]);
    expect(r.description).toBe('Buy milk\nGet gas\nWalk dog');
  });

  test('checkbox lines become items with their checked state', () => {
    const r = parseChecklistFromText('- [ ] First\n- [x] Done', fakeId);
    expect(r.description).toBe('');
    expect(r.items).toEqual([
      { id: 'id-1', text: 'First', completed: false },
      { id: 'id-2', text: 'Done', completed: true },
    ]);
  });

  test('prose above checkboxes → description; checkboxes → items', () => {
    const r = parseChecklistFromText('Trip prep.\n\n- [ ] Pack\n- [x] Reserve', fakeId);
    expect(r.description).toBe('Trip prep.');
    expect(r.items).toEqual([
      { id: 'id-1', text: 'Pack', completed: false },
      { id: 'id-2', text: 'Reserve', completed: true },
    ]);
  });

  test('tolerant of terse / spacing-variant checkbox spellings', () => {
    const r = parseChecklistFromText('-[] terse\n-  [ ]  spaced\n[x] no dash', fakeId);
    expect(r.items).toEqual([
      { id: 'id-1', text: 'terse', completed: false },
      { id: 'id-2', text: 'spaced', completed: false },
      { id: 'id-3', text: 'no dash', completed: true },
    ]);
  });

  test('plain bullet/numbered lines are NOT items here (only checkboxes are)', () => {
    const r = parseChecklistFromText('- milk\n1. eggs', fakeId);
    expect(r.items).toEqual([]);
    expect(r.description).toBe('- milk\n1. eggs');
  });

  test('blank lines and empty checkboxes are skipped from items', () => {
    const r = parseChecklistFromText('- [ ] One\n\n- [ ] \n\n- [ ] Two\n', fakeId);
    expect(r.items.map((i) => i.text)).toEqual(['One', 'Two']);
  });
});

describe('parseChecklistFromText — WITH selection (highlight to pick items)', () => {
  test('only highlighted lines become items; the rest stays description', () => {
    const text = 'A description\nbuy milk\nbuy eggs';
    const r = parseChecklistFromText(text, fakeId, lineSel(text, 1, 2));
    expect(r.description).toBe('A description');
    expect(r.items).toEqual([
      { id: 'id-1', text: 'buy milk', completed: false },
      { id: 'id-2', text: 'buy eggs', completed: false },
    ]);
  });

  test('blank lines inside the highlight are skipped', () => {
    const text = 'milk\n\neggs\n\nbread';
    const r = parseChecklistFromText(text, fakeId, lineSel(text, 0, 4));
    expect(r.items.map((i) => i.text)).toEqual(['milk', 'eggs', 'bread']);
    expect(r.description).toBe('');
  });

  test('a partial highlight of a line still converts the whole line', () => {
    const text = 'keep me\nconvert this line';
    // Selection covering just "convert" inside line 1.
    const r = parseChecklistFromText(text, fakeId, { start: 8, end: 15 });
    expect(r.description).toBe('keep me');
    expect(r.items.map((i) => i.text)).toEqual(['convert this line']);
  });

  test('highlighted bullet/checkbox markers are stripped / honored', () => {
    const text = 'note\n- milk\n- [x] eggs';
    const r = parseChecklistFromText(text, fakeId, lineSel(text, 1, 2));
    expect(r.description).toBe('note');
    expect(r.items).toEqual([
      { id: 'id-1', text: 'milk', completed: false },
      { id: 'id-2', text: 'eggs', completed: true },
    ]);
  });

  test('description keeps lines both above AND below the highlight', () => {
    const text = 'top\nitem one\nitem two\nbottom';
    const r = parseChecklistFromText(text, fakeId, lineSel(text, 1, 2));
    expect(r.items.map((i) => i.text)).toEqual(['item one', 'item two']);
    expect(r.description).toBe('top\nbottom');
  });

  test('a collapsed selection falls back to no-selection mode', () => {
    const text = 'plain note\n- [ ] real item';
    const r = parseChecklistFromText(text, fakeId, { start: 3, end: 3 });
    expect(r.description).toBe('plain note');
    expect(r.items.map((i) => i.text)).toEqual(['real item']);
  });
});

describe('round-trip (format → parse, no selection) is lossless', () => {
  test('description + mixed items survive a checklist→text→checklist cycle', () => {
    const original = items(['Pack', false], ['Reserve', true], ['Drive', false]);
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
});
