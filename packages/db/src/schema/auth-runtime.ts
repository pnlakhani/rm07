import { bigint, boolean, customType, inet, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { core } from './namespaces.js';
import { accounts } from './auth.js';

/**
 * Runtime auth tables added beyond the locked Backend Schema (forward additions — flag for
 * founder awareness): short-lived email OTPs and the DPDP consent ledger written at signup.
 */

/** Email OTP store (App Flow §3, J-01). Code is stored only as a peppered HMAC hash. */
export const emailOtps = core.table('email_otps', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint('account_id', { mode: 'bigint' })
    .notNull()
    .references(() => accounts.id),
  /** Purpose discriminator: signup_verification | password_reset. */
  purpose: text('purpose').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** DPDP consent ledger — one row per granted/revoked consent purpose (Full Doc VI.4). */
export const consentRecords = core.table('consent_records', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint('account_id', { mode: 'bigint' })
    .notNull()
    .references(() => accounts.id),
  /** e.g. terms_of_service | privacy_policy | marketing_email. */
  purpose: text('purpose').notNull(),
  granted: boolean('granted').notNull(),
  policyVersion: text('policy_version').notNull(),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Postgres bytea for the sealed private key. */
const byteaKey = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Per-account ECIES keypair (migration 0003). Public key is served to the browser; the private
 * key is envelope-sealed at rest and only opened server-side to decrypt a transit payload.
 */
export const accountKeys = core.table('account_keys', {
  accountId: bigint('account_id', { mode: 'bigint' })
    .primaryKey()
    .references(() => accounts.id),
  eciesPublicKey: text('ecies_public_key').notNull(),
  eciesPrivateKeySealed: byteaKey('ecies_private_key_sealed').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
});
