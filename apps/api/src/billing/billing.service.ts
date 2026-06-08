import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyRazorpaySignature } from './razorpay-signature';
import {
  RAZORPAY_API,
  RAZORPAY_CONFIG,
  type CreatedSubscription,
  type RazorpayApi,
  type RazorpayConfig,
} from './razorpay-client';
import {
  SUBSCRIPTIONS_REPOSITORY,
  WEBHOOK_EVENTS_REPOSITORY,
  type SubscriptionsRepository,
  type WebhookEventsRepository,
} from './ports';

/** Razorpay subscription lifecycle statuses we accept onto a row (mirrors the 0006 CHECK). */
const SUBSCRIPTION_STATUSES = new Set([
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'paused',
  'cancelled',
  'completed',
  'expired',
]);

/** Recurring billing cycles to authorise up front (12 monthly charges). */
const DEFAULT_TOTAL_COUNT = 12;

export interface SubscriptionView {
  readonly subscriptionId: string;
  readonly razorpaySubscriptionId: string;
  readonly status: string;
  readonly shortUrl: string | null;
}

interface RazorpaySubscriptionEntity {
  id?: string;
  status?: string;
  current_start?: number;
  current_end?: number;
}
interface RazorpayWebhookEvent {
  event?: string;
  payload?: { subscription?: { entity?: RazorpaySubscriptionEntity } };
}

/**
 * Subscription billing (Full Doc §IV.3, J-05). Creates Razorpay subscriptions and processes their
 * webhooks: signature-verified (S-14), deduplicated by event id, then the broker-of-record status
 * is applied to our `core.subscriptions` row. Entitlement = the plan of the active subscription.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(RAZORPAY_API) private readonly razorpay: RazorpayApi,
    @Inject(RAZORPAY_CONFIG) private readonly config: RazorpayConfig,
    @Inject(SUBSCRIPTIONS_REPOSITORY) private readonly subscriptions: SubscriptionsRepository,
    @Inject(WEBHOOK_EVENTS_REPOSITORY) private readonly events: WebhookEventsRepository,
  ) {}

  async createSubscription(accountId: bigint, planId: string): Promise<SubscriptionView> {
    const razorpayPlanId = this.config.planMap[planId];
    if (!razorpayPlanId) {
      throw new BadRequestException({ title: 'Unknown plan', code: 'billing.unknown_plan' });
    }

    let created: CreatedSubscription;
    try {
      created = await this.razorpay.createSubscription({
        planId: razorpayPlanId,
        totalCount: DEFAULT_TOTAL_COUNT,
      });
    } catch (err) {
      throw new BadGatewayException({
        title: 'Could not create the subscription with Razorpay',
        code: 'billing.razorpay_error',
        detail: err instanceof Error ? err.message : undefined,
      });
    }

    const id = await this.subscriptions.insert({
      accountId,
      planId,
      razorpaySubscriptionId: created.id,
      status: created.status,
    });
    return {
      subscriptionId: id.toString(),
      razorpaySubscriptionId: created.id,
      status: created.status,
      shortUrl: created.shortUrl,
    };
  }

  async handleWebhook(
    rawBody: string,
    signature: string,
    eventId: string,
  ): Promise<{ received: boolean }> {
    if (!verifyRazorpaySignature(rawBody, signature, this.config.webhookSecret)) {
      throw new UnauthorizedException({ title: 'Invalid signature', code: 'billing.invalid_signature' });
    }
    if (!eventId) {
      throw new BadRequestException({ title: 'Missing event id', code: 'billing.missing_event_id' });
    }
    let event: RazorpayWebhookEvent;
    try {
      event = JSON.parse(rawBody) as RazorpayWebhookEvent;
    } catch {
      throw new BadRequestException({ title: 'Invalid payload', code: 'billing.invalid_payload' });
    }

    const isNew = await this.events.recordIfNew('razorpay', eventId, event.event ?? 'unknown', event);
    if (!isNew) {
      // Already processed — idempotent no-op (S-14).
      return { received: true };
    }
    await this.applyEvent(event);
    await this.events.markProcessed('razorpay', eventId);
    return { received: true };
  }

  async getActivePlan(accountId: bigint): Promise<string> {
    const active = await this.subscriptions.findActiveByAccount(accountId);
    return active?.planId ?? 'free';
  }

  private async applyEvent(event: RazorpayWebhookEvent): Promise<void> {
    const entity = event.payload?.subscription?.entity;
    if (!entity?.id || !entity.status) {
      return;
    }
    if (!SUBSCRIPTION_STATUSES.has(entity.status)) {
      this.logger.warn(`Ignoring unknown Razorpay subscription status "${entity.status}"`);
      return;
    }
    await this.subscriptions.updateByRazorpayId(entity.id, {
      status: entity.status,
      currentPeriodStart: entity.current_start ? new Date(entity.current_start * 1000) : null,
      currentPeriodEnd: entity.current_end ? new Date(entity.current_end * 1000) : null,
    });
  }
}
