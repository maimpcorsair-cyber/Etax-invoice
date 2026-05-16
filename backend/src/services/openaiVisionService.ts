import { logger } from '../config/logger';

const apiKey = process.env.OPENAI_API_KEY ?? '';
const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
const defaultModel = process.env.OPENAI_OCR_MODEL ?? 'gpt-4o';
const timeoutMs = Number(process.env.OPENAI_OCR_TIMEOUT_MS ?? 30000);

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
        max_tokens: 2000,
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

// GPT-4o pricing reference (2025): $2.50 per 1M input, $10 per 1M output.
// GPT-4o-mini: $0.15 per 1M input, $0.60 per 1M output.
const OPENAI_INPUT_COST_PER_1M = Number(process.env.OPENAI_INPUT_COST_PER_1M_USD ?? 2.5);
const OPENAI_OUTPUT_COST_PER_1M = Number(process.env.OPENAI_OUTPUT_COST_PER_1M_USD ?? 10);

export function estimateOpenAICostUsd(result: OpenAIVisionCallResult): number {
  const inTok = result.promptTokens ?? 2000;
  const outTok = result.completionTokens ?? 600;
  return (inTok / 1_000_000) * OPENAI_INPUT_COST_PER_1M + (outTok / 1_000_000) * OPENAI_OUTPUT_COST_PER_1M;
}
