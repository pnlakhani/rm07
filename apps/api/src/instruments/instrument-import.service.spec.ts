import { describe, expect, it } from 'vitest';
import { InstrumentImportService } from './instrument-import.service';
import type { BrokerInstrumentRow, BrokerInstrumentsRepository } from './ports';

class FakeRepo implements BrokerInstrumentsRepository {
  readonly rows: BrokerInstrumentRow[] = [];
  resolve(broker: string, exchange: string, tradingSymbol: string): Promise<string | null> {
    const r = this.rows.find(
      (x) => x.broker === broker && x.exchange === exchange && x.tradingSymbol === tradingSymbol,
    );
    return Promise.resolve(r?.securityId ?? null);
  }
  upsertMany(rows: readonly BrokerInstrumentRow[]): Promise<number> {
    this.rows.push(...rows);
    return Promise.resolve(rows.length);
  }
}

const CSV = `SEM_EXM_EXCH_ID,SEM_SEGMENT,SEM_SMST_SECURITY_ID,SEM_INSTRUMENT_NAME,SEM_TRADING_SYMBOL,SEM_LOT_UNITS,SM_SYMBOL_NAME
NSE,E,2885,EQUITY,RELIANCE,1,RELIANCE INDUSTRIES
NSE,D,49081,OPTIDX,BANKNIFTY24JUN50000CE,15,BANKNIFTY
MCX,M,256265,FUTCOM,GOLD,100,GOLD`;

describe('InstrumentImportService', () => {
  it('parses + maps + upserts a Dhan CSV', async () => {
    const repo = new FakeRepo();
    const written = await new InstrumentImportService(repo).importDhanCsv(CSV);
    expect(written).toBe(3);
    expect(repo.rows[0]).toEqual({
      broker: 'dhan',
      exchange: 'NSE',
      tradingSymbol: 'RELIANCE',
      securityId: '2885',
      symbolName: 'RELIANCE INDUSTRIES',
      instrumentType: 'EQUITY',
      lotSize: 1,
    });
    // Derivatives segment maps to NFO; MCX commodity to MCX.
    expect(repo.rows[1]?.exchange).toBe('NFO');
    expect(repo.rows[2]?.exchange).toBe('MCX');
  });

  it('fetches + imports from source', async () => {
    const repo = new FakeRepo();
    const fetcher = (async () => ({ ok: true, status: 200, text: async () => CSV }) as Response) as unknown as typeof fetch;
    expect(await new InstrumentImportService(repo).importDhanFromSource(fetcher)).toBe(3);
  });
});
