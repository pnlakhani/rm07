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

/** A new order row to persist before sending to the broker (core.orders §5.15). */
export interface NewOrder {
  readonly accountId: bigint;
  readonly connectionId: bigint;
  readonly broker: string;
  readonly exchange: string;
  readonly tradingSymbol: string;
  readonly securityId: string;
  readonly side: string;
  readonly orderType: string;
  readonly product: string;
  readonly validity: string;
  readonly quantity: number;
  readonly pricePaise: bigint | null;
  readonly triggerPricePaise: bigint | null;
  readonly idempotencyKey: string;
}

/** The mutable lifecycle fields of an order row. */
export interface OrderRecord {
  readonly id: bigint;
  readonly brokerOrderId: string | null;
  readonly status: string;
}

/** A live order to reconcile against the broker order book (non-terminal, already sent). */
export interface ReconcilableOrder {
  readonly id: bigint;
  readonly accountId: bigint;
  readonly connectionId: bigint;
  readonly broker: string;
  readonly brokerOrderId: string;
  readonly status: string;
  readonly filledQuantity: number;
}

/** Fields updated from the broker's source-of-truth order book. */
export interface OrderUpdate {
  readonly status: string;
  readonly filledQuantity: number;
  readonly avgFillPricePaise: bigint | null;
}

/** A row of order history for a connection (most-recent-first). */
export interface OrderHistoryRow {
  readonly id: bigint;
  readonly exchange: string;
  readonly tradingSymbol: string;
  readonly side: string;
  readonly orderType: string;
  readonly product: string;
  readonly quantity: number;
  readonly status: string;
  readonly brokerOrderId: string | null;
  readonly pricePaise: bigint | null;
  readonly filledQuantity: number;
  readonly createdAt: Date;
}

export interface OrdersRepository {
  /**
   * Insert a PENDING order. Returns the new row id, or `null` if an order already exists for this
   * (accountId, idempotencyKey) — the idempotency guard (Hard rule #2).
   */
  insertPending(order: NewOrder): Promise<bigint | null>;
  findByIdempotencyKey(accountId: bigint, idempotencyKey: string): Promise<OrderRecord | null>;
  markPlaced(id: bigint, brokerOrderId: string, status: string): Promise<void>;
  markRejected(id: bigint, message: string): Promise<void>;
  /** Non-terminal orders that have a broker order id — candidates for reconciliation. */
  listReconcilable(): Promise<readonly ReconcilableOrder[]>;
  updateFromBroker(id: bigint, update: OrderUpdate): Promise<void>;
  /** Order history for a connection, most recent first (capped at `limit`). */
  listByConnection(
    accountId: bigint,
    connectionId: bigint,
    limit: number,
  ): Promise<readonly OrderHistoryRow[]>;
}

// DI tokens.
export const ACCOUNT_KEYS_REPOSITORY = Symbol('ACCOUNT_KEYS_REPOSITORY');
export const BROKER_CONNECTIONS_REPOSITORY = Symbol('BROKER_CONNECTIONS_REPOSITORY');
export const ORDERS_REPOSITORY = Symbol('ORDERS_REPOSITORY');
