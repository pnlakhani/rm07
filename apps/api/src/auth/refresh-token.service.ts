import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PasswordService } from '../security/password.service';

/** Refresh-token lifetime: 30 days (Full Doc VII.2). */
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface IssuedRefreshToken {
  /** The opaque token handed to the client (in an httpOnly cookie). Never stored raw. */
  readonly token: string;
  /** Argon2id hash to persist in core.sessions.refresh_token_hash. */
  readonly hash: string;
  /** Absolute expiry. */
  readonly expiresAt: Date;
}

/**
 * Rotating refresh tokens (Full Doc VII.2, Backend Schema §5.3). The raw token is 256-bit and
 * is never stored — only its Argon2id hash. On every use the session must be rotated: verify the
 * presented token against the stored hash, then issue a fresh token + hash and revoke the old
 * session row (handled by AuthService against core.sessions in Part 2b).
 */
@Injectable()
export class RefreshTokenService {
  constructor(private readonly passwords: PasswordService) {}

  /** Mint a new opaque refresh token plus its storable hash and expiry. */
  async issue(now: Date = new Date()): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const hash = await this.passwords.hashPassword(token);
    const expiresAt = new Date(now.getTime() + REFRESH_TTL_SECONDS * 1000);
    return { token, hash, expiresAt };
  }

  /** Verify a presented token against a stored hash (constant-time inside Argon2). */
  async verify(storedHash: string, presentedToken: string): Promise<boolean> {
    return this.passwords.verifyPassword(storedHash, presentedToken);
  }

  isExpired(expiresAt: Date, now: Date = new Date()): boolean {
    return expiresAt.getTime() <= now.getTime();
  }
}
