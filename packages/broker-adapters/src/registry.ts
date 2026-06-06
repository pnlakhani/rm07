import type { Broker } from '@rm07/core';
import type { BrokerAdapter } from './types.js';

/**
 * Adapter registry. Concrete adapters self-register at module load; the API resolves an
 * adapter by broker id. Keeps broker-specific code out of call sites.
 */
const registry = new Map<Broker, BrokerAdapter>();

export function registerAdapter(adapter: BrokerAdapter): void {
  if (registry.has(adapter.meta.broker)) {
    throw new Error(`Adapter already registered for broker "${adapter.meta.broker}"`);
  }
  registry.set(adapter.meta.broker, adapter);
}

export function getAdapter(broker: Broker): BrokerAdapter {
  const adapter = registry.get(broker);
  if (!adapter) {
    throw new Error(`No adapter registered for broker "${broker}"`);
  }
  return adapter;
}

export function hasAdapter(broker: Broker): boolean {
  return registry.has(broker);
}

export function registeredBrokers(): readonly Broker[] {
  return [...registry.keys()];
}

/** Test/teardown only. */
export function _clearRegistry(): void {
  registry.clear();
}
