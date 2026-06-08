import { Global, Module } from '@nestjs/common';
import { createDatabase, type Database } from '@rm07/db';
import { loadEnv } from '../config/env';

/** DI token for the shared Drizzle database handle (system/auth connection). */
export const DATABASE = Symbol('DATABASE');

/**
 * Provides the Drizzle database handle from DATABASE_URL (Doppler).
 *
 * NOTE (RLS / role): the auth + system repositories are inherently cross-tenant (look up any
 * email, create accounts) and run on THIS connection. The personal tables enable + FORCE RLS,
 * so this connection must use a role permitted to operate across tenants for auth flows
 * (BYPASSRLS, or a SECURITY DEFINER path). Per-request, RLS-scoped access for user data uses
 * `setRequestUserContext` on a non-bypass role. Validate the exact role posture against Supabase
 * when migrations are applied (see DECISIONS note).
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): Database => {
        const env = loadEnv();
        if (!env.DATABASE_URL) {
          throw new Error('DATABASE_URL is required (set it in Doppler).');
        }
        return createDatabase({ url: env.DATABASE_URL });
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
