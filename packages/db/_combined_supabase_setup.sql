-- ============================================================
-- RM07 — combined schema + seed (0000 + 0001 + 0002 + seeds)
-- Paste this whole thing into the Supabase SQL Editor and Run.
-- ============================================================


-- >>>>>>>>>>>>>>>>>>>> migrations/0000_baseline.sql >>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>> migrations/0001_auth.sql >>>>>>>>>>>>>>>>>>>>
-- RM07 migration 0001 — identity + broker-connection tables.
-- Backend Schema §5.1–5.4, §5.13–5.14, §8. Forward-only; never edit after applied (§4).
-- Every personal table has RLS enabled with the standard self-access pattern
-- (current_setting('app.account_id', true)::bigint). Multi-tenant isolation is enforced at the
-- database layer, not the application layer (Hard rule #3).

-- ===========================================================================
-- core.accounts (§5.1)
-- ===========================================================================
CREATE TABLE core.accounts (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email                   citext NOT NULL UNIQUE,
  phone                   text,
  display_name            text,
  country_code            char(2) NOT NULL DEFAULT 'IN',
  account_status          text NOT NULL DEFAULT 'pending_verification'
                            CHECK (account_status IN ('pending_verification','active','suspended','closed')),
  auth_provider           text NOT NULL DEFAULT 'password'
                            CHECK (auth_provider IN ('password','google')),
  password_hash_argon2id  text,
  kyc_status              text NOT NULL DEFAULT 'none'
                            CHECK (kyc_status IN ('none','submitted','verified','rejected')),
  signup_source           text,
  last_sign_in_at         timestamptz,
  is_deleted              boolean NOT NULL DEFAULT false,
  deleted_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- core.profiles (§5.2)
-- ===========================================================================
CREATE TABLE core.profiles (
  account_id                bigint PRIMARY KEY REFERENCES core.accounts(id),
  pan_masked                text,
  address_state             text,
  gstin                     text,
  risk_tolerance            text CHECK (risk_tolerance IN ('low','medium','high','aggressive')),
  investment_horizon        text CHECK (investment_horizon IN ('intraday','short','medium','long')),
  trading_experience_years  integer,
  first_order_celebrated_at timestamptz,
  theme_preference          text NOT NULL DEFAULT 'dark' CHECK (theme_preference IN ('dark','light')),
  font_size                 text NOT NULL DEFAULT 'default' CHECK (font_size IN ('default','large','xlarge')),
  referred_by_account_id    bigint REFERENCES core.accounts(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profiles_referred_by_idx ON core.profiles(referred_by_account_id)
  WHERE referred_by_account_id IS NOT NULL;

-- ===========================================================================
-- core.sessions (§5.3)
-- ===========================================================================
CREATE TABLE core.sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          bigint NOT NULL REFERENCES core.accounts(id),
  refresh_token_hash  text NOT NULL,
  device_fingerprint  text,
  ip                  inet,
  user_agent          text,
  geo_country         char(2),
  geo_city            text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz
);
-- Active-session lookup (logout-all, anomaly checks).
CREATE INDEX sessions_active_idx ON core.sessions(account_id, expires_at DESC)
  WHERE revoked_at IS NULL;

-- ===========================================================================
-- core.mfa_factors (§5.4)
-- ===========================================================================
CREATE TABLE core.mfa_factors (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id       bigint NOT NULL REFERENCES core.accounts(id),
  factor_type      text NOT NULL CHECK (factor_type IN ('totp','passkey','sms_backup')),
  secret_encrypted bytea,
  credential_id    text,
  public_key       bytea,
  last_used_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  is_active        boolean NOT NULL DEFAULT true
);
CREATE INDEX mfa_factors_account_idx ON core.mfa_factors(account_id) WHERE is_active;

-- ===========================================================================
-- core.broker_connections (§5.13)
-- ===========================================================================
CREATE TABLE core.broker_connections (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id         bigint NOT NULL REFERENCES core.accounts(id),
  broker             text NOT NULL CHECK (broker IN ('dhan','zerodha','upstox','fyers','angel_one')),
  client_id          text,
  status             text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','token_expired','disconnected','error')),
  connected_at       timestamptz NOT NULL DEFAULT now(),
  last_verified_at   timestamptz,
  token_expires_at   timestamptz,
  last_error_at      timestamptz,
  last_error_message text,
  UNIQUE (account_id, broker)
);

-- ===========================================================================
-- core.broker_credentials_enc (§5.14) — Tier-1 PII, ciphertext only
-- ===========================================================================
CREATE TABLE core.broker_credentials_enc (
  connection_id         bigint PRIMARY KEY REFERENCES core.broker_connections(id),
  api_key_ciphertext    bytea,
  api_secret_ciphertext bytea,
  access_token_ciphertext bytea,
  totp_seed_ciphertext  bytea,
  pin_ciphertext        bytea,
  dek_wrapped           bytea,
  dek_wrapping_key_id   text,
  encrypted_at          timestamptz NOT NULL DEFAULT now(),
  rotated_at            timestamptz
);

-- ===========================================================================
-- updated_at triggers
-- ===========================================================================
CREATE OR REPLACE FUNCTION core.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON core.accounts
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON core.profiles
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- ===========================================================================
-- Row-Level Security (§8). Helper expression: the request's account id GUC.
-- The API sets it transaction-locally: SELECT set_config('app.account_id', '<id>', true);
-- ===========================================================================
ALTER TABLE core.accounts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.sessions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.mfa_factors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.broker_connections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.broker_credentials_enc  ENABLE ROW LEVEL SECURITY;

-- Force RLS even for the table owner so the service path cannot accidentally bypass it.
ALTER TABLE core.accounts                FORCE ROW LEVEL SECURITY;
ALTER TABLE core.profiles                FORCE ROW LEVEL SECURITY;
ALTER TABLE core.sessions                FORCE ROW LEVEL SECURITY;
ALTER TABLE core.mfa_factors             FORCE ROW LEVEL SECURITY;
ALTER TABLE core.broker_connections      FORCE ROW LEVEL SECURITY;
ALTER TABLE core.broker_credentials_enc  FORCE ROW LEVEL SECURITY;

-- accounts: a user may read/update only their own row (keyed on id, not account_id).
CREATE POLICY accounts_select_self ON core.accounts FOR SELECT
  USING (id = current_setting('app.account_id', true)::bigint);
CREATE POLICY accounts_update_self ON core.accounts FOR UPDATE
  USING (id = current_setting('app.account_id', true)::bigint);

-- profiles: self-access keyed on account_id.
CREATE POLICY profiles_select_self ON core.profiles FOR SELECT
  USING (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY profiles_insert_self ON core.profiles FOR INSERT
  WITH CHECK (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY profiles_update_self ON core.profiles FOR UPDATE
  USING (account_id = current_setting('app.account_id', true)::bigint);

-- sessions: self-access keyed on account_id.
CREATE POLICY sessions_select_self ON core.sessions FOR SELECT
  USING (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY sessions_insert_self ON core.sessions FOR INSERT
  WITH CHECK (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY sessions_update_self ON core.sessions FOR UPDATE
  USING (account_id = current_setting('app.account_id', true)::bigint);

-- mfa_factors: self-access keyed on account_id.
CREATE POLICY mfa_select_self ON core.mfa_factors FOR SELECT
  USING (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY mfa_insert_self ON core.mfa_factors FOR INSERT
  WITH CHECK (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY mfa_update_self ON core.mfa_factors FOR UPDATE
  USING (account_id = current_setting('app.account_id', true)::bigint);

-- broker_connections: self-access keyed on account_id.
CREATE POLICY broker_conn_select_self ON core.broker_connections FOR SELECT
  USING (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY broker_conn_insert_self ON core.broker_connections FOR INSERT
  WITH CHECK (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY broker_conn_update_self ON core.broker_connections FOR UPDATE
  USING (account_id = current_setting('app.account_id', true)::bigint);

-- broker_credentials_enc: NO client policy at all. With RLS enabled + FORCE and no permissive
-- policy, every row is denied to the request role. Access is only via the privileged service
-- path (service_role / SECURITY DEFINER procedure) which audit-logs each read (Hard rule #4).

-- ===========================================================================
-- Schema version bump
-- ===========================================================================
INSERT INTO core.schema_version (version) VALUES (1)
ON CONFLICT (version) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>> migrations/0002_email_otp_consent.sql >>>>>>>>>>>>>>>>>>>>
-- RM07 migration 0002 — runtime auth tables (forward additions beyond the locked Backend Schema).
-- core.email_otps: short-lived signup / password-reset codes, stored as a peppered HMAC hash.
-- core.consent_records: DPDP consent ledger written at signup (Full Doc VI.4).
-- Both carry RLS self-access. Never edit an applied migration (Backend Schema §4).

CREATE TABLE core.email_otps (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id  bigint NOT NULL REFERENCES core.accounts(id),
  purpose     text NOT NULL CHECK (purpose IN ('signup_verification','password_reset')),
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Latest active code per account+purpose.
CREATE INDEX email_otps_lookup_idx ON core.email_otps(account_id, purpose, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE TABLE core.consent_records (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id     bigint NOT NULL REFERENCES core.accounts(id),
  purpose        text NOT NULL,
  granted        boolean NOT NULL,
  policy_version text NOT NULL,
  ip             inet,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_records_account_idx ON core.consent_records(account_id, created_at DESC);

-- RLS (Backend Schema §8): self-access keyed on account_id.
ALTER TABLE core.email_otps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.email_otps      FORCE ROW LEVEL SECURITY;
ALTER TABLE core.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.consent_records FORCE ROW LEVEL SECURITY;

-- email_otps has NO client policy (deny-all to the request role). OTP issue/verify happens only on
-- the privileged server path (service_role), so codes are never readable by a tenant session.

CREATE POLICY consent_select_self ON core.consent_records FOR SELECT
  USING (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY consent_insert_self ON core.consent_records FOR INSERT
  WITH CHECK (account_id = current_setting('app.account_id', true)::bigint);

INSERT INTO core.schema_version (version) VALUES (2)
ON CONFLICT (version) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>> seed/plans.sql >>>>>>>>>>>>>>>>>>>>
-- Seed: subscription plans (DECISION-LOCKED — Full Doc §IV.1, Hard rule #1). Idempotent.
INSERT INTO core.plans
  (id, display_name, price_monthly_paise, price_quarterly_paise, price_annual_paise, currency, is_active)
VALUES
  ('free',          'Free',          0,      0,      0,       'INR', true),
  ('basic',         'Basic',         49900,  134900, 478800,  'INR', true),
  ('pro',           'Pro',           99900,  269900, 958800,  'INR', true),
  ('elite',         'Elite',         299900, 809900, 2878800, 'INR', true),
  ('institutional', 'Institutional', 0,      0,      0,       'INR', true)
ON CONFLICT (id) DO UPDATE SET
  display_name          = EXCLUDED.display_name,
  price_monthly_paise   = EXCLUDED.price_monthly_paise,
  price_quarterly_paise = EXCLUDED.price_quarterly_paise,
  price_annual_paise    = EXCLUDED.price_annual_paise,
  is_active             = EXCLUDED.is_active;


-- >>>>>>>>>>>>>>>>>>>> seed/exchanges.sql >>>>>>>>>>>>>>>>>>>>
-- Seed: exchanges (Backend Schema §6.1). Idempotent.
INSERT INTO mkt.exchanges (code, name, country) VALUES
  ('NSE', 'National Stock Exchange',   'IN'),
  ('BSE', 'Bombay Stock Exchange',     'IN'),
  ('MCX', 'Multi Commodity Exchange',  'IN'),
  ('NFO', 'NSE Futures & Options',     'IN'),
  ('BFO', 'BSE Futures & Options',     'IN'),
  ('CDS', 'Currency Derivatives',      'IN')
ON CONFLICT (code) DO NOTHING;

