import { z } from 'zod';
import { BROKERS } from '../constants/brokers.js';
import { PLAN_TIERS } from '../constants/plans.js';

/** Idempotency-Key header value — required on every money/order POST (Hard rule #2). */
export const idempotencyKeySchema = z
  .string()
  .uuid({ message: 'Idempotency-Key must be a UUID' });

/** Cursor pagination query (TRD §6.2). */
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CursorPagination = z.infer<typeof cursorPaginationSchema>;

export const brokerSchema = z.enum(BROKERS);
export const planTierSchema = z.enum(PLAN_TIERS);

/** Money in the wire format: paise as a string (int64-safe) + currency. */
export const moneyWireSchema = z.object({
  paise: z.string().regex(/^-?\d+$/, 'paise must be an integer string'),
  currency: z.literal('INR'),
});
export type MoneyWire = z.infer<typeof moneyWireSchema>;
