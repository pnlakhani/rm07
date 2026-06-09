import { Module } from '@nestjs/common';
import { AiModeModule } from './ai-mode/ai-mode.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { BrokersModule } from './brokers/brokers.module';
import { HealthModule } from './health/health.module';
import { SecurityModule } from './security/security.module';
import { WatchlistsModule } from './watchlists/watchlists.module';

@Module({
  imports: [
    HealthModule,
    SecurityModule,
    AuthModule,
    BrokersModule,
    BillingModule,
    WatchlistsModule,
    AiModeModule,
  ],
})
export class AppModule {}
