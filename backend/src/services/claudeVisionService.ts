import { logger } from '../config/logger';

/**
 * Claude Haiku 4.5 vision OCR.
 *
 * Faster + cheaper than GPT-4o for receipt-style documents while keeping
 * comparable Thai accuracy. Used as the primary escalation provider (in
 * front of the GPT-4o branch) when ANTHROPIC_API_KEY is set.
 *
 * Pricing (2026): Haiku 4.5 = $1 / 1M input, $5 / 1M output. Typical
 * Thai receipt ≈ 1.5k input + 500 output ≈ $0.0040 per call.
 */

const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? '';
const baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1';
const defaultModel = process.env.CLAUDE_OCR_MODEL ?? 'claude-haiku-4-5-20251001';
const timeoutMs = Number(process.env.CLAUDE_OCR_TIMEOUT_MS ?? 30000);

export function isClaudeVisionConfigured(): boolean {
  return !!apiKey;
}

export interface ClaudeVisionCallResult {
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

export async function callClaudeVision(
  mimeType: string,
  base64Data: string,
  prompt: string,
  model = defaultModel,
): Promise<ClaudeVisionCallResult> {
  const started = Date.now();
  if (!apiKey) {
    return { ok: false, text: '', model, latencyMs: 0, error: 'ANTHROPIC_API_KEY not configured' };
  }

  const isText = mimeType === 'text/plain';
  // Claude's API uses a slightly different message shape than OpenAI.
  // The image goes in as a `source` block with media_type + base64 data.
  const content = isText
    ? [{ type: 'text', text: `${prompt}\n\nDocument text:\n${Buffer.from(base64Data, 'base64').toString('utf-8')}` }]
    : [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: base64Data },
        },
        { type: 'text', text: `${prompt}\n\nReturn JSON only — no prose, no markdown fences.` },
      ];

  try {
    const res = await fetchWithTimeout(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        temperature: 0.1,
        messages: [{ role: 'user', content }],
      }),
    }, timeoutMs);

    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, text: '', model, latencyMs, error: `Claude ${res.status}: ${errText.slice(0, 300)}` };
    }
    const data = await res.json() as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    // Strip code fences in case the model wraps the JSON despite our prompt.
    const raw = data.content?.find((c) => c.type === 'text')?.text ?? '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    return {
      ok: true,
      text: cleaned,
      model,
      latencyMs,
      promptTokens: data.usage?.input_tokens,
      completionTokens: data.usage?.output_tokens,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('[Claude] vision call failed', { error: msg, model });
    return { ok: false, text: '', model, latencyMs, error: msg };
  }
}

// Haiku 4.5 pricing (2026): $1 per 1M input, $5 per 1M output.
const CLAUDE_INPUT_COST_PER_1M = Number(process.env.CLAUDE_INPUT_COST_PER_1M_USD ?? 1);
const CLAUDE_OUTPUT_COST_PER_1M = Number(process.env.CLAUDE_OUTPUT_COST_PER_1M_USD ?? 5);

export function estimateClaudeCostUsd(result: ClaudeVisionCallResult): number {
  const inTok = result.promptTokens ?? 1500;
  const outTok = result.completionTokens ?? 500;
  return (inTok / 1_000_000) * CLAUDE_INPUT_COST_PER_1M + (outTok / 1_000_000) * CLAUDE_OUTPUT_COST_PER_1M;
}
