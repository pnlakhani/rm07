import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { SecurityModule } from './security/security.module';

@Module({ imports: [HealthModule, SecurityModule, AuthModule] })
export class AppModule {}
