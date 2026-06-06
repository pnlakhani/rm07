import {
  bigint,
  boolean,
  char,
  customType,
  inet,
  integer,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { core } from './namespaces.js';

/** Postgres `citext` (case-insensitive text) for email (Backend Schema §5.1). */
const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

/** Postgres `bytea` for ciphertext columns (Backend Schema §5.4, §5.14 — Tier-1 PII). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Identity + broker-connection tables (Backend Schema §5.1–5.4, §5.13–5.14).
 * Every personal table has RLS enabled in the migration (Hard rule #3) — Drizzle does not
 * manage RLS policies, so they live in `migrations/0001_auth.sql`.
 */

export const accounts = core.table('accounts', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  email: citext('email').notNull().unique(),
  phone: text('phone'),
  displayName: text('display_name'),
  countryCode: char('country_code', { length: 2 }).notNull().default('IN'),
  /** pending_verification | active | suspended | closed */
  accountStatus: text('account_status').notNull().default('pending_verification'),
  /** password | google */
  authProvider: text('auth_provider').notNull().default('password'),
  passwordHashArgon2id: text('password_hash_argon2id'),
  /** none | submitted | verified | rejected */
  kycStatus: text('kyc_status').notNull().default('none'),
  signupSource: text('signup_source'),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = core.table('profiles', {
  accountId: bigint('account_id', { mode: 'bigint' })
    .primaryKey()
    .references(() => accounts.id),
  panMasked: text('pan_masked'),
  addressState: text('address_state'),
  gstin: text('gstin'),
  /** low | medium | high | aggressive */
  riskTolerance: text('risk_tolerance'),
  /** intraday | short | medium | long */
  investmentHorizon: text('investment_horizon'),
  tradingExperienceYears: integer('trading_experience_years'),
  firstOrderCelebratedAt: timestamp('first_order_celebrated_at', { withTimezone: true }),
  themePreference: text('theme_preference').notNull().default('dark'),
  fontSize: text('font_size').notNull().default('default'),
  referredByAccountId: bigint('referred_by_account_id', { mode: 'bigint' }).references(
    () => accounts.id,
  ),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = core.table('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: bigint('account_id', { mode: 'bigint' })
    .notNull()
    .references(() => accounts.id),
  /** Argon2id hash of the rotating refresh token — raw token never stored (Full Doc VII.2). */
  refreshTokenHash: text('refresh_token_hash').notNull(),
  deviceFingerprint: text('device_fingerprint'),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  geoCountry: char('geo_country', { length: 2 }),
  geoCity: text('geo_city'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const mfaFactors = core.table('mfa_factors', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint('account_id', { mode: 'bigint' })
    .notNull()
    .references(() => accounts.id),
  /** totp | passkey | sms_backup */
  factorType: text('factor_type').notNull(),
  /** TOTP secret, envelope-encrypted (KMS-wrapped DEK) — Tier-1 PII, never logged. */
  secretEncrypted: bytea('secret_encrypted'),
  credentialId: text('credential_id'),
  publicKey: bytea('public_key'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  isActive: boolean('is_active').notNull().default(true),
});

export const brokerConnections = core.table('broker_connections', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint('account_id', { mode: 'bigint' })
    .notNull()
    .references(() => accounts.id),
  /** dhan | zerodha | upstox | fyers | angel_one */
  broker: text('broker').notNull(),
  clientId: text('client_id'),
  /** active | token_expired | disconnected | error */
  status: text('status').notNull().default('active'),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
  lastErrorMessage: text('last_error_message'),
});

/**
 * Tier-1 PII vault (Backend Schema §5.14). Ciphertext only. No client SELECT is ever permitted;
 * access is only via the server at the broker-call moment, audit-logged (Hard rule #4).
 */
export const brokerCredentialsEnc = core.table('broker_credentials_enc', {
  connectionId: bigint('connection_id', { mode: 'bigint' })
    .primaryKey()
    .references(() => brokerConnections.id),
  apiKeyCiphertext: bytea('api_key_ciphertext'),
  apiSecretCiphertext: bytea('api_secret_ciphertext'),
  accessTokenCiphertext: bytea('access_token_ciphertext'),
  totpSeedCiphertext: bytea('totp_seed_ciphertext'),
  pinCiphertext: bytea('pin_ciphertext'),
  /** Wrapped per-account/per-connection DEK + reference to the wrapping root key (Doppler P1). */
  dekWrapped: bytea('dek_wrapped'),
  dekWrappingKeyId: text('dek_wrapping_key_id'),
  encryptedAt: timestamp('encrypted_at', { withTimezone: true }).notNull().defaultNow(),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
});
