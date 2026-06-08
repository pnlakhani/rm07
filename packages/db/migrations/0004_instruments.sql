-- RM07 migration 0004 — instrument master.
-- mkt.instruments: canonical instrument table (Backend Schema §6.2).
-- mkt.broker_instruments: per-broker securityId mapping (forward addition; flag for awareness).
-- Resolution path for quotes/orders is broker_instruments keyed on (broker, exchange, trading_symbol).

CREATE TABLE mkt.instruments (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exchange_id              smallint NOT NULL REFERENCES mkt.exchanges(id),
  symbol                   text NOT NULL,
  tradingsymbol            text NOT NULL,
  name                     text,
  instrument_type          text,
  lot_size                 integer,
  tick_size                numeric,
  expiry                   date,
  strike_paise             bigint,
  underlying_instrument_id bigint REFERENCES mkt.instruments(id),
  isin                     text,
  is_active                boolean NOT NULL DEFAULT true,
  UNIQUE (exchange_id, tradingsymbol, expiry, strike_paise)
);
CREATE INDEX instruments_symbol_idx ON mkt.instruments(symbol);

CREATE TABLE mkt.broker_instruments (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  broker          text NOT NULL CHECK (broker IN ('dhan','zerodha','upstox','fyers','angel_one')),
  exchange        text NOT NULL,         -- our ExchangeCode: NSE/BSE/MCX/NFO/BFO/CDS
  trading_symbol  text NOT NULL,
  security_id     text NOT NULL,         -- broker-side instrument id (Dhan SEM_SMST_SECURITY_ID)
  symbol_name     text,
  instrument_type text,
  lot_size        integer,
  instrument_id   bigint REFERENCES mkt.instruments(id),
  is_active       boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broker, exchange, trading_symbol)
);
CREATE INDEX broker_instruments_secid_idx ON mkt.broker_instruments(broker, security_id);

-- mkt is public-read for paid users (RLS by entitlement, Backend Schema §2). For P1 these are
-- non-personal reference tables read via the privileged server path; no per-tenant RLS needed.

INSERT INTO core.schema_version (version) VALUES (4)
ON CONFLICT (version) DO NOTHING;
