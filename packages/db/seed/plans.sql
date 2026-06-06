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
