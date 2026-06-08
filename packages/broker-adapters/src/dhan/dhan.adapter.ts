import { paiseToRupees, rupeesToPaise } from '@rm07/core';
import type {
  BrokerAdapter,
  BrokerAdapterMeta,
  BrokerCredentials,
  BrokerSession,
  ExchangeCode,
  Holding,
  InstrumentRef,
  OrderAck,
  OrderStatus,
  OrderType,
  PlaceOrderInput,
  Position,
  ProductCode,
  Quote,
} from '../types.js';

/** Dhan REST base (API v2). https://dhanhq.co/docs/v2/ */
const DHAN_BASE = 'https://api.dhan.co/v2';

type Fetcher = typeof globalThis.fetch;
type HttpMethod = 'GET' | 'POST' | 'DELETE';

interface DhanHolding {
  exchange: string;
  tradingSymbol: string;
  securityId: string;
  isin?: string;
  totalQty: number;
  avgCostPrice: number;
}
interface DhanPosition {
  tradingSymbol: string;
  exchangeSegment: string;
  productType: string;
  buyAvg: number;
  netQty: number;
  realizedProfit: number;
  unrealizedProfit: number;
}
interface DhanLtpResponse {
  data?: Record<string, Record<string, { last_price?: number }>>;
  status?: string;
}
interface DhanOrderResponse {
  orderId?: string;
  orderStatus?: string;
}
interface DhanError {
  errorMessage?: string;
  message?: string;
}

const DHAN_META: BrokerAdapterMeta = {
  broker: 'dhan',
  displayName: 'Dhan',
  authFlow: 'paste_token',
  authFields: [
    { key: 'client_id', label: 'Client ID', type: 'text', required: true },
    {
      key: 'access_token',
      label: 'Access Token',
      type: 'secret',
      required: true,
      hint: 'Dhan web portal → DhanHQ Trading APIs → generate an access token and paste it here.',
    },
  ],
  orderTypes: ['MARKET', 'LIMIT', 'SL', 'SLM'],
  products: ['CNC', 'MIS', 'NRML', 'CO', 'BO', 'AMO'],
  exchanges: ['NSE', 'BSE', 'MCX', 'NFO', 'BFO', 'CDS'],
  returnsGreeks: false,
  hasMarginCalculator: true,
  rateLimit: { requestsPerSecond: 20, ordersPerSecond: 10, burst: 20 },
};

/**
 * Dhan broker adapter (paste-token model, App Flow J-02 / Full Doc III.6.3). The user generates a
 * long-lived access token in Dhan's portal; we verify it with a lightweight call, then route
 * holdings / positions / quotes / orders through the documented v2 REST endpoints. Credentials
 * arrive already-decrypted (the vault opens them at the call moment) and are never logged here.
 */
export class DhanAdapter implements BrokerAdapter {
  readonly meta = DHAN_META;

  constructor(private readonly fetchImpl: Fetcher = globalThis.fetch) {}

  async connect(credentials: BrokerCredentials): Promise<BrokerSession> {
    const clientId = credentials['client_id'];
    const accessToken = credentials['access_token'];
    if (!clientId || !accessToken) {
      throw new Error('Dhan requires client_id and access_token');
    }
    const session: BrokerSession = { clientId, accessToken, tokenExpiresAt: null };
    // Verify the token by hitting an authenticated read endpoint (200 = valid).
    await this.request(session, 'GET', '/holdings');
    return session;
  }

  async verifySession(session: BrokerSession): Promise<boolean> {
    try {
      await this.request(session, 'GET', '/holdings');
      return true;
    } catch {
      return false;
    }
  }

  async getHoldings(session: BrokerSession): Promise<readonly Holding[]> {
    const rows = (await this.request<DhanHolding[]>(session, 'GET', '/holdings')) ?? [];
    return rows.map((h) => ({
      tradingSymbol: h.tradingSymbol,
      exchange: holdingExchange(h.exchange),
      quantity: h.totalQty,
      avgPricePaise: rupeesToPaise(h.avgCostPrice),
      // The /holdings endpoint does not return LTP; it is supplied by the market-data feed.
      ltpPaise: 0n,
      ...(h.isin ? { isin: h.isin } : {}),
    }));
  }

  async getPositions(session: BrokerSession): Promise<readonly Position[]> {
    const rows = (await this.request<DhanPosition[]>(session, 'GET', '/positions')) ?? [];
    return rows.map((p) => ({
      tradingSymbol: p.tradingSymbol,
      exchange: segmentToExchange(p.exchangeSegment),
      product: dhanToProduct(p.productType),
      netQuantity: p.netQty,
      avgPricePaise: rupeesToPaise(p.buyAvg),
      ltpPaise: 0n,
      realisedPnlPaise: rupeesToPaise(p.realizedProfit),
      unrealisedPnlPaise: rupeesToPaise(p.unrealizedProfit),
    }));
  }

