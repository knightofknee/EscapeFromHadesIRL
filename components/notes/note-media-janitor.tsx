import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDocsFromServer } from 'firebase/firestore';
import { useAuth } from '@/contexts/auth-context';
import { db, collection, query, where } from '@/lib/firebase/firestore';
import { listMedia, sweepOrphans } from '@/lib/note-media';

const SWEEP_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
// Let launch-time work (listeners, boot routing) settle first.
const START_DELAY_MS = 20_000;

/**
 * Weekly cleanup of photo/video files no note references anymore (deleted
 * notes, photos backspaced out of a note). Renders nothing.
 *
 * Safety: the sweep needs EVERY note body, so it reads the full set from the
 * SERVER (never the offline cache, which may hold only some notes) and skips
 * the run on any error. sweepOrphans also leaves files younger than a few
 * days alone, covering edits still syncing from another phone.
 */
export function NoteMediaJanitor() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const key = `@efh_media_sweep:${uid}`;
        const last = Number(await AsyncStorage.getItem(key)) || 0;
        if (Date.now() - last < SWEEP_EVERY_MS) return;
        if (listMedia(uid).length > 0) {
          const snap = await getDocsFromServer(query(collection(db, 'notes'), where('userId', '==', uid)));
          if (cancelled) return;
          const bodies: string[] = [];
          for (const d of snap.docs) {
            const content = d.data().content;
            if (typeof content === 'string') bodies.push(content);
          }
          const removed = sweepOrphans(uid, bodies);
          if (removed > 0) console.log(`[media-janitor] removed ${removed} unused file(s)`);
        }
        await AsyncStorage.setItem(key, String(Date.now()));
      })().catch((e) => console.warn('[media-janitor] skipped', e));
    }, START_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);

  return null;
}
