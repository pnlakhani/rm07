-- RM07 migration 0005 — order ledger (Backend Schema §5.15).
-- A row is written PENDING before the broker call (persist-before-send), then updated with the
-- broker order id + status. Idempotency dedup is the UNIQUE (account_id, idempotency_key): a
-- retried POST with the same key never double-fires (Hard rule #2, Full Doc §III.5.2 — 24h dedup).
-- RLS self-access keyed on the request account id GUC (Hard rule #3), same pattern as §0001.

CREATE TABLE core.orders (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id           bigint NOT NULL REFERENCES core.accounts(id),
  connection_id        bigint NOT NULL REFERENCES core.broker_connections(id),
  broker               text NOT NULL CHECK (broker IN ('dhan','zerodha','upstox','fyers','angel_one')),
  exchange             text NOT NULL CHECK (exchange IN ('NSE','BSE','MCX','NFO','BFO','CDS')),
  trading_symbol       text NOT NULL,
  security_id          text NOT NULL,
  side                 text NOT NULL CHECK (side IN ('BUY','SELL')),
  order_type           text NOT NULL CHECK (order_type IN ('MARKET','LIMIT','SL','SLM')),
  product              text NOT NULL CHECK (product IN ('CNC','MIS','NRML','CO','BO','GTT','AMO')),
  validity             text NOT NULL DEFAULT 'DAY' CHECK (validity IN ('DAY','IOC')),
  quantity             integer NOT NULL CHECK (quantity > 0),
  price_paise          bigint CHECK (price_paise IS NULL OR price_paise >= 0),
  trigger_price_paise  bigint CHECK (trigger_price_paise IS NULL OR trigger_price_paise >= 0),
  idempotency_key      text NOT NULL,
  broker_order_id      text,
  status               text NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','OPEN','PARTIAL','COMPLETE','CANCELLED','REJECTED')),
  status_message       text,
  filled_quantity      integer NOT NULL DEFAULT 0 CHECK (filled_quantity >= 0),
  avg_fill_price_paise bigint,
  placed_at            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, idempotency_key)
);
-- Order history per account (most recent first).
CREATE INDEX orders_account_created_idx ON core.orders(account_id, created_at DESC);
-- Reconciliation lookup against the broker order book (Full Doc §III.6 — 60s watchdog).
CREATE INDEX orders_broker_order_idx ON core.orders(connection_id, broker_order_id)
  WHERE broker_order_id IS NOT NULL;

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON core.orders
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- Row-Level Security (§8) — self-access keyed on the request account id GUC.
ALTER TABLE core.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.orders FORCE ROW LEVEL SECURITY;

CREATE POLICY orders_select_self ON core.orders FOR SELECT
  USING (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY orders_insert_self ON core.orders FOR INSERT
  WITH CHECK (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY orders_update_self ON core.orders FOR UPDATE
  USING (account_id = current_setting('app.account_id', true)::bigint);

INSERT INTO core.schema_version (version) VALUES (5)
ON CONFLICT (version) DO NOTHING;
