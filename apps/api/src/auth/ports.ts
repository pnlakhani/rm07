/**
 * Repository + service ports for the auth domain. AuthService depends only on these interfaces,
 * so it is unit-testable with in-memory fakes; the Drizzle/Resend implementations are provided in
 * Part 2b-2 and verified against live Supabase. DI tokens are symbols (interfaces have no runtime
 * representation).
 */

export type AccountStatus = 'pending_verification' | 'active' | 'suspended' | 'closed';
export type AuthProvider = 'password' | 'google';
export type OtpPurpose = 'signup_verification' | 'password_reset';

export interface AccountRecord {
  readonly id: bigint;
  readonly email: string;
  readonly passwordHashArgon2id: string | null;
  readonly authProvider: AuthProvider;
  readonly accountStatus: AccountStatus;
}

export interface OtpRecord {
  readonly id: bigint;
  readonly codeHash: string;
  readonly attempts: number;
  readonly expiresAt: Date;
}

export interface TotpFactorRecord {
  readonly id: bigint;
  /** Envelope-sealed TOTP secret (sealValue blob). */
  readonly secretEncrypted: Buffer;
  readonly isActive: boolean;
}

export interface SessionRecord {
  readonly id: string;
  readonly accountId: bigint;
  readonly refreshTokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

/** Per-request context captured for audit / anomaly detection. */
export interface RequestContext {
  readonly ip?: string;
  readonly userAgent?: string;
  readonly deviceFingerprint?: string;
}

export interface AccountsRepository {
  findByEmail(email: string): Promise<AccountRecord | null>;
  findById(id: bigint): Promise<AccountRecord | null>;
  createPasswordAccount(input: {
    email: string;
    passwordHashArgon2id: string;
    signupSource?: string;
  }): Promise<AccountRecord>;
  setStatus(id: bigint, status: AccountStatus): Promise<void>;
  setPasswordHash(id: bigint, passwordHashArgon2id: string): Promise<void>;
  markSignedIn(id: bigint, at: Date): Promise<void>;
}

export interface OtpRepository {
  /** Invalidate any prior unconsumed codes for this account+purpose, then insert the new one. */
  issue(input: {
    accountId: bigint;
    purpose: OtpPurpose;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findActive(accountId: bigint, purpose: OtpPurpose): Promise<OtpRecord | null>;
  incrementAttempts(id: bigint): Promise<void>;
  consume(id: bigint, at: Date): Promise<void>;
}

export interface MfaRepository {
  getTotp(accountId: bigint, opts: { activeOnly: boolean }): Promise<TotpFactorRecord | null>;
  createTotp(input: { accountId: bigint; secretEncrypted: Buffer; isActive: boolean }): Promise<bigint>;
  activateTotp(id: bigint): Promise<void>;
}

export interface SessionsRepository {
  create(input: {
    accountId: bigint;
    refreshTokenHash: string;
    expiresAt: Date;
    context: RequestContext;
  }): Promise<SessionRecord>;
  findById(id: string): Promise<SessionRecord | null>;
  revoke(id: string, at: Date): Promise<void>;
  revokeAllForAccount(accountId: bigint, at: Date): Promise<void>;
}

export interface ConsentRepository {
  record(input: {
    accountId: bigint;
    purpose: string;
    granted: boolean;
    policyVersion: string;
    context: RequestContext;
  }): Promise<void>;
}

export interface EmailSender {
  sendOtp(input: { email: string; code: string; purpose: OtpPurpose }): Promise<void>;
}

// DI tokens.
export const ACCOUNTS_REPOSITORY = Symbol('ACCOUNTS_REPOSITORY');
export const OTP_REPOSITORY = Symbol('OTP_REPOSITORY');
export const MFA_REPOSITORY = Symbol('MFA_REPOSITORY');
export const SESSIONS_REPOSITORY = Symbol('SESSIONS_REPOSITORY');
export const CONSENT_REPOSITORY = Symbol('CONSENT_REPOSITORY');
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
