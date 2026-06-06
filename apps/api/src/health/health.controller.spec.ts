import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok with service identity', () => {
    const body = new HealthController().health();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('api');
    expect(() => new Date(body.time).toISOString()).not.toThrow();
  });
});
