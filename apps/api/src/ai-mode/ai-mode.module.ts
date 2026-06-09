import { Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { DatabaseModule } from '../db/database.module';
import { AiModeController } from './ai-mode.controller';
import { AiVerdictService } from './ai-verdict.service';
import { AnthropicVerdictClient, MockVerdictModelClient } from './anthropic-client';
import { DrizzleRecommendationsRegisterRepository } from './drizzle-register.repository';
import {
  AI_MODE_CONFIG,
  MARKET_SIGNALS_PROVIDER,
  RECOMMENDATIONS_REGISTER_REPOSITORY,
  VERDICT_MODEL_CLIENT,
  type AiModeConfig,
  type VerdictModelClient,
} from './ports';
import { StubMarketSignalsProvider } from './stub-signals.provider';

/** Prompt-template version stamped on every register entry; bump when the template changes. */
const PROMPT_VERSION = 'v1';

const aiModeConfigProvider = {
  provide: AI_MODE_CONFIG,
  useFactory: (): AiModeConfig => {
    const env = loadEnv();
    return {
      raRegistrationNumber: env.AI_RA_REGISTRATION_NUMBER,
      signedBy: env.AI_SIGNED_BY,
      promptVersion: PROMPT_VERSION,
    };
  },
};

const verdictModelClientProvider = {
  provide: VERDICT_MODEL_CLIENT,
  useFactory: (): VerdictModelClient => {
    const env = loadEnv();
    if (env.ANTHROPIC_API_KEY) {
      return new AnthropicVerdictClient(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
    }
    return new MockVerdictModelClient();
  },
};

/**
 * AI Mode module. Reuses AuthModule's JwtAuthGuard and BillingModule's RequiresPlanGuard (the
 * endpoint is Basic+). The Claude client is real when ANTHROPIC_API_KEY is set, else a mock.
 */
@Module({
  imports: [DatabaseModule, AuthModule, BillingModule],
  controllers: [AiModeController],
  providers: [
    aiModeConfigProvider,
    verdictModelClientProvider,
    { provide: MARKET_SIGNALS_PROVIDER, useClass: StubMarketSignalsProvider },
    {
      provide: RECOMMENDATIONS_REGISTER_REPOSITORY,
      useClass: DrizzleRecommendationsRegisterRepository,
    },
    AiVerdictService,
  ],
})
export class AiModeModule {}
