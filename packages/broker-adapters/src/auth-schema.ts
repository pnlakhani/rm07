/**
 * Declarative auth-field schema. The Connect Broker modal renders form fields from this
 * declaration; no broker-specific form code lives in the front end (TRD §7, Full Doc §III.6.1).
 */
export type AuthFieldType = 'text' | 'password' | 'secret';

export interface AuthField {
  /** Machine key sent back to the adapter, e.g. "api_key". */
  readonly key: string;
  readonly label: string;
  readonly type: AuthFieldType;
  readonly required: boolean;
  /** Help text shown under the field (e.g. where to generate the token). */
  readonly hint?: string;
  /** Optional client-side validation pattern (RegExp source). */
  readonly pattern?: string;
}

/** How the broker establishes a session. */
export type BrokerAuthFlow = 'paste_token' | 'oauth_redirect';
