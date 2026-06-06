import { describe, expect, it } from 'vitest';
import { userContextSql } from '../rls.js';

describe('RLS request context', () => {
  it('builds a transaction-local set_config statement', () => {
    expect(userContextSql(42n)).toBe(
      "select set_config('app.account_id', '42', true)",
    );
  });
});
