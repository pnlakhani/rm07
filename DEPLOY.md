# RM07 — Staging deployment runbook

This is the step-by-step for getting the platform running in a reachable **staging** environment.
It is deliberately staging-first: the point is to surface integration problems (prod CORS, cookies
across real domains, secrets, the Dhan static IP, a real payment) early and cheaply.

## 1. Topology

| Component | Where | Notes |
|-----------|-------|-------|
| Web (Next.js) | **Vercel** | `apps/web`. Static + SSR. |
| API (NestJS) | **Container host** (Railway / Render / Fly) | `apps/api/Dockerfile`. |
| Database | **Supabase** (ap-south-1) | Use a **separate staging project** — do not mix with prod data. |
| Secrets | **Doppler** (or the host's secret store) | Never commit secrets. |
| Egress IP | **Static IP** on the API host | Required by Dhan / the NSE algo-API circular (see §6). |

## 2. Prerequisites (accounts you create once)

- Vercel project (linked to the GitHub repo `pnlakhani/rm07`).
- A container host (Railway is simplest for a Dockerfile + static egress IP add-on).
- A **staging** Supabase project (separate from the live `wbrjiyddvrxcxwzzpaht` one).
- Doppler project (`rm07`, config `staging`) — or use the host's env UI.
- Resend (verified sending domain), Razorpay (test mode keys + plans), Anthropic API key,
  and a **platform** Dhan account for market data (separate from any personal/user account).

## 3. Database — apply ALL migrations in order

On the **staging** Supabase project's SQL Editor, run each file's contents in this exact order
(they are forward-only; never edit an applied migration):

```
0000_baseline.sql          schemas core/mkt/mp, extensions, schema_version, plans + exchanges seeds
0001_auth.sql              accounts/profiles/sessions/mfa/broker_connections (+RLS)
0002_email_otp_consent.sql
0003_account_keys.sql
0004_instruments.sql
0005_orders.sql
0006_billing.sql
0007_watchlists.sql
0008_recommendations_register.sql
```

> NOTE on the existing live project: it currently has `0001–0004 + 0006` only. `0005`, `0007`, and
> `0008` are written but NOT applied there. A fresh staging DB avoids that drift — apply all nine.

After applying, confirm: `SELECT version FROM core.schema_version ORDER BY version;` → `0..8`.

Then populate the instrument master (so quotes/search/AI Mode resolve) — see §7.

## 4. API — deploy the container

1. Build context is the **repo root**; Dockerfile is `apps/api/Dockerfile`.
   - Railway/Render: set "Dockerfile path" = `apps/api/Dockerfile`, "root directory"/context = repo root.
2. Set environment variables (§5).
3. Health check path: `GET /healthz` (returns 200).
4. **Port:** the app listens on `API_PORT` (default 8080). If the host injects `$PORT`, set
   `API_PORT` to it (Railway: `API_PORT=${{PORT}}`). *(Optional one-line code tweak: make `API_PORT`
   fall back to `process.env.PORT` — ask and I'll add it.)*

### Scheduled jobs (same image, different command)
- Instrument refresh (nightly): `node dist/scripts/import-instruments.js`
- Order reconciliation (~60s): `node dist/scripts/reconcile-orders.js`

Configure these as the host's cron/scheduled tasks pointing at the same image with that command.

## 5. Environment variables (API)

Required in production — the API **fails to boot** without the first one and the secrets are
enforced in prod:

| Var | Required | What |
|-----|----------|------|
| `NODE_ENV` | yes | `production` |
| `DATABASE_URL` | yes | Supabase **Session pooler** string (`...pooler.supabase.com:5432`) |
| `VAULT_ROOT_KEY` | yes (prod) | base64 32-byte AES key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `JWT_ACCESS_SECRET` | yes (prod) | random ≥16 chars |
| `OTP_PEPPER` | yes (prod) | random ≥16 chars |
| `API_CORS_ORIGINS` | yes | the web origin(s), comma-separated, e.g. `https://staging.rm07.app` |
| `API_PORT` | host-dependent | see §4 |

Features (set when you wire each):

| Var | What |
|-----|------|
| `RESEND_API_KEY`, `EMAIL_FROM` | transactional email (else OTP prints to logs — not for prod) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_MAP` | billing. `RAZORPAY_PLAN_MAP` is JSON: `{"basic":"plan_x","pro":"plan_y"}` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | AI Mode (model default `claude-sonnet-4-6`) |
| `AI_RA_REGISTRATION_NUMBER`, `AI_SIGNED_BY` | AI Mode compliance stamps (Hemal's RA number) |
| `DHAN_DATA_CLIENT_ID`, `DHAN_DATA_ACCESS_TOKEN` | platform Dhan market-data account for AI Mode technical signals |

Keep these in Doppler/host secrets. The same values must be **stable** across restarts (a changing
`VAULT_ROOT_KEY` makes already-sealed credentials/TOTP undecryptable).

## 6. Dhan static egress IP (critical, on the launch-critical path)

Dhan's order and market-data APIs require your server's **outbound IP to be static and registered**
with Dhan (per the NSE algo-API circular). Container hosts use dynamic egress by default, so:

- Railway: enable a **static outbound IP** (paid add-on), or
- Fly.io: a dedicated egress IP, or
- route the API's outbound HTTP through a fixed-IP NAT/proxy.

Register that IP in the Dhan portal. Until this is done, live Dhan connect / holdings / orders and
the AI Mode signals feed will be rejected even with valid tokens.

## 7. Populate the instrument master

With `DATABASE_URL` pointing at staging:

```
pnpm --filter @rm07/api build
node apps/api/dist/scripts/import-instruments.js   # or run it as a one-off job on the host
```

This upserts ~218k Dhan instruments into `mkt.broker_instruments` (needed for quotes, search, and
AI Mode resolution).

## 8. Web — deploy on Vercel

- Import the repo; set **Root Directory** = `apps/web`.
- Framework preset: Next.js. Vercel detects the pnpm workspace; the workspace packages
  (`@rm07/core`, `@rm07/ui`) build via `transpilePackages`.
- Environment variable: `NEXT_PUBLIC_API_BASE_URL` = the deployed API URL (e.g. `https://rm07-api.up.railway.app`).
- Cookies + CORS: the API already sets `Secure` cookies in production and honours `API_CORS_ORIGINS`
  with credentials. For the refresh cookie to flow cross-site, the web and API should share a
  registrable domain (e.g. `app.rm07.x` + `api.rm07.x`) — set custom domains on both, or accept that
  same-site cookie behaviour differs across unrelated `*.vercel.app` / `*.railway.app` hosts.

## 9. Smoke test (the staging acceptance pass)

1. Open the web URL → **Sign up** → OTP arrives by email (Resend) → enrol TOTP → land on the dashboard.
2. Reload → still signed in (silent refresh via the httpOnly cookie works cross-domain).
3. **Connect Dhan** with a real token → holdings render (this validates the ECIES round-trip + the
   static IP + the live Dhan token together).
4. Create a watchlist → search a symbol (e.g. `RELI`) → add it.
5. Subscribe to Pro via Razorpay test checkout → webhook flips the plan pill within ~60s.
6. With a Basic+ plan, hit AI Mode for a symbol → a verdict renders with Hemal's RA disclosure (real
   verdict once `DHAN_DATA_*` is set; otherwise `INSUFFICIENT_EVIDENCE`).
7. Place a small order on Dhan → acknowledgement; check `core.orders` has the row; the reconciliation
   job updates its status.

When all seven pass in staging, S1's exit gate is met.

## 10. Rollback / safety

- The recommendations register is append-only (DB-enforced) — safe.
- A bad deploy: redeploy the previous image tag; the DB is forward-only so keep migrations additive.
- AI Mode kill-switch and event-window suppression are Phase-3 (not yet built) — until then, leave
  `DHAN_DATA_*` unset (AI Mode returns `INSUFFICIENT_EVIDENCE`) if you need it dark.
