import { describe, expect, it } from 'vitest';
import { modelVerdictSchema } from './verdict-schema';

const valid = {
  verdict: 'BUY',
  oneLiner: 'Strong momentum into the quarter.',
  shortTermTargetPaise: 300000,
  mediumTermTargetPaise: 320000,
  longTermTargetPaise: 350000,
  stopLossPaise: 280000,
  confidence: 72,
  signalNews: 'bull',
  signalFundamentals: 'neutral',
  signalTechnicals: 'bull',
  rationale: 'Earnings momentum and a bullish technical setup.',
};

describe('modelVerdictSchema', () => {
  it('accepts a well-formed verdict', () => {
    expect(modelVerdictSchema.safeParse(valid).success).toBe(true);
  });

  it('allows null targets (e.g. INSUFFICIENT_EVIDENCE)', () => {
    const r = modelVerdictSchema.safeParse({
      ...valid,
      verdict: 'INSUFFICIENT_EVIDENCE',
      shortTermTargetPaise: null,
      mediumTermTargetPaise: null,
      longTermTargetPaise: null,
      stopLossPaise: null,
      confidence: 0,
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown verdict', () => {
    expect(modelVerdictSchema.safeParse({ ...valid, verdict: 'MAYBE' }).success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    expect(modelVerdictSchema.safeParse({ ...valid, confidence: 150 }).success).toBe(false);
  });

  it('rejects an unknown signal value', () => {
    expect(modelVerdictSchema.safeParse({ ...valid, signalNews: 'super-bull' }).success).toBe(false);
  });

  it('rejects extra fields and over-long one-liners', () => {
    expect(modelVerdictSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(modelVerdictSchema.safeParse({ ...valid, oneLiner: 'x'.repeat(200) }).success).toBe(false);
  });
});
