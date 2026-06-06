/**
 * Money is represented as integer **paise** (1 INR = 100 paise) plus a currency code.
 * Floats are never used for money (Backend Schema §4, TRD §6.2).
 */
export type CurrencyCode = 'INR';

export interface Money {
  /** Integer paise. Must be a safe integer. */
  readonly paise: bigint;
  readonly currency: CurrencyCode;
}

const PAISE_PER_RUPEE = 100n;

export function rupeesToPaise(rupees: number): bigint {
  if (!Number.isFinite(rupees)) {
    throw new RangeError('rupees must be a finite number');
  }
  // Round to the nearest paise to avoid binary-float drift.
  return BigInt(Math.round(rupees * 100));
}

export function paiseToRupees(paise: bigint): number {
  return Number(paise) / 100;
}

export function money(paise: bigint, currency: CurrencyCode = 'INR'): Money {
  return { paise, currency };
}

/** Format paise as an Indian-locale currency string, e.g. 99900n -> "₹999.00". */
export function formatPaise(paise: bigint, currency: CurrencyCode = 'INR'): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const rupees = abs / PAISE_PER_RUPEE;
  const remainder = abs % PAISE_PER_RUPEE;
  const symbol = currency === 'INR' ? '₹' : '';
  const rupeeStr = rupees.toLocaleString('en-IN');
  const paiseStr = remainder.toString().padStart(2, '0');
  return `${negative ? '-' : ''}${symbol}${rupeeStr}.${paiseStr}`;
}
