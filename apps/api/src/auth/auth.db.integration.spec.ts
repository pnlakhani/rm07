import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '@rm07/db';
import { CredentialVaultService } from '../security/vault/credential-vault.service';
import { PasswordService } from '../security/password.service';
import { TotpService } from '../security/totp.service';
import { AuthService } from './auth.service';
import {
  DrizzleAccountsRepository,
  DrizzleConsentRepository,
  DrizzleMfaRepository,
  DrizzleOtpRepository,
  DrizzleSessionsRepository,
} from './drizzle-repositories';
import { JwtService } from './jwt.service';
import { OtpService } from './otp.service';
import { RefreshTokenService } from './refresh-token.service';
import type { EmailSender, OtpPurpose } from './ports';

const DATABASE_URL = process.env['DATABASE_URL'];

/**
 * End-to-end against a REAL Postgres. Skipped unless DATABASE_URL is set (and migrations
 * 0000-0002 applied). Validates the Drizzle repositories + the full onboarding flow, including
 * the RLS/role posture of the system connection.
 */
describe.skipIf(!DATABASE_URL)('Auth DB integration', () => {
  let database: Database;
  let auth: AuthService;
  let lastEmail: { email: string; code: string; purpose: OtpPurpose } | null = null;
  const testEmail = `it-${Date.now()}@rm07.test`;

  beforeAll(() => {
    database = createDatabase({ url: DATABASE_URL as string });
    const capturingEmail: EmailSender = {
      sendOtp: (input) => {
        lastEmail = input;
        return Promise.resolve();
      },
    };
    auth = new AuthService(
      new DrizzleAccountsRepository(database),
      new DrizzleOtpRepository(database),
      new DrizzleMfaRepository(database),
      new DrizzleSessionsRepository(database),
      new DrizzleConsentRepository(database),
      capturingEmail,
      new PasswordService(),
      new TotpService(),
      new OtpService('integration-pepper-16chars'),
      new RefreshTokenService(new PasswordService()),
      new JwtService('integration-secret-16chars'),
      new CredentialVaultService(randomBytes(32).toString('base64')),
      // Skip HIBP network in CI by passing a stub that reports "not breached".
      (async () => ({ ok: true, status: 200, text: async () => '' }) as Response) as unknown as typeof fetch,
    );
  });

  afterAll(async () => {
    if (database) {
      await database.sql`DELETE FROM core.accounts WHERE email = ${testEmail}`.catch(() => undefined);
      await database.sql.end({ timeout: 5 }).catch(() => undefined);
    }
  });

  it('runs signup -> verify -> enrol -> confirm -> signin against Postgres', async () => {
    const totp = new TotpService();
    const ctx = { ip: '127.0.0.1', userAgent: 'integration' };

    const { accountId } = await auth.signup({ email: testEmail, password: 'integration-passphrase-1' }, ctx);
    expect(accountId).toBeGreaterThan(0n);

    await auth.verifySignupOtp(testEmail, lastEmail!.code);
    const enrol = await auth.enrolTotp(accountId);
    const session = await auth.confirmTotp(accountId, totp.generateCode(enrol.secret), ctx);
    expect(session.accessToken).toBeTruthy();

    const signedIn = await auth.signin(
      { email: testEmail, password: 'integration-passphrase-1', totp: totp.generateCode(enrol.secret) },
      ctx,
    );
    expect(signedIn.sessionId).toBeTruthy();
  });
});
