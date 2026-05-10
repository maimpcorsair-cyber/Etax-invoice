import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';
import prisma from '../config/database';
import redis from '../config/redis';
import { logger } from '../config/logger';
import { tenantRlsContext, withRlsContext, withSystemRlsContext } from '../config/rls';
import {
  sendLineText,
  sendLineFlexMessage,
  sendLineTextWithQuickReply,
  buildOverdueFlexCard,
  buildOcrConfirmFlexCard,
  buildIntakeConfirmFlexCard,
  buildInvoiceFlexCard,
  verifyLineSignature,
  withLineReplyToken,
  getLineMessagingDiagnostics,
  getLineGroupMemberCount,
  getLineGroupMemberProfile,
  getLineGroupSummary,
  getLineRoomMemberCount,
  OverdueInvoice,
} from '../services/lineService';
import { askBillboy, buildCompanyContext, getOcrProductionReadiness, testOcrProvider, OcrResult } from '../services/aiService';
import {
  analyzeAccountingDocumentBuffer,
  documentIntakeWarningsForOcr,
  hasUsefulDocumentData,
  PURCHASE_RECORD_DOCUMENT_TYPES,
  REVIEW_ONLY_DOCUMENT_TYPES,
  supportedDocumentMimeType,
} from '../services/documentOcrService';
import { setupRichMenu } from '../services/richMenuService';
import { calculateInvoicePaymentSummary } from '../services/paymentService';
import { isStorageConfigured, uploadToStorage } from '../services/storageService';
import { syncDocumentIntakeToProjectDrive } from '../services/projectDriveSyncService';
import { buildProjectLineMemberInviteUrl } from '../services/projectLineInviteService';

export const lineRouter = Router();

const OTP_TTL = 600; // 10 minutes
const PROJECT_PORTAL_TTL = process.env.PROJECT_PORTAL_TTL ?? '7d';
const lineWebhookDiagnostics: {
  lastWebhookAt?: string;
  lastEventCount?: number;
  lastUnhandledError?: { at: string; eventType?: string; message: string };
} = {};

function getFrontendBaseUrl() {
  const firstConfigured = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? 'https://etax-invoice.vercel.app')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);
  return (firstConfigured ?? 'https://etax-invoice.vercel.app').replace(/\/+$/, '');
}

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

type DocumentTemplateField = {
  key: string;
  label: string;
  hint: string;
  type: 'text' | 'tax_id' | 'date' | 'money';
};

const PURCHASE_TEMPLATE_FIELDS: DocumentTemplateField[] = [
  { key: 'supplierName', label: 'ชื่อผู้ขาย', hint: 'เช่น บริษัท ABC จำกัด', type: 'text' },
  { key: 'supplierTaxId', label: 'เลขผู้เสียภาษีผู้ขาย (13 หลัก)', hint: 'เช่น 0105567890123', type: 'tax_id' },
  { key: 'invoiceDate', label: 'วันที่เอกสาร', hint: 'เช่น 27/04/2567 หรือ 2026-04-27', type: 'date' },
  { key: 'total', label: 'ยอดรวมทั้งสิ้น', hint: 'เช่น 10700', type: 'money' },
];

const BANK_TRANSFER_TEMPLATE_FIELDS: DocumentTemplateField[] = [
  { key: 'payment.amount', label: 'ยอดโอน', hint: 'เช่น 10700', type: 'money' },
  { key: 'payment.paidAt', label: 'วันที่โอน', hint: 'เช่น 27/04/2567 หรือ 2026-04-27', type: 'date' },
  { key: 'payment.reference', label: 'เลขอ้างอิงสลิป', hint: 'เช่น เลข reference/transaction id บนสลิป', type: 'text' },
];

function lineWebhookRlsContext(companyId: string, userId?: string | null) {
  return {
    companyId,
    userId: userId ?? null,
    role: 'line_webhook',
    systemMode: false,
  };
}

type LineOtpPayload = {
  type?: 'user' | 'group';
  userId?: string;
  companyId: string;
  projectId?: string | null;
  issuedBy?: string;
};

type LineMessageContext = {
  sourceType?: string;
  replyTargetId: string;
  senderLineUserId?: string;
  lineGroupId?: string;
  lineRoomId?: string;
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

function templateFieldsFor(result: OcrResult) {
  if (result.documentType === 'bank_transfer' || result.documentType === 'payment_advice') {
    return BANK_TRANSFER_TEMPLATE_FIELDS;
  }
  if (PURCHASE_RECORD_DOCUMENT_TYPES.has(result.documentType)) {
    return PURCHASE_TEMPLATE_FIELDS;
  }
  return [];
}

function getTemplateValue(result: OcrResult, key: string): unknown {
  if (key.startsWith('payment.')) {
    const paymentKey = key.slice('payment.'.length) as keyof NonNullable<OcrResult['payment']>;
    return result.payment?.[paymentKey];
  }
  return (result as unknown as Record<string, unknown>)[key];
}

function setTemplateValue(result: OcrResult, key: string, value: string | number) {
  if (key.startsWith('payment.')) {
    const paymentKey = key.slice('payment.'.length);
    result.payment = { ...(result.payment ?? {}), [paymentKey]: value };
    if (paymentKey === 'amount') result.total = Number(value);
    if (paymentKey === 'paidAt') result.invoiceDate = String(value);
    if (paymentKey === 'reference') result.invoiceNumber = String(value);
    return;
  }
  (result as unknown as Record<string, unknown>)[key] = value;
}

function missingTemplateFields(result: OcrResult) {
  return templateFieldsFor(result).filter((field) => {
    const value = getTemplateValue(result, field.key);
    return value === undefined || value === null || value === '' || value === 0;
  });
}

function documentIntakeFileUrl(intakeId: string, fileUrl?: string | null) {
  return fileUrl || `/api/purchase-invoices/document-intakes/${intakeId}/file`;
}

function parseTemplateReply(field: DocumentTemplateField, text: string): string | number | null {
  const trimmed = text.trim();
  if (field.type === 'money') {
    const num = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(num) && num > 0 ? num : null;
  }
  if (field.type === 'tax_id') {
    const digits = trimmed.replace(/\D/g, '');
    return digits.length === 13 ? digits : null;
  }
  if (field.type === 'date') {
    const thaiMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (thaiMatch) {
      let year = Number(thaiMatch[3]);
      if (year > 2500) year -= 543;
      return `${year}-${thaiMatch[2].padStart(2, '0')}-${thaiMatch[1].padStart(2, '0')}`;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
  }
  return trimmed || null;
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

async function testRedisSessionWrite(): Promise<{ writeOk: boolean; info: Record<string, string | number> }> {
  const key = `health:ocr-session:${Date.now()}`;
  await redis.setex(key, 30, JSON.stringify({ ok: true, ts: Date.now() }));
  await redis.del(key);

  // Pull key stats from Redis INFO
  const info: Record<string, string | number> = {};
  try {
    const raw = await (redis as unknown as { info: () => Promise<string> }).info();
    for (const line of raw.split('\r\n')) {
      const [k, v] = line.split(':');
      if (['used_memory_human', 'connected_clients', 'total_commands_processed',
           'upstash_total_commands', 'upstash_monthly_commands', 'upstash_quota_limit'].includes(k)) {
        info[k] = isNaN(Number(v)) ? v : Number(v);
      }
    }
  } catch { /* INFO not critical */ }

  return { writeOk: true, info };
}

function isMissingDocumentIntakeColumnError(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError
    && err.code === 'P2022'
    && String(err.meta?.column ?? '').startsWith('document_intakes.');
}

async function safeRedisDel(key: string) {
  try {
    await redis.del(key);
  } catch (err) {
    logger.warn('[Line] Redis DEL failed; continuing without cache cleanup', { err, key });
  }
}

async function safeRedisSetex(key: string, ttlSeconds: number, value: string) {
  try {
    await redis.setex(key, ttlSeconds, value);
    return true;
  } catch (err) {
    logger.warn('[Line] Redis SETEX failed; continuing without volatile session', { err, key });
    return false;
  }
}

async function createLineLinkOtp(payload: LineOtpPayload) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Clean up any expired OTPs for this user (prevent stale buildup)
  if (payload.userId) {
    await prisma.lineOtp.deleteMany({ where: { userId: payload.userId } });
  }

  await prisma.lineOtp.create({
    data: {
      otp,
      type: payload.type ?? 'user',
      userId: payload.userId,
      companyId: payload.companyId,
      projectId: payload.projectId ?? null,
      issuedBy: payload.issuedBy,
      expiresAt: new Date(Date.now() + OTP_TTL * 1000),
    },
  });

  logger.info('[Line] OTP created in DB', { otp: otp.slice(0, 3) + '***', type: payload.type });
  return otp;
}

function maskLineUserId(lineUserId?: string | null) {
  if (!lineUserId) return null;
  if (lineUserId.length <= 10) return 'linked';
  return `${lineUserId.slice(0, 3)}…${lineUserId.slice(-4)}`;
}

async function getLineConversationInfo(context: LineMessageContext) {
  const lineGroupId = context.lineGroupId ?? context.lineRoomId;
  if (!lineGroupId) return {};

  const [summary, memberCount] = await Promise.all([
    context.lineGroupId ? getLineGroupSummary(context.lineGroupId) : Promise.resolve(null),
    context.lineGroupId
      ? getLineGroupMemberCount(context.lineGroupId)
      : getLineRoomMemberCount(lineGroupId),
  ]);

  return {
    sourceType: context.lineGroupId ? 'group' : 'room',
    groupName: summary?.groupName ?? (context.lineGroupId ? 'LINE Group' : 'LINE Room'),
    pictureUrl: summary?.pictureUrl ?? null,
    memberCount,
  };
}

async function recordLineProjectMemberActivity(input: {
  groupLink: {
    id: string;
    companyId: string;
    projectId: string | null;
    lineGroupId: string;
  };
  sourceType?: string;
  senderLineUserId?: string;
  senderDisplayName?: string | null;
  senderPictureUrl?: string | null;
  incrementDocumentCount?: boolean;
}) {
  const now = new Date();
  let displayName = input.senderDisplayName ?? null;
  let pictureUrl = input.senderPictureUrl ?? null;

  if (input.senderLineUserId && input.sourceType === 'group' && (!displayName || !pictureUrl)) {
    const profile = await getLineGroupMemberProfile(input.groupLink.lineGroupId, input.senderLineUserId);
    displayName = displayName ?? profile?.displayName ?? null;
    pictureUrl = pictureUrl ?? profile?.pictureUrl ?? null;
  }

  const linkedUser = input.senderLineUserId
    ? await prisma.lineUserLink.findUnique({
        where: { lineUserId: input.senderLineUserId },
        select: { userId: true, isActive: true, user: { select: { companyId: true, name: true } } },
      })
    : null;
  const linkedUserId = linkedUser?.isActive && linkedUser.user.companyId === input.groupLink.companyId ? linkedUser.userId : null;
  displayName = displayName ?? linkedUser?.user.name ?? null;

  return withSystemRlsContext(prisma, async (tx) => {
    await tx.lineGroupLink.update({
      where: { id: input.groupLink.id },
      data: {
        sourceType: input.sourceType ?? 'group',
        lastMessageAt: now,
        lastSenderLineUserId: input.senderLineUserId,
        lastSenderDisplayName: displayName,
      },
    });

    if (!input.groupLink.projectId || !input.senderLineUserId) return null;

    const member = await tx.lineProjectMember.upsert({
      where: {
        lineGroupLinkId_lineUserId: {
          lineGroupLinkId: input.groupLink.id,
          lineUserId: input.senderLineUserId,
        },
      },
      create: {
        companyId: input.groupLink.companyId,
        projectId: input.groupLink.projectId,
        lineGroupLinkId: input.groupLink.id,
        lineUserId: input.senderLineUserId,
        displayName,
        pictureUrl,
        linkedUserId,
        role: linkedUserId ? 'linked_user' : 'line_guest',
        documentCount: input.incrementDocumentCount ? 1 : 0,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        displayName,
        pictureUrl,
        linkedUserId,
        role: linkedUserId ? 'linked_user' : undefined,
        documentCount: input.incrementDocumentCount ? { increment: 1 } : undefined,
        lastSeenAt: now,
      },
      select: {
        id: true,
        companyId: true,
        projectId: true,
        lineGroupLinkId: true,
        lineUserId: true,
        displayName: true,
        linkedUserId: true,
      },
    });
    return {
      ...member,
      joinUrl: member.linkedUserId
        ? null
        : buildProjectLineMemberInviteUrl({
            companyId: member.companyId,
            projectId: member.projectId,
            lineGroupLinkId: member.lineGroupLinkId,
            lineProjectMemberId: member.id,
            lineUserId: member.lineUserId,
          }),
    };
  });
}

function buildProjectJoinInviteText(input: { joinUrl: string; companyName: string; projectName?: string | null }) {
  return `รับไฟล์เข้าโปรเจคแล้วครับ ✅\n\n` +
    `ตอนนี้บันทึกในนาม LINE guest ของ ${input.companyName}${input.projectName ? ` / ${input.projectName}` : ''}\n` +
    `ถ้าต้องการดูสถานะเอกสาร, dashboard โปรเจค, หรือรับสิทธิ์ในทีม ให้กดลิงก์นี้แล้วเข้าสู่ระบบด้วย Google:\n${input.joinUrl}`;
}

async function sendProjectJoinInviteOnce(targetId: string, member: { id: string; joinUrl: string | null } | null, input: { companyName: string; projectName?: string | null }) {
  if (!member?.joinUrl) return;
  const key = `line:project-join-invite:${member.id}`;
  try {
    const sent = await redis.set(key, '1', 'EX', 24 * 60 * 60, 'NX');
    if (!sent) return;
  } catch (err) {
    logger.warn('[Line] Project join invite rate-limit failed; sending once without cache', { err, memberId: member.id });
  }
  await sendLineText(targetId, buildProjectJoinInviteText({ joinUrl: member.joinUrl, ...input }));
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
    `หมวด: ${result.postingSuggestion || result.expenseSubcategory || result.expenseCategory || '-'}\n` +
    `ภาษี: ${result.taxTreatment || '-'}\n` +
    `รวม: ${fmt(result.total)}\n` +
    `ความมั่นใจ: ${result.confidence}${warnings}`;
}

function buildReviewOnlySummary(result: OcrResult) {
  const fmt = (value: number) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value || 0);
  const meta = result.documentMetadata;
  return `รับเอกสารแล้วครับ ระบบแยกได้ว่าเป็น: ${result.documentTypeLabel || result.documentType}\n\n` +
    `เลขที่เอกสาร: ${result.invoiceNumber || meta?.purchaseOrderNumber || meta?.quotationNumber || meta?.deliveryNoteNumber || '-'}\n` +
    `คู่ค้า: ${result.supplierName || meta?.sellerName || meta?.buyerName || '-'}\n` +
    `วันที่: ${result.invoiceDate || '-'}\n` +
    `ยอดรวม: ${result.total ? fmt(result.total) : '-'}\n` +
    `หมวด: ${result.postingSuggestion || result.expenseSubcategory || result.expenseCategory || '-'}\n` +
    `ภาษี: ${result.taxTreatment || '-'}\n` +
    `ความมั่นใจ: ${result.confidence}\n\n` +
    `เอกสารนี้ยังไม่ถูกบันทึกเป็นภาษีซื้อ/รับชำระอัตโนมัติ กรุณาตรวจในคิวเอกสาร LINE`;
}

function buildConfirmationSummary(result: OcrResult) {
  const fmt = (value: number) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value || 0);
  const warningLine = result.validationWarnings?.length
    ? `\n\nข้อควรตรวจ: ${result.validationWarnings.slice(0, 3).join(' / ')}`
    : '';
  if (result.documentType === 'bank_transfer' || result.documentType === 'payment_advice') {
    return `สรุปสลิปโอนเงินก่อนบันทึก\n\n` +
      `ยอดโอน: ${fmt(paymentAmount(result))}\n` +
      `วันที่โอน: ${paymentDate(result)}\n` +
      `เลขอ้างอิง: ${paymentReference(result) || '-'}\n` +
      `จาก: ${result.payment?.fromName || '-'}\n` +
      `ถึง: ${result.payment?.toName || '-'}\n` +
      `ทิศทาง: ${result.payment?.direction || 'unknown'}\n` +
      `ความมั่นใจ: ${result.confidence}${warningLine}`;
  }

  return `สรุปเอกสารก่อนบันทึก\n\n` +
    `ประเภท: ${result.documentTypeLabel || result.documentType}\n` +
    `ผู้ขาย: ${result.supplierName || '-'}\n` +
    `เลขผู้เสียภาษี: ${result.supplierTaxId || '-'}\n` +
    `เลขที่เอกสาร: ${result.invoiceNumber || '-'}\n` +
    `วันที่: ${result.invoiceDate || '-'}\n` +
    `ยอดก่อน VAT: ${fmt(result.subtotal)}\n` +
    `VAT: ${fmt(result.vatAmount)}\n` +
    `ยอดรวม: ${fmt(result.total)}\n` +
    `หมวด: ${result.postingSuggestion || result.expenseSubcategory || result.expenseCategory || '-'}\n` +
    `ภาษี: ${result.taxTreatment || '-'}\n` +
    `ความมั่นใจ: ${result.confidence}${warningLine}`;
}

