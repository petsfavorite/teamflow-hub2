// Constant-time string comparison to prevent timing attacks on secrets/HMACs.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// PBKDF2-SHA256 hashing for session PINs.
// Uses the user's email as salt so no separate salt field is needed.
const PIN_HASH_ITERATIONS = 100000;

export async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PIN_HASH_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin: string, salt: string, storedHash: string): Promise<boolean> {
  const hash = await hashPin(pin, salt);
  return timingSafeEqual(hash, storedHash);
}

// Check if a stored PIN value is a PBKDF2 hash (64 hex chars) vs plaintext (6 digits).
export function isPinHashed(storedPin: string): boolean {
  return storedPin.length === 64 && /^[0-9a-f]+$/.test(storedPin);
}