import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Note, Tag } from '@/types/note';

/**
 * Personal typing vocabulary + suggestion engine for the notes editor.
 *
 * The store is a per-user word-frequency map that lives in AsyncStorage
 * (device-local — this is the user's own typing model, not shared data).
 * It learns two ways:
 *   1. Live: every time a word boundary is committed while typing in the
 *      note body (see learnFromEdit, called from NoteEditor).
 *   2. One-time seed from the already-loaded notes, so the suggestions are
 *      useful on day one instead of starting cold (seedVocabFromNotes).
 *
 * getSuggestions() turns the text before the caret into up to 3 chips:
 * tag matches first (accepting one also attaches the tag to the note —
 * wired in the editor screen), then the user's own words ranked by how
 * often they've typed them.
 */

// U+0336 combining strike overlay used by the editor's strikethrough tool.
// It rides inside words, so it must be stripped before matching/learning.
const STRIKE_CHAR = '̶';

// A "word" starts with a letter and may contain letters/apostrophes/hyphens
// ("b's", "self-doubt"). Digits are deliberately excluded — numbers aren't
// vocabulary.
const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;
// Chars that can be part of the word the caret is sitting in. Includes the
// strike overlay so a struck word still scans as one word.
const WORDISH_RE = /[A-Za-z'’̶-]/;

const MIN_LEARN_LEN = 3; // shorter words are faster to type than to tap
const MIN_PREFIX = 2; // typed chars before any suggestions appear
const MIN_SAVED = 2; // a word suggestion must extend the prefix by this many
const TAG_MIN_SPAN = 4; // matched chars before a tag chip appears...
const TAG_FULL_WORD_MIN = 3; // ...unless a whole ≥3-char tag word was typed
const MAX_SUGGESTIONS = 3;
const MAX_HARVEST_WORDS = 500; // cap per harvest so a giant paste can't stall
const PRUNE_AT = 4000;
const PRUNE_TO = 3000;
const PERSIST_DELAY_MS = 2000;

// Only used to stop the full-word tag rule from firing on filler ("the" in
// "the basic b's of being" shouldn't summon the tag every sentence). Longer
// spans (TAG_MIN_SPAN) still match through these words.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'but', 'not', 'you', 'all', 'are', 'was', 'can',
  'had', 'has', 'her', 'his', 'him', 'she', 'our', 'out', 'get', 'got',
  'its', 'this', 'that', 'with', 'they', 'from', 'were', 'been', 'have',
  'will', 'your', 'when', 'what', 'then', 'than', 'them', 'into', 'just',
  'like', 'some', 'over', 'also', 'only', 'very', 'much', 'more', 'most',
]);

type VocabEntry = {
  /** Times typed/seen. */
  c: number;
  /** Last-used ms timestamp — tie-breaker so fresh words beat stale ones. */
  t: number;
  /** Display casing. Flips to lowercase once seen lowercase, so only
   *  always-capitalized words (names, titles) keep their capital. */
  d: string;
};

type VocabFile = {
  v: 1;
  /** Note ids already harvested by the cold-start seed. Per-note (not a
   *  single boolean) because the notes list is PAGINATED — notes that scroll
   *  into the window later still deserve their one-time harvest. */
  seededIds: string[];
  words: Record<string, VocabEntry>;
};

export type WordSuggestion = {
  kind: 'word';
  /** What the chip shows and what gets inserted. */
  display: string;
  /** Chars before the caret to replace (the typed prefix). */
  replaceLen: number;
};

export type TagSuggestion = {
  kind: 'tag';
  tagId: string;
  name: string;
  color?: string;
  /** Chars before the caret to replace — may span several words when the
   *  user has typed into a multi-word tag name ("the basic b|"). */
  replaceLen: number;
};

export type Suggestion = WordSuggestion | TagSuggestion;

// ---------------------------------------------------------------------------
// Store lifecycle (module singleton — one signed-in user at a time)
// ---------------------------------------------------------------------------

let uid: string | null = null;
let vocab: VocabFile | null = null;
let loadPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
// Set when the stored file couldn't be READ: a transient read failure must
// not let this session's writes clobber the user's accumulated vocab, so the
// session runs memory-only until a clean load happens.
let persistBlocked = false;

const storageKey = (u: string) => `note-vocab:v1:${u}`;

