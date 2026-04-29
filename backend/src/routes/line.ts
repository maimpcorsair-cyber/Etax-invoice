import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';
import prisma from '../config/database';
import redis from '../config/redis';
import { logger } from '../config/logger';
import {
  sendLineText,
  replyLineText,
  sendLineFlexMessage,
  sendLineTextWithQuickReply,
  buildOverdueFlexCard,
  buildOcrConfirmFlexCard,
  buildInvoiceFlexCard,
  verifyLineSignature,
  OverdueInvoice,
} from '../services/lineService';
import { askPinuch, buildCompanyContext, ocrBankTransferSlip, ocrSupplierInvoice, testOcrProvider, OcrResult } from '../services/aiService';
import { setupRichMenu } from '../services/richMenuService';
import { calculateInvoicePaymentSummary } from '../services/paymentService';

export const lineRouter = Router();

const OTP_TTL = 600; // 10 minutes

const REQUIRED_OCR_FIELDS: Array<{ key: keyof OcrResult; label: string; hint: string }> = [
  { key: 'supplierName',  label: 'ชื่อผู้ขาย',                      hint: 'เช่น บริษัท ABC จำกัด' },
  { key: 'supplierTaxId', label: 'เลขผู้เสียภาษีผู้ขาย (13 หลัก)', hint: 'เช่น 0105567890123' },
  { key: 'invoiceDate',   label: 'วันที่ในใบกำกับภาษี',              hint: 'เช่น 27/04/2567 หรือ 2026-04-27' },
  { key: 'total',         label: 'ยอดรวมทั้งสิ้น (บาท)',            hint: 'เช่น 10700' },
];

type PaymentMatchResult = {
  ok: boolean;
  message: string;
  status: 'saved' | 'needs_review' | 'failed';
  targetId?: string;
  targetType?: 'sales_invoice' | 'purchase_invoice';
  warnings?: string[];
};

interface LineSession {
  state: 'awaiting_field';
  currentField: string;
  pendingFields: string[];
  data: Partial<OcrResult> & { companyId?: string };
}

interface LineEditSession {
  state: 'editing_field';
  purchaseInvoiceId: string;
  currentField: string;
}

function getMissingFields(result: OcrResult): typeof REQUIRED_OCR_FIELDS {
  return REQUIRED_OCR_FIELDS.filter(f => {
    const val = result[f.key];
    return !val || val === '' || val === 0;
  });
}

function detectLineFileMimeType(buffer: Buffer, headerContentType: string, messageType?: string): string {
  const header = headerContentType.toLowerCase();
  if (header.includes('pdf') || buffer.slice(0, 4).toString() === '%PDF') return 'application/pdf';
  if (header.includes('png') || buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (header.includes('webp') || buffer.slice(0, 4).toString() === 'RIFF') return 'image/webp';
  if (header.includes('jpeg') || header.includes('jpg') || (buffer[0] === 0xff && buffer[1] === 0xd8)) return 'image/jpeg';
  if (messageType === 'image') return 'image/jpeg';
  return headerContentType || 'application/octet-stream';
}

function compactOcrSessionData(result: OcrResult, companyId: string): OcrResult & { companyId: string } {
  return {
    ...result,
    companyId,
    rawText: result.rawText ? result.rawText.slice(0, 1000) : undefined,
  };
}

async function testRedisSessionWrite() {
  const key = `health:ocr-session:${Date.now()}`;
  await redis.setex(key, 30, JSON.stringify({ ok: true, ts: Date.now() }));
  await redis.del(key);
  return 'SETEX_OK';
}

function buildOcrTextSummary(result: OcrResult, note?: string) {
  const fmt = (value: number) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value || 0);
  const warnings = result.validationWarnings?.length
    ? `\n\n⚠️ หมายเหตุ:\n${result.validationWarnings.map((warning) => `- ${warning}`).join('\n')}`
    : '';
  const prefix = note ? `${note}\n\n` : '';
  return `${prefix}อ่านเอกสารได้แล้วครับ แต่ยังบันทึก/ยืนยันในระบบไม่ได้ตอนนี้\n\n` +
    `ประเภท: ${result.documentTypeLabel || result.documentType || '-'}\n` +
    `ผู้ขาย: ${result.supplierName || '-'}\n` +
    `เลขผู้เสียภาษี: ${result.supplierTaxId || '-'}\n` +
    `เลขที่เอกสาร: ${result.invoiceNumber || '-'}\n` +
    `วันที่: ${result.invoiceDate || '-'}\n` +
    `ก่อน VAT: ${fmt(result.subtotal)}\n` +
    `VAT: ${fmt(result.vatAmount)}\n` +
    `รวม: ${fmt(result.total)}\n` +
    `ความมั่นใจ: ${result.confidence}${warnings}`;
}

