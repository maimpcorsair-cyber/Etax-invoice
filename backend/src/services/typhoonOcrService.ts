import { logger } from '../config/logger';

const apiKey = process.env.TYPHOON_API_KEY ?? '';
const baseUrl = process.env.TYPHOON_BASE_URL ?? 'https://api.opentyphoon.ai/v1';
const defaultModel = process.env.TYPHOON_OCR_MODEL ?? 'typhoon-ocr-preview';
const timeoutMs = Number(process.env.TYPHOON_OCR_TIMEOUT_MS ?? 30000);

export function isTyphoonConfigured(): boolean {
  return !!apiKey;
}

export interface TyphoonCallResult {
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

export async function callTyphoonVision(
  mimeType: string,
  base64Data: string,
  prompt: string,
  model = defaultModel,
): Promise<TyphoonCallResult> {
  const started = Date.now();
  if (!apiKey) {
    return { ok: false, text: '', model, latencyMs: 0, error: 'TYPHOON_API_KEY not configured' };
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
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
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
        max_tokens: 2000,
        temperature: 0.1,
      }),
    }, timeoutMs);

    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, text: '', model, latencyMs, error: `Typhoon ${res.status}: ${errText.slice(0, 300)}` };
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
    logger.warn('[Typhoon] call failed', { error: msg, model });
    return { ok: false, text: '', model, latencyMs, error: msg };
  }
}

// Pricing reference (Typhoon-OCR preview, subject to change):
//   ~$0.20 per 1M input tokens, ~$0.60 per 1M output tokens
// We estimate vision images as ~1500 input tokens per page.
const TYPHOON_INPUT_COST_PER_1M = Number(process.env.TYPHOON_INPUT_COST_PER_1M_USD ?? 0.2);
const TYPHOON_OUTPUT_COST_PER_1M = Number(process.env.TYPHOON_OUTPUT_COST_PER_1M_USD ?? 0.6);

export function estimateTyphoonCostUsd(result: TyphoonCallResult): number {
  const inTok = result.promptTokens ?? 1500;
  const outTok = result.completionTokens ?? 500;
  return (inTok / 1_000_000) * TYPHOON_INPUT_COST_PER_1M + (outTok / 1_000_000) * TYPHOON_OUTPUT_COST_PER_1M;
}
