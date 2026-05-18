import { logger } from '../config/logger';

const apiKey = process.env.OPENAI_API_KEY ?? '';
const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
// GPT-4o-mini is the default: ~3x faster than gpt-4o for receipt-style OCR
// with comparable accuracy on the structured fields we extract. Override
// via OPENAI_OCR_MODEL=gpt-4o for documents needing full reasoning power.
const defaultModel = process.env.OPENAI_OCR_MODEL ?? 'gpt-4o-mini';
// 90s — must outlast complex multi-page PDF OCR but stay under the
// 120s pipeline-level timeout so we still get a structured 'OpenAI
// failed → fall back to Gemini' log instead of a hard abort.
const timeoutMs = Number(process.env.OPENAI_OCR_TIMEOUT_MS ?? 90000);

export function isOpenAIVisionConfigured(): boolean {
  return !!apiKey;
}

export interface OpenAIVisionCallResult {
  ok: boolean;
  text: string;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
}

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function callOpenAIVision(
  mimeType: string,
  base64Data: string,
  prompt: string,
  model = defaultModel,
): Promise<OpenAIVisionCallResult> {
  const started = Date.now();
  if (!apiKey) {
    return { ok: false, text: '', model, latencyMs: 0, error: 'OPENAI_API_KEY not configured' };
  }

  const isText = mimeType === 'text/plain';
  const messages = isText
    ? [
        { role: 'user', content: `${prompt}\n\nDocument text:\n${Buffer.from(base64Data, 'base64').toString('utf-8')}` },
      ]
    : [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: 'high' } },
            { type: 'text', text: prompt },
          ],
        },
      ];

  try {
    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        // 4000 tokens (~3000 words) — complex multi-page invoices with
        // Thai text + many line items were truncating at 2000, leaving
        // an unparseable JSON. Mini's pricing makes the extra cost
        // negligible (~$0.0006 per call max).
        max_tokens: 4000,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    }, timeoutMs);

    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, text: '', model, latencyMs, error: `OpenAI ${res.status}: ${errText.slice(0, 300)}` };
    }
    const data = await res.json() as {
      choices?: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      ok: true,
      text: data.choices?.[0]?.message?.content ?? '',
      model,
      latencyMs,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('[OpenAI] vision call failed', { error: msg, model });
    return { ok: false, text: '', model, latencyMs, error: msg };
  }
}

// Pricing reference (2026):
//   GPT-4o-mini: $0.15 per 1M input, $0.60 per 1M output  ← current default
//   GPT-4o:      $2.50 per 1M input, $10   per 1M output
// Defaults set for gpt-4o-mini; override if you flip OPENAI_OCR_MODEL.
const OPENAI_INPUT_COST_PER_1M = Number(process.env.OPENAI_INPUT_COST_PER_1M_USD ?? 0.15);
const OPENAI_OUTPUT_COST_PER_1M = Number(process.env.OPENAI_OUTPUT_COST_PER_1M_USD ?? 0.6);

export function estimateOpenAICostUsd(result: OpenAIVisionCallResult): number {
  const inTok = result.promptTokens ?? 2000;
  const outTok = result.completionTokens ?? 600;
  return (inTok / 1_000_000) * OPENAI_INPUT_COST_PER_1M + (outTok / 1_000_000) * OPENAI_OUTPUT_COST_PER_1M;
}