async function savePurchaseFromLineOcr(lineUserId: string, result: OcrResult, companyId: string, fallbackId: string) {
  const link = await prisma.lineUserLink.findUnique({
    where: { lineUserId },
    select: { userId: true },
  });

  if (!link) {
    throw new Error('Line user link not found while saving OCR purchase invoice');
  }

  const invoiceDate = result.invoiceDate ? new Date(result.invoiceDate) : new Date();
  const invoiceNumber = result.invoiceNumber || `LINE-${fallbackId}`;
  const supplierTaxId = result.supplierTaxId || '0000000000000';

  try {
    return await prisma.purchaseInvoice.create({
      data: {
        companyId,
        supplierName: result.supplierName || 'ไม่ระบุ',
        supplierTaxId,
        supplierBranch: result.supplierBranch || '00000',
        invoiceNumber,
        invoiceDate,
        subtotal: result.subtotal,
        vatAmount: result.vatAmount,
        total: result.total,
        vatType: 'vat7',
        category: result.documentTypeLabel || result.documentType,
        description: `นำเข้าจาก LINE OCR: ${result.documentTypeLabel || result.documentType || 'เอกสารซื้อ'}`,
        notes: [
          `AI confidence: ${result.confidence}`,
          result.extractionProvider ? `Provider: ${result.extractionProvider}` : null,
          result.validationWarnings?.length ? `Warnings: ${result.validationWarnings.join('; ')}` : null,
        ].filter(Boolean).join('\n'),
        createdBy: link.userId,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.purchaseInvoice.findFirst({
        where: { companyId, supplierTaxId, invoiceNumber },
      });
      if (existing) return existing;
    }
    throw err;
  }
}

async function replySavedPurchase(lineUserId: string, result: OcrResult, purchaseId: string, prefix = '✅ บันทึกเอกสารเรียบร้อย!') {
  const fmt = (n: number) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);
  const typeLine = result.documentTypeLabel ? `\n🧾 ประเภท: ${result.documentTypeLabel}` : '';
  const vatLine = result.vatAmount > 0 ? `\n💰 ภาษีซื้อ ${fmt(result.vatAmount)}` : '';
  await sendLineTextWithQuickReply(
    lineUserId,
    `${prefix}${typeLine}\n📋 ${result.supplierName || '-'}${vatLine}\n💵 ยอดรวม ${fmt(result.total)}`,
    [
      { label: '✏️ แก้ไขข้อมูล', data: `edit_purchase:${purchaseId}`, displayText: 'แก้ไขข้อมูล' },
      { label: '✅ เสร็จสิ้น', text: 'เสร็จสิ้น' },
    ],
  );
}

function paymentAmount(result: OcrResult) {
  return Number(result.payment?.amount ?? result.total ?? 0);
}

function paymentDate(result: OcrResult) {
  return result.payment?.paidAt || result.invoiceDate || new Date().toISOString().split('T')[0];
}

function paymentReference(result: OcrResult) {
  return result.payment?.reference || result.invoiceNumber || '';
}

function closeAmount(left: number, right: number) {
  return Math.abs(left - right) <= 1;
}

async function handleBankTransferDocument(lineUserId: string, result: OcrResult, companyId: string, userId: string): Promise<PaymentMatchResult> {
  const amount = paymentAmount(result);
  if (!amount || amount <= 0) {
    return {
      ok: false,
      status: 'needs_review',
      message: 'อ่านสลิปโอนได้ แต่ยังไม่พบยอดเงินที่ชัดเจน กรุณาตรวจในหน้า Input VAT',
      warnings: ['missing:payment.amount'],
    };
  }

  const direction = result.payment?.direction ?? 'unknown';
  const paidAt = new Date(paymentDate(result));
  const reference = paymentReference(result) || undefined;
  const counterparty = [result.payment?.fromName, result.payment?.toName, result.supplierName]
    .filter(Boolean)
    .join(' ');

  if (direction !== 'outgoing') {
    const candidates = await prisma.invoice.findMany({
      where: {
        companyId,
        isPaid: false,
        status: { not: 'cancelled' },
        OR: [
          { total: { gte: amount - 1, lte: amount + 1 } },
          reference ? { invoiceNumber: { contains: reference, mode: 'insensitive' } } : undefined,
          counterparty ? { buyer: { nameTh: { contains: counterparty.slice(0, 40), mode: 'insensitive' } } } : undefined,
        ].filter(Boolean) as Prisma.InvoiceWhereInput[],
      },
      include: { payments: true, buyer: { select: { nameTh: true } } },
      orderBy: { invoiceDate: 'desc' },
      take: 5,
    });
    const exact = candidates.find((invoice) => closeAmount(invoice.total - (invoice.paidAmount ?? 0), amount) || closeAmount(invoice.total, amount));
    if (exact) {
      const payment = await prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            invoiceId: exact.id,
            amount,
            method: 'transfer',
            reference,
            paidAt,
            note: `นำเข้าจากสลิปโอนเงิน LINE OCR${result.payment?.bankName ? ` (${result.payment.bankName})` : ''}`,
            createdBy: userId,
          },
        });
        const summary = await calculateInvoicePaymentSummary(tx, exact.id);
        await tx.invoice.update({
          where: { id: exact.id },
          data: {
            isPaid: summary.isPaid,
            paidAt: summary.paidAt,
            paidAmount: summary.paidAmount,
          },
        });
        return created;
      });
      void payment;
      return {
        ok: true,
        status: 'saved',
        targetId: exact.id,
        targetType: 'sales_invoice',
        message: `✅ บันทึกรับชำระจากสลิปแล้ว\n📄 ${exact.invoiceNumber}\n👤 ${exact.buyer.nameTh}\n💵 ${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount)}`,
      };
    }

    return {
      ok: false,
      status: 'needs_review',
      targetType: 'sales_invoice',
      message: `อ่านสลิปโอนได้ แต่ยังจับคู่กับใบขายไม่ได้\nยอด: ${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount)}\nกรุณาตรวจในหน้าเอกสาร/รับชำระเงิน`,
      warnings: ['unmatched:sales_invoice'],
    };
  }

  const purchaseCandidates = await prisma.purchaseInvoice.findMany({
    where: {
      companyId,
      isPaid: false,
      OR: [
        { total: { gte: amount - 1, lte: amount + 1 } },
        reference ? { invoiceNumber: { contains: reference, mode: 'insensitive' } } : undefined,
        result.payment?.toName ? { supplierName: { contains: result.payment.toName.slice(0, 40), mode: 'insensitive' } } : undefined,
      ].filter(Boolean) as Prisma.PurchaseInvoiceWhereInput[],
    },
    orderBy: { invoiceDate: 'desc' },
    take: 5,
  });
  const exactPurchase = purchaseCandidates.find((purchase) => closeAmount(purchase.total, amount));
  if (exactPurchase) {
    await prisma.purchaseInvoice.update({
      where: { id: exactPurchase.id },
      data: {
        isPaid: true,
        paidAt,
        notes: [
          exactPurchase.notes,
          `ชำระโดยสลิปโอนเงิน LINE OCR${reference ? ` ref: ${reference}` : ''}${result.payment?.bankName ? ` bank: ${result.payment.bankName}` : ''}`,
        ].filter(Boolean).join('\n'),
      },
    });
    return {
      ok: true,
      status: 'saved',
      targetId: exactPurchase.id,
      targetType: 'purchase_invoice',
      message: `✅ บันทึกจ่ายชำระเอกสารซื้อแล้ว\n📄 ${exactPurchase.invoiceNumber}\n🏢 ${exactPurchase.supplierName}\n💵 ${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount)}`,
    };
  }

  return {
    ok: false,
    status: 'needs_review',
    targetType: 'purchase_invoice',
    message: `อ่านสลิปโอนได้ แต่ยังจับคู่กับเอกสารซื้อไม่ได้\nยอด: ${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount)}\nกรุณาตรวจในหน้า Input VAT`,
    warnings: ['unmatched:purchase_invoice'],
  };
}

async function createDocumentIntake(input: {
  companyId: string;
  userId: string;
  lineUserId: string;
  messageId: string;
  mimeType: string;
  buffer: Buffer;
}) {
  try {
    return await prisma.documentIntake.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        lineUserId: input.lineUserId,
        source: 'line',
        sourceMessageId: input.messageId,
        mimeType: input.mimeType,
        fileSize: input.buffer.length,
        fileBase64: input.buffer.toString('base64'),
        status: 'received',
      },
    });
  } catch (err) {
    logger.warn('[Line] Document intake create failed; continuing inline', { err });
    return null;
  }
}

