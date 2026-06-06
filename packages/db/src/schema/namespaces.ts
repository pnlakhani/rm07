import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Three logical Postgres schemas (Backend Schema §2):
 *   core — operational OLTP (RLS on every personal table)
 *   mkt  — market data (TimescaleDB hypertables)
 *   mp   — marketplace (Phase 3)
 */
export const core = pgSchema('core');
export const mkt = pgSchema('mkt');
export const mp = pgSchema('mp');
