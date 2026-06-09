import type { VerdictModelClient } from './ports';
import type { VerdictInputs } from './types';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = [
  "You are a SEBI-registered Research Analyst's research assistant for Indian equities.",
  'Produce a single research verdict for one symbol from the supplied signals. This is research,',
  'not personalised advice, and must be identical for anyone given the same inputs.',
  'Respond with ONLY a JSON object (no prose, no markdown fences) of exactly this shape:',
  '{"verdict":"BUY|ADD|HOLD|TRIM|EXIT|INSUFFICIENT_EVIDENCE","oneLiner":string<=120,',
  '"shortTermTargetPaise":integer|null,"mediumTermTargetPaise":integer|null,',
  '"longTermTargetPaise":integer|null,"stopLossPaise":integer|null,"confidence":integer 0-100,',
  '"signalNews":"bull|bear|neutral|na","signalFundamentals":"bull|bear|neutral|na",',
  '"signalTechnicals":"bull|bear|neutral|na","rationale":string}',
  'Prices are integer paise (1 rupee = 100 paise). If signals are weak, missing or conflicting,',
  'return INSUFFICIENT_EVIDENCE with null targets and low confidence.',
].join(' ');

function buildUserContent(inputs: VerdictInputs): string {
  const s = inputs.signals;
  return [
    `Symbol: ${inputs.tradingSymbol} (${inputs.exchange})`,
    `Risk grade: ${inputs.riskGrade}`,
    `LTP (paise): ${s.ltpPaise !== null ? s.ltpPaise.toString() : 'unknown'}`,
    `Technicals [${s.technicals}]: ${s.technicalNotes}`,
    `Fundamentals [${s.fundamentals}]: ${s.fundamentalNotes}`,
    `News [${s.news}]: ${s.newsNotes}`,
  ].join('\n');
}

/** Strip a ```json … ``` fence if the model wrapped its JSON. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  return fence ? fence[1]! : trimmed;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

/** Calls the Anthropic Messages API to generate a verdict. JSON parsing/validation is the caller's job. */
export class AnthropicVerdictClient implements VerdictModelClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async complete(inputs: VerdictInputs): Promise<{ model: string; raw: unknown }> {
    const res = await this.fetchImpl(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserContent(inputs) }],
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Anthropic request failed (${res.status})`);
    }
    const body = JSON.parse(text) as AnthropicResponse;
    const out = body.content?.find((c) => c.type === 'text')?.text ?? '';
    const raw: unknown = JSON.parse(stripFences(out));
    return { model: this.model, raw };
  }
}

/** Deterministic offline client — used when ANTHROPIC_API_KEY is unset and in tests. */
export class MockVerdictModelClient implements VerdictModelClient {
  complete(inputs: VerdictInputs): Promise<{ model: string; raw: unknown }> {
    return Promise.resolve({
      model: 'mock',
      raw: {
        verdict: 'INSUFFICIENT_EVIDENCE',
        oneLiner: `${inputs.tradingSymbol}: no live signals yet — awaiting the market-data feed.`,
        shortTermTargetPaise: null,
        mediumTermTargetPaise: null,
        longTermTargetPaise: null,
        stopLossPaise: null,
        confidence: 0,
        signalNews: inputs.signals.news,
        signalFundamentals: inputs.signals.fundamentals,
        signalTechnicals: inputs.signals.technicals,
        rationale:
          'Offline mock model (no ANTHROPIC_API_KEY set or market data not yet wired). Not a research recommendation.',
      },
    });
  }
}
