/** No 0/O/1/I/L, so a code read aloud or typed can't be misread. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 10;

/** An invite code from secure random bytes (one character per byte). */
export function codeFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function inviteUrl(code: string): string {
  return `https://www.waldgrave.com/escapefromhadesirl/friend/${code}`;
}

/** Codes are case-insensitive and may be pasted with spaces or dashes. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** A friendship's doc id: the two uids sorted and joined, so a pair can't be duplicated (the rules check this). */
export function pairId(a: string, b: string): { id: string; memberIds: [string, string] } {
  const memberIds: [string, string] = a < b ? [a, b] : [b, a];
  return { id: `${memberIds[0]}_${memberIds[1]}`, memberIds };
}
