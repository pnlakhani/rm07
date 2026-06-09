import { describe, expect, it } from 'vitest';
import { AnthropicVerdictClient } from './anthropic-client';
import type { VerdictInputs } from './types';

const inputs: VerdictInputs = {
  exchange: 'NSE',
  tradingSymbol: 'RELIANCE',
  riskGrade: 'medium',
  signals: {
    ltpPaise: 290050n,
    news: 'bull',
    fundamentals: 'neutral',
    technicals: 'bull',
    newsNotes: 'n',
    fundamentalNotes: 'f',
    technicalNotes: 't',
  },
};

function fakeFetch(body: unknown, ok = true, status = 200): typeof globalThis.fetch {
  return (async () =>
    ({ ok, status, text: async () => JSON.stringify(body) }) as Response) as unknown as typeof globalThis.fetch;
}

describe('AnthropicVerdictClient', () => {
  it('parses a JSON verdict from the message content', async () => {
    const raw = { verdict: 'BUY', confidence: 70 };
    const client = new AnthropicVerdictClient(
      'key',
      'claude-sonnet-4-6',
      fakeFetch({ content: [{ type: 'text', text: JSON.stringify(raw) }] }),
    );
    const result = await client.complete(inputs);
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.raw).toEqual(raw);
  });

  it('strips a ```json fence around the JSON', async () => {
    const client = new AnthropicVerdictClient(
      'key',
      'm',
      fakeFetch({ content: [{ type: 'text', text: '```json\n{"verdict":"HOLD"}\n```' }] }),
    );
    expect(await client.complete(inputs)).toMatchObject({ raw: { verdict: 'HOLD' } });
  });

  it('throws on a non-OK response', async () => {
    const client = new AnthropicVerdictClient('key', 'm', fakeFetch({}, false, 500));
    await expect(client.complete(inputs)).rejects.toThrow(/Anthropic/u);
  });
});
