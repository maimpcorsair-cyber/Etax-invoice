import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import redis from '../config/redis';
import { logger } from '../config/logger';
import { analyzeAccountingDocumentWithAzure, isAzureDocumentIntelligenceConfigured } from './azureDocumentService';
import { callTyphoonVision, estimateTyphoonCostUsd, isTyphoonConfigured } from './typhoonOcrService';
import { callOpenAIVision, estimateOpenAICostUsd, isOpenAIVisionConfigured } from './openaiVisionService';
import { recordOcrBenchmark } from './ocrBenchmarkService';
import { getOcrPolicyForCompany } from './ocrPolicyService';

const engineRouting = (process.env.OCR_ENGINE_ROUTING ?? 'auto') as 'legacy' | 'auto' | 'premium';
const THAI_HEAVY_TYPES = new Set<OcrResult['documentType']>([
  'receipt',
  'expense_receipt',
  'bank_transfer',
  'bank_statement',
  'payment_advice',
  'withholding_tax',
]);

// Plan-based OCR policy is resolved per company via ocrPolicyService.
// Tier mapping: starter=standard (Azure+Gemini), business=enhanced (+Typhoon),
// enterprise=premium (+GPT-4o). Over-quota fallbacks happen silently.

function ocrResultFieldScore(result: OcrResult): number {
  let score = 0;
  if (result.supplierName) score += 2;
  if (result.supplierTaxId) score += 1;
  if (result.invoiceNumber) score += 2;
  if (result.invoiceDate) score += 1;
  if (result.total > 0) score += 2;
  if (result.subtotal > 0) score += 1;
  if (result.vatAmount > 0) score += 1;
  if ((result.validationWarnings?.length ?? 0) === 0) score += 1;
  return score;
}

function pickBestResult(a: OcrResult, b: OcrResult): OcrResult {
  return ocrResultFieldScore(b) > ocrResultFieldScore(a) ? b : a;
}

const apiKey = process.env.OPENROUTER_API_KEY ?? '';
const baseUrl = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
const googleAiKey = process.env.GOOGLE_AI_API_KEY ?? '';
const chatTimeoutMs = Number(process.env.AI_CHAT_TIMEOUT_MS ?? 12000);
const ocrTimeoutMs = Number(process.env.AI_OCR_TIMEOUT_MS ?? 30000);
const geminiFastModel = process.env.GOOGLE_AI_OCR_FAST_MODEL ?? process.env.GOOGLE_AI_OCR_MODEL ?? 'gemini-2.5-flash-lite';
const geminiScanModel = process.env.GOOGLE_AI_OCR_SCAN_MODEL ?? process.env.GOOGLE_AI_OCR_MODEL ?? 'gemini-2.5-flash';
const geminiProVerifyModel = process.env.GOOGLE_AI_OCR_PRO_VERIFY_MODEL ?? 'gemini-2.5-pro';
const proVerifyEnabled = process.env.AI_OCR_PRO_VERIFY_ENABLED !== 'false';
const companyContextCacheTtl = Number(process.env.AI_COMPANY_CONTEXT_CACHE_TTL ?? 30);
const companyContextCache = new Map<string, { expiresAt: number; value: string }>();

const VISION_MODELS = [
  process.env.OPENROUTER_OCR_MODEL,
  process.env.OPENROUTER_VISION_MODEL,
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'baidu/qianfan-ocr-fast:free',
  'google/gemma-4-26b-a4b-it:free',
].filter(Boolean) as string[];

const CHAT_MODELS = [
  process.env.OPENROUTER_CHAT_MODEL,
  process.env.OPENROUTER_CHAT_FALLBACK_MODEL,
  'google/gemini-2.5-flash-lite',
  'openai/gpt-4.1-mini',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
].filter(Boolean) as string[];

// PDF-capable models — Gemini on OpenRouter accepts application/pdf via image_url
const PDF_MODELS = [
  process.env.OPENROUTER_OCR_PDF_MODEL,
  'google/gemini-2.0-flash-lite-001',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.0-flash-001',
].filter(Boolean) as string[];

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Call Google Gemini API directly — supports text, image/jpeg, image/png, and application/pdf inline
// Free-tier Gemini quota resets daily but burns through fast under heavy
// testing. When a model hits 429, skip subsequent calls for COOLDOWN_SECONDS
// so we don't waste a network roundtrip per request waiting for the same
// quota error. The flag auto-expires so the model is silently re-enabled
// once Google's quota window rolls over.
const GEMINI_QUOTA_COOLDOWN_SECONDS = Number(process.env.GEMINI_QUOTA_COOLDOWN_SECONDS ?? 600);

async function isGeminiModelOnCooldown(model: string): Promise<boolean> {
  try {
    return (await redis.exists(`gemini:cooldown:${model}`)) > 0;
  } catch {
    return false; // redis down → fail open, attempt the call
  }
}

async function markGeminiModelCooldown(model: string, reason: string): Promise<void> {
  try {
    await redis.set(`gemini:cooldown:${model}`, reason, 'EX', GEMINI_QUOTA_COOLDOWN_SECONDS);
    logger.warn('[Gemini] model on cooldown', { model, seconds: GEMINI_QUOTA_COOLDOWN_SECONDS, reason });
  } catch {
    /* fail open */
  }
}

