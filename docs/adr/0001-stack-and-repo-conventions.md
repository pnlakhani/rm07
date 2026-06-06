# ADR-0001: Monorepo scaffold, stack lock, and repo conventions

- **Status:** accepted
- **Date:** 2026-06-06
- **Deciders:** Prashant Lakhani (Technology); ratified against the locked canonical docs

## Context

S1 Ticket 1 (Build Plan §20.1) requires the first PR to stand up the monorepo and **set the
repo conventions** every later ticket inherits. The stack and conventions are already
decision-locked in the Handoff (§6/§7), TRD (§2/§3/§14) and Full Documentation (Part III).
This ADR records the scaffold as built, not a new decision.

## Decision

- **pnpm 9 + Turborepo** workspace. Layout: `apps/{web,api,md-svc,ai-svc}`,
  `packages/{core,broker-adapters,ui,db}`, `infra/`, `docs/`.
- **TypeScript strict everywhere** (`tsconfig.base.json`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, no `any`). Python `ai-svc` is Ruff + Black + mypy strict.
- **Validation at every boundary:** Zod (Node) / Pydantic (Python); unknown fields rejected.
- **Money** is integer paise (`bigint`) + currency, never floats (`@rm07/core`).
- **DB** via Drizzle ORM; baseline migration `0000` hand-authored (schemas, extensions, RLS
  tenant-context GUC, seed tables); forward-only migrations thereafter.
- **Brokers** implement one `BrokerAdapter` contract resolved through a registry; no
  broker-specific code at call sites; credentials are never logged or persisted by adapters.
- **CI gates:** format · typecheck · lint · test · build (Node) and ruff · black · mypy ·
  pytest (Python), plus gitleaks · Semgrep · Trivy. Secrets live in Doppler only.
- **Commits:** Conventional Commits (commitlint). `main` always deployable; PRs reviewed by Prash.

## Consequences

- Naming note: Build Plan §20.1 informally calls the broker package `packages/brokers`; the
  authoritative Handoff §7 names it `packages/broker-adapters`. We follow §7. Flagged as minor
  doc drift to reconcile in the Build Plan, not a decision change.
- Skeleton apps ship working health endpoints and real config — no placeholder/TODO code
  (Phase 3 coding rules). Feature surfaces (auth, Dhan adapter, Razorpay, AI Mode, full schema)
  land in their own S1/S2 tickets on top of these boundaries.
