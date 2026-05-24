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
  buildIntakeSavedFlexCard,
  buildPaymentSlipFlexCard,
  buildMatchCandidateBubble,
  buildMatchOptionsBubble,
  buildCombinedSlipBillFlexCard,
  sendLineFlexCarousel,
  type MatchCandidate,
  buildInvoiceFlexCard,
  verifyLineSignature,
  withLineReplyToken,
  getLineMessagingDiagnostics,
  getLineGroupMemberCount,
  getLineGroupMemberProfile,
  getLineGroupSummary,
  getLineRoomMemberCount,
  getLineUserProfile,
  OverdueInvoice,
} from '../services/lineService';
import { askBillboy, buildCompanyContext, getOcrProductionReadiness, testOcrProvider, OcrResult } from '../services/aiService';
import { validateAndRepairClassification, shouldEscalateAfterValidation } from '../services/ocrValidation';
import {
  analyzeAccountingDocumentBuffer,
  documentIntakeWarningsForOcr,
  hasUsefulDocumentData,
  PURCHASE_RECORD_DOCUMENT_TYPES,
  REVIEW_ONLY_DOCUMENT_TYPES,
  supportedDocumentMimeType,
} from '../services/documentOcrService';
import {
  summarizeDocumentIntakeOcr,
  isGroupTextCommand,
  templateFieldsFor,
  setTemplateValue,
  missingTemplateFields,
  parseTemplateReply,
  detectLineFileMimeType,
  maskLineUserId,
  paymentAmount,
  paymentReference,
  hasUsefulLineOcrData,
  closeAmount,
  BANK_TRANSFER_TEMPLATE_FIELDS,
  type DocumentTemplateField,
} from './line/helpers';
import { setupRichMenu } from '../services/richMenuService';
import { isStorageConfigured, uploadToStorage, downloadFromStorage } from '../services/storageService';
import { enqueueLineOcrJob } from '../queues/lineOcrQueue';
import { getOcrPolicyForCompany } from '../services/ocrPolicyService';
import { auditLog } from '../config/auditLog';
import { syncDocumentIntakeToProjectDrive } from '../services/projectDriveSyncService';
import { enqueueMasterSheetSync } from '../queues';
import { buildProjectLineMemberInviteUrl } from '../services/projectLineInviteService';
import { attemptAutoMatchAndPay, findInvoiceCandidates, findPurchaseInvoiceCandidates } from '../services/paymentMatchingService';
import { createProjectDocumentFromIntake, isSupportedProjectDocumentType } from '../services/projectDocumentIntakeService';
import { parseThaiSlipQr } from '../services/thaiSlipQrParser';

export const lineRouter = Router();

const OTP_TTL = 600; // 10 minutes
const PROJECT_PORTAL_TTL = process.env.PROJECT_PORTAL_TTL ?? '7d';

// Webhook diagnostics live in Redis so they survive process restarts and stay
// consistent across api + worker processes on Render.
const WEBHOOK_DIAGNOSTICS_KEY = 'line:webhook-diagnostics';

interface WebhookDiagnostics {
  lastWebhookAt?: string;
  lastEventCount?: number;
  lastUnhandledError?: { at: string; eventType?: string; message: string };
}

// In-memory mirror used by hot paths; kept in sync with Redis.
const lineWebhookDiagnostics: WebhookDiagnostics = {};

async function persistWebhookDiagnostics() {
  try {
    await redis.set(WEBHOOK_DIAGNOSTICS_KEY, JSON.stringify(lineWebhookDiagnostics));
  } catch (err) {
    logger.warn('[Line] persistWebhookDiagnostics failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

async function loadWebhookDiagnostics(): Promise<WebhookDiagnostics> {
  try {
    const raw = await redis.get(WEBHOOK_DIAGNOSTICS_KEY);
    if (!raw) return { ...lineWebhookDiagnostics };
    const parsed = JSON.parse(raw) as WebhookDiagnostics;
    // refresh in-memory mirror so subsequent writes don't lose loaded fields
    Object.assign(lineWebhookDiagnostics, parsed);
    return parsed;
  } catch (err) {
    logger.warn('[Line] loadWebhookDiagnostics failed', { error: err instanceof Error ? err.message : String(err) });
    return { ...lineWebhookDiagnostics };
  }
}

function getFrontendBaseUrl() {
  const candidates = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? 'https://etax-invoice.vercel.app')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  // LINE URI buttons require HTTPS — prefer the first HTTPS entry over
  // any localhost / http fallback that may be listed first (which is the
  // case in dev where FRONTEND_URLS includes 'http://localhost:3000').
  const httpsFirst = candidates.find((url) => url.startsWith('https://'));
  return (httpsFirst ?? candidates[0] ?? 'https://etax-invoice.vercel.app').replace(/\/+$/, '');
}

/**
 * Build a magic-link URL for the guest intake-edit page, or return
 * undefined if we can't (missing JWT secret, missing args, etc.). The
 * URL goes into LINE Flex URI buttons + plain-text fallbacks so the user
 * has a tap-target whether or not the Flex card renders.
 */
function buildIntakeEditUrlSafe(intakeId: string | undefined, lineUserId: string, companyId: string | undefined): string | undefined {
  if (!intakeId || !companyId) return undefined;
  try {
    // Required imports are local to avoid a module-init cost when the
    // function is never called (e.g. during webhook health pings).
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { signIntakeEditToken, buildIntakeEditUrl } = require('../services/intakeEditToken') as typeof import('../services/intakeEditToken');
    const token = signIntakeEditToken({ intakeId, lineUserId, companyId });
    return buildIntakeEditUrl(getFrontendBaseUrl(), token);
  } catch (err) {
    logger.warn('[Line] buildIntakeEditUrlSafe failed', { err, intakeId });
    return undefined;
  }
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
  flexCard?: object;
  flexAlt?: string;
};

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

function isLineGroupConversation(context?: LineMessageContext): boolean {
  return !!(context?.lineGroupId || context?.lineRoomId || context?.sourceType === 'group' || context?.sourceType === 'room');
}

function lineGroupSilentModeEnabled(): boolean {
  return process.env.LINE_GROUP_SILENT_MODE !== 'false';
}

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

function documentIntakeFileUrl(intakeId: string, fileUrl?: string | null) {
  return fileUrl || `/api/purchase-invoices/document-intakes/${intakeId}/file`;
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
  await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
    where: { id: intakeId },
    data: {
      status: 'awaiting_input',
      ocrResult: result as unknown as Prisma.InputJsonValue,
      warnings: [`missing:${field.key}`] as Prisma.InputJsonValue,
      error: field.key,
    },
  }));

  // New UX: one Flex card with a summary of what we read + 2 options
  //   - "✅ บันทึก" → save with placeholders for missing fields (skip path)
  //   - "✏️ แก้ไขในเว็บ" → magic-link to a guest edit page (no login)
  // The chat field-by-field flow becomes a fallback — user can still
  // type the value directly and we'll handle it in handleDurableIntakeReply.
  const intakeRow = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
    where: { id: intakeId },
    select: { companyId: true },
  }));
  const editUrl = buildIntakeEditUrlSafe(intakeId, lineUserId, intakeRow?.companyId);

  // Single Flex card carries everything: summary, "บันทึก" postback button,
  // and "แก้ไขในเว็บ" URI button (when editUrl was built successfully).
  // No follow-up text — user explicitly asked to keep the chat clean.
  // If the URI button fails to render in LINE, the postback "บันทึก" is
  // still tappable and the user can also just type the value in chat
  // (handleDurableIntakeReply still processes it).
  await sendLineFlexMessage(
    lineUserId,
    `📄 ${result.documentTypeLabel || 'เอกสาร'} — กดปุ่มในการ์ดเพื่อบันทึกหรือแก้ไข`,
    buildIntakeConfirmFlexCard(result, intakeId, editUrl ? { editUrl } : undefined),
  );
}

// ---------------------------------------------------------------------------
// Per-document routing — no more batching. Each upload immediately
// goes through routePostOcrIntake → its type-specific handler. Slip+bill
// auto-pairing still happens via Redis pending_slip / pending_bill keys
// (see tryAutoMatchPendingBillWithSlip below).
// ---------------------------------------------------------------------------

async function routePostOcrIntake(lineUserId: string, intake: { id: string; companyId: string; userId: string; projectId: string | null; fileUrl: string | null }, result: OcrResult): Promise<void> {
  if (result.documentType === 'bank_transfer' || result.documentType === 'payment_advice') {
    const hasAmount = Number(result.payment?.amount ?? result.total ?? 0) > 0;
    if (!hasAmount) {
      await askForMissingField(lineUserId, intake.id, result, BANK_TRANSFER_TEMPLATE_FIELDS[0]);
      return;
    }
    await askForConfirmation(lineUserId, intake.id, result);
    return;
  }
  if (REVIEW_ONLY_DOCUMENT_TYPES.has(result.documentType) || !PURCHASE_RECORD_DOCUMENT_TYPES.has(result.documentType)) {
    await sendLineText(lineUserId, buildReviewOnlySummary(result));
    return;
  }
  const [missing] = missingTemplateFields(result);
  if (missing) {
    await askForMissingField(lineUserId, intake.id, result, missing);
    return;
  }
  await askForConfirmation(lineUserId, intake.id, result);
}