async function callGemini(
  mimeType: string,
  base64Data: string,
  prompt: string,
  timeoutMs = ocrTimeoutMs,
  model = geminiScanModel,
): Promise<string> {
  if (await isGeminiModelOnCooldown(model)) {
    throw new Error(`Gemini ${model} on cooldown (recent 429) — skipping call`);
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleAiKey}`;
  const parts = mimeType === 'text/plain'
    ? [
        { text: prompt },
        { text: `Document text:\n${Buffer.from(base64Data, 'base64').toString('utf-8')}` },
      ]
    : [
        { inline_data: { mime_type: mimeType, data: base64Data } },
        { text: prompt },
      ];
  const body = {
    contents: [{ parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8000, responseMimeType: 'application/json' },
    // Defaults block financial / PII-containing images (e.g. bank slips with
    // account numbers, ID-like numbers). For an OCR use case this is the
    // wrong default — set every category to BLOCK_NONE so we get the text.
    safetySettings: [
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    ],
  };
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs);
  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) {
      // Quota hit — mark this model on cooldown so subsequent OCR requests
      // skip the network call entirely until the quota window resets.
      await markGeminiModelCooldown(model, `429 quota`);
    }
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
  }
  type GeminiResponse = {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
      safetyRatings?: Array<{ category: string; probability: string; blocked?: boolean }>;
    }>;
    promptFeedback?: { blockReason?: string; safetyRatings?: Array<{ category: string; probability: string }> };
  };
  const data = await res.json() as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    // Empty response — surface why so we can fix the right thing.
    const promptBlock = data.promptFeedback?.blockReason;
    const candidateFinish = data.candidates?.[0]?.finishReason;
    const blockedRatings = (data.candidates?.[0]?.safetyRatings ?? []).filter((r) => r.blocked);
    logger.warn('[Gemini] empty response', {
      model, mimeType,
      promptBlockReason: promptBlock,
      candidateFinishReason: candidateFinish,
      blockedRatings: blockedRatings.map((r) => `${r.category}:${r.probability}`),
    });
    if (promptBlock || candidateFinish === 'SAFETY' || blockedRatings.length > 0) {
      throw new Error(`Gemini blocked: ${promptBlock ?? candidateFinish ?? 'safety'}`);
    }
  }
  return text;
}

export interface OcrResult {
  documentType:
    | 'tax_invoice'
    | 'receipt'
    | 'invoice'
    | 'billing_note'
    | 'withholding_tax'
    | 'payment_advice'
    | 'bank_transfer'
    | 'bank_statement'
    | 'quotation'
    | 'purchase_order'
    | 'delivery_note'
    | 'expense_receipt'
    | 'contract'
    | 'credit_note'
    | 'debit_note'
    | 'other';
  documentTypeLabel: string;
  supplierName: string;
  supplierTaxId: string;
  supplierBranch: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  subtotal: number;
  vatAmount: number;
  total: number;
  confidence: 'high' | 'medium' | 'low';
  rawText?: string;
  validationWarnings?: string[];
  extractionProvider?: string;
  verificationStage?: 'fast' | 'pro' | 'fallback';
  needsHumanReview?: boolean;
  expenseCategory?:
    | 'toll'
    | 'fuel'
    | 'parking'
    | 'utilities'
    | 'telecom'
    | 'shipping'
    | 'meals'
    | 'travel'
    | 'hotel'
    | 'software'
    | 'marketplace'
    | 'office_supplies'
    | 'bank_fee'
    | 'professional_service'
    | 'rent'
    | 'repair_maintenance'
    | 'medical'
    | 'government_fee'
    | 'other';
  expenseSubcategory?: string;
  taxTreatment?: 'input_vat_claimable' | 'vat_exempt' | 'non_deductible' | 'needs_review';
  postingSuggestion?: string;
  payment?: {
    amount?: number;
    paidAt?: string;
    bankName?: string;
    fromName?: string;
    fromAccount?: string;
    toName?: string;
    toAccount?: string;
    reference?: string;
    direction?: 'incoming' | 'outgoing' | 'unknown';
  };
  documentMetadata?: {
    buyerName?: string;
    buyerTaxId?: string;
    sellerName?: string;
    sellerTaxId?: string;
    currency?: string;
    dueDate?: string;
    purchaseOrderNumber?: string;
    quotationNumber?: string;
    deliveryNoteNumber?: string;
    withholdingTaxAmount?: number;
    withholdingTaxRate?: number;
    withholdingTaxIncomeType?: string;
    withholdingTaxGrossAmount?: number;
    withholdingTaxPayerName?: string;
    withholdingTaxPayerTaxId?: string;
    withholdingTaxRecipientName?: string;
    withholdingTaxRecipientTaxId?: string;
    description?: string;
  };
  // Foreign currency support. When set, subtotal/vatAmount/total are the
  // THB-equivalent values (after applying exchangeRate). The original-
  // currency amounts are preserved here for display + audit.
  originalCurrency?: string;     // e.g. 'USD', 'EUR', 'JPY', 'THB'
  exchangeRate?: number;          // 1 unit of originalCurrency in THB
  exchangeRateSource?: 'document' | 'cache' | 'fx_api' | 'fallback' | 'manual';
  originalTotal?: number;
  originalSubtotal?: number;
  originalVatAmount?: number;
}

interface OcrOptions {
  pageCount?: number;
  source?: 'text_pdf' | 'scan_pdf' | 'image' | 'text' | 'unknown';
  qrText?: string;
  companyId?: string;
  intakeId?: string;
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export function getOcrProductionReadiness() {
  const hasAzure = isAzureDocumentIntelligenceConfigured();
  const hasGemini = !!googleAiKey;
  const hasOpenRouter = !!apiKey;
  const usingFreeOpenRouterFallback = VISION_MODELS.some(model => /:free\b/.test(model))
    || CHAT_MODELS.some(model => /:free\b/.test(model))
    || PDF_MODELS.some(model => /:free\b/.test(model));
  const missingEnv = [
    hasAzure ? null : 'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT',
    hasAzure ? null : 'AZURE_DOCUMENT_INTELLIGENCE_KEY',
    hasGemini ? null : 'GOOGLE_AI_API_KEY',
  ].filter(Boolean) as string[];
  const warnings = [
    hasAzure ? null : 'Azure Document Intelligence is not configured; invoice extraction will rely more on vision LLMs.',
    hasGemini ? null : 'Google Gemini API is not configured; OCR verification/escalation quality will be lower.',
    usingFreeOpenRouterFallback ? 'OpenRouter free fallback models are present; useful for dev, not recommended as the main production OCR path.' : null,
    proVerifyEnabled ? null : 'Gemini Pro verification is disabled by AI_OCR_PRO_VERIFY_ENABLED=false.',
  ].filter(Boolean) as string[];

  return {
    productionReady: hasAzure && hasGemini && proVerifyEnabled,
    tier: hasAzure && hasGemini && proVerifyEnabled ? 'paid_ocr_plus_llm_verify' : hasGemini ? 'llm_verify_only' : hasOpenRouter ? 'fallback_only' : 'not_configured',
    providers: {
      azureDocumentIntelligence: hasAzure,
      googleGemini: hasGemini,
      openRouterFallback: hasOpenRouter,
      openRouterFreeFallbackPresent: usingFreeOpenRouterFallback,
    },
    models: {
      fastTextOrPdf: geminiFastModel,
      scanImageOrPdf: geminiScanModel,
      proEscalation: proVerifyEnabled ? geminiProVerifyModel : null,
    },
    routing: {
      primary: hasAzure ? 'Azure Document Intelligence prebuilt invoice + Gemini verify' : hasGemini ? 'Gemini direct OCR + rule validation' : 'OpenRouter fallback',
      escalation: proVerifyEnabled && hasGemini ? 'Gemini Pro when confidence low, multi-page, missing critical fields, or validation warnings exist' : 'disabled',
      safeguards: ['VAT arithmetic', 'Thai tax ID checksum', 'duplicate supplierTaxId+invoiceNumber', 'bank slip reclassification', 'vendor memory', 'human approval before save'],
    },
    missingEnv,
    warnings,
    estimatedCostControl: {
      defaultPath: 'Use Azure/Gemini Flash for most documents.',
      expensivePath: 'Use Pro only on low-confidence, multi-page, missing-field, or mismatched-total documents.',
      suggestedPackagePolicy: 'Include a document quota per package and charge extra OCR credits for overage or Pro-escalated documents.',
    },
  };
}

async function callOpenRouter(
  models: string[],
  messages: OpenRouterMessage[],
  maxTokens = 1000,
  timeoutMs = chatTimeoutMs,
): Promise<string> {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  let lastError = '';
  for (const model of models) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://etax-invoice.vercel.app',
          'X-Title': 'Billboy e-Tax Invoice',
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2 }),
      }, timeoutMs);
      if (response.ok) {
        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        return data.choices[0]?.message?.content ?? '';
      }
      const text = await response.text();
      lastError = `${model}: ${response.status} ${text}`;
      logger.warn('[AI] Model unavailable, trying next', { model, status: response.status });
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
      logger.warn('[AI] Model error, trying next', { model, error: lastError });
    }
  }
  throw new Error(`All models failed. Last error: ${lastError}`);
}

function hasUsefulOcrData(result: OcrResult) {
  return !!(result.supplierName || result.invoiceNumber || result.total || result.vatAmount || result.rawText);
}

/**
 * Compare a primary OCR result against a verify-pass result on the
 * accounting-critical fields. Returns Thai-language warnings for any
 * disagreement big enough to matter — caller appends them to
 * `validationWarnings` and sets `needsHumanReview=true`.
 *
 * Philosophy: the verify model (Gemini Pro / GPT-4o) is usually right
 * when it disagrees with the primary, so we keep its values as canonical.
 * But silently overwriting hides the divergence from the user — they
 * might know the primary's reading was correct from context the OCR
 * can't see. Surfacing the disagreement lets the human be the judge.
 */
function detectOcrDisagreement(primary: OcrResult, verify: OcrResult): string[] {
  const warnings: string[] = [];

  const norm = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const digits = (s: string | undefined) => (s ?? '').replace(/\D/g, '');

  if (primary.documentType !== verify.documentType) {
    warnings.push(`ประเภทเอกสารต่างกัน: primary=${primary.documentType} vs verify=${verify.documentType}`);
  }

  const ptid = digits(primary.supplierTaxId);
  const vtid = digits(verify.supplierTaxId);
  if (ptid && vtid && ptid !== vtid) {
    warnings.push(`เลขผู้เสียภาษีต่างกัน: ${ptid} vs ${vtid}`);
  }

  if (primary.invoiceNumber && verify.invoiceNumber && norm(primary.invoiceNumber) !== norm(verify.invoiceNumber)) {
    warnings.push(`เลขที่เอกสารต่างกัน: ${primary.invoiceNumber} vs ${verify.invoiceNumber}`);
  }

  if (primary.invoiceDate && verify.invoiceDate && primary.invoiceDate !== verify.invoiceDate) {
    warnings.push(`วันที่ต่างกัน: ${primary.invoiceDate} vs ${verify.invoiceDate}`);
  }

  // Supplier name: loose match — verify often expands abbreviations
  // ("GAC" vs "GULF AGENCY COMPANY") which is not a real disagreement.
  // Only flag when neither contains the other AND both are non-trivial.
  const pn = norm(primary.supplierName);
  const vn = norm(verify.supplierName);
  if (pn && vn && pn.length > 3 && vn.length > 3 && !pn.includes(vn) && !vn.includes(pn)) {
    warnings.push(`ชื่อผู้ขายต่างกัน: "${primary.supplierName}" vs "${verify.supplierName}"`);
  }

  // Numeric tolerance: 1% relative or 1 unit absolute. Real OCR drift on
  // VAT calculations (rounding) is fine; a 10x difference is a problem.
  const numbersDisagree = (a: number, b: number) => {
    if (!a && !b) return false;
    if (!a || !b) return true;
    const diff = Math.abs(a - b);
    const rel = diff / Math.max(a, b);
    return diff > 1 && rel > 0.01;
  };
  if (numbersDisagree(primary.total, verify.total)) {
    warnings.push(`ยอดรวมต่างกัน: ${primary.total.toLocaleString()} vs ${verify.total.toLocaleString()}`);
  }
  if (numbersDisagree(primary.vatAmount, verify.vatAmount)) {
    warnings.push(`ยอด VAT ต่างกัน: ${primary.vatAmount.toLocaleString()} vs ${verify.vatAmount.toLocaleString()}`);
  }

  // Currency: distinct ISO codes are a hard disagreement.
  const pc = (primary.originalCurrency ?? 'THB').toUpperCase();
  const vc = (verify.originalCurrency ?? 'THB').toUpperCase();
  if (pc !== vc) {
    warnings.push(`สกุลเงินต่างกัน: ${pc} vs ${vc}`);
  }

  return warnings;
}

function paymentAmountFromOcr(result: OcrResult) {
  return Number(result.payment?.amount ?? result.total ?? 0);
}

function isValidThaiTaxId(taxId: string) {
  const digits = taxId.replace(/\D/g, '');
  if (digits.length !== 13) return false;
  const sum = digits.slice(0, 12).split('').reduce((acc, digit, index) => acc + Number(digit) * (13 - index), 0);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(digits[12]);
}

function validateOcrResult(result: OcrResult): string[] {
  const warnings: string[] = [];
  const documentTypesRequiringTaxId = new Set<OcrResult['documentType']>(['tax_invoice', 'invoice', 'receipt', 'expense_receipt']);
  if (result.supplierTaxId && !isValidThaiTaxId(result.supplierTaxId)) {
    warnings.push('เลขผู้เสียภาษีอาจไม่ถูกต้องตาม checksum');
  }
  if (!result.supplierTaxId && documentTypesRequiringTaxId.has(result.documentType) && result.vatAmount > 0) {
    warnings.push('เอกสารมี VAT แต่ไม่พบเลขผู้เสียภาษีผู้ขาย');
  }
  if (result.subtotal > 0 && result.vatAmount > 0) {
    const expectedVat = Math.round(result.subtotal * 0.07 * 100) / 100;
    if (Math.abs(expectedVat - result.vatAmount) > 1) {
      warnings.push('ยอด VAT ไม่ตรงกับ 7% ของยอดก่อนภาษี');
    }
  }
  if (result.subtotal > 0 && result.vatAmount >= 0 && result.total > 0) {
    const expectedTotal = Math.round((result.subtotal + result.vatAmount) * 100) / 100;
    if (Math.abs(expectedTotal - result.total) > 1) {
      warnings.push('ยอดรวมไม่ตรงกับยอดก่อนภาษี + VAT');
    }
  }
  return warnings;
}

/**
 * Normalize a Thai/English supplier name for matching across slight
 * variations like 'บริษัท XYZ จำกัด' vs 'XYZ Co.,Ltd.' vs 'XYZ จก.' vs
 * '  XYZ  ' that all refer to the same vendor.
 */
function normalizeVendorName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    // Strip common Thai business suffixes
    .replace(/\bบริษัท\b/g, '')
    .replace(/\b(จำกัด|จก\.?|มหาชน|หจก\.?|ห้างหุ้นส่วนจำกัด)\b/g, '')
    // Strip common English business suffixes
    .replace(/\b(co\.?,?\s*ltd\.?|company\s+limited|limited|inc\.?|ltd\.?|llc|gmbh)\b/g, '')
    // Strip parenthesized content like "(สำนักงานใหญ่)" / "(head office)"
    .replace(/[([{][^)\]}]*[)\]}]/g, '')
    // Collapse all whitespace + remove punctuation/symbols (Thai keeps its chars)
    .replace(/[.,;:!?'"`~@#$%^&*+=|\\/<>_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Simple trigram-based similarity score 0..1 used for fuzzy vendor lookup. */
function vendorSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const trigrams = (s: string) => {
    const set = new Set<string>();
    if (s.length < 3) { set.add(s); return set; }
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const g of ta) if (tb.has(g)) overlap += 1;
  return overlap / Math.max(ta.size, tb.size);
}

async function buildOcrVendorMemoryContext(companyId?: string) {
  if (!companyId) return '';
  try {
    const rows = await prisma.purchaseInvoice.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: {
        supplierName: true,
        supplierTaxId: true,
        supplierBranch: true,
        category: true,
        vatType: true,
        subtotal: true,
        vatAmount: true,
        total: true,
      },
    });
    if (!rows.length) return '';

    const byVendor = new Map<string, {
      supplierName: string;
      supplierTaxId: string;
      supplierBranch: string | null;
      category: string | null;
      vatType: string;
      count: number;
      lastTotal: number;
      lastVatAmount: number;
    }>();
    for (const row of rows) {
      const hasValidTaxId = row.supplierTaxId && row.supplierTaxId !== '0000000000000';
      const key = hasValidTaxId
        ? row.supplierTaxId
        : (normalizeVendorName(row.supplierName) || row.supplierName.trim().toLowerCase());
      const existing = byVendor.get(key);
      if (existing) {
        existing.count += 1;
        // Promote category if previously missing — recurring vendor convergence
        if (!existing.category && row.category) existing.category = row.category;
        continue;
      }
      byVendor.set(key, {
        supplierName: row.supplierName,
        supplierTaxId: row.supplierTaxId,
        supplierBranch: row.supplierBranch,
        category: row.category,
        vatType: row.vatType,
        count: 1,
        lastTotal: row.total,
        lastVatAmount: row.vatAmount,
      });
    }

    const vendors = [...byVendor.values()].slice(0, 20);
    return `\n\nCompany vendor memory from approved/saved purchase documents. Use only as a hint; visible document text wins if it conflicts:\n${JSON.stringify(vendors, null, 2)}`;
  } catch (err) {
    logger.warn('[OCR] Vendor memory load failed', { error: err instanceof Error ? err.message : String(err) });
    return '';
  }
}

interface KnownVendor {
  supplierName: string;
  supplierTaxId: string;
  supplierBranch: string | null;
  category: string | null;
  vatType: string;
}

interface VendorContact {
  supplierName: string;
  supplierTaxId: string;
  supplierBranch: string;
}

/**
 * Look up a vendor in the company's Customer (contacts) table by tax-id.
 * This table is user-curated and authoritative — when the user types
 * "GULF AGENCY COMPANY (THAILAND) LTD." in their contacts, that's the
 * canonical name we should display, not whatever the LLM read off a
 * messy PDF header ("Gac").
 *
 * Only suppliers (partyRole = supplier|both) and active rows are returned.
 */