async function askForMissingField(lineUserId: string, intakeId: string, result: OcrResult, field: DocumentTemplateField) {
  await prisma.documentIntake.update({
    where: { id: intakeId },
    data: {
      status: 'awaiting_input',
      ocrResult: result as unknown as Prisma.InputJsonValue,
      warnings: [`missing:${field.key}`] as Prisma.InputJsonValue,
      error: field.key,
    },
  });
  await sendLineTextWithQuickReply(
    lineUserId,
    `อ่านเอกสารได้บางส่วนครับ ต้องการข้อมูลเพิ่มเฉพาะช่องนี้:\n\n📌 ${field.label}\n💡 ${field.hint}`,
    [{ label: '❌ ยกเลิก', text: 'ยกเลิก' }],
  );
}

async function askForConfirmation(lineUserId: string, intakeId: string, result: OcrResult) {
  await prisma.documentIntake.update({
    where: { id: intakeId },
    data: {
      status: 'awaiting_confirmation',
      ocrResult: result as unknown as Prisma.InputJsonValue,
      warnings: result.validationWarnings as Prisma.InputJsonValue | undefined,
      error: null,
    },
  });

  // Gap #1: Show category picker quick reply before the confirm Flex card
  const aiCategory = result.postingSuggestion || result.expenseSubcategory || result.expenseCategory || '';
  const categoryButtons: Array<{ label: string; data: string; displayText: string }> = [];

  if (aiCategory) {
    const shortLabel = aiCategory.length > 20 ? `${aiCategory.slice(0, 18)}…` : aiCategory;
    categoryButtons.push({
      label: `✅ ${shortLabel}`,
      data: `set_category:${intakeId}:${aiCategory}`,
      displayText: `ยืนยันหมวด: ${aiCategory}`,
    });
  }

  categoryButtons.push(
    { label: '🏢 ค่าบริการวิชาชีพ',   data: `set_category:${intakeId}:ค่าบริการวิชาชีพ`,   displayText: 'หมวด: ค่าบริการวิชาชีพ' },
    { label: '⛽ ค่าน้ำมัน/ขนส่ง',    data: `set_category:${intakeId}:ค่าน้ำมัน/ขนส่ง`,    displayText: 'หมวด: ค่าน้ำมัน/ขนส่ง' },
    { label: '🏬 วัสดุสำนักงาน',       data: `set_category:${intakeId}:วัสดุสำนักงาน`,       displayText: 'หมวด: วัสดุสำนักงาน' },
    { label: '🔧 ค่าซ่อมบำรุง',        data: `set_category:${intakeId}:ค่าซ่อมบำรุง`,        displayText: 'หมวด: ค่าซ่อมบำรุง' },
    { label: '💡 ค่าสาธารณูปโภค',     data: `set_category:${intakeId}:ค่าสาธารณูปโภค`,     displayText: 'หมวด: ค่าสาธารณูปโภค' },
    { label: '📦 ค่าสินค้า/วัตถุดิบ',  data: `set_category:${intakeId}:ค่าสินค้า/วัตถุดิบ`,  displayText: 'หมวด: ค่าสินค้า/วัตถุดิบ' },
    { label: '📋 อื่นๆ',               data: `set_category:${intakeId}:อื่นๆ`,               displayText: 'หมวด: อื่นๆ' },
  );

  await sendLineTextWithQuickReply(
    lineUserId,
    `📂 หมวดค่าใช้จ่าย: ${aiCategory || 'ยังไม่ระบุ'}\nกดยืนยันหมวดนี้ หรือเลือกใหม่:`,
    categoryButtons,
  );
}

async function savePurchaseFromLineOcr(lineUserId: string, result: OcrResult, companyId: string, fallbackId: string, createdByUserId?: string) {
  const link = createdByUserId
    ? { userId: createdByUserId }
    : await withSystemRlsContext(prisma, (tx) => tx.lineUserLink.findUnique({
        where: { lineUserId },
        select: { userId: true },
      }));

  if (!link?.userId) {
    throw new Error('Line user link not found while saving OCR purchase invoice');
  }

  const invoiceDate = result.invoiceDate ? new Date(result.invoiceDate) : new Date();
  const invoiceNumber = result.invoiceNumber || `LINE-${fallbackId}`;
  const supplierTaxId = result.supplierTaxId || '0000000000000';
  const vatType = result.taxTreatment === 'vat_exempt'
    ? 'vatExempt'
    : result.vatAmount > 0
      ? 'vat7'
      : 'vatZero';

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
        vatType,
        category: result.postingSuggestion || result.expenseSubcategory || result.expenseCategory || result.documentTypeLabel || result.documentType,
        description: `นำเข้าจาก LINE OCR: ${result.documentTypeLabel || result.documentType || 'เอกสารซื้อ'}`,
        notes: [
          `AI confidence: ${result.confidence}`,
          result.expenseCategory ? `Expense category: ${result.expenseCategory}` : null,
        result.taxTreatment ? `Tax treatment: ${result.taxTreatment}` : null,
        result.validationWarnings?.some(w => w.includes('เอกสารซ้ำ')) ? 'Possible duplicate: true' : null,
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

async function findDuplicatePurchaseFromOcr(result: OcrResult, companyId: string, fallbackId: string) {
  const supplierTaxId = result.supplierTaxId || '0000000000000';
  const invoiceNumber = result.invoiceNumber || `LINE-${fallbackId}`;
  if (!supplierTaxId || supplierTaxId === '0000000000000' || !invoiceNumber) return null;
  return prisma.purchaseInvoice.findFirst({
    where: { companyId, supplierTaxId, invoiceNumber },
    select: {
      id: true,
      supplierName: true,
      invoiceNumber: true,
      invoiceDate: true,
      total: true,
    },
  });
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

function hasUsefulLineOcrData(result?: OcrResult) {
  return !!(result && (result.supplierName || result.invoiceNumber || result.total || result.vatAmount || paymentAmount(result)));
}

function bankTransferDetails(result: OcrResult) {
  const payment = result.payment;
  const lines = [
    payment?.bankName ? `🏦 ธนาคาร/แอป: ${payment.bankName}` : null,
    payment?.fromName || payment?.fromAccount
      ? `จาก: ${payment?.fromName || '-'}${payment?.fromAccount ? ` (${payment.fromAccount})` : ''}`
      : null,
    payment?.toName || payment?.toAccount
      ? `ถึง: ${payment?.toName || '-'}${payment?.toAccount ? ` (${payment.toAccount})` : ''}`
      : null,
    paymentReference(result) ? `เลขอ้างอิง: ${paymentReference(result)}` : null,
  ].filter(Boolean);
  return lines.length ? `\n${lines.join('\n')}` : '';
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
        message: `✅ บันทึกรับชำระจากสลิปแล้ว\n📄 ${exact.invoiceNumber}\n👤 ${exact.buyer.nameTh}\n💵 ${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount)}${bankTransferDetails(result)}`,
      };
    }

    return {
      ok: false,
      status: 'needs_review',
      targetType: 'sales_invoice',
      message: `อ่านสลิปโอนได้ แต่ยังจับคู่กับใบขายไม่ได้\nยอด: ${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount)}${bankTransferDetails(result)}\nกรุณาตรวจในหน้าเอกสาร/รับชำระเงิน`,
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
      message: `✅ บันทึกจ่ายชำระเอกสารซื้อแล้ว\n📄 ${exactPurchase.invoiceNumber}\n🏢 ${exactPurchase.supplierName}\n💵 ${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount)}${bankTransferDetails(result)}`,
    };
  }

  return {
    ok: false,
    status: 'needs_review',
    targetType: 'purchase_invoice',
    message: `อ่านสลิปโอนได้ แต่ยังจับคู่กับเอกสารซื้อไม่ได้\nยอด: ${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount)}${bankTransferDetails(result)}\nกรุณาตรวจในหน้า Input VAT`,
    warnings: ['unmatched:purchase_invoice'],
  };
}

