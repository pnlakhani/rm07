import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _clearRegistry,
  registerAdapter,
  type BrokerAdapter,
  type PlaceOrderInput,
} from '@rm07/broker-adapters';
import type { Broker } from '@rm07/core';
import { CredentialVaultService } from '../security/vault/credential-vault.service';
import { eciesEncrypt } from '../security/vault/ecies';
import { AccountKeysService } from './account-keys.service';
import type { InstrumentResolverService } from '../instruments/instrument-resolver.service';
import { BrokerConnectionService } from './broker-connection.service';
import { BrokerError } from './errors';
import type {
  AccountKeyRecord,
  AccountKeysRepository,
  BrokerConnectionRecord,
  BrokerConnectionStatus,
  BrokerConnectionsRepository,
  SealedCredentialColumns,
} from './ports';

class FakeAccountKeys implements AccountKeysRepository {
  readonly rows = new Map<bigint, AccountKeyRecord>();
  findByAccount(accountId: bigint): Promise<AccountKeyRecord | null> {
    return Promise.resolve(this.rows.get(accountId) ?? null);
  }
  create(input: AccountKeyRecord): Promise<void> {
    this.rows.set(input.accountId, input);
    return Promise.resolve();
  }
}

interface StoredConn {
  id: bigint;
  accountId: bigint;
  broker: Broker;
  clientId: string | null;
  status: BrokerConnectionStatus;
}

class FakeConnections implements BrokerConnectionsRepository {
  private seq = 0n;
  readonly conns: StoredConn[] = [];
  readonly creds = new Map<bigint, SealedCredentialColumns>();

  findByAccountAndBroker(accountId: bigint, broker: Broker): Promise<BrokerConnectionRecord | null> {
    const c = this.conns.find((x) => x.accountId === accountId && x.broker === broker);
    return Promise.resolve(c ? { ...c } : null);
  }
  findById(id: bigint): Promise<BrokerConnectionRecord | null> {
    const c = this.conns.find((x) => x.id === id);
    return Promise.resolve(c ? { ...c } : null);
  }
  listByAccount(accountId: bigint): Promise<readonly BrokerConnectionRecord[]> {
    return Promise.resolve(this.conns.filter((x) => x.accountId === accountId).map((c) => ({ ...c })));
  }
  upsert(input: {
    accountId: bigint;
    broker: Broker;
    clientId: string | null;
    status: BrokerConnectionStatus;
  }): Promise<bigint> {
    const existing = this.conns.find((x) => x.accountId === input.accountId && x.broker === input.broker);
    if (existing) {
      existing.clientId = input.clientId;
      existing.status = input.status;
      return Promise.resolve(existing.id);
    }
    this.seq += 1n;
    this.conns.push({ id: this.seq, ...input });
    return Promise.resolve(this.seq);
  }
  setStatus(id: bigint, status: BrokerConnectionStatus): Promise<void> {
    const c = this.conns.find((x) => x.id === id);
    if (c) c.status = status;
    return Promise.resolve();
  }
  saveCredentials(connectionId: bigint, columns: SealedCredentialColumns): Promise<void> {
    this.creds.set(connectionId, columns);
    return Promise.resolve();
  }
  loadCredentials(connectionId: bigint): Promise<SealedCredentialColumns | null> {
    return Promise.resolve(this.creds.get(connectionId) ?? null);
  }
}

const stubDhan: BrokerAdapter = {
  meta: {
    broker: 'dhan',
    displayName: 'Dhan',
    authFlow: 'paste_token',
    authFields: [],
    orderTypes: ['MARKET'],
    products: ['CNC'],
    exchanges: ['NSE'],
    returnsGreeks: false,
    hasMarginCalculator: true,
    rateLimit: { requestsPerSecond: 10, ordersPerSecond: 5, burst: 20 },
  },
  connect: (creds) =>
    creds['access_token'] === 'BAD'
      ? Promise.reject(new Error('Token rejected by Dhan'))
      : Promise.resolve({
          clientId: creds['client_id'] ?? 'x',
          accessToken: creds['access_token'] ?? '',
          tokenExpiresAt: null,
        }),
  verifySession: () => Promise.resolve(true),
  getHoldings: () =>
    Promise.resolve([
      { tradingSymbol: 'RELIANCE', exchange: 'NSE', quantity: 10, avgPricePaise: 265500n, ltpPaise: 0n },
    ]),
  getPositions: () => Promise.resolve([]),
  getQuote: () => Promise.resolve({ tradingSymbol: 'RELIANCE', ltpPaise: 290050n, volume: 0n, at: new Date() }),
  placeOrder: () => Promise.resolve({ brokerOrderId: 'o', status: 'OPEN' }),
  cancelOrder: () => Promise.resolve({ brokerOrderId: 'o', status: 'CANCELLED' }),
};

