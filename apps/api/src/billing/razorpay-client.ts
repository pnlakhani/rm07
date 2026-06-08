import { Inject, Injectable } from '@nestjs/common';

/** Razorpay configuration (from Doppler). Empty strings in dev disable live calls. */
export interface RazorpayConfig {
  readonly keyId: string;
  readonly keySecret: string;
  readonly webhookSecret: string;
  /** our plan id -> Razorpay plan id */
  readonly planMap: Readonly<Record<string, string>>;
}

export const RAZORPAY_CONFIG = Symbol('RAZORPAY_CONFIG');
export const RAZORPAY_API = Symbol('RAZORPAY_API');

export interface CreateSubscriptionInput {
  readonly planId: string;
  readonly totalCount: number;
}

export interface CreatedSubscription {
  readonly id: string;
  readonly status: string;
  readonly shortUrl: string | null;
}

/** The slice of the Razorpay API the billing service needs (so it can be faked in tests). */
export interface RazorpayApi {
  createSubscription(input: CreateSubscriptionInput): Promise<CreatedSubscription>;
}

interface RazorpaySubscriptionResponse {
  id?: string;
  status?: string;
  short_url?: string;
}
interface RazorpayErrorResponse {
  error?: { description?: string };
}

const RAZORPAY_BASE = 'https://api.razorpay.com/v1';

/** HTTP Razorpay client. Subscriptions are created server-side, then the user is sent to checkout. */
@Injectable()
export class HttpRazorpayClient implements RazorpayApi {
  constructor(@Inject(RAZORPAY_CONFIG) private readonly config: RazorpayConfig) {}

  async createSubscription(input: CreateSubscriptionInput): Promise<CreatedSubscription> {
    const auth = Buffer.from(`${this.config.keyId}:${this.config.keySecret}`, 'utf8').toString(
      'base64',
    );
    const res = await fetch(`${RAZORPAY_BASE}/subscriptions`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        plan_id: input.planId,
        total_count: input.totalCount,
        customer_notify: 1,
      }),
    });
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = json as RazorpayErrorResponse;
      throw new Error(err.error?.description ?? `Razorpay subscription create failed (${res.status})`);
    }
    const body = json as RazorpaySubscriptionResponse;
    return { id: body.id ?? '', status: body.status ?? 'created', shortUrl: body.short_url ?? null };
  }
}
