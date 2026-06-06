import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CredentialVaultService } from '../security/vault/credential-vault.service';
import { PasswordService, type Fetcher } from '../security/password.service';
import { TotpService } from '../security/totp.service';
import { JwtService } from './jwt.service';
import { OtpService } from './otp.service';
import { RefreshTokenService } from './refresh-token.service';
import { AuthError, AuthService } from './auth.service';
import type {
  AccountRecord,
  AccountStatus,
  AccountsRepository,
  ConsentRepository,
  EmailSender,
  MfaRepository,
  OtpPurpose,
  OtpRecord,
  OtpRepository,
  RequestContext,
  SessionRecord,
  SessionsRepository,
  TotpFactorRecord,
} from './ports';

// --- in-memory fakes ------------------------------------------------------------------------

interface MutableAccount {
  id: bigint;
  email: string;
  passwordHashArgon2id: string | null;
  authProvider: 'password' | 'google';
  accountStatus: AccountStatus;
}

class FakeAccounts implements AccountsRepository {
  private seq = 0n;
  readonly rows = new Map<bigint, MutableAccount>();

  findByEmail(email: string): Promise<AccountRecord | null> {
    for (const row of this.rows.values()) {
      if (row.email === email) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }
  findById(id: bigint): Promise<AccountRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  createPasswordAccount(input: {
    email: string;
    passwordHashArgon2id: string;
    signupSource?: string;
  }): Promise<AccountRecord> {
    this.seq += 1n;
    const row: MutableAccount = {
      id: this.seq,
      email: input.email,
      passwordHashArgon2id: input.passwordHashArgon2id,
      authProvider: 'password',
      accountStatus: 'pending_verification',
    };
    this.rows.set(row.id, row);
    return Promise.resolve(row);
  }
  setStatus(id: bigint, status: AccountStatus): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.accountStatus = status;
    return Promise.resolve();
  }
  setPasswordHash(id: bigint, hash: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.passwordHashArgon2id = hash;
    return Promise.resolve();
  }
  markSignedIn(): Promise<void> {
    return Promise.resolve();
  }
}

interface MutableOtp {
  id: bigint;
  accountId: bigint;
  purpose: OtpPurpose;
  codeHash: string;
  attempts: number;
  consumedAt: Date | null;
  expiresAt: Date;
}

class FakeOtps implements OtpRepository {
  private seq = 0n;
  readonly rows: MutableOtp[] = [];

  issue(input: {
    accountId: bigint;
    purpose: OtpPurpose;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void> {
    for (const r of this.rows) {
      if (r.accountId === input.accountId && r.purpose === input.purpose && !r.consumedAt) {
        r.consumedAt = new Date();
      }
    }
    this.seq += 1n;
    this.rows.push({ id: this.seq, attempts: 0, consumedAt: null, ...input });
    return Promise.resolve();
  }
  findActive(accountId: bigint, purpose: OtpPurpose): Promise<OtpRecord | null> {
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      const r = this.rows[i]!;
      if (r.accountId === accountId && r.purpose === purpose && !r.consumedAt) {
        return Promise.resolve({
          id: r.id,
          codeHash: r.codeHash,
          attempts: r.attempts,
          expiresAt: r.expiresAt,
        });
      }
    }
    return Promise.resolve(null);
  }
  incrementAttempts(id: bigint): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.attempts += 1;
    return Promise.resolve();
  }
  consume(id: bigint, at: Date): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.consumedAt = at;
    return Promise.resolve();
  }
}

interface MutableFactor {
  id: bigint;
  accountId: bigint;
  secretEncrypted: Buffer;
  isActive: boolean;
}

class FakeMfa implements MfaRepository {
  private seq = 0n;
  readonly rows: MutableFactor[] = [];

