import * as Crypto from 'expo-crypto';

/**
 * Cryptographically-secure random nonce as a hex string. Default 16 bytes
 * (128 bits of entropy). Use for OAuth replay-protection nonces (e.g. Apple
 * Sign In) — never `Math.random()`, which is not cryptographically secure
 * and undermines the nonce's whole purpose.
 */
export async function generateNonce(bytes = 16): Promise<string> {
  const raw = await Crypto.getRandomBytesAsync(bytes);
  return Array.from(raw)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 hex digest of a string. */
export function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}
