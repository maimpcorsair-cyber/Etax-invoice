import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { auditLog } from '../services/auditService';
import { logger } from '../config/logger';
import { getLimitErrorMessage, hasFeatureAccess, resolveCompanyAccessPolicy } from '../services/accessPolicyService';
import { generateProjectExportExcel } from '../services/exportService';
import { exportProjectToSheets, isSheetsConfigured } from '../services/googleSheetsService';
import { downloadFromStorage } from '../services/storageService';
import { createZip, ZipEntryInput } from '../services/zipService';
import { sendLineText } from '../services/lineService';
import { getLineGroupMemberCount, getLineGroupSummary, getLineRoomMemberCount } from '../services/lineService';
import { buildProjectLineMemberInviteUrl } from '../services/projectLineInviteService';
import {
  ensureProjectDriveFolderForUser,
  syncDocumentIntakeToProjectDrive,
} from '../services/projectDriveSyncService';

export const projectsRouter = Router();

const statusSchema = z.enum(['active', 'on_hold', 'completed', 'archived']);
const memberRoleSchema = z.enum(['owner', 'approver', 'member', 'viewer']);
const lineProjectMemberRoleSchema = z.enum(['project_owner', 'accountant', 'approver', 'staff', 'viewer', 'line_guest', 'linked_user']);

const projectPayloadSchema = z.object({
  code: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  customerName: z.string().trim().max(160).optional().nullable(),
  budgetAmount: z.number().min(0).max(999999999999).default(0),
  status: statusSchema.default('active'),
  ownerId: z.string().min(1).optional().nullable(),
  approverId: z.string().min(1).optional().nullable(),
  startDate: z.string().min(1).optional().nullable(),
  endDate: z.string().min(1).optional().nullable(),
  memberIds: z.array(z.string().min(1)).optional().default([]),
});

const updateProjectPayloadSchema = projectPayloadSchema.partial().extend({
  memberIds: z.array(z.string().min(1)).optional(),
});

const memberPayloadSchema = z.object({
  userId: z.string().min(1),
  role: memberRoleSchema.default('member'),
});

const assignPayloadSchema = z.object({
  targetType: z.enum(['purchase_invoice', 'document_intake', 'expense_voucher', 'invoice', 'line_group']),
  targetId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
});

const documentCommentPayloadSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  kind: z.enum(['comment', 'request']).default('comment'),
});

const lineMemberRolePayloadSchema = z.object({
  role: lineProjectMemberRoleSchema,
});

const PROJECT_PORTAL_TTL = process.env.PROJECT_PORTAL_TTL ?? '7d';

function getFrontendBaseUrl() {
  const firstConfigured = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? 'https://etax-invoice.vercel.app')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);
  return (firstConfigured ?? 'https://etax-invoice.vercel.app').replace(/\/+$/, '');
}

function buildProjectPortalUrl(input: { companyId: string; projectId: string; groupLinkId: string }) {
  const token = jwt.sign(
    {
      type: 'project_guest',
      companyId: input.companyId,
      projectId: input.projectId,
      groupLinkId: input.groupLinkId,
    },
    process.env.JWT_SECRET!,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { expiresIn: PROJECT_PORTAL_TTL as any },
  );
  return `${getFrontendBaseUrl()}/project-portal/${token}`;
}

