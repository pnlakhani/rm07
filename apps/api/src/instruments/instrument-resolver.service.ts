import { Inject, Injectable } from '@nestjs/common';
import {
  BROKER_INSTRUMENTS_REPOSITORY,
  type BrokerInstrumentsRepository,
  type InstrumentSearchRow,
} from './ports';

/** Default broker whose instrument master is loaded (the only one imported so far). */
const DEFAULT_BROKER = 'dhan';
const SEARCH_LIMIT = 20;

/** Resolves and searches the broker instrument master. */
@Injectable()
export class InstrumentResolverService {
  constructor(
    @Inject(BROKER_INSTRUMENTS_REPOSITORY) private readonly repo: BrokerInstrumentsRepository,
  ) {}

  resolveSecurityId(broker: string, exchange: string, tradingSymbol: string): Promise<string | null> {
    return this.repo.resolve(broker, exchange, tradingSymbol);
  }

  /** Prefix-search instruments by trading symbol for the instrument picker. */
  search(exchange: string | null, query: string): Promise<readonly InstrumentSearchRow[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return Promise.resolve([]);
    }
    return this.repo.search(DEFAULT_BROKER, exchange, trimmed.toUpperCase(), SEARCH_LIMIT);
  }
}
