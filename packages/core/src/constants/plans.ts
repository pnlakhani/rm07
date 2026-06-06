/**
 * Subscription tiers — DECISION-LOCKED (Full Doc §IV.1, Hard rule #1).
 * Prices are GST-inclusive, stored in integer paise. Do not change without a
 * two-founder-signed ADR.
 */
export const PLAN_TIERS = ['free', 'basic', 'pro', 'elite', 'institutional'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export type BillingCadence = 'monthly' | 'quarterly' | 'annual';

export interface PlanPricing {
  readonly monthlyPaise: bigint;
  readonly quarterlyPaise: bigint;
  readonly annualPaise: bigint;
}

export interface PlanEntitlements {
  readonly maxBrokers: number;
  readonly aiModeHoldings: boolean;
  readonly aiModeWatchlistSize: number;
  readonly aiRefreshMinutes: number | null;
  readonly alertsQuotaMonthly: number;
}

export interface PlanDefinition {
  readonly id: PlanTier;
  readonly displayName: string;
  readonly pricing: PlanPricing;
  readonly entitlements: PlanEntitlements;
  /** Institutional pricing is bespoke (>= 50k/mo); null monthly marks custom. */
  readonly bespoke: boolean;
}

const P = (rupees: number): bigint => BigInt(rupees * 100);

export const PLANS: Readonly<Record<PlanTier, PlanDefinition>> = Object.freeze({
  free: {
    id: 'free',
    displayName: 'Free',
    pricing: { monthlyPaise: 0n, quarterlyPaise: 0n, annualPaise: 0n },
    entitlements: {
      maxBrokers: 1,
      aiModeHoldings: false,
      aiModeWatchlistSize: 0,
      aiRefreshMinutes: null,
      alertsQuotaMonthly: 5,
    },
    bespoke: false,
  },
  basic: {
    id: 'basic',
    displayName: 'Basic',
    pricing: { monthlyPaise: P(499), quarterlyPaise: P(1349), annualPaise: P(4788) },
    entitlements: {
      maxBrokers: 2,
      aiModeHoldings: true,
      aiModeWatchlistSize: 0,
      aiRefreshMinutes: 240,
      alertsQuotaMonthly: 50,
    },
    bespoke: false,
  },
  pro: {
    id: 'pro',
    displayName: 'Pro',
    pricing: { monthlyPaise: P(999), quarterlyPaise: P(2699), annualPaise: P(9588) },
    entitlements: {
      maxBrokers: 4,
      aiModeHoldings: true,
      aiModeWatchlistSize: 50,
      aiRefreshMinutes: 60,
      alertsQuotaMonthly: 500,
    },
    bespoke: false,
  },
  elite: {
    id: 'elite',
    displayName: 'Elite',
    pricing: { monthlyPaise: P(2999), quarterlyPaise: P(8099), annualPaise: P(28788) },
    entitlements: {
      maxBrokers: 10,
      aiModeHoldings: true,
      aiModeWatchlistSize: 200,
      aiRefreshMinutes: 15,
      alertsQuotaMonthly: 5000,
    },
    bespoke: false,
  },
  institutional: {
    id: 'institutional',
    displayName: 'Institutional',
    pricing: { monthlyPaise: 0n, quarterlyPaise: 0n, annualPaise: 0n },
    entitlements: {
      maxBrokers: 100,
      aiModeHoldings: true,
      aiModeWatchlistSize: 1000,
      aiRefreshMinutes: 15,
      alertsQuotaMonthly: 100000,
    },
    bespoke: true,
  },
});

/** HSN/SAC for the SaaS subscription line item (Full Doc §VI.8). */
export const HSN_SAC_SOFTWARE_SERVICE = '998314';

/** Refund window in days (Consumer Protection (E-commerce) Rules 2020). */
export const REFUND_WINDOW_DAYS = 7;