export async function performConfirmedIntakeSave(
  lineUserId: string,
  intake: { id: string; companyId: string; userId: string; projectId: string | null; fileUrl: string | null },
  result: OcrResult,
): Promise<void> {
  if (result.documentType === 'bank_transfer' || result.documentType === 'payment_advice') {
    const match = await handleBankTransferDocument(lineUserId, result, intake.companyId, intake.userId, intake.id);
    // The user clicked '✅ บันทึก' on the slip card. Two outcomes:
    // (a) auto-match succeeded → mark saved + matched + green Flex card
    // (b) no match → still mark SAVED (the slip itself is recorded) and send
    //     a friendly 'slip is in the system, you can match later in web or
    //     by uploading a bill' message — NOT a red 'ยังไม่พบคู่' card.
    const isAutoMatched = match.ok && match.status === 'saved';
    await updateDocumentIntake(intake.id, {
      status: isAutoMatched ? 'saved' : 'saved',
      ocrResult: result,
      warnings: [...(result.validationWarnings ?? []), ...(match.warnings ?? [])],
      error: isAutoMatched ? undefined : 'pending_manual_match',
      targetType: match.targetType,
      targetId: match.targetId,
      purchaseInvoiceId: match.targetType === 'purchase_invoice' ? match.targetId : undefined,
    });
    if (isAutoMatched && match.flexCard) {
      await sendLineFlexMessage(lineUserId, match.flexAlt ?? match.message, match.flexCard);
    } else {
      // Slip saved, no in-db match yet. Before giving up, check the
      // pending_bill Redis flag — if the user uploaded a bill earlier and
      // chose to keep it pending until a slip arrived, this is our chance to
      // match it now (out-of-order pairing).
      const matchedFromPending = await tryAutoMatchPendingBillWithSlip(lineUserId, intake.id, result);
      if (!matchedFromPending) {
        // Park this slip in Redis so the NEXT bill uploaded by the user can
        // auto-match against it (out-of-order pairing the other direction).
        try {
          await redis.set(`line:pending_slip:${lineUserId}`, intake.id, 'EX', 1800);
        } catch (err) {
          logger.warn('[Line] redis set pending_slip from save failed', { err });
        }
        const amt = Number(result.payment?.amount ?? result.total ?? 0);
        const amtLabel = amt ? `฿${amt.toLocaleString('th-TH')}` : '';
        const slipEditUrl = buildIntakeEditUrlSafe(intake.id, lineUserId, intake.companyId);
        await sendLineFlexMessage(
          lineUserId,
          `✅ บันทึกสลิปแล้ว ${amtLabel}`.trim(),
          buildPaymentSlipFlexCard(result, 'saved', { intakeId: intake.id, editUrl: slipEditUrl }),
        );
        await sendLineText(
          lineUserId,
          `บันทึกสลิปเข้าระบบแล้ว ✅\nยังไม่ได้จับคู่กับบิล — สามารถส่งบิลที่ตรงยอดมาในแชทเพื่อจับคู่อัตโนมัติ หรือเข้าจับคู่ในเว็บภายหลังได้`,
        );
      }
    }
    void syncDocumentIntakeToProjectDrive(intake.id, {
      companyId: intake.companyId,
      preferredUserId: intake.userId,
      duplicatePolicy: 'skip',
    });
    return;
  }

  if (isSupportedProjectDocumentType(result.documentType)) {
    if (!intake.projectId) {
      await updateDocumentIntake(intake.id, {
        status: 'needs_review',
        ocrResult: result,
        warnings: [...(result.validationWarnings ?? []), `project_required:${result.documentType}`],
      });
      await sendLineText(lineUserId, `📎 อ่านได้แล้ว แต่ต้องเลือกโปรเจคก่อน ${result.documentTypeLabel || result.documentType} จึงจะถูกบันทึก กรุณาตรวจในหน้าเอกสาร`);
      return;
    }
    const projectDoc = await createProjectDocumentFromIntake({
      intakeId: intake.id,
      companyId: intake.companyId,
      projectId: intake.projectId,
      result,
    });
    const label = result.documentTypeLabel || result.documentType;
    if (projectDoc.ok) {
      await sendLineText(lineUserId, `✅ บันทึก ${label} แล้ว\n📄 เลขที่ ${projectDoc.documentNumber ?? '-'}\n🏢 ${result.supplierName || '-'}`);
      void syncDocumentIntakeToProjectDrive(intake.id, {
        companyId: intake.companyId,
        preferredUserId: intake.userId,
        duplicatePolicy: 'skip',
      });
      void enqueueMasterSheetSync(intake.companyId);
    } else {
      await updateDocumentIntake(intake.id, {
        status: 'needs_review',
        ocrResult: result,
        warnings: [...(result.validationWarnings ?? []), `failed:${projectDoc.reason ?? 'unknown'}`],
      });
      await sendLineText(lineUserId, `⚠️ ${label} อ่านได้แต่บันทึกไม่สำเร็จ กรุณาตรวจในหน้าเอกสาร`);
    }
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
  await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.update({
    where: { id: saved.id },
    data: { pdfUrl: documentIntakeFileUrl(intake.id, intake.fileUrl) },
  }));
  await updateDocumentIntake(intake.id, {
    status: 'saved',
    ocrResult: result,
    warnings: result.validationWarnings,
    targetType: 'purchase_invoice',
    targetId: saved.id,
    purchaseInvoiceId: saved.id,
  });
  auditLog({
    event: 'intake_saved_as_purchase',
    companyId: intake.companyId,
    actorUserId: intake.userId,
    actorLineUserId: lineUserId,
    intakeId: intake.id,
    purchaseInvoiceId: saved.id,
    extra: { total: saved.total, supplier: saved.supplierName, invoiceNumber: saved.invoiceNumber },
  });

  const matched = await tryAutoMatchPendingSlipWithPurchase(lineUserId, saved, intake.companyId);
  if (!matched) {
    // Park this bill in Redis so the next slip the user uploads can
    // auto-match against it (out-of-order pairing).
    try { await redis.set(`line:pending_bill:${lineUserId}`, intake.id, 'EX', 1800); }
    catch (err) { logger.warn('[Line] redis set pending_bill failed', { err }); }
    await replySavedPurchase(lineUserId, result, saved.id, undefined, intake.userId, intake.id, intake.companyId);
  }

  void syncDocumentIntakeToProjectDrive(intake.id, {
    companyId: intake.companyId,
    preferredUserId: intake.userId,
    duplicatePolicy: 'skip',
  });
  void enqueueMasterSheetSync(intake.companyId);
}

async function tryAutoMatchPendingBillWithSlip(
  lineUserId: string,
  slipIntakeId: string,
  slipResult: OcrResult,
): Promise<boolean> {
  let pendingBillIntakeId: string | null = null;
  try { pendingBillIntakeId = await redis.get(`line:pending_bill:${lineUserId}`); } catch (err) {
    logger.warn('[Line] redis get pending_bill failed', { err });
  }
  if (!pendingBillIntakeId) return false;

  const billIntake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
    where: { id: pendingBillIntakeId!, lineUserId },
  }));
  if (!billIntake || !billIntake.purchaseInvoiceId) {
    try { await redis.del(`line:pending_bill:${lineUserId}`); } catch { /* noop */ }
    return false;
  }
  // Local non-null binding so the closure passed to withSystemRlsContext
  // sees a narrowed `string` (TS doesn't propagate narrowing into the
  // async closure otherwise).
  const purchaseInvoiceId: string = billIntake.purchaseInvoiceId;
  const purchase = await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.findFirst({
    where: { id: purchaseInvoiceId, companyId: billIntake.companyId },
  }));
  if (!purchase) {
    try { await redis.del(`line:pending_bill:${lineUserId}`); } catch { /* noop */ }
    return false;
  }
  const slipAmount = Number(slipResult.payment?.amount ?? slipResult.total ?? 0);
  if (slipAmount <= 0) return false;
  const matchInfo = analyzeAmountMatch(slipAmount, purchase.total);
  if (!matchInfo.ok) return false;

  const paidAt = slipResult.payment?.paidAt ? new Date(slipResult.payment.paidAt) : new Date();
  const refSuffix = slipResult.payment?.reference ? ` ref: ${slipResult.payment.reference}` : '';
  const bankSuffix = slipResult.payment?.bankName ? ` (${slipResult.payment.bankName})` : '';
  const whtNote = matchInfo.whtRate
    ? ` (หัก ณ ที่จ่าย ${(matchInfo.whtRate * 100).toFixed(0)}% = ฿${(purchase.total * matchInfo.whtRate).toLocaleString('th-TH', { maximumFractionDigits: 2 })})`
    : '';
  await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.update({
    where: { id: purchase.id },
    data: {
      isPaid: true,
      paidAt,
      notes: [purchase.notes, `ชำระโดยสลิปโอนเงิน LINE${bankSuffix}${refSuffix}${whtNote}`].filter(Boolean).join('\n'),
    },
  }));
  await updateDocumentIntake(slipIntakeId, {
    status: 'saved',
    ocrResult: slipResult,
    targetType: 'purchase_invoice',
    targetId: purchase.id,
    purchaseInvoiceId: purchase.id,
  });
  auditLog({
    event: 'purchase_paid_via_slip',
    companyId: billIntake.companyId,
    actorLineUserId: lineUserId,
    intakeId: slipIntakeId,
    purchaseInvoiceId: purchase.id,
    extra: { matchType: 'pending_bill_out_of_order', whtRate: matchInfo.whtRate, slipAmount, billTotal: purchase.total },
  });
  try { await redis.del(`line:pending_bill:${lineUserId}`); } catch { /* noop */ }
  const pendingBillEditUrl = buildIntakeEditUrlSafe(slipIntakeId, lineUserId, billIntake.companyId);
  await sendLineFlexMessage(
    lineUserId,
    `✅ จับคู่อัตโนมัติ: สลิป ↔ ${purchase.invoiceNumber}`,
    buildPaymentSlipFlexCard(slipResult, 'saved', {
      matchedInvoiceNumber: purchase.invoiceNumber,
      matchedSupplierName: purchase.supplierName,
      matchScore: 100,
      purchaseInvoiceId: purchase.id,
      intakeId: slipIntakeId,
      editUrl: pendingBillEditUrl,
    }),
  );
  await sendLineText(lineUserId, `🔗 พบบิลที่ค้างจับคู่อยู่ ระบบจับคู่ให้อัตโนมัติ (ยอดตรง ฿${purchase.total.toLocaleString('th-TH')})`);
  return true;
}

/**
 * Decide whether a slip amount 'matches' a bill total. Returns ok=true when:
 *   (a) absolute delta ≤ ฿1, OR
 *   (b) relative delta ≤ 1%, OR
 *   (c) the difference equals a common Thai WHT rate (1/2/3/5/10/15%) within
 *       ±฿1 — strong signal that the slip is invoice_total - WHT
 *
 * Returns the inferred WHT rate so callers can stamp it on the saved record.
 */
function analyzeAmountMatch(slipAmount: number, billTotal: number): {
  ok: boolean;
  delta: number;
  pct: number;
  whtRate?: number;
} {
  if (slipAmount <= 0 || billTotal <= 0) return { ok: false, delta: 0, pct: 0 };
  const delta = Math.abs(slipAmount - billTotal);
  const pct = delta / Math.max(billTotal, 1);
  if (delta <= 1 || pct <= 0.01) return { ok: true, delta, pct };
  // Slip < bill → could be WHT-deducted payment
  if (slipAmount < billTotal) {
    const whtCandidates = [0.01, 0.02, 0.03, 0.05, 0.10, 0.15];
    for (const rate of whtCandidates) {
      const expectedSlip = billTotal * (1 - rate);
      if (Math.abs(slipAmount - expectedSlip) <= 1) {
        return { ok: true, delta, pct, whtRate: rate };
      }
    }
  }
  return { ok: false, delta, pct };
}

async function tryAutoMatchPendingSlipWithPurchase(
  lineUserId: string,
  savedPurchase: { id: string; invoiceNumber: string; supplierName: string; total: number },
  companyId: string,
): Promise<boolean> {
  let pendingSlipIntakeId: string | null = null;
  try {
    pendingSlipIntakeId = await redis.get(`line:pending_slip:${lineUserId}`);
  } catch (err) {
    logger.warn('[Line] redis get pending_slip failed', { err });
  }
  if (!pendingSlipIntakeId) return false;

  const slipIntake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
    where: { id: pendingSlipIntakeId!, lineUserId, companyId },
  }));
  if (!slipIntake) {
    try { await redis.del(`line:pending_slip:${lineUserId}`); } catch { /* noop */ }
    return false;
  }
  const slipResult = slipIntake.ocrResult as unknown as OcrResult | null;
  if (!slipResult) return false;

  const slipAmount = Number(slipResult.payment?.amount ?? slipResult.total ?? 0);
  if (slipAmount <= 0) return false;
  // Accept the auto-match when amounts are within 1% (or ฿1 absolute), OR
  // when the gap matches a common Thai withholding-tax rate (1/2/3/5%).
  // Thai SMEs frequently pay invoice_total - WHT, so a 'mismatch' of exactly
  // 3% is the SIGNAL it's a WHT payment, not a problem.
  const matchInfo = analyzeAmountMatch(slipAmount, savedPurchase.total);
  if (!matchInfo.ok) {
    logger.info('[Line] pending slip amount mismatch — not auto-matching', {
      slipAmount, purchaseTotal: savedPurchase.total, delta: matchInfo.delta, pct: matchInfo.pct,
    });
    return false;
  }

  const paidAt = slipResult.payment?.paidAt ? new Date(slipResult.payment.paidAt) : new Date();
  const refSuffix = slipResult.payment?.reference ? ` ref: ${slipResult.payment.reference}` : '';
  const bankSuffix = slipResult.payment?.bankName ? ` (${slipResult.payment.bankName})` : '';
  const whtNote = matchInfo.whtRate
    ? ` (หัก ณ ที่จ่าย ${(matchInfo.whtRate * 100).toFixed(0)}% = ฿${(savedPurchase.total * matchInfo.whtRate).toLocaleString('th-TH', { maximumFractionDigits: 2 })})`
    : '';

  await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.update({
    where: { id: savedPurchase.id },
    data: {
      isPaid: true,
      paidAt,
      notes: `ชำระโดยสลิปโอนเงิน LINE${bankSuffix}${refSuffix}${whtNote}`,
    },
  }));
  await updateDocumentIntake(slipIntake.id, {
    status: 'saved',
    ocrResult: slipResult,
    targetType: 'purchase_invoice',
    targetId: savedPurchase.id,
    purchaseInvoiceId: savedPurchase.id,
  });
  try { await redis.del(`line:pending_slip:${lineUserId}`); } catch { /* noop */ }

  const pairedSlipEditUrl = buildIntakeEditUrlSafe(slipIntake.id, lineUserId, slipIntake.companyId);
  await sendLineFlexMessage(
    lineUserId,
    `✅ บันทึก ${savedPurchase.invoiceNumber} ฿${savedPurchase.total.toLocaleString('th-TH')} + จับคู่สลิปอัตโนมัติ`,
    buildPaymentSlipFlexCard(slipResult, 'saved', {
      matchedInvoiceNumber: savedPurchase.invoiceNumber,
      matchedSupplierName: savedPurchase.supplierName,
      matchScore: 100,
      purchaseInvoiceId: savedPurchase.id,
      intakeId: slipIntake.id,
      editUrl: pairedSlipEditUrl,
    }),
  );
  return true;
}