async function createProjectLineGroupOtp(input: { companyId: string; projectId: string; issuedBy: string }) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await prisma.lineOtp.deleteMany({
    where: {
      companyId: input.companyId,
      projectId: input.projectId,
      type: 'group',
      expiresAt: { lt: new Date() },
    },
  });
  await prisma.lineOtp.create({
    data: {
      otp,
      type: 'group',
      companyId: input.companyId,
      projectId: input.projectId,
      issuedBy: input.issuedBy,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  return otp;
}

function normalizeCode(input?: string | null) {
  return input?.trim().toUpperCase().replace(/\s+/g, '-') || '';
}

async function generateProjectCode(companyId: string, tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  const count = await tx.project.count({
    where: {
      companyId,
      code: { startsWith: `PRJ-${year}-` },
    },
  });
  return `PRJ-${year}-${String(count + 1).padStart(3, '0')}`;
}

async function ensureProjectUsersInCompany(
  companyId: string,
  userIds: Array<string | null | undefined>,
  tx: Prisma.TransactionClient,
) {
  const ids = [...new Set(userIds.filter(Boolean) as string[])];
  if (ids.length === 0) return;
  const count = await tx.user.count({ where: { companyId, id: { in: ids }, isActive: true } });
  if (count !== ids.length) {
    throw new Error('One or more project users are not active users in this company');
  }
}

async function ensureProjectBelongsToCompany(
  companyId: string,
  projectId: string | null,
  tx: Prisma.TransactionClient,
) {
  if (!projectId) return;
  const project = await tx.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('Project not found');
}

function asNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

async function projectBudgetSummary(companyId: string, projectId: string, tx: Prisma.TransactionClient) {
  const [purchaseAll, purchasePaid, expenseCommitted, expenseApproved, intakes] = await Promise.all([
    tx.purchaseInvoice.aggregate({
      where: { companyId, projectId },
      _sum: { total: true },
      _count: { _all: true },
    }),
    tx.purchaseInvoice.aggregate({
      where: { companyId, projectId, isPaid: true },
      _sum: { total: true },
    }),
    tx.expenseVoucher.aggregate({
      where: { companyId, projectId, status: { in: ['submitted', 'approved'] } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    tx.expenseVoucher.aggregate({
      where: { companyId, projectId, status: 'approved' },
      _sum: { totalAmount: true },
    }),
    tx.documentIntake.groupBy({
      by: ['status'],
      where: { companyId, projectId },
      _count: { _all: true },
    }),
  ]);

  const purchaseCommitted = asNumber(purchaseAll._sum.total);
  const purchasePaidAmount = asNumber(purchasePaid._sum.total);
  const expenseCommittedAmount = asNumber(expenseCommitted._sum.totalAmount);
  const expenseApprovedAmount = asNumber(expenseApproved._sum.totalAmount);
  const intakeByStatus = Object.fromEntries(intakes.map((row) => [row.status, row._count._all]));

  return {
    committedAmount: purchaseCommitted + expenseCommittedAmount,
    paidAmount: purchasePaidAmount + expenseApprovedAmount,
    purchaseCount: purchaseAll._count._all,
    expenseVoucherCount: expenseCommitted._count._all,
    documentIntakeCount: intakes.reduce((sum, row) => sum + row._count._all, 0),
    documentIntakesByStatus: intakeByStatus,
  };
}

function serializeProject(project: Prisma.ProjectGetPayload<{
  include: {
    owner: { select: { id: true; name: true; email: true; role: true } };
    approver: { select: { id: true; name: true; email: true; role: true } };
    members: { include: { user: { select: { id: true; name: true; email: true; role: true } } } };
  };
}>, summary: Awaited<ReturnType<typeof projectBudgetSummary>>) {
  const budgetAmount = asNumber(project.budgetAmount);
  const remainingAmount = budgetAmount - summary.committedAmount;
  return {
    ...project,
    budgetAmount,
    summary: {
      ...summary,
      remainingAmount,
      budgetUsedPercent: budgetAmount > 0 ? Math.round((summary.committedAmount / budgetAmount) * 1000) / 10 : 0,
      isOverBudget: budgetAmount > 0 && summary.committedAmount > budgetAmount,
    },
  };
}

function documentKind(item: { mimeType: string; ocrResult: unknown; status: string }) {
  const result = item.ocrResult as Record<string, unknown> | null;
  const type = typeof result?.documentType === 'string' ? result.documentType : '';
  const group = typeof result?.documentGroup === 'string' ? result.documentGroup : '';
  if (type || group) return type || group;
  if (item.mimeType === 'application/pdf') return 'pdf';
  if (item.mimeType.includes('image')) return 'image';
  return item.status === 'failed' ? 'unreadable' : 'unknown';
}

function missingTaxFields(result: unknown) {
  const data = result as Record<string, unknown> | null;
  if (!data) return ['ocr_result'];
  return [
    data.supplierName ? null : 'supplier_name',
    data.supplierTaxId ? null : 'supplier_tax_id',
    data.invoiceNumber ? null : 'document_number',
    data.invoiceDate ? null : 'document_date',
    data.total ? null : 'total_amount',
  ].filter(Boolean) as string[];
}

function actionNeededForIntake(item: { id: string; status: string; fileName: string | null; mimeType: string; ocrResult: unknown; warnings: unknown; error: string | null }) {
  const missing = missingTaxFields(item.ocrResult);
  if (item.status === 'failed') {
    return {
      id: `intake:${item.id}:failed`,
      severity: 'high',
      type: 'ocr_failed',
      title: item.fileName ?? 'Unreadable document',
      message: item.error ?? 'OCR could not read this file',
      documentIntakeId: item.id,
    };
  }
  if (['received', 'processing', 'awaiting_input', 'awaiting_confirmation', 'needs_review'].includes(item.status)) {
    return {
      id: `intake:${item.id}:review`,
      severity: missing.length > 0 ? 'medium' : 'low',
      type: missing.length > 0 ? 'missing_tax_fields' : 'needs_review',
      title: item.fileName ?? 'Document needs review',
      message: missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'Review and confirm this document',
      documentIntakeId: item.id,
    };
  }
  return null;
}

type TaxSafetyStatus =
  | 'vat_claimable'
  | 'expense_only_no_vat'
  | 'needs_tax_invoice'
  | 'missing_required_fields'
  | 'unmatched_payment'
  | 'supporting_only'
  | 'needs_review';

type TaxSafety = {
  status: TaxSafetyStatus;
  severity: 'ok' | 'info' | 'warning' | 'danger';
  label: string;
  message: string;
  missingFields: string[];
};

const TAX_SAFETY_RISK_STATUSES: TaxSafetyStatus[] = [
  'needs_tax_invoice',
  'missing_required_fields',
  'unmatched_payment',
  'needs_review',
];

function textField(data: Record<string, unknown> | null, key: string) {
  const value = data?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function numberField(data: Record<string, unknown> | null, key: string) {
  const value = data?.[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value.replace(/,/g, '')) || 0;
  return 0;
}

function dateField(data: Record<string, unknown> | null, key: string) {
  const value = data?.[key];
  if (value instanceof Date) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ocrSummaryForIntake(item: { ocrResult: unknown }) {
  const data = item.ocrResult as Record<string, unknown> | null;
  if (!data) return null;
  const meta = data.documentMetadata as Record<string, unknown> | undefined;
  const payment = data.payment as Record<string, unknown> | undefined;
  const amount = numberField(payment ?? null, 'amount') || numberField(data, 'total');
  const reference = textField(payment ?? null, 'reference')
    || textField(meta ?? null, 'purchaseOrderNumber')
    || textField(meta ?? null, 'quotationNumber')
    || textField(meta ?? null, 'deliveryNoteNumber')
    || textField(data, 'invoiceNumber');

  return {
    documentType: textField(data, 'documentType'),
    documentTypeLabel: textField(data, 'documentTypeLabel'),
    supplierName: textField(data, 'supplierName') || textField(meta ?? null, 'sellerName'),
    supplierTaxId: textField(data, 'supplierTaxId') || textField(meta ?? null, 'sellerTaxId'),
    invoiceNumber: textField(data, 'invoiceNumber'),
    invoiceDate: textField(data, 'invoiceDate') || textField(payment ?? null, 'paidAt'),
    total: amount || null,
    vatAmount: numberField(data, 'vatAmount') || null,
    confidence: textField(data, 'confidence'),
    taxTreatment: textField(data, 'taxTreatment'),
    postingSuggestion: textField(data, 'postingSuggestion') || textField(data, 'expenseSubcategory') || textField(data, 'expenseCategory'),
    reference,
    payment: payment
      ? {
          bankName: textField(payment, 'bankName'),
          fromName: textField(payment, 'fromName'),
          fromAccount: textField(payment, 'fromAccount'),
          toName: textField(payment, 'toName'),
          toAccount: textField(payment, 'toAccount'),
          direction: textField(payment, 'direction'),
        }
      : null,
  };
}

function normalizedReference(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9ก-๙]/gi, '');
}

function containsReference(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizedReference(left);
  const b = normalizedReference(right);
  return a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
}

function amountClose(left?: number | null, right?: number | null, tolerance = 1) {
  return typeof left === 'number' && typeof right === 'number' && left > 0 && right > 0 && Math.abs(left - right) <= tolerance;
}

function nameLooksSimilar(left?: string | null, right?: string | null) {
  if (!left || !right) return false;
  const a = left.toLowerCase().trim();
  const b = right.toLowerCase().trim();
  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  return short.length >= 6 && long.includes(short.slice(0, 12));
}

function intakeFacts(item: { id: string; createdAt: Date; taxSafety: TaxSafety; ocrResult: unknown }) {
  const data = item.ocrResult as Record<string, unknown> | null;
  const meta = data?.documentMetadata as Record<string, unknown> | undefined;
  const payment = data?.payment as Record<string, unknown> | undefined;
  const amount = numberField(data, 'total') || numberField(data, 'amount') || numberField(data, 'paymentAmount');
  const paymentAmount = amount || numberField(payment ?? null, 'amount');
  const supplierName = textField(data, 'supplierName') || textField(payment ?? null, 'receiverName') || textField(payment ?? null, 'toName');
  const referenceNumber = textField(meta ?? null, 'purchaseOrderNumber')
    || textField(meta ?? null, 'quotationNumber')
    || textField(meta ?? null, 'deliveryNoteNumber')
    || textField(data, 'invoiceNumber')
    || textField(payment ?? null, 'reference');
  const documentDate = dateField(data, 'invoiceDate') || dateField(data, 'paymentDate') || dateField(payment ?? null, 'date') || item.createdAt;
  const role = item.taxSafety.status === 'unmatched_payment'
    ? 'payment_proof'
    : item.taxSafety.status === 'supporting_only'
      ? 'supporting_document'
      : 'tax_document';
  return { amount: paymentAmount || null, supplierName: supplierName || null, referenceNumber: referenceNumber || null, documentDate, role };
}

function purchaseOrderFromIntake(item: {
  id: string;
  fileName: string | null;
  ocrResult: unknown;
  createdAt: Date;
}) {
  const data = item.ocrResult as Record<string, unknown> | null;
  const meta = data?.documentMetadata as Record<string, unknown> | undefined;
  if (!data) return null;

  const documentType = textField(data, 'documentType').toLowerCase();
  const documentGroup = textField(data, 'documentGroup').toLowerCase();
  const poNumber = textField(meta ?? null, 'purchaseOrderNumber');
  const quotationNumber = textField(meta ?? null, 'quotationNumber');
  const deliveryNoteNumber = textField(meta ?? null, 'deliveryNoteNumber');
  const supportingType = poNumber
    ? 'purchase_order'
    : quotationNumber
      ? 'quotation'
      : deliveryNoteNumber
        ? 'delivery_note'
        : documentType.includes('contract') || documentGroup.includes('contract')
          ? 'contract'
          : '';
  const isSupporting = supportingType
    || ['purchase_order', 'po', 'quotation', 'delivery_note', 'contract'].some((token) =>
      documentType.includes(token) || documentGroup.includes(token),
    );
  if (!isSupporting) return null;

  const reference = poNumber || quotationNumber || deliveryNoteNumber || textField(data, 'invoiceNumber');
  if (!reference || normalizedReference(reference).length < 3) return null;

  return {
    poNumber: reference,
    documentType: supportingType || documentType || documentGroup || 'purchase_order',
    vendorName: textField(data, 'supplierName') || null,
    vendorTaxId: textField(data, 'supplierTaxId') || textField(meta ?? null, 'sellerTaxId') || null,
    issueDate: dateField(data, 'invoiceDate') ?? item.createdAt,
    subtotal: numberField(data, 'subtotal') || null,
    vatAmount: numberField(data, 'vatAmount') || null,
    total: numberField(data, 'total') || numberField(data, 'amount') || null,
    metadata: {
      sourceFileName: item.fileName,
      documentIntakeId: item.id,
      purchaseOrderNumber: poNumber || null,
      quotationNumber: quotationNumber || null,
      deliveryNoteNumber: deliveryNoteNumber || null,
    },
  };
}

async function syncProjectPurchaseOrdersFromIntakes(
  companyId: string,
  projectId: string,
  intakes: Array<{ id: string; fileName: string | null; ocrResult: unknown; createdAt: Date }>,
  tx: Prisma.TransactionClient,
) {
  const extracted = intakes
    .map((item) => ({ item, po: purchaseOrderFromIntake(item) }))
    .filter((entry): entry is { item: typeof entry.item; po: NonNullable<ReturnType<typeof purchaseOrderFromIntake>> } => Boolean(entry.po));

  if (extracted.length === 0) return;

  await tx.projectPurchaseOrder.createMany({
    data: extracted.map(({ item, po }) => ({
        companyId,
        projectId,
        documentIntakeId: item.id,
        poNumber: po.poNumber,
        documentType: po.documentType,
        vendorName: po.vendorName,
        vendorTaxId: po.vendorTaxId,
        issueDate: po.issueDate,
        subtotal: po.subtotal,
        vatAmount: po.vatAmount,
        total: po.total,
        metadata: po.metadata,
      })),
    skipDuplicates: true,
  });
}

function taxSafetyForIntake(item: {
  status: string;
  mimeType: string;
  ocrResult: unknown;
  targetType?: string | null;
  targetId?: string | null;
  purchaseInvoiceId?: string | null;
}): TaxSafety {
  if (item.status === 'failed') {
    return {
      status: 'needs_review',
      severity: 'danger',
      label: 'Unreadable',
      message: 'OCR could not read this document. Upload a clearer file before using it for tax.',
      missingFields: ['ocr_result'],
    };
  }

  const data = item.ocrResult as Record<string, unknown> | null;
  const documentType = textField(data, 'documentType').toLowerCase();
  const documentGroup = textField(data, 'documentGroup').toLowerCase();
  const taxTreatment = textField(data, 'taxTreatment').toLowerCase();
  const hasLinkedRecord = Boolean(item.purchaseInvoiceId || (item.targetType && item.targetId));
  const isPayment = ['bank_transfer', 'payment_slip', 'payment_advice', 'slip'].some((token) =>
    documentType.includes(token) || documentGroup.includes(token),
  );
  if (isPayment) {
    return hasLinkedRecord
      ? {
          status: 'supporting_only',
          severity: 'info',
          label: 'Payment support',
          message: 'Use this as payment evidence. Match it with a tax invoice before claiming input VAT.',
          missingFields: [],
        }
      : {
          status: 'unmatched_payment',
          severity: 'warning',
          label: 'Unmatched payment',
          message: 'This looks like a payment slip. Link it to the purchase or voucher it paid for.',
          missingFields: ['linked_purchase_or_voucher'],
        };
  }

  const supportingKeywords = ['purchase_order', 'po', 'quotation', 'delivery_note', 'contract', 'estimate'];
  if (supportingKeywords.some((token) => documentType.includes(token) || documentGroup.includes(token))) {
    return {
      status: 'supporting_only',
      severity: 'info',
      label: 'Supporting document',
      message: 'Useful for project evidence, but not enough for input VAT claim by itself.',
      missingFields: [],
    };
  }

  const missing = missingTaxFields(item.ocrResult);
  const vatAmount = numberField(data, 'vatAmount');
  const total = numberField(data, 'total');
  const isExpenseOnlyCandidate = total > 0 && (
    documentType.includes('expense_receipt')
    || taxTreatment === 'vat_exempt'
    || taxTreatment === 'non_deductible'
    || taxTreatment === 'needs_review'
  ) && vatAmount <= 0;
  if (isExpenseOnlyCandidate) {
    return {
      status: 'expense_only_no_vat',
      severity: 'info',
      label: 'Expense only',
      message: 'Record this as an expense voucher/project cost. Do not claim input VAT unless a valid tax invoice is attached.',
      missingFields: missing.filter((field) => !['supplier_tax_id', 'document_number'].includes(field)),
    };
  }
  if (missing.length > 0) {
    return {
      status: total > 0 ? 'missing_required_fields' : 'needs_review',
      severity: 'warning',
      label: total > 0 ? 'Missing tax fields' : 'Needs review',
      message: `Missing required tax data: ${missing.join(', ')}`,
      missingFields: missing,
    };
  }
  if (vatAmount > 0) {
    return {
      status: 'vat_claimable',
      severity: 'ok',
      label: 'Input VAT ready',
      message: 'Required tax invoice fields and VAT amount were detected.',
      missingFields: [],
    };
  }
  return {
    status: 'expense_only_no_vat',
    severity: 'info',
    label: 'Expense only',
    message: 'Record this as expense evidence, but do not claim input VAT unless a valid tax invoice is attached.',
    missingFields: [],
  };
}

function taxSafetyForPurchase(item: {
  supplierName: string | null;
  supplierTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | string | null;
  vatType: string;
  vatAmount: Prisma.Decimal | number;
  total: Prisma.Decimal | number;
}): TaxSafety {
  const missing = [
    item.supplierName ? null : 'supplier_name',
    item.supplierTaxId ? null : 'supplier_tax_id',
    item.invoiceNumber ? null : 'document_number',
    item.invoiceDate ? null : 'document_date',
    asNumber(item.total) > 0 ? null : 'total_amount',
  ].filter(Boolean) as string[];
  const vatAmount = asNumber(item.vatAmount);
  if (missing.length > 0) {
    return {
      status: 'missing_required_fields',
      severity: 'warning',
      label: 'Missing tax fields',
      message: `Missing required tax data: ${missing.join(', ')}`,
      missingFields: missing,
    };
  }
  if (item.vatType === 'vat7' && vatAmount > 0) {
    return {
      status: 'vat_claimable',
      severity: 'ok',
      label: 'Input VAT ready',
      message: 'This purchase has the required tax invoice fields for input VAT review.',
      missingFields: [],
    };
  }
  if (item.vatType === 'vat7' && vatAmount <= 0) {
    return {
      status: 'needs_tax_invoice',
      severity: 'warning',
      label: 'VAT unclear',
      message: 'VAT type is 7% but VAT amount is zero. Check the source document.',
      missingFields: ['vat_amount'],
    };
  }
  return {
    status: 'expense_only_no_vat',
    severity: 'info',
    label: 'No input VAT',
    message: 'Keep as expense evidence; do not include in input VAT claim.',
    missingFields: [],
  };
}

function summarizeTaxSafety(items: Array<TaxSafety & { vatAmount?: number }>) {
  const byStatus = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    taxSafetyRiskCount: items.filter((item) => TAX_SAFETY_RISK_STATUSES.includes(item.status)).length,
    claimableVat: items.reduce((sum, item) => sum + (item.status === 'vat_claimable' ? item.vatAmount ?? 0 : 0), 0),
    taxSafetyByStatus: byStatus,
  };
}

function smartMatchForIntake(
  item: {
    id: string;
    fileName: string | null;
    createdAt: Date;
    status: string;
    ocrResult: unknown;
    taxSafety: TaxSafety;
    targetType?: string | null;
    targetId?: string | null;
    purchaseInvoiceId?: string | null;
  },
  purchases: Array<{
    id: string;
    supplierName: string;
    invoiceNumber: string;
    invoiceDate: Date;
    total: number;
    isPaid: boolean;
  }>,
  purchaseOrders: Array<{
    id: string;
    poNumber: string;
    documentType: string;
    vendorName: string | null;
    issueDate: Date | null;
    total: number | null;
    status: string;
  }>,
) {
  if (item.purchaseInvoiceId || (item.targetType && item.targetId)) return null;
  if (!TAX_SAFETY_RISK_STATUSES.includes(item.taxSafety.status) && item.taxSafety.status !== 'supporting_only') return null;

  const facts = intakeFacts(item);

  const candidates = purchases
    .map((purchase) => {
      let score = 0;
      const reasons: string[] = [];
      if (amountClose(facts.amount, purchase.total)) {
        score += 60;
        reasons.push('amount');
      }
      if (nameLooksSimilar(facts.supplierName, purchase.supplierName)) {
        score += 25;
        reasons.push('supplier');
      }
      if (containsReference(facts.referenceNumber, purchase.invoiceNumber)) {
        score += 25;
        reasons.push('reference');
      }
      const poSupport = purchaseOrders.find((po) =>
        containsReference(facts.referenceNumber, po.poNumber)
        || amountClose(facts.amount, po.total)
        || nameLooksSimilar(facts.supplierName, po.vendorName),
      );
      if (poSupport && (amountClose(purchase.total, poSupport.total) || nameLooksSimilar(purchase.supplierName, poSupport.vendorName))) {
        score += 20;
        reasons.push('po');
      }
      const dayDiff = Math.abs((purchase.invoiceDate.getTime() - facts.documentDate.getTime()) / 86400000);
      if (dayDiff <= 14) {
        score += Math.max(0, 15 - Math.round(dayDiff));
        reasons.push('date');
      }
      return {
        id: purchase.id,
        supplierName: purchase.supplierName,
        invoiceNumber: purchase.invoiceNumber,
        invoiceDate: purchase.invoiceDate,
        total: purchase.total,
        isPaid: purchase.isPaid,
        score,
        reasons,
      };
    })
    .filter((candidate) => candidate.score >= 25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const poCandidates = purchaseOrders
    .map((po) => {
      let score = 0;
      const reasons: string[] = [];
      if (containsReference(facts.referenceNumber, po.poNumber)) {
        score += 70;
        reasons.push('reference');
      }
      if (amountClose(facts.amount, po.total)) {
        score += 35;
        reasons.push('amount');
      }
      if (nameLooksSimilar(facts.supplierName, po.vendorName)) {
        score += 25;
        reasons.push('vendor');
      }
      if (po.issueDate) {
        const dayDiff = Math.abs((po.issueDate.getTime() - facts.documentDate.getTime()) / 86400000);
        if (dayDiff <= 30) {
          score += Math.max(0, 15 - Math.round(dayDiff / 2));
          reasons.push('date');
        }
      }
      return {
        id: po.id,
        poNumber: po.poNumber,
        documentType: po.documentType,
        vendorName: po.vendorName,
        issueDate: po.issueDate,
        total: po.total,
        status: po.status,
        score,
        reasons,
      };
    })
    .filter((candidate) => candidate.score >= 25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    id: `intake:${item.id}`,
    documentIntakeId: item.id,
    fileName: item.fileName,
    status: item.status,
    documentRole: facts.role,
    taxSafety: item.taxSafety,
    amount: facts.amount,
    supplierName: facts.supplierName,
    referenceNumber: facts.referenceNumber,
    documentDate: facts.documentDate,
    candidates,
    poCandidates,
    threeWay: {
      hasPo: poCandidates.length > 0 || facts.role === 'supporting_document',
      hasTaxInvoice: candidates.length > 0 || facts.role === 'tax_document',
      hasPaymentProof: facts.role === 'payment_proof',
    },
  };
}

function purchaseOrderHealth(
  po: {
    id: string;
    poNumber: string;
    documentType: string;
    vendorName: string | null;
    vendorTaxId?: string | null;
    issueDate: Date | null;
    total: number | null;
    status: string;
  },
  purchases: Array<{ id: string; supplierName: string; invoiceNumber: string; invoiceDate: Date; total: number; isPaid: boolean }>,
  intakes: Array<{ id: string; fileName: string | null; createdAt: Date; ocrResult: unknown; taxSafety: TaxSafety }>,
) {
  const purchaseMatches = purchases
    .filter((purchase) =>
      containsReference(purchase.invoiceNumber, po.poNumber)
      || (amountClose(purchase.total, po.total) && nameLooksSimilar(purchase.supplierName, po.vendorName)),
    )
    .map((purchase) => ({ id: purchase.id, supplierName: purchase.supplierName, invoiceNumber: purchase.invoiceNumber, total: purchase.total, isPaid: purchase.isPaid }));
  const paymentMatches = intakes
    .filter((item) => {
      const facts = intakeFacts(item);
      return facts.role === 'payment_proof' && (
        containsReference(facts.referenceNumber, po.poNumber)
        || amountClose(facts.amount, po.total)
        || nameLooksSimilar(facts.supplierName, po.vendorName)
      );
    })
    .map((item) => ({ id: item.id, fileName: item.fileName }));
  const missing = [
    purchaseMatches.length === 0 ? 'tax_invoice' : null,
    paymentMatches.length === 0 ? 'payment_proof' : null,
  ].filter(Boolean) as string[];
  return {
    ...po,
    matchedPurchaseCount: purchaseMatches.length,
    matchedPaymentCount: paymentMatches.length,
    purchaseMatches: purchaseMatches.slice(0, 3),
    paymentMatches: paymentMatches.slice(0, 3),
    missing,
    threeWayStatus: missing.length === 0 ? 'complete' : 'incomplete',
  };
}

function safeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 160) || 'untitled';
}

projectsRouter.get('/users', async (req, res) => {
  try {
    const users = await withRlsContext(prisma, tenantRlsContext(req.user!), (tx) =>
      tx.user.findMany({
        where: { companyId: req.user!.companyId, isActive: true },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, email: true, role: true },
      }),
    );
    res.json({ data: users });
  } catch (err) {
    logger.error('Failed to list project users', { error: err });
    res.status(500).json({ error: 'Failed to fetch project users' });
  }
});

projectsRouter.get('/', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const status = typeof req.query.status === 'string' ? req.query.status : 'active';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const projects = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const where: Prisma.ProjectWhereInput = { companyId };
      if (status !== 'all') where.status = status as never;
      if (search) {
        where.OR = [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { customerName: { contains: search, mode: 'insensitive' } },
        ];
      }

      const rows = await tx.project.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true, role: true } },
          approver: { select: { id: true, name: true, email: true, role: true } },
          members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        take: 200,
      });

      return Promise.all(rows.map(async (project) => serializeProject(project, await projectBudgetSummary(companyId, project.id, tx))));
    });

    res.json({ data: projects });
  } catch (err) {
    logger.error('Failed to list projects', { error: err });
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

projectsRouter.get('/:id', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const project = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const row = await tx.project.findFirst({
        where: { id: req.params.id, companyId },
        include: {
          owner: { select: { id: true, name: true, email: true, role: true } },
          approver: { select: { id: true, name: true, email: true, role: true } },
          members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        },
      });
      if (!row) return null;
      return serializeProject(row, await projectBudgetSummary(companyId, row.id, tx));
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ data: project });
  } catch (err) {
    logger.error('Failed to get project', { error: err });
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

projectsRouter.get('/:id/workspace', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const data = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const row = await tx.project.findFirst({
        where: { id: req.params.id, companyId },
        include: {
          owner: { select: { id: true, name: true, email: true, role: true } },
          approver: { select: { id: true, name: true, email: true, role: true } },
          members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        },
      });
      if (!row) return null;

      const [summary, documentIntakes, purchaseInvoices, invoices, expenseVouchers, lineGroups] = await Promise.all([
        projectBudgetSummary(companyId, row.id, tx),
        tx.documentIntake.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            id: true,
            source: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            fileUrl: true,
            driveFileId: true,
            driveUrl: true,
            driveFolderId: true,
            driveFolderUrl: true,
            driveSyncStatus: true,
            driveSyncError: true,
            driveSyncedAt: true,
            driveUserDrive: true,
            status: true,
            ocrResult: true,
            warnings: true,
            error: true,
            targetType: true,
            targetId: true,
            purchaseInvoiceId: true,
            processedAt: true,
            createdAt: true,
            updatedAt: true,
            comments: {
              orderBy: { createdAt: 'desc' },
              take: 3,
              select: {
                id: true,
                authorType: true,
                authorName: true,
                kind: true,
                status: true,
                message: true,
                createdAt: true,
              },
            },
            _count: {
              select: {
                comments: true,
              },
            },
          },
        }),
        tx.purchaseInvoice.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { invoiceDate: 'desc' },
          take: 100,
          select: {
            id: true,
            supplierName: true,
            supplierTaxId: true,
            invoiceNumber: true,
            invoiceDate: true,
            dueDate: true,
            subtotal: true,
            vatAmount: true,
            total: true,
            vatType: true,
            description: true,
            category: true,
            pdfUrl: true,
            isPaid: true,
            paidAt: true,
            createdAt: true,
          },
        }),
        tx.invoice.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { invoiceDate: 'desc' },
          take: 100,
          select: {
            id: true,
            invoiceNumber: true,
            type: true,
            status: true,
            invoiceDate: true,
            dueDate: true,
            subtotal: true,
            vatAmount: true,
            total: true,
            pdfUrl: true,
            isPaid: true,
            paidAt: true,
            buyer: { select: { id: true, nameTh: true, nameEn: true } },
          },
        }),
        tx.expenseVoucher.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { voucherDate: 'desc' },
          take: 100,
          select: {
            id: true,
            voucherNumber: true,
            status: true,
            voucherDate: true,
            description: true,
            totalAmount: true,
            submittedAt: true,
            approvedAt: true,
            rejectedAt: true,
            createdAt: true,
          },
        }),
        tx.lineGroupLink.findMany({
          where: { companyId, projectId: row.id, isActive: true },
          orderBy: { linkedAt: 'desc' },
          select: {
            id: true,
            sourceType: true,
            groupName: true,
            pictureUrl: true,
            memberCount: true,
            lastMessageAt: true,
            lastSenderDisplayName: true,
            lastSyncedAt: true,
            linkedAt: true,
            members: {
              orderBy: [{ lastSeenAt: 'desc' }],
              take: 50,
              select: {
                id: true,
                lineUserId: true,
                displayName: true,
                pictureUrl: true,
                role: true,
                documentCount: true,
                lastSeenAt: true,
                linkedUser: { select: { id: true, name: true, email: true, role: true } },
              },
            },
          },
        }),
      ]);

      let purchaseOrders: Array<{
        id: string;
        poNumber: string;
        documentType: string;
        vendorName: string | null;
        vendorTaxId: string | null;
        issueDate: Date | null;
        expectedDate: Date | null;
        subtotal: number | null;
        vatAmount: number | null;
        total: number | null;
        currency: string;
        status: string;
        source: string;
        documentIntakeId: string | null;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      try {
        await syncProjectPurchaseOrdersFromIntakes(companyId, row.id, documentIntakes, tx);
        purchaseOrders = await tx.projectPurchaseOrder.findMany({
          where: { companyId, projectId: row.id },
          orderBy: [{ issueDate: 'desc' }, { updatedAt: 'desc' }],
          take: 100,
          select: {
            id: true,
            poNumber: true,
            documentType: true,
            vendorName: true,
            vendorTaxId: true,
            issueDate: true,
            expectedDate: true,
            subtotal: true,
            vatAmount: true,
            total: true,
            currency: true,
            status: true,
            source: true,
            documentIntakeId: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      } catch (poErr) {
        logger.warn('Project workspace PO/3-way section unavailable; continuing without PO rows', {
          error: poErr instanceof Error ? poErr.message : String(poErr),
          projectId: row.id,
          companyId,
        });
      }

      const project = serializeProject(row, summary);
      const purchaseTotal = purchaseInvoices.reduce((sum, item) => sum + asNumber(item.total), 0);
      const purchaseVat = purchaseInvoices.reduce((sum, item) => sum + asNumber(item.vatAmount), 0);
      const revenueTotal = invoices.reduce((sum, item) => sum + asNumber(item.total), 0);
      const expenseTotal = expenseVouchers.reduce((sum, item) => sum + asNumber(item.totalAmount), 0);
      const documentIntakeRows = documentIntakes.map((item) => ({
        ...item,
        commentCount: item._count.comments,
        comments: item.comments.reverse(),
        kind: documentKind(item),
        ocrSummary: ocrSummaryForIntake(item),
        taxSafety: taxSafetyForIntake(item),
      }));
      const purchaseInvoiceRows = purchaseInvoices.map((item) => {
        const taxSafety = taxSafetyForPurchase(item);
        return {
          ...item,
          subtotal: asNumber(item.subtotal),
          vatAmount: asNumber(item.vatAmount),
          total: asNumber(item.total),
          taxSafety,
        };
      });
      const purchaseOrderRows = purchaseOrders.map((item) => ({
        ...item,
        subtotal: item.subtotal ?? null,
        vatAmount: item.vatAmount ?? null,
        total: item.total ?? null,
      }));
      const purchaseOrderHealthRows = purchaseOrderRows.map((item) => purchaseOrderHealth(item, purchaseInvoiceRows, documentIntakeRows));
      const taxSafetySummary = summarizeTaxSafety([
        ...documentIntakeRows.map((item) => item.taxSafety),
        ...purchaseInvoiceRows.map((item) => ({ ...item.taxSafety, vatAmount: item.vatAmount })),
      ]);
      const smartMatches = documentIntakeRows
        .map((item) => smartMatchForIntake(item, purchaseInvoiceRows, purchaseOrderRows))
        .filter((item): item is NonNullable<ReturnType<typeof smartMatchForIntake>> => item !== null);
      const actionNeeded = documentIntakeRows
        .map(actionNeededForIntake)
        .filter((item): item is NonNullable<ReturnType<typeof actionNeededForIntake>> => item !== null);
      const taxSafetyActions = documentIntakeRows
        .filter((item) => TAX_SAFETY_RISK_STATUSES.includes(item.taxSafety.status))
        .map((item) => ({
          id: `intake:${item.id}:tax-safety`,
          severity: item.taxSafety.severity === 'danger' ? 'high' as const : 'medium' as const,
          type: item.taxSafety.status,
          title: item.fileName ?? 'Document needs tax review',
          message: item.taxSafety.message,
          documentIntakeId: item.id,
        }));
      const allActionNeeded = [...actionNeeded, ...taxSafetyActions];
      const lineGroupsWithMemberInvites = lineGroups.map((group) => ({
        ...group,
        members: group.members.map((member) => ({
          ...member,
          joinUrl: member.linkedUser
            ? null
            : buildProjectLineMemberInviteUrl({
                companyId,
                projectId: row.id,
                lineGroupLinkId: group.id,
                lineProjectMemberId: member.id,
                lineUserId: member.lineUserId,
              }),
        })),
      }));

      return {
        project,
        workspaceSummary: {
          purchaseTotal,
          purchaseVat,
          revenueTotal,
          expenseTotal,
          estimatedMargin: revenueTotal - purchaseTotal - expenseTotal,
          actionNeededCount: allActionNeeded.length,
          filesCount: documentIntakes.length,
          lineGroupCount: lineGroups.length,
          purchaseOrderCount: purchaseOrderRows.length,
          purchaseOrderGapCount: purchaseOrderHealthRows.filter((item) => item.threeWayStatus !== 'complete').length,
          smartMatchCount: smartMatches.length,
          ...taxSafetySummary,
        },
        actionNeeded: allActionNeeded,
        smartMatches,
        purchaseOrders: purchaseOrderHealthRows,
        documentIntakes: documentIntakeRows,
        purchaseInvoices: purchaseInvoiceRows,
        invoices: invoices.map((item) => ({
          ...item,
          subtotal: asNumber(item.subtotal),
          vatAmount: asNumber(item.vatAmount),
          total: asNumber(item.total),
        })),
        expenseVouchers: expenseVouchers.map((item) => ({ ...item, totalAmount: asNumber(item.totalAmount) })),
        lineGroups: lineGroupsWithMemberInvites,
        driveFolder: row.driveFolderId && row.driveFolderUrl
          ? { id: row.driveFolderId, url: row.driveFolderUrl }
          : null,
      };
    });
    if (!data) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ data });
  } catch (err) {
    logger.error('Failed to get project workspace', { error: err });
    res.status(500).json({
      error: 'Failed to fetch project workspace',
      ...(req.user?.role === 'super_admin' && req.query.debug === '1'
        ? { details: err instanceof Error ? err.message : String(err) }
        : {}),
    });
  }
});

