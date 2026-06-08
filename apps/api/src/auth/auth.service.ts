import { Injectable } from '@nestjs/common';
import { CredentialVaultService } from '../security/vault/credential-vault.service';
import { PasswordService, type Fetcher } from '../security/password.service';
import { TotpService } from '../security/totp.service';
import { JwtService } from './jwt.service';
import { OtpService, OTP_MAX_ATTEMPTS } from './otp.service';
import { RefreshTokenService } from './refresh-token.service';
import type {
  AccountsRepository,
  ConsentRepository,
  EmailSender,
  MfaRepository,
  OtpPurpose,
  OtpRecord,
  OtpRepository,
  RequestContext,
  SessionsRepository,
} from './ports';

export const TOS_POLICY_VERSION = 'tos-v1';
export const PRIVACY_POLICY_VERSION = 'privacy-v1';
/** Scope of the onboarding grant that authorises TOTP enrol/confirm. */
export const TOTP_ENROL_SCOPE = 'totp_enrol';

export type AuthErrorCode =
  | 'email_taken'
  | 'invalid_credentials'
  | 'account_not_active'
  | 'otp_invalid'
  | 'otp_expired'
  | 'otp_locked'
  | 'totp_required'
  | 'totp_invalid'
  | 'mfa_not_enrolled'
  | 'session_invalid';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

export interface IssuedSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
  readonly sessionId: string;
}

export interface TotpEnrolment {
  readonly secret: string;
  readonly keyUri: string;
}

