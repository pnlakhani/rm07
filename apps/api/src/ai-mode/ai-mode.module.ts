import { Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { DatabaseModule } from '../db/database.module';
import { InstrumentsModule } from '../instruments/instruments.module';
import { InstrumentResolverService } from '../instruments/instrument-resolver.service';
import { AiModeController } from './ai-mode.controller';
import { AiVerdictService } from './ai-verdict.service';
import { AnthropicVerdictClient, MockVerdictModelClient } from './anthropic-client';
import { DhanHistoricalSignalsProvider } from './dhan-historical-signals.provider';
import { DrizzleRecommendationsRegisterRepository } from './drizzle-register.repository';
import {
  AI_MODE_CONFIG,
  MARKET_SIGNALS_PROVIDER,
  RECOMMENDATIONS_REGISTER_REPOSITORY,
  VERDICT_MODEL_CLIENT,
  type AiModeConfig,
  type MarketSignalsProvider,
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

const signalsProviderProvider = {
  provide: MARKET_SIGNALS_PROVIDER,
  useFactory: (resolver: InstrumentResolverService): MarketSignalsProvider => {
    const env = loadEnv();
    if (env.DHAN_DATA_ACCESS_TOKEN && env.DHAN_DATA_CLIENT_ID) {
      return new DhanHistoricalSignalsProvider(resolver, {
        clientId: env.DHAN_DATA_CLIENT_ID,
        accessToken: env.DHAN_DATA_ACCESS_TOKEN,
      });
    }
    return new StubMarketSignalsProvider();
  },
  inject: [InstrumentResolverService],
};

/**
 * AI Mode module. Reuses AuthModule's JwtAuthGuard and BillingModule's RequiresPlanGuard (the
 * endpoint is Basic+). The Claude client is real when ANTHROPIC_API_KEY is set, else a mock.
 */
@Module({
  imports: [DatabaseModule, AuthModule, BillingModule, InstrumentsModule],
  controllers: [AiModeController],
  providers: [
    aiModeConfigProvider,
    verdictModelClientProvider,
    signalsProviderProvider,
    {
      provide: RECOMMENDATIONS_REGISTER_REPOSITORY,
      useClass: DrizzleRecommendationsRegisterRepository,
    },
    AiVerdictService,
  ],
})
export class AiModeModule {}
