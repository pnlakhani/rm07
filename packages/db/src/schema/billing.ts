import { bigint, boolean, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import { core } from './namespaces.js';
import { accounts } from './auth.js';

/**
 * Billing tables (Backend Schema §5.5–5.x). Subscriptions are personal (RLS in the migration).
 * `plan_id` FKs to core.plans in SQL; the Drizzle column is plain text to avoid a schema-barrel
 * import cycle (the FK is still enforced by Postgres).
 */
export const subscriptions = core.table('subscriptions', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint('account_id', { mode: 'bigint' })
    .notNull()
    .references(() => accounts.id),
  planId: text('plan_id').notNull(),
  razorpaySubscriptionId: text('razorpay_subscription_id'),
  /** created | authenticated | active | pending | halted | paused | cancelled | completed | expired */
  status: text('status').notNull().default('created'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Inbound webhook ledger (S-14). A row per provider event id gives idempotent processing + replay.
 * Not a personal table (system-written by the webhook path); no RLS.
 */
export const webhookEvents = core.table('webhook_events', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  provider: text('provider').notNull().default('razorpay'),
  eventId: text('event_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});
