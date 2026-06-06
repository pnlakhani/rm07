import { describe, expect, it } from 'vitest';
import { loadMdConfig } from '../config.js';

describe('loadMdConfig', () => {
  it('defaults the port', () => {
    expect(loadMdConfig({} as NodeJS.ProcessEnv).port).toBe(8100);
  });
  it('rejects an invalid port', () => {
    expect(() => loadMdConfig({ MD_SVC_PORT: 'abc' } as NodeJS.ProcessEnv)).toThrow();
  });
});
