import { createDatabase } from '@rm07/db';
import { loadEnv } from '../config/env';
import { DrizzleBrokerInstrumentsRepository } from '../instruments/drizzle-repository';
import { InstrumentImportService } from '../instruments/instrument-import.service';

/**
 * Ops CLI: populate mkt.broker_instruments from Dhan's published scrip master.
 *
 * Standalone (no Nest container) — constructs the Drizzle repo + import service directly against
 * DATABASE_URL and runs a single import, then closes the pool. Intended to be run manually or on a
 * schedule (e.g. nightly) until an admin endpoint with RBAC exists. No public surface is exposed.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @rm07/api import:instruments
 *
 * Default source is the broker requested via argv[2] (only `dhan` is supported today).
 */
async function main(): Promise<void> {
  const broker = process.argv[2] ?? 'dhan';
  if (broker !== 'dhan') {
    throw new Error(`Unsupported broker '${broker}'. Supported: dhan`);
  }

  const env = loadEnv();
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required (set it in Doppler / your shell).');
  }

  const database = createDatabase({ url: env.DATABASE_URL });
  try {
    const repo = new DrizzleBrokerInstrumentsRepository(database);
    const importer = new InstrumentImportService(repo);

    const startedAt = Date.now();
    process.stdout.write(`Importing ${broker} scrip master…\n`);
    const written = await importer.importDhanFromSource();
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    process.stdout.write(`Done: upserted ${written} ${broker} instruments in ${seconds}s.\n`);
  } finally {
    await database.sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Instrument import failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
