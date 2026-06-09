/** A normalised per-broker instrument row for upsert into mkt.broker_instruments. */
export interface BrokerInstrumentRow {
  broker: string;
  exchange: string;
  tradingSymbol: string;
  securityId: string;
  symbolName: string | null;
  instrumentType: string | null;
  lotSize: number | null;
}

/** A search hit for the instrument picker. */
export interface InstrumentSearchRow {
  readonly exchange: string;
  readonly tradingSymbol: string;
  readonly symbolName: string | null;
}

export interface BrokerInstrumentsRepository {
  /** Resolve the broker-side security id for (broker, exchange, tradingSymbol). */
  resolve(broker: string, exchange: string, tradingSymbol: string): Promise<string | null>;
  /** Bulk upsert instrument rows; returns the number written. */
  upsertMany(rows: readonly BrokerInstrumentRow[]): Promise<number>;
  /** Prefix-search active instruments by trading symbol (optionally scoped to an exchange). */
  search(
    broker: string,
    exchange: string | null,
    query: string,
    limit: number,
  ): Promise<readonly InstrumentSearchRow[]>;
}

export const BROKER_INSTRUMENTS_REPOSITORY = Symbol('BROKER_INSTRUMENTS_REPOSITORY');
