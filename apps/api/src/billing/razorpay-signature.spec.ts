import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyRazorpaySignature } from './razorpay-signature';

const secret = 'whsec_test_123';
const body = JSON.stringify({ event: 'subscription.activated', id: 'evt_abc' });
const sign = (b: string, s: string): string => createHmac('sha256', s).update(b, 'utf8').digest('hex');

describe('verifyRazorpaySignature', () => {
  it('accepts a correct signature over the raw body', () => {
    expect(verifyRazorpaySignature(body, sign(body, secret), secret)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyRazorpaySignature(body, sign(body, 'wrong'), secret)).toBe(false);
  });

  it('rejects when the body was tampered with', () => {
    expect(verifyRazorpaySignature(body + ' ', sign(body, secret), secret)).toBe(false);
  });

  it('rejects an empty or malformed signature', () => {
    expect(verifyRazorpaySignature(body, '', secret)).toBe(false);
    expect(verifyRazorpaySignature(body, 'deadbeef', secret)).toBe(false);
  });

  it('rejects when the secret is missing', () => {
    expect(verifyRazorpaySignature(body, sign(body, secret), '')).toBe(false);
  });
});
