import { randomBytes } from 'crypto';

export const FORENSIC_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const FORENSIC_CODE_LENGTH = 6;

export function generateForensicCode(): string {
  const alphabetLength = FORENSIC_CODE_ALPHABET.length;
  // 31 is the length of FORENSIC_CODE_ALPHABET.
  // Largest multiple of 31 below 256 is 248 (31 * 8 = 248).
  // Any byte >= 248 is discarded to guarantee uniform, unbiased random distribution.
  const maxUnbiasedByte = 248;
  const result: string[] = [];

  while (result.length < FORENSIC_CODE_LENGTH) {
    const bytes = randomBytes(FORENSIC_CODE_LENGTH * 2);
    for (let i = 0; i < bytes.length && result.length < FORENSIC_CODE_LENGTH; i++) {
      const byte = bytes[i];
      if (byte < maxUnbiasedByte) {
        result.push(FORENSIC_CODE_ALPHABET[byte % alphabetLength]);
      }
    }
  }

  return result.join('');
}
