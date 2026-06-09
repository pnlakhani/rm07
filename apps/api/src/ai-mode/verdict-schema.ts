import { z } from 'zod';
import { AI_SIGNALS, AI_VERDICTS } from '@rm07/core';

const paise = z.number().int().nonnegative().nullable();

/**
 * The exact JSON contract the model must return. Anything off-schema (unknown verdict, confidence
 * out of range, extra fields) is rejected, and the service falls back to INSUFFICIENT_EVIDENCE —
 * the model is never trusted to free-form its way onto an advisory surface.
 */
export const modelVerdictSchema = z
  .object({
    verdict: z.enum(AI_VERDICTS),
    oneLiner: z.string().min(1).max(120),
    shortTermTargetPaise: paise,
    mediumTermTargetPaise: paise,
    longTermTargetPaise: paise,
    stopLossPaise: paise,
    confidence: z.number().int().min(0).max(100),
    signalNews: z.enum(AI_SIGNALS),
    signalFundamentals: z.enum(AI_SIGNALS),
    signalTechnicals: z.enum(AI_SIGNALS),
    rationale: z.string().min(1).max(4000),
  })
  .strict();

export type ModelVerdictParsed = z.infer<typeof modelVerdictSchema>;
