import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentAccount } from '../auth/current-account.decorator';
import { JwtAuthGuard } from '../auth/guards';
import type { AuthContext } from '../auth/request-context';
import { BillingService, type SubscriptionView } from './billing.service';
import { subscribeSchema, type SubscribeDto } from './dto';

@Controller('v1/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Start a subscription; returns the Razorpay short URL the browser sends the user to. */
  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async subscribe(
    @Body(new ZodValidationPipe(subscribeSchema)) body: SubscribeDto,
    @CurrentAccount() account: AuthContext,
  ): Promise<SubscriptionView> {
    return this.billing.createSubscription(account.accountId, body.planId);
  }

  /** The account's current entitlement plan (the active subscription's plan, else 'free'). */
  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async current(@CurrentAccount() account: AuthContext): Promise<{ plan: string }> {
    return { plan: await this.billing.getActivePlan(account.accountId) };
  }

  /**
   * Razorpay webhook sink (public — authenticated by HMAC signature, not a session). Requires the
   * RAW request body, so the app is bootstrapped with `rawBody: true`.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
  ): Promise<{ received: boolean }> {
    const raw = req.rawBody?.toString('utf8') ?? '';
    return this.billing.handleWebhook(raw, signature ?? '', eventId ?? '');
  }
}
