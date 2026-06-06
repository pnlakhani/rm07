import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { ProblemDetailsFilter } from './common/problem-details.filter';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Transport / header hardening (TRD §9).
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({ origin: env.API_CORS_ORIGINS, credentials: true });

  // Reject unknown fields at the boundary (TRD §6.2).
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());

  await app.listen(env.API_PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`RM07 API listening on :${env.API_PORT} (${env.NODE_ENV})`);
}

void bootstrap();