async function findVendorContact(companyId: string, supplierTaxId: string): Promise<VendorContact | null> {
  if (!supplierTaxId || supplierTaxId === '0000000000000') return null;
  try {
    const row = await prisma.customer.findFirst({
      where: {
        companyId,
        taxId: supplierTaxId,
        isActive: true,
        partyRole: { in: ['supplier', 'both'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { nameTh: true, nameEn: true, taxId: true, branchCode: true },
    });
    if (!row) return null;
    return {
      supplierName: row.nameTh || row.nameEn || '',
      supplierTaxId: row.taxId,
      supplierBranch: row.branchCode || '00000',
    };
  } catch (err) {
    logger.warn('[OCR] Vendor contact lookup failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Find a vendor in this company's PurchaseInvoice history using multiple
 * lookup strategies, in priority order:
 *   1. Exact tax-id (most reliable when present)
 *   2. Normalized supplier name exact match
 *   3. Trigram similarity ≥ 0.65 against any vendor seen in the last 200 docs
 *
 * Returns the most recent matching record so the latest user-confirmed
 * category/vatType always wins over older entries.
 */
async function findKnownVendor(companyId: string, supplierTaxId: string, supplierName: string): Promise<KnownVendor | null> {
  const hasTaxId = supplierTaxId && supplierTaxId !== '0000000000000';
  if (hasTaxId) {
    const byTaxId = await prisma.purchaseInvoice.findFirst({
      where: { companyId, supplierTaxId },
      orderBy: { createdAt: 'desc' },
      select: { supplierName: true, supplierTaxId: true, supplierBranch: true, category: true, vatType: true },
    });
    if (byTaxId) return byTaxId;
  }
  const normalizedQuery = normalizeVendorName(supplierName);
  if (!normalizedQuery) return null;
  const recent = await prisma.purchaseInvoice.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { supplierName: true, supplierTaxId: true, supplierBranch: true, category: true, vatType: true },
  });
  let best: { row: KnownVendor; score: number } | null = null;
  for (const row of recent) {
    const score = vendorSimilarity(normalizedQuery, normalizeVendorName(row.supplierName));
    if (score >= 0.65 && (!best || score > best.score)) {
      best = { row, score };
      if (score === 1) break; // perfect match — stop searching
    }
  }
  return best?.row ?? null;
}

/**
 * Convert a foreign-currency invoice to THB so the rest of the system
 * (PurchaseInvoice rows, Flex cards, accounting reports) can use the
 * THB-equivalent amounts uniformly.
 *
 * - If documentMetadata.currency is THB (or missing), no-op
 * - originalTotal/originalSubtotal/originalVatAmount preserved on the
 *   result for display + audit
 * - exchangeRate priority: rate printed on document > FX API > fallback
 * - subtotal/vatAmount/total are REPLACED with the THB-converted values
 */
/**
 * Defensive scan of rawText for currency markers the LLM may have missed.
 * Real-world case: OpenRouter fallback returned originalCurrency='THB' on a
 * GAC invoice that clearly says "Exchange Rate: USD / THB @ 32.589600" and
 * lists every line item in USD with a footer "UNITED STATES OF AMERICA,
 * DOLLARS...". The result was a Flex card showing "฿2,765.55" when the
 * Thai equivalent should have been ฿90,116.93.
 *
 * If we find a rate like "USD / THB @ 32.5896" in rawText AND the LLM said
 * the doc is THB, override — the document is unambiguously telling us
 * otherwise. We trust the explicit FX line over the LLM's classification.
 */
function detectForeignCurrencyFromRawText(result: OcrResult): OcrResult {
  const txt = result.rawText ?? '';
  if (!txt) return result;
  // Patterns: "USD / THB @ 32.589600" or "USD/THB@32.59" or "USD THB 32.5"
  const rateMatch = txt.match(/([A-Z]{3})\s*\/\s*THB\s*@?\s*([\d,]+\.?\d*)/i)
    ?? txt.match(/Exchange Rate\s*:?\s*([A-Z]{3})\s*\/\s*THB\s*@?\s*([\d,]+\.?\d*)/i);
  if (!rateMatch) return result;
  const detectedCurrency = rateMatch[1].toUpperCase();
  const detectedRate = Number(rateMatch[2].replace(/,/g, ''));
  if (detectedCurrency === 'THB' || !detectedRate || detectedRate <= 1) return result;
  // Only override if LLM disagreed (said THB or didn't say). If LLM already
  // got foreign currency right, leave it alone — preserves any line-item
  // breakdown the LLM extracted.
  const llmSays = (result.originalCurrency ?? '').toUpperCase();
  if (llmSays === detectedCurrency) return result;
  logger.warn('[OCR] rawText foreign-currency override', {
    llmSaid: llmSays || '(empty)',
    detected: detectedCurrency,
    rate: detectedRate,
    total: result.total,
  });
  return {
    ...result,
    originalCurrency: detectedCurrency,
    originalTotal: result.total,
    originalSubtotal: result.subtotal,
    originalVatAmount: result.vatAmount,
    exchangeRate: detectedRate,
  };
}

async function convertForeignCurrencyToThb(result: OcrResult): Promise<OcrResult> {
  // Defensive pre-pass: if the LLM missed an obvious foreign-currency marker
  // in the raw text, recover before the actual conversion runs.
  result = detectForeignCurrencyFromRawText(result);

  const declared = (result.originalCurrency ?? result.documentMetadata?.currency ?? '').toUpperCase();
  if (!declared || declared === 'THB') return result;

  // Defensive sanity check — when the LLM says "USD with exchangeRate=1", it's
  // almost always misreading "Exchange Rate: THB @ 1.000000" on a Thai-baht
  // invoice that happens to have one foreign-priced line item. Real USD/THB
  // hovers around 32-37, EUR/THB around 35-40 — a rate of 1.0 between THB
  // and any non-THB currency is never legitimate. Strip the foreign tag and
  // treat the doc as THB to avoid the "$780 ≈ ฿780" nonsense card.
  if (result.exchangeRate === 1 || result.exchangeRate === 1.0) {
    logger.warn('[OCR] foreign currency with rate=1 detected; treating as THB', {
      declared,
      total: result.total,
      originalTotal: result.originalTotal,
    });
    return {
      ...result,
      originalCurrency: 'THB',
      originalTotal: undefined,
      originalSubtotal: undefined,
      originalVatAmount: undefined,
      exchangeRate: undefined,
      exchangeRateSource: undefined,
    };
  }

  // Figure out which numeric field holds the foreign-currency amounts.
  // The LLM is instructed to populate originalTotal when currency != THB,
  // but older prompts populated 'total' with the foreign value — handle
  // both gracefully.
  const originalTotal = result.originalTotal ?? result.total;
  const originalSubtotal = result.originalSubtotal ?? result.subtotal;
  const originalVatAmount = result.originalVatAmount ?? result.vatAmount;

  if (!originalTotal || originalTotal <= 0) {
    return result; // nothing to convert
  }

  let lookup: { rate: number; source: NonNullable<OcrResult['exchangeRateSource']>; asOf: string };
  try {
    const { lookupFxRateToThb } = await import('./fxRateService');
    lookup = await lookupFxRateToThb(declared, {
      documentRate: result.exchangeRate && result.exchangeRate > 0 ? result.exchangeRate : undefined,
      dateIso: result.invoiceDate || undefined,
    });
  } catch (err) {
    logger.warn('[OCR] FX lookup failed; leaving foreign amounts unchanged', {
      error: err instanceof Error ? err.message : String(err),
      currency: declared,
    });
    return result;
  }

  const warnings = new Set(result.validationWarnings ?? []);
  warnings.add(`สกุลเงินต่างประเทศ ${declared} แปลงเป็น THB ที่อัตรา ${lookup.rate} (${lookup.source})`);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ...result,
    originalCurrency: declared,
    exchangeRate: lookup.rate,
    exchangeRateSource: lookup.source,
    originalTotal,
    originalSubtotal,
    originalVatAmount,
    subtotal: round2(originalSubtotal * lookup.rate),
    vatAmount: round2(originalVatAmount * lookup.rate),
    total: round2(originalTotal * lookup.rate),
    validationWarnings: [...warnings],
  };
}

async function applyBusinessValidation(result: OcrResult, companyId?: string): Promise<OcrResult> {
  const warnings = new Set(result.validationWarnings ?? validateOcrResult(result));
  if (!companyId) {
    return { ...result, validationWarnings: [...warnings] };
  }

  try {
    if (result.supplierTaxId && result.invoiceNumber) {
      const duplicate = await prisma.purchaseInvoice.findFirst({
        where: {
          companyId,
          supplierTaxId: result.supplierTaxId,
          invoiceNumber: result.invoiceNumber,
        },
        select: { id: true },
      });
      if (duplicate) warnings.add('พบเลขที่เอกสารนี้ในภาษีซื้อแล้ว อาจเป็นเอกสารซ้ำ');
    }

    // 1) Contacts table is authoritative — user typed the canonical
    //    name. If taxId matches, use the contact name verbatim and skip
    //    any fuzzy supplierName comparison.
    const vendorContact = await findVendorContact(companyId, result.supplierTaxId);
    if (vendorContact && vendorContact.supplierName) {
      const prior = result.supplierName;
      result.supplierName = vendorContact.supplierName;
      result.supplierBranch = vendorContact.supplierBranch || result.supplierBranch || '00000';
      if (prior && normalizeVendorName(prior) !== normalizeVendorName(vendorContact.supplierName)) {
        warnings.add(`ใช้ชื่อจากรายชื่อในระบบ: ${vendorContact.supplierName}`);
      }
    }

    const knownVendor = await findKnownVendor(companyId, result.supplierTaxId, result.supplierName);

    if (knownVendor) {
      if (!result.supplierTaxId || result.supplierTaxId === '0000000000000') result.supplierTaxId = knownVendor.supplierTaxId;
      if (!result.supplierBranch) result.supplierBranch = knownVendor.supplierBranch || '00000';
      if (!result.postingSuggestion && knownVendor.category) result.postingSuggestion = knownVendor.category;
      if (!result.expenseSubcategory && knownVendor.category) result.expenseSubcategory = knownVendor.category;
      if (!result.taxTreatment && knownVendor.vatType === 'vat7') result.taxTreatment = 'input_vat_claimable';
      // Pin the canonical (DB-stored) supplier name when our OCR name fuzzily
      // matches — avoids polluting the cache with new variants every upload.
      const ocrName = normalizeVendorName(result.supplierName);
      const dbName = normalizeVendorName(knownVendor.supplierName);
      if (ocrName && dbName && ocrName !== dbName && vendorSimilarity(ocrName, dbName) >= 0.7) {
        result.supplierName = knownVendor.supplierName;
      }
      warnings.add(`พบ vendor เดิมในระบบ: ${knownVendor.supplierName}`);
    }
  } catch (err) {
    logger.warn('[OCR] Business validation failed', { error: err instanceof Error ? err.message : String(err) });
  }

  return {
    ...result,
    validationWarnings: [...warnings],
  };
}

function shouldEscalateOcr(result: OcrResult, options?: OcrOptions) {
  const warnings = result.validationWarnings ?? [];
  const missingCritical = !result.supplierName || !result.invoiceNumber || !result.invoiceDate || !result.total;
  return result.confidence === 'low'
    || warnings.length > 0
    || missingCritical
    || (options?.pageCount ?? 1) > 1;
}

interface KnownVendorMatch {
  supplierName: string;
  supplierTaxId: string;
  supplierBranch: string | null;
  category: string | null;
  vatType: string | null;
  commonCategories: string[];
  totalRange: { min: number; max: number; avg: number };
  count: number;
}

/**
 * Targeted lookup of a single vendor's historical patterns. Distinct from
 * `buildOcrVendorMemoryContext` which dumps the top 20 vendors as a generic
 * hint list — this returns the EXACT match for the current document's
 * supplier, with aggregated stats useful for fast-path verification skip.
 *
 * Match priority: taxId exact > supplierName fuzzy (substring, normalized).
 * Combines historical purchase_invoices + saved document_intakes so the
 * memory grows from BOTH the final committed records AND the per-doc user
 * corrections — fixing the previous gap where user edits in the intake
 * stage never made it into the memory until the purchase was created.
 */
async function findExactVendorMemory(
  companyId: string | undefined,
  taxId: string | undefined,
  supplierName: string | undefined,
): Promise<KnownVendorMatch | null> {
  if (!companyId) return null;
  const digits = (taxId ?? '').replace(/\D/g, '');
  const nameNorm = normalizeVendorName(supplierName ?? '');
  if (!digits && !nameNorm) return null;

  try {
    const where: Prisma.PurchaseInvoiceWhereInput = digits.length === 13
      ? { companyId, supplierTaxId: digits }
      : { companyId, supplierName: { contains: supplierName?.slice(0, 40) ?? '', mode: 'insensitive' } };

    const rows = await prisma.purchaseInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        supplierName: true,
        supplierTaxId: true,
        supplierBranch: true,
        category: true,
        vatType: true,
        total: true,
      },
    });
    if (rows.length === 0) return null;

    const categories = rows.map((r) => r.category).filter((c): c is string => !!c);
    const categoryCounts = new Map<string, number>();
    for (const cat of categories) categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    const commonCategories = [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c]) => c);

    const totals = rows.map((r) => r.total).filter((t) => t > 0);
    const totalRange = totals.length > 0
      ? {
        min: Math.min(...totals),
        max: Math.max(...totals),
        avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
      }
      : { min: 0, max: 0, avg: 0 };

    return {
      supplierName: rows[0].supplierName,
      supplierTaxId: rows[0].supplierTaxId,
      supplierBranch: rows[0].supplierBranch,
      category: rows[0].category,
      vatType: rows[0].vatType,
      commonCategories,
      totalRange,
      count: rows.length,
    };
  } catch (err) {
    logger.warn('[OCR] findExactVendorMemory failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Decide if the current OCR result aligns closely enough with a known
 * vendor's historical patterns to skip the verify pass. Trade-off:
 *
 *   - Skip when confident → save 5-10s + $0.005 per doc on repeat vendors.
 *   - Don't skip if any signal looks off → verify catches the edge case.
 *
 * Conservative gates: taxId must match exactly (the strongest signal),
 * total must be within the historical range × 3 (allows growth without
 * flagging normal vendors), no missing critical fields, no warnings.
 */
function alignsWithKnownVendor(result: OcrResult, known: KnownVendorMatch): boolean {
  if (known.count < 3) return false; // need enough history to trust
  const taxId = (result.supplierTaxId ?? '').replace(/\D/g, '');
  if (taxId.length !== 13 || taxId !== known.supplierTaxId.replace(/\D/g, '')) return false;
  if (!result.invoiceNumber || !result.invoiceDate || !result.total) return false;
  if (result.confidence === 'low') return false;
  if ((result.validationWarnings ?? []).length > 0) return false;
  // total in plausible range — 3x historical max as outlier guard
  const maxAllowed = known.totalRange.max * 3 || Number.MAX_SAFE_INTEGER;
  const minAllowed = known.totalRange.min / 3;
  if (result.total < minAllowed || result.total > maxAllowed) return false;
  return true;
}

function shouldHumanReviewOcr(result: OcrResult) {
  const warnings = result.validationWarnings ?? [];
  const missingCritical = !result.supplierName || !result.invoiceNumber || !result.invoiceDate || !result.total;
  return result.confidence === 'low' || warnings.length > 0 || missingCritical;
}

function buildVerifyPrompt(basePrompt: string, candidate?: OcrResult, pro = false) {
  const candidateBlock = candidate
    ? `\n\nCandidate extraction to audit and correct:\n${JSON.stringify(candidate, null, 2)}`
    : '';

  return `${basePrompt}

Verification mode:
- Treat deterministic parser/OCR output as evidence, not truth.
- Recalculate subtotal + VAT = total. If values disagree, correct only when the document clearly supports it; otherwise keep the best visible values and add validationWarnings.
- Detect swapped seller/buyer names when possible. supplierName must be the seller/vendor on the purchase document.
- Preserve Thai text exactly when visible.
- If confidence is not high enough for automatic posting, set confidence to "medium" or "low".
- Return ONLY the final corrected JSON object.
${pro ? '- This is the escalation pass. Be stricter about multi-page documents, missing tax IDs, and mismatched totals.' : ''}${candidateBlock}`;
}

/**
 * Recover a JSON string that was truncated mid-stream (e.g. when the LLM
 * hit max_tokens). Strategy: walk the string forward keeping nesting
 * depth, remember the position of the last completed top-level field
 * (where the next char is `,` outside a string), then close all open
 * braces / brackets at that point.
 *
 * Returns null when no completed field was found (truncation happened
 * before even one key:value finished).
 */
function tryRecoverTruncatedJson(s: string): string | null {
  let depth = 0;
  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escape = false;
  let lastSafeCut = -1; // index of last `,` outside string at depth 1
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') { stack.push('{'); depth++; }
    else if (ch === '[') { stack.push('['); depth++; }
    else if (ch === '}' || ch === ']') { stack.pop(); depth--; }
    else if (ch === ',' && depth === 1) { lastSafeCut = i; }
  }
  if (lastSafeCut < 0 || stack.length === 0) return null;
  // Truncate before the trailing `,`, close all open containers in reverse.
  const closers = stack.reverse().map((c) => c === '{' ? '}' : ']').join('');
  return s.slice(0, lastSafeCut) + closers;
}

function parseOcrJson(raw: string, emptyResult: OcrResult, azureContent?: string): OcrResult | null {
  // Strip markdown code fences the model occasionally adds despite a
  // json-only prompt (` ```json ... ``` `).
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn('OCR: no JSON found in response', { raw: raw.slice(0, 200) });
    return null;
  }

  let parsed: Partial<OcrResult>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Partial<OcrResult>;
  } catch (err) {
    // LLM may have truncated mid-stream (max_tokens exhausted). Try to
    // recover by trimming back to the last complete `,` field and
    // closing braces. Better partial result than nothing.
    const recovered = tryRecoverTruncatedJson(jsonMatch[0]);
    if (recovered) {
      try {
        parsed = JSON.parse(recovered) as Partial<OcrResult>;
        logger.warn('OCR: recovered from truncated JSON', { originalLen: jsonMatch[0].length, recoveredLen: recovered.length });
      } catch {
        logger.warn('OCR: invalid JSON response (recovery also failed)', {
          error: err instanceof Error ? err.message : String(err),
          raw: raw.slice(0, 500),
        });
        return null;
      }
    } else {
      logger.warn('OCR: invalid JSON response', {
        error: err instanceof Error ? err.message : String(err),
        raw: raw.slice(0, 500),
      });
      return null;
    }
  }
  const allowedTypes = new Set<OcrResult['documentType']>([
    'tax_invoice',
    'receipt',
    'invoice',
    'billing_note',
    'withholding_tax',
    'payment_advice',
    'bank_transfer',
    'bank_statement',
    'quotation',
    'purchase_order',
    'delivery_note',
    'expense_receipt',
    'contract',
    'credit_note',
    'debit_note',
    'other',
  ]);
  const documentType = allowedTypes.has(parsed.documentType as OcrResult['documentType'])
    ? parsed.documentType as OcrResult['documentType']
    : 'other';

  const result: OcrResult = {
    documentType,
    documentTypeLabel: parsed.documentTypeLabel ?? 'เอกสารอื่น',
    supplierName: parsed.supplierName ?? '',
    supplierTaxId: parsed.supplierTaxId ?? '',
    supplierBranch: parsed.supplierBranch ?? '00000',
    invoiceNumber: parsed.invoiceNumber ?? '',
    invoiceDate: parsed.invoiceDate ?? '',
    subtotal: Number(parsed.subtotal ?? 0),
    vatAmount: Number(parsed.vatAmount ?? 0),
    total: Number(parsed.total ?? 0),
    confidence: parsed.confidence ?? 'low',
    rawText: parsed.rawText ?? azureContent,
    extractionProvider: parsed.extractionProvider ?? emptyResult.extractionProvider,
    payment: parsed.payment,
    documentMetadata: parsed.documentMetadata,
    expenseCategory: parsed.expenseCategory,
    expenseSubcategory: parsed.expenseSubcategory,
    taxTreatment: parsed.taxTreatment,
    postingSuggestion: parsed.postingSuggestion,
    originalCurrency: parsed.originalCurrency,
    exchangeRate: parsed.exchangeRate ? Number(parsed.exchangeRate) : undefined,
    originalTotal: parsed.originalTotal ? Number(parsed.originalTotal) : undefined,
    originalSubtotal: parsed.originalSubtotal ? Number(parsed.originalSubtotal) : undefined,
    originalVatAmount: parsed.originalVatAmount ? Number(parsed.originalVatAmount) : undefined,
  };
  result.validationWarnings = [
    ...validateOcrResult(result),
    ...(parsed.validationWarnings ?? []),
  ];
  result.needsHumanReview = parsed.needsHumanReview;
  return result;
}

