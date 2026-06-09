-- RM07 migration 0008 — immutable recommendations register (Backend Schema §5.16, Full Doc §III.7.1, §VII compliance).
-- Every AI Mode verdict shown to a user is recorded here with full provenance (model, prompt
-- version, RA registration number, signed-by). NON-personal: a verdict is identical for all users
-- with the same inputs ("research, not personalised advice") → no RLS. Append-only: UPDATE/DELETE
-- are blocked at the database so the audit trail is tamper-evident.

CREATE TABLE core.recommendations_register (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exchange            text NOT NULL CHECK (exchange IN ('NSE','BSE','MCX','NFO','BFO','CDS')),
  trading_symbol      text NOT NULL,
  verdict             text NOT NULL
                        CHECK (verdict IN ('BUY','ADD','HOLD','TRIM','EXIT','INSUFFICIENT_EVIDENCE')),
  one_liner           text NOT NULL,
  st_target_paise     bigint,
  mt_target_paise     bigint,
  lt_target_paise     bigint,
  stop_loss_paise     bigint,
  confidence          integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  signal_news         text NOT NULL CHECK (signal_news IN ('bull','bear','neutral','na')),
  signal_fundamentals text NOT NULL CHECK (signal_fundamentals IN ('bull','bear','neutral','na')),
  signal_technicals   text NOT NULL CHECK (signal_technicals IN ('bull','bear','neutral','na')),
  risk_grade          text NOT NULL CHECK (risk_grade IN ('low','medium','high','aggressive')),
  rationale           text NOT NULL,
  model               text NOT NULL,
  prompt_version      text NOT NULL,
  ra_registration_number text NOT NULL,
  signed_by           text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recommendations_symbol_idx
  ON core.recommendations_register(exchange, trading_symbol, created_at DESC);

-- Enforce append-only: block any UPDATE/DELETE on the register.
CREATE OR REPLACE FUNCTION core.block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'core.recommendations_register is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recommendations_register_append_only
  BEFORE UPDATE OR DELETE ON core.recommendations_register
  FOR EACH ROW EXECUTE FUNCTION core.block_mutation();

INSERT INTO core.schema_version (version) VALUES (8)
ON CONFLICT (version) DO NOTHING;
