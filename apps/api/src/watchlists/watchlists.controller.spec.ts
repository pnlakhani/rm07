import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/request-context';
import { WatchlistsController } from './watchlists.controller';
import type { WatchlistsService } from './watchlists.service';

const account: AuthContext = { accountId: 7n };

function make(): {
  controller: WatchlistsController;
  service: {
    create: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    addItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
  };
} {
  const service = {
    create: vi.fn().mockResolvedValue({ id: '1', name: 'L', items: [] }),
    list: vi.fn().mockResolvedValue([{ id: '1', name: 'L', items: [] }]),
    remove: vi.fn().mockResolvedValue(undefined),
    addItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  };
  return { controller: new WatchlistsController(service as unknown as WatchlistsService), service };
}

describe('WatchlistsController', () => {
  it('creates a watchlist', async () => {
    const { controller, service } = make();
    const out = await controller.create({ name: 'L' }, account);
    expect(out).toMatchObject({ id: '1', name: 'L' });
    expect(service.create).toHaveBeenCalledWith(7n, 'L');
  });

  it('lists watchlists', async () => {
    const { controller } = make();
    expect((await controller.list(account)).length).toBe(1);
  });

  it('deletes by numeric id', async () => {
    const { controller, service } = make();
    await controller.remove('1', account);
    expect(service.remove).toHaveBeenCalledWith(7n, 1n);
  });

  it('rejects a non-numeric id', async () => {
    const { controller } = make();
    await expect(controller.remove('abc', account)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('adds an item', async () => {
    const { controller, service } = make();
    const out = await controller.addItem('1', { exchange: 'NSE', tradingSymbol: 'RELIANCE' }, account);
    expect(out).toEqual({ status: 'added' });
    expect(service.addItem).toHaveBeenCalledWith(7n, 1n, 'NSE', 'RELIANCE');
  });

  it('removes an item by numeric ids', async () => {
    const { controller, service } = make();
    await controller.removeItem('1', '3', account);
    expect(service.removeItem).toHaveBeenCalledWith(7n, 1n, 3n);
  });

  it('rejects a non-numeric item id', async () => {
    const { controller } = make();
    await expect(controller.removeItem('1', 'abc', account)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
