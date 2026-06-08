import { Inject, Injectable } from '@nestjs/common';
import { getAdapter } from '@rm07/broker-adapters';
import type { Broker } from '@rm07/core';
import {
  CredentialVaultService,
  type CredentialField,
  type SealedCredentials,
} from '../security/vault/credential-vault.service';
import type { EciesPayload } from '../security/vault/ecies';
import { AccountKeysService } from './account-keys.service';
import { BrokerError } from './errors';
import { reassembleBrokerFields, splitBrokerFields } from './field-mapping';
import {
  BROKER_CONNECTIONS_REPOSITORY,
  type BrokerConnectionsRepository,
  type SealedCredentialColumns,
} from './ports';

export interface ConnectionView {
  readonly id: string;
  readonly broker: Broker;
  readonly clientId: string | null;
  readonly status: string;
}

/**
 * Connect-Broker flow (App Flow J-02/J-03, Full Doc VII.3, Hard rule #4):
 *  1. decrypt the ECIES transit payload with the account's private key (in-process only),
 *  2. verify the credentials against the broker via its adapter,
 *  3. envelope-seal the secrets and persist ciphertext only (never logged).
 */
@Injectable()
export class BrokerConnectionService {
  constructor(
    private readonly accountKeys: AccountKeysService,
    @Inject(BROKER_CONNECTIONS_REPOSITORY)
    private readonly connections: BrokerConnectionsRepository,
    private readonly vault: CredentialVaultService,
  ) {}

  async connect(accountId: bigint, broker: Broker, payload: EciesPayload): Promise<ConnectionView> {
    const privateKey = await this.accountKeys.getPrivateKey(accountId);

    let raw: Record<string, string>;
    try {
      raw = this.vault.decryptTransitRecord(payload, privateKey);
    } catch {
      throw new BrokerError('transit_decrypt_failed');
    }
    const { clientId, credentials } = splitBrokerFields(raw);

    // Verify the credentials actually work before storing anything.
    const adapter = this.resolveAdapter(broker);
    try {
      await adapter.connect(raw);
    } catch (err) {
      throw new BrokerError('broker_verify_failed', err instanceof Error ? err.message : undefined);
    }

    const sealed = this.vault.seal(credentials);
    const connectionId = await this.connections.upsert({
      accountId,
      broker,
      clientId,
      status: 'active',
    });
    await this.connections.saveCredentials(connectionId, sealedToColumns(sealed));

    return { id: connectionId.toString(), broker, clientId, status: 'active' };
  }

  async list(accountId: bigint): Promise<readonly ConnectionView[]> {
    const rows = await this.connections.listByAccount(accountId);
    return rows.map((r) => ({
      id: r.id.toString(),
      broker: r.broker,
      clientId: r.clientId,
      status: r.status,
    }));
  }

  async disconnect(accountId: bigint, connectionId: bigint): Promise<void> {
    const conn = await this.connections.findById(connectionId);
    if (!conn || conn.accountId !== accountId) {
      throw new BrokerError('connection_not_found');
    }
    await this.connections.setStatus(connectionId, 'disconnected');
    // NOTE: broker-credential key rotation on disconnect (App Flow §3.3) is wired with the
    // background-job ticket.
  }

  /**
   * Open stored credentials to the broker map the adapter expects. Call ONLY at the broker-call
   * moment; never log the result. Used by live-data endpoints (e.g. holdings) in Part 2.
   */
  async openCredentials(accountId: bigint, connectionId: bigint): Promise<Record<string, string>> {
    const conn = await this.connections.findById(connectionId);
    if (!conn || conn.accountId !== accountId) {
      throw new BrokerError('connection_not_found');
    }
    const columns = await this.connections.loadCredentials(connectionId);
    if (!columns) {
      throw new BrokerError('connection_not_found');
    }
    const credentials = this.vault.open(columnsToSealed(columns));
    return reassembleBrokerFields(conn.clientId, credentials);
  }

  private resolveAdapter(broker: Broker): ReturnType<typeof getAdapter> {
    try {
      return getAdapter(broker);
    } catch {
      throw new BrokerError('no_adapter', `No adapter registered for "${broker}"`);
    }
  }
}

function sealedToColumns(sealed: SealedCredentials): SealedCredentialColumns {
  return {
    apiKeyCiphertext: sealed.fields.apiKey ?? null,
    apiSecretCiphertext: sealed.fields.apiSecret ?? null,
    accessTokenCiphertext: sealed.fields.accessToken ?? null,
    totpSeedCiphertext: sealed.fields.totpSeed ?? null,
    pinCiphertext: sealed.fields.pin ?? null,
    dekWrapped: sealed.dekWrapped,
  };
}

function columnsToSealed(columns: SealedCredentialColumns): SealedCredentials {
  const fields: Partial<Record<CredentialField, Buffer>> = {};
  const add = (key: CredentialField, value: Buffer | null): void => {
    if (value) {
      fields[key] = value;
    }
  };
  add('apiKey', columns.apiKeyCiphertext);
  add('apiSecret', columns.apiSecretCiphertext);
  add('accessToken', columns.accessTokenCiphertext);
  add('totpSeed', columns.totpSeedCiphertext);
  add('pin', columns.pinCiphertext);
  return { dekWrapped: columns.dekWrapped, fields };
}