// Ranks slip vs invoice candidates and returns the best matches. Shared by
// buildSlipCandidateBubbles (renders 5 bubbles + options) and
// sendCombinedSlipAndCandidates (uses the top candidate for the combined card).
async function rankSlipCandidates(_intakeId: string, result: OcrResult, companyId: string): Promise<MatchCandidate[]> {
  const amount = Number(result.payment?.amount ?? result.total ?? 0);
  if (amount <= 0) return [];
  const paidAt = result.payment?.paidAt ? new Date(result.payment.paidAt) : new Date();
  const reference = result.payment?.reference || result.invoiceNumber || undefined;
  const counterparty = [result.payment?.fromName, result.payment?.toName, result.supplierName]
    .filter(Boolean)
    .join(' ');
  const slip = { companyId, amount, paidAt, reference, counterpartyName: counterparty };
  const direction = result.payment?.direction ?? 'unknown';

  const [salesCandidates, purchaseCandidates] = await Promise.all([
    direction === 'outgoing'
      ? Promise.resolve([])
      : findInvoiceCandidates(slip).catch((err) => { logger.warn('[Line] sales candidates failed', { err }); return []; }),
    direction === 'incoming'
      ? Promise.resolve([])
      : findPurchaseInvoiceCandidates(slip).catch((err) => { logger.warn('[Line] purchase candidates failed', { err }); return []; }),
  ]);

  return [
    ...salesCandidates.map((c) => ({
      type: 'sales_invoice' as const,
      id: c.invoiceId,
      invoiceNumber: c.invoiceNumber,
      partyName: c.buyerName,
      total: c.total,
      invoiceDate: c.invoiceDate.toISOString().slice(0, 10),
      score: c.score,
      amountDelta: c.total - amount,
    })),
    ...purchaseCandidates.map((c) => ({
      type: 'purchase_invoice' as const,
      id: c.purchaseInvoiceId,
      invoiceNumber: c.invoiceNumber,
      partyName: c.supplierName,
      total: c.total,
      invoiceDate: c.invoiceDate.toISOString().slice(0, 10),
      score: c.score,
      amountDelta: c.total - amount,
    })),
  ].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return Math.abs(a.amountDelta) - Math.abs(b.amountDelta);
  });
}

async function buildSlipCandidateBubbles(intakeId: string, result: OcrResult, companyId: string, editUrl?: string): Promise<object[]> {
  const amount = Number(result.payment?.amount ?? result.total ?? 0);
  if (amount <= 0) {
    return [buildMatchOptionsBubble(intakeId, { askDirection: false, allowUpload: true, editUrl })];
  }
  const paidAt = result.payment?.paidAt ? new Date(result.payment.paidAt) : new Date();
  const reference = result.payment?.reference || result.invoiceNumber || undefined;
  const counterparty = [result.payment?.fromName, result.payment?.toName, result.supplierName]
    .filter(Boolean)
    .join(' ');
  const slip = { companyId, amount, paidAt, reference, counterpartyName: counterparty };
  const direction = result.payment?.direction ?? 'unknown';

  const [salesCandidates, purchaseCandidates] = await Promise.all([
    direction === 'outgoing'
      ? Promise.resolve([])
      : findInvoiceCandidates(slip).catch((err) => { logger.warn('[Line] sales candidates failed', { err }); return []; }),
    direction === 'incoming'
      ? Promise.resolve([])
      : findPurchaseInvoiceCandidates(slip).catch((err) => { logger.warn('[Line] purchase candidates failed', { err }); return []; }),
  ]);

  const combined: MatchCandidate[] = [
    ...salesCandidates.map((c) => ({
      type: 'sales_invoice' as const,
      id: c.invoiceId,
      invoiceNumber: c.invoiceNumber,
      partyName: c.buyerName,
      total: c.total,
      invoiceDate: c.invoiceDate.toISOString().slice(0, 10),
      score: c.score,
      amountDelta: c.total - amount,
    })),
    ...purchaseCandidates.map((c) => ({
      type: 'purchase_invoice' as const,
      id: c.purchaseInvoiceId,
      invoiceNumber: c.invoiceNumber,
      partyName: c.supplierName,
      total: c.total,
      invoiceDate: c.invoiceDate.toISOString().slice(0, 10),
      score: c.score,
      amountDelta: c.total - amount,
    })),
  ].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return Math.abs(a.amountDelta) - Math.abs(b.amountDelta);
  });

  const top = combined.slice(0, 5);
  const bubbles: object[] = top.map((c) => buildMatchCandidateBubble(c, intakeId));
  bubbles.push(buildMatchOptionsBubble(intakeId, { askDirection: direction === 'unknown', allowUpload: true, editUrl }));
  return bubbles;
}

async function sendCombinedSlipAndCandidates(
  lineUserId: string,
  intakeId: string,
  result: OcrResult,
  altText: string,
): Promise<void> {
  const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
    where: { id: intakeId },
    select: { companyId: true },
  }));
  if (!intake) {
    // No company context — fall back to just the slip card
    await sendLineFlexMessage(lineUserId, altText, buildPaymentSlipFlexCard(result, 'pending', { intakeId }));
    return;
  }

  // High-confidence single match path — show one combined bubble instead of
  // a slip+candidates carousel. Saves the user from comparing two bubbles
  // and reduces taps to confirm. Triggers when the top candidate has exact
  // amount and score ≥ 80.
  const ranked = await rankSlipCandidates(intakeId, result, intake.companyId);
  const topCandidate = ranked[0];
  if (topCandidate && topCandidate.amountDelta === 0 && topCandidate.score >= 80) {
    await sendLineFlexMessage(
      lineUserId,
      altText,
      buildCombinedSlipBillFlexCard(result, topCandidate, intakeId),
    );
    return;
  }

  const combinedEditUrl = buildIntakeEditUrlSafe(intakeId, lineUserId, intake.companyId);
  const slipBubble = buildPaymentSlipFlexCard(result, 'pending', { intakeId, editUrl: combinedEditUrl });
  const candidateBubbles = ranked.length > 0
    ? [...ranked.slice(0, 5).map((c) => buildMatchCandidateBubble(c, intakeId)), buildMatchOptionsBubble(intakeId, { askDirection: (result.payment?.direction ?? 'unknown') === 'unknown', allowUpload: true, editUrl: combinedEditUrl })]
    : await buildSlipCandidateBubbles(intakeId, result, intake.companyId, combinedEditUrl);
  const allBubbles = [slipBubble, ...candidateBubbles].slice(0, 12);
  await sendLineFlexCarousel(lineUserId, altText, allBubbles);
}

async function askForConfirmation(lineUserId: string, intakeId: string, result: OcrResult) {
  const updated = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
    where: { id: intakeId },
    data: {
      status: 'awaiting_confirmation',
      ocrResult: result as unknown as Prisma.InputJsonValue,
      warnings: result.validationWarnings as Prisma.InputJsonValue | undefined,
      error: null,
    },
    select: { companyId: true },
  }));

  // Build the magic-link edit URL — drives the "✏️ แก้ไขในเว็บ" URI button
  // on the confirm card. Without this we fall back to a postback that opens
  // an inline field picker, which loses photo context and is harder to use.
  const editUrl = buildIntakeEditUrlSafe(intakeId, lineUserId, updated.companyId);

  // Show paypers-style summary card so the user sees what we understood
  // (document type, amount, date, seller, category) BEFORE we ask anything.
  // Bank slips get a specialized payment card with from/to/reference rows;
  // everything else uses the generic intake confirm card.
  const isBankSlip = result.documentType === 'bank_transfer' || result.documentType === 'payment_advice';
  const amountForAlt = result.payment?.amount ?? result.total ?? 0;
  const altText = `📄 ${result.documentTypeLabel || 'เอกสาร'} ${amountForAlt ? `฿${amountForAlt.toLocaleString('th-TH')}` : ''}`.trim();

  if (isBankSlip) {
    // Send the slip card + candidate carousel as ONE push (LINE Free plan
    // = 500 push/month — every saved push matters). The slip bubble is the
    // first bubble in the carousel; candidates follow.
    await sendCombinedSlipAndCandidates(lineUserId, intakeId, result, altText);
    return;
  }

  await sendLineFlexMessage(
    lineUserId,
    altText,
    buildIntakeConfirmFlexCard(result, intakeId, editUrl ? { editUrl } : undefined),
  );

  // Only prompt for category when AI couldn't infer one — otherwise the
  // confirm button on the Flex card is enough.
  const aiCategory = result.postingSuggestion || result.expenseSubcategory || result.expenseCategory || '';
  if (aiCategory) return;

  const categoryButtons: Array<{ label: string; data: string; displayText: string }> = [
    { label: '🏢 ค่าบริการวิชาชีพ',   data: `set_category:${intakeId}:ค่าบริการวิชาชีพ`,   displayText: 'หมวด: ค่าบริการวิชาชีพ' },
    { label: '⛽ ค่าน้ำมัน/ขนส่ง',    data: `set_category:${intakeId}:ค่าน้ำมัน/ขนส่ง`,    displayText: 'หมวด: ค่าน้ำมัน/ขนส่ง' },
    { label: '🏬 วัสดุสำนักงาน',       data: `set_category:${intakeId}:วัสดุสำนักงาน`,       displayText: 'หมวด: วัสดุสำนักงาน' },
    { label: '🔧 ค่าซ่อมบำรุง',        data: `set_category:${intakeId}:ค่าซ่อมบำรุง`,        displayText: 'หมวด: ค่าซ่อมบำรุง' },
    { label: '💡 ค่าสาธารณูปโภค',     data: `set_category:${intakeId}:ค่าสาธารณูปโภค`,     displayText: 'หมวด: ค่าสาธารณูปโภค' },
    { label: '📦 ค่าสินค้า/วัตถุดิบ',  data: `set_category:${intakeId}:ค่าสินค้า/วัตถุดิบ`,  displayText: 'หมวด: ค่าสินค้า/วัตถุดิบ' },
    { label: '📋 อื่นๆ',               data: `set_category:${intakeId}:อื่นๆ`,               displayText: 'หมวด: อื่นๆ' },
  ];

  await sendLineTextWithQuickReply(
    lineUserId,
    '📂 ยังไม่รู้หมวดค่าใช้จ่าย ช่วยเลือกให้หน่อยครับ:',
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
    // RLS on purchase_invoices requires app.current_company_id to be set;
    // LINE flow has no user JWT, so use the system context which bypasses
    // the policy while still respecting the explicit companyId we pass.
    return await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.create({
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
    }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.findFirst({
        where: { companyId, supplierTaxId, invoiceNumber },
      }));
      if (existing) return existing;
    }
    throw err;
  }
}

async function findDuplicateSlipIntake(result: OcrResult, companyId: string, currentIntakeId?: string) {
  const reference = result.payment?.reference;
  if (!reference || reference.length < 6) return null;
  const recent = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findMany({
    where: {
      companyId,
      id: currentIntakeId ? { not: currentIntakeId } : undefined,
      createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, ocrResult: true, status: true, createdAt: true, targetType: true, targetId: true, purchaseInvoiceId: true },
  }));
  for (const c of recent) {
    const r = c.ocrResult as unknown as OcrResult | null;
    if (r?.payment?.reference && r.payment.reference === reference) {
      return { id: c.id, status: c.status, createdAt: c.createdAt, ocrResult: r, targetType: c.targetType, targetId: c.targetId };
    }
  }
  return null;
}

