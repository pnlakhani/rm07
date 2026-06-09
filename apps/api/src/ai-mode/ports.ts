import type { MarketSignals, VerdictInputs } from './types';

/** Calls the LLM and returns the model name + the raw (JSON-parsed, unvalidated) verdict. */
export interface VerdictModelClient {
  complete(inputs: VerdictInputs): Promise<{ model: string; raw: unknown }>;
}

/** Supplies the market signals for a symbol (stub now; Dhan-historical later). */
export interface MarketSignalsProvider {
  getSignals(exchange: string, tradingSymbol: string): Promise<MarketSignals>;
}

/** One immutable row appended to core.recommendations_register. */
export interface RegisterEntry {
  readonly exchange: string;
  readonly tradingSymbol: string;
  readonly verdict: string;
  readonly oneLiner: string;
  readonly stTargetPaise: bigint | null;
  readonly mtTargetPaise: bigint | null;
  readonly ltTargetPaise: bigint | null;
  readonly stopLossPaise: bigint | null;
  readonly confidence: number;
  readonly signalNews: string;
  readonly signalFundamentals: string;
  readonly signalTechnicals: string;
  readonly riskGrade: string;
  readonly rationale: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly raRegistrationNumber: string;
  readonly signedBy: string;
}

export interface RecommendationsRegisterRepository {
  record(entry: RegisterEntry): Promise<void>;
}

export interface AiModeConfig {
  readonly raRegistrationNumber: string;
  readonly signedBy: string;
  readonly promptVersion: string;
}

export const VERDICT_MODEL_CLIENT = Symbol('VERDICT_MODEL_CLIENT');
export const MARKET_SIGNALS_PROVIDER = Symbol('MARKET_SIGNALS_PROVIDER');
export const RECOMMENDATIONS_REGISTER_REPOSITORY = Symbol('RECOMMENDATIONS_REGISTER_REPOSITORY');
export const AI_MODE_CONFIG = Symbol('AI_MODE_CONFIG');