projectsRouter.post('/:id/line/link-start', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const project = await withRlsContext(prisma, tenantRlsContext(req.user!), (tx) =>
      tx.project.findFirst({
        where: { id: req.params.id, companyId },
        select: { id: true, code: true, name: true },
      }),
    );
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const otp = await createProjectLineGroupOtp({
      companyId,
      projectId: project.id,
      issuedBy: req.user!.userId,
    });

    res.json({
      data: {
        otp,
        expiresInSeconds: 600,
        command: `ผูกโปรเจค ${otp}`,
        project,
      },
    });
  } catch (err) {
    logger.error('Failed to create project LINE group link OTP', { error: err, projectId: req.params.id });
    res.status(500).json({ error: 'Failed to generate LINE group link code' });
  }
});

projectsRouter.post('/:id/line/groups/:groupLinkId/refresh', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const group = await tx.lineGroupLink.findFirst({
        where: { id: req.params.groupLinkId, companyId, projectId: req.params.id, isActive: true },
        select: { id: true, lineGroupId: true, sourceType: true },
      });
      if (!group) return null;

      const [summary, memberCount] = await Promise.all([
        group.sourceType === 'room' ? Promise.resolve(null) : getLineGroupSummary(group.lineGroupId),
        group.sourceType === 'room' ? getLineRoomMemberCount(group.lineGroupId) : getLineGroupMemberCount(group.lineGroupId),
      ]);

      return tx.lineGroupLink.update({
        where: { id: group.id },
        data: {
          groupName: summary?.groupName ?? undefined,
          pictureUrl: summary?.pictureUrl ?? undefined,
          memberCount: memberCount ?? undefined,
          lastSyncedAt: new Date(),
        },
        select: {
          id: true,
          sourceType: true,
          groupName: true,
          pictureUrl: true,
          memberCount: true,
          lastMessageAt: true,
          lastSenderDisplayName: true,
          lastSyncedAt: true,
          linkedAt: true,
        },
      });
    });
    if (!updated) {
      res.status(404).json({ error: 'LINE group not found for this project' });
      return;
    }
    res.json({ data: updated });
  } catch (err) {
    logger.error('Failed to refresh project LINE group', { error: err, projectId: req.params.id, groupLinkId: req.params.groupLinkId });
    res.status(500).json({ error: 'Failed to refresh LINE group info' });
  }
});

