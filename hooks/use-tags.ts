import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useOfflineGuard } from '@/contexts/offline-context';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
} from '@/lib/firebase/firestore';
import { stripUndefined } from '@/lib/firebase/clean';
import type { Tag } from '@/types/note';

export function useTags() {
  const { user } = useAuth();
  const { requireOnline } = useOfflineGuard();
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (!user) {
      setTags([]);
      return;
    }

    const q = query(collection(db, 'tags'), where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Tag);
      setTags(data);
    });

    return unsubscribe;
  }, [user]);

  const createTag = useCallback(
    async (name: string, color?: string) => {
      if (!user) return;
      if (!requireOnline()) return;
      const ref = doc(collection(db, 'tags'));
      const newTag: Tag = {
        id: ref.id,
        userId: user.uid,
        name,
        color,
        createdAt: Date.now(),
      };
      await setDoc(ref, stripUndefined(newTag));
      return newTag;
    },
    [user, requireOnline],
  );

  const deleteTag = useCallback(
    async (tagId: string) => {
      if (!user) return;
      // No requireOnline guard: deleteTag is called by the notes-list focus
      // effect to garbage-collect orphaned tags. An alert there would fire
      // every time the user re-enters the notes tab offline. Firestore
      // queues the delete and applies it on reconnect.
      await deleteDoc(doc(db, 'tags', tagId));
    },
    [user],
  );

  // Batched delete for the orphan-tag GC sweep — one commit instead of N
  // individual deletes. Chunks at Firestore's 500-write batch limit.
  const deleteTags = useCallback(
    async (tagIds: string[]) => {
      if (!user || tagIds.length === 0) return;
      let batch = writeBatch(db);
      let n = 0;
      for (const id of tagIds) {
        batch.delete(doc(db, 'tags', id));
        n++;
        if (n === 500) {
          await batch.commit();
          batch = writeBatch(db);
          n = 0;
        }
      }
      if (n > 0) await batch.commit();
    },
    [user],
  );

  return { tags, createTag, deleteTag, deleteTags };
}
