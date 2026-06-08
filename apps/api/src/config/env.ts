import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

let dotEnvLoaded = false;

/**
 * Minimal zero-dependency `.env` loader. Merges `KEY=VALUE` lines from `<cwd>/.env` into
 * process.env WITHOUT overriding variables already set in the real environment, and runs once.
 * Keeps local dev simple — secrets live in `apps/api/.env` (gitignored) instead of being re-exported
 * per shell — while production still uses Doppler-injected env. Lines starting with `#` and blank
 * lines are ignored; surrounding single/double quotes are stripped; inline comments are NOT parsed.
 */
function loadDotEnvFile(): void {
  if (dotEnvLoaded) {
    return;
  }
  dotEnvLoaded = true;
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
    if (!match) {
      continue;
    }
    const key = match[1]!;
    let value = match[2]!;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** Validated runtime environment. Values are injected from Doppler (Hard rule: no secrets in code). */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  API_CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  /** Base64-encoded 32-byte AES-256 root key for the broker-credential vault (Doppler). */
  VAULT_ROOT_KEY: z.string().optional(),
  /** Access-JWT signing secret (Doppler). Ephemeral in dev, required in production. */
  JWT_ACCESS_SECRET: z.string().optional(),
  /** Server pepper for hashing email OTPs (Doppler). Ephemeral in dev, required in production. */
  OTP_PEPPER: z.string().optional(),
  /** Postgres connection string for the API's system/auth connection (Doppler). */
  DATABASE_URL: z.string().optional(),
  /** Resend API key for transactional email (Doppler). Logs to console in dev when unset. */
  RESEND_API_KEY: z.string().optional(),
  /** From-address for transactional email. */
  EMAIL_FROM: z.string().default('RM07 <no-reply@rm07.local>'),
  /** Razorpay API key id + secret for the subscription engine (Doppler). */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  /** Razorpay webhook signing secret — verifies inbound webhook authenticity (S-14). */
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  /** JSON map of our plan id -> Razorpay plan id, e.g. {"basic":"plan_x","pro":"plan_y"}. */
  RAZORPAY_PLAN_MAP: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Only auto-load the .env file when reading the real environment (not a caller-supplied source,
  // e.g. unit tests that pass an explicit object).
  if (source === process.env) {
    loadDotEnvFile();
  }
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