projectsRouter.patch('/:id/line/members/:memberId', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = lineMemberRolePayloadSchema.parse(req.body);
    const companyId = req.user!.companyId;
    const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), (tx) =>
      tx.lineProjectMember.updateMany({
        where: {
          id: req.params.memberId,
          companyId,
          projectId: req.params.id,
        },
        data: { role: body.role },
      }),
    );
    if (updated.count === 0) {
      res.status(404).json({ error: 'LINE project member not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to update project LINE member role', { error: err, projectId: req.params.id, memberId: req.params.memberId });
    res.status(500).json({ error: 'Failed to update LINE member role' });
  }
});

projectsRouter.post('/:id/drive/folder', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const folder = await ensureProjectDriveFolderForUser({
      companyId: req.user!.companyId,
      projectId: req.params.id,
      userId: req.user!.userId,
    });
    if (!folder) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ data: folder });
  } catch (err) {
    logger.error('Failed to ensure project Drive folder', { error: err, projectId: req.params.id });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create project Drive folder' });
  }
});

projectsRouter.post('/:id/documents/:documentIntakeId/drive/retry', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const document = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => tx.documentIntake.findFirst({
      where: {
        id: req.params.documentIntakeId,
        companyId: req.user!.companyId,
        projectId: req.params.id,
      },
      select: { id: true },
    }));
    if (!document) {
      res.status(404).json({ error: 'Project document not found' });
      return;
    }
    await syncDocumentIntakeToProjectDrive(document.id, {
      companyId: req.user!.companyId,
      preferredUserId: req.user!.userId,
      force: true,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to retry project document Drive sync', { error: err, projectId: req.params.id, documentIntakeId: req.params.documentIntakeId });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to retry Drive sync' });
  }
});

