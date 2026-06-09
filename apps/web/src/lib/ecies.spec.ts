import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptToPublicKey, type EciesPayload } from './ecies';

/**
 * Mirrors apps/api/src/security/vault/ecies.ts `eciesDecrypt` exactly. If the browser-side
 * encryptToPublicKey is compatible, this recovers the plaintext — proving the transit layer
 * round-trips between the web app and the API without ever running a browser.
 */
function serverDecrypt(payload: EciesPayload, privateKeyB64: string): string {
  const recipientPrivateKey = createPrivateKey({
    key: Buffer.from(privateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const ephemeralPublicKey = createPublicKey({
    key: Buffer.from(payload.epk, 'base64'),
    format: 'der',
    type: 'spki',
  });
  const shared = diffieHellman({ privateKey: recipientPrivateKey, publicKey: ephemeralPublicKey });
  const key = Buffer.from(
    hkdfSync('sha256', shared, Buffer.from(payload.salt, 'base64'), Buffer.from('RM07-ECIES-v1', 'utf8'), 32),
  );
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ct, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

describe('browser ECIES (encryptToPublicKey)', () => {
  function newRecipient(): { publicKeyB64: string; privateKeyB64: string } {
    const { publicKey, privateKey } = generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
    return {
      publicKeyB64: (publicKey as Buffer).toString('base64'),
      privateKeyB64: (privateKey as Buffer).toString('base64'),
    };
  }

  it('produces a payload the server can decrypt (round-trip)', async () => {
    const { publicKeyB64, privateKeyB64 } = newRecipient();
    const plaintext = JSON.stringify({ client_id: 'CID-1', access_token: 'SECRET-TOKEN' });
    const payload = await encryptToPublicKey(plaintext, publicKeyB64);
    expect(serverDecrypt(payload, privateKeyB64)).toBe(plaintext);
  });

  it('returns all five base64 fields', async () => {
    const { publicKeyB64 } = newRecipient();
    const payload = await encryptToPublicKey('hello', publicKeyB64);
    for (const field of [payload.epk, payload.salt, payload.iv, payload.tag, payload.ct]) {
      expect(field.length).toBeGreaterThan(0);
    }
  });

  it('fails to decrypt under a different key (confidentiality)', async () => {
    const a = newRecipient();
    const b = newRecipient();
    const payload = await encryptToPublicKey('secret', a.publicKeyB64);
    expect(() => serverDecrypt(payload, b.privateKeyB64)).toThrow();
  });
});
