import { afterEach, describe, expect, it } from 'vitest';
import {
  _clearRegistry,
  getAdapter,
  hasAdapter,
  registerAdapter,
  registeredBrokers,
} from '../registry.js';
import type { BrokerAdapter } from '../types.js';

const stubAdapter: BrokerAdapter = {
  meta: {
    broker: 'dhan',
    displayName: 'Dhan',
    authFlow: 'paste_token',
    authFields: [
      { key: 'client_id', label: 'Client ID', type: 'text', required: true },
      { key: 'access_token', label: 'Access Token', type: 'secret', required: true },
    ],
    orderTypes: ['MARKET', 'LIMIT'],
    products: ['CNC', 'MIS', 'NRML'],
    exchanges: ['NSE', 'BSE'],
    returnsGreeks: false,
    hasMarginCalculator: true,
    rateLimit: { requestsPerSecond: 10, ordersPerSecond: 5, burst: 20 },
  },
  connect: () =>
    Promise.resolve({ clientId: 'c', accessToken: 't', tokenExpiresAt: null }),
  verifySession: () => Promise.resolve(true),
  getHoldings: () => Promise.resolve([]),
  getPositions: () => Promise.resolve([]),
  getQuote: () =>
    Promise.resolve({ tradingSymbol: 'X', ltpPaise: 0n, volume: 0n, at: new Date() }),
  placeOrder: () => Promise.resolve({ brokerOrderId: 'o', status: 'OPEN' }),
  cancelOrder: () => Promise.resolve({ brokerOrderId: 'o', status: 'CANCELLED' }),
};

afterEach(() => _clearRegistry());

describe('broker registry', () => {
  it('registers and resolves an adapter', () => {
    registerAdapter(stubAdapter);
    expect(hasAdapter('dhan')).toBe(true);
    expect(getAdapter('dhan').meta.displayName).toBe('Dhan');
    expect(registeredBrokers()).toEqual(['dhan']);
  });

  it('rejects duplicate registration', () => {
    registerAdapter(stubAdapter);
    expect(() => registerAdapter(stubAdapter)).toThrow(/already registered/);
  });

  it('throws when resolving an unknown broker', () => {
    expect(() => getAdapter('zerodha')).toThrow(/No adapter registered/);
  });
});