/**
 * Authentication orchestration (App Flow §2/§3, Full Doc VII.2). Depends only on the repository
 * ports, so it is fully unit-testable with in-memory fakes. Login and password-reset responses are
 * email-enumeration-safe; OTP checks are attempt-limited; the TOTP gate is mandatory.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly otps: OtpRepository,
    private readonly mfa: MfaRepository,
    private readonly sessions: SessionsRepository,
    private readonly consent: ConsentRepository,
    private readonly email: EmailSender,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly otpSvc: OtpService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwt: JwtService,
    private readonly vault: CredentialVaultService,
    private readonly hibpFetcher: Fetcher = globalThis.fetch,
  ) {}

  // --- Sign-up + verification ---------------------------------------------------------------

  async signup(
    input: { email: string; password: string; signupSource?: string },
    ctx: RequestContext,
  ): Promise<{ accountId: bigint }> {
    const existing = await this.accounts.findByEmail(input.email);
    if (existing) {
      throw new AuthError('email_taken', 'An account with this email already exists.');
    }
    await this.passwords.assertStrong(input.password, this.hibpFetcher);
    const passwordHashArgon2id = await this.passwords.hashPassword(input.password);

    const account = await this.accounts.createPasswordAccount({
      email: input.email,
      passwordHashArgon2id,
      ...(input.signupSource ? { signupSource: input.signupSource } : {}),
    });

    await this.consent.record({
      accountId: account.id,
      purpose: 'terms_of_service',
      granted: true,
      policyVersion: TOS_POLICY_VERSION,
      context: ctx,
    });
    await this.consent.record({
      accountId: account.id,
      purpose: 'privacy_policy',
      granted: true,
      policyVersion: PRIVACY_POLICY_VERSION,
      context: ctx,
    });

    await this.sendOtp(account.id, account.email, 'signup_verification');
    return { accountId: account.id };
  }

  /**
   * Verify the signup OTP, activate the account, and issue a short-lived enrolment grant that
   * authorises the TOTP enrol/confirm steps (no full session exists until TOTP is confirmed).
   */
  async verifySignupOtp(email: string, code: string): Promise<{ enrolmentToken: string }> {
    const account = await this.accounts.findByEmail(email);
    if (!account) {
      throw new AuthError('otp_invalid');
    }
    const otp = await this.consumeOtpOrThrow(account.id, 'signup_verification', code);
    await this.otps.consume(otp.id, new Date());
    await this.accounts.setStatus(account.id, 'active');
    return { enrolmentToken: this.jwt.signGrant(account.id.toString(), TOTP_ENROL_SCOPE) };
  }

  // --- TOTP enrolment -----------------------------------------------------------------------

  async enrolTotp(accountId: bigint): Promise<TotpEnrolment> {
    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new AuthError('invalid_credentials');
    }
    const secret = this.totp.generateSecret();
    const secretEncrypted = this.vault.sealValue(secret);
    await this.mfa.createTotp({ accountId, secretEncrypted, isActive: false });
    return { secret, keyUri: this.totp.keyUri(secret, account.email) };
  }

  /** Confirm TOTP enrolment with a valid code, then issue the first full session. */
  async confirmTotp(accountId: bigint, code: string, ctx: RequestContext): Promise<IssuedSession> {
    const factor = await this.mfa.getTotp(accountId, { activeOnly: false });
    if (!factor) {
      throw new AuthError('mfa_not_enrolled');
    }
    const secret = this.vault.openValue(factor.secretEncrypted);
    if (!this.totp.verify(secret, code)) {
      throw new AuthError('totp_invalid');
    }
    await this.mfa.activateTotp(factor.id);
    const issued = await this.issueSessionFor(accountId, ctx);
    await this.accounts.markSignedIn(accountId, new Date());
    return issued;
  }

  // --- Sign-in + sessions -------------------------------------------------------------------

  async signin(
    input: { email: string; password: string; totp: string },
    ctx: RequestContext,
  ): Promise<IssuedSession> {
    const account = await this.accounts.findByEmail(input.email);
    if (!account || !account.passwordHashArgon2id) {
      throw new AuthError('invalid_credentials');
    }
    const passwordOk = await this.passwords.verifyPassword(
      account.passwordHashArgon2id,
      input.password,
    );
    if (!passwordOk) {
      throw new AuthError('invalid_credentials');
    }
    if (account.accountStatus !== 'active') {
      throw new AuthError('account_not_active');
    }

    const factor = await this.mfa.getTotp(account.id, { activeOnly: true });
    if (!factor) {
      throw new AuthError('totp_required');
    }
    const secret = this.vault.openValue(factor.secretEncrypted);
    if (!this.totp.verify(secret, input.totp)) {
      throw new AuthError('totp_invalid');
    }

    const issued = await this.issueSessionFor(account.id, ctx);
    await this.accounts.markSignedIn(account.id, new Date());
    return issued;
  }

  async refresh(sessionId: string, presentedToken: string, ctx: RequestContext): Promise<IssuedSession> {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.revokedAt || this.refreshTokens.isExpired(session.expiresAt)) {
      throw new AuthError('session_invalid');
    }
    const ok = await this.refreshTokens.verify(session.refreshTokenHash, presentedToken);
    if (!ok) {
      // Possible token theft / reuse — revoke the session defensively.
      await this.sessions.revoke(session.id, new Date());
      throw new AuthError('session_invalid');
    }
    await this.sessions.revoke(session.id, new Date());
    return this.issueSessionFor(session.accountId, ctx);
  }

  async logoutAll(accountId: bigint): Promise<void> {
    await this.sessions.revokeAllForAccount(accountId, new Date());
  }

  // --- Password reset (step-up TOTP) --------------------------------------------------------

  async requestPasswordReset(email: string, ctx: RequestContext): Promise<void> {
    void ctx;
    const account = await this.accounts.findByEmail(email);
    if (account) {
      await this.sendOtp(account.id, account.email, 'password_reset');
    }
    // Always returns void — identical response whether or not the account exists (Full Doc VII.2).
  }

  async confirmPasswordReset(input: {
    email: string;
    code: string;
    totp: string;
    newPassword: string;
  }): Promise<void> {
    const account = await this.accounts.findByEmail(input.email);
    if (!account) {
      throw new AuthError('otp_invalid');
    }
    const otp = await this.consumeOtpOrThrow(account.id, 'password_reset', input.code);

    const factor = await this.mfa.getTotp(account.id, { activeOnly: true });
    if (!factor) {
      throw new AuthError('totp_required');
    }
    const secret = this.vault.openValue(factor.secretEncrypted);
    if (!this.totp.verify(secret, input.totp)) {
      throw new AuthError('totp_invalid');
    }

    await this.passwords.assertStrong(input.newPassword, this.hibpFetcher);
    const newHash = await this.passwords.hashPassword(input.newPassword);
    await this.accounts.setPasswordHash(account.id, newHash);
    await this.otps.consume(otp.id, new Date());
    await this.sessions.revokeAllForAccount(account.id, new Date());
  }

  // --- internals ----------------------------------------------------------------------------

  private async issueSessionFor(accountId: bigint, ctx: RequestContext): Promise<IssuedSession> {
    const issued = await this.refreshTokens.issue();
    const session = await this.sessions.create({
      accountId,
      refreshTokenHash: issued.hash,
      expiresAt: issued.expiresAt,
      context: ctx,
    });
    const accessToken = this.jwt.sign({ sub: accountId.toString(), sid: session.id });
    return {
      accessToken,
      refreshToken: issued.token,
      refreshExpiresAt: issued.expiresAt,
      sessionId: session.id,
    };
  }

  private async sendOtp(accountId: bigint, email: string, purpose: OtpPurpose): Promise<void> {
    const code = this.otpSvc.generateCode();
    await this.otps.issue({
      accountId,
      purpose,
      codeHash: this.otpSvc.hash(code),
      expiresAt: this.otpSvc.expiresAt(),
    });
    await this.email.sendOtp({ email, code, purpose });
  }

  /** Shared OTP validation: existence, expiry, attempt cap, constant-time match. */
  private async consumeOtpOrThrow(
    accountId: bigint,
    purpose: OtpPurpose,
    code: string,
  ): Promise<OtpRecord> {
    const otp = await this.otps.findActive(accountId, purpose);
    if (!otp) {
      throw new AuthError('otp_invalid');
    }
    if (otp.expiresAt.getTime() <= Date.now()) {
      throw new AuthError('otp_expired');
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new AuthError('otp_locked');
    }
    if (!this.otpSvc.verify(code, otp.codeHash)) {
      await this.otps.incrementAttempts(otp.id);
      throw new AuthError('otp_invalid');
    }
    return otp;
  }
}
