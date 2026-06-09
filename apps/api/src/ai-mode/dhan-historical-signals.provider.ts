import { Injectable } from '@nestjs/common';
import { rupeesToPaise } from '@rm07/core';
import { fetchDhanDailyCandles, type DhanCandle } from '@rm07/broker-adapters';
import { InstrumentResolverService } from '../instruments/instrument-resolver.service';
import { computeTechnicals, summariseTechnicalSignal } from './indicators';
import type { MarketSignalsProvider } from './ports';
import type { MarketSignals } from './types';

export interface DhanDataConfig {
  readonly clientId: string;
  readonly accessToken: string;
}

/** Our ExchangeCode -> Dhan exchange segment. */
const EX_SEGMENT: Record<string, string> = {
  NSE: 'NSE_EQ',
  BSE: 'BSE_EQ',
  NFO: 'NSE_FNO',
  BFO: 'BSE_FNO',
  MCX: 'MCX_COMM',
  CDS: 'NSE_CURRENCY',
};
const HISTORY_DAYS = 400;

type CandleFetcher = typeof fetchDhanDailyCandles;

/**
 * Phase-2 signals provider: resolves the symbol's Dhan securityId, pulls ~400 days of daily candles
 * from the platform market-data account, and computes the technical indicators the verdict prompt
 * needs. Fundamentals/news remain 'na' (separate feeds, later). Any failure degrades gracefully to
 * 'na' so the verdict simply falls back to INSUFFICIENT_EVIDENCE.
 */
@Injectable()
export class DhanHistoricalSignalsProvider implements MarketSignalsProvider {
  constructor(
    private readonly instruments: InstrumentResolverService,
    private readonly config: DhanDataConfig,
    private readonly fetchCandles: CandleFetcher = fetchDhanDailyCandles,
  ) {}

  async getSignals(exchange: string, tradingSymbol: string): Promise<MarketSignals> {
    const securityId = await this.instruments.resolveSecurityId('dhan', exchange, tradingSymbol);
    if (!securityId) {
      return this.na('Instrument not found in the master.');
    }

    const segment = EX_SEGMENT[exchange] ?? 'NSE_EQ';
    const today = new Date();
    const from = new Date(today.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
    const fmt = (d: Date): string => d.toISOString().slice(0, 10);

    let candles: readonly DhanCandle[];
    try {
      candles = await this.fetchCandles({
        accessToken: this.config.accessToken,
        clientId: this.config.clientId,
        securityId,
        exchangeSegment: segment,
        fromDate: fmt(from),
        toDate: fmt(today),
      });
    } catch {
      return this.na('Could not fetch historical candles.');
    }

    const tech = computeTechnicals(candles);
    const summary = summariseTechnicalSignal(tech);
    return {
      ltpPaise: tech.lastClose !== null ? rupeesToPaise(tech.lastClose) : null,
      news: 'na',
      fundamentals: 'na',
      technicals: summary.signal,
      newsNotes: 'Live news pipeline not yet wired.',
      fundamentalNotes: 'Fundamentals feed not yet wired.',
      technicalNotes: summary.notes,
    };
  }

  private na(note: string): MarketSignals {
    return {
      ltpPaise: null,
      news: 'na',
      fundamentals: 'na',
      technicals: 'na',
      newsNotes: 'Live news pipeline not yet wired.',
      fundamentalNotes: 'Fundamentals feed not yet wired.',
      technicalNotes: note,
    };
  }
}
