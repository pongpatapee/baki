import { getRandomValues } from 'expo-crypto';

/**
 * Time-ordered UUIDv7 (RFC 9562): globally unique, so rows created on different
 * devices never collide once sync exists, and roughly sequential for index locality.
 */
export function newId(): string {
  const bytes = getRandomValues(new Uint8Array(16));
  const ms = Date.now();
  // 48-bit big-endian unix ms timestamp
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;
  bytes[6] = 0x70 | (bytes[6]! & 0x0f); // version 7
  bytes[8] = 0x80 | (bytes[8]! & 0x3f); // RFC variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Current UTC time as epoch milliseconds. */
export function now(): number {
  return Date.now();
}

/** Timestamps for a freshly created row. */
export function createdStamps(at: number = now()) {
  return { createdAt: at, updatedAt: at, deletedAt: null };
}
