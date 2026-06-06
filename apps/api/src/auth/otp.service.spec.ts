import { describe, expect, it } from 'vitest';
import { OTP_DIGITS, OTP_TTL_SECONDS, OtpService } from './otp.service';

const svc = new OtpService('otp-pepper-at-least-16-chars');

describe('OtpService', () => {
  it('generates a zero-padded 6-digit code', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = svc.generateCode();
      expect(code).toMatch(/^\d{6}$/u);
      expect(code.length).toBe(OTP_DIGITS);
    }
  });

  it('verifies a code against its hash', () => {
    const code = svc.generateCode();
    const hash = svc.hash(code);
    expect(svc.verify(code, hash)).toBe(true);
    expect(svc.verify('000000', hash)).toBe(code === '000000');
  });

  it('rejects malformed codes', () => {
    const hash = svc.hash('123456');
    expect(svc.verify('12345', hash)).toBe(false);
    expect(svc.verify('abcdef', hash)).toBe(false);
    expect(svc.verify('1234567', hash)).toBe(false);
  });

  it('hash depends on the pepper', () => {
    const other = new OtpService('different-pepper-16chars');
    expect(svc.hash('123456')).not.toBe(other.hash('123456'));
  });

  it('computes a 5-minute expiry', () => {
    const now = new Date('2026-06-06T00:00:00Z');
    expect(svc.expiresAt(now).getTime()).toBe(now.getTime() + OTP_TTL_SECONDS * 1000);
  });

  it('requires a sufficiently long pepper', () => {
    expect(() => new OtpService('short')).toThrow();
  });
});
