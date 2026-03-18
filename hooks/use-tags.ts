import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from '@/lib/firebase/firestore';
import { stripUndefined } from '@/lib/firebase/clean';
import type { Tag } from '@/types/note';

export function useTags() {
  const { user } = useAuth();
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
    [user],
  );

  const deleteTag = useCallback(
    async (tagId: string) => {
      if (!user) return;
      await deleteDoc(doc(db, 'tags', tagId));
    },
    [user],
  );

  return { tags, createTag, deleteTag };
}
