import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDatabase>;

export interface DbConfig {
  /** Postgres connection string (injected from Doppler; never hard-coded). */
  readonly url: string;
  /** Max pool connections. Keep small per Railway instance. */
  readonly max?: number;
}

/**
 * Create a Drizzle client bound to a postgres-js pool. A bulkhead pool size is enforced;
 * analytics queries may use the raw `sql` client where Drizzle's typed API is insufficient.
 */
export function createDatabase(config: DbConfig): {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sql: ReturnType<typeof postgres>;
} {
  if (!config.url) {
    throw new Error('DbConfig.url is required (set DATABASE_URL via Doppler)');
  }
  const sql = postgres(config.url, {
    max: config.max ?? 10,
    prepare: true,
    // Reject unknown SSL only in prod; Supabase requires TLS.
    ssl: config.url.includes('localhost') ? false : 'require',
  });
  const db = drizzle(sql, { schema });
  return { db, sql };
}
