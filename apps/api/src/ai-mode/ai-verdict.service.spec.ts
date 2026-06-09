import { describe, expect, it, vi } from 'vitest';
import { AiVerdictService } from './ai-verdict.service';
import type {
  AiModeConfig,
  MarketSignalsProvider,
  RecommendationsRegisterRepository,
  VerdictModelClient,
} from './ports';

const config: AiModeConfig = {
  raRegistrationNumber: 'RA-123',
  signedBy: 'Hemal Kotak',
  promptVersion: 'v1',
};

const goodRaw = {
  verdict: 'BUY',
  oneLiner: 'Momentum is strong.',
  shortTermTargetPaise: 300000,
  mediumTermTargetPaise: null,
  longTermTargetPaise: null,
  stopLossPaise: 280000,
  confidence: 70,
  signalNews: 'bull',
  signalFundamentals: 'neutral',
  signalTechnicals: 'bull',
  rationale: 'Reasons.',
};

function make(client: VerdictModelClient): {
  service: AiVerdictService;
  record: ReturnType<typeof vi.fn>;
} {
  const signals = {
    getSignals: () =>
      Promise.resolve({
        ltpPaise: null,
        news: 'na',
        fundamentals: 'na',
        technicals: 'na',
        newsNotes: '',
        fundamentalNotes: '',
        technicalNotes: '',
      }),
  } as unknown as MarketSignalsProvider;
  const record = vi.fn().mockResolvedValue(undefined);
  const register = { record } as unknown as RecommendationsRegisterRepository;
  return { service: new AiVerdictService(client, signals, register, config), record };
}

describe('AiVerdictService', () => {
  it('returns a disclosed view and records to the register', async () => {
    const client = {
      complete: () => Promise.resolve({ model: 'claude-sonnet-4-6', raw: goodRaw }),
    } as unknown as VerdictModelClient;
    const { service, record } = make(client);
    const view = await service.getVerdict('NSE', 'RELIANCE');

    expect(view).toMatchObject({
      exchange: 'NSE',
      tradingSymbol: 'RELIANCE',
      verdict: 'BUY',
      confidence: 70,
      model: 'claude-sonnet-4-6',
      raRegistrationNumber: 'RA-123',
    });
    expect(view.targets.shortTermPaise).toBe('300000');
    expect(view.disclaimer.length).toBeGreaterThan(0);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        verdict: 'BUY',
        stTargetPaise: 300000n,
        raRegistrationNumber: 'RA-123',
        signedBy: 'Hemal Kotak',
        promptVersion: 'v1',
      }),
    );
  });

  it('falls back to INSUFFICIENT_EVIDENCE when the model output is off-schema', async () => {
    const client = {
      complete: () => Promise.resolve({ model: 'x', raw: { verdict: 'MAYBE' } }),
    } as unknown as VerdictModelClient;
    const { service, record } = make(client);
    const view = await service.getVerdict('NSE', 'RELIANCE');
    expect(view.verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(view.model).toBe('fallback');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: 'INSUFFICIENT_EVIDENCE' }),
    );
  });

  it('falls back when the model client throws', async () => {
    const client = {
      complete: () => Promise.reject(new Error('boom')),
    } as unknown as VerdictModelClient;
    const { service, record } = make(client);
    const view = await service.getVerdict('NSE', 'TCS');
    expect(view.verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(record).toHaveBeenCalled();
  });
});
