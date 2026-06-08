import { Inject, Injectable } from '@nestjs/common';
import {
  getAdapter,
  type ExchangeCode,
  type Holding,
  type OrderAck,
  type OrderSide,
  type OrderStatus,
  type OrderType,
  type OrderValidity,
  type PlaceOrderInput,
  type ProductCode,
} from '@rm07/broker-adapters';
import type { Broker } from '@rm07/core';
import {
  CredentialVaultService,
  type CredentialField,
  type SealedCredentials,
} from '../security/vault/credential-vault.service';
import type { EciesPayload } from '../security/vault/ecies';
import { InstrumentResolverService } from '../instruments/instrument-resolver.service';
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

/** JSON-safe holding (paise as strings — bigint is not JSON-serialisable). */
export interface HoldingView {
  readonly tradingSymbol: string;
  readonly exchange: string;
  readonly quantity: number;
  readonly avgPricePaise: string;
  readonly ltpPaise: string;
  readonly isin?: string;
}

/** JSON-safe live quote. */
export interface QuoteView {
  readonly tradingSymbol: string;
  readonly exchange: string;
  readonly ltpPaise: string;
  readonly at: string;
}

/** Domain command for placing an order (paise as bigint; resolved/validated upstream). */
export interface PlaceOrderCommand {
  readonly tradingSymbol: string;
  readonly exchange: ExchangeCode;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly orderType: OrderType;
  readonly product: ProductCode;
  readonly validity: OrderValidity;
  readonly pricePaise?: bigint;
  readonly triggerPricePaise?: bigint;
  readonly idempotencyKey: string;
}

/** JSON-safe order acknowledgement. */
export interface OrderAckView {
  readonly brokerOrderId: string;
  readonly status: OrderStatus;
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
    private readonly instruments: InstrumentResolverService,
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

  /** Fetch live holdings from the broker for a connection (App Flow J-02 acceptance). */
  async getHoldings(accountId: bigint, connectionId: bigint): Promise<readonly HoldingView[]> {
    const conn = await this.connections.findById(connectionId);
    if (!conn || conn.accountId !== accountId) {
      throw new BrokerError('connection_not_found');
    }
    const credentials = await this.openCredentials(accountId, connectionId);
    const adapter = this.resolveAdapter(conn.broker);
    const session = {
      clientId: credentials['client_id'] ?? conn.clientId ?? '',
      accessToken: credentials['access_token'] ?? '',
      tokenExpiresAt: null,
    };
    let holdings: readonly Holding[];
    try {
      holdings = await adapter.getHoldings(session);
    } catch (err) {
      throw new BrokerError('broker_verify_failed', err instanceof Error ? err.message : undefined);
    }
    return holdings.map((h) => ({
      tradingSymbol: h.tradingSymbol,
      exchange: h.exchange,
      quantity: h.quantity,
      avgPricePaise: h.avgPricePaise.toString(),
      ltpPaise: h.ltpPaise.toString(),
      ...(h.isin ? { isin: h.isin } : {}),
    }));
  }

  /** Fetch a live LTP quote for (symbol, exchange) on a connection. */
  async getQuote(
    accountId: bigint,
    connectionId: bigint,
    params: { symbol: string; exchange: ExchangeCode },
  ): Promise<QuoteView> {
    const conn = await this.connections.findById(connectionId);
    if (!conn || conn.accountId !== accountId) {
      throw new BrokerError('connection_not_found');
    }
    const securityId = await this.instruments.resolveSecurityId(conn.broker, params.exchange, params.symbol);
    if (!securityId) {
      throw new BrokerError('instrument_not_found');
    }
    const credentials = await this.openCredentials(accountId, connectionId);
    const adapter = this.resolveAdapter(conn.broker);
    const session = {
      clientId: credentials['client_id'] ?? conn.clientId ?? '',
      accessToken: credentials['access_token'] ?? '',
      tokenExpiresAt: null,
    };
    let quote;
    try {
      quote = await adapter.getQuote(session, {
        tradingSymbol: params.symbol,
        exchange: params.exchange,
        securityId,
      });
    } catch (err) {
      throw new BrokerError('broker_verify_failed', err instanceof Error ? err.message : undefined);
    }
    return {
      tradingSymbol: quote.tradingSymbol,
      exchange: params.exchange,
      ltpPaise: quote.ltpPaise.toString(),
      at: quote.at.toISOString(),
    };
  }

  /**
   * Place an order on a connection's broker (App Flow J-04). Resolves the broker-side securityId
   * from the instrument master, opens credentials at the call moment, and forwards the order.
   *
   * NOTE (Hard rule #2): `idempotencyKey` is required and forwarded to the broker as a correlation
   * id. Durable server-side replay-dedup (the core.orders ledger) is a later ticket; until it
   * lands, a retried POST with the same key is de-duped by the broker, not by us.
   */
  async placeOrder(
    accountId: bigint,
    connectionId: bigint,
    input: PlaceOrderCommand,
  ): Promise<OrderAckView> {
    const conn = await this.connections.findById(connectionId);
    if (!conn || conn.accountId !== accountId) {
      throw new BrokerError('connection_not_found');
    }
    const securityId = await this.instruments.resolveSecurityId(
      conn.broker,
      input.exchange,
      input.tradingSymbol,
    );
    if (!securityId) {
      throw new BrokerError('instrument_not_found');
    }
    const credentials = await this.openCredentials(accountId, connectionId);
    const adapter = this.resolveAdapter(conn.broker);
    const session = {
      clientId: credentials['client_id'] ?? conn.clientId ?? '',
      accessToken: credentials['access_token'] ?? '',
      tokenExpiresAt: null,
    };
    const orderInput: PlaceOrderInput = {
      tradingSymbol: input.tradingSymbol,
      exchange: input.exchange,
      securityId,
      side: input.side,
      quantity: input.quantity,
      orderType: input.orderType,
      product: input.product,
      validity: input.validity,
      idempotencyKey: input.idempotencyKey,
      ...(input.pricePaise !== undefined ? { pricePaise: input.pricePaise } : {}),
      ...(input.triggerPricePaise !== undefined ? { triggerPricePaise: input.triggerPricePaise } : {}),
    };
    let ack: OrderAck;
    try {
      ack = await adapter.placeOrder(session, orderInput);
    } catch (err) {
      throw new BrokerError('broker_verify_failed', err instanceof Error ? err.message : undefined);
    }
    return { brokerOrderId: ack.brokerOrderId, status: ack.status };
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

