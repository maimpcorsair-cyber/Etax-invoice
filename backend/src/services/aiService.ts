import prisma from '../config/database';
import { logger } from '../config/logger';
import { analyzeAccountingDocumentWithAzure, isAzureDocumentIntelligenceConfigured } from './azureDocumentService';

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
async function callGemini(
  mimeType: string,
  base64Data: string,
  prompt: string,
  timeoutMs = ocrTimeoutMs,
  model = geminiScanModel,
): Promise<string> {
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
    generationConfig: { temperature: 0.1, maxOutputTokens: 2000, responseMimeType: 'application/json' },
  };
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json() as { candidates?: Array<{ content: { parts: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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
    description?: string;
  };
}

interface OcrOptions {
  pageCount?: number;
  source?: 'text_pdf' | 'scan_pdf' | 'image' | 'text' | 'unknown';
  qrText?: string;
  companyId?: string;
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
          'X-Title': 'e-Tax Invoice Pinuch',
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
      const key = row.supplierTaxId && row.supplierTaxId !== '0000000000000'
        ? row.supplierTaxId
        : row.supplierName.trim().toLowerCase();
      const existing = byVendor.get(key);
      if (existing) {
        existing.count += 1;
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

    const knownVendor = await prisma.purchaseInvoice.findFirst({
      where: {
        companyId,
        OR: ([
          result.supplierTaxId ? { supplierTaxId: result.supplierTaxId } : undefined,
          result.supplierName ? { supplierName: { contains: result.supplierName, mode: 'insensitive' } } : undefined,
        ].filter(Boolean) as any),
      },
      orderBy: { createdAt: 'desc' },
      select: { supplierName: true, supplierTaxId: true, supplierBranch: true, category: true, vatType: true },
    });

    if (knownVendor) {
      if (!result.supplierTaxId || result.supplierTaxId === '0000000000000') result.supplierTaxId = knownVendor.supplierTaxId;
      if (!result.supplierBranch) result.supplierBranch = knownVendor.supplierBranch || '00000';
      if (!result.postingSuggestion && knownVendor.category) result.postingSuggestion = knownVendor.category;
      if (!result.taxTreatment && knownVendor.vatType === 'vat7') result.taxTreatment = 'input_vat_claimable';
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

function parseOcrJson(raw: string, emptyResult: OcrResult, azureContent?: string): OcrResult | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn('OCR: no JSON found in response', { raw: raw.slice(0, 200) });
    return null;
  }

  let parsed: Partial<OcrResult>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Partial<OcrResult>;
  } catch (err) {
    logger.warn('OCR: invalid JSON response', {
      error: err instanceof Error ? err.message : String(err),
      raw: raw.slice(0, 500),
    });
    return null;
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

  const [company, salesAgg, purchaseAgg, overdueInvoices, recentInvoices] = await Promise.all([
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

export async function askPinuch(
  companyId: string,
  companyName: string,
  taxId: string,
  userQuestion: string,
): Promise<string> {
  if (!apiKey) {
    return '⚠️ AI ยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแล';
  }

  try {
    const context = await buildCompanyContext(companyId);

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `คุณคือ "พี่นุช" ผู้ช่วยบัญชีอัจฉริยะสำหรับระบบ e-Tax Invoice ของไทย
คุณช่วยเหลือพนักงานบัญชีในการตอบคำถามเกี่ยวกับภาษีมูลค่าเพิ่ม ใบกำกับภาษี และข้อมูลทางการเงิน
ตอบเป็นภาษาไทยเสมอ กระชับและเข้าใจง่าย
ถ้าผู้ใช้ถามหาลิงก์, ทางเข้า, login, เปิดระบบ, ดาวน์โหลดเอกสาร หรือดูเอกสาร ให้แนบลิงก์ระบบที่เกี่ยวข้องเสมอ:
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

    const answer = await callOpenRouter(CHAT_MODELS, messages, 700, chatTimeoutMs);
    return answer || 'ขอโทษ ไม่สามารถตอบได้ในขณะนี้';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('askPinuch failed', { error: msg, companyId });
    return 'ขอโทษ ตอนนี้พี่นุชตอบช้า/ไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้งในอีกสักครู่';
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
    "description": "short extracted description"
  },
  "rawText": "all text found in document"
}`;

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

    // Try Gemini first (verifies Azure OCR when available; otherwise handles text, image, and PDF directly)
    if (googleAiKey) {
      try {
        const fastModel = mimeType === 'text/plain' ? geminiFastModel : geminiScanModel;
        logger.info('[OCR] Trying Gemini API', { mimeType, model: fastModel, source: options.source });
        raw = await callGemini(mimeType, imageBase64, buildVerifyPrompt(`${ocrPrompt}${azureContext}${vendorMemoryContext}`), ocrTimeoutMs, fastModel);
        logger.info('[OCR] Gemini responded', { chars: raw.length });
      } catch (geminiErr) {
        logger.warn('[OCR] Gemini failed, falling back to OpenRouter', { error: String(geminiErr) });
      }
    }

    // Fallback: OpenRouter free models
    if (!raw) {
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

    let result = parseOcrJson(raw, emptyResult, azureResult?.content);
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
    result.extractionProvider = azureResult?.ok ? 'azure+gemini-verify' : googleAiKey ? 'gemini-verify' : 'openrouter';
    result.verificationStage = 'fast';
    if (!hasUsefulOcrData(result) && azureResult?.ok) {
      result.rawText = azureResult.content;
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

    if (googleAiKey && proVerifyEnabled && shouldEscalateOcr(result, options)) {
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
        if (proResult && hasUsefulOcrData(proResult)) {
          result = {
            ...proResult,
            extractionProvider: azureResult?.ok ? 'azure+gemini-pro-verify' : 'gemini-pro-verify',
            verificationStage: 'pro',
          };
        }
      } catch (proErr) {
        logger.warn('[OCR] Gemini Pro verify failed; keeping fast result', { error: String(proErr) });
      }
    }

    result.validationWarnings = result.validationWarnings?.length ? result.validationWarnings : validateOcrResult(result);
    result = await applyBusinessValidation(result, options.companyId);
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
