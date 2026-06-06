import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  status: 'ok';
  service: 'api';
  version: string;
  time: string;
}

@Controller()
export class HealthController {
  @Get('healthz')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      version: process.env['npm_package_version'] ?? '0.1.0',
      time: new Date().toISOString(),
    };
  }
}