projectsRouter.post('/:id/documents/:documentIntakeId/comments', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = documentCommentPayloadSchema.parse(req.body);
    const companyId = req.user!.companyId;
    const created = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const document = await tx.documentIntake.findFirst({
        where: {
          id: req.params.documentIntakeId,
          companyId,
          projectId: req.params.id,
        },
        select: { id: true, projectId: true, fileName: true },
      });
      if (!document?.projectId) return null;

      return tx.documentComment.create({
        data: {
          companyId,
          projectId: document.projectId,
          documentIntakeId: document.id,
          authorType: 'user',
          authorUserId: req.user!.userId,
          authorName: req.user!.email,
          kind: body.kind,
          status: 'open',
          message: body.message,
        },
      });
    });

    if (!created) {
      res.status(404).json({ error: 'Project document not found' });
      return;
    }

    void (async () => {
      try {
        const groups = await prisma.lineGroupLink.findMany({
          where: { companyId, projectId: req.params.id, isActive: true },
          select: {
            id: true,
            lineGroupId: true,
            groupName: true,
            project: { select: { code: true, name: true } },
          },
        });
        await Promise.allSettled(groups.map((group) => {
          const portalUrl = buildProjectPortalUrl({ companyId, projectId: req.params.id, groupLinkId: group.id });
          const projectLabel = group.project ? `${group.project.code} ${group.project.name}` : req.params.id;
          const text = [
            `📌 Billboy ขอเอกสารเพิ่มในโปรเจค ${projectLabel}`,
            '',
            body.message,
            '',
            'เปิดลิงก์เพื่อดูรายละเอียด ตอบกลับ หรือแนบไฟล์เพิ่ม:',
            portalUrl,
          ].join('\n');
          return sendLineText(group.lineGroupId, text);
        }));
      } catch (notifyErr) {
        logger.warn('Failed to send LINE project document request notification', { error: notifyErr, projectId: req.params.id, documentIntakeId: req.params.documentIntakeId });
      }
    })();

    await auditLog({
      companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'project.document_comment.create',
      resourceType: 'document_intake',
      resourceId: req.params.documentIntakeId,
      details: { projectId: req.params.id, commentId: created.id, kind: created.kind },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.status(201).json({ data: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to create project document comment', { error: err });
    res.status(500).json({ error: 'Failed to create project document comment' });
  }
});

projectsRouter.patch('/:id/documents/:documentIntakeId/comments/:commentId/resolve', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const comment = await tx.documentComment.findFirst({
        where: {
          id: req.params.commentId,
          companyId,
          projectId: req.params.id,
          documentIntakeId: req.params.documentIntakeId,
        },
        select: { id: true },
      });
      if (!comment) return null;
      return tx.documentComment.update({
        where: { id: comment.id },
        data: { status: 'resolved' },
      });
    });

    if (!updated) {
      res.status(404).json({ error: 'Project document comment not found' });
      return;
    }

    res.json({ data: updated });
  } catch (err) {
    logger.error('Failed to resolve project document comment', { error: err });
    res.status(500).json({ error: 'Failed to resolve project document comment' });
  }
});

