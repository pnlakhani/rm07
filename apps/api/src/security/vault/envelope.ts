import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM ciphertext blob. All fields are base64. */
export interface EncBlob {
  readonly iv: string;
  readonly tag: string;
  readonly ct: string;
}

const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce

export function generateDek(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function aesGcmEncrypt(key: Buffer, plaintext: Buffer): EncBlob {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('base64'), tag: tag.toString('base64'), ct: ct.toString('base64') };
}

export function aesGcmDecrypt(key: Buffer, blob: EncBlob): Buffer {
  assertKey(key);
  const iv = Buffer.from(blob.iv, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  const ct = Buffer.from(blob.ct, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  // .final() throws if the auth tag does not verify (tamper / wrong key).
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Serialize an EncBlob to bytes for storage in a `bytea` column. */
export function serializeBlob(blob: EncBlob): Buffer {
  return Buffer.from(JSON.stringify(blob), 'utf8');
}

export function deserializeBlob(buf: Buffer): EncBlob {
  const parsed = JSON.parse(buf.toString('utf8')) as EncBlob;
  if (
    typeof parsed.iv !== 'string' ||
    typeof parsed.tag !== 'string' ||
    typeof parsed.ct !== 'string'
  ) {
    throw new Error('Malformed EncBlob');
  }
  return parsed;
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Key must be ${KEY_BYTES} bytes (got ${key.length})`);
  }
}