async function updateDocumentIntake(
  id: string | null | undefined,
  data: {
    status: string;
    ocrResult?: OcrResult;
    warnings?: string[];
    error?: string;
    targetType?: string;
    targetId?: string;
    purchaseInvoiceId?: string;
  },
) {
  if (!id) return;
  try {
    await prisma.documentIntake.update({
      where: { id },
      data: {
        status: data.status,
        ocrResult: data.ocrResult as Prisma.InputJsonValue | undefined,
        warnings: data.warnings as Prisma.InputJsonValue | undefined,
        error: data.error,
        targetType: data.targetType,
        targetId: data.targetId,
        purchaseInvoiceId: data.purchaseInvoiceId,
        processedAt: ['saved', 'needs_review', 'failed'].includes(data.status) ? new Date() : undefined,
      },
    });
  } catch (err) {
    logger.warn('[Line] Document intake update failed', { err, intakeId: id, status: data.status });
  }
}

// GET /api/line/status
lineRouter.get('/status', authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const companyId = req.user!.companyId;

    const [link, company] = await Promise.all([
      prisma.lineUserLink.findUnique({
        where: { userId },
        select: { displayName: true, isActive: true },
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { lineNotifyEnabled: true, overdueReminderDays: true },
      }),
    ]);

    res.json({
      data: {
        linked: !!(link?.isActive),
        displayName: link?.displayName ?? undefined,
        lineNotifyEnabled: company?.lineNotifyEnabled ?? false,
        overdueReminderDays: company?.overdueReminderDays ?? 3,
      },
    });
  } catch (err) {
    logger.error('[Line] GET /status failed', { err });
    res.status(500).json({ error: 'Failed to get Line status' });
  }
});

// POST /api/line/link-start
lineRouter.post('/link-start', authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const companyId = req.user!.companyId;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redis.setex(`line:otp:${otp}`, OTP_TTL, JSON.stringify({ userId, companyId }));

    res.json({ data: { otp } });
  } catch (err) {
    logger.error('[Line] POST /link-start failed', { err });
    res.status(500).json({ error: 'Failed to generate OTP' });
  }
});

// DELETE /api/line/unlink
lineRouter.delete('/unlink', authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;

    await prisma.lineUserLink.deleteMany({ where: { userId } });
    res.json({ ok: true });
  } catch (err) {
    logger.error('[Line] DELETE /unlink failed', { err });
    res.status(500).json({ error: 'Failed to unlink Line account' });
  }
});

const settingsSchema = z.object({
  lineNotifyEnabled: z.boolean(),
  overdueReminderDays: z.union([z.literal(1), z.literal(3), z.literal(7)]),
});

// PUT /api/line/settings
lineRouter.put('/settings', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const body = settingsSchema.parse(req.body);
    const companyId = req.user!.companyId;

    await prisma.company.update({
      where: { id: companyId },
      data: {
        lineNotifyEnabled: body.lineNotifyEnabled,
        overdueReminderDays: body.overdueReminderDays,
      },
    });

    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('[Line] PUT /settings failed', { err });
    res.status(500).json({ error: 'Failed to update Line settings' });
  }
});

// POST /api/line/admin/setup-richmenu
lineRouter.post('/admin/setup-richmenu', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const result = await setupRichMenu();
    if (!result.ok) {
      res.status(500).json({ error: result.error ?? 'Rich menu setup failed' });
      return;
    }
    res.json({ data: { richMenuId: result.richMenuId } });
  } catch (err) {
    logger.error('[Line] setup-richmenu failed', { err });
    res.status(500).json({ error: 'Failed to setup rich menu' });
  }
});

lineRouter.get('/admin/ocr-health', authenticate, requireRole('admin', 'super_admin'), async (_req, res) => {
  try {
    const [ocrResult, redisResult] = await Promise.allSettled([
      testOcrProvider(),
      testRedisSessionWrite(),
    ]);
    const result = ocrResult.status === 'fulfilled'
      ? ocrResult.value
      : { ok: false, provider: 'unknown', error: ocrResult.reason instanceof Error ? ocrResult.reason.message : String(ocrResult.reason) };
    res.status(result.ok ? 200 : 503).json({
      data: {
        ...result,
        redisFailureFallback: 'direct_db_save_then_ocr_text_summary',
        webhookReplyMode: 'reply_token_ack_with_push_fallback',
        redis: redisResult.status === 'fulfilled'
          ? { ok: true, response: redisResult.value }
          : { ok: false, error: redisResult.reason instanceof Error ? redisResult.reason.message : String(redisResult.reason) },
      },
    });
  } catch (err) {
    logger.error('[Line] OCR health failed', { err });
    res.status(500).json({ error: 'Failed to test OCR provider' });
  }
});

// ─── Webhook ──────────────────────────────────────────────────────────────────

interface LineSource {
  userId?: string;
}

interface LineTextMessage {
  type: 'text';
  id: string;
  text: string;
}

interface LineImageMessage {
  type: 'image';
  id: string;
}

type LineMessage = LineTextMessage | LineImageMessage | { type: string; id: string };

interface LineEvent {
  type: string;
  source: LineSource;
  replyToken?: string;
  message?: LineMessage;
  postback?: { data: string };
}

interface LineWebhookBody {
  events: LineEvent[];
}

async function handleSessionReply(lineUserId: string, text: string): Promise<boolean> {
  let raw: string | null = null;
  try {
    raw = await redis.get(`line:session:${lineUserId}`);
  } catch (err) {
    logger.warn('[Line] Redis session lookup failed; continuing without session', { err });
    return false;
  }
  if (!raw) return false;

  const trimmed = text.trim();

  // User can cancel the session at any time
  if (trimmed === 'ยกเลิก') {
    await redis.del(`line:session:${lineUserId}`);
    await sendLineText(lineUserId, '❌ ยกเลิกแล้ว');
    return true;
  }

  const session = JSON.parse(raw) as LineSession;
  const field = REQUIRED_OCR_FIELDS.find(f => f.key === session.currentField)!;

  // Parse value based on field type
  let parsedValue: string | number = trimmed;
  if (session.currentField === 'total' || session.currentField === 'subtotal' || session.currentField === 'vatAmount') {
    const num = parseFloat(trimmed.replace(/,/g, ''));
    if (isNaN(num)) {
      await sendLineText(lineUserId, `⚠️ กรุณาระบุ${field.label}เป็นตัวเลข\n💡 ${field.hint}`);
      return true;
    }
    parsedValue = num;
  }
  if (session.currentField === 'invoiceDate') {
    // Accept DD/MM/YYYY (Buddhist or AD) or YYYY-MM-DD
    const thaiMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (thaiMatch) {
      let year = parseInt(thaiMatch[3]);
      if (year > 2500) year -= 543; // convert Buddhist year
      parsedValue = `${year}-${thaiMatch[2].padStart(2, '0')}-${thaiMatch[1].padStart(2, '0')}`;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      await sendLineText(lineUserId, `⚠️ กรุณาระบุวันที่ในรูปแบบที่ถูกต้อง\n💡 ${field.hint}`);
      return true;
    }
  }
  if (session.currentField === 'supplierTaxId') {
    const digits = trimmed.replace(/[-\s]/g, '');
    if (digits.length !== 13 || !/^\d+$/.test(digits)) {
      await sendLineText(lineUserId, `⚠️ เลขผู้เสียภาษีต้องมี 13 หลัก\n💡 ${field.hint}`);
      return true;
    }
    parsedValue = digits;
  }

  // Update session data
  (session.data as Record<string, unknown>)[session.currentField] = parsedValue;

  if (session.pendingFields.length > 0) {
    // Ask next field
    const nextKey = session.pendingFields[0];
    const nextField = REQUIRED_OCR_FIELDS.find(f => f.key === nextKey)!;
    session.currentField = nextKey;
    session.pendingFields = session.pendingFields.slice(1);
    await redis.setex(`line:session:${lineUserId}`, 600, JSON.stringify(session));
    await sendLineTextWithQuickReply(
      lineUserId,
      `✅ บันทึก ${field.label} แล้ว\n\n📌 กรุณาระบุต่อไป:\n${nextField.label}\n💡 ${nextField.hint}`,
      [{ label: '❌ ยกเลิก', text: 'ยกเลิก' }],
    );
    return true;
  }

  // All fields collected — show confirm card
  await redis.del(`line:session:${lineUserId}`);
  const fullData = session.data as OcrResult & { companyId?: string };
  const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await redis.setex(`ocr:temp:${tempId}`, 600, JSON.stringify(fullData));
  await sendLineFlexMessage(
    lineUserId,
    'ตรวจพบใบแจ้งหนี้ — กรุณายืนยัน',
    buildOcrConfirmFlexCard(fullData as OcrResult, tempId),
  );
  return true;
}