function buildEmptyOcrResult(documentType: OcrResult['documentType'] = 'other', label = 'เอกสารอื่น'): OcrResult {
  return {
    documentType,
    documentTypeLabel: label,
    supplierName: '',
    supplierTaxId: '',
    supplierBranch: '00000',
    invoiceNumber: '',
    invoiceDate: '',
    subtotal: 0,
    vatAmount: 0,
    total: 0,
    confidence: 'low',
    extractionProvider: 'none',
  };
}

function looksLikeUnclassifiedSlip(result: OcrResult) {
  return result.documentType === 'other'
    || result.documentType === 'payment_advice'
    || (!!result.rawText && /โอน|transfer|พร้อมเพย์|promptpay|transaction|reference|บัญชี|ธนาคาร|bank/i.test(result.rawText));
}

function bankSlipEvidenceText(result: OcrResult) {
  return [
    result.rawText,
    result.documentTypeLabel,
    result.supplierName,
    result.invoiceNumber,
    result.payment?.bankName,
    result.payment?.fromName,
    result.payment?.fromAccount,
    result.payment?.toName,
    result.payment?.toAccount,
    result.payment?.reference,
  ].filter(Boolean).join('\n');
}

export function looksLikeBankSlipCandidate(result: OcrResult) {
  const text = bankSlipEvidenceText(result);
  const invoiceRef = `${result.invoiceNumber || ''}${result.payment?.reference || ''}`;
  const isAccountingMisclass = new Set<OcrResult['documentType']>([
    'tax_invoice',
    'receipt',
    'invoice',
    'expense_receipt',
    'payment_advice',
    'other',
  ]).has(result.documentType);
  const hasBankKeyword = /SCB|KBank|Kasikorn|กสิกร|ไทยพาณิชย์|Bangkok Bank|กรุงเทพ|Krungthai|กรุงไทย|Krungsri|กรุงศรี|TTB|ทหารไทย|ธนชาต|GSB|ออมสิน|BAAC|ธ\.ก\.ส\.|UOB|CIMB|PromptPay|พร้อมเพย์|Mobile Banking|โมบายแบงก์กิ้ง|โอนเงิน|โอนสำเร็จ|รายการโอน|เลขที่รายการ|หมายเลขอ้างอิง|transaction|transfer|reference|from account|to account|จากบัญชี|ไปยังบัญชี|ผู้โอน|ผู้รับ|ธนาคาร|bank/i.test(text);
  const hasTransferAction = /โอน|transfer|พร้อมเพย์|promptpay|transaction|เลขที่รายการ|หมายเลขอ้างอิง|reference/i.test(text);
  const hasLongBankRef = /(?=.*[A-Z])(?=.*\d)[A-Z0-9]{12,}/i.test(invoiceRef);
  const amount = paymentAmountFromOcr(result);
  const subtotalEqualsTotal = amount > 0 && Math.abs(Number(result.subtotal || 0) - amount) < 0.01;
  const noVat = Number(result.vatAmount || 0) === 0;

  return isAccountingMisclass
    && amount > 0
    && noVat
    && (hasTransferAction || hasBankKeyword)
    && (subtotalEqualsTotal || hasLongBankRef || hasTransferAction);
}

