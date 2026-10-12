import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the user last was (notes list or a specific note) and when they last
 * had the app in front of them. Backs the "remember where you were" restore:
 * within the new-note-reset window (or with fresh-note-on-open off) the app
 * reopens to this view; past the window it opens a fresh note instead.
 */
const LAST_VIEW_KEY = '@lastView';
const LAST_ACTIVE_KEY = '@lastActiveAt';

export type LastView = { type: 'list' } | { type: 'note'; id: string };

export function recordListView(): void {
  AsyncStorage.setItem(LAST_VIEW_KEY, 'list').catch(() => {});
}

export function recordNoteView(noteId: string): void {
  AsyncStorage.setItem(LAST_VIEW_KEY, `note:${noteId}`).catch(() => {});
}

/** Forget a deleted note so the restore lands on the list, not "not found". */
export async function clearNoteView(noteId: string): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(LAST_VIEW_KEY);
    if (v === `note:${noteId}`) await AsyncStorage.setItem(LAST_VIEW_KEY, 'list');
  } catch {}
}

export async function getLastView(): Promise<LastView> {
  try {
    const v = await AsyncStorage.getItem(LAST_VIEW_KEY);
    if (v?.startsWith('note:')) return { type: 'note', id: v.slice('note:'.length) };
  } catch {}
  return { type: 'list' };
}

/** Stamp "the user stopped looking at the app now" (background/inactive). */
export function recordAppHidden(): void {
  AsyncStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())).catch(() => {});
}

/** ms timestamp of the last time the app went out of sight, or null. */
export async function getLastHiddenAt(): Promise<number | null> {
  try {
    const v = await AsyncStorage.getItem(LAST_ACTIVE_KEY);
    const parsed = v ? parseInt(v, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
