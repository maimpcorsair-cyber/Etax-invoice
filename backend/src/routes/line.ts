import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import prisma from '../config/database';
import redis from '../config/redis';
import { logger } from '../config/logger';
import {
  sendLineText,
  sendLineFlexMessage,
  sendLineTextWithQuickReply,
  buildOverdueFlexCard,
  buildOcrConfirmFlexCard,
  buildInvoiceFlexCard,
  verifyLineSignature,
  OverdueInvoice,
} from '../services/lineService';
import { askPinuch, buildCompanyContext, ocrSupplierInvoice, OcrResult } from '../services/aiService';
import { setupRichMenu } from '../services/richMenuService';

export const lineRouter = Router();

const OTP_TTL = 600; // 10 minutes

const REQUIRED_OCR_FIELDS: Array<{ key: keyof OcrResult; label: string; hint: string }> = [
  { key: 'supplierName',  label: 'ชื่อผู้ขาย',                      hint: 'เช่น บริษัท ABC จำกัด' },
  { key: 'supplierTaxId', label: 'เลขผู้เสียภาษีผู้ขาย (13 หลัก)', hint: 'เช่น 0105567890123' },
  { key: 'invoiceDate',   label: 'วันที่ในใบกำกับภาษี',              hint: 'เช่น 27/04/2567 หรือ 2026-04-27' },
  { key: 'total',         label: 'ยอดรวมทั้งสิ้น (บาท)',            hint: 'เช่น 10700' },
];

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
      res.status(500).json({ error: result.error });
      return;
    }
    res.json({ data: { richMenuId: result.richMenuId } });
  } catch (err) {
    logger.error('[Line] setup-richmenu failed', { err });
    res.status(500).json({ error: 'Failed to setup rich menu' });
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
  const raw = await redis.get(`line:session:${lineUserId}`);
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
  const raw = await redis.get(`line:editsession:${lineUserId}`);
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

async function handleImageMessage(lineUserId: string, messageId: string): Promise<void> {
  try {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
    if (!token) {
      await sendLineText(lineUserId, 'ขอโทษ ระบบ Line ยังไม่ได้ตั้งค่า');
      return;
    }

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
    const contentType = contentResponse.headers.get('content-type') ?? 'image/jpeg';
    const isPdf = contentType.includes('pdf') || buffer.slice(0, 4).toString() === '%PDF';

    let result: OcrResult | undefined;
    logger.info('[Line] file received', { contentType, isPdf, bufferSize: buffer.length });

    if (isPdf) {
      // Step 1: extract text (fast, cheap — works for digital/typed PDFs)
      let pdfText = '';
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PDFParse } = require('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const textResult = await parser.getText({ first: 1 }); // first page only — invoice data is always here
        pdfText = (textResult.text ?? '').trim().slice(0, 3000);
        logger.info('[Line] PDF text extracted', { chars: pdfText.length, pages: textResult.total });
      } catch (pdfErr) {
        logger.warn('[Line] pdf-parse failed', { error: String(pdfErr) });
      }

      if (pdfText.length > 30) {
        // Step 2a: got text — send to chat model (cheap, no vision needed)
        result = await ocrSupplierInvoice(Buffer.from(pdfText, 'utf-8').toString('base64'), 'text/plain');
      } else {
        // Step 2b: no text (scanned PDF) — send PDF binary to Gemini via OpenRouter
        logger.info('[Line] No text found, sending PDF to Gemini', { bytes: buffer.length });
        result = await ocrSupplierInvoice(buffer.toString('base64'), 'application/pdf');
      }
    } else {
      result = await ocrSupplierInvoice(buffer.toString('base64'), 'image/jpeg');
    }

    if (!result) return;

    logger.info('[Line] OCR result', { confidence: result.confidence, supplierName: result.supplierName, total: result.total });

    const hasAnyData = result.supplierName || result.invoiceNumber || result.total || result.vatAmount;
    if (!hasAnyData) {
      await sendLineText(lineUserId, '❌ ไม่สามารถอ่านเอกสารได้ กรุณาส่งเป็นรูปภาพ (.jpg/.png) หรือ PDF ที่ไม่ใช่รูปสแกน');
      return;
    }

    // Find the linked user's companyId to store with the temp data
    const link2 = await prisma.lineUserLink.findUnique({
      where: { lineUserId },
      select: { user: { select: { companyId: true } } },
    });
    const companyId = link2?.user.companyId;

    // Check for missing required fields
    const missingFields = getMissingFields(result);

    if (missingFields.length > 0) {
      // Store partial data as session, ask for first missing field
      const [firstField, ...restFields] = missingFields;
      const session: LineSession = {
        state: 'awaiting_field',
        currentField: firstField.key,
        pendingFields: restFields.map(f => f.key),
        data: { ...result, companyId },
      };
      await redis.setex(`line:session:${lineUserId}`, 600, JSON.stringify(session));
      await sendLineTextWithQuickReply(
        lineUserId,
        `📝 ข้อมูลบางส่วนไม่ครบ กรุณาระบุ:\n\n📌 ${firstField.label}\n💡 ${firstField.hint}`,
        [{ label: '❌ ยกเลิก', text: 'ยกเลิก' }],
      );
      return;
    }

    // All required fields present — proceed to confirm card
    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await redis.setex(`ocr:temp:${tempId}`, 600, JSON.stringify({ ...result, companyId }));

    await sendLineFlexMessage(
      lineUserId,
      'ตรวจพบใบแจ้งหนี้ — กรุณายืนยัน',
      buildOcrConfirmFlexCard(result, tempId),
    );
  } catch (err) {
    logger.error('[Line] handleImageMessage failed', { err });
    await sendLineText(lineUserId, 'ขอโทษ เกิดข้อผิดพลาดในการอ่านรูปภาพ');
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

      // Find creator user
      const link = await prisma.lineUserLink.findUnique({
        where: { lineUserId },
        select: { userId: true },
      });

      if (!link) {
        await sendLineText(lineUserId, 'ยังไม่ได้เชื่อมบัญชี');
        return;
      }

      const invoiceDate = ocrData.invoiceDate
        ? new Date(ocrData.invoiceDate)
        : new Date();

      const saved = await prisma.purchaseInvoice.create({
        data: {
          companyId,
          supplierName: ocrData.supplierName || 'ไม่ระบุ',
          supplierTaxId: ocrData.supplierTaxId || '0000000000000',
          supplierBranch: ocrData.supplierBranch || '00000',
          invoiceNumber: ocrData.invoiceNumber || `LINE-${tempId}`,
          invoiceDate,
          subtotal: ocrData.subtotal,
          vatAmount: ocrData.vatAmount,
          total: ocrData.total,
          vatType: 'vat7',
          createdBy: link.userId,
        },
      });

      await redis.del(`ocr:temp:${tempId}`);

      // Store edit reference
      await redis.setex(`line:lastedit:${lineUserId}`, 300, saved.id);

      const fmt = (n: number) =>
        new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);

      const vatLine = ocrData.vatAmount > 0 ? `\n💰 ภาษีซื้อ ${fmt(ocrData.vatAmount)}` : '';
      await sendLineTextWithQuickReply(
        lineUserId,
        `✅ บันทึกภาษีซื้อเรียบร้อย!\n📋 ${ocrData.supplierName}${vatLine}\n💵 ยอดรวม ${fmt(ocrData.total)}`,
        [
          { label: '✏️ แก้ไขข้อมูล', data: `edit_purchase:${saved.id}`, displayText: 'แก้ไขข้อมูล' },
          { label: '✅ เสร็จสิ้น', text: 'เสร็จสิ้น' },
        ],
      );
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
    const stored = await redis.get(`ocr:temp:${tempId}`);
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
    await redis.setex(`line:session:${lineUserId}`, 600, JSON.stringify({ ...session, tempId }));
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
    await redis.setex(`line:editsession:${lineUserId}`, 300, JSON.stringify(editSession));

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
    logger.warn('[Line] Signature mismatch — processing anyway (check LINE_CHANNEL_SECRET on server)');
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
          await sendLineText(lineUserId, '📄 กำลังอ่านเอกสาร รอสักครู่...');
          await handleImageMessage(lineUserId, msg.id);
        }
      } else if (event.type === 'postback' && event.postback) {
        await handlePostback(lineUserId, event.postback.data);
      }
    } catch (err) {
      logger.error('[Line] Unhandled webhook event error', { err, eventType: event.type, lineUserId });
    }
  }
}
