-- RM07 migration 0006 — billing (Backend Schema §5.5–5.x).
-- core.subscriptions: the account's Razorpay subscription + lifecycle. Personal → RLS self-access.
-- core.webhook_events: idempotent inbound-webhook ledger (S-14) — UNIQUE (provider, event_id)
-- guarantees each Razorpay event is processed once; payload retained for replay/debug. System
-- table (written by the webhook path, no user session) → no RLS.

CREATE TABLE core.subscriptions (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id             bigint NOT NULL REFERENCES core.accounts(id),
  plan_id                text NOT NULL REFERENCES core.plans(id),
  razorpay_subscription_id text UNIQUE,
  status                 text NOT NULL DEFAULT 'created'
                           CHECK (status IN ('created','authenticated','active','pending',
                                             'halted','paused','cancelled','completed','expired')),
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_account_idx ON core.subscriptions(account_id, created_at DESC);

CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON core.subscriptions
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

ALTER TABLE core.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select_self ON core.subscriptions FOR SELECT
  USING (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY subscriptions_insert_self ON core.subscriptions FOR INSERT
  WITH CHECK (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY subscriptions_update_self ON core.subscriptions FOR UPDATE
  USING (account_id = current_setting('app.account_id', true)::bigint);

CREATE TABLE core.webhook_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider     text NOT NULL DEFAULT 'razorpay',
  event_id     text NOT NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_id)
);

INSERT INTO core.schema_version (version) VALUES (6)
ON CONFLICT (version) DO NOTHING;
