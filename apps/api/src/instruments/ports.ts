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

export interface BrokerInstrumentsRepository {
  /** Resolve the broker-side security id for (broker, exchange, tradingSymbol). */
  resolve(broker: string, exchange: string, tradingSymbol: string): Promise<string | null>;
  /** Bulk upsert instrument rows; returns the number written. */
  upsertMany(rows: readonly BrokerInstrumentRow[]): Promise<number>;
}

export const BROKER_INSTRUMENTS_REPOSITORY = Symbol('BROKER_INSTRUMENTS_REPOSITORY');