async function findDuplicatePurchaseFromOcr(result: OcrResult, companyId: string, fallbackId: string) {
  const supplierTaxId = result.supplierTaxId || '0000000000000';
  const invoiceNumber = result.invoiceNumber || `LINE-${fallbackId}`;
  if (!supplierTaxId || supplierTaxId === '0000000000000' || !invoiceNumber) return null;
  return withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.findFirst({
    where: { companyId, supplierTaxId, invoiceNumber },
    select: {
      id: true,
      supplierName: true,
      invoiceNumber: true,
      invoiceDate: true,
      total: true,
    },
  }));
}

async function replySavedPurchase(lineUserId: string, result: OcrResult, purchaseId: string, prefix = '✅ บันทึกค่าใช้จ่ายสำเร็จ', submitterUserId?: string, intakeId?: string, companyId?: string) {
  const totalLabel = result.total
    ? ` ฿${result.total.toLocaleString('th-TH')}`
    : '';
  // Look up the submitter's display name so the saved card matches
  // paypers UX ('ผู้ขออนุญาตเบิก: <name>'). Silently skip if missing.
  let submittedBy: string | undefined;
  if (submitterUserId) {
    try {
      const submitter = await withSystemRlsContext(prisma, (tx) => tx.user.findUnique({
        where: { id: submitterUserId },
        select: { name: true, email: true },
      }));
      submittedBy = submitter?.name || submitter?.email || undefined;
    } catch (err) {
      logger.warn('[Line] submitter lookup failed', { err, submitterUserId });
    }
  }

  // Fetch Google Sheet + Drive folder URLs so the user can jump straight
  // to their company workspace from the LINE bot — closes the loop user
  // explicitly asked for ("พอบันทึกจะแสดง sheet google และ google drive
  // location ของไฟล์"). Drive sync is async so driveFolderUrl may not be
  // populated yet on first save — falls back to project / company folder.
  let sheetUrl: string | undefined;
  let driveFolderUrl: string | undefined;
  if (companyId) {
    try {
      const company = await withSystemRlsContext(prisma, (tx) => tx.company.findUnique({
        where: { id: companyId },
        select: { googleWorkspaceSheetUrl: true },
      }));
      sheetUrl = company?.googleWorkspaceSheetUrl ?? undefined;
    } catch (err) {
      logger.warn('[Line] sheet URL lookup failed', { err, companyId });
    }
  }
  if (intakeId) {
    try {
      const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
        where: { id: intakeId },
        select: { driveFolderUrl: true, projectId: true },
      }));
      driveFolderUrl = intake?.driveFolderUrl ?? undefined;
      if (!driveFolderUrl && intake?.projectId) {
        const project = await withSystemRlsContext(prisma, (tx) => tx.project.findUnique({
          where: { id: intake.projectId! },
          select: { driveFolderUrl: true },
        }));
        driveFolderUrl = project?.driveFolderUrl ?? undefined;
      }
    } catch (err) {
      logger.warn('[Line] drive URL lookup failed', { err, intakeId });
    }
  }

  await sendLineFlexMessage(
    lineUserId,
    `${prefix}${totalLabel}`,
    buildIntakeSavedFlexCard(result, {
      editPostback: `edit_purchase:${purchaseId}`,
      submittedBy,
      sheetUrl,
      driveFolderUrl,
    }),
  );
}

function paymentDate(result: OcrResult) {
  return result.payment?.paidAt || result.invoiceDate || new Date().toISOString().split('T')[0];
}

