import { describe, expect, it } from 'vitest';
import {
  parseCookies,
  parseRefreshValue,
  refreshCookieOptions,
  serializeRefreshValue,
} from './cookies';

describe('refresh cookie value', () => {
  it('round-trips session id + token', () => {
    const value = serializeRefreshValue('sess-123', 'abc.def_token-base64url');
    const parsed = parseRefreshValue(value);
    expect(parsed).toEqual({ sessionId: 'sess-123', token: 'abc.def_token-base64url' });
  });

  it('rejects malformed values', () => {
    expect(parseRefreshValue('no-dot')).toBeNull();
    expect(parseRefreshValue('.leading')).toBeNull();
    expect(parseRefreshValue('trailing.')).toBeNull();
  });
});

describe('refreshCookieOptions', () => {
  it('is httpOnly + strict and secure only in production', () => {
    expect(refreshCookieOptions(1000, true)).toMatchObject({ httpOnly: true, sameSite: 'strict', secure: true });
    expect(refreshCookieOptions(1000, false).secure).toBe(false);
  });
});

describe('parseCookies', () => {
  it('parses a cookie header', () => {
    expect(parseCookies('a=1; rm07_rt=sess.tok; b=2')).toEqual({ a: '1', rm07_rt: 'sess.tok', b: '2' });
  });
  it('handles empty / undefined', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });
});
