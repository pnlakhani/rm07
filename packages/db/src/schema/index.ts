import { bigint, boolean, jsonb, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import { core, mkt } from './namespaces.js';

/**
 * Schema barrel. Namespaces live in `./namespaces.ts`; personal/identity tables in `./auth.ts`.
 * Reference/seed tables (schema_version, plans, exchanges) are defined here. The remaining
 * personal-table set is added via forward-only Drizzle migrations; do not edit applied
 * migrations (Backend Schema §4).
 */
export { core, mkt, mp } from './namespaces.js';
export * from './auth.js';
export * from './auth-runtime.js';

/** Single-row schema version; backend verifies expected version on startup (Backend Schema §12). */
export const schemaVersion = core.table('schema_version', {
  version: bigint('version', { mode: 'number' }).primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Subscription plans (Backend Schema §5.5). Seeded; prices in integer paise. */
export const plans = core.table('plans', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  priceMonthlyPaise: bigint('price_monthly_paise', { mode: 'bigint' }).notNull(),
  priceQuarterlyPaise: bigint('price_quarterly_paise', { mode: 'bigint' }).notNull(),
  priceAnnualPaise: bigint('price_annual_paise', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('INR'),
  featuresJsonb: jsonb('features_jsonb').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
});

/** Exchanges (Backend Schema §6.1). Seeded reference data. */
export const exchanges = mkt.table('exchanges', {
  id: smallint('id').primaryKey().generatedAlwaysAsIdentity(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  country: text('country').notNull().default('IN'),
});