  getTotp(accountId: bigint, opts: { activeOnly: boolean }): Promise<TotpFactorRecord | null> {
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      const r = this.rows[i]!;
      if (r.accountId === accountId && (!opts.activeOnly || r.isActive)) {
        return Promise.resolve({ id: r.id, secretEncrypted: r.secretEncrypted, isActive: r.isActive });
      }
    }
    return Promise.resolve(null);
  }
  createTotp(input: { accountId: bigint; secretEncrypted: Buffer; isActive: boolean }): Promise<bigint> {
    this.seq += 1n;
    this.rows.push({ id: this.seq, ...input });
    return Promise.resolve(this.seq);
  }
  activateTotp(id: bigint): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.isActive = true;
    return Promise.resolve();
  }
}

interface MutableSession {
  id: string;
  accountId: bigint;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

class FakeSessions implements SessionsRepository {
  readonly rows = new Map<string, MutableSession>();

  create(input: {
    accountId: bigint;
    refreshTokenHash: string;
    expiresAt: Date;
    context: RequestContext;
  }): Promise<SessionRecord> {
    const row: MutableSession = {
      id: randomUUID(),
      accountId: input.accountId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.rows.set(row.id, row);
    return Promise.resolve(row);
  }
  findById(id: string): Promise<SessionRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  revoke(id: string, at: Date): Promise<void> {
    const r = this.rows.get(id);
    if (r) r.revokedAt = at;
    return Promise.resolve();
  }
  revokeAllForAccount(accountId: bigint, at: Date): Promise<void> {
    for (const r of this.rows.values()) {
      if (r.accountId === accountId && !r.revokedAt) r.revokedAt = at;
    }
    return Promise.resolve();
  }
}

class FakeConsent implements ConsentRepository {
  readonly rows: { accountId: bigint; purpose: string; granted: boolean }[] = [];
  record(input: { accountId: bigint; purpose: string; granted: boolean }): Promise<void> {
    this.rows.push({ accountId: input.accountId, purpose: input.purpose, granted: input.granted });
    return Promise.resolve();
  }
}

class FakeEmail implements EmailSender {
  last: { email: string; code: string; purpose: OtpPurpose } | null = null;
  sendOtp(input: { email: string; code: string; purpose: OtpPurpose }): Promise<void> {
    this.last = input;
    return Promise.resolve();
  }
}

// HIBP stub that always reports "not breached".
const hibpStub: Fetcher = (async () =>
  ({ ok: true, status: 200, text: async () => '' }) as Response) as unknown as Fetcher;

const ctx: RequestContext = { ip: '127.0.0.1', userAgent: 'test' };
const PASSWORD = 'a-strong-passphrase-123';

function makeHarness() {
  const accounts = new FakeAccounts();
  const otps = new FakeOtps();
  const mfa = new FakeMfa();
  const sessions = new FakeSessions();
  const consent = new FakeConsent();
  const email = new FakeEmail();
  const passwords = new PasswordService();
  const totp = new TotpService();
  const otpSvc = new OtpService('otp-pepper-at-least-16-chars');
  const refresh = new RefreshTokenService(passwords);
  const jwt = new JwtService('test-secret-at-least-16-chars');
  const vault = new CredentialVaultService(randomBytes(32).toString('base64'));
  const service = new AuthService(
    accounts,
    otps,
    mfa,
    sessions,
    consent,
    email,
    passwords,
    totp,
    otpSvc,
    refresh,
    jwt,
    vault,
    hibpStub,
  );
  return { service, accounts, otps, mfa, sessions, consent, email, totp, jwt };
}

type Harness = ReturnType<typeof makeHarness>;

async function enrolled(h: Harness, emailAddr = 'prash@example.com'): Promise<{ accountId: bigint; secret: string }> {
  const { accountId } = await h.service.signup({ email: emailAddr, password: PASSWORD }, ctx);
  await h.service.verifySignupOtp(emailAddr, h.email.last!.code);
  const enrol = await h.service.enrolTotp(accountId);
  await h.service.confirmTotp(accountId, h.totp.generateCode(enrol.secret));
  return { accountId, secret: enrol.secret };
}

// --- tests ----------------------------------------------------------------------------------

describe('AuthService — signup + OTP', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it('creates a pending account, records consent, and emails an OTP', async () => {
    const { accountId } = await h.service.signup({ email: 'a@b.com', password: PASSWORD }, ctx);
    expect(h.accounts.rows.get(accountId)?.accountStatus).toBe('pending_verification');
    expect(h.consent.rows.map((r) => r.purpose)).toEqual(['terms_of_service', 'privacy_policy']);
    expect(h.email.last?.purpose).toBe('signup_verification');
    expect(h.email.last?.code).toMatch(/^\d{6}$/u);
  });

  it('rejects a duplicate email', async () => {
    await h.service.signup({ email: 'a@b.com', password: PASSWORD }, ctx);
    await expect(h.service.signup({ email: 'a@b.com', password: PASSWORD }, ctx)).rejects.toMatchObject({
      code: 'email_taken',
    });
  });

  it('verifies a correct OTP and activates the account', async () => {
    await h.service.signup({ email: 'a@b.com', password: PASSWORD }, ctx);
    await h.service.verifySignupOtp('a@b.com', h.email.last!.code);
    const acc = await h.accounts.findByEmail('a@b.com');
    expect(acc?.accountStatus).toBe('active');
  });

  it('rejects a wrong OTP and locks after the attempt cap', async () => {
    await h.service.signup({ email: 'a@b.com', password: PASSWORD }, ctx);
    for (let i = 0; i < 5; i += 1) {
      await expect(h.service.verifySignupOtp('a@b.com', '000001')).rejects.toMatchObject({
        code: 'otp_invalid',
      });
    }
    await expect(h.service.verifySignupOtp('a@b.com', '000001')).rejects.toMatchObject({
      code: 'otp_locked',
    });
  });

  it('does not leak whether an email exists on OTP verify', async () => {
    await expect(h.service.verifySignupOtp('nobody@b.com', '123456')).rejects.toMatchObject({
      code: 'otp_invalid',
    });
  });
});

describe('AuthService — TOTP + sign-in', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it('signs in after enrolment and returns a verifiable access token', async () => {
    const { accountId, secret } = await enrolled(h);
    const issued = await h.service.signin(
      { email: 'prash@example.com', password: PASSWORD, totp: h.totp.generateCode(secret) },
      ctx,
    );
    const claims = h.jwt.verify(issued.accessToken);
    expect(claims.sub).toBe(accountId.toString());
    expect(claims.sid).toBe(issued.sessionId);
    expect(issued.refreshToken.length).toBeGreaterThan(20);
  });

  it('rejects a wrong password and an unknown email identically', async () => {
    await enrolled(h);
    await expect(
      h.service.signin({ email: 'prash@example.com', password: 'wrong-password', totp: '000000' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(
      h.service.signin({ email: 'ghost@example.com', password: PASSWORD, totp: '000000' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('requires TOTP enrolment before sign-in', async () => {
    const emailAddr = 'noTotp@example.com'.toLowerCase();
    await h.service.signup({ email: emailAddr, password: PASSWORD }, ctx);
    await h.service.verifySignupOtp(emailAddr, h.email.last!.code);
    await expect(
      h.service.signin({ email: emailAddr, password: PASSWORD, totp: '000000' }, ctx),
    ).rejects.toMatchObject({ code: 'totp_required' });
  });

  it('rejects a wrong TOTP code', async () => {
    const { secret } = await enrolled(h);
    const wrong = h.totp.generateCode(secret, Math.floor(Date.now() / 1000) - 600);
    await expect(
      h.service.signin({ email: 'prash@example.com', password: PASSWORD, totp: wrong }, ctx),
    ).rejects.toMatchObject({ code: 'totp_invalid' });
  });

  it('refuses sign-in for an unverified (pending) account', async () => {
    await h.service.signup({ email: 'a@b.com', password: PASSWORD }, ctx);
    // Correct password but email not yet verified → distinct, actionable status.
    await expect(
      h.service.signin({ email: 'a@b.com', password: PASSWORD, totp: '000000' }, ctx),
    ).rejects.toMatchObject({ code: 'account_not_active' });
  });
});

describe('AuthService — refresh + logout', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it('rotates the session and revokes the old one', async () => {
    const { secret } = await enrolled(h);
    const first = await h.service.signin(
      { email: 'prash@example.com', password: PASSWORD, totp: h.totp.generateCode(secret) },
      ctx,
    );
    const second = await h.service.refresh(first.sessionId, first.refreshToken, ctx);
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(h.sessions.rows.get(first.sessionId)?.revokedAt).not.toBeNull();
    // The old refresh token can no longer be used.
    await expect(h.service.refresh(first.sessionId, first.refreshToken, ctx)).rejects.toMatchObject({
      code: 'session_invalid',
    });
  });

  it('revokes the session when a bad refresh token is presented', async () => {
    const { secret } = await enrolled(h);
    const issued = await h.service.signin(
      { email: 'prash@example.com', password: PASSWORD, totp: h.totp.generateCode(secret) },
      ctx,
    );
    await expect(h.service.refresh(issued.sessionId, 'forged-token', ctx)).rejects.toMatchObject({
      code: 'session_invalid',
    });
    expect(h.sessions.rows.get(issued.sessionId)?.revokedAt).not.toBeNull();
  });

  it('logout-all revokes every session', async () => {
    const { accountId, secret } = await enrolled(h);
    await h.service.signin(
      { email: 'prash@example.com', password: PASSWORD, totp: h.totp.generateCode(secret) },
      ctx,
    );
    await h.service.logoutAll(accountId);
    for (const s of h.sessions.rows.values()) {
      expect(s.revokedAt).not.toBeNull();
    }
  });
});

describe('AuthService — password reset', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it('is email-enumeration-safe on request', async () => {
    await expect(h.service.requestPasswordReset('ghost@example.com', ctx)).resolves.toBeUndefined();
    expect(h.email.last).toBeNull();
  });

  it('resets the password with OTP + step-up TOTP and revokes sessions', async () => {
    const { secret } = await enrolled(h);
    const signedIn = await h.service.signin(
      { email: 'prash@example.com', password: PASSWORD, totp: h.totp.generateCode(secret) },
      ctx,
    );

    await h.service.requestPasswordReset('prash@example.com', ctx);
    const resetCode = h.email.last!.code;
    await h.service.confirmPasswordReset({
      email: 'prash@example.com',
      code: resetCode,
      totp: h.totp.generateCode(secret),
      newPassword: 'a-brand-new-passphrase-456',
    });

    // Old session invalidated.
    expect(h.sessions.rows.get(signedIn.sessionId)?.revokedAt).not.toBeNull();
    // New password works.
    await expect(
      h.service.signin(
        { email: 'prash@example.com', password: 'a-brand-new-passphrase-456', totp: h.totp.generateCode(secret) },
        ctx,
      ),
    ).resolves.toBeTruthy();
  });

  it('cannot reset without the step-up TOTP', async () => {
    const { secret } = await enrolled(h);
    await h.service.requestPasswordReset('prash@example.com', ctx);
    const resetCode = h.email.last!.code;
    const wrongTotp = h.totp.generateCode(secret, Math.floor(Date.now() / 1000) - 600);
    await expect(
      h.service.confirmPasswordReset({
        email: 'prash@example.com',
        code: resetCode,
        totp: wrongTotp,
        newPassword: 'a-brand-new-passphrase-456',
      }),
    ).rejects.toMatchObject({ code: 'totp_invalid' });
  });
});

describe('AuthError', () => {
  it('carries a machine-readable code', () => {
    expect(new AuthError('otp_expired').code).toBe('otp_expired');
  });
});
