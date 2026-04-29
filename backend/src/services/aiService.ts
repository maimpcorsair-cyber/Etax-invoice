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
    generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
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
  documentType: 'tax_invoice' | 'receipt' | 'invoice' | 'billing_note' | 'withholding_tax' | 'payment_advice' | 'bank_transfer' | 'credit_note' | 'debit_note' | 'other';
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
}

interface OcrOptions {
  pageCount?: number;
  source?: 'text_pdf' | 'scan_pdf' | 'image' | 'text' | 'unknown';
  qrText?: string;
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
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
  if (result.supplierTaxId && !isValidThaiTaxId(result.supplierTaxId)) {
    warnings.push('เลขผู้เสียภาษีอาจไม่ถูกต้องตาม checksum');
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

  const parsed = JSON.parse(jsonMatch[0]) as Partial<OcrResult>;
  const allowedTypes = new Set<OcrResult['documentType']>([
    'tax_invoice',
    'receipt',
    'invoice',
    'billing_note',
    'withholding_tax',
    'payment_advice',
    'bank_transfer',
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
- documentType must be one of:
  - "tax_invoice": Thai tax invoice / ใบกำกับภาษี
  - "receipt": receipt / ใบเสร็จรับเงิน
  - "invoice": invoice / invoice only / ใบแจ้งหนี้
  - "billing_note": billing note / ใบวางบิล / ใบเรียกเก็บเงิน
  - "withholding_tax": withholding tax certificate / หนังสือรับรองหัก ณ ที่จ่าย / 50 ทวิ
  - "payment_advice": payment advice / remittance advice / หลักฐานแจ้งการชำระเงิน
  - "bank_transfer": bank transfer slip / mobile banking transfer confirmation / สลิปโอนเงิน / หลักฐานการโอน
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

{
  "documentType": "tax_invoice|receipt|invoice|billing_note|withholding_tax|payment_advice|bank_transfer|credit_note|debit_note|other",
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

    // Try Gemini first (verifies Azure OCR when available; otherwise handles text, image, and PDF directly)
    if (googleAiKey) {
      try {
        const fastModel = mimeType === 'text/plain' ? geminiFastModel : geminiScanModel;
        logger.info('[OCR] Trying Gemini API', { mimeType, model: fastModel, source: options.source });
        raw = await callGemini(mimeType, imageBase64, buildVerifyPrompt(`${ocrPrompt}${azureContext}`), ocrTimeoutMs, fastModel);
        logger.info('[OCR] Gemini responded', { chars: raw.length });
      } catch (geminiErr) {
        logger.warn('[OCR] Gemini failed, falling back to OpenRouter', { error: String(geminiErr) });
      }
    }

    // Fallback: OpenRouter free models
    if (!raw) {
      const isText = mimeType === 'text/plain';
      const userContent: OpenRouterMessage['content'] = isText
        ? `${ocrPrompt}\n\nDocument text:\n${Buffer.from(imageBase64, 'base64').toString('utf-8')}`
        : azureResult?.ok
          ? `${ocrPrompt}${azureContext}`
        : [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: ocrPrompt },
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

    if (mimeType !== 'text/plain' && looksLikeUnclassifiedSlip(result)) {
      const slipResult = await ocrBankTransferSlip(imageBase64, mimeType, options.qrText);
      if (paymentAmountFromOcr(slipResult) > 0 || slipResult.invoiceNumber || slipResult.payment?.reference) {
        return slipResult;
      }
    }

    if (googleAiKey && shouldEscalateOcr(result, options)) {
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
          buildVerifyPrompt(`${ocrPrompt}${azureContext}`, result, true),
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
