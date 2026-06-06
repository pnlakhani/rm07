import { bigint, boolean, inet, integer, text, timestamp } from 'drizzle-orm/pg-core';
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
