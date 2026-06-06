import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/**
 * ECIES over X25519 + HKDF-SHA256 + AES-256-GCM (Full Doc VII.3 transit layer).
 *
 * The browser encrypts the broker-credential payload to the account's public key before transit;
 * the server decrypts it inside the API process with the account's private key, then re-seals it
 * at rest via the envelope DEK. The raw credential is never logged or echoed (Hard rule #4).
 */
export interface EciesKeyPair {
  /** SPKI DER, base64. Shipped to the browser. */
  readonly publicKey: string;
  /** PKCS8 DER, base64. Held server-side, envelope-encrypted at rest. */
  readonly privateKey: string;
}

export interface EciesPayload {
  /** Ephemeral public key (SPKI DER, base64). */
  readonly epk: string;
  readonly salt: string;
  readonly iv: string;
  readonly tag: string;
  readonly ct: string;
}

const HKDF_INFO = Buffer.from('RM07-ECIES-v1', 'utf8');
const AES_KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;

export function generateKeyPair(): EciesKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return {
    publicKey: (publicKey as Buffer).toString('base64'),
    privateKey: (privateKey as Buffer).toString('base64'),
  };
}

export function eciesEncrypt(plaintext: Buffer, recipientPublicKeyB64: string): EciesPayload {
  const recipientPublicKey = createPublicKey({
    key: Buffer.from(recipientPublicKeyB64, 'base64'),
    format: 'der',
    type: 'spki',
  });

  const ephemeral = generateKeyPairSync('x25519');
  const shared = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: recipientPublicKey,
  });

  const salt = randomBytes(SALT_BYTES);
  const key = Buffer.from(hkdfSync('sha256', shared, salt, HKDF_INFO, AES_KEY_BYTES));
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const epk = ephemeral.publicKey.export({ type: 'spki', format: 'der' });

  return {
    epk: (epk as Buffer).toString('base64'),
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  };
}

export function eciesDecrypt(payload: EciesPayload, recipientPrivateKeyB64: string): Buffer {
  const recipientPrivateKey = createPrivateKey({
    key: Buffer.from(recipientPrivateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const ephemeralPublicKey = createPublicKey({
    key: Buffer.from(payload.epk, 'base64'),
    format: 'der',
    type: 'spki',
  });

  const shared = diffieHellman({
    privateKey: recipientPrivateKey,
    publicKey: ephemeralPublicKey,
  });
  const salt = Buffer.from(payload.salt, 'base64');
  const key = Buffer.from(hkdfSync('sha256', shared, salt, HKDF_INFO, AES_KEY_BYTES));
  const iv = Buffer.from(payload.iv, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  // Throws if the auth tag fails (tamper / wrong key).
  return Buffer.concat([decipher.update(Buffer.from(payload.ct, 'base64')), decipher.final()]);
}
