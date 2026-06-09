import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { schema, type Database } from '@rm07/db';
import { DATABASE } from '../db/database.module';
import type {
  WatchlistItemRow,
  WatchlistOwner,
  WatchlistRow,
  WatchlistsRepository,
} from './ports';

@Injectable()
export class DrizzleWatchlistsRepository implements WatchlistsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(accountId: bigint, name: string): Promise<bigint> {
    const [row] = await this.database.db
      .insert(schema.watchlists)
      .values({ accountId, name })
      .returning({ id: schema.watchlists.id });
    return row!.id;
  }

  async listByAccount(accountId: bigint): Promise<readonly WatchlistRow[]> {
    const lists = await this.database.db
      .select({
        id: schema.watchlists.id,
        accountId: schema.watchlists.accountId,
        name: schema.watchlists.name,
      })
      .from(schema.watchlists)
      .where(eq(schema.watchlists.accountId, accountId))
      .orderBy(asc(schema.watchlists.sortOrder), asc(schema.watchlists.id));
    if (lists.length === 0) {
      return [];
    }

    const ids = lists.map((l) => l.id);
    const items = await this.database.db
      .select({
        id: schema.watchlistItems.id,
        watchlistId: schema.watchlistItems.watchlistId,
        exchange: schema.watchlistItems.exchange,
        tradingSymbol: schema.watchlistItems.tradingSymbol,
      })
      .from(schema.watchlistItems)
      .where(inArray(schema.watchlistItems.watchlistId, ids))
      .orderBy(asc(schema.watchlistItems.addedAt));

    const byList = new Map<bigint, WatchlistItemRow[]>();
    for (const it of items) {
      const arr = byList.get(it.watchlistId) ?? [];
      arr.push({ id: it.id, exchange: it.exchange, tradingSymbol: it.tradingSymbol });
      byList.set(it.watchlistId, arr);
    }

    return lists.map((l) => ({
      id: l.id,
      accountId: l.accountId,
      name: l.name,
      items: byList.get(l.id) ?? [],
    }));
  }

  async findById(id: bigint): Promise<WatchlistOwner | null> {
    const [row] = await this.database.db
      .select({ id: schema.watchlists.id, accountId: schema.watchlists.accountId })
      .from(schema.watchlists)
      .where(eq(schema.watchlists.id, id))
      .limit(1);
    return row ? { id: row.id, accountId: row.accountId } : null;
  }

  async deleteById(id: bigint): Promise<void> {
    // watchlist_items cascade-delete via the FK (migration 0007).
    await this.database.db.delete(schema.watchlists).where(eq(schema.watchlists.id, id));
  }

  async addItem(watchlistId: bigint, exchange: string, tradingSymbol: string): Promise<void> {
    await this.database.db
      .insert(schema.watchlistItems)
      .values({ watchlistId, exchange, tradingSymbol })
      .onConflictDoNothing({
        target: [
          schema.watchlistItems.watchlistId,
          schema.watchlistItems.exchange,
          schema.watchlistItems.tradingSymbol,
        ],
      });
  }

  async removeItem(watchlistId: bigint, itemId: bigint): Promise<void> {
    await this.database.db
      .delete(schema.watchlistItems)
      .where(
        and(
          eq(schema.watchlistItems.id, itemId),
          eq(schema.watchlistItems.watchlistId, watchlistId),
        ),
      );
  }
}
