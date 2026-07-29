import type { Note, Tag } from '@/types/note';

// In-memory AsyncStorage so the vocab store runs under node.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: jest.fn(async (k: string) => {
        store.delete(k);
      }),
    },
  };
});

import {
  loadVocab,
  learnFromEdit,
  learnWord,
  seedVocabFromNotes,
  getSuggestions,
  applySuggestionToText,
  flushVocab,
  type Suggestion,
} from '@/lib/word-suggestions';

// Every learn schedules a debounced persist; flush it so jest can exit.
afterEach(async () => {
  await flushVocab();
});

const bookTag: Tag = {
  id: 'tag-book',
  userId: 'u',
  name: "The Basic B's of Being",
  color: '#8B5CF6',
  createdAt: 0,
};
const gymTag: Tag = { id: 'tag-gym', userId: 'u', name: 'gym', createdAt: 0 };

function makeNote(content: string, title = ''): Note {
  return {
    id: 'n',
    userId: 'u',
    title,
    content,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

// The store is a module singleton — loading a fresh uid resets it.
let uidCounter = 0;
async function freshVocab(): Promise<void> {
  await loadVocab(`test-user-${++uidCounter}`);
}

function words(suggs: Suggestion[]): string[] {
  return suggs.filter((s) => s.kind === 'word').map((s) => (s.kind === 'word' ? s.display : ''));
}

describe('learning from edits', () => {
  beforeEach(freshVocab);

  it('learns a word when the boundary keystroke commits it', () => {
    learnFromEdit('hello', 'hello ');
    expect(words(getSuggestions('writing hel', []))).toContain('hello');
  });

  it('does not learn while the word is still being typed', () => {
    learnFromEdit('hell', 'hello');
    expect(getSuggestions('hel', [])).toEqual([]);
  });

  it('does not learn from deletions', () => {
    learnFromEdit('hello world', 'hello ');
    expect(getSuggestions('wor', [])).toEqual([]);
  });

  it('learns the corrected word from an autocorrect replacement', () => {
    learnFromEdit('morning teh', 'morning the ');
    // "the" is learned (3 chars) — verify via a word that rides with it.
    learnFromEdit('', 'theory ');
    expect(words(getSuggestions('th', []))).toContain('theory');
  });

  it('harvests every word from a paste', () => {
    learnFromEdit('', 'walking every single morning ');
    expect(words(getSuggestions('walk', []))).toContain('walking');
    expect(words(getSuggestions('morn', []))).toContain('morning');
  });

  it('ranks by how often the user types the word', () => {
    for (const w of ['meditation ', 'meditation meditation ']) learnFromEdit('', w);
    learnFromEdit('', 'meditate ');
    expect(words(getSuggestions('medi', []))[0]).toBe('meditation');
  });

  it('requires two typed chars and two saved chars for word chips', () => {
    learnWord('help');
    learnWord('helpful');
    expect(getSuggestions('h', [])).toEqual([]); // one char — nothing
    const suggs = words(getSuggestions('hel', []));
    expect(suggs).toContain('helpful');
    expect(suggs).not.toContain('help'); // only saves 1 char
  });

  it('mirrors the typed capitalization', () => {
    learnWord('basic');
    expect(words(getSuggestions('Bas', []))[0]).toBe('Basic');
  });

  it('suggests nothing mid-word or with a range selected', () => {
    learnWord('hello');
    expect(getSuggestions('hel', [], 'l')).toEqual([]);
  });

  it('suggests inside apostrophe-quotes (leading quote is not the word)', () => {
    learnWord('hello');
    const suggs = getSuggestions("she said 'hel", []);
    expect(words(suggs)).toContain('hello');
    // The quote itself must not be part of the replaced span.
    const [s] = suggs;
    const r = applySuggestionToText("she said 'hel", 13, s);
    expect(r?.content).toBe("she said 'hello ");
  });
});

describe('tag suggestions', () => {
  beforeEach(freshVocab);

  it('matches a multi-word tag typed from its start, replacing the whole run', () => {
    const suggs = getSuggestions('been reading the basic b', [bookTag]);
    const tag = suggs.find((s) => s.kind === 'tag');
    expect(tag).toMatchObject({ tagId: 'tag-book', replaceLen: 'the basic b'.length });
  });

  it('matches a distinctive word from inside the tag name', () => {
    const suggs = getSuggestions('loved basic', [bookTag]);
    const tag = suggs.find((s) => s.kind === 'tag');
    expect(tag).toMatchObject({ tagId: 'tag-book', replaceLen: 5 });
  });

  it('needs four matched chars unless a whole tag word was typed', () => {
    expect(getSuggestions('bas', [bookTag])).toEqual([]); // 3 chars, partial word
    expect(getSuggestions('gym', [gymTag])).not.toEqual([]); // whole 3-char tag
  });

  it('does not fire on a lone stopword from the tag name', () => {
    expect(getSuggestions('the', [bookTag])).toEqual([]);
  });

  it('does not fire on a 4-char stopword matching a later tag word', () => {
    // "with" passes the TAG_MIN_SPAN length gate on its own — the stopword
    // check must still veto the word-within match.
    const tripTag: Tag = { id: 'tag-trip', userId: 'u', name: 'Trip with Sam', createdAt: 0 };
    expect(getSuggestions('went with', [tripTag])).toEqual([]);
    // ...while a distinctive later word still matches.
    expect(getSuggestions('missing sam', [tripTag])).not.toEqual([]);
  });

  it('still offers the tag when its name is fully typed (tap to attach)', () => {
    const text = "loved the basic b's of being";
    const tag = getSuggestions(text, [bookTag]).find((s) => s.kind === 'tag');
    expect(tag).toMatchObject({ tagId: 'tag-book' });
  });
});

describe('applySuggestionToText', () => {
  beforeEach(freshVocab);

  it('completes a word and moves the caret past the added space', () => {
    learnWord('meditation');
    const [s] = getSuggestions('i love medi', []);
    const r = applySuggestionToText('i love medi', 11, s);
    expect(r).toEqual({ content: 'i love meditation ', caret: 18 });
  });

  it('replaces the typed run with the full tag name without doubling words', () => {
    const text = 'been reading the basic b';
    const [s] = getSuggestions(text, [bookTag]);
    const r = applySuggestionToText(text, text.length, s);
    expect(r?.content).toBe("been reading The Basic B's of Being ");
  });

  it('expands a mid-name word match into the full tag name', () => {
    const text = 'loved basic';
    const [s] = getSuggestions(text, [bookTag]);
    const r = applySuggestionToText(text, text.length, s);
    expect(r?.content).toBe("loved The Basic B's of Being ");
  });

  it('reuses an existing following space instead of doubling it', () => {
    learnWord('meditation');
    const [s] = getSuggestions('medi', []);
    const r = applySuggestionToText('medi already', 4, s);
    expect(r).toEqual({ content: 'meditation already', caret: 11 });
  });

  it('bails on a stale tap that no longer matches the text', () => {
    learnWord('meditation');
    const [s] = getSuggestions('medi', []);
    // Content changed under the tap: replace span is now "walk".
    expect(applySuggestionToText('walk', 4, s)).toBeNull();
  });

  it('adds no dangling space before a newline', () => {
    learnWord('meditation');
    const [s] = getSuggestions('medi', []);
    const r = applySuggestionToText('medi\nnext line', 4, s);
    expect(r).toEqual({ content: 'meditation\nnext line', caret: 10 });
  });
});

describe('seeding from existing notes', () => {
  it('seeds each note once (same note never re-harvested)', async () => {
    const uid = `seed-user-${Date.now()}`;
    await loadVocab(uid);
    await seedVocabFromNotes(uid, [
      makeNote('practicing gratitude and stillness daily', 'Morning pages'),
    ]);
    expect(words(getSuggestions('grat', []))).toContain('gratitude');
    expect(words(getSuggestions('Morn', []))).toContain('Morning');

    // Same note id again (default id 'n'): already harvested, no re-count.
    await seedVocabFromNotes(uid, [makeNote('completely different words')]);
    expect(getSuggestions('comp', [])).toEqual([]);
  });

  it('harvests notes that scroll into the paginated window later', async () => {
    const uid = `seed-user-late-${Date.now()}`;
    await loadVocab(uid);
    const first = { ...makeNote('practicing gratitude daily'), id: 'note-1' };
    await seedVocabFromNotes(uid, [first]);
    // An older note pages in afterwards — it still gets its one-time seed.
    const older = { ...makeNote('phenomenal breakthrough moments'), id: 'note-2' };
    await seedVocabFromNotes(uid, [first, older]);
    expect(words(getSuggestions('phen', []))).toContain('phenomenal');
  });
});
