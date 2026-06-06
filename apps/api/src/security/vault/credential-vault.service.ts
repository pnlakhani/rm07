import { Inject, Injectable } from '@nestjs/common';
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  deserializeBlob,
  generateDek,
  serializeBlob,
  type EncBlob,
} from './envelope';
import { eciesDecrypt, generateKeyPair, type EciesKeyPair, type EciesPayload } from './ecies';

/** DI token for the 32-byte root key (base64), sourced from Doppler (Hard rule: no secrets in code). */
export const VAULT_ROOT_KEY = Symbol('VAULT_ROOT_KEY');

/** The broker-credential fields that may be stored (Backend Schema §5.14). */
export type CredentialField =
  | 'apiKey'
  | 'apiSecret'
  | 'accessToken'
  | 'totpSeed'
  | 'pin';

export type CredentialFields = Partial<Record<CredentialField, string>>;

/** What gets persisted to `core.broker_credentials_enc` (ciphertext only). */
export interface SealedCredentials {
  /** DEK wrapped by the root key. */
  readonly dekWrapped: Buffer;
  /** Per-field ciphertext blobs (serialized for `bytea`). */
  readonly fields: Partial<Record<CredentialField, Buffer>>;
}

/**
 * Broker-credential vault (Full Doc VII.3, Hard rule #4).
 *
 * Two layers:
 *  - **Transit:** the browser ECIES-encrypts the payload to the account's public key; the server
 *    decrypts it here, in-process, with the account's private key.
 *  - **At rest:** each field is AES-256-GCM encrypted under a fresh per-connection DEK, and the
 *    DEK is itself wrapped by the application root key (Doppler in P1 → AWS KMS + Nitro Enclave
 *    in month 4). Plaintext is materialised only at the broker-call moment and never logged.
 */
@Injectable()
export class CredentialVaultService {
  private readonly rootKey: Buffer;

  constructor(@Inject(VAULT_ROOT_KEY) rootKeyBase64: string) {
    const key = Buffer.from(rootKeyBase64, 'base64');
    if (key.length !== 32) {
      throw new Error('VAULT_ROOT_KEY must decode to 32 bytes (base64-encoded AES-256 key)');
    }
    this.rootKey = key;
  }

  /** Generate an account ECIES keypair at enrolment; private key is sealed before storage. */
  generateAccountKeyPair(): EciesKeyPair {
    return generateKeyPair();
  }

  /** Decrypt an ECIES transit payload from the browser using the account's private key. */
  decryptTransit(payload: EciesPayload, accountPrivateKeyB64: string): CredentialFields {
    const plaintext = eciesDecrypt(payload, accountPrivateKeyB64).toString('utf8');
    const parsed = JSON.parse(plaintext) as CredentialFields;
    return parsed;
  }

  /** Seal credential fields for at-rest storage under a fresh per-connection DEK. */
  seal(fields: CredentialFields): SealedCredentials {
    const dek = generateDek();
    const sealedFields: Partial<Record<CredentialField, Buffer>> = {};
    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined) {
        continue;
      }
      const blob = aesGcmEncrypt(dek, Buffer.from(value, 'utf8'));
      sealedFields[field as CredentialField] = serializeBlob(blob);
    }
    const dekWrapped = serializeBlob(aesGcmEncrypt(this.rootKey, dek));
    return { dekWrapped, fields: sealedFields };
  }

  /**
   * Open sealed credentials to plaintext — call ONLY at the broker-call moment, never log the
   * return value. The DEK is unwrapped with the root key, then each field decrypted.
   */
  open(sealed: SealedCredentials): CredentialFields {
    const dek = aesGcmDecrypt(this.rootKey, deserializeBlob(sealed.dekWrapped));
    try {
      const out: CredentialFields = {};
      for (const [field, buf] of Object.entries(sealed.fields)) {
        if (!buf) {
          continue;
        }
        const blob: EncBlob = deserializeBlob(buf);
        out[field as CredentialField] = aesGcmDecrypt(dek, blob).toString('utf8');
      }
      return out;
    } finally {
      // Best-effort scrub of the unwrapped DEK from memory.
      dek.fill(0);
    }
  }

  /**
   * Seal a single secret value (e.g. a TOTP seed) into one self-contained blob suitable for a
   * single `bytea` column (core.mfa_factors.secret_encrypted). Same envelope construction as
   * `seal`, packed as { dek, field }.
   */
  sealValue(plaintext: string): Buffer {
    const dek = generateDek();
    try {
      const field = aesGcmEncrypt(dek, Buffer.from(plaintext, 'utf8'));
      const dekWrapped = aesGcmEncrypt(this.rootKey, dek);
      return Buffer.from(JSON.stringify({ dek: dekWrapped, field }), 'utf8');
    } finally {
      dek.fill(0);
    }
  }

  /** Open a blob produced by `sealValue` — call only at the moment of use; never log the result. */
  openValue(buf: Buffer): string {
    const parsed = JSON.parse(buf.toString('utf8')) as { dek: EncBlob; field: EncBlob };
    const dek = aesGcmDecrypt(this.rootKey, parsed.dek);
    try {
      return aesGcmDecrypt(dek, parsed.field).toString('utf8');
    } finally {
      dek.fill(0);
    }
  }
}
