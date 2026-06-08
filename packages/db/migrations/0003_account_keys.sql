-- RM07 migration 0003 — per-account ECIES keypair for broker-credential transit encryption.
-- Full Doc VII.3 / Hard rule #4: the browser ECIES-encrypts broker credentials to the account's
-- public key before transit; the server decrypts with the private key (sealed at rest).
-- Forward addition beyond the locked Backend Schema (flag for founder awareness).

CREATE TABLE core.account_keys (
  account_id               bigint PRIMARY KEY REFERENCES core.accounts(id),
  ecies_public_key         text NOT NULL,          -- SPKI DER (base64) — served to the browser
  ecies_private_key_sealed bytea NOT NULL,          -- envelope-sealed (vault) PKCS8 private key
  created_at               timestamptz NOT NULL DEFAULT now(),
  rotated_at               timestamptz
);

ALTER TABLE core.account_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.account_keys FORCE ROW LEVEL SECURITY;
-- A tenant may read its own public key; the private key is sealed regardless. Writes go through
-- the privileged server path only.
CREATE POLICY account_keys_select_self ON core.account_keys FOR SELECT
  USING (account_id = current_setting('app.account_id', true)::bigint);

INSERT INTO core.schema_version (version) VALUES (3)
ON CONFLICT (version) DO NOTHING;
