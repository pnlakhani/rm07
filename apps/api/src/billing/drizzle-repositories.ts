import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { schema, type Database } from '@rm07/db';
import { DATABASE } from '../db/database.module';
import type {
  NewSubscription,
  SubscriptionRecord,
  SubscriptionStatusUpdate,
  SubscriptionsRepository,
  WebhookEventsRepository,
} from './ports';

@Injectable()
export class DrizzleSubscriptionsRepository implements SubscriptionsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async insert(subscription: NewSubscription): Promise<bigint> {
    const [row] = await this.database.db
      .insert(schema.subscriptions)
      .values({
        accountId: subscription.accountId,
        planId: subscription.planId,
        razorpaySubscriptionId: subscription.razorpaySubscriptionId,
        status: subscription.status,
      })
      .returning({ id: schema.subscriptions.id });
    return row!.id;
  }

  async findActiveByAccount(accountId: bigint): Promise<SubscriptionRecord | null> {
    const [row] = await this.database.db
      .select({
        id: schema.subscriptions.id,
        accountId: schema.subscriptions.accountId,
        planId: schema.subscriptions.planId,
        razorpaySubscriptionId: schema.subscriptions.razorpaySubscriptionId,
        status: schema.subscriptions.status,
      })
      .from(schema.subscriptions)
      .where(
        and(eq(schema.subscriptions.accountId, accountId), eq(schema.subscriptions.status, 'active')),
      )
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);
    return row
      ? {
          id: row.id,
          accountId: row.accountId,
          planId: row.planId,
          razorpaySubscriptionId: row.razorpaySubscriptionId ?? null,
          status: row.status,
        }
      : null;
  }

  async updateByRazorpayId(
    razorpaySubscriptionId: string,
    update: SubscriptionStatusUpdate,
  ): Promise<void> {
    await this.database.db
      .update(schema.subscriptions)
      .set({
        status: update.status,
        currentPeriodStart: update.currentPeriodStart,
        currentPeriodEnd: update.currentPeriodEnd,
      })
      .where(eq(schema.subscriptions.razorpaySubscriptionId, razorpaySubscriptionId));
  }
}

@Injectable()
export class DrizzleWebhookEventsRepository implements WebhookEventsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async recordIfNew(
    provider: string,
    eventId: string,
    eventType: string,
    payload: unknown,
  ): Promise<boolean> {
    const [row] = await this.database.db
      .insert(schema.webhookEvents)
      .values({ provider, eventId, eventType, payload })
      .onConflictDoNothing({ target: [schema.webhookEvents.provider, schema.webhookEvents.eventId] })
      .returning({ id: schema.webhookEvents.id });
    return row !== undefined;
  }

  async markProcessed(provider: string, eventId: string): Promise<void> {
    await this.database.db
      .update(schema.webhookEvents)
      .set({ processedAt: sql`now()` })
      .where(
        and(eq(schema.webhookEvents.provider, provider), eq(schema.webhookEvents.eventId, eventId)),
      );
  }
}
