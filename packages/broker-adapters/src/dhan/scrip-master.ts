import type { ExchangeCode } from '../types.js';

/** A row from Dhan's compact scrip master (api-scrip-master.csv). */
export interface DhanScrip {
  exchange: string; // NSE / BSE / MCX
  segment: string; // E (equity) / D (derivatives) / C (currency) / M (commodity)
  securityId: string;
  tradingSymbol: string;
  symbolName: string;
  instrumentType: string;
  lotSize: number | null;
}

/** Map Dhan (exchange, segment) to our ExchangeCode. */
export function dhanExchangeToCode(exchange: string, segment: string): ExchangeCode {
  const ex = exchange.toUpperCase();
  const seg = segment.toUpperCase();
  if (ex === 'NSE') {
    if (seg === 'D') return 'NFO';
    if (seg === 'C') return 'CDS';
    return 'NSE';
  }
  if (ex === 'BSE') {
    if (seg === 'D') return 'BFO';
    if (seg === 'C') return 'CDS';
    return 'BSE';
  }
  if (ex === 'MCX') return 'MCX';
  return 'NSE';
}

/** Split a CSV line, honouring double-quoted fields that may contain commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function pick(header: string[], candidates: string[]): number {
  for (const name of candidates) {
    const i = header.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

function cell(fields: string[], index: number): string {
  return index >= 0 ? (fields[index] ?? '').trim() : '';
}

/**
 * Parse Dhan's compact scrip-master CSV into normalised rows. Header-driven (column order is not
 * assumed), tolerant of quoted fields. Rows missing a security id, trading symbol or exchange are
 * skipped.
 */
export function parseDhanScripMaster(csv: string): DhanScrip[] {
  const lines = csv.split(/\r?\n/u).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }
  const header = splitCsvLine(lines[0]!).map((h) => h.trim());
  const cExch = pick(header, ['SEM_EXM_EXCH_ID', 'EXCH_ID']);
  const cSeg = pick(header, ['SEM_SEGMENT', 'SEGMENT']);
  const cSec = pick(header, ['SEM_SMST_SECURITY_ID', 'SECURITY_ID']);
  const cSym = pick(header, ['SEM_TRADING_SYMBOL', 'TRADING_SYMBOL']);
  const cName = pick(header, ['SM_SYMBOL_NAME', 'SYMBOL_NAME', 'SEM_CUSTOM_SYMBOL', 'DISPLAY_NAME']);
  const cType = pick(header, ['SEM_INSTRUMENT_NAME', 'INSTRUMENT']);
  const cLot = pick(header, ['SEM_LOT_UNITS', 'LOT_SIZE']);

  const rows: DhanScrip[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const f = splitCsvLine(lines[i]!);
    const securityId = cell(f, cSec);
    const tradingSymbol = cell(f, cSym);
    const exchange = cell(f, cExch);
    if (!securityId || !tradingSymbol || !exchange) {
      continue;
    }
    const lotRaw = Number.parseInt(cell(f, cLot), 10);
    rows.push({
      exchange,
      segment: cell(f, cSeg),
      securityId,
      tradingSymbol,
      symbolName: cell(f, cName),
      instrumentType: cell(f, cType),
      lotSize: Number.isFinite(lotRaw) ? lotRaw : null,
    });
  }
  return rows;
}
