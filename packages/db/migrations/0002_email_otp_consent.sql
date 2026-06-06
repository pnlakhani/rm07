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
