import { describe, expect, it } from 'vitest';
import { TotpService } from './totp.service';
import { base32Decode, base32Encode } from './base32';

// RFC 6238 Appendix B test secret: ASCII "12345678901234567890" (20 bytes), SHA1.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('base32', () => {
  it('round-trips and matches the canonical TOTP test vector', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(RFC_SECRET).toString('ascii')).toBe('12345678901234567890');
  });
});

describe('TotpService (RFC 6238)', () => {
  const totp = new TotpService();

  it('matches RFC 6238 vectors (6-digit truncation of the 8-digit reference)', () => {
    // 8-digit references: T=59 → 94287082, T=1111111109 → 07081804.
    expect(totp.generateCode(RFC_SECRET, 59)).toBe('287082');
    expect(totp.generateCode(RFC_SECRET, 1111111109)).toBe('081804');
    expect(totp.generateCode(RFC_SECRET, 1111111111)).toBe('050471');
  });

  it('verifies a freshly generated code', () => {
    const secret = totp.generateSecret();
    const now = 1_700_000_000;
    expect(totp.verify(secret, totp.generateCode(secret, now), now)).toBe(true);
  });

  it('accepts a code from the previous step (±1 window)', () => {
    const secret = totp.generateSecret();
    const now = 1_700_000_000;
    const prev = totp.generateCode(secret, now - 30);
    expect(totp.verify(secret, prev, now)).toBe(true);
  });

  it('rejects a code outside the window', () => {
    const secret = totp.generateSecret();
    const now = 1_700_000_000;
    const old = totp.generateCode(secret, now - 120);
    expect(totp.verify(secret, old, now)).toBe(false);
  });

  it('rejects malformed tokens', () => {
    const secret = totp.generateSecret();
    expect(totp.verify(secret, 'abcdef')).toBe(false);
    expect(totp.verify(secret, '12345')).toBe(false);
    expect(totp.verify(secret, '')).toBe(false);
  });

  it('builds an otpauth key URI', () => {
    const uri = totp.keyUri(RFC_SECRET, 'prash@example.com');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(`secret=${RFC_SECRET}`);
    expect(uri).toContain('algorithm=SHA1');
  });
});
