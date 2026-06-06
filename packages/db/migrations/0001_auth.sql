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
