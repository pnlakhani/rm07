import { Inject, Injectable, Logger } from '@nestjs/common';
import { PERFORMANCE_DISCLAIMER, type RiskGrade } from '@rm07/core';
import {
  AI_MODE_CONFIG,
  MARKET_SIGNALS_PROVIDER,
  RECOMMENDATIONS_REGISTER_REPOSITORY,
  VERDICT_MODEL_CLIENT,
  type AiModeConfig,
  type MarketSignalsProvider,
  type RecommendationsRegisterRepository,
  type VerdictModelClient,
} from './ports';
import { modelVerdictSchema, type ModelVerdictParsed } from './verdict-schema';
import type { AiModeVerdictView } from './types';

/** Phase-1 risk grade until instrument-level metadata is wired. */
const DEFAULT_RISK_GRADE: RiskGrade = 'medium';

/** Safe fallback applied whenever the model output is missing or off-schema. */
const INSUFFICIENT: ModelVerdictParsed = {
  verdict: 'INSUFFICIENT_EVIDENCE',
  oneLiner: 'Not enough reliable data to form a view yet.',
  shortTermTargetPaise: null,
  mediumTermTargetPaise: null,
  longTermTargetPaise: null,
  stopLossPaise: null,
  confidence: 0,
  signalNews: 'na',
  signalFundamentals: 'na',
  signalTechnicals: 'na',
  rationale: 'The model output was unavailable or did not meet the required schema; no verdict is asserted.',
};

/**
 * AI Mode verdict pipeline (Full Doc §III.7.1): gather signals → ask the model for a strictly
 * schema-constrained verdict → validate (fallback to INSUFFICIENT_EVIDENCE on any deviation) →
 * append to the immutable recommendations register → return a disclosed, JSON-safe view. The
 * verdict is instrument-level and identical for every user with the same inputs (research, not
 * personalised advice).
 */
@Injectable()
export class AiVerdictService {
  private readonly logger = new Logger(AiVerdictService.name);

  constructor(
    @Inject(VERDICT_MODEL_CLIENT) private readonly client: VerdictModelClient,
    @Inject(MARKET_SIGNALS_PROVIDER) private readonly signals: MarketSignalsProvider,
    @Inject(RECOMMENDATIONS_REGISTER_REPOSITORY)
    private readonly register: RecommendationsRegisterRepository,
    @Inject(AI_MODE_CONFIG) private readonly config: AiModeConfig,
  ) {}

  async getVerdict(exchange: string, tradingSymbol: string): Promise<AiModeVerdictView> {
    const riskGrade = DEFAULT_RISK_GRADE;
    const signals = await this.signals.getSignals(exchange, tradingSymbol);

    let model = 'fallback';
    let parsed: ModelVerdictParsed = INSUFFICIENT;
    try {
      const result = await this.client.complete({ exchange, tradingSymbol, riskGrade, signals });
      model = result.model;
      parsed = modelVerdictSchema.parse(result.raw);
    } catch (err) {
      this.logger.warn(
        `Verdict fell back to INSUFFICIENT_EVIDENCE: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      model = 'fallback';
      parsed = INSUFFICIENT;
    }

    const toBig = (n: number | null): bigint | null => (n !== null ? BigInt(n) : null);
    await this.register.record({
      exchange,
      tradingSymbol,
      verdict: parsed.verdict,
      oneLiner: parsed.oneLiner,
      stTargetPaise: toBig(parsed.shortTermTargetPaise),
      mtTargetPaise: toBig(parsed.mediumTermTargetPaise),
      ltTargetPaise: toBig(parsed.longTermTargetPaise),
      stopLossPaise: toBig(parsed.stopLossPaise),
      confidence: parsed.confidence,
      signalNews: parsed.signalNews,
      signalFundamentals: parsed.signalFundamentals,
      signalTechnicals: parsed.signalTechnicals,
      riskGrade,
      rationale: parsed.rationale,
      model,
      promptVersion: this.config.promptVersion,
      raRegistrationNumber: this.config.raRegistrationNumber,
      signedBy: this.config.signedBy,
    });

    const toStr = (n: number | null): string | null => (n !== null ? n.toString() : null);
    return {
      exchange,
      tradingSymbol,
      verdict: parsed.verdict,
      oneLiner: parsed.oneLiner,
      targets: {
        shortTermPaise: toStr(parsed.shortTermTargetPaise),
        mediumTermPaise: toStr(parsed.mediumTermTargetPaise),
        longTermPaise: toStr(parsed.longTermTargetPaise),
      },
      stopLossPaise: toStr(parsed.stopLossPaise),
      confidence: parsed.confidence,
      signals: {
        news: parsed.signalNews,
        fundamentals: parsed.signalFundamentals,
        technicals: parsed.signalTechnicals,
      },
      riskGrade,
      rationale: parsed.rationale,
      model,
      raRegistrationNumber: this.config.raRegistrationNumber,
      disclaimer: PERFORMANCE_DISCLAIMER,
      at: new Date().toISOString(),
    };
  }
}
