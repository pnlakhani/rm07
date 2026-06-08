import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

/** DI token for the access-JWT signing secret (from Doppler; ephemeral in dev). */
export const JWT_ACCESS_SECRET = Symbol('JWT_ACCESS_SECRET');

/** Access-token lifetime: 15 minutes (Full Doc VII.2). */
export const ACCESS_TTL_SECONDS = 15 * 60;
/** Default grant lifetime: 10 minutes (onboarding TOTP enrolment window). */
export const GRANT_TTL_SECONDS = 10 * 60;
export const JWT_ISSUER = 'rm07';

export interface AccessClaims {
  /** Subject — the account id (as string). */
  sub: string;
  /** Session id (FK to core.sessions) so a token can be tied to a revocable session. */
  sid: string;
}

export interface VerifiedClaims extends AccessClaims {
  typ: 'access';
  iat: number;
  exp: number;
  iss: string;
}

export interface VerifiedGrant {
  typ: 'grant';
  sub: string;
  scope: string;
  iat: number;
  exp: number;
  iss: string;
}

export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

interface JwtHeader {
  alg: 'HS256';
  typ: 'JWT';
}

const HEADER: JwtHeader = { alg: 'HS256', typ: 'JWT' };

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * Minimal, dependency-free HS256 JWT. Issues two token types, separated by a `typ` claim:
 *  - `access` — short-lived bearer tokens tied to a revocable session.
 *  - `grant`  — short-lived scoped tokens for onboarding steps (e.g. TOTP enrolment) that are
 *    not yet a full session. Verification is constant-time and checks alg, signature, issuer,
 *    type and expiry.
 */
@Injectable()
export class JwtService {
  private readonly secret: Buffer;

  constructor(@Inject(JWT_ACCESS_SECRET) secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error('JWT access secret must be at least 16 characters');
    }
    this.secret = Buffer.from(secret, 'utf8');
  }

  sign(claims: AccessClaims, nowSeconds: number = Math.floor(Date.now() / 1000)): string {
    return this.encode({
      typ: 'access',
      sub: claims.sub,
      sid: claims.sid,
      iat: nowSeconds,
      exp: nowSeconds + ACCESS_TTL_SECONDS,
      iss: JWT_ISSUER,
    });
  }

  signGrant(
    sub: string,
    scope: string,
    ttlSeconds: number = GRANT_TTL_SECONDS,
    nowSeconds: number = Math.floor(Date.now() / 1000),
  ): string {
    return this.encode({
      typ: 'grant',
      sub,
      scope,
      iat: nowSeconds,
      exp: nowSeconds + ttlSeconds,
      iss: JWT_ISSUER,
    });
  }

  verify(token: string, nowSeconds: number = Math.floor(Date.now() / 1000)): VerifiedClaims {
    const payload = this.decodeVerified<VerifiedClaims>(token, nowSeconds);
    if (payload.typ !== 'access') {
      throw new InvalidTokenError('Not an access token');
    }
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new InvalidTokenError('Missing claims');
    }
    return payload;
  }

  verifyGrant(
    token: string,
    expectedScope: string,
    nowSeconds: number = Math.floor(Date.now() / 1000),
  ): VerifiedGrant {
    const payload = this.decodeVerified<VerifiedGrant>(token, nowSeconds);
    if (payload.typ !== 'grant') {
      throw new InvalidTokenError('Not a grant token');
    }
    if (typeof payload.sub !== 'string' || payload.scope !== expectedScope) {
      throw new InvalidTokenError('Bad grant scope');
    }
    return payload;
  }

  // --- internals ---

  private encode(payload: object): string {
    const signingInput = `${encodeSegment(HEADER)}.${encodeSegment(payload)}`;
    return `${signingInput}.${this.hmac(signingInput)}`;
  }

  private decodeVerified<T extends { iss: string; exp: number }>(
    token: string,
    nowSeconds: number,
  ): T {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new InvalidTokenError('Malformed token');
    }
    const [headerB64, payloadB64, signature] = parts as [string, string, string];

    if (!this.signatureMatches(`${headerB64}.${payloadB64}`, signature)) {
      throw new InvalidTokenError('Bad signature');
    }
    const header = this.decode<JwtHeader>(headerB64);
    if (header.alg !== 'HS256') {
      throw new InvalidTokenError('Unexpected algorithm');
    }
    const payload = this.decode<T>(payloadB64);
    if (payload.iss !== JWT_ISSUER) {
      throw new InvalidTokenError('Bad issuer');
    }
    if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
      throw new InvalidTokenError('Token expired');
    }
    return payload;
  }

  private hmac(signingInput: string): string {
    return createHmac('sha256', this.secret).update(signingInput).digest('base64url');
  }

  private signatureMatches(signingInput: string, provided: string): boolean {
    const expected = this.hmac(signingInput);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  }

  private decode<T>(segment: string): T {
    try {
      return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
    } catch {
      throw new InvalidTokenError('Malformed segment');
    }
  }
}
