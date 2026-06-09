import type { AiSignal, AiVerdict, RiskGrade } from '@rm07/core';

/**
 * Market signals fed into the verdict prompt. Phase 1: supplied by a stub provider. Phase 2: a
 * Dhan-historical-backed provider computes the real technicals (RSI/MACD/EMA/Bollinger/S-R),
 * fundamentals and 24h news sentiment.
 */
export interface MarketSignals {
  readonly ltpPaise: bigint | null;
  readonly news: AiSignal;
  readonly fundamentals: AiSignal;
  readonly technicals: AiSignal;
  /** Short human-readable notes per signal, included verbatim in the prompt. */
  readonly newsNotes: string;
  readonly fundamentalNotes: string;
  readonly technicalNotes: string;
}

export interface VerdictInputs {
  readonly exchange: string;
  readonly tradingSymbol: string;
  readonly riskGrade: RiskGrade;
  readonly signals: MarketSignals;
}

/** The structured verdict the model must return (validated by Zod; paise as integers). */
export interface ModelVerdict {
  readonly verdict: AiVerdict;
  readonly oneLiner: string;
  readonly shortTermTargetPaise: number | null;
  readonly mediumTermTargetPaise: number | null;
  readonly longTermTargetPaise: number | null;
  readonly stopLossPaise: number | null;
  readonly confidence: number;
  readonly signalNews: AiSignal;
  readonly signalFundamentals: AiSignal;
  readonly signalTechnicals: AiSignal;
  readonly rationale: string;
}

/** JSON-safe verdict returned to the client (paise as strings, timestamp ISO). */
export interface AiModeVerdictView {
  readonly exchange: string;
  readonly tradingSymbol: string;
  readonly verdict: AiVerdict;
  readonly oneLiner: string;
  readonly targets: {
    readonly shortTermPaise: string | null;
    readonly mediumTermPaise: string | null;
    readonly longTermPaise: string | null;
  };
  readonly stopLossPaise: string | null;
  readonly confidence: number;
  readonly signals: {
    readonly news: AiSignal;
    readonly fundamentals: AiSignal;
    readonly technicals: AiSignal;
  };
  readonly riskGrade: RiskGrade;
  readonly rationale: string;
  readonly model: string;
  readonly raRegistrationNumber: string;
  readonly disclaimer: string;
  readonly at: string;
}
