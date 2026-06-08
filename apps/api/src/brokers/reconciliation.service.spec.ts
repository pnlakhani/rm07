import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _clearRegistry,
  registerAdapter,
  type BrokerAdapter,
  type BrokerOrder,
} from '@rm07/broker-adapters';
import type { BrokerConnectionService } from './broker-connection.service';
import type { OrdersRepository, ReconcilableOrder } from './ports';
import { ReconciliationService } from './reconciliation.service';

function dhanWithBook(book: BrokerOrder[]): BrokerAdapter {
  return {
    meta: {
      broker: 'dhan',
      displayName: 'Dhan',
      authFlow: 'paste_token',
      authFields: [],
      orderTypes: ['MARKET'],
      products: ['CNC'],
      exchanges: ['NSE'],
      returnsGreeks: false,
      hasMarginCalculator: true,
      rateLimit: { requestsPerSecond: 10, ordersPerSecond: 5, burst: 20 },
    },
    connect: () => Promise.resolve({ clientId: 'c', accessToken: 't', tokenExpiresAt: null }),
    verifySession: () => Promise.resolve(true),
    getHoldings: () => Promise.resolve([]),
    getPositions: () => Promise.resolve([]),
    getQuote: () => Promise.resolve({ tradingSymbol: 'X', ltpPaise: 0n, volume: 0n, at: new Date() }),
    placeOrder: () => Promise.resolve({ brokerOrderId: 'o', status: 'OPEN' }),
    cancelOrder: () => Promise.resolve({ brokerOrderId: 'o', status: 'CANCELLED' }),
    getOrders: () => Promise.resolve(book),
  };
}

const liveOrder: ReconcilableOrder = {
  id: 1n,
  accountId: 1n,
  connectionId: 1n,
  broker: 'dhan',
  brokerOrderId: '112',
  status: 'OPEN',
  filledQuantity: 0,
};

function makeService(opts: {
  reconcilable: ReconcilableOrder[];
  openCredentials?: () => Promise<Record<string, string>>;
}): { service: ReconciliationService; updateFromBroker: ReturnType<typeof vi.fn> } {
  const updateFromBroker = vi.fn().mockResolvedValue(undefined);
  const orders = {
    listReconcilable: () => Promise.resolve(opts.reconcilable),
    updateFromBroker,
  } as unknown as OrdersRepository;
  const connections = {
    openCredentials:
      opts.openCredentials ?? (() => Promise.resolve({ client_id: 'C', access_token: 'T' })),
  } as unknown as BrokerConnectionService;
  return { service: new ReconciliationService(orders, connections), updateFromBroker };
}

describe('ReconciliationService', () => {
  afterEach(() => _clearRegistry());

  it('applies broker status + fills back onto a diverged order', async () => {
    _clearRegistry();
    registerAdapter(
      dhanWithBook([
        { brokerOrderId: '112', status: 'COMPLETE', filledQuantity: 5, avgFillPricePaise: 290050n },
      ]),
    );
    const { service, updateFromBroker } = makeService({ reconcilable: [liveOrder] });
    const report = await service.reconcile();
    expect(report).toMatchObject({ checked: 1, updated: 1 });
    expect(report.mismatches).toHaveLength(0);
    expect(updateFromBroker).toHaveBeenCalledWith(1n, {
      status: 'COMPLETE',
      filledQuantity: 5,
      avgFillPricePaise: 290050n,
    });
  });

  it('does not update when our row already matches the broker', async () => {
    _clearRegistry();
    registerAdapter(
      dhanWithBook([{ brokerOrderId: '112', status: 'OPEN', filledQuantity: 0, avgFillPricePaise: 0n }]),
    );
    const { service, updateFromBroker } = makeService({ reconcilable: [liveOrder] });
    const report = await service.reconcile();
    expect(report).toMatchObject({ checked: 1, updated: 0 });
    expect(updateFromBroker).not.toHaveBeenCalled();
  });

  it('flags an order missing from the broker order book', async () => {
    _clearRegistry();
    registerAdapter(dhanWithBook([]));
    const { service, updateFromBroker } = makeService({ reconcilable: [liveOrder] });
    const report = await service.reconcile();
    expect(report.updated).toBe(0);
    expect(report.mismatches).toEqual([
      expect.objectContaining({ orderId: '1', brokerOrderId: '112', kind: 'missing_at_broker' }),
    ]);
    expect(updateFromBroker).not.toHaveBeenCalled();
  });

  it('flags broker_unreachable when the connection cannot be opened', async () => {
    _clearRegistry();
    registerAdapter(dhanWithBook([]));
    const { service, updateFromBroker } = makeService({
      reconcilable: [liveOrder],
      openCredentials: () => Promise.reject(new Error('vault locked')),
    });
    const report = await service.reconcile();
    expect(report.mismatches).toEqual([
      expect.objectContaining({ kind: 'broker_unreachable', detail: 'vault locked' }),
    ]);
    expect(updateFromBroker).not.toHaveBeenCalled();
  });

  it('returns an empty report when nothing is reconcilable', async () => {
    const { service } = makeService({ reconcilable: [] });
    const report = await service.reconcile();
    expect(report).toEqual({ checked: 0, updated: 0, mismatches: [] });
  });
});
