import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from './app';

export const storage = getStorage(app);

export async function uploadImage(path: string, blob: Blob): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}
