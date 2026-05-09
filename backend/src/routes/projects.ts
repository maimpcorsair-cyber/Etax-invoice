import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { auditLog } from '../services/auditService';
import { logger } from '../config/logger';
import { getLimitErrorMessage, resolveCompanyAccessPolicy } from '../services/accessPolicyService';
import { generateProjectExportExcel } from '../services/exportService';

export const projectsRouter = Router();

const statusSchema = z.enum(['active', 'on_hold', 'completed', 'archived']);
const memberRoleSchema = z.enum(['owner', 'approver', 'member', 'viewer']);

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
          select: { id: true, groupName: true, linkedAt: true },
        }),
      ]);

      const project = serializeProject(row, summary);
      const purchaseTotal = purchaseInvoices.reduce((sum, item) => sum + asNumber(item.total), 0);
      const purchaseVat = purchaseInvoices.reduce((sum, item) => sum + asNumber(item.vatAmount), 0);
      const revenueTotal = invoices.reduce((sum, item) => sum + asNumber(item.total), 0);
      const expenseTotal = expenseVouchers.reduce((sum, item) => sum + asNumber(item.totalAmount), 0);
      const documentIntakeRows = documentIntakes.map((item) => ({
        ...item,
        kind: documentKind(item),
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
      const taxSafetySummary = summarizeTaxSafety([
        ...documentIntakeRows.map((item) => item.taxSafety),
        ...purchaseInvoiceRows.map((item) => ({ ...item.taxSafety, vatAmount: item.vatAmount })),
      ]);
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
          ...taxSafetySummary,
        },
        actionNeeded: allActionNeeded,
        documentIntakes: documentIntakeRows,
        purchaseInvoices: purchaseInvoiceRows,
        invoices: invoices.map((item) => ({
          ...item,
          subtotal: asNumber(item.subtotal),
          vatAmount: asNumber(item.vatAmount),
          total: asNumber(item.total),
        })),
        expenseVouchers: expenseVouchers.map((item) => ({ ...item, totalAmount: asNumber(item.totalAmount) })),
        lineGroups,
      };
    });
    if (!data) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ data });
  } catch (err) {
    logger.error('Failed to get project workspace', { error: err });
    res.status(500).json({ error: 'Failed to fetch project workspace' });
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
          },
        }),
        tx.purchaseInvoice.findMany({
          where: { companyId, projectId: row.id },
          orderBy: { invoiceDate: 'desc' },
          take: 1000,
          select: {
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
          LINEGroupCount: lineGroups.length,
          CommittedAmount: summary.committedAmount,
          PaidAmount: summary.paidAmount,
          RemainingBudget: asNumber(row.budgetAmount) - summary.committedAmount,
          TaxSafetyRiskCount: taxSafetySummary.taxSafetyRiskCount,
          ClaimableVAT: taxSafetySummary.claimableVat,
        },
        actionNeeded,
        documentIntakes: fileRows,
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