async function handleBankTransferDocument(lineUserId: string, result: OcrResult, companyId: string, userId: string, intakeId?: string): Promise<PaymentMatchResult> {
  const amount = paymentAmount(result);
  if (!amount || amount <= 0) {
    return {
      ok: false,
      status: 'needs_review',
      message: 'อ่านสลิปโอนได้ แต่ยังไม่พบยอดเงินที่ชัดเจน กรุณาตรวจในหน้า Input VAT',
      warnings: ['missing:payment.amount'],
    };
  }

  // Magic-link URL for the slip's edit page — passed to every Flex card
  // so the "✏️ แก้ไข" button opens the guest web form instead of dragging
  // the user back into the old field-by-field chat flow.
  const editUrl = buildIntakeEditUrlSafe(intakeId, lineUserId, companyId);

  const direction = result.payment?.direction ?? 'unknown';
  const paidAt = new Date(paymentDate(result));
  const reference = paymentReference(result) || undefined;
  const counterparty = [result.payment?.fromName, result.payment?.toName, result.supplierName]
    .filter(Boolean)
    .join(' ');

  if (direction !== 'outgoing') {
    const match = await attemptAutoMatchAndPay(
      {
        companyId,
        amount,
        paidAt,
        reference,
        counterpartyName: counterparty,
      },
      {
        intakeId,
        createdBy: userId,
        note: `นำเข้าจากสลิปโอนเงิน LINE OCR${result.payment?.bankName ? ` (${result.payment.bankName})` : ''}`,
      },
    );

    const amountFmt = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);

    if (match.status === 'auto_matched' && match.invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: match.invoiceId },
        include: { buyer: { select: { nameTh: true } } },
      });
      const buyerName = invoice?.buyer.nameTh ?? '';
      const invoiceNumber = invoice?.invoiceNumber ?? '';
      return {
        ok: true,
        status: 'saved',
        targetId: match.invoiceId,
        targetType: 'sales_invoice',
        message: `✅ บันทึกรับชำระจากสลิปแล้ว (match ${match.matchScore}%)`,
        flexAlt: `รับชำระ ${invoiceNumber} ${amountFmt}`,
        flexCard: buildPaymentSlipFlexCard(result, 'saved', {
          matchedInvoiceNumber: invoiceNumber,
          matchedCustomerName: buyerName,
          matchScore: match.matchScore,
          invoiceId: match.invoiceId,
          intakeId,
          editUrl,
        }),
      };
    }

    if (match.status === 'shortlist' && match.candidates[0]) {
      const top = match.candidates[0];
      const list = match.candidates
        .slice(0, 3)
        .map((c) => `• ${c.invoiceNumber} · ${c.buyerName} · ${c.score}%`)
        .join('\n');
      return {
        ok: false,
        status: 'needs_review',
        targetType: 'sales_invoice',
        targetId: top.invoiceId,
        message: `🟡 ใกล้เคียงแต่ยังไม่ชัวร์ — ขอให้ยืนยันใบที่ใช่\nผู้สมัครต้น 3 อันดับ:\n${list}`,
        warnings: ['shortlist:sales_invoice'],
        flexAlt: `สลิปคล้าย ${top.invoiceNumber} ${amountFmt}`,
        flexCard: buildPaymentSlipFlexCard(result, 'shortlist', {
          matchedInvoiceNumber: top.invoiceNumber,
          matchedCustomerName: top.buyerName,
          matchScore: top.score,
          invoiceId: top.invoiceId,
          intakeId,
          editUrl,
        }),
      };
    }

    return {
      ok: false,
      status: 'needs_review',
      targetType: 'sales_invoice',
      message: `อ่านสลิปโอนได้ แต่ยังจับคู่กับใบขายไม่ได้ กรุณาตรวจในหน้าเอกสาร/รับชำระเงิน`,
      warnings: ['unmatched:sales_invoice'],
      flexAlt: `สลิปยังไม่จับคู่ ${amountFmt}`,
      flexCard: buildPaymentSlipFlexCard(result, 'unmatched', { intakeId, editUrl }),
    };
  }

  const purchaseCandidates = await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.findMany({
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
  }));
  const exactPurchase = purchaseCandidates.find((purchase) => closeAmount(purchase.total, amount));
  if (exactPurchase) {
    await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.update({
      where: { id: exactPurchase.id },
      data: {
        isPaid: true,
        paidAt,
        notes: [
          exactPurchase.notes,
          `ชำระโดยสลิปโอนเงิน LINE OCR${reference ? ` ref: ${reference}` : ''}${result.payment?.bankName ? ` bank: ${result.payment.bankName}` : ''}`,
        ].filter(Boolean).join('\n'),
      },
    }));
    const outAmountFmt = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
    return {
      ok: true,
      status: 'saved',
      targetId: exactPurchase.id,
      targetType: 'purchase_invoice',
      message: `✅ บันทึกจ่ายชำระเอกสารซื้อแล้ว`,
      flexAlt: `จ่ายชำระ ${exactPurchase.invoiceNumber} ${outAmountFmt}`,
      flexCard: buildPaymentSlipFlexCard(result, 'saved', {
        matchedInvoiceNumber: exactPurchase.invoiceNumber,
        matchedSupplierName: exactPurchase.supplierName,
        purchaseInvoiceId: exactPurchase.id,
        intakeId,
        editUrl,
      }),
    };
  }

  const unmatchedAmountFmt = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
  return {
    ok: false,
    status: 'needs_review',
    targetType: 'purchase_invoice',
    message: `อ่านสลิปโอนได้ แต่ยังจับคู่กับเอกสารซื้อไม่ได้ กรุณาตรวจในหน้า Input VAT`,
    warnings: ['unmatched:purchase_invoice'],
    flexAlt: `สลิปจ่ายยังไม่จับคู่ ${unmatchedAmountFmt}`,
    flexCard: buildPaymentSlipFlexCard(result, 'unmatched', { intakeId, editUrl }),
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
        duplicatePolicy: 'rename',
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
      { expiresIn: PROJECT_PORTAL_TTL as jwt.SignOptions['expiresIn'] },
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
        webhookReplyMode: lineGroupSilentModeEnabled()
          ? 'group_reply_only_silent_mode_private_push_fallback'
          : 'reply_token_ack_with_push_fallback',
        groupSilentMode: lineGroupSilentModeEnabled(),
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
    withSystemRlsContext(prisma, (tx) => tx.documentIntake.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        source: true,
        sourceMessageId: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        projectId: true,
        project: { select: { id: true, code: true, name: true } },
        targetType: true,
        targetId: true,
        purchaseInvoiceId: true,
        ocrResult: true,
        warnings: true,
        error: true,
        driveSyncStatus: true,
        driveUrl: true,
        driveSyncError: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })),
    withSystemRlsContext(prisma, (tx) => tx.lineUserLink.count({ where: { user: { companyId }, isActive: true } })),
    withSystemRlsContext(prisma, (tx) => tx.lineGroupLink.count({ where: { companyId, isActive: true } })),
    withSystemRlsContext(prisma, (tx) => tx.documentIntake.groupBy({
      by: ['status'],
      where: { companyId, createdAt: { gte: since } },
      _count: { _all: true },
    })),
    withSystemRlsContext(prisma, (tx) => Promise.all([
      tx.documentIntake.count({ where: { companyId, storageKey: { not: null }, createdAt: { gte: since } } }),
      tx.documentIntake.count({ where: { companyId, fileBase64: { not: null }, createdAt: { gte: since } } }),
      tx.documentIntake.count({
        where: {
          companyId,
          createdAt: { gte: since },
          OR: [
            { error: { contains: 'duplicate', mode: 'insensitive' } },
            { error: { contains: 'ซ้ำ' } },
          ],
        },
      }),
    ])),
    withSystemRlsContext(prisma, (tx) => tx.documentIntake.groupBy({
      by: ['source'],
      where: { companyId, createdAt: { gte: since } },
      _count: { _all: true },
    })),
    withSystemRlsContext(prisma, (tx) => tx.documentIntake.groupBy({
      by: ['mimeType'],
      where: { companyId, createdAt: { gte: since } },
      _count: { _all: true },
    })),
    withSystemRlsContext(prisma, (tx) => Promise.all([
      tx.invoice.count({ where: { companyId, createdAt: { gte: since } } }),
      tx.purchaseInvoice.count({ where: { companyId, createdAt: { gte: since } } }),
      tx.documentIntake.count({ where: { companyId, createdAt: { gte: since } } }),
    ])),
  ]);

  const columns = intakeColumnsResult.status === 'fulfilled'
    ? intakeColumnsResult.value.map((row) => row.column_name)
    : [];
  const requiredColumns = ['targetType', 'targetId', 'purchaseInvoiceId'];
  const missingColumns = requiredColumns.filter((column) => !columns.includes(column));

  const persistedWebhook = await loadWebhookDiagnostics();
  res.json({
    data: {
      checkedAt: new Date().toISOString(),
      webhook: persistedWebhook,
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
        ? {
            ok: true,
            items: recentIntakesResult.value.map((item) => ({
              ...item,
              ocrSummary: summarizeDocumentIntakeOcr(item.ocrResult, item.warnings),
              ocrResult: undefined,
              warnings: undefined,
            })),
          }
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
    active = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { lineUserId, status: 'awaiting_input' },
      orderBy: { updatedAt: 'desc' },
    }));
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
    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
      where: { id: active.id },
      data: { status: 'needs_review', error: 'cancelled_by_user' },
    }));
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
    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
      where: { id: active.id },
      data: {
        ocrResult: newResult as unknown as Prisma.InputJsonValue,
        status: 'awaiting_confirmation',
        error: null,
      },
    }));
    const editUrl = buildIntakeEditUrlSafe(active.id, lineUserId, active.companyId);
    await sendLineFlexMessage(
      lineUserId,
      'อัพเดตแล้ว — กรุณายืนยัน',
      buildIntakeConfirmFlexCard(newResult, active.id, editUrl ? { editUrl } : undefined),
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

  // Persist the updated value immediately so even if the user closes the chat
  // here, we've still captured what they typed.
  await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
    where: { id: active.id },
    data: { ocrResult: result as unknown as Prisma.InputJsonValue, error: null },
  }));

  // Acknowledge the value before asking for the next thing, so the user
  // knows their input was received (otherwise the chat looks silent).
  await sendLineText(lineUserId, `✅ บันทึก ${field.label}: ${parsed} แล้ว`);

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
    await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.update({
      where: { id: session.purchaseInvoiceId },
      data: { [session.currentField]: parsedValue } as Record<string, unknown>,
    }));
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

  if (lineGroupSilentModeEnabled() && isLineGroupConversation(messageContext) && !isGroupTextCommand(trimmed)) {
    logger.info('[Line] group text ignored by silent mode', {
      sourceType: messageContext.sourceType,
      lineGroupId: messageContext.lineGroupId,
      lineRoomId: messageContext.lineRoomId,
    });
    return;
  }

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

        const lineProfile = await getLineUserProfile(senderLineUserId);
        const lineDisplayName = lineProfile?.displayName ?? targetUser.name;
        const linePictureUrl = lineProfile?.pictureUrl ?? null;

        await tx.lineUserLink.upsert({
          where: { userId: targetUser.id },
          create: {
            userId: targetUser.id,
            lineUserId: senderLineUserId,
            displayName: lineDisplayName,
            pictureUrl: linePictureUrl,
            isActive: true,
          },
          update: {
            lineUserId: senderLineUserId,
            displayName: lineDisplayName,
            pictureUrl: linePictureUrl,
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
      const results = await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.findMany({
        where: {
          companyId,
          supplierName: { contains: query, mode: 'insensitive' },
        },
        orderBy: { invoiceDate: 'desc' },
        take: 5,
        select: { id: true, supplierName: true, invoiceNumber: true, invoiceDate: true, total: true, vatAmount: true },
      }));
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
      const recent = await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { supplierName: true, invoiceNumber: true, invoiceDate: true, total: true },
      }));
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
      const monthInvoices = await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.findMany({
        where: { companyId, invoiceDate: { gte: monthStart } },
        orderBy: { invoiceDate: 'desc' },
        take: 10,
        select: { supplierName: true, invoiceNumber: true, total: true, vatAmount: true },
      }));
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
      await recordLineProjectMemberActivity({
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
      // We deliberately do NOT send the verbose "รับไฟล์เข้าโปรเจคแล้วครับ"
      // join-invite text here. The OCR + Flex slip/intake card that follows
      // is a much better response — it shows what we extracted AND lets the
      // user match with a bill right inside the group chat. The join invite
      // still goes out once via the dedicated /join command if needed.
    }
    logger.info('[Line] file received', { contentType, isPdf, bufferSize: buffer.length, messageType });

    if (!supportedDocumentMimeType(contentType)) {
      await sendLineText(lineUserId, 'ไฟล์ชนิดนี้ยังไม่รองรับครับ กรุณาส่งเป็นรูป JPG/PNG/WebP หรือ PDF');
      await updateDocumentIntake(intake?.id, {
        status: 'failed',
        error: `Unsupported file type: ${contentType}`,
      });
      return;
    }

    // Immediate progress ack so the user sees the bot received the file
    // BEFORE the OCR call runs. Each file gets its own card after OCR;
    // batching was removed because the setTimeout-based close was lost
    // on any dyno restart, causing silent 'กำลังอ่าน' ghost messages.
    await sendLineText(lineUserId, '📥 รับเอกสารแล้ว — กำลังอ่าน...');

    // ===== ASYNC BOUNDARY =====
    // Webhook returns 200 to LINE NOW. The actual OCR + routing runs on
    // the worker dyno via BullMQ — survives Render restarts, retries on
    // failure, and lets us scale the worker pool independently of the web
    // dyno. The reply-token ack above is the only message this handler
    // sends; everything after the worker picks up the job goes via push.
    if (!intake?.id) {
      logger.warn('[Line] no intake created; skipping queue enqueue');
      return;
    }

    // ===== QUOTA ENFORCEMENT =====
    // Hard-block OCR when the company is over its monthly document quota.
    // We've already created the intake row + ack'd the user; bail out before
    // spending OCR API tokens / queue capacity on a doc we can't process.
    // Engine downgrade (Typhoon→Gemini, OpenAI→Gemini) is handled inside
    // aiService for plan-tier mismatches that DON'T need a hard block.
    const policy = await getOcrPolicyForCompany(companyId);
    if (policy.overQuota) {
      logger.info('[Line] OCR quota exceeded — blocking upload', {
        companyId,
        intakeId: intake.id,
        docsUsedThisMonth: policy.docsUsedThisMonth,
        monthlyDocLimit: policy.monthlyDocLimit,
      });
      auditLog({
        event: 'intake_quota_blocked',
        companyId,
        actorUserId: resolved.userId,
        actorLineUserId: lineUserId,
        intakeId: intake.id,
        extra: { docsUsedThisMonth: policy.docsUsedThisMonth, monthlyDocLimit: policy.monthlyDocLimit },
      });
      await updateDocumentIntake(intake.id, {
        status: 'needs_review',
        error: `quota_exceeded:${policy.docsUsedThisMonth}/${policy.monthlyDocLimit}`,
      });
      const usedLine = policy.monthlyDocLimit
        ? `${policy.docsUsedThisMonth}/${policy.monthlyDocLimit} เอกสาร`
        : `${policy.docsUsedThisMonth} เอกสาร`;
      await sendLineText(
        lineUserId,
        `🚫 โควต้าเดือนนี้เต็มแล้ว (${usedLine})\n\n` +
        `ไฟล์ถูกเก็บในระบบแล้ว แต่ระบบจะยังไม่อ่านอัตโนมัติเพื่อรักษาต้นทุน\n\n` +
        `• โควต้าจะรีเซ็ตวันที่ 1 ของเดือนถัดไป\n` +
        `• อัปเกรดแผนได้ที่ Billboy → Admin → Subscription เพื่อเพิ่มโควต้า\n` +
        `• ถ้าจำเป็นต้องอ่านด่วน ตรวจเองได้ที่หน้า Input VAT`,
      );
      return;
    }

    // Approaching-limit nudge (≥ 80%) — visible only when AT/over 80%, not at
    // every upload. Soft warning, doesn't block the job.
    if (policy.monthlyDocLimit && policy.docsUsedThisMonth >= Math.floor(policy.monthlyDocLimit * 0.8)) {
      const remaining = policy.monthlyDocLimit - policy.docsUsedThisMonth;
      if (remaining > 0 && remaining <= 10) {
        await sendLineText(
          lineUserId,
          `⚠️ เหลือโควต้าเดือนนี้อีก ${remaining} ฉบับ (${policy.docsUsedThisMonth}/${policy.monthlyDocLimit}) — พิจารณาอัปเกรดแผนถ้าต้องการใช้งานต่อเนื่อง`,
        );
      }
    }

    const pushTargetForJob = messageContext.lineGroupId ?? messageContext.lineRoomId;

    // Best-effort enqueue to BullMQ — gives the worker dyno a chance to
    // pick this up first. Doesn't matter much if it fails; the inline
    // run below covers us.
    try {
      await enqueueLineOcrJob({ intakeId: intake.id, lineUserId, pushTarget: pushTargetForJob });
    } catch (enqueueErr) {
      logger.warn('[Line] BullMQ enqueue failed, inline run will cover', { enqueueErr, intakeId: intake.id });
    }

    // ALWAYS also run inline on the web dyno. The processing-lock inside
    // processIntakeOcrPipeline (SET NX EX 90s on `intake:processing:<id>`)
    // ensures only one runner — worker or web — actually does the work.
    // This kills the dependency on the worker dyno being alive: if it's
    // dead or backed up, the web dyno just runs the pipeline itself.
    void processIntakeOcrPipeline({
      intakeId: intake.id,
      lineUserId,
      pushTarget: pushTargetForJob,
    }).catch((err) => logger.error('[Line] inline OCR run failed', { err, intakeId: intake.id }));
    return;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCode = (err && typeof err === 'object' && 'code' in err) ? String((err as { code?: unknown }).code) : '';
    const errMeta = (err && typeof err === 'object' && 'meta' in err) ? JSON.stringify((err as { meta?: unknown }).meta).slice(0, 200) : '';
    logger.error('[Line] handleImageMessage failed', { err, stage, errMsg, errCode, errMeta });
    let userMessage: string;
    if (/timeout|ETIMEDOUT|aborted|ECONNRESET/i.test(errMsg)) {
      userMessage = '⚠️ ระบบ AI ตอบช้าผิดปกติ กรุณาส่งเอกสารใหม่อีกครั้งใน 1-2 นาที';
    } else if (/decode|invalid jpeg|jpeg|png|unsupported.*format/i.test(errMsg)) {
      userMessage = '⚠️ ไฟล์รูปอ่านไม่ออก ลองส่งเป็น PDF หรือถ่ายใหม่ในรูปแบบ JPEG/PNG ปกติ (iPhone HEIC ยังไม่รองรับ)';
    } else if (/api key|unauthorized|401|403|invalid_api_key/i.test(errMsg)) {
      userMessage = '⚠️ ระบบ OCR มีปัญหา config ชั่วคราว ลองใหม่ในอีกสักครู่ หรือแจ้ง admin';
    } else if (/quota|rate.?limit|429|insufficient_quota/i.test(errMsg)) {
      userMessage = '⚠️ ใช้งานเยอะเกินโควต้าชั่วคราว ลองใหม่ใน 5 นาที';
    } else if (/storage|s3|r2|upload/i.test(errMsg)) {
      userMessage = '⚠️ เก็บไฟล์ลง storage ไม่สำเร็จ ลองส่งใหม่ในอีกสักครู่';
    } else if (/reply.?token|invalid_reply_token|expired/i.test(errMsg)) {
      userMessage = '⚠️ ระบบใช้เวลาประมวลผลนานเกินจน LINE ปิด session ระบบบันทึกไฟล์แล้ว ตรวจดูใน Input VAT';
    } else {
      const errSnippet = errMsg.slice(0, 150).replace(/[\n\r]+/g, ' ');
      const codeStr = errCode ? `[${errCode}] ` : '';
      userMessage = `⚠️ อ่านเอกสารไม่สำเร็จ (${stage})\n\n🔎 ${codeStr}${errSnippet}\n\nไฟล์ถูกเก็บในระบบแล้ว`;
    }
    await sendLineText(lineUserId, userMessage);
  }
}

/**
 * Run the LINE OCR + routing pipeline for a previously-created
 * DocumentIntake row. Called from the BullMQ worker (see
 * queues/workers/lineOcrWorker.ts) and from the inline fallback when the
 * queue is unavailable.
 *
 * All user-facing messages go via push (LINE reply token expired long
 * before this point), routed to `pushTarget` (groupId/roomId) when set
 * so group conversations get their responses in the group.
 */
