import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Algorithm, hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/** Minimum password length (Full Doc VII.2). */
export const MIN_PASSWORD_LENGTH = 12;

/** OWASP-aligned Argon2id parameters (19 MiB, t=2, p=1). */
const ARGON_OPTS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export type Fetcher = typeof globalThis.fetch;

export class WeakPasswordError extends Error {
  constructor(
    message: string,
    readonly reason: 'too_short' | 'pwned',
  ) {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

/**
 * Password hashing + strength enforcement (Full Doc VII.2): Argon2id, 12-char minimum, and a
 * Have I Been Pwned k-anonymity check (only a SHA-1 prefix is ever sent to the API; the full
 * hash and the password never leave the process).
 */
@Injectable()
export class PasswordService {
  async hashPassword(plain: string): Promise<string> {
    return argonHash(plain, ARGON_OPTS);
  }

  async verifyPassword(hashed: string, plain: string): Promise<boolean> {
    try {
      // Parameters are read from the encoded hash; do not override with ARGON_OPTS.
      return await argonVerify(hashed, plain);
    } catch {
      // Malformed hash, etc. — never throw raw to the caller; treat as a failed match.
      return false;
    }
  }

  /**
   * Returns the number of times the password appears in known breaches (0 = not found).
   * Uses HIBP range API with k-anonymity + response padding.
   */
  async pwnedCount(plain: string, fetcher: Fetcher = globalThis.fetch): Promise<number> {
    const sha1 = createHash('sha1').update(plain, 'utf8').digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
    });
    if (!res.ok) {
      throw new Error(`HIBP request failed: ${res.status}`);
    }
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [hashSuffix, countStr] = line.trim().split(':');
      if (hashSuffix === suffix) {
        const count = Number.parseInt(countStr ?? '0', 10);
        return Number.isFinite(count) ? count : 0;
      }
    }
    return 0;
  }

  /**
   * Throws WeakPasswordError if the password is too short or appears in a breach.
   * If `fetcher` is omitted and the HIBP call fails, the breach check is skipped (fail-open on
   * the network, fail-closed on length) so a HIBP outage cannot lock out all sign-ups; the
   * length floor still applies.
   */
  async assertStrong(plain: string, fetcher: Fetcher = globalThis.fetch): Promise<void> {
    if (plain.length < MIN_PASSWORD_LENGTH) {
      throw new WeakPasswordError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        'too_short',
      );
    }
    let count = 0;
    try {
      count = await this.pwnedCount(plain, fetcher);
    } catch {
      return; // HIBP unavailable — do not block signup on a third-party outage.
    }
    if (count > 0) {
      throw new WeakPasswordError(
        'This password has appeared in a known data breach. Choose a different one.',
        'pwned',
      );
    }
  }
}
