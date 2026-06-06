import type { Broker } from '@rm07/core';
import type { AuthField, BrokerAuthFlow } from './auth-schema.js';

/** Order side / type / product / validity vocabularies (Backend Schema §5.15). */
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SLM';
export type ProductCode = 'CNC' | 'MIS' | 'NRML' | 'CO' | 'BO' | 'GTT' | 'AMO';
export type OrderValidity = 'DAY' | 'IOC';
export type OrderStatus =
  | 'PENDING'
  | 'OPEN'
  | 'PARTIAL'
  | 'COMPLETE'
  | 'CANCELLED'
  | 'REJECTED';

export type ExchangeCode = 'NSE' | 'BSE' | 'MCX' | 'NFO' | 'BFO' | 'CDS';

/** Rate-limit declaration honoured at the gateway before any broker call leaves (TRD §7). */
export interface RateLimitConfig {
  readonly requestsPerSecond: number;
  readonly ordersPerSecond: number;
  readonly burst: number;
}

/** Static metadata describing a broker's capabilities and auth surface. */
export interface BrokerAdapterMeta {
  readonly broker: Broker;
  readonly displayName: string;
  readonly authFlow: BrokerAuthFlow;
  readonly authFields: readonly AuthField[];
  readonly orderTypes: readonly OrderType[];
  readonly products: readonly ProductCode[];
  readonly exchanges: readonly ExchangeCode[];
  readonly returnsGreeks: boolean;
  readonly hasMarginCalculator: boolean;
  readonly rateLimit: RateLimitConfig;
  /** Live WebSocket endpoint, when the broker supports server push. */
  readonly websocketUrl?: string;
  /** Broker-side per-user fee disclosed in the connect modal, in paise (e.g. Zerodha). */
  readonly brokerSideMonthlyFeePaise?: bigint;
}

/** Opaque, already-decrypted credentials. Adapters never see ciphertext or storage (Hard rule #4). */
export interface BrokerCredentials {
  readonly [field: string]: string;
}

/** A connected broker session the adapter can act through. */
export interface BrokerSession {
  readonly clientId: string;
  readonly accessToken: string;
  readonly tokenExpiresAt: Date | null;
}

export interface Holding {
  readonly tradingSymbol: string;
  readonly exchange: ExchangeCode;
  readonly quantity: number;
  readonly avgPricePaise: bigint;
  readonly ltpPaise: bigint;
  readonly isin?: string;
}

export interface Position {
  readonly tradingSymbol: string;
  readonly exchange: ExchangeCode;
  readonly product: ProductCode;
  readonly netQuantity: number;
  readonly avgPricePaise: bigint;
  readonly ltpPaise: bigint;
  readonly realisedPnlPaise: bigint;
  readonly unrealisedPnlPaise: bigint;
}

export interface PlaceOrderInput {
  readonly tradingSymbol: string;
  readonly exchange: ExchangeCode;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly orderType: OrderType;
  readonly product: ProductCode;
  readonly validity: OrderValidity;
  /** Limit/trigger price in paise; required for LIMIT/SL/SLM. */
  readonly pricePaise?: bigint;
  readonly triggerPricePaise?: bigint;
  /**
   * Idempotency key persisted 24h. A POST order is NEVER replayed without a known
   * idempotency key (TRD §7, Hard rule #2).
   */
  readonly idempotencyKey: string;
}

export interface OrderAck {
  readonly brokerOrderId: string;
  readonly status: OrderStatus;
}

/** The OHLC interval an adapter can return. */
export type Interval = '1m' | '5m' | '15m' | '1d';

export interface Quote {
  readonly tradingSymbol: string;
  readonly ltpPaise: bigint;
  readonly volume: bigint;
  readonly oi?: bigint;
  readonly at: Date;
}

/**
 * The single contract every broker integration implements (TRD §7, Full Doc §III.6.1).
 * Implementations live in their own packages/tickets (e.g. Dhan in S1, Zerodha/Upstox in S2)
 * and MUST NOT log, persist, or echo credentials.
 */
export interface BrokerAdapter {
  readonly meta: BrokerAdapterMeta;

  /** Exchange supplied credentials for an authenticated session. */
  connect(credentials: BrokerCredentials): Promise<BrokerSession>;

  /** Verify a session is still live (used by the 60s reconciliation/health job). */
  verifySession(session: BrokerSession): Promise<boolean>;

  getHoldings(session: BrokerSession): Promise<readonly Holding[]>;
  getPositions(session: BrokerSession): Promise<readonly Position[]>;
  getQuote(session: BrokerSession, tradingSymbol: string, exchange: ExchangeCode): Promise<Quote>;

  placeOrder(session: BrokerSession, input: PlaceOrderInput): Promise<OrderAck>;
  cancelOrder(session: BrokerSession, brokerOrderId: string): Promise<OrderAck>;
}
