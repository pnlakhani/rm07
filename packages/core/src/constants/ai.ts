/** AI Mode verdict vocabulary (Backend Schema §5.16, Full Doc §III.7.1). */
export const AI_VERDICTS = [
  'BUY',
  'ADD',
  'HOLD',
  'TRIM',
  'EXIT',
  'INSUFFICIENT_EVIDENCE',
] as const;
export type AiVerdict = (typeof AI_VERDICTS)[number];

export const AI_SIGNALS = ['bull', 'bear', 'neutral', 'na'] as const;
export type AiSignal = (typeof AI_SIGNALS)[number];

export const RISK_GRADES = ['low', 'medium', 'high', 'aggressive'] as const;
export type RiskGrade = (typeof RISK_GRADES)[number];

/** Mandatory disclosure rendered under every advisory surface (Hard rule #7). */
export const PERFORMANCE_DISCLAIMER =
  'Past performance and computed targets are not indicative of future returns.';
