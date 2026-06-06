import { sql } from 'drizzle-orm';
import type { Database } from './client.js';

/**
 * Set the per-request tenant context that Postgres RLS policies read via
 * `current_setting('app.account_id', true)::bigint` (Backend Schema §8).
 *
 * MUST be called inside a transaction at the start of every authenticated request so that
 * `set_config(..., is_local => true)` is scoped to that transaction and cannot leak across
 * pooled connections. Isolation is enforced at the database layer, not the app layer
 * (Hard rule #3).
 */
export async function setRequestUserContext(
  tx: Parameters<Parameters<Database['db']['transaction']>[0]>[0],
  accountId: bigint,
): Promise<void> {
  if (accountId <= 0n) {
    throw new Error('accountId must be a positive bigint');
  }
  await tx.execute(
    sql`select set_config('app.account_id', ${accountId.toString()}, true)`,
  );
}

/** Build the SQL string form for tests / inspection. */
export function userContextSql(accountId: bigint): string {
  return `select set_config('app.account_id', '${accountId.toString()}', true)`;
}
