import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { WatchlistsRepository } from './ports';
import { WatchlistsService } from './watchlists.service';

function make(findByIdResult: { id: bigint; accountId: bigint } | null = { id: 9n, accountId: 1n }): {
  service: WatchlistsService;
  repo: {
    create: ReturnType<typeof vi.fn>;
    listByAccount: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    deleteById: ReturnType<typeof vi.fn>;
    addItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
  };
} {
  const repo = {
    create: vi.fn().mockResolvedValue(9n),
    listByAccount: vi.fn().mockResolvedValue([
      { id: 9n, accountId: 1n, name: 'Nifty50', items: [{ id: 3n, exchange: 'NSE', tradingSymbol: 'RELIANCE' }] },
    ]),
    findById: vi.fn().mockResolvedValue(findByIdResult),
    deleteById: vi.fn().mockResolvedValue(undefined),
    addItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  };
  return { service: new WatchlistsService(repo as unknown as WatchlistsRepository), repo };
}

describe('WatchlistsService', () => {
  it('creates a watchlist and returns a view', async () => {
    const { service, repo } = make();
    expect(await service.create(1n, 'Nifty50')).toEqual({ id: '9', name: 'Nifty50', items: [] });
    expect(repo.create).toHaveBeenCalledWith(1n, 'Nifty50');
  });

  it('lists watchlists with items as string-id views', async () => {
    const { service } = make();
    expect(await service.list(1n)).toEqual([
      { id: '9', name: 'Nifty50', items: [{ id: '3', exchange: 'NSE', tradingSymbol: 'RELIANCE' }] },
    ]);
  });

  it('adds an item to an owned watchlist', async () => {
    const { service, repo } = make();
    await service.addItem(1n, 9n, 'NSE', 'TCS');
    expect(repo.addItem).toHaveBeenCalledWith(9n, 'NSE', 'TCS');
  });

  it('deletes an owned watchlist', async () => {
    const { service, repo } = make();
    await service.remove(1n, 9n);
    expect(repo.deleteById).toHaveBeenCalledWith(9n);
  });

  it('404s when the watchlist does not exist', async () => {
    const { service, repo } = make(null);
    await expect(service.remove(1n, 9n)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.deleteById).not.toHaveBeenCalled();
  });

  it("404s on another account's watchlist (no mutation)", async () => {
    const { service, repo } = make({ id: 9n, accountId: 2n });
    await expect(service.addItem(1n, 9n, 'NSE', 'X')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.addItem).not.toHaveBeenCalled();
  });
});
