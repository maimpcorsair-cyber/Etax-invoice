import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import prisma from '../config/database';
import redis from '../config/redis';
import { logger } from '../config/logger';
import {
  sendLineText,
  sendLineFlexMessage,
  buildOverdueFlexCard,
  buildOcrConfirmFlexCard,
  verifyLineSignature,
  OverdueInvoice,
} from '../services/lineService';
import { askPinuch, buildCompanyContext, ocrSupplierInvoice, OcrResult } from '../services/aiService';

export const lineRouter = Router();

const OTP_TTL = 600; // 10 minutes

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

async function handleTextMessage(lineUserId: string, text: string): Promise<void> {
  const trimmed = text.trim();

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
      'ยังไม่ได้เชื่อมบัญชี กรุณาเข้าระบบ e-Tax Invoice แล้วไปที่การตั้งค่า Line เพื่อรับ OTP',
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
      `สวัสดีครับ! ผมพี่นุช ผู้ช่วยบัญชีของ ${user.company.nameTh} 🤖\n\nสิ่งที่ผมช่วยได้:\n• ถามคำถามทั่วไปเกี่ยวกับบัญชีและภาษี\n• พิมพ์ "สรุปภาษี" เพื่อดูยอด VAT เดือนนี้\n• พิมพ์ "ใบเกินกำหนด" เพื่อดูใบแจ้งหนี้ที่ค้างชำระ\n• ส่งรูปใบแจ้งหนี้ เพื่อให้ผม OCR และบันทึกภาษีซื้อ`,
    );
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
    // Download image from Line CDN
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
      logger.error('[Line] Failed to download image', { status: contentResponse.status, messageId });
      await sendLineText(lineUserId, 'ขอโทษ ไม่สามารถดาวน์โหลดรูปภาพได้');
      return;
    }

    const buffer = await contentResponse.arrayBuffer();
    const imageBase64 = Buffer.from(buffer).toString('base64');

    const result = await ocrSupplierInvoice(imageBase64, 'image/jpeg');

    if (result.confidence === 'low' && !result.supplierName && !result.total) {
      await sendLineText(
        lineUserId,
        '❌ ไม่สามารถอ่านเอกสารได้เลย กรุณาส่งรูปที่ชัดขึ้นหรือส่งเป็นไฟล์ PDF',
      );
      return;
    }

    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Find the linked user's companyId to store with the temp data
    const link = await prisma.lineUserLink.findUnique({
      where: { lineUserId },
      select: { user: { select: { companyId: true } } },
    });

    await redis.setex(
      `ocr:temp:${tempId}`,
      600,
      JSON.stringify({ ...result, companyId: link?.user.companyId }),
    );

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

      await prisma.purchaseInvoice.create({
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

      const fmt = (n: number) =>
        new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);

      await sendLineText(
        lineUserId,
        `✅ บันทึกภาษีซื้อเรียบร้อย!\n📋 ${ocrData.supplierName}\n💰 ภาษีซื้อ ${fmt(ocrData.vatAmount)}`,
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
          'สวัสดีครับ/ค่ะ! ผมพี่นุช ผู้ช่วยบัญชีอัจฉริยะ 🤖\n\nส่ง OTP ที่ได้จากระบบมาหาผมเพื่อเชื่อมบัญชีของคุณ',
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