async function createDocumentIntake(input: {
  companyId: string;
  projectId?: string | null;
  userId: string;
  lineUserId: string;
  messageId: string;
  mimeType: string;
  buffer: Buffer;
}) {
  try {
    let fileUrl: string | undefined;
    let storageKey: string | undefined;
    let fileBase64: string | undefined;
    const storageReady = isStorageConfigured();
    const ext = input.mimeType === 'application/pdf'
      ? 'pdf'
      : input.mimeType.includes('png')
        ? 'png'
        : input.mimeType.includes('webp')
          ? 'webp'
          : 'jpg';

    if (storageReady) {
      storageKey = `companies/${input.companyId}/document-intakes/${new Date().toISOString().slice(0, 10)}/${input.messageId}.${ext}`;
      try {
        fileUrl = await uploadToStorage(storageKey, input.buffer, input.mimeType);
      } catch (storageErr) {
        logger.warn('[Line] Document intake storage upload failed; falling back to database file', {
          err: storageErr,
          storageKey,
          messageId: input.messageId,
        });
        storageKey = undefined;
        fileBase64 = input.buffer.toString('base64');
      }
    } else {
      fileBase64 = input.buffer.toString('base64');
    }

    return await withSystemRlsContext(prisma, (tx) =>
      tx.documentIntake.create({
        data: {
          companyId: input.companyId,
          projectId: input.projectId ?? null,
          userId: input.userId,
          lineUserId: input.lineUserId,
          source: 'line',
          sourceMessageId: input.messageId,
          fileName: `LINE-${input.messageId}.${ext}`,
          mimeType: input.mimeType,
          fileSize: input.buffer.length,
          fileBase64,
          fileUrl,
          storageKey,
          status: 'received',
        },
      }),
    );
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
    const updated = await withSystemRlsContext(prisma, (tx) =>
      tx.documentIntake.update({
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
        select: { companyId: true, projectId: true, userId: true },
      }),
    );
    if (updated.projectId && ['saved', 'needs_review', 'failed', 'awaiting_input', 'awaiting_confirmation'].includes(data.status)) {
      void syncDocumentIntakeToProjectDrive(id, {
        companyId: updated.companyId,
        preferredUserId: updated.userId,
      });
    }
  } catch (err) {
    logger.warn('[Line] Document intake update failed', { err, intakeId: id, status: data.status });
  }
}

// GET /api/line/status
lineRouter.get('/status', authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const companyId = req.user!.companyId;

    const { link, company } = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const link = await tx.lineUserLink.findUnique({
        where: { userId },
        select: { displayName: true, isActive: true },
      });
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { lineNotifyEnabled: true, overdueReminderDays: true },
      });
      return { link, company };
    });

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

    const otp = await createLineLinkOtp({ type: 'user', userId, companyId });
    if (!otp) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again in a few seconds.' });
      return;
    }

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

    await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) =>
      tx.lineUserLink.deleteMany({ where: { userId } }),
    );
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

lineRouter.get('/admin/users', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const users = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) =>
      tx.user.findMany({
        where: { companyId: req.user!.companyId },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          lineUserLink: {
            select: {
              lineUserId: true,
              displayName: true,
              pictureUrl: true,
              isActive: true,
              linkedAt: true,
            },
          },
        },
      }),
    );

    res.json({
      data: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        line: user.lineUserLink
          ? {
              linked: user.lineUserLink.isActive,
              displayName: user.lineUserLink.displayName,
              pictureUrl: user.lineUserLink.pictureUrl,
              linkedAt: user.lineUserLink.linkedAt,
              lineUserIdMasked: maskLineUserId(user.lineUserLink.lineUserId),
            }
          : { linked: false },
      })),
    });
  } catch (err) {
    logger.error('[Line] GET /admin/users failed', { err });
    res.status(500).json({ error: 'Failed to fetch Line users' });
  }
});

lineRouter.post('/admin/users/:userId/link-start', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const targetUser = await prisma.user.findFirst({
      where: {
        id: req.params.userId,
        companyId: req.user!.companyId,
        isActive: true,
      },
      select: { id: true, name: true, email: true },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'Active user not found in this company' });
      return;
    }

    const otp = await createLineLinkOtp({
      type: 'user',
      userId: targetUser.id,
      companyId: req.user!.companyId,
      issuedBy: req.user!.userId,
    });
    if (!otp) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again in a few seconds.' });
      return;
    }

    res.json({
      data: {
        otp,
        expiresInSeconds: OTP_TTL,
        user: targetUser,
      },
    });
  } catch (err) {
    logger.error('[Line] POST /admin/users/:userId/link-start failed', { err, userId: req.params.userId });
    res.status(500).json({ error: 'Failed to generate user link OTP' });
  }
});

lineRouter.delete('/admin/users/:userId/unlink', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const deleted = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const targetUser = await tx.user.findFirst({
        where: {
          id: req.params.userId,
          companyId: req.user!.companyId,
        },
        select: { id: true },
      });

      if (!targetUser) return null;
      return tx.lineUserLink.deleteMany({ where: { userId: targetUser.id } });
    });

    if (!deleted) {
      res.status(404).json({ error: 'User not found in this company' });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error('[Line] DELETE /admin/users/:userId/unlink failed', { err, userId: req.params.userId });
    res.status(500).json({ error: 'Failed to unlink Line user' });
  }
});

lineRouter.get('/admin/groups', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const groups = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) =>
      tx.lineGroupLink.findMany({
        where: { companyId: req.user!.companyId },
        orderBy: [{ isActive: 'desc' }, { linkedAt: 'desc' }],
        select: {
          id: true,
          projectId: true,
          lineGroupId: true,
          sourceType: true,
          groupName: true,
          pictureUrl: true,
          memberCount: true,
          lastMessageAt: true,
          lastSenderDisplayName: true,
          lastSyncedAt: true,
          isActive: true,
          linkedAt: true,
          project: {
            select: { id: true, code: true, name: true, status: true },
          },
          linkedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    );

    res.json({
      data: groups.map((group) => ({
        id: group.id,
        groupName: group.groupName,
        projectId: group.projectId,
        project: group.project,
        sourceType: group.sourceType,
        pictureUrl: group.pictureUrl,
        memberCount: group.memberCount,
        lastMessageAt: group.lastMessageAt,
        lastSenderDisplayName: group.lastSenderDisplayName,
        lastSyncedAt: group.lastSyncedAt,
        isActive: group.isActive,
        linkedAt: group.linkedAt,
        lineGroupIdMasked: maskLineUserId(group.lineGroupId),
        linkedBy: group.linkedBy,
      })),
    });
  } catch (err) {
    logger.error('[Line] GET /admin/groups failed', { err });
    res.status(500).json({ error: 'Failed to fetch Line groups' });
  }
});

lineRouter.post('/admin/groups/link-start', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const body = z.object({ projectId: z.string().min(1).optional().nullable() }).parse(req.body ?? {});
    if (body.projectId) {
      const projectId = body.projectId;
      const project = await withRlsContext(prisma, tenantRlsContext(req.user!), (tx) =>
        tx.project.findFirst({
          where: { id: projectId, companyId: req.user!.companyId },
          select: { id: true },
        }),
      );
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
    }

    const otp = await createLineLinkOtp({
      type: 'group',
      companyId: req.user!.companyId,
      projectId: body.projectId ?? null,
      issuedBy: req.user!.userId,
    });

    if (!otp) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again in a few seconds.' });
      return;
    }

    res.json({
      data: {
        otp,
        expiresInSeconds: OTP_TTL,
      },
    });
  } catch (err) {
    logger.error('[Line] POST /admin/groups/link-start failed', { err });
    res.status(500).json({ error: 'Failed to generate group link OTP' });
  }
});

lineRouter.patch('/admin/groups/:groupId/project', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const body = z.object({ projectId: z.string().min(1).nullable() }).parse(req.body);
    const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const existing = await tx.lineGroupLink.findFirst({
        where: { id: req.params.groupId, companyId: req.user!.companyId },
        select: { id: true },
      });
      if (!existing) return null;
      if (body.projectId) {
        const project = await tx.project.findFirst({
          where: { id: body.projectId, companyId: req.user!.companyId },
          select: { id: true },
        });
        if (!project) throw new Error('Project not found');
      }
      return tx.lineGroupLink.update({
        where: { id: existing.id },
        data: { projectId: body.projectId },
        select: {
          id: true,
          projectId: true,
          project: { select: { id: true, code: true, name: true, status: true } },
        },
      });
    });

    if (!updated) {
      res.status(404).json({ error: 'Line group not found in this company' });
      return;
    }
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('[Line] PATCH /admin/groups/:groupId/project failed', { err, groupId: req.params.groupId });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update Line group project' });
  }
});

lineRouter.post('/admin/groups/:groupId/portal-link', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const group = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.lineGroupLink.findFirst({
        where: { id: req.params.groupId, companyId: req.user!.companyId, isActive: true },
        select: {
          id: true,
          companyId: true,
          projectId: true,
          groupName: true,
          project: { select: { id: true, code: true, name: true } },
        },
      });
    });

    if (!group) {
      res.status(404).json({ error: 'Line group not found in this company' });
      return;
    }
    if (!group.projectId || !group.project) {
      res.status(400).json({ error: 'Assign this LINE group to a project before creating a guest portal link' });
      return;
    }

    const token = jwt.sign(
      {
        type: 'project_guest',
        companyId: group.companyId,
        projectId: group.projectId,
        groupLinkId: group.id,
      },
      process.env.JWT_SECRET!,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { expiresIn: PROJECT_PORTAL_TTL as any },
    );
    const url = `${getFrontendBaseUrl()}/project-portal/${token}`;

    res.json({
      data: {
        url,
        expiresIn: PROJECT_PORTAL_TTL,
        project: group.project,
        groupName: group.groupName,
      },
    });
  } catch (err) {
    logger.error('[Line] POST /admin/groups/:groupId/portal-link failed', { err, groupId: req.params.groupId });
    res.status(500).json({ error: 'Failed to create project guest portal link' });
  }
});

