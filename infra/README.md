# infra

Infrastructure-as-code for the **only** self-managed pieces (Full Doc §III.1). Almost everything
is managed PaaS (Vercel, Railway, Supabase, Upstash, Cloudflare) and is configured in those
dashboards / via Doppler — not here. Terraform covers the AWS bits:

- **Static Elastic IP** in `ap-south-1`, registered with each broker per the NSE algorithmic-API
  operational circular (Feb 2025). **Hard rule #10 — must be reserved + registered by Day 35.**
- **Fargate** cluster for `md-svc` (broker WebSocket fan-out).
- **S3** (KMS-encrypted) for invoices, snapshots, backtest reports, and the audit-log Object-Lock mirror.

State is **not** committed (see root `.gitignore`). Use a remote backend (S3 + DynamoDB lock) before
any shared apply. `apply` is a deliberate, reviewed action — never run from CI without approval.
