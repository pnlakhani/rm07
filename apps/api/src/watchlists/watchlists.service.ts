import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { WATCHLISTS_REPOSITORY, type WatchlistsRepository } from './ports';

export interface WatchlistItemView {
  readonly id: string;
  readonly exchange: string;
  readonly tradingSymbol: string;
}

export interface WatchlistView {
  readonly id: string;
  readonly name: string;
  readonly items: readonly WatchlistItemView[];
}

/** Watchlist CRUD. Every mutation on a specific watchlist is ownership-checked against the account. */
@Injectable()
export class WatchlistsService {
  constructor(@Inject(WATCHLISTS_REPOSITORY) private readonly repo: WatchlistsRepository) {}

  async create(accountId: bigint, name: string): Promise<WatchlistView> {
    const id = await this.repo.create(accountId, name);
    return { id: id.toString(), name, items: [] };
  }

  async list(accountId: bigint): Promise<readonly WatchlistView[]> {
    const rows = await this.repo.listByAccount(accountId);
    return rows.map((w) => ({
      id: w.id.toString(),
      name: w.name,
      items: w.items.map((it) => ({
        id: it.id.toString(),
        exchange: it.exchange,
        tradingSymbol: it.tradingSymbol,
      })),
    }));
  }

  async remove(accountId: bigint, watchlistId: bigint): Promise<void> {
    await this.assertOwner(accountId, watchlistId);
    await this.repo.deleteById(watchlistId);
  }

  async addItem(
    accountId: bigint,
    watchlistId: bigint,
    exchange: string,
    tradingSymbol: string,
  ): Promise<void> {
    await this.assertOwner(accountId, watchlistId);
    await this.repo.addItem(watchlistId, exchange, tradingSymbol);
  }

  async removeItem(accountId: bigint, watchlistId: bigint, itemId: bigint): Promise<void> {
    await this.assertOwner(accountId, watchlistId);
    await this.repo.removeItem(watchlistId, itemId);
  }

  private async assertOwner(accountId: bigint, watchlistId: bigint): Promise<void> {
    const watchlist = await this.repo.findById(watchlistId);
    if (!watchlist || watchlist.accountId !== accountId) {
      throw new NotFoundException({ title: 'Watchlist not found', code: 'watchlist.not_found' });
    }
  }
}
