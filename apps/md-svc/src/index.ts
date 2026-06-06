import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadMdConfig } from './config.js';

/**
 * Market-data fan-out service (AWS Fargate, ap-south-1).
 *
 * Scaffold: exposes a liveness endpoint and the process bootstrap. The sticky-shard broker
 * WebSocket hub, Redis pub/sub fan-out and TimescaleDB tick persistence (TRD §1, Full Doc §III.2)
 * are implemented in the market-data ticket. Egress runs through the registered static Elastic IP
 * (Hard rule #10 / NSE algo-API circular Feb 2025).
 */
export function createHealthServer(): ReturnType<typeof createServer> {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ status: 'ok', service: 'md-svc', time: new Date().toISOString() }),
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'not_found' }));
  });
}

function main(): void {
  const { port } = loadMdConfig();
  const server = createHealthServer();
  server.listen(port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.warn(`RM07 md-svc listening on :${port}`);
  });
}

// Run only when invoked directly, not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
