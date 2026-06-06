# RM07 — Quant Terminal

Monorepo for **Roshan Mishra 07 — Quant Terminal**, a multi-broker, AI-enabled trading and analytics
platform for the Indian markets (NSE / BSE / MCX). Commercially operated by **Ananta Fintech Global LLP**.

> The platform is **not** a stockbroker. It never holds client funds or securities and never executes on
> the exchange directly. It routes user-initiated actions through the user's own connected broker accounts.

## Workspace layout

```
rm07/
├── apps/
│   ├── web/                Next.js 14 App Router  (Vercel Pro)
│   ├── api/                NestJS REST + gRPC      (Railway, Singapore)
│   ├── md-svc/             Market-data WS fan-out  (AWS Fargate, ap-south-1)
│   └── ai-svc/             Python FastAPI AI orchestrator (Railway)
├── packages/
│   ├── core/               Shared types, Zod schemas, constants, money helpers
│   ├── broker-adapters/    BrokerAdapter contract + registry (Dhan/Zerodha/Upstox impls land per-ticket)
│   ├── ui/                 ShadCN-based component primitives
│   └── db/                 Drizzle schema + migrations + RLS helper
├── infra/                  Terraform (AWS bits: static EIP, Fargate)
├── docs/adr/               Architecture Decision Records
└── .github/workflows/      CI: lint · type · test · build · security
```

## Toolchain (locked — see TRD §2/§3, Handoff §6/§7)

- **Package manager:** pnpm 9.x · **Orchestration:** Turborepo
- **Language:** TypeScript strict everywhere; Python (Pydantic strict) for `ai-svc`
- **Validation:** Zod (Node) / Pydantic (Python) at every boundary; unknown fields rejected
- **DB:** Drizzle ORM (transactional) + raw SQL (analytics); migrations checked into git
- **Testing:** Vitest (Node) · Pytest (Python) · Playwright (E2E)
- **Secrets:** Doppler. **Never** commit secrets; `.env.example` documents the surface only.

## Getting started

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

For `ai-svc` (Python 3.11+):

```bash
cd apps/ai-svc
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
ruff check . && black --check . && mypy . && pytest
```

## Conventions

- **Commits:** Conventional Commits (`commitlint`). **Branches:** off `main`; `main` always deployable.
- **PRs:** require Prash's review. CI must be green (lint · type · test · build · SAST/SCA/secret-scan).
- **Money:** integer **paise** (`bigint`) + currency code. Never floats for money.
- **Idempotency-Key** required on every money/order POST (24-hour persistent dedup).
- **Postgres RLS** on every personal table — isolation at the DB layer, not the app layer.

Radhe Radhe 🙏
