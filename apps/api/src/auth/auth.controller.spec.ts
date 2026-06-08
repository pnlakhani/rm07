import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import { REFRESH_COOKIE } from './cookies';
import type { AuthContext } from './request-context';

const session = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  refreshExpiresAt: new Date('2026-07-06T00:00:00Z'),
  sessionId: 'sess-1',
};

function makeController() {
  const auth = {
    signup: vi.fn().mockResolvedValue({ accountId: 1n }),
    verifySignupOtp: vi.fn().mockResolvedValue({ enrolmentToken: 'grant-token' }),
    enrolTotp: vi.fn().mockResolvedValue({ secret: 'SEC', keyUri: 'otpauth://x' }),
    confirmTotp: vi.fn().mockResolvedValue(session),
    signin: vi.fn().mockResolvedValue(session),
    refresh: vi.fn().mockResolvedValue(session),
    logoutAll: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    confirmPasswordReset: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthService;
  return { controller: new AuthController(auth), auth };
}

const account: AuthContext = { accountId: 1n };
const res = () => ({ cookie: vi.fn(), clearCookie: vi.fn() }) as unknown as Response;
const req = (cookie?: string) =>
  ({ headers: cookie ? { cookie } : {}, ip: '1.2.3.4' }) as unknown as Request;

describe('AuthController', () => {
  it('signup triggers OTP and returns a neutral status', async () => {
    const { controller, auth } = makeController();
    const out = await controller.signup({ email: 'a@b.com', password: 'a-strong-passphrase' }, req());
    expect(out).toEqual({ status: 'otp_sent' });
    expect(auth.signup).toHaveBeenCalledOnce();
  });

  it('verify-otp returns the enrolment grant', async () => {
    const { controller } = makeController();
    expect(await controller.verifyOtp({ email: 'a@b.com', code: '123456' })).toEqual({
      enrolmentToken: 'grant-token',
    });
  });

  it('totp/enrol returns secret + keyUri for the current account', async () => {
    const { controller, auth } = makeController();
    const out = await controller.enrolTotp(account);
    expect(out).toEqual({ secret: 'SEC', keyUri: 'otpauth://x' });
    expect(auth.enrolTotp).toHaveBeenCalledWith(1n);
  });

  it('signin sets the refresh cookie and returns the access token', async () => {
    const { controller } = makeController();
    const r = res();
    const out = await controller.signin({ email: 'a@b.com', password: 'x', totp: '123456' }, req(), r);
    expect(out).toEqual({ accessToken: 'access-token' });
    expect(r.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'sess-1.refresh-token',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
    );
  });

  it('refresh reads the cookie, rotates, and re-sets it', async () => {
    const { controller, auth } = makeController();
    const r = res();
    await controller.refresh(req(`${REFRESH_COOKIE}=sess-1.refresh-token`), r);
    expect(auth.refresh).toHaveBeenCalledWith('sess-1', 'refresh-token', expect.anything());
    expect(r.cookie).toHaveBeenCalledOnce();
  });

  it('refresh without a cookie is unauthorized', async () => {
    const { controller } = makeController();
    await expect(controller.refresh(req(), res())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout-all clears the cookie', async () => {
    const { controller, auth } = makeController();
    const r = res();
    await controller.logoutAll(account, r);
    expect(auth.logoutAll).toHaveBeenCalledWith(1n);
    expect(r.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, expect.objectContaining({ path: '/v1/auth' }));
  });

  it('password-reset request is neutral', async () => {
    const { controller, auth } = makeController();
    expect(await controller.requestPasswordReset({ email: 'a@b.com' }, req())).toEqual({ status: 'ok' });
    expect(auth.requestPasswordReset).toHaveBeenCalledOnce();
  });
});
