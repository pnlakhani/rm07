import { Injectable } from '@nestjs/common';
import type { MarketSignalsProvider } from './ports';
import type { MarketSignals } from './types';

/**
 * Phase-1 placeholder signals provider. Returns 'na' signals so the verdict pipeline runs end to
 * end and the model returns INSUFFICIENT_EVIDENCE. Phase 2 replaces this with a provider that
 * computes technicals from Dhan historical candles + adds fundamentals/news.
 */
@Injectable()
export class StubMarketSignalsProvider implements MarketSignalsProvider {
  getSignals(_exchange: string, _tradingSymbol: string): Promise<MarketSignals> {
    return Promise.resolve({
      ltpPaise: null,
      news: 'na',
      fundamentals: 'na',
      technicals: 'na',
      newsNotes: 'Live news pipeline not yet wired.',
      fundamentalNotes: 'Fundamentals feed not yet wired.',
      technicalNotes: 'Technical indicators (Dhan historical) not yet wired.',
    });
  }
}
