import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BrokersModule } from './brokers/brokers.module';
import { HealthModule } from './health/health.module';
import { SecurityModule } from './security/security.module';

@Module({ imports: [HealthModule, SecurityModule, AuthModule, BrokersModule] })
export class AppModule {}
