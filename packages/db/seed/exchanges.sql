-- Seed: exchanges (Backend Schema §6.1). Idempotent.
INSERT INTO mkt.exchanges (code, name, country) VALUES
  ('NSE', 'National Stock Exchange',   'IN'),
  ('BSE', 'Bombay Stock Exchange',     'IN'),
  ('MCX', 'Multi Commodity Exchange',  'IN'),
  ('NFO', 'NSE Futures & Options',     'IN'),
  ('BFO', 'BSE Futures & Options',     'IN'),
  ('CDS', 'Currency Derivatives',      'IN')
ON CONFLICT (code) DO NOTHING;