export function loadVocab(userId: string): Promise<void> {
  if (uid === userId && (vocab || loadPromise)) {
    return loadPromise ?? Promise.resolve();
  }
  uid = userId;
  vocab = null;
  persistBlocked = false;
  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey(userId));
      if (uid !== userId) return; // user switched while loading
      const parsed = raw ? (JSON.parse(raw) as Partial<VocabFile>) : null;
      vocab =
        parsed && parsed.v === 1 && parsed.words
          ? {
              v: 1,
              seededIds: Array.isArray(parsed.seededIds) ? parsed.seededIds : [],
              words: parsed.words,
            }
          : { v: 1, seededIds: [], words: {} };
    } catch (e) {
      console.error('[vocab] load failed', e);
      if (uid === userId) {
        // Suggestions still work this session, but nothing persists — a
        // fresh file written now would overwrite the (unreadable, likely
        // intact) stored vocab.
        vocab = { v: 1, seededIds: [], words: {} };
        persistBlocked = true;
      }
    }
  })();
  return loadPromise;
}

function resetVocabMemory(): void {
  vocab = null;
  uid = null;
  loadPromise = null;
  dirty = false;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}

/**
 * Wipe the stored vocab for `userId` and, if it's the loaded one, the
 * in-memory store too. Called on account deletion: the vocab is derived from
 * the user's private notes, so it must not outlive the account. (It
 * self-heals — a fresh sign-in reseeds from the notes.)
 */
export async function clearVocab(userId: string): Promise<void> {
  if (uid === userId) resetVocabMemory();
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch {
    /* best-effort */
  }
}

/**
 * Sign-out sweep: reset the in-memory store and remove EVERY stored vocab
 * file (sign-out has no uid in hand — the auth user may already be gone).
 * The in-memory reset matters as much as the storage sweep: a stale
 * singleton would serve the old user's words to the next session and
 * re-persist them on the next flush.
 */
export async function clearAllVocab(): Promise<void> {
  resetVocabMemory();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const vocabKeys = keys.filter((k) => k.startsWith('note-vocab:v1:'));
    if (vocabKeys.length > 0) await AsyncStorage.multiRemove(vocabKeys);
  } catch {
    /* best-effort */
  }
}

function schedulePersist() {
  dirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushVocab();
  }, PERSIST_DELAY_MS);
}

/** Write pending vocab changes now (called on editor unmount; otherwise the
 *  debounce handles it). Safe to call any time. */
export async function flushVocab(): Promise<void> {
  if (!dirty || !vocab || !uid || persistBlocked) return;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  prune();
  try {
    await AsyncStorage.setItem(storageKey(uid), JSON.stringify(vocab));
    // Only mark clean on success — a failed write keeps the learning dirty
    // so the next flush retries instead of silently dropping it.
    dirty = false;
  } catch (e) {
    console.error('[vocab] persist failed', e);
  }
}

function prune() {
  if (!vocab) return;
  const keys = Object.keys(vocab.words);
  if (keys.length <= PRUNE_AT) return;
  const words = vocab.words;
  keys.sort((a, b) => words[b].c - words[a].c || words[b].t - words[a].t);
  const keep: Record<string, VocabEntry> = {};
  for (const k of keys.slice(0, PRUNE_TO)) keep[k] = words[k];
  vocab.words = keep;
}

// ---------------------------------------------------------------------------
// Learning
// ---------------------------------------------------------------------------

/** Canonical map key: lowercase, straight apostrophe, no strike overlay. */
function toKey(word: string): string {
  return word.toLowerCase().replace(/’/g, "'");
}

