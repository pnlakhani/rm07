# Migrations

- **`0000_baseline.sql`** is hand-authored and applied **first** (schemas, extensions, RLS
  tenant-context GUC, seed/reference tables). It is idempotent.
- Every subsequent migration is **Drizzle-generated** (`pnpm --filter @rm07/db db:generate`)
  from `src/schema/index.ts` and is **forward-only**. Never edit an applied migration
  (Backend Schema §4).
- Apply locally / in CI with `pnpm --filter @rm07/db db:migrate` (uses `DATABASE_URL` from Doppler).
- Seed reference data from `../seed/*.sql` after migrating.

RLS policies for personal tables are added in the migration that creates each table, following
the standard self-access pattern in Backend Schema §8.
