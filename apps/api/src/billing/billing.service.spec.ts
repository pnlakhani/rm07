import { createHmac } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service';
import type { RazorpayApi, RazorpayConfig } from './razorpay-client';
import type { SubscriptionsRepository, WebhookEventsRepository } from './ports';

const config: RazorpayConfig = {
  keyId: 'k',
  keySecret: 's',
  webhookSecret: 'whsec',
  planMap: { pro: 'plan_pro_x' },
};

function make(overrides?: { recordIfNew?: boolean }): {
  service: BillingService;
  razorpay: { createSubscription: ReturnType<typeof vi.fn> };
  subscriptions: {
    insert: ReturnType<typeof vi.fn>;
    findActiveByAccount: ReturnType<typeof vi.fn>;
    updateByRazorpayId: ReturnType<typeof vi.fn>;
  };
  events: { recordIfNew: ReturnType<typeof vi.fn>; markProcessed: ReturnType<typeof vi.fn> };
} {
  const razorpay = {
    createSubscription: vi
      .fn()
      .mockResolvedValue({ id: 'sub_1', status: 'created', shortUrl: 'https://rzp/sub_1' }),
  };
  const subscriptions = {
    insert: vi.fn().mockResolvedValue(7n),
    findActiveByAccount: vi.fn().mockResolvedValue(null),
    updateByRazorpayId: vi.fn().mockResolvedValue(undefined),
  };
  const events = {
    recordIfNew: vi.fn().mockResolvedValue(overrides?.recordIfNew ?? true),
    markProcessed: vi.fn().mockResolvedValue(undefined),
  };
  const service = new BillingService(
    razorpay as unknown as RazorpayApi,
    config,
    subscriptions as unknown as SubscriptionsRepository,
    events as unknown as WebhookEventsRepository,
  );
  return { service, razorpay, subscriptions, events };
}

function webhookBody(): string {
  return JSON.stringify({
    event: 'subscription.activated',
    payload: {
      subscription: {
        entity: { id: 'sub_1', status: 'active', current_start: 1700000000, current_end: 1702592000 },
      },
    },
  });
}
const sign = (body: string, secret = 'whsec'): string =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex');

describe('BillingService', () => {
  it('creates a subscription via Razorpay and persists it', async () => {
    const { service, razorpay, subscriptions } = make();
    const view = await service.createSubscription(1n, 'pro');
    expect(razorpay.createSubscription).toHaveBeenCalledWith({ planId: 'plan_pro_x', totalCount: 12 });
    expect(subscriptions.insert).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 1n, planId: 'pro', razorpaySubscriptionId: 'sub_1' }),
    );
    expect(view).toMatchObject({
      subscriptionId: '7',
      razorpaySubscriptionId: 'sub_1',
      status: 'created',
      shortUrl: 'https://rzp/sub_1',
    });
  });

  it('rejects an unknown plan before calling Razorpay', async () => {
    const { service, razorpay } = make();
    await expect(service.createSubscription(1n, 'nope')).rejects.toBeInstanceOf(BadRequestException);
    expect(razorpay.createSubscription).not.toHaveBeenCalled();
  });

  it('rejects a webhook with a bad signature', async () => {
    const { service, events } = make();
    const body = webhookBody();
    await expect(service.handleWebhook(body, 'badsig', 'evt_1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(events.recordIfNew).not.toHaveBeenCalled();
  });

  it('processes a verified webhook and applies broker status to the row', async () => {
    const { service, subscriptions, events } = make();
    const body = webhookBody();
    const res = await service.handleWebhook(body, sign(body), 'evt_1');
    expect(res).toEqual({ received: true });
    expect(events.recordIfNew).toHaveBeenCalledWith(
      'razorpay',
      'evt_1',
      'subscription.activated',
      expect.any(Object),
    );
    expect(subscriptions.updateByRazorpayId).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({ status: 'active' }),
    );
    expect(events.markProcessed).toHaveBeenCalledWith('razorpay', 'evt_1');
  });

  it('is idempotent — a duplicate event id is not re-applied', async () => {
    const { service, subscriptions, events } = make({ recordIfNew: false });
    const body = webhookBody();
    const res = await service.handleWebhook(body, sign(body), 'evt_1');
    expect(res).toEqual({ received: true });
    expect(subscriptions.updateByRazorpayId).not.toHaveBeenCalled();
    expect(events.markProcessed).not.toHaveBeenCalled();
  });

  it('reports the active plan, defaulting to free', async () => {
    const { service, subscriptions } = make();
    expect(await service.getActivePlan(1n)).toBe('free');
    subscriptions.findActiveByAccount.mockResolvedValueOnce({
      id: 1n,
      accountId: 1n,
      planId: 'pro',
      razorpaySubscriptionId: 'sub_1',
      status: 'active',
    });
    expect(await service.getActivePlan(1n)).toBe('pro');
  });
});
