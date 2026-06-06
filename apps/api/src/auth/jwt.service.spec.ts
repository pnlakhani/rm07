import { describe, expect, it } from 'vitest';
import { ACCESS_TTL_SECONDS, InvalidTokenError, JwtService } from './jwt.service';

const svc = new JwtService('test-secret-at-least-16-chars');

describe('JwtService', () => {
  it('signs and verifies a token', () => {
    const now = 1_700_000_000;
    const token = svc.sign({ sub: '42', sid: 'sess-1' }, now);
    const claims = svc.verify(token, now + 60);
    expect(claims.sub).toBe('42');
    expect(claims.sid).toBe('sess-1');
    expect(claims.iss).toBe('rm07');
    expect(claims.exp - claims.iat).toBe(ACCESS_TTL_SECONDS);
  });

  it('rejects an expired token', () => {
    const now = 1_700_000_000;
    const token = svc.sign({ sub: '42', sid: 's' }, now);
    expect(() => svc.verify(token, now + ACCESS_TTL_SECONDS + 1)).toThrow(InvalidTokenError);
  });

  it('rejects a tampered payload', () => {
    const now = 1_700_000_000;
    const token = svc.sign({ sub: '42', sid: 's' }, now);
    const [h, , sig] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: '999', sid: 's', iat: now, exp: now + 999, iss: 'rm07' }))
      .toString('base64url');
    expect(() => svc.verify(`${h}.${forgedPayload}.${sig}`, now)).toThrow(/signature/i);
  });

  it('rejects a token signed with a different secret', () => {
    const other = new JwtService('another-secret-16-characters');
    const now = 1_700_000_000;
    const token = other.sign({ sub: '1', sid: 's' }, now);
    expect(() => svc.verify(token, now)).toThrow(InvalidTokenError);
  });

  it('rejects malformed tokens', () => {
    expect(() => svc.verify('not.a.jwt')).toThrow(InvalidTokenError);
    expect(() => svc.verify('only-one-part')).toThrow(InvalidTokenError);
  });

  it('requires a sufficiently long secret', () => {
    expect(() => new JwtService('short')).toThrow();
  });
});