function bump(word: string, now: number) {
  if (!vocab) return;
  // Strip strike overlays and dangling trailing punctuation ("dogs'" → dogs).
  const clean = word.split(STRIKE_CHAR).join('').replace(/['’-]+$/, '');
  if (clean.length < MIN_LEARN_LEN) return;
  const key = toKey(clean);
  const entry = vocab.words[key];
  if (entry) {
    entry.c += 1;
    entry.t = now;
    if (clean === clean.toLowerCase()) entry.d = clean;
  } else {
    vocab.words[key] = { c: 1, t: now, d: clean };
  }
  schedulePersist();
}

/** Record one deliberate use of a word (e.g. an accepted suggestion). */
export function learnWord(word: string) {
  bump(word, Date.now());
}

function harvestText(text: string) {
  if (!vocab) return;
  const now = Date.now();
  const matches = text.split(STRIKE_CHAR).join('').match(WORD_RE);
  if (!matches) return;
  for (const w of matches.slice(0, MAX_HARVEST_WORDS)) bump(w, now);
}

/**
 * Learn from one content edit (prev → next). Only fires when the edit
 * committed a word boundary — a separator keystroke finalizing the word
 * before it, an autocorrect replacement (word + space arrive together), or
 * a paste. Backspaces and mid-word keystrokes teach nothing.
 */
export function learnFromEdit(prev: string, next: string) {
  if (!vocab) return;
  // Diff: common prefix / common suffix → the inserted segment.
  const minLen = Math.min(prev.length, next.length);
  let a = 0;
  while (a < minLen && prev[a] === next[a]) a++;
  let b = 0;
  while (b < minLen - a && prev[prev.length - 1 - b] === next[next.length - 1 - b]) b++;
  const inserted = next.slice(a, next.length - b);
  if (!inserted) return;
  // No boundary in the insertion → the word is still being typed.
  if (!/[^A-Za-z'’̶-]/.test(inserted)) return;
  // Extend left to the start of the word the insertion completed (typing
  // the space after "hello" inserts just " " — the word sits before it).
  let from = a;
  while (from > 0 && WORDISH_RE.test(next[from - 1])) from--;
  harvestText(next.slice(from, next.length - b));
}

/**
 * Cold-start seed: harvest every loaded note the vocab hasn't seen yet, so
 * the model reflects how the user already writes. Incremental per note id
 * (not once-globally) because the notes list is paginated — as older notes
 * scroll into the window they get their one-time harvest too. Edits after
 * that are covered by live learning.
 */
export async function seedVocabFromNotes(userId: string, notes: Note[]): Promise<void> {
  await loadVocab(userId);
  if (!vocab || notes.length === 0 || uid !== userId) return;
  const seeded = new Set(vocab.seededIds);
  let any = false;
  for (const n of notes) {
    if (seeded.has(n.id)) continue;
    seeded.add(n.id);
    any = true;
    harvestText(n.title);
    harvestText(n.content);
    if (n.description) harvestText(n.description);
  }
  if (!any) return;
  vocab.seededIds = Array.from(seeded);
  schedulePersist();
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

/** Index where the word containing the caret starts. */
function currentWordStart(text: string, caret: number): number {
  let i = caret;
  while (i > 0 && WORDISH_RE.test(text[i - 1])) i--;
  // WORDISH_RE includes apostrophes for contractions, so the scan-back
  // absorbs an OPENING quote ("said 'he|" → "'he"). No word starts with an
  // apostrophe (WORD_RE requires a letter), so step past any leading ones —
  // otherwise nothing typed inside apostrophe-quotes ever matches.
  while (i < caret && (text[i] === "'" || text[i] === '’')) i++;
  return i;
}

/**
 * How many chars immediately before the caret the tag would replace if
 * accepted — 0 when this tag shouldn't be suggested.
 *
 * Two ways in, longest match wins:
 *  - Aligned run: the typed tail spells the tag name from its start
 *    ("…the basic b|" for tag "the basic b's of being") — accepting
 *    replaces the whole run, so no words get doubled.
 *  - Word-within: the current word matches a later word of the tag name
 *    ("basi|" → "basic") — accepting replaces just the current word.
 */
function tagMatchSpan(
  textBeforeCaret: string,
  rawPrefix: string,
  rawSpanLen: number,
  name: string,
): number {
  const prefix = toKey(rawPrefix);
  if (!prefix) return 0;
  const tokens = name.split(/\s+/).filter(Boolean).map(toKey);
  let best = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok.startsWith(prefix)) continue;
    const fullWord =
      prefix === tok && tok.length >= TAG_FULL_WORD_MIN && !STOPWORDS.has(tok);
    let span = 0;
    const lead = tokens.slice(0, i).join(' ');
    const expected = i === 0 ? prefix : `${lead} ${prefix}`;
    const from = textBeforeCaret.length - expected.length;
    if (from >= 0) {
      const typed = toKey(textBeforeCaret.slice(from));
      const boundaryOk = from === 0 || !WORDISH_RE.test(textBeforeCaret[from - 1]);
      if (typed === expected && boundaryOk) span = expected.length;
    }
    // Later-word match without the aligned lead: replace just the current
    // word. Stopwords don't qualify no matter their length — "with" typed
    // anywhere must not summon a "Trip with Sam" chip. The span counts RAW
    // chars (rawSpanLen, strike overlays included) because the caller
    // replaces a raw slice of the content.
    if (span === 0 && i > 0 && !STOPWORDS.has(prefix)) span = rawSpanLen;
    if (span === 0) continue;
    if (span >= TAG_MIN_SPAN || fullWord) best = Math.max(best, span);
  }
  return best;
}

/**
 * Apply an accepted suggestion to the content: replace the matched span
 * before the caret with the full word/tag name plus a trailing space, and
 * return the new caret. Returns null when the text no longer matches what
 * the suggestion was computed against (a tap racing a keystroke) — callers
 * treat that as a no-op.
 */
export function applySuggestionToText(
  content: string,
  caret: number,
  s: Suggestion,
): { content: string; caret: number } | null {
  const span = Math.min(s.replaceLen, caret);
  const typed = toKey(content.slice(caret - span, caret).split(STRIKE_CHAR).join(''));
  const insert = s.kind === 'tag' ? s.name : s.display;
  const insertKey = toKey(insert);
  // The replaced span must still be a prefix of the inserted text, or of
  // one of its words (the word-within tag match).
  const stillMatches =
    insertKey.startsWith(typed) || insertKey.split(/\s+/).some((w) => w.startsWith(typed));
  if (!typed || !stillMatches) return null;
  const before = content.slice(0, caret - span);
  const after = content.slice(caret);
  // Reuse an existing following space; add none before a newline (a dangling
  // "word \n" trailing space helps no one). Otherwise append one.
  const space = after.startsWith(' ') || after.startsWith('\n') ? '' : ' ';
  const caretOut =
    before.length + insert.length + (space || after.startsWith(' ') ? 1 : 0);
  return {
    content: before + insert + space + after,
    caret: caretOut,
  };
}

/**
 * Up to MAX_SUGGESTIONS chips for the text sitting before the caret.
 * `nextChar` is the char at the caret (undefined at end of text) — no
 * suggestions mid-word.
 */
export function getSuggestions(
  textBeforeCaret: string,
  tags: Tag[],
  nextChar?: string,
): Suggestion[] {
  if (nextChar && WORDISH_RE.test(nextChar)) return [];
  const caret = textBeforeCaret.length;
  const start = currentWordStart(textBeforeCaret, caret);
  const rawSpan = textBeforeCaret.slice(start);
  const rawPrefix = rawSpan.split(STRIKE_CHAR).join('');
  if (!rawPrefix) return [];
  const prefix = toKey(rawPrefix);

  const out: Suggestion[] = [];

  // Tags first — attaching a tag is the highest-value completion. Evaluated
  // from the first typed char (unlike words) because a multi-word tag match
  // can be deep into the name while the CURRENT word is still one char
  // ("the basic b|") — tagMatchSpan's own span threshold keeps out noise.
  const tagMatches: { tag: Tag; span: number }[] = [];
  for (const tag of tags) {
    const name = tag.name.trim();
    if (!name) continue;
    const span = tagMatchSpan(textBeforeCaret, rawPrefix, rawSpan.length, name);
    if (span > 0) tagMatches.push({ tag, span });
  }
  tagMatches.sort((x, y) => y.span - x.span);
  for (const m of tagMatches.slice(0, 2)) {
    out.push({
      kind: 'tag',
      tagId: m.tag.id,
      name: m.tag.name.trim(),
      color: m.tag.color,
      replaceLen: m.span,
    });
  }

  // The user's own words, ranked by how often they type them.
  if (vocab && rawPrefix.length >= MIN_PREFIX) {
    const cands: { entry: VocabEntry }[] = [];
    for (const key of Object.keys(vocab.words)) {
      if (!key.startsWith(prefix)) continue;
      if (key.length - prefix.length < MIN_SAVED) continue;
      cands.push({ entry: vocab.words[key] });
    }
    cands.sort((x, y) => y.entry.c - x.entry.c || y.entry.t - x.entry.t);
    for (const c of cands) {
      if (out.length >= MAX_SUGGESTIONS) break;
      let display = c.entry.d;
      // Mirror the typed capitalization: "Bas" → "Basic".
      const first = rawPrefix[0];
      if (first === first.toUpperCase() && first !== first.toLowerCase()) {
        display = display[0].toUpperCase() + display.slice(1);
      }
      out.push({ kind: 'word', display, replaceLen: rawSpan.length });
    }
  }

  return out.slice(0, MAX_SUGGESTIONS);
}
