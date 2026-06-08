import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { DATABASE } from './db/database.module';
import type { Database } from '@rm07/db';

/**
 * Boots the full DI graph. A dummy DATABASE_URL is enough because postgres-js connects lazily —
 * no query is issued, so no real database is required. This proves every provider (AuthService
 * factory, repositories, guards, controller, secret providers) wires together correctly.
 */
describe('AppModule bootstrap (DI graph)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    process.env['DATABASE_URL'] = 'postgres://localhost:5432/rm07_dummy';
    process.env['NODE_ENV'] = 'test';
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  });

  afterAll(async () => {
    const handle = moduleRef?.get<Database>(DATABASE, { strict: false });
    await handle?.sql.end({ timeout: 1 }).catch(() => undefined);
    await moduleRef?.close();
  });

  it('resolves AuthService and AuthController', () => {
    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
    expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);
  });
});
