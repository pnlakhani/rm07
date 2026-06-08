import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ReconciliationService } from '../brokers/reconciliation.service';

/**
 * Ops CLI: run one pass of the order reconciliation watchdog (Full Doc §III.6 — ~every 60s).
 * Boots a headless Nest application context so the service gets its full dependency graph, runs a
 * single reconciliation, prints a summary, and exits. Intended to be invoked by the host scheduler
 * (cron / a 60s loop) until in-process scheduling is wired.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @rm07/api reconcile:orders
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const service = app.get(ReconciliationService, { strict: false });
    const report = await service.reconcile();
    process.stdout.write(
      `Reconciled ${report.checked.toString()} order(s); updated ${report.updated.toString()}; ` +
        `${report.mismatches.length.toString()} mismatch(es).\n`,
    );
    for (const m of report.mismatches) {
      process.stdout.write(`  [${m.kind}] order ${m.orderId} (${m.brokerOrderId}): ${m.detail}\n`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Reconciliation failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
