import type { Broker } from '@rm07/core';

/** Status vocabulary (Backend Schema §5.13). */
export type BrokerConnectionStatus = 'active' | 'token_expired' | 'disconnected' | 'error';

export interface AccountKeyRecord {
  readonly accountId: bigint;
  readonly eciesPublicKey: string;
  readonly eciesPrivateKeySealed: Buffer;
}

export interface BrokerConnectionRecord {
  readonly id: bigint;
  readonly accountId: bigint;
  readonly broker: Broker;
  readonly clientId: string | null;
  readonly status: BrokerConnectionStatus;
}

/** Ciphertext columns of core.broker_credentials_enc (§5.14). null where the field is unused. */
export interface SealedCredentialColumns {
  readonly apiKeyCiphertext: Buffer | null;
  readonly apiSecretCiphertext: Buffer | null;
  readonly accessTokenCiphertext: Buffer | null;
  readonly totpSeedCiphertext: Buffer | null;
  readonly pinCiphertext: Buffer | null;
  readonly dekWrapped: Buffer;
}

export interface AccountKeysRepository {
  findByAccount(accountId: bigint): Promise<AccountKeyRecord | null>;
  create(input: AccountKeyRecord): Promise<void>;
}

export interface BrokerConnectionsRepository {
  findByAccountAndBroker(accountId: bigint, broker: Broker): Promise<BrokerConnectionRecord | null>;
  findById(id: bigint): Promise<BrokerConnectionRecord | null>;
  listByAccount(accountId: bigint): Promise<readonly BrokerConnectionRecord[]>;
  /** Insert or update the connection row; returns its id. */
  upsert(input: {
    accountId: bigint;
    broker: Broker;
    clientId: string | null;
    status: BrokerConnectionStatus;
  }): Promise<bigint>;
  setStatus(id: bigint, status: BrokerConnectionStatus): Promise<void>;
  saveCredentials(connectionId: bigint, columns: SealedCredentialColumns): Promise<void>;
  loadCredentials(connectionId: bigint): Promise<SealedCredentialColumns | null>;
}

// DI tokens.
export const ACCOUNT_KEYS_REPOSITORY = Symbol('ACCOUNT_KEYS_REPOSITORY');
export const BROKER_CONNECTIONS_REPOSITORY = Symbol('BROKER_CONNECTIONS_REPOSITORY');