export async function processIntakeOcrPipeline(input: {
  intakeId: string;
  lineUserId: string;
  pushTarget?: string;
}): Promise<void> {
  const { intakeId, lineUserId, pushTarget } = input;

  // Redis lock TTL must outlast the pipeline timeout (120s) so the lock
  // is still valid for the whole run. 150s gives 30s headroom for the
  // post-OCR work (DB update + LINE push + Drive sync trigger).
  const lockKey = `intake:processing:${intakeId}`;
  let acquired = false;
  try {
    const result = await redis.set(lockKey, '1', 'EX', 150, 'NX');
    acquired = result === 'OK';
  } catch (err) {
    logger.warn('[Line] processing-lock acquire failed', { err, intakeId });
    acquired = true; // Redis blip — proceed anyway
  }
  if (!acquired) {
    logger.info('[Line] skipping OCR pipeline — already in-flight', { intakeId });
    return;
  }

  // Hard 120s timeout on the whole pipeline. Multi-page PDFs with Thai
  // text take 30-60s on OpenAI vision; the previous 75s cap was firing
  // before legitimate work could finish. Lock TTL is also bumped to
  // 150s in sync (acquired below) so the lock outlasts the timeout.
  const PIPELINE_TIMEOUT_MS = 120_000;
  let timedOut = false;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      reject(new Error(`pipeline timeout after ${PIPELINE_TIMEOUT_MS}ms`));
    }, PIPELINE_TIMEOUT_MS);
  });

  try {
    await Promise.race([
      withLineReplyToken('', () => runIntakeOcrPipelineInner({ intakeId, lineUserId }), { pushTarget }),
      timeoutPromise,
    ]);
  } catch (err) {
    if (timedOut) {
      logger.error('[Line] OCR pipeline exceeded hard timeout', { intakeId, lineUserId });
      try {
        await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
          where: { id: intakeId },
          data: { status: 'needs_review', error: 'pipeline_timeout' },
        }));
      } catch (updateErr) {
        logger.warn('[Line] mark-timeout status update failed', { err: updateErr, intakeId });
      }
      try {
        await sendLineText(
          pushTarget ?? lineUserId,
          '⚠️ ระบบใช้เวลาอ่านเอกสารนานผิดปกติ — ไฟล์ถูกเก็บในระบบแล้ว ตรวจดูใน Input VAT หรือลองส่งใหม่อีกครั้งใน 1-2 นาที',
        );
      } catch (sendErr) {
        logger.warn('[Line] timeout notification send failed', { err: sendErr, intakeId });
      }
      return;
    }
    throw err;
  } finally {
    try { await redis.del(lockKey); } catch { /* best-effort */ }
  }
}

async function runIntakeOcrPipelineInner(input: { intakeId: string; lineUserId: string }): Promise<void> {
  const { intakeId, lineUserId } = input;
  let asyncStage = 'load_intake';
  try {
    const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: intakeId },
    }));
    if (!intake) {
      logger.warn('[Line] processIntakeOcrPipeline: intake not found', { intakeId });
      return;
    }
    const companyId = intake.companyId;
    const contentType = intake.mimeType;

    asyncStage = 'load_buffer';
    let buffer: Buffer;
    if (intake.storageKey) {
      buffer = await downloadFromStorage(intake.storageKey);
    } else if (intake.fileBase64) {
      buffer = Buffer.from(intake.fileBase64, 'base64');
    } else {
      throw new Error('Intake has no file content (no storageKey or fileBase64)');
    }

    await updateDocumentIntake(intake.id, { status: 'processing' });

    asyncStage = 'document_ocr_pipeline';
    const analysis = await analyzeAccountingDocumentBuffer(buffer, contentType, companyId);
    const result = analysis.result;
    const qrText = analysis.qrText;

    // Reclassify as bank_transfer using multiple signals so we don't fall
    // back to the purchase template (which asks for supplierTaxId — a field
    // bank slips don't have).
    //
    // Signal A: QR text matches a Thai bank verify URL / PromptPay TLV.
    // Signal B: OCR populated payment.fromName + payment.toName/toAccount
    //           (or payment.bankName looks like a bank/app name).
    // Signal C: OCR text contains slip-specific phrases (ชำระเงินสำเร็จ,
    //           โอนเงินสำเร็จ, เลขที่รายการ).
    if (result && result.documentType !== 'bank_transfer' && result.documentType !== 'payment_advice') {
      const slipFields = qrText ? parseThaiSlipQr(qrText) : null;
      const qrMatch = !!(slipFields && slipFields.confidence >= 0.6 && slipFields.bank);

      const p = result.payment ?? {};
      const hasFrom = !!(p.fromName || p.fromAccount);
      const hasTo = !!(p.toName || p.toAccount);
      const paymentFieldsMatch = hasFrom && hasTo;

      const haystack = `${result.documentTypeLabel ?? ''} ${result.supplierName ?? ''} ${qrText ?? ''}`.toLowerCase();
      const phraseMatch = /(ชำระเงินสำเร็จ|โอนเงินสำเร็จ|เลขที่รายการ|k\+|kplus|scb easy|ttb touch|prompt[\s-]?pay|พร้อมเพย์)/i.test(haystack);

      if (qrMatch || paymentFieldsMatch || phraseMatch) {
        logger.info('[Line] Reclassified to bank_transfer', {
          from: result.documentType,
          bank: slipFields?.bank,
          qrMatch,
          paymentFieldsMatch,
          phraseMatch,
        });
        result.documentType = 'bank_transfer';
        result.documentTypeLabel = slipFields?.bank
          ? `สลิปโอนเงิน (${slipFields.bank})`
          : (p.bankName ? `สลิปโอนเงิน (${p.bankName})` : 'สลิปโอนเงิน');
      }
    }

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

    // Fallback: if LLM OCR returned nothing useful but the image's QR clearly
    // identifies a Thai bank slip, hydrate the result from QR so we can still
    // show the user a useful Flex card (bank, transaction id, reference) and
    // ask them for the amount.
    if (qrText) {
      const slipFields = parseThaiSlipQr(qrText);
      if (slipFields && slipFields.confidence >= 0.5 && slipFields.bank) {
        const existingPayment = result.payment ?? {};
        result.documentType = 'bank_transfer';
        result.documentTypeLabel = result.documentTypeLabel || `สลิปโอนเงิน (${slipFields.bank})`;
        result.payment = {
          ...existingPayment,
          bankName: existingPayment.bankName || slipFields.bank,
          reference: existingPayment.reference || slipFields.reference || slipFields.transactionId || undefined,
          amount: existingPayment.amount ?? slipFields.amount ?? undefined,
          paidAt: existingPayment.paidAt || slipFields.paidAt || undefined,
        };
        if (!result.invoiceNumber && slipFields.transactionId) {
          result.invoiceNumber = slipFields.transactionId;
        }
      }
    }

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

    // Post-OCR validation pass — repair classification mistakes before any
    // downstream code (Flex card builder, intake state machine, duplicate
    // detector) reads documentType. See services/ocrValidation.ts.
    const validated = validateAndRepairClassification({ ...result, qrText } as OcrResult);
    const enrichedResult = validated.result;

    // Decision oracle for premium-tier OCR escalation. We log when an
    // intake would benefit from gpt-4o / Gemini Pro retry. Actual retry
    // is gated behind OCR_PREMIUM_ESCALATION_ENABLED=true so we can ship
    // the measurement first and the cost spend deliberately.
    const escalation = shouldEscalateAfterValidation(enrichedResult, validated.corrections.length);
    if (escalation.escalate) {
      logger.info('[OCR] would escalate to premium', {
        intakeId: intake?.id,
        reason: escalation.reason,
        docType: enrichedResult.documentType,
        confidence: enrichedResult.confidence,
        corrections: validated.corrections.length,
        provider: enrichedResult.extractionProvider,
      });
      // Premium retry is wired but disabled by default. Flip env
      // OCR_PREMIUM_ESCALATION_ENABLED=true (and set OPENAI_OCR_PREMIUM_MODEL,
      // defaults to 'gpt-4o') to opt in after measuring escalation rate.
      // Skipped for now — see plans/line-system-redesign.md L3.
    }

    // Duplicate slip detection — same transaction reference seen recently.
    // This bypasses batching: the duplicate warning IS the response.
    if (intake?.id && (enrichedResult.documentType === 'bank_transfer' || enrichedResult.documentType === 'payment_advice')) {
      const dup = await findDuplicateSlipIntake(enrichedResult, companyId, intake.id);
      if (dup) {
        const ageDays = Math.round((Date.now() - new Date(dup.createdAt).getTime()) / 86_400_000);
        const ageLabel = ageDays === 0 ? 'วันนี้' : `${ageDays} วันก่อน`;
        const statusLabel = dup.status === 'saved' ? 'บันทึกแล้ว' : 'รอตรวจ';
        await updateDocumentIntake(intake.id, {
          status: 'needs_review',
          ocrResult: enrichedResult,
          warnings: [...(enrichedResult.validationWarnings ?? []), `duplicate_slip:${dup.id}`],
          error: `duplicate_slip:${dup.id}`,
        });
        auditLog({
          event: 'intake_duplicate_warned',
          companyId,
          actorUserId: intake.userId,
          actorLineUserId: lineUserId,
          intakeId: intake.id,
          extra: { duplicateOfIntakeId: dup.id, reference: enrichedResult.payment?.reference },
        });
        await sendLineFlexMessage(
          lineUserId,
          `⚠️ สลิปซ้ำ — เลขรายการเดียวกันเคยส่งแล้ว (${ageLabel})`,
          buildPaymentSlipFlexCard(enrichedResult, 'unmatched', { intakeId: intake.id }),
        );
        await sendLineText(
          lineUserId,
          `⚠️ สลิปนี้เคยส่งมาแล้ว (${ageLabel}, ${statusLabel})\nเลขรายการ: ${enrichedResult.payment?.reference ?? '-'}\n\nถ้าต้องการบันทึกซ้ำให้กด "บันทึก" บนการ์ดด้านบน — มิฉะนั้นไฟล์จะค้างในคิวรอตรวจ`,
        );
        return;
      }
    }

    // Review-only documents (contracts/statements/etc) bypass batching — they
    // just need a quick text summary, not a confirmation card.
    if (REVIEW_ONLY_DOCUMENT_TYPES.has(enrichedResult.documentType) || !PURCHASE_RECORD_DOCUMENT_TYPES.has(enrichedResult.documentType)) {
      const isBankSlip = enrichedResult.documentType === 'bank_transfer' || enrichedResult.documentType === 'payment_advice';
      if (!isBankSlip) {
        await updateDocumentIntake(intake?.id, {
          status: 'needs_review',
          ocrResult: enrichedResult,
          warnings: documentIntakeWarningsForOcr(result, analysis.stages),
        });
        await sendLineText(lineUserId, buildReviewOnlySummary(result));
        return;
      }
    }

    // No intake row (rare — usually private chat fallback) — fall back to
    // immediate text summary without batching.
    if (!intake?.id) {
      await sendLineText(lineUserId, buildConfirmationSummary(enrichedResult));
      return;
    }

    // Persist the OCR result on the intake so it survives across the batch
    // window even if this process restarts.
    await updateDocumentIntake(intake.id, {
      status: 'awaiting_confirmation',
      ocrResult: enrichedResult,
      warnings: enrichedResult.validationWarnings,
      error: undefined,
    });

    // Route directly to the per-doc-type handler — no more batching window.
    // The 6-second setTimeout-based batch close was fragile (lost on any
    // dyno restart) and was the root cause of 'กำลังอ่าน → silence' bugs.
    // Slip+bill auto-pairing still works via the Redis pending_slip /
    // pending_bill pattern inside routePostOcrIntake → handleBankTransfer
    // → tryAutoMatchPendingBillWithSlip, so users uploading both within
    // ~30 min still get the matched-pair UX, just via a follow-up
    // 'จับคู่ได้แล้ว' card instead of a single combined card.
    asyncStage = 'route_intake';
    await routePostOcrIntake(lineUserId, intake, enrichedResult);
  } catch (asyncErr) {
    const errMsg = asyncErr instanceof Error ? asyncErr.message : String(asyncErr);
    const errCode = (asyncErr && typeof asyncErr === 'object' && 'code' in asyncErr) ? String((asyncErr as { code?: unknown }).code) : '';
    logger.error('[Line] OCR pipeline failed', { err: asyncErr, asyncStage, errMsg, errCode, intakeId });
    let userMessage: string;
    if (/timeout|ETIMEDOUT|aborted|ECONNRESET/i.test(errMsg)) {
      userMessage = '⚠️ ระบบ AI ตอบช้าผิดปกติ กรุณาส่งเอกสารใหม่อีกครั้งใน 1-2 นาที';
    } else if (/decode|invalid jpeg|jpeg|png|unsupported.*format/i.test(errMsg)) {
      userMessage = '⚠️ ไฟล์รูปอ่านไม่ออก ลองส่งเป็น PDF หรือถ่ายใหม่ในรูปแบบ JPEG/PNG ปกติ';
    } else if (/api key|unauthorized|401|403|invalid_api_key/i.test(errMsg)) {
      userMessage = '⚠️ ระบบ OCR มีปัญหา config ชั่วคราว ลองใหม่ในอีกสักครู่';
    } else if (/quota|rate.?limit|429|insufficient_quota/i.test(errMsg)) {
      userMessage = '⚠️ ใช้งานเยอะเกินโควต้าชั่วคราว ลองใหม่ใน 5 นาที';
    } else if (/storage|s3|r2|upload/i.test(errMsg)) {
      userMessage = '⚠️ เก็บไฟล์ลง storage ไม่สำเร็จ ลองส่งใหม่ในอีกสักครู่';
    } else {
      const errSnippet = errMsg.slice(0, 150).replace(/[\n\r]+/g, ' ');
      const codeStr = errCode ? `[${errCode}] ` : '';
      userMessage = `⚠️ อ่านเอกสารไม่สำเร็จ (${asyncStage})\n\n🔎 ${codeStr}${errSnippet}\n\nไฟล์ถูกเก็บในระบบแล้ว`;
    }
    try {
      await sendLineText(lineUserId, userMessage);
    } catch (sendErr) {
      logger.error('[Line] OCR error notification failed', { sendErr });
    }
    // Re-throw so BullMQ records the failure and (if attempts remaining) retries.
    throw asyncErr;
  }
}

