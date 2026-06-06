import { z } from 'zod';

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
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