async function handleEditReply(lineUserId: string, trimmed: string): Promise<boolean> {
  let raw: string | null = null;
  try {
    raw = await redis.get(`line:editsession:${lineUserId}`);
  } catch (err) {
    logger.warn('[Line] Redis edit session lookup failed; continuing without edit session', { err });
    return false;
  }
  if (!raw) return false;

  const session = JSON.parse(raw) as LineEditSession;

  if (trimmed === 'ยกเลิก' || trimmed === 'เสร็จสิ้น') {
    await redis.del(`line:editsession:${lineUserId}`);
    await sendLineText(lineUserId, '❌ ยกเลิกการแก้ไข');
    return true;
  }

  const fieldDef = REQUIRED_OCR_FIELDS.find(f => f.key === session.currentField) ?? { key: session.currentField, label: session.currentField, hint: '' };

  let parsedValue: string | number | Date = trimmed;
  if (['total', 'subtotal', 'vatAmount'].includes(session.currentField)) {
    const num = parseFloat(trimmed.replace(/,/g, ''));
    if (isNaN(num)) {
      await sendLineTextWithQuickReply(
        lineUserId,
        `⚠️ กรุณาระบุตัวเลข\n💡 ${fieldDef.hint}`,
        [{ label: '❌ ยกเลิก', text: 'เสร็จสิ้น' }],
      );
      return true;
    }
    parsedValue = num;
  } else if (session.currentField === 'invoiceDate') {
    const thaiMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (thaiMatch) {
      let year = parseInt(thaiMatch[3]);
      if (year > 2500) year -= 543;
      parsedValue = new Date(`${year}-${thaiMatch[2].padStart(2, '0')}-${thaiMatch[1].padStart(2, '0')}`);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      parsedValue = new Date(trimmed);
    } else {
      await sendLineTextWithQuickReply(
        lineUserId,
        `⚠️ รูปแบบวันที่ไม่ถูกต้อง\n💡 ${fieldDef.hint}`,
        [{ label: '❌ ยกเลิก', text: 'เสร็จสิ้น' }],
      );
      return true;
    }
  } else if (session.currentField === 'supplierTaxId') {
    const digits = trimmed.replace(/[-\s]/g, '');
    if (digits.length !== 13 || !/^\d+$/.test(digits)) {
      await sendLineTextWithQuickReply(
        lineUserId,
        `⚠️ เลขผู้เสียภาษีต้องมี 13 หลัก\n💡 ${fieldDef.hint}`,
        [{ label: '❌ ยกเลิก', text: 'เสร็จสิ้น' }],
      );
      return true;
    }
    parsedValue = digits;
  }

  try {
    await prisma.purchaseInvoice.update({
      where: { id: session.purchaseInvoiceId },
      data: { [session.currentField]: parsedValue } as Record<string, unknown>,
    });
    await redis.del(`line:editsession:${lineUserId}`);
    await sendLineTextWithQuickReply(
      lineUserId,
      `✅ แก้ไข ${fieldDef.label} เรียบร้อยแล้ว`,
      [
        { label: '✏️ แก้ไขต่อ', data: `edit_purchase:${session.purchaseInvoiceId}`, displayText: 'แก้ไขต่อ' },
        { label: '✅ เสร็จสิ้น', text: 'เสร็จสิ้น' },
      ],
    );
  } catch (err) {
    logger.error('[Line] edit purchase field failed', { err, session });
    await sendLineText(lineUserId, '❌ ไม่สามารถแก้ไขได้ กรุณาลองใหม่');
  }

  return true;
}

