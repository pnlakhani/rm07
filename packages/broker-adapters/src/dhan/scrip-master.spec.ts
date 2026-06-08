import { describe, expect, it } from 'vitest';
import { dhanExchangeToCode, parseDhanScripMaster } from './scrip-master.js';

const CSV = `SEM_EXM_EXCH_ID,SEM_SEGMENT,SEM_SMST_SECURITY_ID,SEM_INSTRUMENT_NAME,SEM_TRADING_SYMBOL,SEM_LOT_UNITS,SM_SYMBOL_NAME
NSE,E,2885,EQUITY,RELIANCE,1,RELIANCE INDUSTRIES
NSE,E,11536,EQUITY,TCS,1,"TATA CONSULTANCY, SERVICES"
NSE,D,49081,OPTIDX,BANKNIFTY24JUN50000CE,15,BANKNIFTY
,,,,,,
MCX,M,256265,FUTCOM,GOLD,100,GOLD`;

describe('parseDhanScripMaster', () => {
  it('parses rows and skips incomplete lines', () => {
    const rows = parseDhanScripMaster(CSV);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      exchange: 'NSE',
      segment: 'E',
      securityId: '2885',
      tradingSymbol: 'RELIANCE',
      symbolName: 'RELIANCE INDUSTRIES',
      instrumentType: 'EQUITY',
      lotSize: 1,
    });
  });

  it('honours quoted fields containing commas', () => {
    const rows = parseDhanScripMaster(CSV);
    expect(rows[1]?.symbolName).toBe('TATA CONSULTANCY, SERVICES');
  });

  it('is column-order independent (header-driven)', () => {
    const reordered = `SEM_TRADING_SYMBOL,SEM_SMST_SECURITY_ID,SEM_EXM_EXCH_ID,SEM_SEGMENT\nINFY,1594,NSE,E`;
    const rows = parseDhanScripMaster(reordered);
    expect(rows[0]).toMatchObject({ tradingSymbol: 'INFY', securityId: '1594', exchange: 'NSE' });
  });

  it('returns [] for header-only or empty input', () => {
    expect(parseDhanScripMaster('')).toEqual([]);
    expect(parseDhanScripMaster('SEM_EXM_EXCH_ID,SEM_SEGMENT')).toEqual([]);
  });
});

describe('dhanExchangeToCode', () => {
  it('maps exchange + segment to our ExchangeCode', () => {
    expect(dhanExchangeToCode('NSE', 'E')).toBe('NSE');
    expect(dhanExchangeToCode('NSE', 'D')).toBe('NFO');
    expect(dhanExchangeToCode('NSE', 'C')).toBe('CDS');
    expect(dhanExchangeToCode('BSE', 'E')).toBe('BSE');
    expect(dhanExchangeToCode('BSE', 'D')).toBe('BFO');
    expect(dhanExchangeToCode('MCX', 'M')).toBe('MCX');
  });
});