function makeHarness() {
  const vault = new CredentialVaultService(randomBytes(32).toString('base64'));
  const keysRepo = new FakeAccountKeys();
  const connsRepo = new FakeConnections();
  const accountKeys = new AccountKeysService(keysRepo, vault);
  const instruments = { resolveSecurityId: () => Promise.resolve('2885') } as unknown as InstrumentResolverService;
  const service = new BrokerConnectionService(accountKeys, connsRepo, vault, instruments);
  return { vault, keysRepo, connsRepo, accountKeys, service };
}

type Harness = ReturnType<typeof makeHarness>;

async function encryptedPayload(h: Harness, accountId: bigint, fields: Record<string, string>, pubOverride?: string) {
  const pub = pubOverride ?? (await h.accountKeys.getPublicKey(accountId));
  return eciesEncrypt(Buffer.from(JSON.stringify(fields), 'utf8'), pub);
}

describe('BrokerConnectionService', () => {
  let h: Harness;

  beforeEach(() => {
    _clearRegistry();
    registerAdapter(stubDhan);
    h = makeHarness();
  });
  afterEach(() => _clearRegistry());

  it('connects: decrypts, verifies, seals, stores ciphertext only', async () => {
    const payload = await encryptedPayload(h, 1n, { client_id: 'CID-1', access_token: 'SECRET-TOKEN' });
    const view = await h.service.connect(1n, 'dhan', payload);

    expect(view).toMatchObject({ broker: 'dhan', clientId: 'CID-1', status: 'active' });
    // Stored ciphertext must not contain the plaintext token.
    const cols = h.connsRepo.creds.get(BigInt(view.id))!;
    expect(cols.accessTokenCiphertext?.toString('utf8')).not.toContain('SECRET-TOKEN');
    expect(cols.dekWrapped.toString('utf8')).not.toContain('SECRET-TOKEN');
  });

  it('round-trips credentials back to the broker map via openCredentials', async () => {
    const payload = await encryptedPayload(h, 1n, { client_id: 'CID-1', access_token: 'SECRET-TOKEN' });
    const view = await h.service.connect(1n, 'dhan', payload);
    const opened = await h.service.openCredentials(1n, BigInt(view.id));
    expect(opened).toEqual({ client_id: 'CID-1', access_token: 'SECRET-TOKEN' });
  });

  it('lists and disconnects', async () => {
    const payload = await encryptedPayload(h, 1n, { client_id: 'CID-1', access_token: 'T' });
    const view = await h.service.connect(1n, 'dhan', payload);
    expect((await h.service.list(1n)).map((c) => c.broker)).toEqual(['dhan']);
    await h.service.disconnect(1n, BigInt(view.id));
    expect((await h.service.list(1n))[0]?.status).toBe('disconnected');
  });

  it("rejects another account's disconnect", async () => {
    const payload = await encryptedPayload(h, 1n, { client_id: 'CID-1', access_token: 'T' });
    const view = await h.service.connect(1n, 'dhan', payload);
    await expect(h.service.disconnect(2n, BigInt(view.id))).rejects.toMatchObject({
      code: 'connection_not_found',
    });
  });

  it('fails verification when the broker rejects the token', async () => {
    const payload = await encryptedPayload(h, 1n, { client_id: 'CID', access_token: 'BAD' });
    await expect(h.service.connect(1n, 'dhan', payload)).rejects.toMatchObject({
      code: 'broker_verify_failed',
    });
    expect(h.connsRepo.conns).toHaveLength(0);
  });

  it('errors when no adapter is registered for the broker', async () => {
    const payload = await encryptedPayload(h, 1n, { api_key: 'K', api_secret: 'S' });
    await expect(h.service.connect(1n, 'zerodha', payload)).rejects.toMatchObject({ code: 'no_adapter' });
  });

  it('fails to decrypt a payload sealed to a different key', async () => {
    await h.accountKeys.getPublicKey(1n); // create the real key
    const wrong = h.vault.generateAccountKeyPair();
    const payload = await encryptedPayload(h, 1n, { client_id: 'C', access_token: 'T' }, wrong.publicKey);
    await expect(h.service.connect(1n, 'dhan', payload)).rejects.toMatchObject({
      code: 'transit_decrypt_failed',
    });
  });

  it('requires an account key before connect', async () => {
    await expect(h.accountKeys.getPrivateKey(99n)).rejects.toBeInstanceOf(BrokerError);
  });

  it('fetches live holdings via the adapter (paise as strings)', async () => {
    const payload = await encryptedPayload(h, 1n, { client_id: 'CID-1', access_token: 'T' });
    const view = await h.service.connect(1n, 'dhan', payload);
    const holdings = await h.service.getHoldings(1n, BigInt(view.id));
    expect(holdings).toEqual([
      { tradingSymbol: 'RELIANCE', exchange: 'NSE', quantity: 10, avgPricePaise: '265500', ltpPaise: '0' },
    ]);
  });

  it('fetches a live quote via the resolver + adapter', async () => {
    const payload = await encryptedPayload(h, 1n, { client_id: 'CID-1', access_token: 'T' });
    const view = await h.service.connect(1n, 'dhan', payload);
    const quote = await h.service.getQuote(1n, BigInt(view.id), { symbol: 'RELIANCE', exchange: 'NSE' });
    expect(quote).toMatchObject({ tradingSymbol: 'RELIANCE', exchange: 'NSE', ltpPaise: '290050' });
  });

  const marketOrder = {
    tradingSymbol: 'RELIANCE',
    exchange: 'NSE',
    side: 'BUY',
    quantity: 1,
    orderType: 'MARKET',
    product: 'CNC',
    validity: 'DAY',
    idempotencyKey: 'idem-12345',
  } as const;

  it('places an order via the resolver + adapter', async () => {
    const payload = await encryptedPayload(h, 1n, { client_id: 'CID-1', access_token: 'T' });
    const view = await h.service.connect(1n, 'dhan', payload);
    const ack = await h.service.placeOrder(1n, BigInt(view.id), { ...marketOrder });
    expect(ack).toEqual({ brokerOrderId: 'o', status: 'OPEN' });
  });

  it('forwards the resolved securityId and paise price to the adapter', async () => {
    _clearRegistry();
    let captured: PlaceOrderInput | undefined;
    const capturing: BrokerAdapter = {
      ...stubDhan,
      placeOrder: (_s, i) => {
        captured = i;
        return Promise.resolve({ brokerOrderId: 'X', status: 'OPEN' });
      },
    };
    registerAdapter(capturing);
    const payload = await encryptedPayload(h, 1n, { client_id: 'CID-1', access_token: 'T' });
    const view = await h.service.connect(1n, 'dhan', payload);
    await h.service.placeOrder(1n, BigInt(view.id), {
      ...marketOrder,
      orderType: 'LIMIT',
      quantity: 5,
      pricePaise: 290050n,
    });
    expect(captured?.securityId).toBe('2885');
    expect(captured?.pricePaise).toBe(290050n);
    expect(captured?.quantity).toBe(5);
  });

  it('rejects an order when the instrument cannot be resolved', async () => {
    const payload = await encryptedPayload(h, 1n, { client_id: 'CID-1', access_token: 'T' });
    const view = await h.service.connect(1n, 'dhan', payload);
    const instruments = {
      resolveSecurityId: () => Promise.resolve(null),
    } as unknown as InstrumentResolverService;
    const svc = new BrokerConnectionService(h.accountKeys, h.connsRepo, h.vault, instruments);
    await expect(
      svc.placeOrder(1n, BigInt(view.id), { ...marketOrder, tradingSymbol: 'NOPE' }),
    ).rejects.toMatchObject({ code: 'instrument_not_found' });
  });

  it("rejects another account's order", async () => {
    const payload = await encryptedPayload(h, 1n, { client_id: 'CID-1', access_token: 'T' });
    const view = await h.service.connect(1n, 'dhan', payload);
    await expect(
      h.service.placeOrder(2n, BigInt(view.id), { ...marketOrder }),
    ).rejects.toMatchObject({ code: 'connection_not_found' });
  });
});