projectsRouter.get('/:id/export/excel', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const exportData = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const row = await tx.project.findFirst({
        where: { id: req.params.id, companyId },
        include: {
          owner: { select: { name: true } },
          approver: { select: { name: true } },
        },
      });
      if (!row) return null;

      const [summary, documentIntakes, purchaseInvoices, invoices, expenseVouchers, lineGroups] = await Promise.all([
        projectBudgetSummary(companyId, row.id, tx),
        tx.documentIntake.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { createdAt: 'desc' },
          take: 1000,
          select: {
            id: true,
            source: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            status: true,
            ocrResult: true,
            warnings: true,
            error: true,
            targetType: true,
            targetId: true,
            purchaseInvoiceId: true,
            createdAt: true,
            driveUrl: true,
            driveSyncStatus: true,
            driveFolderUrl: true,
          },
        }),
        tx.purchaseInvoice.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { invoiceDate: 'desc' },
          take: 1000,
          select: {
            id: true,
            supplierName: true,
            supplierTaxId: true,
            invoiceNumber: true,
            invoiceDate: true,
            vatType: true,
            subtotal: true,
            vatAmount: true,
            total: true,
            isPaid: true,
          },
        }),
        tx.invoice.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { invoiceDate: 'desc' },
          take: 1000,
          select: {
            invoiceNumber: true,
            type: true,
            status: true,
            invoiceDate: true,
            subtotal: true,
            vatAmount: true,
            total: true,
            isPaid: true,
            buyer: { select: { nameTh: true, nameEn: true } },
          },
        }),
        tx.expenseVoucher.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { voucherDate: 'desc' },
          take: 1000,
          select: {
            voucherNumber: true,
            status: true,
            voucherDate: true,
            description: true,
            totalAmount: true,
          },
        }),
        tx.lineGroupLink.findMany({
          where: { companyId, projectId: row.id, isActive: true },
          orderBy: { linkedAt: 'desc' },
          select: { groupName: true, linkedAt: true },
        }),
      ]);

      const purchaseTotal = purchaseInvoices.reduce((sum, item) => sum + asNumber(item.total), 0);
      const purchaseVat = purchaseInvoices.reduce((sum, item) => sum + asNumber(item.vatAmount), 0);
      const revenueTotal = invoices.reduce((sum, item) => sum + asNumber(item.total), 0);
      const expenseTotal = expenseVouchers.reduce((sum, item) => sum + asNumber(item.totalAmount), 0);
      const actionNeeded = documentIntakes
        .map(actionNeededForIntake)
        .filter((item): item is NonNullable<ReturnType<typeof actionNeededForIntake>> => item !== null);
      const fileRows = documentIntakes.map((item) => ({ ...item, kind: documentKind(item), taxSafety: taxSafetyForIntake(item) }));
      const purchaseRows = purchaseInvoices.map((item) => ({
        ...item,
        subtotal: asNumber(item.subtotal),
        vatAmount: asNumber(item.vatAmount),
        total: asNumber(item.total),
        taxSafety: taxSafetyForPurchase(item),
      }));
      await syncProjectPurchaseOrdersFromIntakes(companyId, row.id, documentIntakes, tx);
      const purchaseOrders = await tx.projectPurchaseOrder.findMany({
        where: { companyId, projectId: row.id },
        orderBy: [{ issueDate: 'desc' }, { updatedAt: 'desc' }],
        take: 1000,
        select: {
          id: true,
          poNumber: true,
          documentType: true,
          vendorName: true,
          vendorTaxId: true,
          issueDate: true,
          total: true,
          status: true,
        },
      });
      const purchaseOrderRows = purchaseOrders.map((item) => ({
        ...item,
        total: item.total ?? null,
      }));
      const purchaseOrderHealthRows = purchaseOrderRows.map((item) => purchaseOrderHealth(item, purchaseRows, fileRows));
      const taxSafetySummary = summarizeTaxSafety([
        ...fileRows.map((item) => item.taxSafety),
        ...purchaseRows.map((item) => ({ ...item.taxSafety, vatAmount: item.vatAmount })),
      ]);

      return {
        project: row,
        summary,
        workspaceSummary: {
          PurchaseTotal: purchaseTotal,
          PurchaseVAT: purchaseVat,
          RevenueTotal: revenueTotal,
          ExpenseTotal: expenseTotal,
          EstimatedMargin: revenueTotal - purchaseTotal - expenseTotal,
          ActionNeededCount: actionNeeded.length,
          FilesCount: documentIntakes.length,
          POs: purchaseOrderRows.length,
          POGaps: purchaseOrderHealthRows.filter((item) => item.threeWayStatus !== 'complete').length,
          LINEGroupCount: lineGroups.length,
          CommittedAmount: summary.committedAmount,
          PaidAmount: summary.paidAmount,
          RemainingBudget: asNumber(row.budgetAmount) - summary.committedAmount,
          TaxSafetyRiskCount: taxSafetySummary.taxSafetyRiskCount,
          ClaimableVAT: taxSafetySummary.claimableVat,
        },
        actionNeeded,
        documentIntakes: fileRows,
        purchaseOrders: purchaseOrderHealthRows,
        purchaseInvoices: purchaseRows,
        invoices,
        expenseVouchers,
        lineGroups,
      };
    });

    if (!exportData) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const buffer = await generateProjectExportExcel({
      project: {
        code: exportData.project.code,
        name: exportData.project.name,
        customerName: exportData.project.customerName,
        budgetAmount: asNumber(exportData.project.budgetAmount),
        status: exportData.project.status,
        ownerName: exportData.project.owner?.name ?? null,
        approverName: exportData.project.approver?.name ?? null,
      },
      summary: exportData.workspaceSummary,
      actionNeeded: exportData.actionNeeded,
      files: exportData.documentIntakes.map((item) => ({
        fileName: item.fileName ?? item.id,
        source: item.source,
        kind: item.kind,
        status: item.status,
        taxSafetyStatus: item.taxSafety.status,
        taxSafetyMessage: item.taxSafety.message,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        createdAt: item.createdAt,
        driveSyncStatus: item.driveSyncStatus,
        driveUrl: item.driveUrl,
        driveFolderUrl: item.driveFolderUrl,
      })),
      purchaseOrders: exportData.purchaseOrders.map((item) => ({
        poNumber: item.poNumber,
        documentType: item.documentType,
        vendorName: item.vendorName,
        vendorTaxId: item.vendorTaxId,
        issueDate: item.issueDate,
        total: item.total,
        status: item.status,
        matchedPurchaseCount: item.matchedPurchaseCount,
        matchedPaymentCount: item.matchedPaymentCount,
        missing: item.missing,
      })),
      purchases: exportData.purchaseInvoices.map((item) => ({
        supplierName: item.supplierName,
        supplierTaxId: item.supplierTaxId,
        invoiceNumber: item.invoiceNumber,
        invoiceDate: item.invoiceDate,
        vatType: item.vatType,
        subtotal: asNumber(item.subtotal),
        vatAmount: asNumber(item.vatAmount),
        total: asNumber(item.total),
        taxSafetyStatus: item.taxSafety.status,
        taxSafetyMessage: item.taxSafety.message,
        isPaid: item.isPaid,
      })),
      sales: exportData.invoices.map((item) => ({
        invoiceNumber: item.invoiceNumber,
        buyerName: item.buyer.nameTh || item.buyer.nameEn || '',
        type: item.type,
        status: item.status,
        invoiceDate: item.invoiceDate,
        subtotal: asNumber(item.subtotal),
        vatAmount: asNumber(item.vatAmount),
        total: asNumber(item.total),
        isPaid: item.isPaid,
      })),
      expenses: exportData.expenseVouchers.map((item) => ({
        voucherNumber: item.voucherNumber,
        status: item.status,
        voucherDate: item.voucherDate,
        description: item.description ?? '',
        totalAmount: asNumber(item.totalAmount),
      })),
      lineGroups: exportData.lineGroups.map((item) => ({
        groupName: item.groupName ?? 'LINE Group',
        linkedAt: item.linkedAt,
      })),
    });

    const safeCode = exportData.project.code.replace(/[^A-Z0-9-_]/gi, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="project-${safeCode}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    logger.error('Failed to export project', { error: err, projectId: req.params.id });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to export project' });
  }
});

