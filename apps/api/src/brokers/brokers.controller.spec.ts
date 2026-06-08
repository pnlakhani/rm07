import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BrokersController } from './brokers.controller';
import type { AccountKeysService } from './account-keys.service';
import type { BrokerConnectionService } from './broker-connection.service';
import type { PlaceOrderDto } from './dto';
import type { AuthContext } from '../auth/request-context';

const account: AuthContext = { accountId: 7n };

function make() {
  const accountKeys = { getPublicKey: vi.fn().mockResolvedValue('PUBKEY') } as unknown as AccountKeysService;
  const connections = {
    connect: vi.fn().mockResolvedValue({ id: '1', broker: 'dhan', clientId: 'C', status: 'active' }),
    list: vi.fn().mockResolvedValue([{ id: '1', broker: 'dhan', clientId: 'C', status: 'active' }]),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getHoldings: vi
      .fn()
      .mockResolvedValue([
        { tradingSymbol: 'RELIANCE', exchange: 'NSE', quantity: 10, avgPricePaise: '265500', ltpPaise: '0' },
      ]),
    getQuote: vi
      .fn()
      .mockResolvedValue({ tradingSymbol: 'RELIANCE', exchange: 'NSE', ltpPaise: '290050', at: '2026-06-08T00:00:00.000Z' }),
    placeOrder: vi.fn().mockResolvedValue({ brokerOrderId: 'O1', status: 'OPEN' }),
    listOrders: vi
      .fn()
      .mockResolvedValue([
        { id: '9', exchange: 'NSE', tradingSymbol: 'RELIANCE', side: 'BUY', orderType: 'MARKET', product: 'CNC', quantity: 1, status: 'COMPLETE', brokerOrderId: '112', pricePaise: null, filledQuantity: 1, createdAt: '2026-06-08T00:00:00.000Z' },
      ]),
  } as unknown as BrokerConnectionService;
  return { controller: new BrokersController(accountKeys, connections), accountKeys, connections };
}

describe('BrokersController', () => {
  it('returns the account ECIES public key', async () => {
    const { controller, accountKeys } = make();
    expect(await controller.connectKey(account)).toEqual({ publicKey: 'PUBKEY' });
    expect(accountKeys.getPublicKey).toHaveBeenCalledWith(7n);
  });

  it('connects a broker', async () => {
    const { controller, connections } = make();
    const payload = { epk: 'e', salt: 's', iv: 'i', tag: 't', ct: 'c' };
    const out = await controller.connect({ broker: 'dhan', payload }, account);
    expect(out).toMatchObject({ broker: 'dhan', status: 'active' });
    expect(connections.connect).toHaveBeenCalledWith(7n, 'dhan', payload);
  });

  it('lists connections', async () => {
    const { controller } = make();
    expect((await controller.list(account)).length).toBe(1);
  });

  it('disconnects by numeric id', async () => {
    const { controller, connections } = make();
    await controller.disconnect('1', account);
    expect(connections.disconnect).toHaveBeenCalledWith(7n, 1n);
  });

  it('rejects a non-numeric id', async () => {
    const { controller } = make();
    await expect(controller.disconnect('abc', account)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns live holdings', async () => {
    const { controller, connections } = make();
    const out = await controller.holdings('1', account);
    expect(out[0]?.tradingSymbol).toBe('RELIANCE');
    expect(connections.getHoldings).toHaveBeenCalledWith(7n, 1n);
  });

  it('returns a quote', async () => {
    const { controller, connections } = make();
    const out = await controller.quote('1', 'RELIANCE', 'NSE', account);
    expect(out.ltpPaise).toBe('290050');
    expect(connections.getQuote).toHaveBeenCalledWith(7n, 1n, { symbol: 'RELIANCE', exchange: 'NSE' });
  });

  it('rejects an invalid exchange on quote', async () => {
    const { controller } = make();
    await expect(controller.quote('1', 'RELIANCE', 'BOGUS', account)).rejects.toBeInstanceOf(BadRequestException);
  });

  const order: PlaceOrderDto = {
    tradingSymbol: 'RELIANCE',
    exchange: 'NSE',
    side: 'BUY',
    quantity: 1,
    orderType: 'MARKET',
    product: 'CNC',
    validity: 'DAY',
    idempotencyKey: 'idem-12345',
  };

  it('places an order and forwards the mapped command', async () => {
    const { controller, connections } = make();
    const out = await controller.placeOrder('1', order, account);
    expect(out).toMatchObject({ brokerOrderId: 'O1', status: 'OPEN' });
    expect(connections.placeOrder).toHaveBeenCalledWith(
      7n,
      1n,
      expect.objectContaining({ tradingSymbol: 'RELIANCE', side: 'BUY', orderType: 'MARKET' }),
    );
  });

  it('converts paise strings to bigint for the command', async () => {
    const { controller, connections } = make();
    await controller.placeOrder('1', { ...order, orderType: 'LIMIT', pricePaise: '290050' }, account);
    expect(connections.placeOrder).toHaveBeenCalledWith(
      7n,
      1n,
      expect.objectContaining({ pricePaise: 290050n }),
    );
  });

  it('rejects an order on a non-numeric id', async () => {
    const { controller } = make();
    await expect(controller.placeOrder('abc', order, account)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns order history for a connection', async () => {
    const { controller, connections } = make();
    const out = await controller.orders('1', account);
    expect(out[0]?.tradingSymbol).toBe('RELIANCE');
    expect(connections.listOrders).toHaveBeenCalledWith(7n, 1n);
  });

  it('rejects order history on a non-numeric id', async () => {
    const { controller } = make();
    await expect(controller.orders('abc', account)).rejects.toBeInstanceOf(BadRequestException);
  });
});
