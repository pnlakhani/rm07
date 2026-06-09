import { x25519 } from '@noble/curves/ed25519';

/**
 * Browser side of the RM07 transit-encryption layer (Full Doc VII.3). Encrypts broker credentials
 * to the account's ECIES public key before they leave the browser; the API decrypts in-process
 * with the account's private key. Must match apps/api/src/security/vault/ecies.ts exactly:
 *   X25519 ECDH → HKDF-SHA256(salt, info="RM07-ECIES-v1") → AES-256-GCM.
 *
 * X25519 is done with @noble/curves (deterministic, no reliance on browser X25519 support); HKDF
 * and AES-GCM use Web Crypto, which is universally available.
 */
export interface EciesPayload {
  readonly epk: string;
  readonly salt: string;
  readonly iv: string;
  readonly tag: string;
  readonly ct: string;
}

/** Fixed 12-byte SPKI-DER prefix for an X25519 public key (id-X25519, then BIT STRING of 32 bytes). */
const X25519_SPKI_PREFIX = new Uint8Array([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00,
]);
const HKDF_INFO = new TextEncoder().encode('RM07-ECIES-v1');

/**
 * Copy bytes into a guaranteed ArrayBuffer-backed view. Web Crypto's `BufferSource` excludes
 * SharedArrayBuffer, but @noble/curves and TextEncoder return `Uint8Array<ArrayBufferLike>` under
 * TS's newer typed-array generics — this narrows them for the subtle-crypto calls.
 */
function toArrayBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Strip the SPKI-DER wrapper to the raw 32-byte X25519 public key. */
function spkiToRaw(spki: Uint8Array): Uint8Array {
  return spki.slice(spki.length - 32);
}

/** Wrap a raw 32-byte X25519 public key back into SPKI-DER (what the server's parser expects). */
function rawToSpki(raw: Uint8Array): Uint8Array {
  const out = new Uint8Array(X25519_SPKI_PREFIX.length + raw.length);
  out.set(X25519_SPKI_PREFIX, 0);
  out.set(raw, X25519_SPKI_PREFIX.length);
  return out;
}

/** Encrypt `plaintext` to the recipient's X25519 SPKI-DER public key (base64). */
export async function encryptToPublicKey(
  plaintext: string,
  recipientPublicKeyB64: string,
): Promise<EciesPayload> {
  const recipientRaw = spkiToRaw(base64ToBytes(recipientPublicKeyB64));

  const ephemeralPrivate = x25519.utils.randomPrivateKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);
  const shared = x25519.getSharedSecret(ephemeralPrivate, recipientRaw);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hkdfKey = await crypto.subtle.importKey('raw', toArrayBufferView(shared), 'HKDF', false, [
    'deriveBits',
  ]);
  const aesBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: toArrayBufferView(HKDF_INFO) },
    hkdfKey,
    256,
  );
  const aesKey = await crypto.subtle.importKey('raw', aesBits, 'AES-GCM', false, ['encrypt']);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      aesKey,
      toArrayBufferView(new TextEncoder().encode(plaintext)),
    ),
  );
  // Web Crypto appends the 16-byte GCM tag to the ciphertext; the server expects them separate.
  const ct = sealed.slice(0, sealed.length - 16);
  const tag = sealed.slice(sealed.length - 16);

  return {
    epk: bytesToBase64(rawToSpki(ephemeralPublic)),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    tag: bytesToBase64(tag),
    ct: bytesToBase64(ct),
  };
}