async function handleTextMessage(lineUserId: string, text: string): Promise<void> {
  const trimmed = text.trim();

  // Check if user is in a field-input session
  if (await handleSessionReply(lineUserId, trimmed)) return;

  // Check if user is in an edit session
  if (await handleEditReply(lineUserId, trimmed)) return;

  // OTP link flow — accept bare "723430" or "/link 723430"
  const otpMatch = trimmed.match(/^(?:\/link\s+)?(\d{6})$/);
  if (otpMatch) {
    const otp = otpMatch[1];
    try {
      const stored = await redis.get(`line:otp:${otp}`);
      if (stored) {
        const { userId } = JSON.parse(stored) as { userId: string; companyId: string };

        // Get Line profile info — we'll store what we have
        const existingUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });

        await prisma.lineUserLink.upsert({
          where: { userId },
          create: {
            userId,
            lineUserId,
            displayName: existingUser?.name ?? null,
            isActive: true,
          },
          update: {
            lineUserId,
            displayName: existingUser?.name ?? null,
            isActive: true,
          },
        });

        await redis.del(`line:otp:${otp}`);
        await sendLineText(
          lineUserId,
          `เชื่อมบัญชีสำเร็จ! ยินดีต้อนรับคุณ ${existingUser?.name ?? ''} 🎉\n\nตอนนี้คุณสามารถถามคำถามเกี่ยวกับบัญชีและภาษีได้เลย`,
        );
        return;
      }
    } catch (err) {
      logger.error('[Line] OTP link failed', { err });
    }
    await sendLineText(lineUserId, 'OTP ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอ OTP ใหม่จากระบบ');
    return;
  }

  // Find linked user
  const link = await prisma.lineUserLink.findUnique({
    where: { lineUserId },
    include: { user: { include: { company: true } } },
  });

  if (!link) {
    await sendLineText(
      lineUserId,
      'ยังไม่ได้เชื่อมบัญชีครับ 🔗\n\nกรุณาเข้าระบบ e-Tax Invoice → ตั้งค่า → Line แล้วกด "สร้างรหัส OTP"\nจากนั้นส่งรหัส 6 หลักมาที่นี่ครับ\n\n👉 https://etax-invoice.vercel.app',
    );
    return;
  }

  const { user } = link;
  const companyId = user.companyId;
  const lower = trimmed.toLowerCase();

  // Help / greeting
  if (['สวัสดี', 'help', 'ช่วยเหลือ'].includes(lower)) {
    await sendLineText(
      lineUserId,
      `สวัสดีครับ! ผมพี่นุช ผู้ช่วยบัญชีของ ${user.company.nameTh} 🤖\n\n` +
      `📥 บันทึกภาษีซื้อ:\n` +
      `• ส่งรูป .jpg/.png หรือ PDF ใบกำกับภาษีผู้ขาย\n\n` +
      `📊 ดูข้อมูลบัญชี:\n` +
      `• "สรุปภาษี" — ยอด VAT เดือนนี้\n` +
      `• "ใบเกินกำหนด" — ใบแจ้งหนี้ค้างชำระ\n\n` +
      `📄 จัดการใบกำกับภาษีขาย:\n` +
      `• "ส่งใบ INV-001" — รับ Flex Card + ปุ่มเปิด PDF\n` +
      `• "ขอใบ / ดูใบ / หาใบ / pdf [เลขที่]" — ค้นหาเอกสาร\n\n` +
      `💬 ถามพี่นุชได้เลย เช่น "ภาษีซื้อเดือนนี้เท่าไร"\n\n` +
      `❌ พิมพ์ "ยกเลิก" เพื่อหยุดการกรอกข้อมูลกลางคัน`,
    );
    return;
  }

  if (['ลิงก์', 'link', 'เข้าเว็บ', 'เข้าระบบ', 'login', 'เปิดระบบ', 'ดาวน์โหลดเอกสาร', 'ดูเอกสาร'].some((keyword) => lower.includes(keyword))) {
    await sendLineText(
      lineUserId,
      'ได้ค่ะ เข้าระบบ e-Tax Invoice ได้ที่นี่นะคะ\n\n' +
      '🌐 เข้าระบบ: https://etax-invoice.vercel.app\n' +
      '📄 รายการเอกสารขาย: https://etax-invoice.vercel.app/app/invoices\n' +
      '🧾 เอกสารซื้อ/ภาษีซื้อ: https://etax-invoice.vercel.app/app/purchase-invoices',
    );
    return;
  }

  if (lower === 'วิธีค้นหาใบ' || lower === 'ค้นหาใบ') {
    await sendLineText(lineUserId,
      '🔍 วิธีค้นหาใบกำกับภาษี\n\nพิมพ์คำสั่งตามนี้:\n• "ส่งใบ INV-2026-001"\n• "ขอใบ TAX-001"\n• "ดูใบ [เลขที่]"\n• "pdf [เลขที่]"\n\nระบบจะส่ง Flex Card พร้อมปุ่มเปิด PDF ให้ทันที');
    return;
  }
  if (lower === 'วิธีอัพโหลดเอกสาร' || lower === 'อัพโหลดเอกสาร') {
    await sendLineText(lineUserId,
      '📁 วิธีอัพโหลดใบกำกับภาษีซื้อ\n\n1️⃣ ส่งรูปภาพ (.jpg .png) หรือไฟล์ PDF ใบกำกับภาษีผู้ขาย\n2️⃣ พี่นุชจะ OCR อ่านข้อมูลอัตโนมัติ\n3️⃣ ถ้าข้อมูลไม่ครบ พี่นุชจะถามเพิ่ม\n4️⃣ กดยืนยันเพื่อบันทึกภาษีซื้อ\n\n💡 รองรับทั้ง PDF ดิจิทัลและ PDF สแกน');
    return;
  }

  // VAT summary
  if (['สรุปภาษี', 'ยอดภาษี'].includes(lower)) {
    try {
      const context = await buildCompanyContext(companyId);
      const data = JSON.parse(context) as {
        company: { name: string };
        salesThisMonth: { count: number; total: number; outputVat: number };
        purchasesThisMonth: { count: number; total: number; inputVat: number };
        vatPayable: number;
        overdueInvoices: { count: number; totalAmount: number };
      };
      const fmt = (n: number) =>
        new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);

      const msg = `📊 สรุปภาษีเดือนนี้ — ${data.company.name}\n\n` +
        `💰 ภาษีขาย (Output VAT): ${fmt(data.salesThisMonth.outputVat)}\n` +
        `🛒 ภาษีซื้อ (Input VAT): ${fmt(data.purchasesThisMonth.inputVat)}\n` +
        `📋 ภาษีที่ต้องชำระ: ${fmt(data.vatPayable)}\n\n` +
        `ยอดขาย: ${fmt(data.salesThisMonth.total)} (${data.salesThisMonth.count} ใบ)\n` +
        `ยอดซื้อ: ${fmt(data.purchasesThisMonth.total)} (${data.purchasesThisMonth.count} ใบ)\n` +
        `ใบค้างชำระ: ${data.overdueInvoices.count} ใบ (${fmt(data.overdueInvoices.totalAmount)})`;

      await sendLineText(lineUserId, msg);
    } catch (err) {
      logger.error('[Line] VAT summary failed', { err });
      await sendLineText(lineUserId, 'ขอโทษ ไม่สามารถดึงข้อมูลภาษีได้ในขณะนี้');
    }
    return;
  }

  // Overdue invoices
  if (['ใบเกินกำหนด', 'overdue'].includes(lower)) {
    try {
      const now = new Date();
      const overdueRecords = await prisma.invoice.findMany({
        where: {
          companyId,
          isPaid: false,
          status: 'approved',
          dueDate: { lt: now },
        },
        include: { buyer: { select: { nameTh: true } } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      });

      if (overdueRecords.length === 0) {
        await sendLineText(lineUserId, '✅ ไม่มีใบแจ้งหนี้เกินกำหนดชำระ');
        return;
      }

      const overdue: OverdueInvoice[] = overdueRecords.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.buyer.nameTh,
        total: inv.total,
        dueDate: inv.dueDate!,
        daysOverdue: Math.floor((now.getTime() - inv.dueDate!.getTime()) / (1000 * 60 * 60 * 24)),
      }));

      await sendLineFlexMessage(lineUserId, `ใบแจ้งหนี้เกินกำหนด ${overdue.length} รายการ`, buildOverdueFlexCard(overdue));
    } catch (err) {
      logger.error('[Line] Overdue query failed', { err });
      await sendLineText(lineUserId, 'ขอโทษ ไม่สามารถดึงข้อมูลใบแจ้งหนี้ได้ในขณะนี้');
    }
    return;
  }

  // Send invoice by number: "ส่งใบ INV-2026-001" / "ขอใบ TAX-001" / "PDF INV-001"
  const invoiceReqMatch = trimmed.match(/(?:ส่งใบ|ขอใบ|ดูใบ|หาใบ|pdf)\s+(\S+)/i);
  if (invoiceReqMatch) {
    const invoiceNumber = invoiceReqMatch[1];
    try {
      const invoice = await prisma.invoice.findFirst({
        where: { companyId, invoiceNumber: { contains: invoiceNumber, mode: 'insensitive' } },
        include: { buyer: { select: { nameTh: true } } },
      });
      if (!invoice) {
        await sendLineText(lineUserId, `❌ ไม่พบเอกสารเลขที่ "${invoiceNumber}" ในระบบ`);
      } else {
        const card = buildInvoiceFlexCard({
          invoiceNumber: invoice.invoiceNumber,
          buyerName: invoice.buyer.nameTh,
          total: invoice.total,
          vatAmount: invoice.vatAmount,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          status: invoice.status,
          isPaid: invoice.isPaid,
          pdfUrl: invoice.pdfUrl,
        });
        if (!invoice.pdfUrl) {
          await sendLineText(lineUserId, '⏳ PDF ยังไม่พร้อม แสดงข้อมูลเอกสารได้เลย:');
        }
        await sendLineFlexMessage(lineUserId, `ใบกำกับภาษี ${invoice.invoiceNumber}`, card);
      }
    } catch (err) {
      logger.error('[Line] invoice lookup failed', { err });
      await sendLineText(lineUserId, 'ขอโทษ ไม่สามารถค้นหาเอกสารได้');
    }
    return;
  }

  // AI fallback
  try {
    const answer = await askPinuch(
      companyId,
      user.company.nameTh,
      user.company.taxId,
      trimmed,
    );
    await sendLineText(lineUserId, answer);
  } catch (err) {
    logger.error('[Line] AI answer failed', { err });
    await sendLineText(lineUserId, 'ขอโทษ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
  }
}

