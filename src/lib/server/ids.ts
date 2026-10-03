import 'server-only';
import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** URL に載せやすい12文字のID */
export function newId(): string {
  const bytes = randomBytes(12);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 36];
  return out;
}
