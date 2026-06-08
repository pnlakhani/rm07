import { Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../db/database.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { RequiresPlanGuard } from './requires-plan.guard';
import {
  DrizzleSubscriptionsRepository,
  DrizzleWebhookEventsRepository,
} from './drizzle-repositories';
import { SUBSCRIPTIONS_REPOSITORY, WEBHOOK_EVENTS_REPOSITORY } from './ports';
import {
  HttpRazorpayClient,
  RAZORPAY_API,
  RAZORPAY_CONFIG,
  type RazorpayConfig,
} from './razorpay-client';

const razorpayConfigProvider = {
  provide: RAZORPAY_CONFIG,
  useFactory: (): RazorpayConfig => {
    const env = loadEnv();
    let planMap: Record<string, string> = {};
    if (env.RAZORPAY_PLAN_MAP) {
      try {
        planMap = JSON.parse(env.RAZORPAY_PLAN_MAP) as Record<string, string>;
      } catch {
        planMap = {};
      }
    }
    return {
      keyId: env.RAZORPAY_KEY_ID ?? '',
      keySecret: env.RAZORPAY_KEY_SECRET ?? '',
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? '',
      planMap,
    };
  },
};

/**
 * Billing module: Razorpay subscription creation + webhook processing on top of the subscriptions
 * and webhook-event ledgers. JwtAuthGuard comes from AuthModule (subscribe/current are guarded;
 * the webhook is public + signature-verified).
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [BillingController],
  providers: [
    razorpayConfigProvider,
    { provide: RAZORPAY_API, useClass: HttpRazorpayClient },
    { provide: SUBSCRIPTIONS_REPOSITORY, useClass: DrizzleSubscriptionsRepository },
    { provide: WEBHOOK_EVENTS_REPOSITORY, useClass: DrizzleWebhookEventsRepository },
    BillingService,
    RequiresPlanGuard,
  ],
  exports: [BillingService, RequiresPlanGuard],
})
export class BillingModule {}
