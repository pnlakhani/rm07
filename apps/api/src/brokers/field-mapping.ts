import type { CredentialField, CredentialFields } from '../security/vault/credential-vault.service';

/** The non-secret identifier field, stored in core.broker_connections.client_id (plaintext). */
export const CLIENT_ID_FIELD = 'client_id';

/** Broker submit-field (snake_case) → fixed credential column (Backend Schema §5.14). */
const SECRET_TO_COLUMN: Readonly<Record<string, CredentialField>> = {
  api_key: 'apiKey',
  api_secret: 'apiSecret',
  access_token: 'accessToken',
  totp_seed: 'totpSeed',
  totp: 'totpSeed',
  pin: 'pin',
};

const COLUMN_TO_SECRET: Readonly<Record<CredentialField, string>> = {
  apiKey: 'api_key',
  apiSecret: 'api_secret',
  accessToken: 'access_token',
  totpSeed: 'totp_seed',
  pin: 'pin',
};

/** Split a decrypted broker submission into the plaintext client id and the sealable secrets. */
export function splitBrokerFields(raw: Record<string, string>): {
  clientId: string | null;
  credentials: CredentialFields;
} {
  const credentials: CredentialFields = {};
  for (const [key, value] of Object.entries(raw)) {
    const column = SECRET_TO_COLUMN[key];
    if (column && value) {
      credentials[column] = value;
    }
  }
  return { clientId: raw[CLIENT_ID_FIELD] ?? null, credentials };
}

/** Reassemble the broker credential map (snake_case) the adapter expects, from stored parts. */
export function reassembleBrokerFields(
  clientId: string | null,
  credentials: CredentialFields,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (clientId) {
    out[CLIENT_ID_FIELD] = clientId;
  }
  for (const [column, value] of Object.entries(credentials)) {
    if (value) {
      out[COLUMN_TO_SECRET[column as CredentialField]] = value;
    }
  }
  return out;
}