async function handlePostback(lineUserId: string, data: string): Promise<void> {
  if (data.startsWith('set_category:')) {
    const parts = data.split(':');
    const intakeId = parts[1];
    const category = parts.slice(2).join(':');
    try {
      const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({ where: { id: intakeId, lineUserId } }));
      const result = intake?.ocrResult as unknown as OcrResult | null;
      if (!intake || !result) {
        await sendLineText(lineUserId, 'ไม่พบข้อมูลเอกสาร');
        return;
      }
      const updatedResult: OcrResult = { ...result, postingSuggestion: category, expenseSubcategory: category };
      await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
        where: { id: intakeId },
        data: { ocrResult: updatedResult as unknown as Prisma.InputJsonValue },
      }));
      // Picking the category IS the user's confirmation — save directly and
      // send the final '✅ บันทึกค่าใช้จ่ายสำเร็จ' card instead of asking
      // for confirmation a second time.
      await performConfirmedIntakeSave(lineUserId, intake, updatedResult);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errCode = (err && typeof err === 'object' && 'code' in err) ? String((err as { code?: unknown }).code) : '';
      const errMeta = (err && typeof err === 'object' && 'meta' in err) ? JSON.stringify((err as { meta?: unknown }).meta).slice(0, 200) : '';
      logger.error('[Line] set_category failed', { err, data, errMsg, errCode, errMeta });
      const errSnippet = errMsg.slice(0, 150).replace(/[\n\r]+/g, ' ');
      const codeStr = errCode ? `[${errCode}] ` : '';
      await sendLineText(lineUserId, `⚠️ บันทึกหมวดไม่สำเร็จ\n\n🔎 ${codeStr}${errSnippet}\n\nไฟล์ถูกเก็บในระบบแล้ว ตรวจดูในหน้า Input VAT`);
    }
    return;
  }

  if (data.startsWith('confirm_intake:')) {
    const intakeId = data.slice('confirm_intake:'.length);
    try {
      const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
        where: { id: intakeId, lineUserId },
      }));
      const result = intake?.ocrResult as unknown as OcrResult | null;
      if (!intake || !result) {
        await sendLineText(lineUserId, 'ไม่พบข้อมูลเอกสาร กรุณาส่งไฟล์ใหม่อีกครั้ง');
        return;
      }
      await performConfirmedIntakeSave(lineUserId, intake, result);
    } catch (err) {
      logger.error('[Line] confirm_intake failed', { err, data });
      await sendLineText(lineUserId, 'ขอโทษ บันทึกเอกสารไม่สำเร็จ กรุณาตรวจในหน้า Input VAT');
    }
    return;
  }


  // batch_confirm / batch_cancel postbacks were removed alongside the
  // batching window — no Flex card ever surfaces those buttons anymore.

  if (data.startsWith('skip_field:')) {
    const [, intakeId, fieldKey] = data.split(':');
    if (!intakeId || !fieldKey) {
      await sendLineText(lineUserId, 'คำสั่งไม่ถูกต้อง');
      return;
    }
    const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: intakeId, lineUserId },
    }));
    const result = intake?.ocrResult as unknown as OcrResult | null;
    if (!intake || !result) {
      await sendLineText(lineUserId, 'ไม่พบข้อมูลเอกสาร');
      return;
    }
    // Skip this field — set a placeholder value so missingTemplateFields
    // stops returning it as missing, then move on to the next missing field
    // or jump straight to confirmation.
    if (fieldKey === 'supplierTaxId') {
      setTemplateValue(result, fieldKey, '0000000000000');
    } else if (fieldKey === 'supplierName') {
      setTemplateValue(result, fieldKey, 'ไม่ระบุ');
    } else if (fieldKey.startsWith('payment.') || ['invoiceDate', 'invoiceNumber'].includes(fieldKey)) {
      setTemplateValue(result, fieldKey, '');
    }
    const [nextField] = missingTemplateFields(result);
    if (nextField) {
      await askForMissingField(lineUserId, intake.id, result, nextField);
      return;
    }
    // All required fields satisfied (with skips where allowed) — go to
    // confirmation card so user can review + tap '✅ บันทึก'.
    await askForConfirmation(lineUserId, intake.id, result);
    return;
  }

  if (data.startsWith('cancel_intake:')) {
    const intakeId = data.slice('cancel_intake:'.length);
    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.updateMany({
      where: { id: intakeId, lineUserId },
      data: { status: 'needs_review', error: 'cancelled_by_user' },
    }));
    await sendLineText(lineUserId, 'ยกเลิกแล้ว เอกสารยังอยู่ในคิวรอตรวจ');
    return;
  }

  if (data.startsWith('manual_match:')) {
    const intakeId = data.slice('manual_match:'.length);
    const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: intakeId, lineUserId },
    }));
    const result = intake?.ocrResult as unknown as OcrResult | null;
    if (!intake || !result) {
      await sendLineText(lineUserId, 'ไม่พบข้อมูลสลิป กรุณาส่งใหม่');
      return;
    }
    await sendCombinedSlipAndCandidates(lineUserId, intakeId, result, "บิลที่อาจคู่กับสลิป — เลือกได้เลย");
    return;
  }

  if (data.startsWith('match_direction:')) {
    const [, intakeId, direction] = data.split(':');
    if (!intakeId || (direction !== 'incoming' && direction !== 'outgoing')) {
      await sendLineText(lineUserId, 'คำสั่งไม่ถูกต้อง');
      return;
    }
    const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: intakeId, lineUserId },
    }));
    const result = intake?.ocrResult as unknown as OcrResult | null;
    if (!intake || !result) {
      await sendLineText(lineUserId, 'ไม่พบข้อมูลสลิป');
      return;
    }
    const updated: OcrResult = {
      ...result,
      payment: { ...(result.payment ?? {}), direction: direction as 'incoming' | 'outgoing' },
    };
    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
      where: { id: intakeId },
      data: { ocrResult: updated as unknown as Prisma.InputJsonValue },
    }));
    await sendCombinedSlipAndCandidates(lineUserId, intakeId, updated, "บิลที่อาจคู่กับสลิป — เลือกได้เลย");
    return;
  }

  if (data.startsWith('skip_match:')) {
    const intakeId = data.slice('skip_match:'.length);
    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.updateMany({
      where: { id: intakeId, lineUserId },
      data: { status: 'needs_review', error: 'pending_manual_match' },
    }));
    await sendLineText(lineUserId, '💾 บันทึกไว้ก่อน — สลิปอยู่ในระบบแล้ว เข้าไปจับคู่บิลทีหลังในหน้า Input VAT ได้เลย');
    return;
  }

  // 'บันทึกเป็นค่าใช้จ่ายทั่วไป' — covers the SME slips that don't have a
  // matching purchase invoice: salary, tax payment, bank fee, personal meal,
  // internal transfer, etc. Marks the intake as saved without forcing a
  // slip↔bill match; user can categorise the expense from the web edit page.
  if (data.startsWith('save_as_expense:')) {
    const intakeId = data.slice('save_as_expense:'.length);
    const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: intakeId, lineUserId },
      select: { id: true, companyId: true, ocrResult: true },
    }));
    if (!intake) {
      await sendLineText(lineUserId, 'ไม่พบข้อมูลสลิป กรุณาส่งใหม่');
      return;
    }
    // Annotate the OCR result with the user's intent so the web edit page
    // can pre-fill the expense category section instead of re-asking. The
    // `taxSafety.status = 'expense_only_no_vat'` signal also unlocks the
    // "Create Expense Voucher" button in the file list UI.
    const result = (intake.ocrResult as unknown as OcrResult | null) ?? null;
    // taxSafety isn't a typed field on OcrResult — it's surfaced as part of
    // documentMetadata or as a derived signal elsewhere. We store the intent
    // in expenseCategory + a side-channel marker that the web edit page can
    // recognise without changing the OCR contract.
    const annotated = result ? {
      ...result,
      expenseCategory: result.expenseCategory || 'other',
      expenseSubcategory: result.expenseSubcategory || 'general expense (no bill)',
      taxTreatment: 'non_deductible' as const,
    } : null;
    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
      where: { id: intake.id },
      data: {
        status: 'saved',
        error: 'saved_as_expense',
        ocrResult: (annotated ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    }));
    const editUrl = buildIntakeEditUrlSafe(intake.id, lineUserId, intake.companyId);
    const followup = editUrl
      ? `💾 บันทึกเป็นค่าใช้จ่ายแล้ว — ระบุหมวด/รายละเอียดเพิ่มได้ที่:\n${editUrl}`
      : '💾 บันทึกเป็นค่าใช้จ่ายแล้ว — ระบุหมวดเพิ่มในหน้า Input VAT ได้';
    await sendLineText(lineUserId, followup);
    return;
  }

  if (data.startsWith('upload_bill_for_slip:')) {
    const intakeId = data.slice('upload_bill_for_slip:'.length);
    const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: intakeId, lineUserId },
    }));
    if (!intake) {
      await sendLineText(lineUserId, 'ไม่พบข้อมูลสลิป กรุณาส่งสลิปใหม่');
      return;
    }
    // Clear any stale awaiting_input intakes so the next file/text the user
    // sends isn't intercepted by the missing-field flow.
    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.updateMany({
      where: { lineUserId, status: 'awaiting_input' },
      data: { status: 'needs_review', error: 'replaced_by_bill_upload' },
    }));
    // Park the slip's intake id in Redis (30 min TTL). When the next image/PDF
    // upload finishes OCR and is saved as an invoice/purchase, we auto-match.
    try {
      await redis.set(`line:pending_slip:${lineUserId}`, intakeId, 'EX', 1800);
    } catch (err) {
      logger.warn('[Line] redis set pending_slip failed', { err });
    }
    const result = intake.ocrResult as unknown as OcrResult | null;
    const amt = Number(result?.payment?.amount ?? result?.total ?? 0);
    const amtFmt = amt ? `฿${amt.toLocaleString('th-TH')}` : '';
    await sendLineText(
      lineUserId,
      `📷 ส่งรูปหรือไฟล์ PDF ของบิลที่ยอด ${amtFmt} มาในแชทได้เลย\n\nระบบจะอ่านและคู่กับสลิปนี้ให้อัตโนมัติ (ภายใน 30 นาที)`,
    );
    return;
  }

  if (data.startsWith('reject_match:')) {
    // User saw the combined slip+bill card but said it's not the right bill.
    // Fall back to the full candidates carousel so they can pick from others
    // or upload the correct bill.
    const intakeId = data.slice('reject_match:'.length);
    const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: intakeId, lineUserId },
    }));
    const result = intake?.ocrResult as unknown as OcrResult | null;
    if (!intake || !result) {
      await sendLineText(lineUserId, 'ไม่พบข้อมูลสลิป');
      return;
    }
    const combinedEditUrl = buildIntakeEditUrlSafe(intakeId, lineUserId, intake.companyId);
    const slipBubble = buildPaymentSlipFlexCard(result, 'pending', { intakeId, editUrl: combinedEditUrl });
    const candidateBubbles = await buildSlipCandidateBubbles(intakeId, result, intake.companyId);
    await sendLineFlexCarousel(lineUserId, 'เลือกบิลที่คู่กับสลิปนี้', [slipBubble, ...candidateBubbles].slice(0, 12));
    return;
  }

  if (data.startsWith('select_match:')) {
    const [, intakeId, type, targetId] = data.split(':');
    if (!intakeId || (type !== 'sales_invoice' && type !== 'purchase_invoice') || !targetId) {
      await sendLineText(lineUserId, 'คำสั่งไม่ถูกต้อง');
      return;
    }
    const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: intakeId, lineUserId },
    }));
    const result = intake?.ocrResult as unknown as OcrResult | null;
    if (!intake || !result) {
      await sendLineText(lineUserId, 'ไม่พบข้อมูลสลิป');
      return;
    }
    const amount = Number(result.payment?.amount ?? result.total ?? 0);
    const paidAt = result.payment?.paidAt ? new Date(result.payment.paidAt) : new Date();
    const reference = result.payment?.reference || undefined;
    const noteSuffix = `นำเข้าจากสลิปโอนเงิน LINE${result.payment?.bankName ? ` (${result.payment.bankName})` : ''}${reference ? ` ref: ${reference}` : ''}`;

    try {
      if (type === 'sales_invoice') {
        const invoice = await prisma.invoice.findFirst({
          where: { id: targetId, companyId: intake.companyId },
          include: { buyer: { select: { nameTh: true } } },
        });
        if (!invoice) {
          await sendLineText(lineUserId, '⚠️ ไม่พบใบขายที่เลือก');
          return;
        }
        await prisma.payment.create({
          data: {
            invoiceId: invoice.id,
            amount,
            method: 'transfer',
            paidAt,
            reference: reference ?? null,
            note: noteSuffix,
            createdBy: intake.userId,
            evidenceIntakeId: intake.id,
            matchScore: 100,
            matchedBy: 'manual_line',
          },
        });
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { isPaid: true, paidAmount: amount, paidAt },
        });
        await updateDocumentIntake(intake.id, {
          status: 'saved',
          ocrResult: result,
          targetType: 'sales_invoice',
          targetId: invoice.id,
        });
        await sendLineFlexMessage(
          lineUserId,
          `รับชำระ ${invoice.invoiceNumber} ฿${amount.toLocaleString('th-TH')}`,
          buildPaymentSlipFlexCard(result, 'saved', {
            matchedInvoiceNumber: invoice.invoiceNumber,
            matchedCustomerName: invoice.buyer?.nameTh ?? '',
            matchScore: 100,
            invoiceId: invoice.id,
            intakeId: intake.id,
          }),
        );
      } else {
        const purchase = await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.findFirst({
          where: { id: targetId, companyId: intake.companyId },
        }));
        if (!purchase) {
          await sendLineText(lineUserId, '⚠️ ไม่พบใบซื้อที่เลือก');
          return;
        }
        await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.update({
          where: { id: purchase.id },
          data: {
            isPaid: true,
            paidAt,
            notes: [purchase.notes, noteSuffix].filter(Boolean).join('\n'),
          },
        }));
        await updateDocumentIntake(intake.id, {
          status: 'saved',
          ocrResult: result,
          targetType: 'purchase_invoice',
          targetId: purchase.id,
          purchaseInvoiceId: purchase.id,
        });
        await sendLineFlexMessage(
          lineUserId,
          `จ่ายชำระ ${purchase.invoiceNumber} ฿${amount.toLocaleString('th-TH')}`,
          buildPaymentSlipFlexCard(result, 'saved', {
            matchedInvoiceNumber: purchase.invoiceNumber,
            matchedSupplierName: purchase.supplierName,
            matchScore: 100,
            purchaseInvoiceId: purchase.id,
            intakeId: intake.id,
          }),
        );
      }
    } catch (err) {
      logger.error('[Line] select_match failed', { err, data });
      await sendLineText(lineUserId, 'ขอโทษ จับคู่ไม่สำเร็จ กรุณาลองในหน้า Input VAT');
    }
    return;
  }

  if (data.startsWith('edit_intake:')) {
    const intakeId = data.slice('edit_intake:'.length);
    const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: intakeId, lineUserId },
    }));
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
    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
      where: { id: intakeId },
      data: { status: 'awaiting_input', error: `editintake:${fieldKey}` },
    }));
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

      await replySavedPurchase(lineUserId, ocrData, saved.id, undefined, undefined, undefined, companyId);
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
      await withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.update({
        where: { id: purchaseId },
        data: { [fieldKey]: value } as Record<string, unknown>,
      }));
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
    void persistWebhookDiagnostics();
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
    const replyOnly = lineGroupSilentModeEnabled() && isLineGroupConversation(context);
    // When the conversation is a group/room, route push fallbacks to the
    // group/room id (not the sender's private chat) so OCR responses appear
    // where the user uploaded the file.
    const pushTarget = context.lineGroupId ?? context.lineRoomId;

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
        await withLineReplyToken(event.replyToken, () => sendLineText(
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
          ),
          { replyOnly },
        );
      } else if (event.type === 'join') {
        await withLineReplyToken(event.replyToken, () => sendLineText(
            replyTargetId,
            'Billboy เข้ากลุ่มแล้วครับ\n\nให้แอดมินเข้าเว็บ Billboy → Admin → LINE → สร้างรหัสเชื่อมกลุ่ม แล้วส่งรหัส 6 หลักในกลุ่มนี้เพื่อเริ่มใช้งาน',
          ),
          { replyOnly },
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
          await withLineReplyToken(event.replyToken, () => sendLineText(
              replyTargetId,
              `ยินดีต้อนรับสมาชิกใหม่ครับ 👋\n\nกลุ่มนี้ผูกกับโปรเจค ${groupLink.project?.name ?? ''} แล้ว สมาชิกส่งเอกสารได้ทันทีแบบ LINE guest\nถ้าต้องการดูสถานะหรือเข้าทีมในระบบ ให้พิมพ์ "เข้าทีม"`,
            ),
            { replyOnly },
          );
        }
      } else if (event.type === 'message' && event.message) {
        const msg = event.message;
        if (msg.type === 'text') {
          await withLineReplyToken(event.replyToken, () => handleTextMessage(replyTargetId, (msg as LineTextMessage).text, context), { replyOnly, pushTarget });
        } else if (msg.type === 'image' || msg.type === 'file') {
          // The user explicitly uploaded a file — they expect a real response
          // (OCR summary, slip Flex card, etc). Disable silent mode for this
          // event so the smart flow can post follow-up messages via push.
          await withLineReplyToken(event.replyToken, () => handleImageMessage(replyTargetId, msg.id, msg.type, context), { replyOnly: false, pushTarget });
        }
      } else if (event.type === 'postback' && event.postback) {
        const postbackData = event.postback.data;
        // Postbacks are explicit user actions — also disable silent mode so
        // the action gets a proper response in the group.
        await withLineReplyToken(event.replyToken, () => handlePostback(replyTargetId, postbackData), { replyOnly: false, pushTarget });
      }
    } catch (err) {
      lineWebhookDiagnostics.lastUnhandledError = {
        at: new Date().toISOString(),
        eventType: event.type,
        message: err instanceof Error ? err.message : String(err),
      };
      void persistWebhookDiagnostics();
      logger.error('[Line] Unhandled webhook event error', { err, eventType: event.type, replyTargetId, senderLineUserId: event.source.userId });
      try {
        if (!replyOnly) {
          await sendLineText(replyTargetId, 'ขอโทษครับ ระบบสะดุดชั่วคราว กรุณาลองส่งใหม่อีกครั้ง 🙏');
        }
      } catch { /* ignore send failure */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Stuck-intake recovery — periodic safety net for OCR jobs the BullMQ
// worker missed or that lost their in-memory watchdog when the web dyno
// restarted mid-deploy. Runs every 60s on every web dyno; a Redis lock
// per-intake prevents the same row from being processed twice.
//
// Triggers when status is 'received' or 'processing' AND the row hasn't
// been touched in 90s. Limited to 5 intakes per tick to bound load.
// ---------------------------------------------------------------------------
const RECOVERY_INTERVAL_MS = 60_000;
const RECOVERY_STALE_THRESHOLD_MS = 90_000;
const RECOVERY_BATCH_LIMIT = 5;
const RECOVERY_LOCK_TTL_SECONDS = 180;

async function scanStuckIntakes(): Promise<void> {
  const cutoff = new Date(Date.now() - RECOVERY_STALE_THRESHOLD_MS);
  let stuck: Array<{ id: string; lineUserId: string | null }>;
  try {
    stuck = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findMany({
      where: {
        status: { in: ['received', 'processing'] },
        updatedAt: { lt: cutoff },
        lineUserId: { not: null },
      },
      orderBy: { updatedAt: 'asc' },
      take: RECOVERY_BATCH_LIMIT,
      select: { id: true, lineUserId: true },
    }));
  } catch (err) {
    logger.error('[Line] stuck-intake scan query failed', { err });
    return;
  }
  if (!stuck.length) return;

  for (const row of stuck) {
    if (!row.lineUserId) continue;
    const lockKey = `intake:recovery:${row.id}`;
    let acquired = false;
    try {
      const result = await redis.set(lockKey, '1', 'EX', RECOVERY_LOCK_TTL_SECONDS, 'NX');
      acquired = result === 'OK';
    } catch (err) {
      logger.warn('[Line] recovery lock acquire failed', { err, intakeId: row.id });
      continue;
    }
    if (!acquired) continue;

    logger.warn('[Line] recovering stuck intake', { intakeId: row.id, lineUserId: row.lineUserId });
    try {
      await processIntakeOcrPipeline({
        intakeId: row.id,
        lineUserId: row.lineUserId,
        pushTarget: row.lineUserId,
      });
    } catch (err) {
      logger.error('[Line] stuck-intake recovery failed', { err, intakeId: row.id });
    } finally {
      // Always release the recovery lock — the per-intake processing lock
      // inside processIntakeOcrPipeline is the real concurrency guard.
      // Holding the recovery lock for 180s after a no-op (e.g. when
      // processing lock was held) would create a long blackout window
      // where the user sees no progress.
      try { await redis.del(lockKey); } catch { /* ignore */ }
    }
  }
}

let recoveryLoopHandle: NodeJS.Timeout | null = null;

export function startIntakeRecoveryLoop(): void {
  if (recoveryLoopHandle) return;
  // First scan runs after one interval so we don't hammer the DB at boot
  // (when stale intakes are unlikely to have accumulated yet anyway).
  recoveryLoopHandle = setInterval(() => {
    void scanStuckIntakes().catch((err) => {
      logger.error('[Line] recovery loop tick threw', { err });
    });
  }, RECOVERY_INTERVAL_MS);
  if (recoveryLoopHandle.unref) recoveryLoopHandle.unref();
  logger.info('[Line] stuck-intake recovery loop started', {
    intervalMs: RECOVERY_INTERVAL_MS,
    staleThresholdMs: RECOVERY_STALE_THRESHOLD_MS,
  });
}
