import { deleteUser, type User } from 'firebase/auth';
import {
  db,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
} from './firestore';

// Every top-level collection that stores this user's data keyed by a
// `userId` field. KEEP IN SYNC with the app's write paths — a collection
// missing here is data orphaned forever after account deletion (a GDPR /
// CCPA "right to erasure" problem, made worse by this being a Firebase
// project shared with other apps). userSettings is handled separately
// below because its doc id IS the uid (no `userId` field to query on).
export const USER_DATA_COLLECTIONS = [
  'habits',
  'records',
  'notes',
  'tags',
  'quests',
  'vacationDays',
] as const;

/**
 * Deletes ALL of the user's Firestore data, then the auth account.
 *
 * NOTE on ordering: data must be deleted while the user is still
 * authenticated (the security rules require `request.auth.uid`), so the
 * auth account is deleted last. `deleteUser` can throw
 * `auth/requires-recent-login`; callers should reauthenticate immediately
 * before invoking this so that doesn't happen mid-flight. (See the delete
 * flow in additional-settings.tsx.)
 */
export async function deleteAccountAndData(user: User): Promise<void> {
  let batch = writeBatch(db);
  let batchCount = 0;

  const flush = async () => {
    if (batchCount > 0) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  };

  const enqueueDelete = async (ref: Parameters<typeof batch.delete>[0]) => {
    batch.delete(ref);
    batchCount++;
    if (batchCount === 500) await flush();
  };

  for (const col of USER_DATA_COLLECTIONS) {
    const snapshot = await getDocs(
      query(collection(db, col), where('userId', '==', user.uid)),
    );
    for (const docSnap of snapshot.docs) {
      // Notes own a per-item `items` subcollection that Firestore does NOT
      // cascade-delete when the parent note is removed — sweep it before
      // deleting the note doc, or the items live on as orphaned user data
      // (a GDPR "right to erasure" gap). A direct subcollection read per
      // note needs no collection-group index, so this can't fail the whole
      // deletion on a missing index. The `userId` filter is required: the
      // items rule scopes reads on it (rules are filters, not row-level
      // masks), so an unfiltered list would be denied.
      if (col === 'notes') {
        const itemsSnap = await getDocs(
          query(collection(docSnap.ref, 'items'), where('userId', '==', user.uid)),
        );
        for (const itemSnap of itemsSnap.docs) await enqueueDelete(itemSnap.ref);
      }
      await enqueueDelete(docSnap.ref);
    }
  }

  // userSettings doc id == the uid.
  batch.delete(doc(db, 'userSettings', user.uid));
  batchCount++;
  await flush();

  await deleteUser(user);
}