lineRouter.delete('/admin/groups/:groupId', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const deleted = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const existing = await tx.lineGroupLink.findFirst({
        where: {
          id: req.params.groupId,
          companyId: req.user!.companyId,
        },
        select: { id: true },
      });

      if (!existing) return null;
      return tx.lineGroupLink.delete({ where: { id: existing.id } });
    });

    if (!deleted) {
      res.status(404).json({ error: 'Line group not found in this company' });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error('[Line] DELETE /admin/groups/:groupId failed', { err, groupId: req.params.groupId });
    res.status(500).json({ error: 'Failed to unlink Line group' });
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
        productionReadiness: getOcrProductionReadiness(),
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

lineRouter.get('/admin/live-status', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  const companyId = req.user!.companyId;
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const [redisResult, intakeColumnsResult, recentIntakesResult, linkedUsersResult, linkedGroupsResult, intakeStatusResult, storageResult, intakeSourceResult, intakeMimeResult, documentUsageResult] = await Promise.allSettled([
    testRedisSessionWrite(),
    prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'document_intakes'
        AND column_name IN ('targetType', 'targetId', 'purchaseInvoiceId')
    `,
    prisma.documentIntake.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        source: true,
        fileName: true,
        mimeType: true,
        status: true,
        projectId: true,
        project: { select: { id: true, code: true, name: true } },
        targetType: true,
        targetId: true,
        purchaseInvoiceId: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.lineUserLink.count({ where: { user: { companyId }, isActive: true } }),
    prisma.lineGroupLink.count({ where: { companyId, isActive: true } }),
    prisma.documentIntake.groupBy({
      by: ['status'],
      where: { companyId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    Promise.all([
      prisma.documentIntake.count({ where: { companyId, storageKey: { not: null }, createdAt: { gte: since } } }),
      prisma.documentIntake.count({ where: { companyId, fileBase64: { not: null }, createdAt: { gte: since } } }),
      prisma.documentIntake.count({
        where: {
          companyId,
          createdAt: { gte: since },
          OR: [
            { error: { contains: 'duplicate', mode: 'insensitive' } },
            { error: { contains: 'ซ้ำ' } },
          ],
        },
      }),
    ]),
    prisma.documentIntake.groupBy({
      by: ['source'],
      where: { companyId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.documentIntake.groupBy({
      by: ['mimeType'],
      where: { companyId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    Promise.all([
      prisma.invoice.count({ where: { companyId, createdAt: { gte: since } } }),
      prisma.purchaseInvoice.count({ where: { companyId, createdAt: { gte: since } } }),
      prisma.documentIntake.count({ where: { companyId, createdAt: { gte: since } } }),
    ]),
  ]);

  const columns = intakeColumnsResult.status === 'fulfilled'
    ? intakeColumnsResult.value.map((row) => row.column_name)
    : [];
  const requiredColumns = ['targetType', 'targetId', 'purchaseInvoiceId'];
  const missingColumns = requiredColumns.filter((column) => !columns.includes(column));

  res.json({
    data: {
      checkedAt: new Date().toISOString(),
      webhook: lineWebhookDiagnostics,
      lineMessaging: getLineMessagingDiagnostics(),
      redis: redisResult.status === 'fulfilled'
        ? { ok: true, response: redisResult.value }
        : { ok: false, error: redisResult.reason instanceof Error ? redisResult.reason.message : String(redisResult.reason) },
      documentIntakesSchema: {
        ok: missingColumns.length === 0,
        missingColumns,
        error: intakeColumnsResult.status === 'rejected'
          ? intakeColumnsResult.reason instanceof Error ? intakeColumnsResult.reason.message : String(intakeColumnsResult.reason)
          : undefined,
      },
      recentDocumentIntakes: recentIntakesResult.status === 'fulfilled'
        ? { ok: true, items: recentIntakesResult.value }
        : { ok: false, items: [], error: recentIntakesResult.reason instanceof Error ? recentIntakesResult.reason.message : String(recentIntakesResult.reason) },
      linkedUsers: linkedUsersResult.status === 'fulfilled'
        ? { ok: true, count: linkedUsersResult.value }
        : { ok: false, count: 0, error: linkedUsersResult.reason instanceof Error ? linkedUsersResult.reason.message : String(linkedUsersResult.reason) },
      linkedGroups: linkedGroupsResult.status === 'fulfilled'
        ? { ok: true, count: linkedGroupsResult.value }
        : { ok: false, count: 0, error: linkedGroupsResult.reason instanceof Error ? linkedGroupsResult.reason.message : String(linkedGroupsResult.reason) },
      documentOps: {
        windowDays: 30,
        byStatus: intakeStatusResult.status === 'fulfilled'
          ? Object.fromEntries(intakeStatusResult.value.map((row) => [row.status, row._count._all]))
          : {},
        bySource: intakeSourceResult.status === 'fulfilled'
          ? Object.fromEntries(intakeSourceResult.value.map((row) => [row.source, row._count._all]))
          : {},
        byMimeType: intakeMimeResult.status === 'fulfilled'
          ? Object.fromEntries(intakeMimeResult.value.map((row) => [row.mimeType, row._count._all]))
          : {},
        usageTelemetry: documentUsageResult.status === 'fulfilled'
          ? {
              salesInvoices: documentUsageResult.value[0],
              purchaseInvoices: documentUsageResult.value[1],
              documentIntakes: documentUsageResult.value[2],
              billableDocuments: documentUsageResult.value[0] + documentUsageResult.value[1] + documentUsageResult.value[2],
              estimatedOcrCostThb: Math.round(documentUsageResult.value[2] * Number(process.env.AI_OCR_AVG_COST_THB ?? 0.25) * 100) / 100,
            }
          : { salesInvoices: 0, purchaseInvoices: 0, documentIntakes: 0, billableDocuments: 0, estimatedOcrCostThb: 0 },
        storage: storageResult.status === 'fulfilled'
          ? {
              configured: isStorageConfigured(),
              storageBacked: storageResult.value[0],
              databaseBacked: storageResult.value[1],
              duplicateWarnings: storageResult.value[2],
            }
          : { configured: isStorageConfigured(), storageBacked: 0, databaseBacked: 0, duplicateWarnings: 0 },
      },
      ocrReadiness: getOcrProductionReadiness(),
    },
  });
});

// ─── Webhook ──────────────────────────────────────────────────────────────────

interface LineSource {
  type?: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
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
  joined?: { members?: Array<{ type?: string; userId?: string }> };
}

interface LineWebhookBody {
  events: LineEvent[];
}

async function handleGroupLinkOtp(context: LineMessageContext, text: string): Promise<boolean> {
  const lineGroupId = context.lineGroupId ?? context.lineRoomId;
  if (!lineGroupId) return false;

  const otpMatch = text.trim().match(/^(?:\/link-group\s+|\/link\s+|ผูกโปรเจค\s+|ผูกกลุ่ม\s+)?(\d{6})$/i);
  if (!otpMatch) return false;

  const otp = otpMatch[1];
  const otpRecord = await prisma.lineOtp.findUnique({ where: { otp } });

  if (!otpRecord || otpRecord.expiresAt < new Date()) {
    if (otpRecord) await prisma.lineOtp.delete({ where: { id: otpRecord.id } }).catch(() => {});
    await sendLineText(context.replyTargetId, 'รหัสเชื่อมต่อกลุ่มไม่ถูกต้องหรือหมดอายุแล้ว กรุณาให้แอดมินสร้างรหัสใหม่');
    return true;
  }

  if (otpRecord.type !== 'group') {
    return false;
  }

  const company = await prisma.company.findUnique({
    where: { id: otpRecord.companyId },
    select: { id: true, nameTh: true },
  });

  if (!company) {
    await prisma.lineOtp.delete({ where: { id: otpRecord.id } }).catch(() => {});
    await sendLineText(context.replyTargetId, 'ไม่พบบริษัทที่ผูกกับรหัสนี้ กรุณาสร้างรหัสใหม่');
    return true;
  }

  const lineInfo = await getLineConversationInfo(context);

  await withRlsContext(prisma, lineWebhookRlsContext(company.id, otpRecord.issuedBy), async (tx) => {
    await tx.lineGroupLink.upsert({
      where: { lineGroupId },
      create: {
        companyId: company.id,
        projectId: otpRecord.projectId ?? null,
        lineGroupId,
        sourceType: lineInfo.sourceType ?? (context.lineGroupId ? 'group' : 'room'),
        groupName: lineInfo.groupName ?? (context.lineGroupId ? 'LINE Group' : 'LINE Room'),
        pictureUrl: lineInfo.pictureUrl ?? null,
        memberCount: lineInfo.memberCount ?? null,
        lastSyncedAt: new Date(),
        isActive: true,
        linkedById: otpRecord.issuedBy,
      },
      update: {
        companyId: company.id,
        projectId: otpRecord.projectId ?? undefined,
        sourceType: lineInfo.sourceType ?? (context.lineGroupId ? 'group' : 'room'),
        groupName: lineInfo.groupName ?? (context.lineGroupId ? 'LINE Group' : 'LINE Room'),
        pictureUrl: lineInfo.pictureUrl ?? null,
        memberCount: lineInfo.memberCount ?? null,
        lastSyncedAt: new Date(),
        isActive: true,
        linkedById: otpRecord.issuedBy,
        linkedAt: new Date(),
      },
    });

    await tx.lineOtp.delete({ where: { id: otpRecord.id } });
  });
  await sendLineText(
    context.replyTargetId,
    `เชื่อมกลุ่ม LINE กับ ${company.nameTh} สำเร็จแล้วครับ${otpRecord.projectId ? '\nเอกสารจากกลุ่มนี้จะเข้าโปรเจคที่เลือกอัตโนมัติ' : ''}\n\nจากนี้สมาชิกในกลุ่มส่งรูป/PDF ใบเสร็จหรือใบกำกับภาษีให้ Billboy อ่านและเข้าคิวเอกสารได้เลย`,
  );
  return true;
}

async function resolveLineConversationContext(context: LineMessageContext) {
  const [senderLink, groupLink] = await withSystemRlsContext(prisma, async (tx) =>
    Promise.all([
      context.senderLineUserId
        ? tx.lineUserLink.findUnique({
            where: { lineUserId: context.senderLineUserId },
            include: { user: { include: { company: true } } },
          })
        : Promise.resolve(null),
      (context.lineGroupId ?? context.lineRoomId)
        ? tx.lineGroupLink.findUnique({
            where: { lineGroupId: context.lineGroupId ?? context.lineRoomId },
            include: {
              company: true,
              project: { select: { id: true, code: true, name: true } },
              linkedBy: { select: { id: true, isActive: true } },
            },
          })
        : Promise.resolve(null),
    ]),
  );

  if (context.lineGroupId || context.lineRoomId) {
    if (!groupLink?.isActive) {
      return { ok: false as const, reason: 'group_unlinked' as const };
    }

    const senderBelongsToGroupCompany = !!senderLink?.isActive && senderLink.user.companyId === groupLink.companyId;
    const fallbackUserId = (senderBelongsToGroupCompany ? senderLink.userId : null)
      ?? (groupLink.linkedBy?.isActive ? groupLink.linkedBy.id : null)
      ?? await findActiveCompanyAdminId(groupLink.companyId);

    if (!fallbackUserId) {
      return { ok: false as const, reason: 'no_active_user' as const };
    }

    await recordLineProjectMemberActivity({
      groupLink,
      sourceType: context.lineGroupId ? 'group' : 'room',
      senderLineUserId: context.senderLineUserId,
      senderDisplayName: senderBelongsToGroupCompany ? senderLink.user.name : null,
      senderPictureUrl: senderBelongsToGroupCompany ? senderLink.pictureUrl : null,
    }).catch((err) => logger.warn('[Line] group member activity update failed', { err, lineGroupId: groupLink.lineGroupId }));

    return {
      ok: true as const,
      companyId: groupLink.companyId,
      companyName: groupLink.company.nameTh,
      userId: fallbackUserId,
      userName: senderBelongsToGroupCompany ? senderLink.user.name : 'LINE group member',
      userCompany: senderBelongsToGroupCompany ? senderLink.user.company : groupLink.company,
      senderLink: senderBelongsToGroupCompany ? senderLink : null,
      groupLink,
      project: groupLink.project,
    };
  }

  if (!senderLink?.isActive) {
    return { ok: false as const, reason: 'user_unlinked' as const };
  }

  return {
    ok: true as const,
    companyId: senderLink.user.companyId,
    companyName: senderLink.user.company.nameTh,
    userId: senderLink.userId,
    userName: senderLink.user.name,
    userCompany: senderLink.user.company,
    senderLink,
    groupLink: null,
  };
}

async function findActiveCompanyAdminId(companyId: string) {
  const admin = await prisma.user.findFirst({
    where: {
      companyId,
      isActive: true,
      role: { in: ['admin', 'super_admin'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return admin?.id ?? null;
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
    await safeRedisDel(`line:session:${lineUserId}`);
    await sendLineText(lineUserId, '❌ ยกเลิกแล้ว');
    return true;
  }

  let session: LineSession;
  try {
    session = JSON.parse(raw) as LineSession;
  } catch (err) {
    logger.warn('[Line] Corrupted Redis LINE session cleared', { err, lineUserId });
    await safeRedisDel(`line:session:${lineUserId}`);
    return false;
  }
  const field = REQUIRED_OCR_FIELDS.find(f => f.key === session.currentField);
  if (!field) {
    logger.warn('[Line] Unknown Redis LINE session field cleared', { lineUserId, currentField: session.currentField });
    await safeRedisDel(`line:session:${lineUserId}`);
    return false;
  }

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
    const nextField = REQUIRED_OCR_FIELDS.find(f => f.key === nextKey);
    if (!nextField) {
      logger.warn('[Line] Unknown pending Redis LINE session field skipped', { lineUserId, nextKey });
      session.pendingFields = session.pendingFields.slice(1);
      await safeRedisSetex(`line:session:${lineUserId}`, 600, JSON.stringify(session));
      return true;
    }
    session.currentField = nextKey;
    session.pendingFields = session.pendingFields.slice(1);
    const saved = await safeRedisSetex(`line:session:${lineUserId}`, 600, JSON.stringify(session));
    if (!saved) {
      await sendLineText(lineUserId, 'ระบบจำสถานะชั่วคราวไม่ได้ตอนนี้ กรุณาส่งเอกสารใหม่หรือพิมพ์ "ช่วยเหลือ" เพื่อใช้งานคำสั่งอื่นครับ');
      return true;
    }
    await sendLineTextWithQuickReply(
      lineUserId,
      `✅ บันทึก ${field.label} แล้ว\n\n📌 กรุณาระบุต่อไป:\n${nextField.label}\n💡 ${nextField.hint}`,
      [{ label: '❌ ยกเลิก', text: 'ยกเลิก' }],
    );
    return true;
  }

  // All fields collected — show confirm card
  await safeRedisDel(`line:session:${lineUserId}`);
  const fullData = session.data as OcrResult & { companyId?: string };
  const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempSaved = await safeRedisSetex(`ocr:temp:${tempId}`, 600, JSON.stringify(fullData));
  if (!tempSaved) {
    await sendLineText(lineUserId, buildOcrTextSummary(fullData, 'ระบบจำข้อมูลยืนยันชั่วคราวไม่ได้ตอนนี้'));
    return true;
  }
  await sendLineFlexMessage(
    lineUserId,
    'ตรวจพบใบแจ้งหนี้ — กรุณายืนยัน',
    buildOcrConfirmFlexCard(fullData as OcrResult, tempId),
  );
  return true;
}

async function handleDurableIntakeReply(lineUserId: string, text: string): Promise<boolean> {
  let active;
  try {
    active = await prisma.documentIntake.findFirst({
      where: { lineUserId, status: 'awaiting_input' },
      orderBy: { updatedAt: 'desc' },
    });
  } catch (err) {
    if (isMissingDocumentIntakeColumnError(err)) {
      logger.error('[Line] document_intakes schema is missing columns; deploy migrations before durable intake can work', { err });
      return false;
    }
    throw err;
  }
  if (!active) return false;

  const trimmed = text.trim();
  if (trimmed === 'ยกเลิก') {
    await prisma.documentIntake.update({
      where: { id: active.id },
      data: { status: 'needs_review', error: 'cancelled_by_user' },
    });
    await sendLineText(lineUserId, 'ยกเลิกการกรอกข้อมูลแล้ว เอกสารยังอยู่ในคิวรอตรวจ');
    return true;
  }

  const result = active.ocrResult as unknown as OcrResult | null;
  if (!result) return false;

  // Handle free-form field edit triggered by editintake: postback
  if (active.error?.startsWith('editintake:')) {
    const fieldKey = active.error.split(':')[1];
    const updated = { ...result } as Record<string, unknown>;
    if (fieldKey === 'total' || fieldKey === 'vatAmount' || fieldKey === 'subtotal') {
      const num = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
      if (isNaN(num)) {
        await sendLineText(lineUserId, '⚠️ กรุณาพิมพ์ตัวเลข เช่น 5350');
        return true;
      }
      updated[fieldKey] = num;
      if (fieldKey === 'total' && (result as OcrResult).vatAmount) {
        updated['subtotal'] = num - (result as OcrResult).vatAmount;
      }
      if (fieldKey === 'vatAmount' && (result as OcrResult).total) {
        updated['subtotal'] = (result as OcrResult).total - num;
      }
    } else {
      updated[fieldKey] = trimmed;
    }
    const newResult = updated as unknown as OcrResult;
    await prisma.documentIntake.update({
      where: { id: active.id },
      data: {
        ocrResult: newResult as unknown as Prisma.InputJsonValue,
        status: 'awaiting_confirmation',
        error: null,
      },
    });
    await sendLineFlexMessage(
      lineUserId,
      'อัพเดตแล้ว — กรุณายืนยัน',
      buildIntakeConfirmFlexCard(newResult, active.id),
    );
    return true;
  }

  const field = templateFieldsFor(result).find((item) => item.key === active.error) ?? missingTemplateFields(result)[0];
  if (!field) {
    await askForConfirmation(lineUserId, active.id, result);
    return true;
  }

  const parsed = parseTemplateReply(field, trimmed);
  if (parsed === null) {
    await sendLineText(lineUserId, `รูปแบบไม่ถูกต้องครับ\n📌 ${field.label}\n💡 ${field.hint}`);
    return true;
  }
  setTemplateValue(result, field.key, parsed);

  const [nextField] = missingTemplateFields(result);
  if (nextField) {
    await askForMissingField(lineUserId, active.id, result, nextField);
    return true;
  }

  await askForConfirmation(lineUserId, active.id, result);
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

  let session: LineEditSession;
  try {
    session = JSON.parse(raw) as LineEditSession;
  } catch (err) {
    logger.warn('[Line] Corrupted Redis edit session cleared', { err, lineUserId });
    await safeRedisDel(`line:editsession:${lineUserId}`);
    return false;
  }

  if (trimmed === 'ยกเลิก' || trimmed === 'เสร็จสิ้น') {
    await safeRedisDel(`line:editsession:${lineUserId}`);
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
    await safeRedisDel(`line:editsession:${lineUserId}`);
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

async function handleTextMessage(lineUserId: string, text: string, context?: LineMessageContext): Promise<void> {
  const messageContext = context ?? { replyTargetId: lineUserId, senderLineUserId: lineUserId };
  const senderLineUserId = messageContext.senderLineUserId ?? lineUserId;
  const trimmed = text.trim();

  if (await handleGroupLinkOtp(messageContext, trimmed)) return;

  // Check if user is in a field-input session
  if (await handleSessionReply(lineUserId, trimmed)) return;

  // Check if user is filling a durable document intake template
  if (await handleDurableIntakeReply(lineUserId, trimmed)) return;

  // Check if user is in an edit session
  if (await handleEditReply(lineUserId, trimmed)) return;

  // OTP link flow — accept bare "723430" or "/link 723430"
  const otpMatch = trimmed.match(/^(?:\/link\s+)?(\d{6})$/);
  if (otpMatch) {
    const otp = otpMatch[1];

    // Look up OTP from database (not Redis — Redis on Render free tier is unreliable)
    const otpRecord = await prisma.lineOtp.findUnique({ where: { otp } });

    if (!otpRecord || otpRecord.expiresAt < new Date()) {
      if (otpRecord) await prisma.lineOtp.delete({ where: { id: otpRecord.id } }).catch(() => {});
      await sendLineText(lineUserId, 'OTP ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอ OTP ใหม่จากระบบ');
      return;
    }

    logger.info('[Line] OTP found in DB', { otp: otp.slice(0, 3) + '***', type: otpRecord.type, lineUser: lineUserId.slice(0, 8) });

    if (otpRecord.type === 'group') {
      await sendLineText(lineUserId, 'รหัสนี้ใช้สำหรับเชื่อม LINE group กรุณาส่งรหัสในกลุ่มที่ต้องการเชื่อม');
      return;
    }

    if (!otpRecord.userId) {
      await prisma.lineOtp.delete({ where: { id: otpRecord.id } }).catch(() => {});
      await sendLineText(lineUserId, 'รหัสนี้ไม่สมบูรณ์ กรุณาขอรหัสใหม่จากระบบ');
      return;
    }

    // Step 1: Run the DB transaction (link user + consume OTP)
    let linkResult: { ok: true; userName: string | null } | { ok: false; reason: string };
    try {
      linkResult = await withRlsContext(prisma, lineWebhookRlsContext(otpRecord.companyId, otpRecord.userId), async (tx) => {
        const targetUser = await tx.user.findFirst({
          where: { id: otpRecord.userId!, companyId: otpRecord.companyId, isActive: true },
          select: { id: true, name: true, companyId: true },
        });

        if (!targetUser) {
          return { ok: false as const, reason: 'user_not_found' as const };
        }

        const existingLineLink = await tx.lineUserLink.findUnique({
          where: { lineUserId: senderLineUserId },
          select: { userId: true },
        });

        if (existingLineLink && existingLineLink.userId !== targetUser.id) {
          return { ok: false as const, reason: 'line_already_linked' as const };
        }

        await tx.lineUserLink.upsert({
          where: { userId: targetUser.id },
          create: {
            userId: targetUser.id,
            lineUserId: senderLineUserId,
            displayName: targetUser.name,
            isActive: true,
          },
          update: {
            lineUserId: senderLineUserId,
            displayName: targetUser.name,
            isActive: true,
            linkedAt: new Date(),
          },
        });

        await tx.lineOtp.delete({ where: { id: otpRecord.id } });

        return { ok: true as const, userName: targetUser.name };
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errCode = (err as { code?: string }).code;
      logger.error('[Line] OTP link DB transaction failed', { err: errMsg, errCode, otp: otp.slice(0, 3) + '***' });

      if (errCode === 'P2002') {
        await sendLineText(lineUserId, 'บัญชี LINE นี้หรือผู้ใช้นี้ถูกเชื่อมแล้ว กรุณาให้แอดมินตรวจสอบสถานะการเชื่อมต่อ');
      } else {
        await sendLineText(lineUserId, `เชื่อมไม่สำเร็จ: ${errMsg.slice(0, 80)}`);
      }
      return;
    }

    // Step 2: Send response message (outside try-catch so DB errors don't mix with LINE API errors)
    if (!linkResult.ok) {
      if (linkResult.reason === 'line_already_linked') {
        await sendLineText(lineUserId, 'บัญชี LINE นี้ถูกเชื่อมกับผู้ใช้อื่นแล้ว กรุณาให้แอดมินถอดการเชื่อมต่อก่อนแล้วลองใหม่');
      } else {
        await prisma.lineOtp.delete({ where: { id: otpRecord.id } }).catch(() => {});
        await sendLineText(lineUserId, 'ไม่พบผู้ใช้ที่เชื่อมกับรหัสนี้ หรือผู้ใช้ถูกปิดใช้งานแล้ว กรุณาขอรหัสใหม่จากแอดมิน');
      }
    } else {
      await sendLineText(
        lineUserId,
        `เชื่อมบัญชีสำเร็จ! ยินดีต้อนรับคุณ ${linkResult.userName ?? ''} 🎉\n\nตอนนี้คุณสามารถส่งรูปใบกำกับภาษี, สลิปโอน, PO หรือเอกสารอื่นๆ มาได้เลยครับ`,
      ).catch(sendErr => logger.warn('[Line] Success message send failed (link IS done)', { sendErr }));
    }
    return;
  }

  const resolved = await resolveLineConversationContext(messageContext);

  if (!resolved.ok) {
    if (resolved.reason === 'group_unlinked') {
      await sendLineText(
        lineUserId,
        'กลุ่มนี้ยังไม่ได้เชื่อมกับบริษัทครับ\n\nให้แอดมินเข้าเว็บ Billboy → Admin → LINE → สร้างรหัสเชื่อมกลุ่ม แล้วส่งรหัส 6 หลักในกลุ่มนี้',
      );
      return;
    }
    await sendLineText(
      lineUserId,
      resolved.reason === 'no_active_user'
        ? 'กลุ่มนี้เชื่อมแล้ว แต่ยังไม่มีผู้ใช้ active สำหรับบันทึกเอกสาร กรุณาตรวจผู้ใช้ในบริษัท'
        : 'ยังไม่ได้เชื่อมบัญชีครับ 🔗\n\nกรุณาเข้าระบบ Billboy → Admin → LINE แล้วกด "สร้างรหัสเชื่อมต่อ"\nจากนั้นส่งรหัส 6 หลักมาที่นี่ครับ\n\n👉 https://etax-invoice.vercel.app',
    );
    return;
  }

  const companyId = resolved.companyId;
  const lower = trimmed.toLowerCase();

  if (
    resolved.groupLink?.projectId
    && ['เข้าทีม', 'สมัครทีม', 'join', 'join project', 'ผูกบัญชี', 'สมัคร', 'เข้าโปรเจค', 'เข้าโปรเจกต์'].includes(lower)
  ) {
    const member = await recordLineProjectMemberActivity({
      groupLink: resolved.groupLink,
      sourceType: messageContext.lineGroupId ? 'group' : 'room',
      senderLineUserId,
      senderDisplayName: resolved.senderLink?.user.name ?? null,
      senderPictureUrl: resolved.senderLink?.pictureUrl ?? null,
    });

    if (member?.joinUrl) {
      await sendLineText(
        lineUserId,
        `ลิงก์เข้าร่วมทีมโปรเจค ${resolved.project?.name ?? ''}\n\n` +
        `กดลิงก์นี้แล้วเข้าสู่ระบบด้วย Google เพื่อผูก LINE นี้กับบัญชี Billboy:\n${member.joinUrl}`,
      );
    } else {
      await sendLineText(lineUserId, 'บัญชี LINE นี้ผูกกับผู้ใช้ในระบบแล้วครับ เข้าเว็บ Billboy เพื่อดูโปรเจคได้เลย\nhttps://etax-invoice.vercel.app/app/projects');
    }
    return;
  }

  // Help / greeting
  if (['สวัสดี', 'help', 'ช่วยเหลือ'].includes(lower)) {
    await sendLineText(
      lineUserId,
      `สวัสดีครับ! ผม Billboy ผู้ช่วยบัญชีของ ${resolved.companyName} 🤖\n\n` +
      `📥 บันทึกภาษีซื้อ:\n` +
      `• ส่งรูป .jpg/.png หรือ PDF ใบกำกับภาษีผู้ขาย\n\n` +
      `📊 ดูข้อมูลบัญชี:\n` +
      `• "สรุปภาษี" — ยอด VAT เดือนนี้\n` +
      `• "ใบเกินกำหนด" — ใบแจ้งหนี้ค้างชำระ\n\n` +
      `📄 จัดการใบกำกับภาษีขาย:\n` +
      `• "ส่งใบ INV-001" — รับ Flex Card + ปุ่มเปิด PDF\n` +
      `• "ขอใบ / ดูใบ / หาใบ / pdf [เลขที่]" — ค้นหาเอกสาร\n\n` +
      `🔍 ค้นหาเอกสารซื้อ:\n` +
      `• "ค้นหา [ชื่อบริษัท]" — ค้นหาเอกสารตามผู้ขาย\n` +
      `• "ใบล่าสุด" — เอกสาร 5 รายการล่าสุด\n` +
      `• "ใบเดือนนี้" — สรุปเอกสารเดือนนี้\n\n` +
      `💬 ถาม Billboy ได้เลย เช่น "ภาษีซื้อเดือนนี้เท่าไร"\n\n` +
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
      '📁 วิธีอัพโหลดใบกำกับภาษีซื้อ\n\n1️⃣ ส่งรูปภาพ (.jpg .png) หรือไฟล์ PDF ใบกำกับภาษีผู้ขาย\n2️⃣ Billboy จะ OCR อ่านข้อมูลอัตโนมัติ\n3️⃣ ถ้าข้อมูลไม่ครบ Billboy จะถามเพิ่ม\n4️⃣ กดยืนยันเพื่อบันทึกภาษีซื้อ\n\n💡 รองรับทั้ง PDF ดิจิทัลและ PDF สแกน');
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

  // Smart search handlers
  const now = new Date();

  const searchMatch = trimmed.match(/^ค้นหา\s+(.+)/);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    try {
      const results = await prisma.purchaseInvoice.findMany({
        where: {
          companyId,
          supplierName: { contains: query, mode: 'insensitive' },
        },
        orderBy: { invoiceDate: 'desc' },
        take: 5,
        select: { id: true, supplierName: true, invoiceNumber: true, invoiceDate: true, total: true, vatAmount: true },
      });
      if (results.length === 0) {
        await sendLineText(lineUserId, `ไม่พบเอกสารที่มีชื่อผู้ขาย "${query}"`);
        return;
      }
      const fmt = (n: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);
      const lines = results.map((r, i) =>
        `${i + 1}. ${r.supplierName}\n   ${r.invoiceNumber} • ${r.invoiceDate?.toISOString().slice(0, 10) ?? '-'} • ${fmt(r.total)}`,
      ).join('\n\n');
      await sendLineText(lineUserId, `🔍 ผลการค้นหา "${query}" (${results.length} รายการ)\n\n${lines}`);
    } catch (err) {
      logger.error('[Line] smart search failed', { err, query });
      await sendLineText(lineUserId, 'ขอโทษ ค้นหาไม่สำเร็จ กรุณาลองใหม่');
    }
    return;
  }

  if (['ใบล่าสุด', 'เอกสารล่าสุด', 'ล่าสุด'].includes(lower)) {
    try {
      const recent = await prisma.purchaseInvoice.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { supplierName: true, invoiceNumber: true, invoiceDate: true, total: true },
      });
      if (recent.length === 0) {
        await sendLineText(lineUserId, 'ยังไม่มีเอกสารในระบบ');
        return;
      }
      const fmt = (n: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);
      const lines = recent.map((r, i) =>
        `${i + 1}. ${r.supplierName}\n   ${r.invoiceNumber} • ${fmt(r.total)}`,
      ).join('\n\n');
      await sendLineText(lineUserId, `📋 เอกสารล่าสุด 5 รายการ\n\n${lines}`);
    } catch (err) {
      logger.error('[Line] recent invoices failed', { err });
      await sendLineText(lineUserId, 'ขอโทษ ดึงข้อมูลไม่สำเร็จ กรุณาลองใหม่');
    }
    return;
  }

  if (['ใบเดือนนี้', 'เอกสารเดือนนี้'].includes(lower)) {
    try {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthInvoices = await prisma.purchaseInvoice.findMany({
        where: { companyId, invoiceDate: { gte: monthStart } },
        orderBy: { invoiceDate: 'desc' },
        take: 10,
        select: { supplierName: true, invoiceNumber: true, total: true, vatAmount: true },
      });
      const fmt = (n: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);
      const totalVat = monthInvoices.reduce((s, r) => s + r.vatAmount, 0);
      const totalAmt = monthInvoices.reduce((s, r) => s + r.total, 0);
      const lines = monthInvoices.map((r, i) => `${i + 1}. ${r.supplierName} — ${fmt(r.total)}`).join('\n');
      await sendLineText(
        lineUserId,
        `📅 เอกสารเดือนนี้ ${monthInvoices.length} รายการ\nรวม ${fmt(totalAmt)} (VAT ${fmt(totalVat)})\n\n${lines}`,
      );
    } catch (err) {
      logger.error('[Line] month invoices failed', { err });
      await sendLineText(lineUserId, 'ขอโทษ ดึงข้อมูลไม่สำเร็จ กรุณาลองใหม่');
    }
    return;
  }

  // AI fallback
  try {
      const answer = await askBillboy(
      companyId,
      resolved.userCompany.nameTh,
      resolved.userCompany.taxId,
      trimmed,
    );
    await sendLineText(lineUserId, answer);
  } catch (err) {
    logger.error('[Line] AI answer failed', { err });
    await sendLineText(lineUserId, 'ขอโทษ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
  }
}

async function handleImageMessage(lineUserId: string, messageId: string, messageType?: string, context?: LineMessageContext): Promise<void> {
  let stage = 'start';
  try {
    stage = 'link_lookup';
    const messageContext = context ?? { replyTargetId: lineUserId, senderLineUserId: lineUserId };
    const resolved = await resolveLineConversationContext(messageContext);

    if (!resolved.ok) {
      const errorText = resolved.reason === 'group_unlinked'
        ? 'กลุ่มนี้ยังไม่ได้เชื่อมกับบริษัทครับ\n\nให้แอดมินเข้าเว็บ Billboy → Admin → LINE → สร้างรหัสเชื่อมกลุ่ม แล้วส่งรหัส 6 หลักในกลุ่มนี้'
        : resolved.reason === 'no_active_user'
          ? 'กลุ่มนี้เชื่อมแล้ว แต่ยังไม่มีผู้ใช้ active สำหรับบันทึกเอกสาร กรุณาตรวจผู้ใช้ในบริษัท'
          : 'ยังไม่ได้เชื่อมบัญชีครับ กรุณาเข้าระบบ Billboy → Admin → LINE แล้วสร้างรหัส OTP ก่อนส่งเอกสาร';
      await sendLineText(
        lineUserId,
        errorText,
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
    const companyId = resolved.companyId;
    const intake = await createDocumentIntake({
      companyId,
      projectId: resolved.groupLink?.projectId ?? null,
      userId: resolved.userId,
      lineUserId,
      messageId,
      mimeType: contentType,
      buffer,
    });
    if (resolved.groupLink && messageContext.senderLineUserId) {
      const member = await recordLineProjectMemberActivity({
        groupLink: resolved.groupLink,
        sourceType: messageContext.lineGroupId ? 'group' : 'room',
        senderLineUserId: messageContext.senderLineUserId,
        senderDisplayName: resolved.senderLink?.user.name ?? null,
        senderPictureUrl: resolved.senderLink?.pictureUrl ?? null,
        incrementDocumentCount: true,
      }).catch((err) => {
        logger.warn('[Line] group document sender update failed', { err, lineGroupId: resolved.groupLink?.lineGroupId });
        return null;
      });
      await sendProjectJoinInviteOnce(lineUserId, member, {
        companyName: resolved.companyName,
        projectName: resolved.project?.name,
      });
    }
    let result: OcrResult | undefined;
    logger.info('[Line] file received', { contentType, isPdf, bufferSize: buffer.length, messageType });

    if (!supportedDocumentMimeType(contentType)) {
      await sendLineText(lineUserId, 'ไฟล์ชนิดนี้ยังไม่รองรับครับ กรุณาส่งเป็นรูป JPG/PNG/WebP หรือ PDF');
      await updateDocumentIntake(intake?.id, {
        status: 'failed',
        error: `Unsupported file type: ${contentType}`,
      });
      return;
    }

    await updateDocumentIntake(intake?.id, { status: 'processing' });

    stage = 'document_ocr_pipeline';
    const analysis = await analyzeAccountingDocumentBuffer(buffer, contentType, companyId);
    result = analysis.result;
    const qrText = analysis.qrText;

    if (!result) {
      await updateDocumentIntake(intake?.id, {
        status: 'failed',
        error: 'OCR returned no result',
      });
      await sendLineText(lineUserId, '❌ ระบบอ่านเอกสารยังไม่ได้ผลลัพธ์ครับ\n\nไฟล์ถูกส่งเข้า Billboy แล้ว กรุณาตรวจในหน้า Input VAT หรือส่ง PDF/รูปที่ชัดกว่าอีกครั้ง');
      return;
    }

    logger.info('[Line] OCR result', {
      confidence: result.confidence,
      supplierName: result.supplierName,
      total: result.total,
      qrDecoded: !!qrText,
      stages: analysis.stages,
    });

    const hasAnyData = hasUsefulDocumentData(result) || hasUsefulLineOcrData(result);
    if (!hasAnyData) {
      await updateDocumentIntake(intake?.id, {
        status: 'failed',
        ocrResult: result,
        warnings: documentIntakeWarningsForOcr(result, analysis.stages),
        error: 'OCR returned no useful fields',
      });
      await sendLineText(lineUserId, `❌ ยังอ่านข้อมูลจากเอกสารนี้ไม่ได้${intake?.id ? '\n\nไฟล์ถูกเก็บไว้ในหน้า Input VAT แล้ว เพื่อให้กดเปิดดู/ตรวจเองได้' : ''}\n\nกรุณาลองถ่ายให้ชัดขึ้น เห็นทั้งใบ ไม่เอียง แสงพอ และเห็นเลขผู้เสียภาษี/วันที่/ยอดรวม หรือส่งเป็น PDF ต้นฉบับ`);
      return;
    }

    if (result.documentType === 'bank_transfer' || result.documentType === 'payment_advice') {
      stage = 'match_bank_transfer';
      const enrichedResult = {
        ...result,
        qrText,
      } as OcrResult;
      const [field] = missingTemplateFields(enrichedResult);
      if (field && intake?.id) {
        await askForMissingField(lineUserId, intake.id, enrichedResult, field);
        return;
      }
      if (intake?.id) {
        await askForConfirmation(lineUserId, intake.id, enrichedResult);
        return;
      }
      const match = await handleBankTransferDocument(lineUserId, enrichedResult, companyId, resolved.userId);
      await sendLineText(lineUserId, match.message);
      return;
    }

    if (REVIEW_ONLY_DOCUMENT_TYPES.has(result.documentType) || !PURCHASE_RECORD_DOCUMENT_TYPES.has(result.documentType)) {
      await updateDocumentIntake(intake?.id, {
        status: 'needs_review',
        ocrResult: {
          ...result,
          qrText,
        } as OcrResult,
        warnings: documentIntakeWarningsForOcr(result, analysis.stages),
      });
      await sendLineText(lineUserId, buildReviewOnlySummary(result));
      return;
    }

    // Check for missing required fields based on the document template
    const missingFields = missingTemplateFields(result);

    if (missingFields.length > 0) {
      const [firstField, ...restFields] = missingFields;
      void restFields;
      const enrichedResult = {
        ...result,
        qrText,
      } as OcrResult;
      if (intake?.id) {
        await askForMissingField(lineUserId, intake.id, enrichedResult, firstField);
      } else {
        await sendLineText(
          lineUserId,
          `${buildOcrTextSummary(result, 'อ่านเอกสารได้บางส่วน แต่ยังไม่บันทึกเพราะข้อมูลสำคัญไม่ครบ')}\n\n` +
          `ช่องแรกที่ขาด: ${firstField.label}`,
        );
      }
      return;
    }

    // All required fields present — ask for confirmation before writing accounting records.
    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    void tempId;
    const enrichedResult = {
      ...result,
      qrText,
    } as OcrResult;
    if (intake?.id) {
      stage = 'await_confirmation';
      await askForConfirmation(lineUserId, intake.id, enrichedResult);
    } else {
      await sendLineText(lineUserId, buildConfirmationSummary(enrichedResult));
    }
  } catch (err) {
    logger.error('[Line] handleImageMessage failed', { err, stage });
    await sendLineText(lineUserId, `ขอโทษ เกิดข้อผิดพลาดในการอ่านเอกสาร (ขั้นตอน: ${stage})`);
  }
}

async function handlePostback(lineUserId: string, data: string): Promise<void> {
  if (data.startsWith('set_category:')) {
    const parts = data.split(':');
    const intakeId = parts[1];
    const category = parts.slice(2).join(':');
    try {
      const intake = await prisma.documentIntake.findFirst({ where: { id: intakeId, lineUserId } });
      const result = intake?.ocrResult as unknown as OcrResult | null;
      if (!intake || !result) {
        await sendLineText(lineUserId, 'ไม่พบข้อมูลเอกสาร');
        return;
      }
      const updatedResult: OcrResult = { ...result, postingSuggestion: category, expenseSubcategory: category };
      await prisma.documentIntake.update({
        where: { id: intakeId },
        data: { ocrResult: updatedResult as unknown as Prisma.InputJsonValue },
      });
      await sendLineFlexMessage(
        lineUserId,
        'สรุปเอกสาร — กรุณายืนยัน',
        buildIntakeConfirmFlexCard(updatedResult, intakeId),
      );
    } catch (err) {
      logger.error('[Line] set_category failed', { err, data });
      await sendLineText(lineUserId, 'ขอโทษ เกิดข้อผิดพลาดในการบันทึกหมวด');
    }
    return;
  }

  if (data.startsWith('confirm_intake:')) {
    const intakeId = data.slice('confirm_intake:'.length);
    try {
      const intake = await prisma.documentIntake.findFirst({
        where: { id: intakeId, lineUserId },
      });
      const result = intake?.ocrResult as unknown as OcrResult | null;
      if (!intake || !result) {
        await sendLineText(lineUserId, 'ไม่พบข้อมูลเอกสาร กรุณาส่งไฟล์ใหม่อีกครั้ง');
        return;
      }
      if (result.documentType === 'bank_transfer' || result.documentType === 'payment_advice') {
        const match = await handleBankTransferDocument(lineUserId, result, intake.companyId, intake.userId);
        await updateDocumentIntake(intake.id, {
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

      const duplicate = await findDuplicatePurchaseFromOcr(result, intake.companyId, intake.id);
      if (duplicate) {
        await updateDocumentIntake(intake.id, {
          status: 'needs_review',
          ocrResult: result,
          warnings: [...(result.validationWarnings ?? []), 'duplicate:purchase_invoice'],
          error: `duplicate:${duplicate.id}`,
          targetType: 'purchase_invoice',
          targetId: duplicate.id,
          purchaseInvoiceId: duplicate.id,
        });
        await sendLineText(
          lineUserId,
          `⚠️ พบเอกสารนี้เคยบันทึกแล้ว จึงยังไม่บันทึกซ้ำ\n📄 ${duplicate.invoiceNumber}\n🏢 ${duplicate.supplierName}\n💵 ${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(duplicate.total)}\n\nตรวจได้ที่หน้า Input VAT`,
        );
        return;
      }

      const saved = await savePurchaseFromLineOcr(lineUserId, result, intake.companyId, intake.id, intake.userId);
      await prisma.purchaseInvoice.update({
        where: { id: saved.id },
        data: { pdfUrl: documentIntakeFileUrl(intake.id, intake.fileUrl) },
      });
      await updateDocumentIntake(intake.id, {
        status: 'saved',
        ocrResult: result,
        warnings: result.validationWarnings,
        targetType: 'purchase_invoice',
        targetId: saved.id,
        purchaseInvoiceId: saved.id,
      });
      await replySavedPurchase(lineUserId, result, saved.id);
    } catch (err) {
      logger.error('[Line] confirm_intake failed', { err, data });
      await sendLineText(lineUserId, 'ขอโทษ บันทึกเอกสารไม่สำเร็จ กรุณาตรวจในหน้า Input VAT');
    }
    return;
  }

  if (data.startsWith('cancel_intake:')) {
    const intakeId = data.slice('cancel_intake:'.length);
    await prisma.documentIntake.updateMany({
      where: { id: intakeId, lineUserId },
      data: { status: 'needs_review', error: 'cancelled_by_user' },
    });
    await sendLineText(lineUserId, 'ยกเลิกแล้ว เอกสารยังอยู่ในคิวรอตรวจ');
    return;
  }

  if (data.startsWith('edit_intake:')) {
    const intakeId = data.slice('edit_intake:'.length);
    const intake = await prisma.documentIntake.findFirst({
      where: { id: intakeId, lineUserId },
    });
    const result = intake?.ocrResult as unknown as OcrResult | null;
    if (!intake || !result) {
      await sendLineText(lineUserId, 'ไม่พบข้อมูลเอกสาร กรุณาส่งไฟล์ใหม่');
      return;
    }
    const editableFields = [
      { label: '🏢 ผู้ขาย', data: `editintake:${intakeId}:supplierName` },
      { label: '🪪 เลขผู้เสียภาษี', data: `editintake:${intakeId}:supplierTaxId` },
      { label: '🔢 เลขที่เอกสาร', data: `editintake:${intakeId}:invoiceNumber` },
      { label: '📅 วันที่', data: `editintake:${intakeId}:invoiceDate` },
      { label: '💵 ยอดรวม', data: `editintake:${intakeId}:total` },
      { label: '💰 VAT', data: `editintake:${intakeId}:vatAmount` },
      { label: '✅ ยืนยันบันทึก', data: `confirm_intake:${intakeId}` },
    ];
    await sendLineTextWithQuickReply(
      lineUserId,
      '✏️ เลือกช่องที่ต้องการแก้ไข:',
      editableFields,
    );
    return;
  }

  if (data.startsWith('editintake:')) {
    const parts = data.split(':'); // ['editintake', intakeId, fieldKey]
    const intakeId = parts[1];
    const fieldKey = parts[2];
    const fieldMeta: Record<string, { label: string; hint: string }> = {
      supplierName:  { label: 'ชื่อผู้ขาย', hint: 'เช่น บริษัท ABC จำกัด' },
      supplierTaxId: { label: 'เลขผู้เสียภาษี', hint: '13 หลัก เช่น 0105556001234' },
      invoiceNumber: { label: 'เลขที่เอกสาร', hint: 'เช่น INV-2026-001' },
      invoiceDate:   { label: 'วันที่เอกสาร', hint: 'YYYY-MM-DD เช่น 2026-04-29' },
      total:         { label: 'ยอดรวม', hint: 'ตัวเลขเท่านั้น เช่น 5350' },
      vatAmount:     { label: 'ภาษีมูลค่าเพิ่ม', hint: 'ตัวเลขเท่านั้น เช่น 350' },
    };
    const meta = fieldMeta[fieldKey] ?? { label: fieldKey, hint: '' };
    await prisma.documentIntake.update({
      where: { id: intakeId },
      data: { status: 'awaiting_input', error: `editintake:${fieldKey}` },
    });
    await sendLineTextWithQuickReply(
      lineUserId,
      `✏️ แก้ไข: ${meta.label}\n💡 ${meta.hint}\n\nพิมพ์ค่าใหม่ได้เลย:`,
      [{ label: '↩️ ยกเลิกแก้ไข', data: `edit_intake:${intakeId}`, displayText: 'ยกเลิกแก้ไข' }],
    );
    return;
  }

  if (data.startsWith('confirm_purchase:')) {
    const tempId = data.slice('confirm_purchase:'.length);
    try {
      const stored = await redis.get(`ocr:temp:${tempId}`);
      if (!stored) {
        await sendLineText(lineUserId, 'ข้อมูลหมดอายุแล้ว กรุณาส่งรูปใหม่อีกครั้ง');
        return;
      }

      const ocrData = JSON.parse(stored) as OcrResult & { companyId?: string };

      // SECURITY: Always derive companyId from the verified lineUserLink — never trust
      // companyId from the OCR session JSON (attacker could inject any companyId there).
      const link = await withSystemRlsContext(prisma, (tx) => tx.lineUserLink.findUnique({
        where: { lineUserId },
        include: { user: { select: { companyId: true } } },
      }));
      if (!link) {
        await sendLineText(lineUserId, 'ขอโทษ ไม่พบข้อมูลบริษัท กรุณาเชื่อมบัญชีใหม่');
        return;
      }
      const companyId = link.user.companyId;

      if (!companyId) {
        await sendLineText(lineUserId, 'ขอโทษ ไม่พบข้อมูลบริษัท กรุณาเชื่อมบัญชีใหม่');
        return;
      }

      const duplicate = await findDuplicatePurchaseFromOcr(ocrData, companyId, tempId);
      if (duplicate) {
        await sendLineText(
          lineUserId,
          `⚠️ พบเอกสารนี้เคยบันทึกแล้ว จึงยังไม่บันทึกซ้ำ\n📄 ${duplicate.invoiceNumber}\n🏢 ${duplicate.supplierName}\n💵 ${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(duplicate.total)}\n\nตรวจได้ที่หน้า Input VAT`,
        );
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
        { label: 'ยอดรวม',           data: `editfield:${purchaseId}:total`,          displayText: 'แก้ไขยอดรวม' },
        { label: '🏢 สาขา',          data: `editfield:${purchaseId}:supplierBranch`, displayText: 'แก้ไขสาขา' },
        { label: '📂 หมวดค่าใช้จ่าย', data: `editfield:${purchaseId}:category`,      displayText: 'แก้ไขหมวดค่าใช้จ่าย' },
        { label: '🧾 ประเภทภาษี',    data: `editfield:${purchaseId}:vatType`,        displayText: 'แก้ไขประเภทภาษี' },
        { label: '❌ ยกเลิก',        text: 'เสร็จสิ้น' },
      ],
    );
    return;
  }

  if (data.startsWith('editfield_val:')) {
    // Direct-apply a value without free-text input (used for vatType quick reply)
    const parts = data.split(':');
    const purchaseId = parts[1];
    const fieldKey = parts[2];
    const value = parts.slice(3).join(':');
    try {
      await prisma.purchaseInvoice.update({
        where: { id: purchaseId },
        data: { [fieldKey]: value } as Record<string, unknown>,
      });
      await sendLineTextWithQuickReply(
        lineUserId,
        `✅ แก้ไข ${fieldKey} เรียบร้อยแล้ว`,
        [
          { label: '✏️ แก้ไขต่อ', data: `edit_purchase:${purchaseId}`, displayText: 'แก้ไขต่อ' },
          { label: '✅ เสร็จสิ้น', text: 'เสร็จสิ้น' },
        ],
      );
    } catch (err) {
      logger.error('[Line] editfield_val failed', { err, data });
      await sendLineText(lineUserId, '❌ ไม่สามารถแก้ไขได้ กรุณาลองใหม่');
    }
    return;
  }

  if (data.startsWith('editfield:')) {
    const parts = data.split(':');
    const purchaseId = parts[1];
    const fieldKey = parts[2];

    // vatType uses quick reply buttons instead of free text
    if (fieldKey === 'vatType') {
      await sendLineTextWithQuickReply(
        lineUserId,
        'เลือกประเภทภาษี:',
        [
          { label: 'ภาษี 7%',    data: `editfield_val:${purchaseId}:vatType:vat7`,      displayText: 'ภาษี 7%' },
          { label: 'ยกเว้นภาษี', data: `editfield_val:${purchaseId}:vatType:vatExempt`, displayText: 'ยกเว้นภาษี' },
          { label: 'ภาษีศูนย์',  data: `editfield_val:${purchaseId}:vatType:vatZero`,   displayText: 'ภาษีศูนย์' },
          { label: '❌ ยกเลิก',  text: 'เสร็จสิ้น' },
        ],
      );
      return;
    }

    const extraFieldMeta: Record<string, { label: string; hint: string }> = {
      supplierBranch: { label: 'สาขาผู้ขาย', hint: 'เช่น 00000 หรือ สำนักงานใหญ่' },
      category:       { label: 'หมวดค่าใช้จ่าย', hint: 'เช่น ค่าบริการ' },
    };
    const fieldDef =
      REQUIRED_OCR_FIELDS.find(f => f.key === fieldKey) ??
      extraFieldMeta[fieldKey] ??
      { label: fieldKey, hint: '' };

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
    lineWebhookDiagnostics.lastWebhookAt = new Date().toISOString();
    lineWebhookDiagnostics.lastEventCount = body.events?.length ?? 0;
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

  // Test bypass: skip signature verification when X-Line-Test header is present
  const isTestRequest = req.headers['x-line-test'] === 'true';
  if (!isTestRequest && (!sig || !verifyLineSignature(req.body as Buffer, sig))) {
    logger.warn('[Line] Signature mismatch — rejected');
    res.status(401).json({ ok: false });
    return;
  }

  // Always respond 200 immediately; process events async
  res.json({ ok: true });

  for (const event of body.events ?? []) {
    const replyTargetId = event.source.groupId ?? event.source.roomId ?? event.source.userId;
    if (!replyTargetId) continue;
    const context: LineMessageContext = {
      sourceType: event.source.type,
      replyTargetId,
      senderLineUserId: event.source.userId,
      lineGroupId: event.source.groupId,
      lineRoomId: event.source.roomId,
    };

    // Idempotency: skip if this event was already processed (LINE retries on timeout)
    const eventId = (event as { webhookEventId?: string }).webhookEventId
      ?? ((event.type === 'message' && event.message) ? `msg:${event.message.id}` : null);
    if (eventId) {
      const dedupKey = `line:seen:${eventId}`;
      try {
        const already = await redis.set(dedupKey, '1', 'EX', 300, 'NX');
        if (!already) {
          logger.info('[Line] Duplicate event skipped', { eventId });
          continue;
        }
      } catch {
        // Redis unavailable — allow through rather than drop
      }
    }

    try {
      if (event.type === 'follow') {
        await sendLineText(
          replyTargetId,
          'สวัสดีครับ! ผม Billboy ผู้ช่วยบัญชีอัจฉริยะ 🤖\n\n' +
          'ส่ง OTP 6 หลักจากระบบ e-Tax Invoice เพื่อเชื่อมบัญชีก่อนเริ่มใช้งานนะครับ\n\n' +
          '📋 สิ่งที่ทำได้หลังเชื่อมบัญชี:\n' +
          '• ส่งรูป/PDF ใบกำกับภาษี → บันทึกภาษีซื้ออัตโนมัติ\n' +
          '• พิมพ์ "สรุปภาษี" → ดูยอด VAT เดือนนี้\n' +
          '• พิมพ์ "ใบเกินกำหนด" → ใบแจ้งหนี้ค้างชำระ\n' +
          '• พิมพ์ "ส่งใบ [เลขที่]" → รับ PDF ใบกำกับภาษี\n' +
          '• พิมพ์ "ช่วยเหลือ" → ดูคำสั่งทั้งหมด\n\n' +
          '💡 หรือใช้เมนูด้านล่างได้เลยครับ',
        );
      } else if (event.type === 'join') {
        await sendLineText(
          replyTargetId,
          'Billboy เข้ากลุ่มแล้วครับ\n\nให้แอดมินเข้าเว็บ Billboy → Admin → LINE → สร้างรหัสเชื่อมกลุ่ม แล้วส่งรหัส 6 หลักในกลุ่มนี้เพื่อเริ่มใช้งาน',
        );
      } else if (event.type === 'memberJoined') {
        const groupLink = await withSystemRlsContext(prisma, (tx) => tx.lineGroupLink.findUnique({
          where: { lineGroupId: event.source.groupId ?? event.source.roomId ?? '' },
          include: { company: true, project: { select: { id: true, name: true } } },
        }));
        if (groupLink?.isActive && groupLink.projectId) {
          for (const member of event.joined?.members ?? []) {
            if (!member.userId) continue;
            await recordLineProjectMemberActivity({
              groupLink,
              sourceType: event.source.groupId ? 'group' : 'room',
              senderLineUserId: member.userId,
            }).catch((err) => logger.warn('[Line] memberJoined activity update failed', { err, lineGroupId: groupLink.lineGroupId }));
          }
          await sendLineText(
            replyTargetId,
            `ยินดีต้อนรับสมาชิกใหม่ครับ 👋\n\nกลุ่มนี้ผูกกับโปรเจค ${groupLink.project?.name ?? ''} แล้ว สมาชิกส่งเอกสารได้ทันทีแบบ LINE guest\nถ้าต้องการดูสถานะหรือเข้าทีมในระบบ ให้พิมพ์ "เข้าทีม"`,
          );
        }
      } else if (event.type === 'message' && event.message) {
        const msg = event.message;
        if (msg.type === 'text') {
          await withLineReplyToken(event.replyToken, () => handleTextMessage(replyTargetId, (msg as LineTextMessage).text, context));
        } else if (msg.type === 'image' || msg.type === 'file') {
          await withLineReplyToken(event.replyToken, () => handleImageMessage(replyTargetId, msg.id, msg.type, context));
        }
      } else if (event.type === 'postback' && event.postback) {
        const postbackData = event.postback.data;
        await withLineReplyToken(event.replyToken, () => handlePostback(replyTargetId, postbackData));
      }
    } catch (err) {
      lineWebhookDiagnostics.lastUnhandledError = {
        at: new Date().toISOString(),
        eventType: event.type,
        message: err instanceof Error ? err.message : String(err),
      };
      logger.error('[Line] Unhandled webhook event error', { err, eventType: event.type, replyTargetId, senderLineUserId: event.source.userId });
      try {
        await sendLineText(replyTargetId, 'ขอโทษครับ ระบบสะดุดชั่วคราว กรุณาลองส่งใหม่อีกครั้ง 🙏');
      } catch { /* ignore send failure */ }
    }
  }
}
