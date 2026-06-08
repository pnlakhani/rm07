import { bigint, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { core } from './namespaces.js';
import { accounts, brokerConnections } from './auth.js';

/**
 * Order ledger (Backend Schema §5.15). A row is written PENDING *before* the broker call
 * (persist-before-send), then updated with the broker order id + status. Idempotency is enforced
 * by a unique (account_id, idempotency_key) — see migrations/0005_orders.sql — so a retried POST
 * never double-fires (Hard rule #2, Full Doc §III.5.2). RLS lives in the migration, not Drizzle.
 */
export const orders = core.table('orders', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint('account_id', { mode: 'bigint' })
    .notNull()
    .references(() => accounts.id),
  connectionId: bigint('connection_id', { mode: 'bigint' })
    .notNull()
    .references(() => brokerConnections.id),
  /** dhan | zerodha | upstox | fyers | angel_one */
  broker: text('broker').notNull(),
  /** Our ExchangeCode: NSE | BSE | MCX | NFO | BFO | CDS */
  exchange: text('exchange').notNull(),
  tradingSymbol: text('trading_symbol').notNull(),
  /** Broker-side instrument id resolved from the instrument master. */
  securityId: text('security_id').notNull(),
  /** BUY | SELL */
  side: text('side').notNull(),
  /** MARKET | LIMIT | SL | SLM */
  orderType: text('order_type').notNull(),
  /** CNC | MIS | NRML | CO | BO | GTT | AMO */
  product: text('product').notNull(),
  /** DAY | IOC */
  validity: text('validity').notNull().default('DAY'),
  quantity: integer('quantity').notNull(),
  pricePaise: bigint('price_paise', { mode: 'bigint' }),
  triggerPricePaise: bigint('trigger_price_paise', { mode: 'bigint' }),
  idempotencyKey: text('idempotency_key').notNull(),
  brokerOrderId: text('broker_order_id'),
  /** PENDING | OPEN | PARTIAL | COMPLETE | CANCELLED | REJECTED */
  status: text('status').notNull().default('PENDING'),
  statusMessage: text('status_message'),
  filledQuantity: integer('filled_quantity').notNull().default(0),
  avgFillPricePaise: bigint('avg_fill_price_paise', { mode: 'bigint' }),
  placedAt: timestamp('placed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
