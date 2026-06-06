import { describe, expect, it } from 'vitest';
import { PasswordService } from '../security/password.service';
import { REFRESH_TTL_SECONDS, RefreshTokenService } from './refresh-token.service';

const svc = new RefreshTokenService(new PasswordService());

describe('RefreshTokenService', () => {
  it('issues a high-entropy token with a storable hash and 30-day expiry', async () => {
    const now = new Date('2026-06-06T00:00:00Z');
    const issued = await svc.issue(now);
    expect(issued.token.length).toBeGreaterThanOrEqual(40);
    expect(issued.hash.startsWith('$argon2id$')).toBe(true);
    expect(issued.expiresAt.getTime()).toBe(now.getTime() + REFRESH_TTL_SECONDS * 1000);
  });

  it('issues unique tokens', async () => {
    const a = await svc.issue();
    const b = await svc.issue();
    expect(a.token).not.toBe(b.token);
  });

  it('verifies a presented token against its hash', async () => {
    const issued = await svc.issue();
    expect(await svc.verify(issued.hash, issued.token)).toBe(true);
    expect(await svc.verify(issued.hash, 'a-different-token')).toBe(false);
  });

  it('detects expiry', () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 1000);
    expect(svc.isExpired(past)).toBe(true);
    expect(svc.isExpired(future)).toBe(false);
  });
});
