/** A persisted subscription row (subset). */
export interface SubscriptionRecord {
  readonly id: bigint;
  readonly accountId: bigint;
  readonly planId: string;
  readonly razorpaySubscriptionId: string | null;
  readonly status: string;
}

export interface NewSubscription {
  readonly accountId: bigint;
  readonly planId: string;
  readonly razorpaySubscriptionId: string;
  readonly status: string;
}

/** Lifecycle fields applied from a verified Razorpay webhook. */
export interface SubscriptionStatusUpdate {
  readonly status: string;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
}

export interface SubscriptionsRepository {
  insert(subscription: NewSubscription): Promise<bigint>;
  /** The account's currently-active subscription, if any (status = 'active'). */
  findActiveByAccount(accountId: bigint): Promise<SubscriptionRecord | null>;
  updateByRazorpayId(
    razorpaySubscriptionId: string,
    update: SubscriptionStatusUpdate,
  ): Promise<void>;
}

export interface WebhookEventsRepository {
  /**
   * Record an inbound event. Returns `true` if it is new, `false` if (provider, eventId) has
   * already been seen — the idempotency guard (S-14).
   */
  recordIfNew(
    provider: string,
    eventId: string,
    eventType: string,
    payload: unknown,
  ): Promise<boolean>;
  markProcessed(provider: string, eventId: string): Promise<void>;
}

export const SUBSCRIPTIONS_REPOSITORY = Symbol('SUBSCRIPTIONS_REPOSITORY');
export const WEBHOOK_EVENTS_REPOSITORY = Symbol('WEBHOOK_EVENTS_REPOSITORY');
