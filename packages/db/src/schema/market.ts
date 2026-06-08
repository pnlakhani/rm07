import { bigint, boolean, integer, numeric, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import { mkt } from './namespaces.js';
import { exchanges } from './index.js';

/** Canonical instrument table (Backend Schema §6.2). */
export const instruments = mkt.table('instruments', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  exchangeId: smallint('exchange_id')
    .notNull()
    .references(() => exchanges.id),
  symbol: text('symbol').notNull(),
  tradingsymbol: text('tradingsymbol').notNull(),
  name: text('name'),
  instrumentType: text('instrument_type'),
  lotSize: integer('lot_size'),
  tickSize: numeric('tick_size'),
  isin: text('isin'),
  isActive: boolean('is_active').notNull().default(true),
});

/** Per-broker instrument mapping (migration 0004). Keyed for (broker, exchange, trading_symbol). */
export const brokerInstruments = mkt.table('broker_instruments', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  broker: text('broker').notNull(),
  exchange: text('exchange').notNull(),
  tradingSymbol: text('trading_symbol').notNull(),
  securityId: text('security_id').notNull(),
  symbolName: text('symbol_name'),
  instrumentType: text('instrument_type'),
  lotSize: integer('lot_size'),
  isActive: boolean('is_active').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
