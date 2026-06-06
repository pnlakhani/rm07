import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv({} as NodeJS.ProcessEnv);
    expect(env.API_PORT).toBe(8080);
    expect(env.API_CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('parses a comma-separated CORS list', () => {
    const env = loadEnv({ API_CORS_ORIGINS: 'https://a.com, https://b.com' } as NodeJS.ProcessEnv);
    expect(env.API_CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });

  it('rejects an out-of-range port', () => {
    expect(() => loadEnv({ API_PORT: '70000' } as NodeJS.ProcessEnv)).toThrow(/Invalid environment/);
  });
});
