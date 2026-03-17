import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { app } from './app';

export const db = getFirestore(app);

export {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
};
export type { DocumentData, QueryConstraint };

// Typed helper for getting a document reference
export function typedDoc(collectionName: string, docId: string) {
  return doc(db, collectionName, docId);
}

// Typed helper for getting a collection reference
export function typedCollection(collectionName: string) {
  return collection(db, collectionName);
}

// Helper for building queries
export function buildQuery(collectionName: string, ...constraints: QueryConstraint[]) {
  return query(collection(db, collectionName), ...constraints);
}
