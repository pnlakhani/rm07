import { describe, expect, it } from 'vitest';
import {
  passwordResetConfirmSchema,
  signinSchema,
  signupSchema,
  verifyOtpSchema,
} from './dto';

describe('auth DTOs', () => {
  it('accepts a valid signup and normalises the email', () => {
    const parsed = signupSchema.parse({ email: '  Prash@Example.COM ', password: 'a-strong-passphrase' });
    expect(parsed.email).toBe('prash@example.com');
  });

  it('rejects a short password', () => {
    expect(signupSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const res = signupSchema.safeParse({
      email: 'a@b.com',
      password: 'a-strong-passphrase',
      isAdmin: true,
    });
    expect(res.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(signupSchema.safeParse({ email: 'not-an-email', password: 'a-strong-passphrase' }).success).toBe(
      false,
    );
  });

  it('requires a 6-digit OTP code', () => {
    expect(verifyOtpSchema.safeParse({ email: 'a@b.com', code: '123456' }).success).toBe(true);
    expect(verifyOtpSchema.safeParse({ email: 'a@b.com', code: '12345' }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ email: 'a@b.com', code: 'abcdef' }).success).toBe(false);
  });

  it('requires a 6-digit TOTP on signin', () => {
    expect(
      signinSchema.safeParse({ email: 'a@b.com', password: 'x', totp: '654321' }).success,
    ).toBe(true);
    expect(signinSchema.safeParse({ email: 'a@b.com', password: 'x', totp: '7' }).success).toBe(false);
  });

  it('validates password-reset confirmation', () => {
    const ok = passwordResetConfirmSchema.safeParse({
      token: 'reset-token',
      totp: '111111',
      newPassword: 'another-strong-passphrase',
    });
    expect(ok.success).toBe(true);
    const badPw = passwordResetConfirmSchema.safeParse({
      token: 'reset-token',
      totp: '111111',
      newPassword: 'short',
    });
    expect(badPw.success).toBe(false);
  });
});
