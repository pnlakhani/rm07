import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { schema, type Database } from '@rm07/db';
import type { Broker } from '@rm07/core';
import { DATABASE } from '../db/database.module';
import type {
  AccountKeyRecord,
  AccountKeysRepository,
  BrokerConnectionRecord,
  BrokerConnectionStatus,
  BrokerConnectionsRepository,
  NewOrder,
  OrderRecord,
  OrdersRepository,
  SealedCredentialColumns,
} from './ports';

@Injectable()
export class DrizzleAccountKeysRepository implements AccountKeysRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findByAccount(accountId: bigint): Promise<AccountKeyRecord | null> {
    const [row] = await this.database.db
      .select()
      .from(schema.accountKeys)
      .where(eq(schema.accountKeys.accountId, accountId))
      .limit(1);
    return row
      ? {
          accountId: row.accountId,
          eciesPublicKey: row.eciesPublicKey,
          eciesPrivateKeySealed: row.eciesPrivateKeySealed,
        }
      : null;
  }

  async create(input: AccountKeyRecord): Promise<void> {
    await this.database.db.insert(schema.accountKeys).values({
      accountId: input.accountId,
      eciesPublicKey: input.eciesPublicKey,
      eciesPrivateKeySealed: input.eciesPrivateKeySealed,
    });
  }
}

@Injectable()
export class DrizzleBrokerConnectionsRepository implements BrokerConnectionsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findByAccountAndBroker(
    accountId: bigint,
    broker: Broker,
  ): Promise<BrokerConnectionRecord | null> {
    const [row] = await this.database.db
      .select()
      .from(schema.brokerConnections)
      .where(
        and(eq(schema.brokerConnections.accountId, accountId), eq(schema.brokerConnections.broker, broker)),
      )
      .limit(1);
    return row ? toConnection(row) : null;
  }

  async findById(id: bigint): Promise<BrokerConnectionRecord | null> {
    const [row] = await this.database.db
      .select()
      .from(schema.brokerConnections)
      .where(eq(schema.brokerConnections.id, id))
      .limit(1);
    return row ? toConnection(row) : null;
  }

  async listByAccount(accountId: bigint): Promise<readonly BrokerConnectionRecord[]> {
    const rows = await this.database.db
      .select()
      .from(schema.brokerConnections)
      .where(eq(schema.brokerConnections.accountId, accountId))
      .orderBy(desc(schema.brokerConnections.connectedAt));
    return rows.map(toConnection);
  }

  async upsert(input: {
    accountId: bigint;
    broker: Broker;
    clientId: string | null;
    status: BrokerConnectionStatus;
  }): Promise<bigint> {
    const [row] = await this.database.db
      .insert(schema.brokerConnections)
      .values({
        accountId: input.accountId,
        broker: input.broker,
        clientId: input.clientId,
        status: input.status,
      })
      .onConflictDoUpdate({
        target: [schema.brokerConnections.accountId, schema.brokerConnections.broker],
        set: { clientId: input.clientId, status: input.status, lastVerifiedAt: new Date() },
      })
      .returning({ id: schema.brokerConnections.id });
    return row!.id;
  }

  async setStatus(id: bigint, status: BrokerConnectionStatus): Promise<void> {
    await this.database.db
      .update(schema.brokerConnections)
      .set({ status })
      .where(eq(schema.brokerConnections.id, id));
  }

  async saveCredentials(connectionId: bigint, columns: SealedCredentialColumns): Promise<void> {
    await this.database.db
      .insert(schema.brokerCredentialsEnc)
      .values({
        connectionId,
        apiKeyCiphertext: columns.apiKeyCiphertext,
        apiSecretCiphertext: columns.apiSecretCiphertext,
        accessTokenCiphertext: columns.accessTokenCiphertext,
        totpSeedCiphertext: columns.totpSeedCiphertext,
        pinCiphertext: columns.pinCiphertext,
        dekWrapped: columns.dekWrapped,
      })
      .onConflictDoUpdate({
        target: schema.brokerCredentialsEnc.connectionId,
        set: {
          apiKeyCiphertext: columns.apiKeyCiphertext,
          apiSecretCiphertext: columns.apiSecretCiphertext,
          accessTokenCiphertext: columns.accessTokenCiphertext,
          totpSeedCiphertext: columns.totpSeedCiphertext,
          pinCiphertext: columns.pinCiphertext,
          dekWrapped: columns.dekWrapped,
          rotatedAt: new Date(),
        },
      });
  }

  async loadCredentials(connectionId: bigint): Promise<SealedCredentialColumns | null> {
    const [row] = await this.database.db
      .select()
      .from(schema.brokerCredentialsEnc)
      .where(eq(schema.brokerCredentialsEnc.connectionId, connectionId))
      .limit(1);
    if (!row || !row.dekWrapped) {
      return null;
    }
    return {
      apiKeyCiphertext: row.apiKeyCiphertext ?? null,
      apiSecretCiphertext: row.apiSecretCiphertext ?? null,
      accessTokenCiphertext: row.accessTokenCiphertext ?? null,
      totpSeedCiphertext: row.totpSeedCiphertext ?? null,
      pinCiphertext: row.pinCiphertext ?? null,
      dekWrapped: row.dekWrapped,
    };
  }
}

@Injectable()
export class DrizzleOrdersRepository implements OrdersRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async insertPending(order: NewOrder): Promise<bigint | null> {
    const [row] = await this.database.db
      .insert(schema.orders)
      .values({
        accountId: order.accountId,
        connectionId: order.connectionId,
        broker: order.broker,
        exchange: order.exchange,
        tradingSymbol: order.tradingSymbol,
        securityId: order.securityId,
        side: order.side,
        orderType: order.orderType,
        product: order.product,
        validity: order.validity,
        quantity: order.quantity,
        pricePaise: order.pricePaise,
        triggerPricePaise: order.triggerPricePaise,
        idempotencyKey: order.idempotencyKey,
        status: 'PENDING',
      })
      .onConflictDoNothing({ target: [schema.orders.accountId, schema.orders.idempotencyKey] })
      .returning({ id: schema.orders.id });
    return row?.id ?? null;
  }

  async findByIdempotencyKey(accountId: bigint, idempotencyKey: string): Promise<OrderRecord | null> {
    const [row] = await this.database.db
      .select({
        id: schema.orders.id,
        brokerOrderId: schema.orders.brokerOrderId,
        status: schema.orders.status,
      })
      .from(schema.orders)
      .where(
        and(eq(schema.orders.accountId, accountId), eq(schema.orders.idempotencyKey, idempotencyKey)),
      )
      .limit(1);
    return row ? { id: row.id, brokerOrderId: row.brokerOrderId ?? null, status: row.status } : null;
  }

  async markPlaced(id: bigint, brokerOrderId: string, status: string): Promise<void> {
    await this.database.db
      .update(schema.orders)
      .set({ brokerOrderId, status, placedAt: new Date() })
      .where(eq(schema.orders.id, id));
  }

  async markRejected(id: bigint, message: string): Promise<void> {
    await this.database.db
      .update(schema.orders)
      .set({ status: 'REJECTED', statusMessage: message })
      .where(eq(schema.orders.id, id));
  }
}

interface ConnectionRow {
  id: bigint;
  accountId: bigint;
  broker: string;
  clientId: string | null;
  status: string;
}
function toConnection(row: ConnectionRow): BrokerConnectionRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    broker: row.broker as Broker,
    clientId: row.clientId,
    status: row.status as BrokerConnectionStatus,
  };
}
