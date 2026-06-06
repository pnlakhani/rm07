import { randomBytes } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { SecurityModule } from '../security/security.module';
import { JWT_ACCESS_SECRET, JwtService } from './jwt.service';
import { OTP_PEPPER, OtpService } from './otp.service';
import { RefreshTokenService } from './refresh-token.service';

/** A required-in-prod / ephemeral-in-dev secret resolver shared by the auth secret providers. */
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

/**
 * Authentication primitives: access JWTs, rotating refresh tokens, and email OTP.
 * The HTTP flow (AuthController + AuthService + Drizzle repositories) is added in Part 2b on top
 * of these. RefreshTokenService depends on PasswordService from SecurityModule.
 */
@Module({
  imports: [SecurityModule],
  providers: [jwtSecretProvider, JwtService, RefreshTokenService, otpPepperProvider, OtpService],
  exports: [JwtService, RefreshTokenService, OtpService],
})
export class AuthModule {}