async function handleImageMessage(lineUserId: string, messageId: string, messageType?: string): Promise<void> {
  let stage = 'start';
  try {
    stage = 'link_lookup';
    const link = await prisma.lineUserLink.findUnique({
      where: { lineUserId },
      select: { user: { select: { companyId: true } } },
    });

    if (!link) {
      await sendLineText(
        lineUserId,
        'ยังไม่ได้เชื่อมบัญชีครับ กรุณาเข้าระบบ e-Tax Invoice → ตั้งค่า → Line แล้วสร้างรหัส OTP ก่อนส่งเอกสาร',
      );
      return;
    }

    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
    if (!token) {
      await sendLineText(lineUserId, 'ขอโทษ ระบบ Line ยังไม่ได้ตั้งค่า');
      return;
    }

    stage = 'download_line_content';
    const contentResponse = await fetch(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!contentResponse.ok) {
      logger.error('[Line] Failed to download file', { status: contentResponse.status, messageId });
      await sendLineText(lineUserId, 'ขอโทษ ไม่สามารถดาวน์โหลดไฟล์ได้');
      return;
    }

    const buffer = Buffer.from(await contentResponse.arrayBuffer());
    stage = 'detect_file_type';
    const contentType = detectLineFileMimeType(buffer, contentResponse.headers.get('content-type') ?? '', messageType);
    const isPdf = contentType === 'application/pdf';
    const companyId = link.user.companyId;
    const creator = await prisma.lineUserLink.findUnique({
      where: { lineUserId },
      select: { userId: true },
    });
    const intake = creator
      ? await createDocumentIntake({
          companyId,
          userId: creator.userId,
          lineUserId,
          messageId,
          mimeType: contentType,
          buffer,
        })
      : null;

    let result: OcrResult | undefined;
    logger.info('[Line] file received', { contentType, isPdf, bufferSize: buffer.length, messageType });

    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
      await sendLineText(lineUserId, 'ไฟล์ชนิดนี้ยังไม่รองรับครับ กรุณาส่งเป็นรูป JPG/PNG/WebP หรือ PDF');
      await updateDocumentIntake(intake?.id, {
        status: 'failed',
        error: `Unsupported file type: ${contentType}`,
      });
      return;
    }

    await updateDocumentIntake(intake?.id, { status: 'processing' });

    if (isPdf) {
      // Step 1: extract text (fast, cheap — works for digital/typed PDFs)
      let pdfText = '';
      let pageCount = 1;
      try {
        stage = 'pdf_parse';
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PDFParse } = require('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const textResult = await parser.getText();
        pageCount = textResult.total ?? 1;
        pdfText = (textResult.text ?? '').trim().slice(0, 8000);
        logger.info('[Line] PDF text extracted', { chars: pdfText.length, pages: pageCount });
      } catch (pdfErr) {
        logger.warn('[Line] pdf-parse failed', { error: String(pdfErr) });
      }

      if (pdfText.length > 30) {
        // Step 2a: got text — send to chat model (cheap, no vision needed)
        stage = 'ocr_text_pdf';
        result = await ocrSupplierInvoice(Buffer.from(pdfText, 'utf-8').toString('base64'), 'text/plain', {
          pageCount,
          source: 'text_pdf',
        });
      } else {
        // Step 2b: no text (scanned PDF) — send PDF binary to Gemini via OpenRouter
        logger.info('[Line] No text found, sending PDF through OCR pipeline', { bytes: buffer.length });
        stage = 'ocr_scan_pdf';
        result = await ocrSupplierInvoice(buffer.toString('base64'), 'application/pdf', {
          pageCount,
          source: 'scan_pdf',
        });
      }
    } else {
      stage = 'ocr_image';
      result = await ocrSupplierInvoice(buffer.toString('base64'), contentType, { source: 'image' });
    }

    if (!result) return;

    if (!isPdf && result.documentType !== 'bank_transfer' && result.documentType !== 'payment_advice' && !paymentAmount(result)) {
      stage = 'ocr_bank_slip_specialist';
      const slipResult = await ocrBankTransferSlip(buffer.toString('base64'), contentType);
      if (paymentAmount(slipResult) || slipResult.invoiceNumber || slipResult.payment?.reference) {
        result = slipResult;
      }
    }

    logger.info('[Line] OCR result', { confidence: result.confidence, supplierName: result.supplierName, total: result.total });

    const hasAnyData = result.supplierName || result.invoiceNumber || result.total || result.vatAmount || paymentAmount(result);
    if (!hasAnyData) {
      await updateDocumentIntake(intake?.id, {
        status: 'failed',
        ocrResult: result,
        warnings: result.validationWarnings,
        error: 'OCR returned no useful fields',
      });
      await sendLineText(lineUserId, '❌ ยังอ่านข้อมูลจากเอกสารนี้ไม่ได้\n\nกรุณาลองถ่ายให้ชัดขึ้น เห็นทั้งใบ ไม่เอียง แสงพอ และเห็นเลขผู้เสียภาษี/วันที่/ยอดรวม หรือส่งเป็น PDF ต้นฉบับ');
      return;
    }

    if (result.documentType === 'bank_transfer' || result.documentType === 'payment_advice') {
      if (!creator) {
        await updateDocumentIntake(intake?.id, {
          status: 'failed',
          ocrResult: result,
          warnings: result.validationWarnings,
          error: 'Line user link not found for payment matching',
        });
        await sendLineText(lineUserId, 'อ่านสลิปโอนได้แล้วครับ แต่ยังไม่พบผู้ใช้ที่เชื่อมบัญชี กรุณาเชื่อม LINE ใหม่');
        return;
      }
      stage = 'match_bank_transfer';
      const match = await handleBankTransferDocument(lineUserId, result, companyId, creator.userId);
      await updateDocumentIntake(intake?.id, {
        status: match.status,
        ocrResult: result,
        warnings: [...(result.validationWarnings ?? []), ...(match.warnings ?? [])],
        error: match.ok ? undefined : match.message,
        targetType: match.targetType,
        targetId: match.targetId,
        purchaseInvoiceId: match.targetType === 'purchase_invoice' ? match.targetId : undefined,
      });
      await sendLineText(lineUserId, match.message);
      return;
    }

    // Check for missing required fields
    const missingFields = getMissingFields(result);

    if (missingFields.length > 0) {
      const [firstField, ...restFields] = missingFields;
      void restFields;
      await updateDocumentIntake(intake?.id, {
        status: 'needs_review',
        ocrResult: result,
        warnings: [
          ...(result.validationWarnings ?? []),
          ...missingFields.map((fieldDef) => `missing:${fieldDef.key}`),
        ],
      });
      await sendLineText(
        lineUserId,
        `${buildOcrTextSummary(result, 'อ่านเอกสารได้บางส่วน แต่ยังไม่บันทึกเพราะข้อมูลสำคัญไม่ครบ')}\n\n` +
        `กรุณาตรวจในหน้า Input VAT หรือส่งไฟล์ที่ชัดขึ้น\nช่องแรกที่ขาด: ${firstField.label}`,
      );
      return;
    }

    // All required fields present — save immediately and surface it in the web review queue.
    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    stage = 'direct_db_save_purchase';
    try {
      const saved = await savePurchaseFromLineOcr(lineUserId, result, companyId, tempId);
      await updateDocumentIntake(intake?.id, {
        status: 'saved',
        ocrResult: result,
        warnings: result.validationWarnings,
        targetType: 'purchase_invoice',
        targetId: saved.id,
        purchaseInvoiceId: saved.id,
      });
      await replySavedPurchase(
        lineUserId,
        result,
        saved.id,
        '✅ อ่านเอกสารและบันทึกเข้าระบบแล้วครับ',
      );
    } catch (saveErr) {
      logger.error('[Line] OCR direct DB save failed', { err: saveErr });
      await updateDocumentIntake(intake?.id, {
        status: 'failed',
        ocrResult: result,
        warnings: result.validationWarnings,
        error: saveErr instanceof Error ? saveErr.message : String(saveErr),
      });
      await sendLineText(lineUserId, buildOcrTextSummary(result, 'อ่านเอกสารได้แล้ว แต่บันทึกเข้า DB ไม่สำเร็จ'));
    }
  } catch (err) {
    logger.error('[Line] handleImageMessage failed', { err, stage });
    await sendLineText(lineUserId, `ขอโทษ เกิดข้อผิดพลาดในการอ่านเอกสาร (ขั้นตอน: ${stage})`);
  }
}

