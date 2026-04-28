import prisma from '../config/database';
import { logger } from '../config/logger';

const apiKey = process.env.OPENROUTER_API_KEY ?? '';
const baseUrl = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
const googleAiKey = process.env.GOOGLE_AI_API_KEY ?? '';
const chatTimeoutMs = Number(process.env.AI_CHAT_TIMEOUT_MS ?? 12000);
const ocrTimeoutMs = Number(process.env.AI_OCR_TIMEOUT_MS ?? 30000);
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

// Call Google Gemini API directly — supports image/jpeg, application/pdf inline
async function callGemini(mimeType: string, base64Data: string, prompt: string, timeoutMs = ocrTimeoutMs): Promise<string> {
  const model = process.env.GOOGLE_AI_OCR_MODEL ?? 'gemini-2.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleAiKey}`;
  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64Data } },
        { text: prompt },
      ],
    }],
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
): Promise<OcrResult> {
  if (!apiKey && !googleAiKey) {
    return {
      supplierName: '',
      supplierTaxId: '',
      supplierBranch: '00000',
      invoiceNumber: '',
      invoiceDate: '',
      subtotal: 0,
      vatAmount: 0,
      total: 0,
      confidence: 'low',
    };
  }

  const emptyResult: OcrResult = {
    supplierName: '',
    supplierTaxId: '',
    supplierBranch: '00000',
    invoiceNumber: '',
    invoiceDate: '',
    subtotal: 0,
    vatAmount: 0,
    total: 0,
    confidence: 'low',
  };

  const ocrPrompt = `You are an OCR assistant for Thai tax invoices. Extract all available information from this document and return ONLY a JSON object, no other text.

Rules:
- Extract whatever is visible, even if partial
- For missing fields use empty string "" or 0
- supplierTaxId: 13-digit Thai tax ID (remove dashes/spaces)
- invoiceDate: convert to YYYY-MM-DD format
- confidence: "high" if most fields found, "medium" if some fields found, "low" only if document is completely unreadable

{
  "supplierName": "company name",
  "supplierTaxId": "1234567890123",
  "supplierBranch": "00000",
  "invoiceNumber": "document number",
  "invoiceDate": "YYYY-MM-DD",
  "subtotal": 0,
  "vatAmount": 0,
  "total": 0,
  "confidence": "high|medium|low",
  "rawText": "all text found in document"
}`;

  try {
    let raw = '';

    // Try Gemini first (handles image + PDF natively, best Thai OCR)
    if (googleAiKey && mimeType !== 'text/plain') {
      try {
        logger.info('[OCR] Trying Gemini API', { mimeType });
        raw = await callGemini(mimeType, imageBase64, ocrPrompt, ocrTimeoutMs);
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
        : [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: ocrPrompt },
          ];
      const messages: OpenRouterMessage[] = [{ role: 'user', content: userContent }];
      const isPdf = mimeType === 'application/pdf';
      const models = isText ? CHAT_MODELS : isPdf ? PDF_MODELS : VISION_MODELS;
      raw = await callOpenRouter(models, messages, 2000, ocrTimeoutMs);
    }

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('OCR: no JSON found in response', { raw: raw.slice(0, 200) });
      return emptyResult;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<OcrResult>;
    return {
      supplierName: parsed.supplierName ?? '',
      supplierTaxId: parsed.supplierTaxId ?? '',
      supplierBranch: parsed.supplierBranch ?? '00000',
      invoiceNumber: parsed.invoiceNumber ?? '',
      invoiceDate: parsed.invoiceDate ?? '',
      subtotal: Number(parsed.subtotal ?? 0),
      vatAmount: Number(parsed.vatAmount ?? 0),
      total: Number(parsed.total ?? 0),
      confidence: parsed.confidence ?? 'low',
      rawText: parsed.rawText,
    };
  } catch (err) {
    logger.error('ocrSupplierInvoice failed', { error: err instanceof Error ? err.message : String(err) });
    return emptyResult;
  }
}
