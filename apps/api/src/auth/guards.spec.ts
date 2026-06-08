import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { JwtService } from './jwt.service';
import { TOTP_ENROL_SCOPE } from './auth.service';
import { EnrolmentGuard, JwtAuthGuard } from './guards';
import type { AuthedRequest } from './request-context';

const jwt = new JwtService('test-secret-at-least-16-chars');

function ctxFor(req: Partial<AuthedRequest>): { ctx: ExecutionContext; req: AuthedRequest } {
  const full = { headers: {}, ...req } as AuthedRequest;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => full }),
  } as unknown as ExecutionContext;
  return { ctx, req: full };
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(jwt);

  it('accepts a valid access token and attaches the principal', () => {
    const token = jwt.sign({ sub: '7', sid: 'sess-1' });
    const { ctx, req } = ctxFor({ headers: { authorization: `Bearer ${token}` } });
    expect(guard.canActivate(ctx)).toBe(true);
    expect(req.auth).toEqual({ accountId: 7n, sessionId: 'sess-1' });
  });

  it('rejects a missing token', () => {
    const { ctx } = ctxFor({ headers: {} });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects an invalid token', () => {
    const { ctx } = ctxFor({ headers: { authorization: 'Bearer not.a.jwt' } });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects a grant token (wrong type)', () => {
    const grant = jwt.signGrant('7', TOTP_ENROL_SCOPE);
    const { ctx } = ctxFor({ headers: { authorization: `Bearer ${grant}` } });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});

describe('EnrolmentGuard', () => {
  const guard = new EnrolmentGuard(jwt);

  it('accepts a valid enrolment grant', () => {
    const grant = jwt.signGrant('9', TOTP_ENROL_SCOPE);
    const { ctx, req } = ctxFor({ headers: { authorization: `Bearer ${grant}` } });
    expect(guard.canActivate(ctx)).toBe(true);
    expect(req.auth).toEqual({ accountId: 9n, scope: TOTP_ENROL_SCOPE });
  });

  it('rejects an access token', () => {
    const access = jwt.sign({ sub: '9', sid: 's' });
    const { ctx } = ctxFor({ headers: { authorization: `Bearer ${access}` } });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
