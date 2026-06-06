-- RM07 baseline migration 0000.
-- Hand-authored bootstrap that MUST run before any drizzle-kit generated migration.
-- It creates the three logical schemas, required extensions, the tenant-context GUC used by
-- RLS, and the seed/reference tables (schema_version, plans, exchanges).
-- Backend Schema §2, §8, §11, §12. Never edit an applied migration (Backend Schema §4).

-- ---------------------------------------------------------------------------
-- Extensions (Supabase Pro ap-south-1)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS citext;        -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid, digest
CREATE EXTENSION IF NOT EXISTS vector;        -- pgvector RAG (mkt.news_items.embedding_v)
-- TimescaleDB is enabled by Supabase; guard so local dev without it still applies.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    CREATE EXTENSION IF NOT EXISTS timescaledb;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Logical schemas
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS mkt;
CREATE SCHEMA IF NOT EXISTS mp;

-- ---------------------------------------------------------------------------
-- Tenant context GUC for Row-Level Security.
-- The API sets this transaction-locally at the start of every authenticated request:
--   SELECT set_config('app.account_id', '<id>', true);
-- RLS policies read current_setting('app.account_id', true)::bigint (Backend Schema §8).
-- Declaring the custom GUC keeps current_setting(..., true) NULL-safe before it is set.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.account_id', '', true);
END$$;

-- ---------------------------------------------------------------------------
-- Schema version (single row; backend fails fast on mismatch — Backend Schema §12)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.schema_version (
  version    bigint PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Plans (Backend Schema §5.5) — prices in integer paise, GST-inclusive (Hard rule #1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.plans (
  id                    text PRIMARY KEY,
  display_name          text NOT NULL,
  price_monthly_paise   bigint NOT NULL,
  price_quarterly_paise bigint NOT NULL,
  price_annual_paise    bigint NOT NULL,
  currency              text NOT NULL DEFAULT 'INR',
  features_jsonb        jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active             boolean NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------------
-- Exchanges (Backend Schema §6.1) — reference data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mkt.exchanges (
  id      smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code    text NOT NULL UNIQUE,
  name    text NOT NULL,
  country char(2) NOT NULL DEFAULT 'IN'
);

INSERT INTO core.schema_version (version) VALUES (0)
ON CONFLICT (version) DO NOTHING;