export async function ocrBankTransferSlip(
  imageBase64: string,
  mimeType: string,
  qrText?: string,
): Promise<OcrResult> {
  const emptyResult = buildEmptyOcrResult('bank_transfer', 'สลิปโอนเงิน');
  if (!googleAiKey && !apiKey) return emptyResult;

  const qrContext = qrText ? `\n\nDecoded QR/barcode payload evidence:\n${qrText.slice(0, 1200)}\n` : '';
  const prompt = `You are a specialist OCR engine for Thai mobile banking transfer slips and bank payment confirmations.
The input may be a screenshot/photo/PDF from Thai banks such as KBank, SCB, Bangkok Bank, Krungthai, Krungsri, TTB, GSB, BAAC, CIMB, UOB, or PromptPay.

Classify it as "bank_transfer" if it looks like any money transfer/payment confirmation, even if some fields are missing.
Return ONLY a JSON object matching this schema:

{
  "documentType": "bank_transfer",
  "documentTypeLabel": "สลิปโอนเงิน",
  "supplierName": "counterparty name, prefer payee for outgoing transfers or payer for incoming transfers",
  "supplierTaxId": "",
  "supplierBranch": "00000",
  "invoiceNumber": "transaction/reference id",
  "invoiceDate": "YYYY-MM-DD",
  "subtotal": 0,
  "vatAmount": 0,
  "total": 0,
  "confidence": "high|medium|low",
  "payment": {
    "amount": 0,
    "paidAt": "YYYY-MM-DD",
    "bankName": "bank/app name",
    "fromName": "payer/transferor",
    "fromAccount": "masked account",
    "toName": "payee/receiver",
    "toAccount": "masked account",
    "reference": "transaction id/reference",
    "direction": "incoming|outgoing|unknown"
  },
  "rawText": "all visible text"
}

Rules:
- total and payment.amount must be the transferred amount, not balance or fee.
- invoiceDate and payment.paidAt must be the transfer date.
- invoiceNumber and payment.reference should use transaction id/reference number if visible.
- Always extract both visible party names when present. In Thai bank slips, the name near the upper/source bank logo is usually fromName and the name below the arrow/PromptPay/receiver bank logo is usually toName.
- Preserve Thai names exactly as visible, including titles such as นาย/นาง/นางสาว and bank/app labels separately in bankName.
- If Decoded QR/barcode payload evidence is provided, use it to help extract reference, account/PromptPay id, amount, and bank payload. Cross-check it against visible OCR text.
- direction is "outgoing" if the slip says money was sent/โอนเงินออก/จากบัญชีเรา to another party; "incoming" if money was received/รับเงิน/เงินเข้า; otherwise "unknown".
- confidence high requires amount plus date plus either reference or counterparty name.${qrContext}`;

  try {
    let raw = '';
    if (googleAiKey) {
      raw = await callGemini(mimeType, imageBase64, prompt, ocrTimeoutMs, geminiScanModel);
    }
    if (!raw && apiKey) {
      const messages: OpenRouterMessage[] = [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          { type: 'text', text: prompt },
        ],
      }];
      raw = await callOpenRouter(VISION_MODELS, messages, 1500, ocrTimeoutMs);
    }
    const result = parseOcrJson(raw, emptyResult);
    if (!result) return emptyResult;
    const amount = Number(result.payment?.amount ?? result.total ?? 0);
    return {
      ...result,
      documentType: 'bank_transfer',
      documentTypeLabel: result.documentTypeLabel || 'สลิปโอนเงิน',
      total: amount,
      subtotal: 0,
      vatAmount: 0,
      invoiceDate: result.invoiceDate || result.payment?.paidAt || '',
      invoiceNumber: result.invoiceNumber || result.payment?.reference || '',
      supplierName: result.supplierName || result.payment?.toName || result.payment?.fromName || '',
      extractionProvider: googleAiKey ? 'gemini-slip-specialist' : 'openrouter-slip-specialist',
      validationWarnings: amount > 0 ? result.validationWarnings : [...(result.validationWarnings ?? []), 'ไม่พบยอดเงินโอนที่ชัดเจน'],
      payment: {
        ...result.payment,
        amount,
        paidAt: result.payment?.paidAt || result.invoiceDate,
        reference: result.payment?.reference || result.invoiceNumber,
      },
    };
  } catch (err) {
    logger.warn('[OCR] Bank transfer specialist failed', { error: err instanceof Error ? err.message : String(err) });
    return emptyResult;
  }
}

export async function buildCompanyContext(companyId: string): Promise<string> {
  const cacheKey = `ai:company-context:${companyId}`;
  if (companyContextCacheTtl > 0) {
    const cached = companyContextCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [company, salesAgg, purchaseAgg, overdueInvoices, recentInvoices, recentPurchaseInvoices] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { nameTh: true, taxId: true },
    }),
    prisma.invoice.aggregate({
      where: { companyId, invoiceDate: { gte: monthStart } },
      _count: { id: true },
      _sum: { total: true, vatAmount: true },
    }),
    prisma.purchaseInvoice.aggregate({
      where: { companyId, invoiceDate: { gte: monthStart } },
      _count: { id: true },
      _sum: { total: true, vatAmount: true },
    }),
    prisma.invoice.findMany({
      where: {
        companyId,
        isPaid: false,
        status: 'approved',
        dueDate: { lt: now },
      },
      select: { id: true, total: true },
    }),
    prisma.invoice.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        invoiceNumber: true,
        total: true,
        isPaid: true,
        dueDate: true,
        buyer: { select: { nameTh: true } },
      },
    }),
    prisma.purchaseInvoice.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        supplierName: true,
        invoiceNumber: true,
        invoiceDate: true,
        total: true,
        vatAmount: true,
        category: true,
        isPaid: true,
      },
    }),
  ]);

  const outputVat = salesAgg._sum.vatAmount ?? 0;
  const inputVat = purchaseAgg._sum.vatAmount ?? 0;
  const vatPayable = outputVat - inputVat;

  const context = {
    company: { name: company?.nameTh ?? '', taxId: company?.taxId ?? '' },
    salesThisMonth: {
      count: salesAgg._count.id,
      total: salesAgg._sum.total ?? 0,
      outputVat,
    },
    purchasesThisMonth: {
      count: purchaseAgg._count.id,
      total: purchaseAgg._sum.total ?? 0,
      inputVat,
    },
    vatPayable,
    overdueInvoices: {
      count: overdueInvoices.length,
      totalAmount: overdueInvoices.reduce((sum, inv) => sum + inv.total, 0),
    },
    recentInvoices: recentInvoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      customer: inv.buyer.nameTh,
      total: inv.total,
      isPaid: inv.isPaid,
      dueDate: inv.dueDate?.toISOString().split('T')[0] ?? null,
    })),
    recentPurchaseInvoices: recentPurchaseInvoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      supplier: inv.supplierName,
      invoiceDate: inv.invoiceDate?.toISOString().split('T')[0] ?? null,
      total: inv.total,
      vatAmount: inv.vatAmount,
      category: inv.category ?? null,
      isPaid: inv.isPaid,
    })),
  };

  const serialized = JSON.stringify(context, null, 2);

  if (companyContextCacheTtl > 0) {
    companyContextCache.set(cacheKey, {
      expiresAt: Date.now() + companyContextCacheTtl * 1000,
      value: serialized,
    });
  }

  return serialized;
}

export async function askBillboy(
  companyId: string,
  companyName: string,
  taxId: string,
  userQuestion: string,
  options: { channel?: 'line' | 'web' } = {},
): Promise<string> {
  if (!apiKey) {
    return '⚠️ AI ยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแล';
  }

  try {
    const context = await buildCompanyContext(companyId);
    const channel = options.channel ?? 'line';
    const channelInstruction = channel === 'web'
      ? `ช่องทาง: Web app
- ผู้ใช้อยู่ในเว็บแล้ว ห้ามแนะนำลิงก์เข้าระบบ/หน้ารายการเอกสาร เว้นแต่ผู้ใช้ถามหาลิงก์โดยตรง
- ตอบแบบผู้ช่วยวิเคราะห์: สรุปตัวเลข แจกแจงรายการ ชี้สิ่งที่ควรตรวจต่อ และเสนอ next action ที่ทำได้ในระบบ
- คำตอบยาวได้พอเหมาะ ใช้หัวข้อสั้นและ bullet ที่อ่านง่าย`
      : `ช่องทาง: LINE
- ตอบสั้นมากเพื่อประหยัด LINE message quota
- ถ้าผู้ใช้ถามทั่วไป ให้ตอบเฉพาะสาระสำคัญ 3-5 บรรทัด
- แนบลิงก์เฉพาะเมื่อผู้ใช้ถามหาทางเข้า เปิดเว็บ ดาวน์โหลด ดูเอกสาร หรือ login โดยตรง`;

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `คุณคือ "Billboy" ผู้ช่วยบัญชีอัจฉริยะสำหรับระบบ e-Tax Invoice ของไทย
คุณช่วยเหลือพนักงานบัญชีในการตอบคำถามเกี่ยวกับภาษีมูลค่าเพิ่ม ใบกำกับภาษี และข้อมูลทางการเงิน
ตอบเป็นภาษาไทยเสมอ เข้าใจง่าย และไม่ใส่อีโมจิเกินจำเป็น
${channelInstruction}

ลิงก์ระบบที่ใช้ได้เมื่อจำเป็น:
- เข้าระบบ: https://etax-invoice.vercel.app
- หน้ารายการเอกสาร: https://etax-invoice.vercel.app/app/invoices
- หน้าภาษีซื้อ/เอกสารซื้อ: https://etax-invoice.vercel.app/app/purchase-invoices

ขอบเขตคำตอบ:
- ตอบได้เฉพาะข้อมูลของบริษัทนี้จาก context ด้านล่าง, ความรู้ทั่วไปด้านบัญชี/ภาษีไทย, และวิธีใช้งานระบบ e-Tax Invoice นี้
- ห้ามเดาเลขเอกสาร ยอดเงิน รายชื่อลูกค้า หรือข้อมูลบริษัทอื่นที่ไม่มีใน context
- ถ้าผู้ใช้ถามข้อมูลที่ไม่มีใน context ให้บอกว่า "ยังไม่มีข้อมูลนี้ในระบบ" แล้วแนะนำเมนูหรือขั้นตอนที่เกี่ยวข้อง
- ห้ามให้คำปรึกษากฎหมาย/ภาษีแบบฟันธงแทนผู้สอบบัญชีหรือที่ปรึกษาภาษี ให้ตอบเชิงแนวทางและแนะนำตรวจสอบกับผู้เชี่ยวชาญเมื่อเป็นเรื่องเสี่ยง
- ถ้าคำถามอยู่นอกบัญชี ภาษี ใบกำกับภาษี หรือการใช้งานระบบ ให้ปฏิเสธอย่างสุภาพและชวนถามเรื่องที่เกี่ยวข้อง

บริษัท: ${companyName} (เลขผู้เสียภาษี: ${taxId})

ข้อมูลบริษัทปัจจุบัน:
${context}`,
      },
      {
        role: 'user',
        content: userQuestion,
      },
    ];

    const answer = await callOpenRouter(CHAT_MODELS, messages, channel === 'web' ? 1000 : 450, chatTimeoutMs);
    return answer || 'ขอโทษ ไม่สามารถตอบได้ในขณะนี้';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('askBillboy failed', { error: msg, companyId });
    return 'ขอโทษ ตอนนี้ Billboy ตอบช้า/ไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้งในอีกสักครู่';
  }
}

