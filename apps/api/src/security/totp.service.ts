import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { base32Decode, base32Encode } from './base32';

export interface TotpOptions {
  /** Time step in seconds (RFC 6238 default 30). */
  readonly periodSeconds: number;
  /** Number of digits in the code (default 6). */
  readonly digits: number;
  /** Verification window of steps on each side (default 1 → ±30s). */
  readonly window: number;
}

const DEFAULTS: TotpOptions = { periodSeconds: 30, digits: 6, window: 1 };

/**
 * RFC 6238 Time-based One-Time Password (HMAC-SHA1). Mandatory 2FA before broker connect
 * (App Flow §3, Full Doc VII.2). Zero external dependencies.
 *
 * The raw secret never leaves the encryption boundary in production — it is envelope-encrypted
 * in `core.mfa_factors.secret_encrypted` and only materialised in-process to derive a code.
 */
@Injectable()
export class TotpService {
  /** Generate a new random base32 secret (160-bit, RFC 6238 recommended). */
  generateSecret(): string {
    return base32Encode(randomBytes(20));
  }

  /** Build an otpauth:// URI for QR enrolment. */
  keyUri(secretBase32: string, accountEmail: string, issuer = 'RM07 Quant Terminal'): string {
    const label = encodeURIComponent(`${issuer}:${accountEmail}`);
    const params = new URLSearchParams({
      secret: secretBase32,
      issuer,
      algorithm: 'SHA1',
      digits: String(DEFAULTS.digits),
      period: String(DEFAULTS.periodSeconds),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  /** Compute the code for a given Unix time (seconds). */
  generateCode(
    secretBase32: string,
    atUnixSeconds: number = Math.floor(Date.now() / 1000),
    options: Partial<TotpOptions> = {},
  ): string {
    const opt = { ...DEFAULTS, ...options };
    const counter = Math.floor(atUnixSeconds / opt.periodSeconds);
    return this.hotp(secretBase32, counter, opt.digits);
  }

  /**
   * Verify a submitted token within the allowed window using a constant-time comparison.
   * Returns true on match.
   */
  verify(
    secretBase32: string,
    token: string,
    atUnixSeconds: number = Math.floor(Date.now() / 1000),
    options: Partial<TotpOptions> = {},
  ): boolean {
    const opt = { ...DEFAULTS, ...options };
    const trimmed = token.trim();
    if (!/^\d+$/u.test(trimmed) || trimmed.length !== opt.digits) {
      return false;
    }
    const counter = Math.floor(atUnixSeconds / opt.periodSeconds);
    for (let i = -opt.window; i <= opt.window; i += 1) {
      const candidate = this.hotpFromCounter(secretBase32, counter + i, opt.digits);
      if (this.constantTimeEquals(candidate, trimmed)) {
        return true;
      }
    }
    return false;
  }

  private hotp(secretBase32: string, counter: number, digits: number): string {
    return this.hotpFromCounter(secretBase32, counter, digits);
  }

  private hotpFromCounter(secretBase32: string, counter: number, digits: number): string {
    const key = base32Decode(secretBase32);
    const counterBuf = Buffer.alloc(8);
    // 64-bit big-endian counter.
    counterBuf.writeBigUInt64BE(BigInt(Math.max(0, counter)));
    const digest = createHmac('sha1', key).update(counterBuf).digest();
    const offset = digest[digest.length - 1]! & 0x0f;
    const binary =
      ((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff);
    const otp = binary % 10 ** digits;
    return otp.toString().padStart(digits, '0');
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
