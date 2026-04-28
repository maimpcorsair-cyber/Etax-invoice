import { logger } from '../config/logger';

const endpoint = (process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ?? '').replace(/\/$/, '');
const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY ?? '';
const apiVersion = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? '2024-11-30';
const timeoutMs = Number(process.env.AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS ?? 45000);

type AzureField = {
  type?: string;
  content?: string;
  valueString?: string;
  valueDate?: string;
  valueNumber?: number;
  valueCurrency?: { amount?: number; currencyCode?: string };
};

type AzureAnalyzeResult = {
  content?: string;
  documents?: Array<{ fields?: Record<string, AzureField>; confidence?: number }>;
};

export interface AzureDocumentResult {
  ok: boolean;
  modelId: string;
  content: string;
  fields: Record<string, unknown>;
  confidence?: number;
  error?: string;
}

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function fieldValue(field?: AzureField): unknown {
  if (!field) return undefined;
  return field.valueString ?? field.valueDate ?? field.valueNumber ?? field.valueCurrency?.amount ?? field.content;
}

export function isAzureDocumentIntelligenceConfigured() {
  return !!endpoint && !!key;
}

export async function analyzeAccountingDocumentWithAzure(
  fileBase64: string,
  mimeType: string,
): Promise<AzureDocumentResult | null> {
  if (!isAzureDocumentIntelligenceConfigured()) return null;

  const modelId = process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID ?? 'prebuilt-invoice';
  const url = `${endpoint}/documentintelligence/documentModels/${modelId}:analyze?api-version=${apiVersion}`;
  const buffer = Buffer.from(fileBase64, 'base64');

  try {
    const start = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': mimeType === 'text/plain' ? 'text/plain' : mimeType,
      },
      body: buffer,
    }, timeoutMs);

    if (!start.ok) {
      const text = await start.text();
      return { ok: false, modelId, content: '', fields: {}, error: `Azure start ${start.status}: ${text.slice(0, 300)}` };
    }

    const operationLocation = start.headers.get('operation-location') ?? start.headers.get('Operation-Location');
    if (!operationLocation) {
      return { ok: false, modelId, content: '', fields: {}, error: 'Azure did not return operation-location' };
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const poll = await fetchWithTimeout(operationLocation, {
        headers: { 'Ocp-Apim-Subscription-Key': key },
      }, Math.max(3000, deadline - Date.now()));

      if (!poll.ok) {
        const text = await poll.text();
        return { ok: false, modelId, content: '', fields: {}, error: `Azure poll ${poll.status}: ${text.slice(0, 300)}` };
      }

      const json = await poll.json() as { status?: string; analyzeResult?: AzureAnalyzeResult; error?: { message?: string } };
      if (json.status === 'succeeded') {
        const document = json.analyzeResult?.documents?.[0];
        const rawFields = document?.fields ?? {};
        const fields = Object.fromEntries(Object.entries(rawFields).map(([name, field]) => [name, fieldValue(field)]));
        return {
          ok: true,
          modelId,
          content: json.analyzeResult?.content ?? '',
          fields,
          confidence: document?.confidence,
        };
      }

      if (json.status === 'failed') {
        return { ok: false, modelId, content: '', fields: {}, error: json.error?.message ?? 'Azure analysis failed' };
      }
    }

    return { ok: false, modelId, content: '', fields: {}, error: 'Azure analysis timed out' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[Azure DI] analyze failed', { error: message, modelId, mimeType });
    return { ok: false, modelId, content: '', fields: {}, error: message };
  }
}
