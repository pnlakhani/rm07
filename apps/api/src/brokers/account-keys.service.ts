import { Inject, Injectable } from '@nestjs/common';
import { CredentialVaultService } from '../security/vault/credential-vault.service';
import { BrokerError } from './errors';
import { ACCOUNT_KEYS_REPOSITORY, type AccountKeysRepository } from './ports';

/**
 * Manages the per-account ECIES keypair used for broker-credential transit encryption
 * (Full Doc VII.3). The public key is served to the browser; the private key is envelope-sealed
 * at rest and only opened server-side to decrypt a submission. Generated lazily on first use.
 */
@Injectable()
export class AccountKeysService {
  constructor(
    @Inject(ACCOUNT_KEYS_REPOSITORY) private readonly repo: AccountKeysRepository,
    private readonly vault: CredentialVaultService,
  ) {}

  async getPublicKey(accountId: bigint): Promise<string> {
    const existing = await this.repo.findByAccount(accountId);
    if (existing) {
      return existing.eciesPublicKey;
    }
    const keypair = this.vault.generateAccountKeyPair();
    await this.repo.create({
      accountId,
      eciesPublicKey: keypair.publicKey,
      eciesPrivateKeySealed: this.vault.sealValue(keypair.privateKey),
    });
    return keypair.publicKey;
  }

  async getPrivateKey(accountId: bigint): Promise<string> {
    const existing = await this.repo.findByAccount(accountId);
    if (!existing) {
      throw new BrokerError('no_account_key');
    }
    return this.vault.openValue(existing.eciesPrivateKeySealed);
  }
}
