import { describe, expect, it } from 'vitest';
import { placeOrderSchema } from './dto';

describe('placeOrderSchema', () => {
  const base = {
    tradingSymbol: 'RELIANCE',
    exchange: 'NSE',
    side: 'BUY',
    quantity: 1,
    product: 'CNC',
    idempotencyKey: 'idem-12345',
  };

  it('accepts a market order and defaults validity to DAY', () => {
    const r = placeOrderSchema.safeParse({ ...base, orderType: 'MARKET' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.validity).toBe('DAY');
    }
  });

  it('requires pricePaise for LIMIT orders', () => {
    expect(placeOrderSchema.safeParse({ ...base, orderType: 'LIMIT' }).success).toBe(false);
    expect(
      placeOrderSchema.safeParse({ ...base, orderType: 'LIMIT', pricePaise: '290050' }).success,
    ).toBe(true);
  });

  it('requires both price and trigger for SL orders', () => {
    expect(
      placeOrderSchema.safeParse({ ...base, orderType: 'SL', pricePaise: '290050' }).success,
    ).toBe(false);
    expect(
      placeOrderSchema.safeParse({
        ...base,
        orderType: 'SL',
        pricePaise: '290050',
        triggerPricePaise: '289000',
      }).success,
    ).toBe(true);
  });

  it('requires triggerPricePaise for SLM orders', () => {
    expect(placeOrderSchema.safeParse({ ...base, orderType: 'SLM' }).success).toBe(false);
    expect(
      placeOrderSchema.safeParse({ ...base, orderType: 'SLM', triggerPricePaise: '289000' }).success,
    ).toBe(true);
  });

  it('rejects a price on MARKET orders', () => {
    expect(
      placeOrderSchema.safeParse({ ...base, orderType: 'MARKET', pricePaise: '290050' }).success,
    ).toBe(false);
  });

  it('rejects unknown fields and non-integer paise', () => {
    expect(placeOrderSchema.safeParse({ ...base, orderType: 'MARKET', foo: 1 }).success).toBe(false);
    expect(
      placeOrderSchema.safeParse({ ...base, orderType: 'LIMIT', pricePaise: '29.05' }).success,
    ).toBe(false);
  });

  it('rejects non-positive quantity and a short idempotency key', () => {
    expect(placeOrderSchema.safeParse({ ...base, orderType: 'MARKET', quantity: 0 }).success).toBe(
      false,
    );
    expect(
      placeOrderSchema.safeParse({ ...base, orderType: 'MARKET', idempotencyKey: 'short' }).success,
    ).toBe(false);
  });
});