projectsRouter.post('/:id/export/sheets', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  if (!isSheetsConfigured()) {
    res.status(503).json({ error: 'Google Sheets is not configured on this server' });
    return;
  }

  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'export_google_sheets')) {
      res.status(403).json({ error: 'Upgrade your plan to export project Google Sheets' });
      return;
    }

    const companyId = req.user!.companyId;
    const exportData = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const row = await tx.project.findFirst({
        where: { id: req.params.id, companyId },
        include: {
          owner: { select: { name: true } },
          approver: { select: { name: true } },
        },
      });
      if (!row) return null;

      const [summary, documentIntakes, purchaseInvoices, invoices, expenseVouchers, lineGroups] = await Promise.all([
        projectBudgetSummary(companyId, row.id, tx),
        tx.documentIntake.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { createdAt: 'desc' },
          take: 1000,
          select: {
            id: true,
            source: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            status: true,
            ocrResult: true,
            warnings: true,
            error: true,
            targetType: true,
            targetId: true,
            purchaseInvoiceId: true,
            createdAt: true,
            driveUrl: true,
            driveSyncStatus: true,
            driveFolderUrl: true,
          },
        }),
        tx.purchaseInvoice.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { invoiceDate: 'desc' },
          take: 1000,
          select: {
            id: true,
            supplierName: true,
            supplierTaxId: true,
            invoiceNumber: true,
            invoiceDate: true,
            vatType: true,
            subtotal: true,
            vatAmount: true,
            total: true,
            isPaid: true,
          },
        }),
        tx.invoice.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { invoiceDate: 'desc' },
          take: 1000,
          select: {
            invoiceNumber: true,
            type: true,
            status: true,
            invoiceDate: true,
            subtotal: true,
            vatAmount: true,
            total: true,
            isPaid: true,
            buyer: { select: { nameTh: true, nameEn: true } },
          },
        }),
        tx.expenseVoucher.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { voucherDate: 'desc' },
          take: 1000,
          select: {
            voucherNumber: true,
            status: true,
            voucherDate: true,
            description: true,
            totalAmount: true,
          },
        }),
        tx.lineGroupLink.findMany({
          where: { companyId, projectId: row.id, isActive: true },
          orderBy: { linkedAt: 'desc' },
          select: { groupName: true, linkedAt: true },
        }),
      ]);

      const purchaseRows = purchaseInvoices.map((item) => ({
        ...item,
        subtotal: asNumber(item.subtotal),
        vatAmount: asNumber(item.vatAmount),
        total: asNumber(item.total),
        taxSafety: taxSafetyForPurchase(item),
      }));
      const fileRows = documentIntakes.map((item) => ({ ...item, kind: documentKind(item), taxSafety: taxSafetyForIntake(item) }));
      await syncProjectPurchaseOrdersFromIntakes(companyId, row.id, documentIntakes, tx);
      const purchaseOrders = await tx.projectPurchaseOrder.findMany({
        where: { companyId, projectId: row.id },
        orderBy: [{ issueDate: 'desc' }, { updatedAt: 'desc' }],
        take: 1000,
        select: {
          id: true,
          poNumber: true,
          documentType: true,
          vendorName: true,
          vendorTaxId: true,
          issueDate: true,
          total: true,
          status: true,
        },
      });
      const purchaseOrderRows = purchaseOrders.map((item) => ({
        ...item,
        total: item.total ?? null,
      }));
      const purchaseOrderHealthRows = purchaseOrderRows.map((item) => purchaseOrderHealth(item, purchaseRows, fileRows));
      const purchaseTotal = purchaseRows.reduce((sum, item) => sum + item.total, 0);
      const purchaseVat = purchaseRows.reduce((sum, item) => sum + item.vatAmount, 0);
      const revenueTotal = invoices.reduce((sum, item) => sum + asNumber(item.total), 0);
      const expenseTotal = expenseVouchers.reduce((sum, item) => sum + asNumber(item.totalAmount), 0);
      const actionNeeded = fileRows
        .map(actionNeededForIntake)
        .filter((item): item is NonNullable<ReturnType<typeof actionNeededForIntake>> => item !== null);
      const taxSafetySummary = summarizeTaxSafety([
        ...fileRows.map((item) => item.taxSafety),
        ...purchaseRows.map((item) => ({ ...item.taxSafety, vatAmount: item.vatAmount })),
      ]);

      return {
        project: row,
        workspaceSummary: {
          PurchaseTotal: purchaseTotal,
          PurchaseVAT: purchaseVat,
          RevenueTotal: revenueTotal,
          ExpenseTotal: expenseTotal,
          EstimatedMargin: revenueTotal - purchaseTotal - expenseTotal,
          ActionNeededCount: actionNeeded.length,
          FilesCount: documentIntakes.length,
          POs: purchaseOrderRows.length,
          POGaps: purchaseOrderHealthRows.filter((item) => item.threeWayStatus !== 'complete').length,
          LINEGroupCount: lineGroups.length,
          CommittedAmount: summary.committedAmount,
          PaidAmount: summary.paidAmount,
          RemainingBudget: asNumber(row.budgetAmount) - summary.committedAmount,
          TaxSafetyRiskCount: taxSafetySummary.taxSafetyRiskCount,
          ClaimableVAT: taxSafetySummary.claimableVat,
        },
        actionNeeded,
        files: fileRows,
        purchaseOrders: purchaseOrderHealthRows,
        purchases: purchaseRows,
        invoices,
        expenseVouchers,
        lineGroups,
      };
    });

    if (!exportData) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    let driveFolderId = exportData.project.driveFolderId ?? null;
    if (!driveFolderId) {
      try {
        const folder = await ensureProjectDriveFolderForUser({
          companyId: req.user!.companyId,
          projectId: req.params.id,
          userId: req.user!.userId,
        });
        driveFolderId = folder?.folderId ?? null;
      } catch (driveErr) {
        logger.warn('Could not ensure Drive folder before project sheet export', { error: driveErr, projectId: req.params.id });
      }
    }

    const url = await exportProjectToSheets({
      project: {
        code: exportData.project.code,
        name: exportData.project.name,
        customerName: exportData.project.customerName,
        budgetAmount: asNumber(exportData.project.budgetAmount),
        status: exportData.project.status,
        ownerName: exportData.project.owner?.name ?? null,
        approverName: exportData.project.approver?.name ?? null,
        driveFolderId,
      },
      sharedWithEmail: req.user!.email,
      summary: exportData.workspaceSummary,
      actionNeeded: exportData.actionNeeded,
      files: exportData.files.map((item) => ({
        fileName: item.fileName ?? item.id,
        source: item.source,
        kind: item.kind,
        status: item.status,
        taxSafetyStatus: item.taxSafety.status,
        taxSafetyMessage: item.taxSafety.message,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        createdAt: item.createdAt,
        driveSyncStatus: item.driveSyncStatus,
        driveUrl: item.driveUrl,
        driveFolderUrl: item.driveFolderUrl,
      })),
      purchaseOrders: exportData.purchaseOrders.map((item) => ({
        poNumber: item.poNumber,
        documentType: item.documentType,
        vendorName: item.vendorName,
        vendorTaxId: item.vendorTaxId,
        issueDate: item.issueDate,
        total: item.total,
        status: item.status,
        matchedPurchaseCount: item.matchedPurchaseCount,
        matchedPaymentCount: item.matchedPaymentCount,
        missing: item.missing,
      })),
      purchases: exportData.purchases.map((item) => ({
        supplierName: item.supplierName,
        supplierTaxId: item.supplierTaxId,
        invoiceNumber: item.invoiceNumber,
        invoiceDate: item.invoiceDate,
        vatType: item.vatType,
        subtotal: item.subtotal,
        vatAmount: item.vatAmount,
        total: item.total,
        taxSafetyStatus: item.taxSafety.status,
        taxSafetyMessage: item.taxSafety.message,
        isPaid: item.isPaid,
      })),
      sales: exportData.invoices.map((item) => ({
        invoiceNumber: item.invoiceNumber,
        buyerName: item.buyer.nameTh || item.buyer.nameEn || '',
        type: item.type,
        status: item.status,
        invoiceDate: item.invoiceDate,
        subtotal: asNumber(item.subtotal),
        vatAmount: asNumber(item.vatAmount),
        total: asNumber(item.total),
        isPaid: item.isPaid,
      })),
      expenses: exportData.expenseVouchers.map((item) => ({
        voucherNumber: item.voucherNumber,
        status: item.status,
        voucherDate: item.voucherDate,
        description: item.description ?? '',
        totalAmount: asNumber(item.totalAmount),
      })),
      lineGroups: exportData.lineGroups.map((item) => ({
        groupName: item.groupName ?? 'LINE Group',
        linkedAt: item.linkedAt,
      })),
    });

    await auditLog({
      companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'project.export_sheets',
      resourceType: 'project',
      resourceId: exportData.project.id,
      details: { url, code: exportData.project.code },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ data: { url } });
  } catch (err) {
    logger.error('Failed to export project to Google Sheets', { error: err, projectId: req.params.id });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to export project to Google Sheets' });
  }
});

