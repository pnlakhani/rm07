import { bigint, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { core } from './namespaces.js';
import { accounts } from './auth.js';

/**
 * Watchlists (Backend Schema §5 — multi-list, all tiers). Personal data; RLS lives in the
 * migration (0007). Items cascade-delete with their watchlist (FK ON DELETE CASCADE in SQL).
 */
export const watchlists = core.table('watchlists', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint('account_id', { mode: 'bigint' })
    .notNull()
    .references(() => accounts.id),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const watchlistItems = core.table('watchlist_items', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  watchlistId: bigint('watchlist_id', { mode: 'bigint' })
    .notNull()
    .references(() => watchlists.id),
  /** Our ExchangeCode: NSE | BSE | MCX | NFO | BFO | CDS */
  exchange: text('exchange').notNull(),
  tradingSymbol: text('trading_symbol').notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
});
