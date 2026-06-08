import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify a Razorpay webhook signature (S-14). Razorpay signs the *raw* request body with the
 * webhook secret using HMAC-SHA256 and sends the hex digest in the `X-Razorpay-Signature` header.
 * Comparison is constant-time. The caller MUST pass the exact raw body bytes (not a re-serialised
 * JSON object) or the digest will not match.
 */
export function verifyRazorpaySignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