export async function ocrSupplierInvoice(
  imageBase64: string,
  mimeType: string,
  options: OcrOptions = {},
): Promise<OcrResult> {
  const azureConfigured = isAzureDocumentIntelligenceConfigured();
  if (!apiKey && !googleAiKey && !azureConfigured) {
    return {
      documentType: 'other',
      documentTypeLabel: 'เอกสารอื่น',
      supplierName: '',
      supplierTaxId: '',
      supplierBranch: '00000',
      invoiceNumber: '',
      invoiceDate: '',
      subtotal: 0,
      vatAmount: 0,
      total: 0,
      confidence: 'low',
      extractionProvider: 'none',
    };
  }

  const emptyResult = buildEmptyOcrResult();

  const ocrPrompt = `You are an OCR assistant for Thai and English accounting documents. Classify the document and extract all available information. Return ONLY a JSON object, no other text.

Rules:
- Extract whatever is visible, even if partial
- For missing fields use empty string "" or 0
- supplierTaxId: 13-digit Thai tax ID (remove dashes/spaces)
- invoiceDate: convert to YYYY-MM-DD format
- confidence: "high" if most fields found, "medium" if some fields found, "low" only if document is completely unreadable
- Mobile banking transfer confirmations / สลิปโอนเงิน are NEVER tax_invoice or receipt, even when a shop/payee name, tax-like number, or long transaction number is visible.
- documentType must be one of:
  - "tax_invoice": Thai tax invoice / ใบกำกับภาษี
  - "receipt": receipt / ใบเสร็จรับเงิน
  - "invoice": invoice / invoice only / ใบแจ้งหนี้
  - "billing_note": billing note / ใบวางบิล / ใบเรียกเก็บเงิน
  - "withholding_tax": withholding tax certificate / หนังสือรับรองหัก ณ ที่จ่าย / 50 ทวิ
  - "payment_advice": payment advice / remittance advice / หลักฐานแจ้งการชำระเงิน
  - "bank_transfer": bank transfer slip / mobile banking transfer confirmation / สลิปโอนเงิน / หลักฐานการโอน
  - "bank_statement": bank account statement / รายการเดินบัญชี
  - "quotation": quotation / ใบเสนอราคา
  - "purchase_order": purchase order / ใบสั่งซื้อ
  - "delivery_note": delivery note / ใบส่งของ / ใบส่งสินค้า
  - "expense_receipt": small expense receipt / cash register slip / ใบเสร็จค่าใช้จ่ายทั่วไป
  - "contract": contract/agreement / สัญญา / ข้อตกลง
  - "credit_note": credit note / ใบลดหนี้
  - "debit_note": debit note / ใบเพิ่มหนี้
  - "other": other accounting document
- documentTypeLabel: short Thai label for the document type
- For bank_transfer, extract payment details into payment and use:
  - total = transferred amount
  - invoiceDate = transfer date
  - invoiceNumber = bank/reference/transaction id if visible
  - supplierName = receiver/payee name if it is an outgoing transfer, otherwise payer name if visible
  - confidence should be high only when amount, date, and reference or counterparty are visible
- For expense receipts, classify expenseCategory and taxTreatment:
  - toll: ทางด่วน, Expressway, Toll, Easy Pass, M-Flow, Motorway, EXAT, Don Muang Tollway
  - fuel: น้ำมัน, fuel, gasoline, diesel, PTT, Bangchak, Shell, Esso, Caltex, PT
  - parking: parking, ที่จอดรถ
  - utilities: electricity/water bills, ค่าไฟ, ค่าน้ำ
  - telecom: phone/internet, โทรศัพท์, อินเทอร์เน็ต, AIS, TRUE, DTAC, NT
  - shipping: freight/courier/postage, Kerry, Flash, J&T, DHL, ไปรษณีย์
  - meals: restaurant/food/refreshment, ร้านอาหาร, ค่าอาหาร, GrabFood, LINE MAN, Foodpanda
  - travel: taxi/ride/transport/air ticket, Grab, Bolt, airfare
  - hotel: hotel/accommodation
  - software: SaaS/software/subscription, Google, Microsoft, Adobe, AWS
  - marketplace: Shopee, Lazada, TikTok Shop, marketplace invoices
  - office_supplies: stationery/office supplies
  - bank_fee: bank charge/fee
  - professional_service: legal/accounting/consulting/service fee
  - rent: rent/lease
  - repair_maintenance: repair/maintenance
  - medical: clinic/hospital/pharmacy
  - government_fee: government fee/tax/registration fee
  - other: unclear
- taxTreatment:
  - input_vat_claimable when a valid tax invoice/VAT amount is visible and business use seems plausible
  - vat_exempt when explicitly exempt/no VAT
  - non_deductible for clearly personal/entertainment/non-claimable items
  - needs_review when unsure, missing tax ID, or VAT treatment is ambiguous

{
  "documentType": "tax_invoice|receipt|invoice|billing_note|withholding_tax|payment_advice|bank_transfer|bank_statement|quotation|purchase_order|delivery_note|expense_receipt|contract|credit_note|debit_note|other",
  "documentTypeLabel": "ใบกำกับภาษี",
  "supplierName": "company name",
  "supplierTaxId": "1234567890123",
  "supplierBranch": "00000",
  "invoiceNumber": "document number",
  "invoiceDate": "YYYY-MM-DD",
  "subtotal": 0,
  "vatAmount": 0,
  "total": 0,
  "confidence": "high|medium|low",
  "expenseCategory": "toll|fuel|parking|utilities|telecom|shipping|meals|travel|hotel|software|marketplace|office_supplies|bank_fee|professional_service|rent|repair_maintenance|medical|government_fee|other",
  "expenseSubcategory": "short specific category such as expressway toll, mobile internet, diesel, courier",
  "taxTreatment": "input_vat_claimable|vat_exempt|non_deductible|needs_review",
  "postingSuggestion": "Thai accounting posting suggestion, e.g. ค่าทางด่วน, ค่าน้ำมัน, ค่าขนส่ง",
  "payment": {
    "amount": 0,
    "paidAt": "YYYY-MM-DD",
    "bankName": "bank name",
    "fromName": "payer name",
    "fromAccount": "masked account",
    "toName": "payee name",
    "toAccount": "masked account",
    "reference": "transaction reference",
    "direction": "incoming|outgoing|unknown"
  },
  "documentMetadata": {
    "buyerName": "buyer/customer name",
    "buyerTaxId": "buyer tax id",
    "sellerName": "seller/vendor name",
    "sellerTaxId": "seller tax id",
    "currency": "THB",
    "dueDate": "YYYY-MM-DD",
    "purchaseOrderNumber": "PO number",
    "quotationNumber": "quotation number",
    "deliveryNoteNumber": "delivery note number",
    "withholdingTaxAmount": 0,
    "withholdingTaxRate": 0,
    "withholdingTaxIncomeType": "Thai income type code printed on a 50ทวิ certificate — e.g. '40(2)' (commission), '40(3)' (royalty), '40(4)' (interest), '40(8)' (services). Empty string if not a WHT cert.",
    "withholdingTaxGrossAmount": 0,
    "withholdingTaxPayerName": "the entity that WITHHELD tax (the payer issuing the 50ทวิ cert). Empty if not applicable.",
    "withholdingTaxPayerTaxId": "tax id of the payer (the company issuing the cert). 13 digits, no dashes.",
    "withholdingTaxRecipientName": "the entity that RECEIVED payment (the recipient on the 50ทวิ cert). Often a supplier/consultant.",
    "withholdingTaxRecipientTaxId": "tax id of the recipient. 13 digits, no dashes.",
    "description": "short extracted description"
  },
  "originalCurrency": "ISO-4217 currency code printed on the document — e.g. 'USD', 'EUR', 'JPY', 'CNY'. Set to 'THB' (or omit) when amounts are in Thai Baht.",
  "exchangeRate": "the FX rate printed on the document if present (e.g. invoices that say 'USD / THB @ 32.589600' → 32.589600). Number, not string. Omit or set 0 when no rate is printed.",
  "originalTotal": "total amount in the originalCurrency (when not THB). Same arithmetic role as 'total' but kept in the foreign currency. Set ONLY when currency != THB.",
  "originalSubtotal": "subtotal in the originalCurrency. Set ONLY when currency != THB.",
  "originalVatAmount": "VAT amount in the originalCurrency. Set ONLY when currency != THB.",
  "rawText": "all text found in document"
}

Currency rules — read CAREFULLY (frequent misclassification source):
- Most Thai documents are THB. Set originalCurrency / originalTotal / exchangeRate ONLY when the entire document's bottom-line "Total Amount" / "Amount to be paid" is in a foreign currency.
- If the document explicitly states "Exchange Rate: THB @ 1.000000" (or any rate with THB as the base/quote currency = 1), the document IS in THB. The header is declaring "no conversion needed". Set originalCurrency='THB' (or omit) — do NOT mark as foreign.
- Many Thai invoices include occasional line items priced in USD (e.g. ENS fee, freight surcharge) but the final total is reported in THB on the bottom. In that case the document is THB — do NOT use the line-item currency as originalCurrency.
- Only mark a document as foreign when ALL THREE are true: (a) the bottom-line total is printed in a foreign currency, (b) there is a real FX rate (NOT 1.000000 between THB and a non-THB currency), and (c) the supplier or context confirms cross-border billing.
- When document prints both currencies side-by-side ('USD 100.00 / THB 3,250.00') as the actual total, use the foreign as originalTotal and the THB as 'total'.

Document-type-specific extraction rules — STEP 1: classify the document first using header keywords, layout, and footer, then apply the rules below for that type:

【tax_invoice / ใบกำกับภาษี】
- Header MUST say "ใบกำกับภาษี" or "TAX INVOICE" (sometimes combined "ใบกำกับภาษี/ใบเสร็จรับเงิน" — that's tax_invoice + receipt = type "tax_invoice")
- supplierName = ผู้ขาย (top-left or letterhead). supplierTaxId = 13 digits without dashes. supplierBranch = "00000" for HQ or 5-digit branch.
- subtotal = ยอดก่อน VAT, vatAmount = ภาษีมูลค่าเพิ่ม 7%, total = ยอดรวมทั้งสิ้น
- Confidence high requires: invoiceNumber + invoiceDate + supplierTaxId(13) + total + (subtotal+vat≈total)
- taxTreatment = input_vat_claimable when buyer is registered VAT, else needs_review

【receipt / ใบเสร็จรับเงิน (no VAT line)】
- Header says "ใบเสร็จรับเงิน" / "RECEIPT" / "ใบรับเงิน" only — NO "ใบกำกับภาษี"
- vatAmount may be 0 if seller is non-VAT-registered. total = subtotal in that case.
- Common for: 7-Eleven, taxi, parking, small vendors. expenseCategory often retail/utilities.

【expense_receipt / ใบเสร็จค่าใช้จ่าย + POS receipt ร้านอาหาร/คาเฟ่】
- Personal-ish expenses (meals, taxis, hotel, supplies) + restaurant/café/bar POS bills.
- POS thermal receipts from restaurants ALWAYS land here, even when the header prints
  "Invoice" — layout decides, not header. Telltale signals (2+ → expense_receipt,
  NEVER bank_transfer): "Table no.", "Guests:", "Service Charge"/"ค่าบริการ",
  "Thanks For Dining"/"ขอบคุณที่ใช้บริการ", "Rounding" before total, food/drink line
  items, restaurant brand at top (e.g. "61 Bistro", "After You", "MK").
- supplierName = restaurant brand from header (set even when no tax ID printed).
  expenseCategory = "meals". taxTreatment defaults to "non_deductible".

【withholding_tax / 50ทวิ หนังสือรับรองหักภาษี ณ ที่จ่าย】
- Header says "หนังสือรับรองการหักภาษี ณ ที่จ่าย" or has "ภ.ง.ด." numbers (1/3/53/2/2ก)
- documentMetadata.withholdingTaxAmount = ภาษีที่หัก. withholdingTaxGrossAmount = จำนวนเงินที่จ่าย (before withholding)
- withholdingTaxPayerName = ผู้หัก (the company that withheld and is issuing this cert)
- withholdingTaxPayerTaxId = ผู้หักTaxId
- withholdingTaxRecipientName = ผู้ถูกหัก (the supplier/contractor receiving the payment)
- withholdingTaxRecipientTaxId = ผู้ถูกหักTaxId
- supplierName = withholdingTaxPayerName (issuer of the cert)
- Common rates: 1% (transport/services), 3% (professional services), 5% (rent)

【bank_transfer / สลิปโอนเงิน】
- HARD: do NOT classify as bank_transfer unless ≥1 of these is clearly visible:
  bank logo/brand (KBank/SCB/BBL/KTB/Krungsri/TTB/GSB/BAAC/CIMB/UOB/กสิกร/ไทยพาณิชย์),
  "PromptPay"/"พร้อมเพย์", transfer keywords ("โอนเงิน"/"Transfer"/"โอนสำเร็จ"/
  "เงินเข้า"/"เงินออก"), or account-number rows. Total + Date alone is NOT enough —
  receipts and POS bills also have Total + Date. Without these signals, classify
  as expense_receipt / receipt / invoice / tax_invoice instead.
- Mobile banking screenshot: KBank/SCB/Bangkok Bank/KTB/Krungsri/TTB/GSB/BAAC/CIMB/UOB/PromptPay
- payment.fromName = ผู้โอน (top, near source bank logo). payment.toName = ผู้รับ (below the arrow/PromptPay logo)
- payment.amount = transferred amount (NOT balance, NOT fee). payment.paidAt = transfer time.
- payment.reference = เลขที่รายการ / transaction id
- payment.direction: "outgoing" if "โอนเงิน" / "จ่าย" / "from us"; "incoming" if "รับ" / "เงินเข้า"
- supplierName = the COUNTERPARTY (toName for outgoing, fromName for incoming)
- subtotal/vatAmount = 0 (slips don't have VAT). total = payment.amount

【credit_note / ใบลดหนี้】
- Header says "ใบลดหนี้" / "CREDIT NOTE"
- total and vatAmount should be NEGATIVE (or marked as a refund/return). It REVERSES a prior invoice.
- invoiceNumber refers to the credit note number; the referenced original invoice goes in description if visible.
- expenseCategory typically inherits from original

【debit_note / ใบเพิ่มหนี้】
- Header says "ใบเพิ่มหนี้" / "DEBIT NOTE"
- ADDS to a prior invoice (extra charge). total/vat are positive add-ons.

【quotation / ใบเสนอราคา】
- Header says "ใบเสนอราคา" / "QUOTATION"
- NOT a tax document — total is an estimate, supplierTaxId may be missing
- taxTreatment = needs_review (don't post as expense until invoice issued)

【purchase_order / ใบสั่งซื้อ】
- Header says "ใบสั่งซื้อ" / "PURCHASE ORDER" / "PO"
- The BUYER's document committing to purchase — supplierName is the seller, but supplierTaxId may be the buyer's. Confidence usually medium.

【bank_statement / รายการเดินบัญชี】
- Multi-row transaction list (NOT a single transfer slip). documentMetadata.transactions array if you can extract.
- total = balance OR period sum (note which in description)

【payment_advice / หนังสือแจ้งการชำระเงิน】
- Formal "Payment Advice"/"Remittance Advice"/"หนังสือแจ้งการชำระเงิน" letter.
- Same hard signal requirement as bank_transfer — need explicit transfer/payment
  context (bank, account rows, transfer keywords). Total+Date alone does NOT qualify.
- Treat like bank_transfer for amount fields; classification stays "payment_advice".

CLASSIFICATION PRIORITY (use when unsure):
  1. Bank logo / "PromptPay" / transfer keywords visible → bank_transfer
  2. Restaurant signals (Table, Service Charge, Thanks For Dining, food lines) → expense_receipt
  3. "ใบกำกับภาษี"/"TAX INVOICE" + 13-digit tax IDs → tax_invoice
  4. "ใบเสร็จรับเงิน"/"RECEIPT" without VAT line → receipt
  5. Otherwise → "other" (better than guessing bank_transfer)

If none of the above clearly matches, use "other" — better honest than wrong.`;

  try {
    let raw = '';
    const azureResult = mimeType !== 'text/plain'
      ? await analyzeAccountingDocumentWithAzure(imageBase64, mimeType)
      : null;

    if (azureResult?.ok) {
      logger.info('[OCR] Azure Document Intelligence responded', {
        modelId: azureResult.modelId,
        chars: azureResult.content.length,
        confidence: azureResult.confidence,
      });
    } else if (azureResult && !azureResult.ok) {
      logger.warn('[OCR] Azure Document Intelligence failed, falling back', { error: azureResult.error });
    }

    const azureContext = azureResult?.ok
      ? `\n\nAzure Document Intelligence result:\nFields:\n${JSON.stringify(azureResult.fields, null, 2)}\n\nOCR text:\n${azureResult.content.slice(0, 6000)}`
      : '';
    const vendorMemoryContext = await buildOcrVendorMemoryContext(options.companyId);
    let primaryProvider: 'openai' | 'gemini' | 'openai+gemini-consensus' | 'openrouter' | 'none' = 'none';
    let consensusResult: OcrResult | null = null;

    // Plan D — TRIPLE-OCR CONSENSUS: when both OpenAI and Gemini are
    // configured, fire both in parallel. Total latency = max(OpenAI, Gemini)
    // ≈ 3s instead of OpenAI alone ~1-3s (small cost, big accuracy gain).
    //
    // Outcomes:
    //   - Both succeed AND agree → very high confidence, skip Pro verify
    //   - Both succeed, disagree → keep OpenAI (paid, generally better),
    //     surface disagreement via detectOcrDisagreement → human review
    //   - Only one succeeds → use it (sequential-fallback parity)
    //   - Both fail → OpenRouter last resort (unchanged)
    //
    // Cost: Gemini Flash is free quota — no $$ added. OpenAI charge
    // unchanged. Net: +0s avg, +0 cost, +significant accuracy.
    const promptForVision = buildVerifyPrompt(`${ocrPrompt}${azureContext}${vendorMemoryContext}`, undefined, false);
    const wantParallel = isOpenAIVisionConfigured() && googleAiKey && mimeType !== 'text/plain';

    if (wantParallel) {
      logger.info('[OCR] Parallel consensus: OpenAI + Gemini', { mimeType });
      const [openaiSettled, geminiSettled] = await Promise.allSettled([
        callOpenAIVision(mimeType, imageBase64, promptForVision).then((c) => c.ok ? { text: c.text, model: c.model, call: c } : null),
        callGemini(mimeType, imageBase64, promptForVision, ocrTimeoutMs, geminiScanModel).then((text) => text ? { text, model: geminiScanModel } : null),
      ]);
      const openaiHit = openaiSettled.status === 'fulfilled' ? openaiSettled.value : null;
      const geminiHit = geminiSettled.status === 'fulfilled' ? geminiSettled.value : null;

      if (openaiHit && geminiHit) {
        const openaiParsed = parseOcrJson(openaiHit.text, emptyResult, azureResult?.content);
        const geminiParsed = parseOcrJson(geminiHit.text, emptyResult, azureResult?.content);
        if (openaiParsed && geminiParsed) {
          const disagreements = detectOcrDisagreement(openaiParsed, geminiParsed);
          consensusResult = {
            ...openaiParsed,
            extractionProvider: disagreements.length === 0
              ? 'openai+gemini-consensus'
              : 'openai+gemini-disagree',
            verificationStage: disagreements.length === 0 ? 'pro' : 'fast',
            validationWarnings: [
              ...(openaiParsed.validationWarnings ?? []),
              ...disagreements.map((d) => `⚠️ ตรวจซ้ำพบความต่าง — ${d}`),
            ],
            needsHumanReview: openaiParsed.needsHumanReview || disagreements.length > 0,
          };
          primaryProvider = 'openai+gemini-consensus';
          logger.info('[OCR] Consensus result', {
            agreed: disagreements.length === 0,
            disagreements: disagreements.length,
          });
        } else if (openaiParsed) {
          consensusResult = openaiParsed;
          raw = openaiHit.text;
          primaryProvider = 'openai';
        } else if (geminiParsed) {
          consensusResult = geminiParsed;
          raw = geminiHit.text;
          primaryProvider = 'gemini';
        }
      } else if (openaiHit) {
        raw = openaiHit.text;
        primaryProvider = 'openai';
        logger.info('[OCR] OpenAI succeeded; Gemini failed/skipped', { chars: raw.length });
      } else if (geminiHit) {
        raw = geminiHit.text;
        primaryProvider = 'gemini';
        logger.info('[OCR] Gemini succeeded; OpenAI failed', { chars: raw.length });
      } else {
        logger.warn('[OCR] Both OpenAI and Gemini failed, falling back to OpenRouter');
      }
    } else if (isOpenAIVisionConfigured() && mimeType !== 'text/plain') {
      // OpenAI-only path (Gemini unavailable)
      try {
        logger.info('[OCR] Trying OpenAI vision (primary, no Gemini)', { mimeType });
        const openaiCall = await callOpenAIVision(mimeType, imageBase64, promptForVision);
        if (openaiCall.ok) {
          raw = openaiCall.text;
          primaryProvider = 'openai';
        } else {
          logger.warn('[OCR] OpenAI failed', { error: openaiCall.error });
        }
      } catch (openaiErr) {
        logger.warn('[OCR] OpenAI threw', { error: String(openaiErr) });
      }
    } else if (googleAiKey) {
      // Gemini-only path (OpenAI unavailable, e.g. text/plain mode)
      try {
        const fastModel = mimeType === 'text/plain' ? geminiFastModel : geminiScanModel;
        logger.info('[OCR] Trying Gemini API (no OpenAI for this mode)', { mimeType, model: fastModel });
        raw = await callGemini(mimeType, imageBase64, promptForVision, ocrTimeoutMs, fastModel);
        primaryProvider = 'gemini';
      } catch (geminiErr) {
        logger.warn('[OCR] Gemini failed, falling back to OpenRouter', { error: String(geminiErr) });
      }
    }

    // Fallback: OpenRouter free models (last resort)
    if (!raw) {
      primaryProvider = 'openrouter';
      const isText = mimeType === 'text/plain';
      const userContent: OpenRouterMessage['content'] = isText
        ? `${ocrPrompt}${vendorMemoryContext}\n\nDocument text:\n${Buffer.from(imageBase64, 'base64').toString('utf-8')}`
        : azureResult?.ok
          ? `${ocrPrompt}${azureContext}${vendorMemoryContext}`
        : [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: `${ocrPrompt}${vendorMemoryContext}` },
          ];
      const messages: OpenRouterMessage[] = [{ role: 'user', content: userContent }];
      const isPdf = mimeType === 'application/pdf';
      const models = isText ? CHAT_MODELS : isPdf ? PDF_MODELS : VISION_MODELS;
      raw = await callOpenRouter(models, messages, 2000, ocrTimeoutMs);
    }

    // Prefer the consensus result from the parallel OpenAI+Gemini block.
    // Falls through to parseOcrJson(raw) when consensus wasn't built
    // (e.g. only one provider succeeded, or text/plain mode).
    let result = consensusResult ?? parseOcrJson(raw, emptyResult, azureResult?.content);
    if (!result) {
      if (azureResult?.ok) {
        const fields = azureResult.fields as Record<string, unknown>;
        const fallback: OcrResult = {
          ...emptyResult,
          documentType: 'invoice',
          documentTypeLabel: 'เอกสารบัญชี',
          supplierName: String(fields.VendorName ?? fields.MerchantName ?? ''),
          supplierTaxId: String(fields.VendorTaxId ?? ''),
          invoiceNumber: String(fields.InvoiceId ?? fields.ReceiptId ?? ''),
          invoiceDate: String(fields.InvoiceDate ?? fields.TransactionDate ?? ''),
          subtotal: Number(fields.SubTotal ?? 0),
          vatAmount: Number(fields.TotalTax ?? 0),
          total: Number(fields.InvoiceTotal ?? fields.Total ?? fields.AmountDue ?? 0),
          confidence: azureResult.confidence && azureResult.confidence > 0.7 ? 'medium' : 'low',
          rawText: azureResult.content,
          extractionProvider: 'azure',
          verificationStage: 'fallback',
        };
        fallback.validationWarnings = validateOcrResult(fallback);
        fallback.needsHumanReview = shouldHumanReviewOcr(fallback);
        return fallback;
      }
      return emptyResult;
    }
    // Label reflects which LLM actually parsed (helps debug + benchmark).
    const providerLabel = primaryProvider === 'openai'
      ? 'openai-verify'
      : primaryProvider === 'gemini'
        ? 'gemini-verify'
        : 'openrouter';
    result.extractionProvider = azureResult?.ok ? `azure+${providerLabel}` : providerLabel;
    result.verificationStage = 'fast';
    if (!hasUsefulOcrData(result) && azureResult?.ok) {
      result.rawText = azureResult.content;
    }

    void recordOcrBenchmark({
      companyId: options.companyId,
      intakeId: options.intakeId,
      documentType: result.documentType,
      provider: azureResult?.ok ? 'azure+gemini-flash' : 'gemini-flash',
      model: mimeType === 'text/plain' ? geminiFastModel : geminiScanModel,
      latencyMs: 0,
      confidence: result.confidence,
      stage: 'primary',
    });

    const ocrPolicy = await getOcrPolicyForCompany(options.companyId);

    // Engine routing: re-OCR Thai-heavy doc types with Typhoon when initial confidence is not high
    // Gated by plan tier (business+) and monthly doc quota.
    if (
      engineRouting !== 'legacy'
      && mimeType !== 'text/plain'
      && isTyphoonConfigured()
      && THAI_HEAVY_TYPES.has(result.documentType)
      && result.confidence !== 'high'
      && ocrPolicy.allowTyphoon
    ) {
      try {
        logger.info('[OCR] Routing to Typhoon for Thai-heavy doc', {
          documentType: result.documentType,
          confidence: result.confidence,
        });
        const typhoonCall = await callTyphoonVision(
          mimeType,
          imageBase64,
          buildVerifyPrompt(`${ocrPrompt}${vendorMemoryContext}`, result, false),
        );
        void recordOcrBenchmark({
          companyId: options.companyId,
      intakeId: options.intakeId,
          documentType: result.documentType,
          provider: 'typhoon',
          model: typhoonCall.model,
          costUsd: estimateTyphoonCostUsd(typhoonCall),
          latencyMs: typhoonCall.latencyMs,
          confidence: result.confidence,
          stage: 'verify',
          inputTokens: typhoonCall.promptTokens,
          outputTokens: typhoonCall.completionTokens,
        });
        if (typhoonCall.ok) {
          const typhoonResult = parseOcrJson(typhoonCall.text, result, azureResult?.content);
          if (typhoonResult && hasUsefulOcrData(typhoonResult)) {
            typhoonResult.extractionProvider = `typhoon+${result.extractionProvider}`;
            typhoonResult.verificationStage = 'fast';
            result = pickBestResult(result, typhoonResult);
          }
        }
      } catch (typhoonErr) {
        logger.warn('[OCR] Typhoon routing failed', { error: String(typhoonErr) });
      }
    }

    if (mimeType !== 'text/plain' && (looksLikeUnclassifiedSlip(result) || looksLikeBankSlipCandidate(result))) {
      const slipResult = await ocrBankTransferSlip(imageBase64, mimeType, options.qrText);
      if (paymentAmountFromOcr(slipResult) > 0 || slipResult.invoiceNumber || slipResult.payment?.reference) {
        logger.info('[OCR] Reclassified document as bank transfer slip', {
          originalType: result.documentType,
          originalLabel: result.documentTypeLabel,
          originalSupplier: result.supplierName,
        });
        return slipResult;
      }
    }

    // Fast-path: skip the verify pass when this exact vendor has 3+
    // historical purchases AND the current extraction matches their
    // patterns (taxId exact, total within plausible range, no warnings).
    // Saves 5-10s + ~$0.005 per repeat-vendor doc. The verify pass is
    // an accuracy net for unknowns; repeat vendors don't need it.
    const knownVendor = await findExactVendorMemory(
      options.companyId,
      result.supplierTaxId,
      result.supplierName,
    );
    const fastPathSkip = knownVendor && alignsWithKnownVendor(result, knownVendor);
    if (fastPathSkip) {
      logger.info('[OCR] fast-path: known vendor matches — skipping verify', {
        supplierTaxId: knownVendor.supplierTaxId,
        vendorHistoryCount: knownVendor.count,
        total: result.total,
        avgHistoricalTotal: knownVendor.totalRange.avg,
      });
      // Tag the result so downstream telemetry can measure fast-path hits.
      result.extractionProvider = `${result.extractionProvider ?? 'unknown'}+fast-known-vendor`;
    }

    // Consensus already agreed = 2 independent models converged on the same
    // answer. That IS a verify pass, just done in parallel up front. No
    // need to fire Pro verify (would just spend latency to re-confirm).
    const consensusAgreed = result.extractionProvider === 'openai+gemini-consensus';

    if (!fastPathSkip && !consensusAgreed && shouldEscalateOcr(result, options)) {
      const preferOpenAI = engineRouting !== 'legacy' && isOpenAIVisionConfigured() && ocrPolicy.allowOpenAI;
      if (ocrPolicy.overQuota) {
        logger.warn('[OCR] over monthly quota — silent fallback to standard tier', {
          companyId: options.companyId,
          docsUsedThisMonth: ocrPolicy.docsUsedThisMonth,
          monthlyDocLimit: ocrPolicy.monthlyDocLimit,
        });
      }
      if (preferOpenAI) {
        try {
          logger.info('[OCR] Escalating to OpenAI vision', {
            confidence: result.confidence,
            warnings: result.validationWarnings?.length ?? 0,
            documentType: result.documentType,
          });
          const openaiCall = await callOpenAIVision(
            mimeType,
            imageBase64,
            buildVerifyPrompt(`${ocrPrompt}${azureContext}${vendorMemoryContext}`, result, true),
          );
          void recordOcrBenchmark({
            companyId: options.companyId,
      intakeId: options.intakeId,
            documentType: result.documentType,
            provider: 'gpt4o',
            model: openaiCall.model,
            costUsd: estimateOpenAICostUsd(openaiCall),
            latencyMs: openaiCall.latencyMs,
            confidence: result.confidence,
            stage: 'escalation',
            inputTokens: openaiCall.promptTokens,
            outputTokens: openaiCall.completionTokens,
          });
          if (openaiCall.ok) {
            const openaiResult = parseOcrJson(openaiCall.text, result, azureResult?.content);
            if (openaiResult && hasUsefulOcrData(openaiResult)) {
              const disagreements = detectOcrDisagreement(result, openaiResult);
              if (disagreements.length > 0) {
                logger.warn('[OCR] verify disagreement (gpt4o)', { disagreements, prior: result.extractionProvider });
              }
              result = {
                ...openaiResult,
                extractionProvider: `gpt4o-verify+${result.extractionProvider ?? ''}`,
                verificationStage: 'pro',
                validationWarnings: [
                  ...(openaiResult.validationWarnings ?? []),
                  ...disagreements.map((d) => `⚠️ ตรวจซ้ำพบความต่าง — ${d}`),
                ],
                needsHumanReview: openaiResult.needsHumanReview || disagreements.length > 0,
              };
            }
          }
        } catch (openaiErr) {
          logger.warn('[OCR] OpenAI escalation failed; keeping prior result', { error: String(openaiErr) });
        }
      } else if (googleAiKey && proVerifyEnabled) {
        try {
          logger.info('[OCR] Escalating to Gemini Pro verify', {
            model: geminiProVerifyModel,
            confidence: result.confidence,
            warnings: result.validationWarnings?.length ?? 0,
            pageCount: options.pageCount,
          });
          const proRaw = await callGemini(
            mimeType,
            imageBase64,
            buildVerifyPrompt(`${ocrPrompt}${azureContext}${vendorMemoryContext}`, result, true),
            ocrTimeoutMs,
            geminiProVerifyModel,
          );
          const proResult = parseOcrJson(proRaw, result, azureResult?.content);
          void recordOcrBenchmark({
            companyId: options.companyId,
      intakeId: options.intakeId,
            documentType: result.documentType,
            provider: 'gemini-pro',
            model: geminiProVerifyModel,
            latencyMs: 0,
            confidence: proResult?.confidence ?? result.confidence,
            stage: 'escalation',
          });
          if (proResult && hasUsefulOcrData(proResult)) {
            const disagreements = detectOcrDisagreement(result, proResult);
            if (disagreements.length > 0) {
              logger.warn('[OCR] verify disagreement (gemini-pro)', { disagreements, prior: result.extractionProvider });
            }
            result = {
              ...proResult,
              extractionProvider: azureResult?.ok ? 'azure+gemini-pro-verify' : 'gemini-pro-verify',
              verificationStage: 'pro',
              validationWarnings: [
                ...(proResult.validationWarnings ?? []),
                ...disagreements.map((d) => `⚠️ ตรวจซ้ำพบความต่าง — ${d}`),
              ],
              needsHumanReview: proResult.needsHumanReview || disagreements.length > 0,
            };
          }
        } catch (proErr) {
          logger.warn('[OCR] Gemini Pro verify failed; keeping fast result', { error: String(proErr) });
        }
      }
    }

    result.validationWarnings = result.validationWarnings?.length ? result.validationWarnings : validateOcrResult(result);
    result = await applyBusinessValidation(result, options.companyId);
    result = await convertForeignCurrencyToThb(result);
    result.needsHumanReview = shouldHumanReviewOcr(result);
    return result;
  } catch (err) {
    logger.error('ocrSupplierInvoice failed', { error: err instanceof Error ? err.message : String(err) });
    return emptyResult;
  }
}

