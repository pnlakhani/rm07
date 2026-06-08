import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { ProblemDetailsFilter } from './common/problem-details.filter';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  // `rawBody: true` captures the unparsed request body so the Razorpay webhook can verify its
  // HMAC signature against the exact bytes Razorpay signed (S-14).
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });

  // Transport / header hardening (TRD §9).
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({ origin: env.API_CORS_ORIGINS, credentials: true });

  // Request validation is done per-route with ZodValidationPipe over `.strict()` schemas, which
  // reject unknown fields at the boundary (TRD §6.2) — so no global class-validator ValidationPipe.
  app.useGlobalFilters(new ProblemDetailsFilter());

  await app.listen(env.API_PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`RM07 API listening on :${env.API_PORT} (${env.NODE_ENV})`);
}

void bootstrap();