projectsRouter.get('/:id/export/zip', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const data = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: req.params.id, companyId },
        select: { id: true, code: true, name: true },
      });
      if (!project) return null;
      const files = await tx.documentIntake.findMany({
        where: { companyId, projectId: project.id },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          fileBase64: true,
          fileUrl: true,
          storageKey: true,
          status: true,
          source: true,
          error: true,
          createdAt: true,
        },
      });
      return { project, files };
    });

    if (!data) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const entries: ZipEntryInput[] = [];
    const links: string[] = [];
    for (const file of data.files) {
      const label = safeFileName(file.fileName ?? `${file.id}.${file.mimeType === 'application/pdf' ? 'pdf' : 'bin'}`);
      const path = `files/${safeFileName(file.status)}/${label}`;
      try {
        if (file.storageKey) {
          entries.push({ path, data: await downloadFromStorage(file.storageKey) });
        } else if (file.fileBase64) {
          entries.push({ path, data: Buffer.from(file.fileBase64, 'base64') });
        } else if (file.fileUrl) {
          links.push(`${file.fileName ?? file.id}\t${file.status}\t${file.fileUrl}`);
        } else {
          links.push(`${file.fileName ?? file.id}\t${file.status}\tmissing original file${file.error ? `\t${file.error}` : ''}`);
        }
      } catch (err) {
        links.push(`${file.fileName ?? file.id}\t${file.status}\tfailed to include: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    entries.push({
      path: 'README.txt',
      data: [
        `Project: ${data.project.code} ${data.project.name}`,
        `Generated: ${new Date().toISOString()}`,
        `Included files: ${entries.length}`,
        links.length ? 'Some files are stored as links in _links.txt.' : '',
      ].filter(Boolean).join('\n'),
    });
    if (links.length > 0) entries.push({ path: '_links.txt', data: ['File\tStatus\tLink/Note', ...links].join('\n') });

    const zip = createZip(entries);
    const safeCode = safeFileName(data.project.code);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="project-${safeCode}-attachments.zip"`);
    res.send(zip);
  } catch (err) {
    logger.error('Failed to export project ZIP', { error: err, projectId: req.params.id });
    res.status(500).json({ error: 'Failed to export project ZIP' });
  }
});

projectsRouter.post('/', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = projectPayloadSchema.parse(req.body);
    const companyId = req.user!.companyId;
    const policy = await resolveCompanyAccessPolicy(companyId);
    if (!policy.canUseProjects) {
      res.status(403).json({ error: 'Upgrade your plan to use project workspaces' });
      return;
    }
    if (policy.maxProjects !== null && policy.usage.projects >= policy.maxProjects) {
      res.status(403).json({ error: getLimitErrorMessage('projects', policy) });
      return;
    }

    const created = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await ensureProjectUsersInCompany(companyId, [body.ownerId, body.approverId, ...body.memberIds], tx);
      const code = normalizeCode(body.code) || await generateProjectCode(companyId, tx);
      const memberIds = [...new Set([...(body.memberIds ?? []), body.ownerId, body.approverId].filter(Boolean) as string[])];
      return tx.project.create({
        data: {
          companyId,
          code,
          name: body.name,
          description: body.description || null,
          customerName: body.customerName || null,
          budgetAmount: body.budgetAmount,
          status: body.status,
          ownerId: body.ownerId || null,
          approverId: body.approverId || null,
          startDate: body.startDate ? new Date(body.startDate) : null,
          endDate: body.endDate ? new Date(body.endDate) : null,
          createdBy: req.user!.userId,
          members: {
            create: memberIds.map((userId) => ({
              userId,
              role: userId === body.ownerId ? 'owner' : userId === body.approverId ? 'approver' : 'member',
            })),
          },
        },
      });
    });

    await auditLog({
      companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'project.create',
      resourceType: 'project',
      resourceId: created.id,
      details: { code: created.code, name: created.name, budgetAmount: asNumber(created.budgetAmount) },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.status(201).json({ data: { ...created, budgetAmount: asNumber(created.budgetAmount) } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'Project code already exists' });
      return;
    }
    logger.error('Failed to create project', { error: err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create project' });
  }
});

projectsRouter.patch('/:id', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = updateProjectPayloadSchema.parse(req.body);
    const companyId = req.user!.companyId;

    const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const existing = await tx.project.findFirst({ where: { id: req.params.id, companyId }, select: { id: true } });
      if (!existing) return null;
      await ensureProjectUsersInCompany(companyId, [body.ownerId, body.approverId, ...(body.memberIds ?? [])], tx);
      const data: Prisma.ProjectUpdateInput = {
        code: body.code === undefined ? undefined : normalizeCode(body.code),
        name: body.name,
        description: body.description === undefined ? undefined : body.description || null,
        customerName: body.customerName === undefined ? undefined : body.customerName || null,
        budgetAmount: body.budgetAmount,
        status: body.status,
        owner: body.ownerId === undefined ? undefined : body.ownerId ? { connect: { id: body.ownerId } } : { disconnect: true },
        approver: body.approverId === undefined ? undefined : body.approverId ? { connect: { id: body.approverId } } : { disconnect: true },
        startDate: body.startDate === undefined ? undefined : body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate === undefined ? undefined : body.endDate ? new Date(body.endDate) : null,
      };
      const project = await tx.project.update({ where: { id: existing.id }, data });
      if (body.memberIds) {
        const memberIds = [...new Set([...(body.memberIds ?? []), body.ownerId, body.approverId].filter(Boolean) as string[])];
        await tx.projectMember.deleteMany({ where: { projectId: existing.id } });
        if (memberIds.length > 0) {
          await tx.projectMember.createMany({
            data: memberIds.map((userId) => ({
              projectId: existing.id,
              userId,
              role: userId === body.ownerId ? 'owner' : userId === body.approverId ? 'approver' : 'member',
            })),
            skipDuplicates: true,
          });
        }
      }
      return project;
    });

    if (!updated) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await auditLog({
      companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'project.update',
      resourceType: 'project',
      resourceId: updated.id,
      details: { code: updated.code, name: updated.name, status: updated.status },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ data: { ...updated, budgetAmount: asNumber(updated.budgetAmount) } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'Project code already exists' });
      return;
    }
    logger.error('Failed to update project', { error: err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update project' });
  }
});

projectsRouter.delete('/:id', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const archived = await withRlsContext(prisma, tenantRlsContext(req.user!), (tx) =>
      tx.project.updateMany({
        where: { id: req.params.id, companyId: req.user!.companyId },
        data: { status: 'archived' },
      }),
    );
    if (archived.count === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    logger.error('Failed to archive project', { error: err });
    res.status(500).json({ error: 'Failed to archive project' });
  }
});

projectsRouter.post('/:id/members', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = memberPayloadSchema.parse(req.body);
    const companyId = req.user!.companyId;
    const member = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await ensureProjectBelongsToCompany(companyId, req.params.id, tx);
      await ensureProjectUsersInCompany(companyId, [body.userId], tx);
      return tx.projectMember.upsert({
        where: { projectId_userId: { projectId: req.params.id, userId: body.userId } },
        update: { role: body.role },
        create: { projectId: req.params.id, userId: body.userId, role: body.role },
      });
    });
    res.status(201).json({ data: member });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to upsert project member', { error: err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update project member' });
  }
});

projectsRouter.delete('/:id/members/:userId', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await ensureProjectBelongsToCompany(req.user!.companyId, req.params.id, tx);
      await tx.projectMember.deleteMany({ where: { projectId: req.params.id, userId: req.params.userId } });
    });
    res.status(204).send();
  } catch (err) {
    logger.error('Failed to delete project member', { error: err });
    res.status(500).json({ error: 'Failed to remove project member' });
  }
});

projectsRouter.post('/assign-document', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = assignPayloadSchema.parse(req.body);
    const companyId = req.user!.companyId;
    const data = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await ensureProjectBelongsToCompany(companyId, body.projectId, tx);
      if (body.targetType === 'purchase_invoice') {
        return tx.purchaseInvoice.updateMany({ where: { id: body.targetId, companyId }, data: { projectId: body.projectId } });
      }
      if (body.targetType === 'document_intake') {
        return tx.documentIntake.updateMany({ where: { id: body.targetId, companyId }, data: { projectId: body.projectId } });
      }
      if (body.targetType === 'expense_voucher') {
        return tx.expenseVoucher.updateMany({ where: { id: body.targetId, companyId }, data: { projectId: body.projectId } });
      }
      if (body.targetType === 'invoice') {
        return tx.invoice.updateMany({ where: { id: body.targetId, companyId }, data: { projectId: body.projectId } });
      }
      return tx.lineGroupLink.updateMany({ where: { id: body.targetId, companyId }, data: { projectId: body.projectId } });
    });
    if (data.count === 0) {
      res.status(404).json({ error: 'Target document not found' });
      return;
    }
    res.json({ data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to assign document to project', { error: err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to assign document' });
  }
});