export async function testOcrProvider(): Promise<{ ok: boolean; provider: string; error?: string; sample?: OcrResult }> {
  const sampleText = `ใบกำกับภาษี / TAX INVOICE
บริษัท ตัวอย่าง จำกัด
เลขประจำตัวผู้เสียภาษี 0105567000000
เลขที่ INV-TEST-001
วันที่ 2026-04-29
ยอดรวม 1070.00
ภาษีมูลค่าเพิ่ม 70.00`;

  if (!googleAiKey && !apiKey) {
    return { ok: false, provider: 'none', error: 'GOOGLE_AI_API_KEY and OPENROUTER_API_KEY are not configured' };
  }

  try {
    const sample = await ocrSupplierInvoice(Buffer.from(sampleText, 'utf-8').toString('base64'), 'text/plain');
    const ok = !!(sample.supplierName || sample.invoiceNumber || sample.total);
    return {
      ok,
      provider: [
        isAzureDocumentIntelligenceConfigured() ? 'azure-ready' : null,
        googleAiKey ? 'gemini' : null,
        !googleAiKey && apiKey ? 'openrouter' : null,
      ].filter(Boolean).join('+') || 'none',
      sample,
      error: ok ? undefined : 'OCR provider returned no extractable fields',
    };
  } catch (err) {
    return {
      ok: false,
      provider: [
        isAzureDocumentIntelligenceConfigured() ? 'azure-ready' : null,
        googleAiKey ? 'gemini' : null,
        !googleAiKey && apiKey ? 'openrouter' : null,
      ].filter(Boolean).join('+') || 'none',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
