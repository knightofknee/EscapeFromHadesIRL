import { deleteUser, type User } from 'firebase/auth';
import { db, collection, query, where, getDocs, writeBatch } from './firestore';

const USER_COLLECTIONS = ['habits', 'records', 'notes', 'tags'];

export async function deleteAccountAndData(user: User): Promise<void> {
  let batch = writeBatch(db);
  let batchCount = 0;

  for (const col of USER_COLLECTIONS) {
    const q = query(collection(db, col), where('userId', '==', user.uid));
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      batch.delete(docSnap.ref);
      batchCount++;

      if (batchCount === 500) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  await deleteUser(user);
}
