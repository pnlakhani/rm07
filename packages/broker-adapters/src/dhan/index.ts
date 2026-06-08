import { hasAdapter, registerAdapter } from '../registry.js';
import { DhanAdapter } from './dhan.adapter.js';

export { DhanAdapter } from './dhan.adapter.js';

/**
 * Construct and register the Dhan adapter into the global registry. Idempotent: a no-op if Dhan
 * is already registered. Call once at API startup.
 */
export function registerDhanAdapter(fetchImpl?: typeof globalThis.fetch): void {
  if (hasAdapter('dhan')) {
    return;
  }
  registerAdapter(new DhanAdapter(fetchImpl));
}

export { parseDhanScripMaster, dhanExchangeToCode, type DhanScrip } from './scrip-master.js';
