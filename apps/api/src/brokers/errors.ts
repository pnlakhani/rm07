export type BrokerErrorCode =
  | 'no_account_key'
  | 'transit_decrypt_failed'
  | 'no_adapter'
  | 'broker_verify_failed'
  | 'connection_not_found'
  | 'instrument_not_found'
  | 'forbidden';

export class BrokerError extends Error {
  constructor(
    readonly code: BrokerErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'BrokerError';
  }
}
