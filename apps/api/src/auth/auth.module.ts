import { randomBytes } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { DatabaseModule } from '../db/database.module';
import { RESEND_CONFIG, ResendEmailSender, type ResendConfig } from '../email/resend-email-sender';
import { CredentialVaultService } from '../security/vault/credential-vault.service';
import { PasswordService } from '../security/password.service';
import { TotpService } from '../security/totp.service';
import { SecurityModule } from '../security/security.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  DrizzleAccountsRepository,
  DrizzleConsentRepository,
  DrizzleMfaRepository,
  DrizzleOtpRepository,
  DrizzleSessionsRepository,
} from './drizzle-repositories';
import { EnrolmentGuard, JwtAuthGuard } from './guards';
import { JWT_ACCESS_SECRET, JwtService } from './jwt.service';
import { OTP_PEPPER, OtpService } from './otp.service';
import { RefreshTokenService } from './refresh-token.service';

function resolveSecret(value: string | undefined, name: string, isProduction: boolean): string {
  if (value) {
    return value;
  }
  if (isProduction) {
    throw new Error(`${name} is required in production (set it in Doppler).`);
  }
  Logger.warn(`${name} not set — using an ephemeral dev secret.`, 'AuthModule');
  return randomBytes(24).toString('hex');
}

const jwtSecretProvider = {
  provide: JWT_ACCESS_SECRET,
  useFactory: (): string => {
    const env = loadEnv();
    return resolveSecret(env.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET', env.NODE_ENV === 'production');
  },
};

const otpPepperProvider = {
  provide: OTP_PEPPER,
  useFactory: (): string => {
    const env = loadEnv();
    return resolveSecret(env.OTP_PEPPER, 'OTP_PEPPER', env.NODE_ENV === 'production');
  },
};

const resendConfigProvider = {
  provide: RESEND_CONFIG,
  useFactory: (): ResendConfig => {
    const env = loadEnv();
    return { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM };
  },
};

const authServiceProvider = {
  provide: AuthService,
  useFactory: (
    accounts: DrizzleAccountsRepository,
    otps: DrizzleOtpRepository,
    mfa: DrizzleMfaRepository,
    sessions: DrizzleSessionsRepository,
    consent: DrizzleConsentRepository,
    email: ResendEmailSender,
    passwords: PasswordService,
    totp: TotpService,
    otpSvc: OtpService,
    refresh: RefreshTokenService,
    jwt: JwtService,
    vault: CredentialVaultService,
  ): AuthService =>
    new AuthService(accounts, otps, mfa, sessions, consent, email, passwords, totp, otpSvc, refresh, jwt, vault),
  inject: [
    DrizzleAccountsRepository,
    DrizzleOtpRepository,
    DrizzleMfaRepository,
    DrizzleSessionsRepository,
    DrizzleConsentRepository,
    ResendEmailSender,
    PasswordService,
    TotpService,
    OtpService,
    RefreshTokenService,
    JwtService,
    CredentialVaultService,
  ],
};

/**
 * Authentication module: HTTP controller + guards on top of AuthService, which is composed from
 * the Drizzle repositories, the Resend email sender, and the security primitives.
 */
@Module({
  imports: [SecurityModule, DatabaseModule],
  controllers: [AuthController],
  providers: [
    jwtSecretProvider,
    JwtService,
    RefreshTokenService,
    otpPepperProvider,
    OtpService,
    JwtAuthGuard,
    EnrolmentGuard,
    DrizzleAccountsRepository,
    DrizzleOtpRepository,
    DrizzleMfaRepository,
    DrizzleSessionsRepository,
    DrizzleConsentRepository,
    resendConfigProvider,
    ResendEmailSender,
    authServiceProvider,
  ],
  exports: [AuthService, JwtService, JwtAuthGuard, EnrolmentGuard],
})
export class AuthModule {}
