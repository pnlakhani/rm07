/** Brokers supported across phases (Backend Schema §5.13, Full Doc III.6.3). */
export const BROKERS = ['dhan', 'zerodha', 'upstox', 'fyers', 'angel_one'] as const;
export type Broker = (typeof BROKERS)[number];

/** P1 launch brokers. Fyers + Angel One are P2 (Full Doc §II.4). */
export const P1_BROKERS = ['dhan', 'zerodha', 'upstox'] as const satisfies readonly Broker[];

export function isBroker(value: string): value is Broker {
  return (BROKERS as readonly string[]).includes(value);
}
