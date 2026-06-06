import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { aesGcmDecrypt, aesGcmEncrypt, generateDek } from './envelope';
import { eciesDecrypt, eciesEncrypt, generateKeyPair } from './ecies';
import { CredentialVaultService } from './credential-vault.service';

const rootKeyB64 = randomBytes(32).toString('base64');

describe('envelope (AES-256-GCM at rest)', () => {
  it('round-trips a value', () => {
    const dek = generateDek();
    const blob = aesGcmEncrypt(dek, Buffer.from('secret-token', 'utf8'));
    expect(aesGcmDecrypt(dek, blob).toString('utf8')).toBe('secret-token');
  });

  it('fails on a tampered ciphertext (GCM auth)', () => {
    const dek = generateDek();
    const blob = aesGcmEncrypt(dek, Buffer.from('secret-token', 'utf8'));
    const tampered = { ...blob, ct: Buffer.from('00'.repeat(8), 'hex').toString('base64') };
    expect(() => aesGcmDecrypt(dek, tampered)).toThrow();
  });

  it('fails with the wrong key', () => {
    const blob = aesGcmEncrypt(generateDek(), Buffer.from('x', 'utf8'));
    expect(() => aesGcmDecrypt(generateDek(), blob)).toThrow();
  });
});

describe('ECIES (X25519 transit)', () => {
  it('round-trips to the recipient keypair', () => {
    const kp = generateKeyPair();
    const payload = eciesEncrypt(Buffer.from('client-id-123', 'utf8'), kp.publicKey);
    expect(eciesDecrypt(payload, kp.privateKey).toString('utf8')).toBe('client-id-123');
  });

  it('cannot be decrypted with a different private key', () => {
    const kp = generateKeyPair();
    const other = generateKeyPair();
    const payload = eciesEncrypt(Buffer.from('client-id-123', 'utf8'), kp.publicKey);
    expect(() => eciesDecrypt(payload, other.privateKey)).toThrow();
  });
});

describe('CredentialVaultService', () => {
  const vault = new CredentialVaultService(rootKeyB64);

  it('rejects a root key of the wrong length', () => {
    expect(() => new CredentialVaultService(randomBytes(16).toString('base64'))).toThrow();
  });

  it('seals and opens credential fields losslessly', () => {
    const fields = { apiKey: 'AK-123', accessToken: 'tok-xyz', totpSeed: 'GEZDGNBV' };
    const sealed = vault.seal(fields);
    // Ciphertext must not contain plaintext.
    expect(sealed.dekWrapped.toString('utf8')).not.toContain('tok-xyz');
    expect(sealed.fields.accessToken?.toString('utf8')).not.toContain('tok-xyz');
    expect(vault.open(sealed)).toEqual(fields);
  });

  it('produces a different DEK each seal (no nonce reuse across connections)', () => {
    const a = vault.seal({ apiKey: 'same' });
    const b = vault.seal({ apiKey: 'same' });
    expect(a.dekWrapped.equals(b.dekWrapped)).toBe(false);
    expect(a.fields.apiKey?.equals(b.fields.apiKey ?? Buffer.alloc(0))).toBe(false);
  });

  it('decrypts an ECIES transit payload then seals it', () => {
    const kp = vault.generateAccountKeyPair();
    const clientPayload = eciesEncrypt(
      Buffer.from(JSON.stringify({ apiKey: 'AK-1', apiSecret: 'AS-1' }), 'utf8'),
      kp.publicKey,
    );
    const fields = vault.decryptTransit(clientPayload, kp.privateKey);
    expect(fields).toEqual({ apiKey: 'AK-1', apiSecret: 'AS-1' });
    const sealed = vault.seal(fields);
    expect(vault.open(sealed)).toEqual({ apiKey: 'AK-1', apiSecret: 'AS-1' });
  });

  it('seals and opens a single value (TOTP seed)', () => {
    const blob = vault.sealValue('GEZDGNBVGY3TQOJQ');
    expect(blob.toString('utf8')).not.toContain('GEZDGNBV');
    expect(vault.openValue(blob)).toBe('GEZDGNBVGY3TQOJQ');
  });

  it('sealValue uses a fresh DEK each call', () => {
    const a = vault.sealValue('same-seed');
    const b = vault.sealValue('same-seed');
    expect(a.equals(b)).toBe(false);
  });
});
