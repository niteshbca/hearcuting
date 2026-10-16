import crypto from 'crypto';

const BOOKING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** Human-friendly unique booking reference, e.g. SP-7K4M9Q */
export function bookingReference(): string {
  let out = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += BOOKING_ALPHABET[bytes[i] % BOOKING_ALPHABET.length];
  return `SP-${out}`;
}

/** Short random code for coupons / package codes. */
export function shortCode(len = 8): string {
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += BOOKING_ALPHABET[bytes[i] % BOOKING_ALPHABET.length];
  return out;
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
