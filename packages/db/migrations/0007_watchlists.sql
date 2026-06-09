-- RM07 migration 0007 — watchlists (Backend Schema §5; "watchlists with multi-list support, all tiers").
-- Personal data → RLS self-access (Hard rule #3). Items cascade-delete with their watchlist.

CREATE TABLE core.watchlists (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id  bigint NOT NULL REFERENCES core.accounts(id),
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX watchlists_account_idx ON core.watchlists(account_id, sort_order);

CREATE TABLE core.watchlist_items (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  watchlist_id   bigint NOT NULL REFERENCES core.watchlists(id) ON DELETE CASCADE,
  exchange       text NOT NULL CHECK (exchange IN ('NSE','BSE','MCX','NFO','BFO','CDS')),
  trading_symbol text NOT NULL,
  added_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, exchange, trading_symbol)
);

CREATE TRIGGER watchlists_set_updated_at BEFORE UPDATE ON core.watchlists
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- Row-Level Security (§8).
ALTER TABLE core.watchlists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.watchlists      FORCE ROW LEVEL SECURITY;
ALTER TABLE core.watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.watchlist_items FORCE ROW LEVEL SECURITY;

-- watchlists: self-access keyed on account_id.
CREATE POLICY watchlists_select_self ON core.watchlists FOR SELECT
  USING (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY watchlists_insert_self ON core.watchlists FOR INSERT
  WITH CHECK (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY watchlists_update_self ON core.watchlists FOR UPDATE
  USING (account_id = current_setting('app.account_id', true)::bigint);
CREATE POLICY watchlists_delete_self ON core.watchlists FOR DELETE
  USING (account_id = current_setting('app.account_id', true)::bigint);

-- watchlist_items: access only if the parent watchlist belongs to the request account.
CREATE POLICY watchlist_items_select_self ON core.watchlist_items FOR SELECT
  USING (watchlist_id IN (
    SELECT id FROM core.watchlists WHERE account_id = current_setting('app.account_id', true)::bigint));
CREATE POLICY watchlist_items_insert_self ON core.watchlist_items FOR INSERT
  WITH CHECK (watchlist_id IN (
    SELECT id FROM core.watchlists WHERE account_id = current_setting('app.account_id', true)::bigint));
CREATE POLICY watchlist_items_delete_self ON core.watchlist_items FOR DELETE
  USING (watchlist_id IN (
    SELECT id FROM core.watchlists WHERE account_id = current_setting('app.account_id', true)::bigint));

INSERT INTO core.schema_version (version) VALUES (7)
ON CONFLICT (version) DO NOTHING;