async function handlePostback(lineUserId: string, data: string): Promise<void> {
  if (data.startsWith('confirm_purchase:')) {
    const tempId = data.slice('confirm_purchase:'.length);
    try {
      const stored = await redis.get(`ocr:temp:${tempId}`);
      if (!stored) {
        await sendLineText(lineUserId, 'ข้อมูลหมดอายุแล้ว กรุณาส่งรูปใหม่อีกครั้ง');
        return;
      }

      const ocrData = JSON.parse(stored) as OcrResult & { companyId?: string };
      const companyId = ocrData.companyId;

      if (!companyId) {
        await sendLineText(lineUserId, 'ขอโทษ ไม่พบข้อมูลบริษัท กรุณาเชื่อมบัญชีใหม่');
        return;
      }

      const saved = await savePurchaseFromLineOcr(lineUserId, ocrData, companyId, tempId);

      try {
        await redis.del(`ocr:temp:${tempId}`);
      } catch (redisErr) {
        logger.warn('[Line] Redis del failed after saving purchase', { err: redisErr, tempId });
      }

      // Store edit reference
      try {
        await redis.setex(`line:lastedit:${lineUserId}`, 300, saved.id);
      } catch (redisErr) {
        logger.warn('[Line] Redis lastedit save failed after saving purchase', { err: redisErr, purchaseId: saved.id });
      }

      await replySavedPurchase(lineUserId, ocrData, saved.id);
    } catch (err) {
      logger.error('[Line] confirm_purchase failed', { err, tempId });
      await sendLineText(lineUserId, 'ขอโทษ เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
    return;
  }

  if (data.startsWith('reject_purchase:')) {
    const tempId = data.slice('reject_purchase:'.length);
    try {
      await redis.del(`ocr:temp:${tempId}`);
    } catch (err) {
      logger.error('[Line] reject_purchase redis del failed', { err });
    }
    await sendLineText(lineUserId, 'ยกเลิกแล้ว');
  }

  if (data.startsWith('edit_before_save:')) {
    const tempId = data.slice('edit_before_save:'.length);
    let stored: string | null = null;
    try {
      stored = await redis.get(`ocr:temp:${tempId}`);
    } catch (err) {
      logger.warn('[Line] Redis temp lookup failed before edit', { err, tempId });
    }
    if (!stored) {
      await sendLineText(lineUserId, '⏱ ข้อมูลหมดอายุแล้ว กรุณาส่งรูปใหม่');
      return;
    }
    const ocrData = JSON.parse(stored) as OcrResult & { companyId?: string };
    // Start a pre-save edit session — reuse LineSession
    const allFields = REQUIRED_OCR_FIELDS.map(f => f.key);
    const session: LineSession = {
      state: 'awaiting_field',
      currentField: allFields[0],
      pendingFields: allFields.slice(1),
      data: { ...ocrData },
    };
    // We keep the ocr:temp entry alive so we can re-show confirm card after edits
    try {
      await redis.setex(`line:session:${lineUserId}`, 600, JSON.stringify({ ...session, tempId }));
    } catch (err) {
      logger.warn('[Line] Redis edit-before-save session failed', { err, tempId });
      await sendLineText(lineUserId, 'ตอนนี้ระบบแก้ไขก่อนบันทึกผ่าน LINE ใช้ไม่ได้ชั่วคราว กรุณาส่งเอกสารใหม่หรือแก้จากหน้า Input VAT ในเว็บครับ');
      return;
    }
    await sendLineTextWithQuickReply(
      lineUserId,
      `✏️ แก้ไขข้อมูลก่อนบันทึก\n\nปัจจุบัน: ${ocrData.supplierName || '-'}\n📌 ชื่อผู้ขาย (พิมพ์ค่าใหม่ หรือ "-" เพื่อข้าม)`,
      [{ label: '❌ ยกเลิก', text: 'ยกเลิก' }],
    );
    return;
  }

  if (data.startsWith('edit_purchase:')) {
    const purchaseId = data.slice('edit_purchase:'.length);
    await sendLineTextWithQuickReply(
      lineUserId,
      '✏️ ต้องการแก้ไขช่องไหน?',
      [
        { label: 'ชื่อผู้ขาย',       data: `editfield:${purchaseId}:supplierName`,  displayText: 'แก้ไขชื่อผู้ขาย' },
        { label: 'เลขผู้เสียภาษี',   data: `editfield:${purchaseId}:supplierTaxId`, displayText: 'แก้ไขเลขผู้เสียภาษี' },
        { label: 'เลขที่ใบกำกับ',    data: `editfield:${purchaseId}:invoiceNumber`, displayText: 'แก้ไขเลขที่ใบกำกับ' },
        { label: 'วันที่',            data: `editfield:${purchaseId}:invoiceDate`,   displayText: 'แก้ไขวันที่' },
        { label: 'ยอดรวม',           data: `editfield:${purchaseId}:total`,         displayText: 'แก้ไขยอดรวม' },
        { label: '❌ ยกเลิก',        text: 'เสร็จสิ้น' },
      ],
    );
    return;
  }

  if (data.startsWith('editfield:')) {
    const parts = data.split(':');
    const purchaseId = parts[1];
    const fieldKey = parts[2];
    const fieldDef = REQUIRED_OCR_FIELDS.find(f => f.key === fieldKey) ?? { label: fieldKey, hint: '' };

    const editSession: LineEditSession = {
      state: 'editing_field',
      purchaseInvoiceId: purchaseId,
      currentField: fieldKey,
    };
    try {
      await redis.setex(`line:editsession:${lineUserId}`, 300, JSON.stringify(editSession));
    } catch (err) {
      logger.warn('[Line] Redis edit session save failed', { err, purchaseId, fieldKey });
      await sendLineText(lineUserId, 'ตอนนี้ระบบแก้ไขผ่าน LINE ใช้ไม่ได้ชั่วคราว กรุณาแก้จากหน้า Input VAT ในเว็บครับ');
      return;
    }

    await sendLineTextWithQuickReply(
      lineUserId,
      `✏️ กรุณาพิมพ์ค่าใหม่สำหรับ:\n📌 ${fieldDef.label}\n💡 ${fieldDef.hint}`,
      [{ label: '❌ ยกเลิก', text: 'เสร็จสิ้น' }],
    );
    return;
  }
}

export async function lineWebhookHandler(req: Request, res: Response): Promise<void> {
  const sig = req.headers['x-line-signature'] as string | undefined;
  logger.info('[Line] Webhook received', { hasSignature: !!sig, bodyLength: (req.body as Buffer)?.length });

  let body: LineWebhookBody;
  try {
    body = JSON.parse((req.body as Buffer).toString()) as LineWebhookBody;
    logger.info('[Line] Webhook parsed', { eventCount: body.events?.length ?? 0 });
  } catch (e) {
    logger.error('[Line] Webhook body parse failed', { error: String(e) });
    res.json({ ok: true });
    return;
  }

  // Line sends an empty-events probe when verifying the webhook URL — respond 200 without signature check
  if (!body.events || body.events.length === 0) {
    res.json({ ok: true });
    return;
  }

  if (!sig || !verifyLineSignature(req.body as Buffer, sig)) {
    logger.warn('[Line] Signature mismatch — rejected');
    res.status(401).json({ ok: false });
    return;
  }

  // Always respond 200 immediately; process events async
  res.json({ ok: true });

  for (const event of body.events ?? []) {
    const lineUserId = event.source.userId;
    if (!lineUserId) continue;

    try {
      if (event.type === 'follow') {
        await sendLineText(
          lineUserId,
          'สวัสดีครับ! ผมพี่นุช ผู้ช่วยบัญชีอัจฉริยะ 🤖\n\n' +
          'ส่ง OTP 6 หลักจากระบบ e-Tax Invoice เพื่อเชื่อมบัญชีก่อนเริ่มใช้งานนะครับ\n\n' +
          '📋 สิ่งที่ทำได้หลังเชื่อมบัญชี:\n' +
          '• ส่งรูป/PDF ใบกำกับภาษี → บันทึกภาษีซื้ออัตโนมัติ\n' +
          '• พิมพ์ "สรุปภาษี" → ดูยอด VAT เดือนนี้\n' +
          '• พิมพ์ "ใบเกินกำหนด" → ใบแจ้งหนี้ค้างชำระ\n' +
          '• พิมพ์ "ส่งใบ [เลขที่]" → รับ PDF ใบกำกับภาษี\n' +
          '• พิมพ์ "ช่วยเหลือ" → ดูคำสั่งทั้งหมด\n\n' +
          '💡 หรือใช้เมนูด้านล่างได้เลยครับ',
        );
      } else if (event.type === 'message' && event.message) {
        const msg = event.message;
        if (msg.type === 'text') {
          await handleTextMessage(lineUserId, (msg as LineTextMessage).text);
        } else if (msg.type === 'image' || msg.type === 'file') {
          const acknowledged = event.replyToken
            ? await replyLineText(event.replyToken, '📄 กำลังอ่านเอกสาร รอสักครู่...')
            : false;
          if (!acknowledged) {
            await sendLineText(lineUserId, '📄 กำลังอ่านเอกสาร รอสักครู่...');
          }
          await handleImageMessage(lineUserId, msg.id, msg.type);
        }
      } else if (event.type === 'postback' && event.postback) {
        await handlePostback(lineUserId, event.postback.data);
      }
    } catch (err) {
      logger.error('[Line] Unhandled webhook event error', { err, eventType: event.type, lineUserId });
      await sendLineText(lineUserId, 'ขอโทษครับ ระบบ LINE สะดุดชั่วคราว กรุณาลองส่งใหม่อีกครั้ง');
    }
  }
}
