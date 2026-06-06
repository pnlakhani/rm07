import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config. The connection string is injected from Doppler at runtime;
 * never hard-coded (Hard rule: no hardcoded secrets).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  schemaFilter: ['core', 'mkt', 'mp'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/rm07',
  },
  strict: true,
  verbose: true,
});
