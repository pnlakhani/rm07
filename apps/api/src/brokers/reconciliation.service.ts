import { Inject, Injectable, Logger } from '@nestjs/common';
import { getAdapter, type BrokerOrder } from '@rm07/broker-adapters';
import type { Broker } from '@rm07/core';
import { BrokerConnectionService } from './broker-connection.service';
import { ORDERS_REPOSITORY, type OrdersRepository, type ReconcilableOrder } from './ports';

export type MismatchKind = 'missing_at_broker' | 'broker_unreachable';

export interface ReconciliationMismatch {
  readonly orderId: string;
  readonly brokerOrderId: string;
  readonly kind: MismatchKind;
  readonly detail: string;
}

export interface ReconciliationReport {
  readonly checked: number;
  readonly updated: number;
  readonly mismatches: readonly ReconciliationMismatch[];
}

/**
 * Order reconciliation watchdog (Full Doc §III.6, S-15). Compares our non-terminal `core.orders`
 * against each broker's source-of-truth order book, applies broker status/fills back onto our row,
 * and surfaces mismatches — orders we believe are live but the broker has no record of, or
 * connections we could not reach. Runs ~every 60s via the reconcile-orders CLI; the broker book is
 * fetched once per connection to respect rate limits.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    private readonly connections: BrokerConnectionService,
  ) {}

  async reconcile(): Promise<ReconciliationReport> {
    const open = await this.orders.listReconcilable();

    // Group by connection so each broker order book is fetched at most once.
    const byConnection = new Map<string, ReconcilableOrder[]>();
    for (const order of open) {
      const key = `${order.accountId.toString()}:${order.connectionId.toString()}`;
      const group = byConnection.get(key);
      if (group) {
        group.push(order);
      } else {
        byConnection.set(key, [order]);
      }
    }

    let checked = 0;
    let updated = 0;
    const mismatches: ReconciliationMismatch[] = [];

    for (const group of byConnection.values()) {
      const sample = group[0];
      if (!sample) {
        continue;
      }

      let book: readonly BrokerOrder[];
      try {
        book = await this.fetchOrderBook(sample);
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'broker unreachable';
        for (const order of group) {
          mismatches.push({
            orderId: order.id.toString(),
            brokerOrderId: order.brokerOrderId,
            kind: 'broker_unreachable',
            detail,
          });
        }
        continue;
      }

      const bookById = new Map(book.map((entry) => [entry.brokerOrderId, entry]));
      for (const order of group) {
        checked += 1;
        const match = bookById.get(order.brokerOrderId);
        if (!match) {
          mismatches.push({
            orderId: order.id.toString(),
            brokerOrderId: order.brokerOrderId,
            kind: 'missing_at_broker',
            detail: 'order is live in our ledger but absent from the broker order book',
          });
          continue;
        }
        if (match.status !== order.status || match.filledQuantity !== order.filledQuantity) {
          await this.orders.updateFromBroker(order.id, {
            status: match.status,
            filledQuantity: match.filledQuantity,
            avgFillPricePaise: match.avgFillPricePaise,
          });
          updated += 1;
        }
      }
    }

    if (mismatches.length > 0) {
      this.logger.warn(
        `Reconciliation: ${mismatches.length} mismatch(es) across ${byConnection.size.toString()} connection(s)`,
      );
    }
    return { checked, updated, mismatches };
  }

  private async fetchOrderBook(order: ReconcilableOrder): Promise<readonly BrokerOrder[]> {
    const credentials = await this.connections.openCredentials(order.accountId, order.connectionId);
    const adapter = getAdapter(order.broker as Broker);
    const session = {
      clientId: credentials['client_id'] ?? '',
      accessToken: credentials['access_token'] ?? '',
      tokenExpiresAt: null,
    };
    return adapter.getOrders(session);
  }
}
