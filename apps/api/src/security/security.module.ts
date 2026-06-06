import { randomBytes } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { PasswordService } from './password.service';
import { TotpService } from './totp.service';
import { CredentialVaultService, VAULT_ROOT_KEY } from './vault/credential-vault.service';

/**
 * Security primitives: Argon2id passwords + HIBP, TOTP 2FA, and the broker-credential vault.
 * The vault root key comes from Doppler in every real environment; dev/test falls back to an
 * ephemeral key (sealed data does not survive a restart) so no secret is ever committed.
 */
const vaultRootKeyProvider = {
  provide: VAULT_ROOT_KEY,
  useFactory: (): string => {
    const env = loadEnv();
    if (env.VAULT_ROOT_KEY) {
      return env.VAULT_ROOT_KEY;
    }
    if (env.NODE_ENV === 'production') {
      throw new Error('VAULT_ROOT_KEY is required in production (set it in Doppler).');
    }
    Logger.warn(
      'VAULT_ROOT_KEY not set — using an ephemeral dev key. Sealed credentials will not survive a restart.',
      'SecurityModule',
    );
    return randomBytes(32).toString('base64');
  },
};

@Module({
  providers: [PasswordService, TotpService, vaultRootKeyProvider, CredentialVaultService],
  exports: [PasswordService, TotpService, CredentialVaultService],
})
export class SecurityModule {}
