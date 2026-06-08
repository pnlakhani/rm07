import { Inject, Injectable, Logger } from '@nestjs/common';
import { dhanExchangeToCode, parseDhanScripMaster } from '@rm07/broker-adapters';
import {
  BROKER_INSTRUMENTS_REPOSITORY,
  type BrokerInstrumentRow,
  type BrokerInstrumentsRepository,
} from './ports';

const DHAN_SCRIP_MASTER_URL = 'https://images.dhan.co/api-data/api-scrip-master.csv';

/** Imports broker instrument masters into mkt.broker_instruments. */
@Injectable()
export class InstrumentImportService {
  private readonly logger = new Logger(InstrumentImportService.name);

  constructor(
    @Inject(BROKER_INSTRUMENTS_REPOSITORY) private readonly repo: BrokerInstrumentsRepository,
  ) {}

  /** Parse a Dhan scrip-master CSV and upsert it; returns the number of rows written. */
  async importDhanCsv(csv: string): Promise<number> {
    const scrips = parseDhanScripMaster(csv);

    // Dhan's master contains rows that collapse to the same (broker, exchange, tradingSymbol)
    // key (the table's unique key + the resolver lookup key). Postgres rejects an INSERT ...
    // ON CONFLICT batch that touches the same row twice, so we dedupe up front. Last write wins,
    // which keeps the import deterministic against the source ordering.
    const byKey = new Map<string, BrokerInstrumentRow>();
    for (const s of scrips) {
      const exchange = dhanExchangeToCode(s.exchange, s.segment);
      const key = `dhan|${exchange}|${s.tradingSymbol}`;
      byKey.set(key, {
        broker: 'dhan',
        exchange,
        tradingSymbol: s.tradingSymbol,
        securityId: s.securityId,
        symbolName: s.symbolName || null,
        instrumentType: s.instrumentType || null,
        lotSize: s.lotSize,
      });
    }

    const rows = [...byKey.values()];
    const dropped = scrips.length - rows.length;
    if (dropped > 0) {
      this.logger.warn(
        `Deduplicated ${dropped} duplicate (exchange, tradingSymbol) rows from Dhan scrip master`,
      );
    }

    const written = await this.repo.upsertMany(rows);
    this.logger.log(`Imported ${written} Dhan instruments`);
    return written;
  }

  /** Fetch Dhan's published scrip master and import it. */
  async importDhanFromSource(fetcher: typeof globalThis.fetch = globalThis.fetch): Promise<number> {
    const res = await fetcher(DHAN_SCRIP_MASTER_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch Dhan scrip master: ${res.status}`);
    }
    return this.importDhanCsv(await res.text());
  }
}
