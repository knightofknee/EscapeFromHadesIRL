/**
 * Strip undefined values from an object before writing to Firestore.
 * Firestore rejects undefined — optional fields must be omitted entirely.
 */
export function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined),
  ) as T;
}