  async getQuote(session: BrokerSession, instrument: InstrumentRef): Promise<Quote> {
    if (!instrument.securityId) {
      throw new Error('Dhan getQuote requires a resolved securityId');
    }
    const segment = exchangeToSegment(instrument.exchange);
    const body = { [segment]: [Number(instrument.securityId)] };
    const res = await this.request<DhanLtpResponse>(session, 'POST', '/marketfeed/ltp', body, true);
    const lastPrice = res?.data?.[segment]?.[instrument.securityId]?.last_price ?? 0;
    return {
      tradingSymbol: instrument.tradingSymbol,
      ltpPaise: rupeesToPaise(lastPrice),
      volume: 0n,
      at: new Date(),
    };
  }

  async placeOrder(session: BrokerSession, input: PlaceOrderInput): Promise<OrderAck> {
    if (!input.securityId) {
      throw new Error('Dhan placeOrder requires a resolved securityId');
    }
    const body = {
      dhanClientId: session.clientId,
      correlationId: input.idempotencyKey.replace(/[^a-zA-Z0-9_-]/gu, '').slice(0, 30),
      transactionType: input.side,
      exchangeSegment: exchangeToSegment(input.exchange),
      productType: productToDhan(input.product),
      orderType: orderTypeToDhan(input.orderType),
      validity: input.validity,
      securityId: input.securityId,
      quantity: input.quantity,
      price: input.pricePaise !== undefined ? paiseToRupees(input.pricePaise) : 0,
      triggerPrice: input.triggerPricePaise !== undefined ? paiseToRupees(input.triggerPricePaise) : 0,
    };
    const res = await this.request<DhanOrderResponse>(session, 'POST', '/orders', body);
    return { brokerOrderId: res.orderId ?? '', status: orderStatus(res.orderStatus) };
  }

  async cancelOrder(session: BrokerSession, brokerOrderId: string): Promise<OrderAck> {
    const res = await this.request<DhanOrderResponse>(
      session,
      'DELETE',
      `/orders/${encodeURIComponent(brokerOrderId)}`,
    );
    return { brokerOrderId: res?.orderId ?? brokerOrderId, status: orderStatus(res?.orderStatus ?? 'CANCELLED') };
  }

  private async request<T>(
    session: BrokerSession,
    method: HttpMethod,
    path: string,
    body?: unknown,
    includeClientId = false,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'access-token': session.accessToken,
      'content-type': 'application/json',
      accept: 'application/json',
    };
    if (includeClientId) {
      headers['client-id'] = session.clientId;
    }
    const res = await this.fetchImpl(`${DHAN_BASE}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const err = json as DhanError | undefined;
      throw new Error(err?.errorMessage ?? err?.message ?? `Dhan ${method} ${path} failed (${res.status})`);
    }
    return json as T;
  }
}

// --- mappings (Dhan annexure) ---

function holdingExchange(exchange: string): ExchangeCode {
  if (exchange === 'NSE') return 'NSE';
  if (exchange === 'BSE') return 'BSE';
  return 'NSE';
}

function segmentToExchange(segment: string): ExchangeCode {
  switch (segment) {
    case 'NSE_EQ':
      return 'NSE';
    case 'BSE_EQ':
      return 'BSE';
    case 'NSE_FNO':
      return 'NFO';
    case 'BSE_FNO':
      return 'BFO';
    case 'MCX_COMM':
      return 'MCX';
    case 'NSE_CURRENCY':
    case 'BSE_CURRENCY':
      return 'CDS';
    default:
      return 'NSE';
  }
}

function exchangeToSegment(exchange: ExchangeCode): string {
  switch (exchange) {
    case 'NSE':
      return 'NSE_EQ';
    case 'BSE':
      return 'BSE_EQ';
    case 'NFO':
      return 'NSE_FNO';
    case 'BFO':
      return 'BSE_FNO';
    case 'MCX':
      return 'MCX_COMM';
    case 'CDS':
      return 'NSE_CURRENCY';
    default:
      return 'NSE_EQ';
  }
}

function dhanToProduct(product: string): ProductCode {
  switch (product) {
    case 'CNC':
      return 'CNC';
    case 'INTRADAY':
      return 'MIS';
    case 'MARGIN':
    case 'MTF':
      return 'NRML';
    case 'CO':
      return 'CO';
    case 'BO':
      return 'BO';
    default:
      return 'NRML';
  }
}

function productToDhan(product: ProductCode): string {
  switch (product) {
    case 'CNC':
      return 'CNC';
    case 'MIS':
      return 'INTRADAY';
    case 'NRML':
      return 'MARGIN';
    case 'CO':
      return 'CO';
    case 'BO':
      return 'BO';
    default:
      return 'CNC';
  }
}

function orderTypeToDhan(orderType: OrderType): string {
  switch (orderType) {
    case 'MARKET':
      return 'MARKET';
    case 'LIMIT':
      return 'LIMIT';
    case 'SL':
      return 'STOP_LOSS';
    case 'SLM':
      return 'STOP_LOSS_MARKET';
    default:
      return 'MARKET';
  }
}

function orderStatus(status: string | undefined): OrderStatus {
  switch (status) {
    case 'TRANSIT':
      return 'PENDING';
    case 'PENDING':
      return 'OPEN';
    case 'PART_TRADED':
      return 'PARTIAL';
    case 'TRADED':
      return 'COMPLETE';
    case 'REJECTED':
      return 'REJECTED';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
}
