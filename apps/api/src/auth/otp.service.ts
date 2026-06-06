import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

/** DI token for the OTP pepper (server secret; from Doppler, ephemeral in dev). */
export const OTP_PEPPER = Symbol('OTP_PEPPER');

/** Email OTP policy (App Flow §3, J-01): 6 digits, 5-minute validity, 5 attempts. */
export const OTP_DIGITS = 6;
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;

/**
 * Email one-time passcodes. The code is crypto-random and stored only as an HMAC (keyed with a
 * server pepper) so a database leak does not reveal active codes; the 5-minute TTL and
 * 5-attempt cap (enforced by AuthService against the store in Part 2b) bound brute force.
 */
@Injectable()
export class OtpService {
  private readonly pepper: Buffer;

  constructor(@Inject(OTP_PEPPER) pepper: string) {
    if (!pepper || pepper.length < 16) {
      throw new Error('OTP pepper must be at least 16 characters');
    }
    this.pepper = Buffer.from(pepper, 'utf8');
  }

  /** Generate a zero-padded N-digit code using a uniform CSPRNG draw. */
  generateCode(): string {
    const max = 10 ** OTP_DIGITS;
    return randomInt(0, max).toString().padStart(OTP_DIGITS, '0');
  }

  /** Keyed hash for storage. */
  hash(code: string): string {
    return createHmac('sha256', this.pepper).update(code).digest('hex');
  }

  /** Constant-time check of a presented code against a stored hash. */
  verify(presentedCode: string, storedHash: string): boolean {
    const trimmed = presentedCode.trim();
    if (!/^\d+$/u.test(trimmed) || trimmed.length !== OTP_DIGITS) {
      return false;
    }
    const candidate = Buffer.from(this.hash(trimmed), 'utf8');
    const expected = Buffer.from(storedHash, 'utf8');
    if (candidate.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(candidate, expected);
  }

  expiresAt(now: Date = new Date()): Date {
    return new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
  }
}
