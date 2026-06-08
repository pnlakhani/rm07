import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { schema, type Database } from '@rm07/db';
import { DATABASE } from '../db/database.module';
import type {
  AccountRecord,
  AccountStatus,
  AccountsRepository,
  AuthProvider,
  ConsentRepository,
  MfaRepository,
  OtpPurpose,
  OtpRecord,
  OtpRepository,
  RequestContext,
  SessionRecord,
  SessionsRepository,
  TotpFactorRecord,
} from './ports';

/**
 * Drizzle implementations of the auth ports (Backend Schema §5). These run on the system/auth
 * connection (see DatabaseModule note re: RLS/role). Credentials/secrets are never logged.
 */

@Injectable()
export class DrizzleAccountsRepository implements AccountsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findByEmail(email: string): Promise<AccountRecord | null> {
    const [row] = await this.database.db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.email, email))
      .limit(1);
    return row ? toAccount(row) : null;
  }

  async findById(id: bigint): Promise<AccountRecord | null> {
    const [row] = await this.database.db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, id))
      .limit(1);
    return row ? toAccount(row) : null;
  }

  async createPasswordAccount(input: {
    email: string;
    passwordHashArgon2id: string;
    signupSource?: string;
  }): Promise<AccountRecord> {
    const [row] = await this.database.db
      .insert(schema.accounts)
      .values({
        email: input.email,
        passwordHashArgon2id: input.passwordHashArgon2id,
        authProvider: 'password',
        accountStatus: 'pending_verification',
        ...(input.signupSource ? { signupSource: input.signupSource } : {}),
      })
      .returning();
    return toAccount(row!);
  }

  async setStatus(id: bigint, status: AccountStatus): Promise<void> {
    await this.database.db
      .update(schema.accounts)
      .set({ accountStatus: status })
      .where(eq(schema.accounts.id, id));
  }

  async setPasswordHash(id: bigint, passwordHashArgon2id: string): Promise<void> {
    await this.database.db
      .update(schema.accounts)
      .set({ passwordHashArgon2id })
      .where(eq(schema.accounts.id, id));
  }

  async markSignedIn(id: bigint, at: Date): Promise<void> {
    await this.database.db
      .update(schema.accounts)
      .set({ lastSignInAt: at })
      .where(eq(schema.accounts.id, id));
  }
}

@Injectable()
export class DrizzleOtpRepository implements OtpRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async issue(input: {
    accountId: bigint;
    purpose: OtpPurpose;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.database.db
      .update(schema.emailOtps)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(schema.emailOtps.accountId, input.accountId),
          eq(schema.emailOtps.purpose, input.purpose),
          isNull(schema.emailOtps.consumedAt),
        ),
      );
    await this.database.db.insert(schema.emailOtps).values({
      accountId: input.accountId,
      purpose: input.purpose,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
    });
  }

  async findActive(accountId: bigint, purpose: OtpPurpose): Promise<OtpRecord | null> {
    const [row] = await this.database.db
      .select()
      .from(schema.emailOtps)
      .where(
        and(
          eq(schema.emailOtps.accountId, accountId),
          eq(schema.emailOtps.purpose, purpose),
          isNull(schema.emailOtps.consumedAt),
        ),
      )
      .orderBy(desc(schema.emailOtps.createdAt))
      .limit(1);
    return row
      ? { id: row.id, codeHash: row.codeHash, attempts: row.attempts, expiresAt: row.expiresAt }
      : null;
  }

  async incrementAttempts(id: bigint): Promise<void> {
    await this.database.db
      .update(schema.emailOtps)
      .set({ attempts: sql`${schema.emailOtps.attempts} + 1` })
      .where(eq(schema.emailOtps.id, id));
  }

  async consume(id: bigint, at: Date): Promise<void> {
    await this.database.db
      .update(schema.emailOtps)
      .set({ consumedAt: at })
      .where(eq(schema.emailOtps.id, id));
  }
}

@Injectable()
export class DrizzleMfaRepository implements MfaRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async getTotp(accountId: bigint, opts: { activeOnly: boolean }): Promise<TotpFactorRecord | null> {
    const conditions = [
      eq(schema.mfaFactors.accountId, accountId),
      eq(schema.mfaFactors.factorType, 'totp'),
    ];
    if (opts.activeOnly) {
      conditions.push(eq(schema.mfaFactors.isActive, true));
    }
    const [row] = await this.database.db
      .select()
      .from(schema.mfaFactors)
      .where(and(...conditions))
      .orderBy(desc(schema.mfaFactors.id))
      .limit(1);
    if (!row || !row.secretEncrypted) {
      return null;
    }
    return { id: row.id, secretEncrypted: row.secretEncrypted, isActive: row.isActive };
  }

  async createTotp(input: {
    accountId: bigint;
    secretEncrypted: Buffer;
    isActive: boolean;
  }): Promise<bigint> {
    const [row] = await this.database.db
      .insert(schema.mfaFactors)
      .values({
        accountId: input.accountId,
        factorType: 'totp',
        secretEncrypted: input.secretEncrypted,
        isActive: input.isActive,
      })
      .returning({ id: schema.mfaFactors.id });
    return row!.id;
  }

  async activateTotp(id: bigint): Promise<void> {
    await this.database.db
      .update(schema.mfaFactors)
      .set({ isActive: true })
      .where(eq(schema.mfaFactors.id, id));
  }
}

@Injectable()
export class DrizzleSessionsRepository implements SessionsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(input: {
    accountId: bigint;
    refreshTokenHash: string;
    expiresAt: Date;
    context: RequestContext;
  }): Promise<SessionRecord> {
    const [row] = await this.database.db
      .insert(schema.sessions)
      .values({
        accountId: input.accountId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        ip: input.context.ip ?? null,
        userAgent: input.context.userAgent ?? null,
        deviceFingerprint: input.context.deviceFingerprint ?? null,
      })
      .returning();
    return toSession(row!);
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const [row] = await this.database.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, id))
      .limit(1);
    return row ? toSession(row) : null;
  }

  async revoke(id: string, at: Date): Promise<void> {
    await this.database.db
      .update(schema.sessions)
      .set({ revokedAt: at })
      .where(eq(schema.sessions.id, id));
  }

  async revokeAllForAccount(accountId: bigint, at: Date): Promise<void> {
    await this.database.db
      .update(schema.sessions)
      .set({ revokedAt: at })
      .where(and(eq(schema.sessions.accountId, accountId), isNull(schema.sessions.revokedAt)));
  }
}

@Injectable()
export class DrizzleConsentRepository implements ConsentRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async record(input: {
    accountId: bigint;
    purpose: string;
    granted: boolean;
    policyVersion: string;
    context: RequestContext;
  }): Promise<void> {
    await this.database.db.insert(schema.consentRecords).values({
      accountId: input.accountId,
      purpose: input.purpose,
      granted: input.granted,
      policyVersion: input.policyVersion,
      ip: input.context.ip ?? null,
      userAgent: input.context.userAgent ?? null,
    });
  }
}

// --- mappers ---

interface AccountRow {
  id: bigint;
  email: string;
  passwordHashArgon2id: string | null;
  authProvider: string;
  accountStatus: string;
}
function toAccount(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHashArgon2id: row.passwordHashArgon2id,
    authProvider: row.authProvider as AuthProvider,
    accountStatus: row.accountStatus as AccountStatus,
  };
}

interface SessionRow {
  id: string;
  accountId: bigint;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}
function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    refreshTokenHash: row.refreshTokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}
