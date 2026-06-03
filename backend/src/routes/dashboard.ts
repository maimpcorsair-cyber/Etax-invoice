import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext, withSystemRlsContext } from '../config/rls';
import { logger } from '../config/logger';
import { rdComplianceQueue } from '../queues/rdComplianceQueue';
import { enqueueMasterSheetSync, masterSheetQueue } from '../queues/masterSheetQueue';
import {
  ensureCompanyDriveFolder,
  isDriveConfigured,
  isDriveServiceAccountConfigured,
  isUserDriveOAuthConfigured,
} from '../services/googleDriveService';
import { isSheetsConfigured } from '../services/googleSheetsService';
import { resolveCompanyRuntimeConfig } from '../services/companyConfigService';
import { getCertificateInfo } from '../services/signatureService';

export const dashboardRouter = Router();

const bankAccountSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1).max(80),
  bankName: z.string().trim().min(1).max(120),
  accountName: z.string().trim().min(1).max(160),
  accountNumber: z.string().trim().min(1).max(60),
  branch: z.string().trim().max(120).optional().nullable(),
  promptPayId: z.string().trim().max(80).optional().nullable(),
  isDefault: z.boolean().optional(),
});

const signatureProfileSchema = z.object({
  signatureImageUrl: z.string().optional().nullable(),
  signerName: z.string().trim().max(120).optional().nullable(),
  signerTitle: z.string().trim().max(120).optional().nullable(),
  securityNote: z.string().trim().max(220).optional().nullable(),
  updatedAt: z.string().optional().nullable(),
});

const documentProfileSchema = z.object({
  bankAccounts: z.array(bankAccountSchema).max(20).optional(),
  signatureProfile: signatureProfileSchema.optional().nullable(),
});

function normalizeBankAccounts(input: z.infer<typeof bankAccountSchema>[]) {
  const accounts = input.map((account, index) => ({
    id: account.id?.trim() || randomUUID(),
    label: account.label.trim(),
    bankName: account.bankName.trim(),
    accountName: account.accountName.trim(),
    accountNumber: account.accountNumber.trim(),
    branch: account.branch?.trim() || null,
    promptPayId: account.promptPayId?.trim() || null,
    isDefault: account.isDefault === true,
    sortOrder: index,
  }));

  const firstDefault = accounts.findIndex((account) => account.isDefault);
  if (firstDefault === -1 && accounts.length > 0) {
    accounts[0].isDefault = true;
  }

  return accounts.map((account, index) => ({
    ...account,
    isDefault: account.isDefault && index === (firstDefault === -1 ? 0 : firstDefault),
  }));
}

function asNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  if (typeof value === 'object' && 'toString' in value) return Number(value.toString()) || 0;
  return 0;
}

function productTypeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    product: 'สินค้า',
    service: 'บริการ',
    shipping: 'ค่าขนส่ง',
    fee: 'ค่าธรรมเนียม',
    deposit: 'มัดจำ',
    discount: 'ส่วนลด',
  };
  return labels[type ?? ''] ?? 'สินค้า';
}

function vatLabel(type?: string | null) {
  if (type === 'vat7') return 'VAT 7%';
  if (type === 'vatZero') return 'VAT 0%';
  if (type === 'vatExempt') return 'ยกเว้น VAT';
  return type ?? '';
}

function monthRange(inputYear?: unknown, inputMonth?: unknown) {
  const now = new Date();
  const year = Number(inputYear) || now.getFullYear();
  const month = Number(inputMonth) || (now.getMonth() + 1);
  const normalizedMonth = Math.min(Math.max(month, 1), 12);
  const start = new Date(year, normalizedMonth - 1, 1);
  const end = new Date(year, normalizedMonth, 0, 23, 59, 59, 999);
  const label = `${year}-${String(normalizedMonth).padStart(2, '0')}`;
  return { year, month: normalizedMonth, start, end, label };
}

dashboardRouter.get('/integration-status', async (req, res) => {
  try {
    const [lineLink, company, user] = await Promise.all([
      prisma.lineUserLink.findUnique({
        where: { userId: req.user!.userId },
        select: { isActive: true, displayName: true, linkedAt: true },
      }),
      prisma.company.findUnique({
        where: { id: req.user!.companyId },
        select: { lineNotifyEnabled: true },
      }),
      prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { email: true, googleSub: true, googleRefreshToken: true },
      }),
    ]);

    const googleSheetsConfigured = !!(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON
      || process.env.GOOGLE_APPLICATION_CREDENTIALS
      || process.env.GOOGLE_CLIENT_EMAIL
    );
    const currentUserHasDrive = !!user?.googleRefreshToken;
    const googleDriveConfigured = isDriveConfigured() || currentUserHasDrive;

    res.json({
      data: {
        lineAi: {
          connected: !!lineLink?.isActive,
          displayName: lineLink?.displayName ?? null,
          linkedAt: lineLink?.linkedAt ?? null,
          notificationsEnabled: !!company?.lineNotifyEnabled,
        },
        googleAccount: {
          connected: !!user?.googleSub,
          email: user?.email ?? req.user?.email ?? null,
        },
        googleSheets: {
          connected: googleSheetsConfigured,
          mode: googleSheetsConfigured ? 'service_account' : 'not_configured',
        },
        googleDrive: {
          connected: googleDriveConfigured,
          mode: googleDriveConfigured ? 'workspace_folder' : 'not_configured',
        },
      },
    });
  } catch (err) {
    logger.error('Failed to load integration status', { error: err });
    res.status(500).json({ error: 'Failed to load integration status' });
  }
});

dashboardRouter.get('/month-end-workspace', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const period = monthRange(req.query.year, req.query.month);

    const [
      purchases,
      sales,
      expenses,
      actionDocs,
      projects,
      customers,
      products,
    ] = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return Promise.all([
        tx.purchaseInvoice.findMany({
          where: {
            companyId,
            invoiceDate: { gte: period.start, lte: period.end },
          },
          orderBy: { invoiceDate: 'desc' },
          take: 200,
          select: {
            id: true,
            supplierName: true,
            supplierTaxId: true,
            invoiceNumber: true,
            invoiceDate: true,
            subtotal: true,
            vatAmount: true,
            total: true,
            vatType: true,
            category: true,
            pdfUrl: true,
            isPaid: true,
            project: { select: { id: true, code: true, name: true } },
          },
        }),
        tx.invoice.findMany({
          where: {
            companyId,
            invoiceDate: { gte: period.start, lte: period.end },
            status: { not: 'cancelled' },
          },
          orderBy: { invoiceDate: 'desc' },
          take: 200,
          select: {
            id: true,
            invoiceNumber: true,
            type: true,
            status: true,
            invoiceDate: true,
            subtotal: true,
            vatAmount: true,
            total: true,
            pdfUrl: true,
            buyer: { select: { nameTh: true, nameEn: true, taxId: true } },
            project: { select: { id: true, code: true, name: true } },
          },
        }),
        tx.expenseVoucher.findMany({
          where: {
            companyId,
            voucherDate: { gte: period.start, lte: period.end },
          },
          orderBy: { voucherDate: 'desc' },
          take: 200,
          select: {
            id: true,
            voucherNumber: true,
            status: true,
            voucherDate: true,
            description: true,
            totalAmount: true,
            project: { select: { id: true, code: true, name: true } },
            items: {
              take: 3,
              select: {
                category: true,
                attachments: {
                  take: 1,
                  select: { url: true },
                },
              },
            },
          },
        }),
        tx.documentIntake.findMany({
          where: {
            companyId,
            createdAt: { gte: period.start, lte: period.end },
            OR: [
              { status: { in: ['received', 'processing', 'awaiting_input', 'awaiting_confirmation', 'needs_review', 'failed'] } },
              { driveSyncStatus: { in: ['not_synced', 'failed'] } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            id: true,
            fileName: true,
            source: true,
            status: true,
            error: true,
            driveUrl: true,
            fileUrl: true,
            driveSyncStatus: true,
            createdAt: true,
            project: { select: { id: true, code: true, name: true } },
          },
        }),
        tx.project.findMany({
          where: { companyId, status: { not: 'archived' } },
          orderBy: { updatedAt: 'desc' },
          take: 100,
          select: {
            id: true,
            code: true,
            name: true,
            budgetAmount: true,
            status: true,
            purchaseInvoices: {
              select: { total: true, vatAmount: true },
            },
            expenseVouchers: {
              select: { totalAmount: true },
            },
            invoices: {
              where: { status: { not: 'cancelled' } },
              select: { total: true },
            },
            documentIntakes: {
              select: { id: true },
            },
          },
        }),
        tx.customer.findMany({
          where: { companyId, isActive: true },
          orderBy: { updatedAt: 'desc' },
          take: 200,
          select: {
            id: true,
            nameTh: true,
            nameEn: true,
            taxId: true,
            partyRole: true,
            useCase: true,
            verificationStatus: true,
            vatEvidenceStatus: true,
            documents: {
              where: { status: { not: 'rejected' } },
              orderBy: { uploadedAt: 'desc' },
              take: 20,
              select: {
                id: true,
                documentType: true,
                status: true,
                fileName: true,
                driveUrl: true,
                driveFolderUrl: true,
                driveUserDrive: true,
                sensitive: true,
                uploadedAt: true,
              },
            },
          },
        }),
        tx.product.findMany({
          where: { companyId },
          orderBy: [{ isActive: 'desc' }, { nameTh: 'asc' }],
          take: 5000,
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
            productType: true,
            category: true,
            unit: true,
            unitPrice: true,
            vatType: true,
            unitCost: true,
            accountCode: true,
            defaultWhtRate: true,
            isActive: true,
            updatedAt: true,
          },
        }),
      ]);
    });

    const inputVatRows = purchases.map((item) => ({
      id: item.id,
      date: item.invoiceDate,
      supplier: item.supplierName,
      taxId: item.supplierTaxId,
      documentNo: item.invoiceNumber,
      project: item.project ? `${item.project.code} ${item.project.name}` : 'Company',
      category: item.category ?? '',
      subtotal: asNumber(item.subtotal),
      vat: asNumber(item.vatAmount),
      total: asNumber(item.total),
      taxStatus: item.vatType === 'vat7' && asNumber(item.vatAmount) > 0 ? 'Input VAT' : 'No VAT',
      attachmentUrl: item.pdfUrl,
    }));
    const outputVatRows = sales.map((item) => ({
      id: item.id,
      date: item.invoiceDate,
      buyer: item.buyer?.nameTh || item.buyer?.nameEn || '',
      taxId: item.buyer?.taxId ?? '',
      documentNo: item.invoiceNumber,
      project: item.project ? `${item.project.code} ${item.project.name}` : 'Company',
      type: item.type,
      status: item.status,
      subtotal: asNumber(item.subtotal),
      vat: asNumber(item.vatAmount),
      total: asNumber(item.total),
      attachmentUrl: item.pdfUrl,
    }));
    const expenseRows = expenses.map((item) => ({
      id: item.id,
      date: item.voucherDate,
      voucherNo: item.voucherNumber,
      project: item.project ? `${item.project.code} ${item.project.name}` : 'Company',
      category: item.items.map((expenseItem) => expenseItem.category).filter(Boolean)[0] ?? '',
      description: item.description ?? '',
      amount: asNumber(item.totalAmount),
      status: item.status,
      attachmentUrl: item.items.flatMap((expenseItem) => expenseItem.attachments.map((attachment) => attachment.url))[0] ?? null,
    }));
    const missingRows = actionDocs.map((item) => ({
      id: item.id,
      date: item.createdAt,
      fileName: item.fileName ?? item.id,
      project: item.project ? `${item.project.code} ${item.project.name}` : 'Company',
      source: item.source,
      status: item.status,
      drive: item.driveSyncStatus,
      issue: item.error ?? (item.driveSyncStatus === 'failed' ? 'Drive sync failed' : 'Needs review'),
      attachmentUrl: item.driveUrl ?? item.fileUrl,
    }));
    const projectRows = projects.map((project) => {
      const purchaseTotal = project.purchaseInvoices.reduce((sum, item) => sum + asNumber(item.total), 0);
      const expenseTotal = project.expenseVouchers.reduce((sum, item) => sum + asNumber(item.totalAmount), 0);
      const revenueTotal = project.invoices.reduce((sum, item) => sum + asNumber(item.total), 0);
      const actual = purchaseTotal + expenseTotal;
      const budget = asNumber(project.budgetAmount);
      return {
        id: project.id,
        project: `${project.code} ${project.name}`,
        status: project.status,
        budget,
        revenue: revenueTotal,
        actual,
        balance: budget - actual,
        forecastProfit: revenueTotal - actual,
        files: project.documentIntakes.length,
      };
    });
    const customerEvidenceRows = customers.flatMap((customer) => {
      const base = {
        customer: customer.nameTh || customer.nameEn || customer.taxId,
        taxId: customer.taxId,
        role: customer.partyRole,
        useCase: customer.useCase,
        readiness: customer.verificationStatus,
        vatEvidence: customer.vatEvidenceStatus,
      };
      const docs = customer.documents.map((doc) => ({
        id: doc.id,
        ...base,
        documentType: doc.documentType,
        status: doc.status,
        fileName: doc.sensitive ? 'Sensitive document' : doc.fileName,
        storage: doc.driveUserDrive ? 'User Drive' : 'Billboy Drive',
        uploadedAt: doc.uploadedAt.toISOString(),
        folderUrl: doc.driveFolderUrl,
        attachmentUrl: doc.sensitive ? null : doc.driveUrl,
      }));
      if (docs.length > 0) return docs;
      if (customer.verificationStatus === 'not_required' && customer.vatEvidenceStatus === 'not_required') return [];
      return [{
        id: `${customer.id}-missing-evidence`,
        ...base,
        documentType: 'missing_evidence',
        status: 'missing',
        fileName: 'No supporting file attached',
        storage: 'Google Drive',
        uploadedAt: '',
        folderUrl: null,
        attachmentUrl: null,
      }];
    });
    const productRows = products.map((product) => {
      const unitCost = asNumber(product.unitCost);
      const grossMargin = product.unitCost !== null && asNumber(product.unitPrice) > 0
        ? `${Math.round(((asNumber(product.unitPrice) - unitCost) / asNumber(product.unitPrice)) * 100)}%`
        : '';
      return {
        id: product.id,
        code: product.code,
        nameTh: product.nameTh,
        nameEn: product.nameEn ?? '',
        type: productTypeLabel(product.productType),
        category: product.category ?? '',
        unit: product.unit,
        unitPrice: asNumber(product.unitPrice),
        vat: vatLabel(product.vatType),
        unitCost: product.unitCost ?? '',
        grossMargin,
        accountCode: product.accountCode ?? '',
        defaultWhtRate: product.defaultWhtRate ? `${product.defaultWhtRate}%` : '',
        status: product.isActive ? 'ใช้งาน' : 'ปิดใช้งาน',
        updatedAt: product.updatedAt,
      };
    });

    const summary = {
      inputVat: inputVatRows.reduce((sum, item) => sum + item.vat, 0),
      outputVat: outputVatRows.reduce((sum, item) => sum + item.vat, 0),
      expenses: expenseRows.reduce((sum, item) => sum + item.amount, 0),
      missingDocuments: missingRows.length,
      projectCount: projectRows.length,
      vatPayable: outputVatRows.reduce((sum, item) => sum + item.vat, 0) - inputVatRows.reduce((sum, item) => sum + item.vat, 0),
      customerEvidence: customerEvidenceRows.length,
      products: productRows.length,
    };

    res.json({
      data: {
        period: period.label,
        summary,
        tabs: {
          inputVat: inputVatRows,
          outputVat: outputVatRows,
          expenses: expenseRows,
          products: productRows,
          customerEvidence: customerEvidenceRows,
          missingDocs: missingRows,
          projectSummary: projectRows,
        },
      },
    });
  } catch (err) {
    logger.error('Failed to load month-end workspace', { error: err });
    res.status(500).json({ error: 'Failed to load month-end workspace' });
  }
});

/* ─── GET /api/dashboard/stats ─── */
dashboardRouter.get('/stats', async (req, res) => {
  try {
    const companyId = req.user!.companyId;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [
      totalInvoices,
      totalRevenueAgg,
      pendingCount,
      rdSuccessCount,
      rdPendingCount,
      receivableRows,
      monthlyRows,
      customerActionNeeded,
      customerVatEvidenceMissing,
    ] = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return Promise.all([
        tx.invoice.count({
          where: { companyId, status: { not: 'cancelled' } },
        }),
        tx.invoice.aggregate({
          where: { companyId, status: { in: ['approved', 'submitted'] } },
          _sum: { total: true },
        }),
        tx.invoice.count({
          where: { companyId, status: 'pending' },
        }),
        tx.invoice.count({
          where: { companyId, rdSubmissionStatus: 'success' },
        }),
        tx.invoice.count({
          where: { companyId, rdSubmissionStatus: { in: ['pending', 'in_progress'] } },
        }),
        tx.invoice.findMany({
          where: {
            companyId,
            status: { not: 'cancelled' },
            type: { in: ['tax_invoice', 'debit_note'] },
          },
          select: {
            total: true,
            paidAmount: true,
            dueDate: true,
            invoiceDate: true,
          },
        }),
        tx.$queryRaw<Array<{ month: string; total: number }>>(
          Prisma.sql`
            SELECT
              TO_CHAR("invoiceDate", 'YYYY-MM') AS month,
              SUM(total)::float                  AS total
            FROM invoices
            WHERE
              "companyId" = ${companyId}
              AND status   <> 'cancelled'
              AND "invoiceDate" >= ${sixMonthsAgo}
            GROUP BY TO_CHAR("invoiceDate", 'YYYY-MM')
            ORDER BY month ASC
          `,
        ),
        tx.customer.count({
          where: {
            companyId,
            isActive: true,
            verificationStatus: { in: ['missing', 'partial'] },
          },
        }),
        tx.customer.count({
          where: {
            companyId,
            isActive: true,
            vatEvidenceStatus: 'missing',
          },
        }),
      ]);
    });

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const receivables = receivableRows.map((row) => {
      const paidAmount = row.paidAmount ?? 0;
      const outstandingAmount = Math.max(row.total - paidAmount, 0);
      const dueDate = row.dueDate ?? row.invoiceDate;
      const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      const ageDays = outstandingAmount > 0
        ? Math.max(0, Math.floor((startOfDay.getTime() - dueStart.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
      return { outstandingAmount, ageDays };
    });

    const totalOutstanding = receivables.reduce((sum, row) => sum + row.outstandingAmount, 0);
    const overdueOutstanding = receivables.filter((row) => row.ageDays > 0).reduce((sum, row) => sum + row.outstandingAmount, 0);
    const currentOutstanding = receivables.filter((row) => row.ageDays === 0).reduce((sum, row) => sum + row.outstandingAmount, 0);

    res.json({
      data: {
        totalInvoices,
        totalRevenue: totalRevenueAgg._sum.total ?? 0,
        pendingCount,
        rdSuccessCount,
        rdPendingCount,
        receivables: {
          totalOutstanding,
          overdueOutstanding,
          currentOutstanding,
          aging: {
            current: currentOutstanding,
            days1To30: receivables.filter((row) => row.ageDays >= 1 && row.ageDays <= 30).reduce((sum, row) => sum + row.outstandingAmount, 0),
            days31To60: receivables.filter((row) => row.ageDays >= 31 && row.ageDays <= 60).reduce((sum, row) => sum + row.outstandingAmount, 0),
            days61To90: receivables.filter((row) => row.ageDays >= 61 && row.ageDays <= 90).reduce((sum, row) => sum + row.outstandingAmount, 0),
            days90Plus: receivables.filter((row) => row.ageDays > 90).reduce((sum, row) => sum + row.outstandingAmount, 0),
          },
        },
        monthlyRevenue: monthlyRows.map((row) => ({
          month: row.month,
          total: Number(row.total),
        })),
        customerReadiness: {
          actionNeeded: customerActionNeeded,
          vatEvidenceMissing: customerVatEvidenceMissing,
        },
      },
    });
  } catch (err) {
    logger.error('Failed to fetch dashboard stats', { err });
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

/* ─── GET /api/dashboard/rd-compliance ─── */
dashboardRouter.get('/rd-compliance', async (req, res) => {
  try {
    const companyId = req.user!.companyId;

    // Last 3 full months + current partial month
    const months: { year: number; month: number; label: string }[] = [];
    const now = new Date();
    for (let i = 3; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      });
    }

    const results = await Promise.all(
      months.map(async ({ year, month, label }) => {
        const start = new Date(year, month - 1, 1);
        const end   = new Date(year, month, 0, 23, 59, 59);

        const rows = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
          return tx.invoice.groupBy({
            by: ['type', 'rdSubmissionStatus'],
            where: {
              companyId,
              invoiceDate: { gte: start, lte: end },
              status: { not: 'cancelled' },
            },
            _count: { id: true },
            _sum: { total: true },
          });
        });

        // Totals
        const total     = rows.reduce((s, r) => s + r._count.id, 0);
        const success   = rows.filter(r => r.rdSubmissionStatus === 'success').reduce((s, r) => s + r._count.id, 0);
        const failed    = rows.filter(r => r.rdSubmissionStatus === 'failed').reduce((s, r) => s + r._count.id, 0);
        const pending   = rows.filter(r => ['pending', 'in_progress', 'retrying'].includes(r.rdSubmissionStatus ?? '')).reduce((s, r) => s + r._count.id, 0);
        const unsubmitted = total - success - failed - pending;

        // Deadline: 15th of the following month
        const deadline  = new Date(year, month, 15);
        const isPast    = now > deadline;
        const daysLeft  = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return {
          month: label,
          deadline: deadline.toISOString().split('T')[0],
          isPast,
          daysLeft: isPast ? 0 : daysLeft,
          total,
          success,
          failed,
          pending,
          unsubmitted,
          complianceRate: total > 0 ? Math.round((success / total) * 100) : 100,
          byType: ['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note'].map(type => {
            const typeRows = rows.filter(r => r.type === type);
            const typeTotal = typeRows.reduce((s, r) => s + r._count.id, 0);
            const typeSuccess = typeRows.filter(r => r.rdSubmissionStatus === 'success').reduce((s, r) => s + r._count.id, 0);
            return {
              type,
              code: { tax_invoice: 'T02', tax_invoice_receipt: 'T01', receipt: 'T03', credit_note: 'T04', debit_note: 'T05' }[type] ?? type,
              total: typeTotal,
              success: typeSuccess,
              failed: typeRows.filter(r => r.rdSubmissionStatus === 'failed').reduce((s, r) => s + r._count.id, 0),
              totalAmount: typeRows.reduce((s, r) => s + (r._sum.total ?? 0), 0),
            };
          }).filter(t => t.total > 0),
        };
      }),
    );

    res.json({ data: results });
  } catch (err) {
    logger.error('Failed to fetch RD compliance stats', { err });
    res.status(500).json({ error: 'Failed to fetch RD compliance stats' });
  }
});

/* ─── GET /api/dashboard/drive-summary ─── */
dashboardRouter.get('/drive-summary', async (req, res) => {
  try {
    const companyId = req.user!.companyId;

    const [company, currentUser, projects, recentFiles] = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return Promise.all([
        tx.company.findUnique({
          where: { id: companyId },
          select: {
            nameTh: true,
            nameEn: true,
            taxId: true,
            email: true,
            googleDriveOwnerUserId: true,
            googleDriveOwnerLinkedAt: true,
            googleWorkspaceSheetUrl: true,
            googleWorkspaceSheetSyncedAt: true,
          },
        }),
        tx.user.findUnique({
          where: { id: req.user!.userId },
          select: { id: true, email: true, googleRefreshToken: true, googleDriveLinkedAt: true },
        }),
        tx.project.findMany({
          where: { companyId, status: { not: 'archived' } },
          orderBy: { updatedAt: 'desc' },
          take: 50,
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            driveFolderUrl: true,
            googleSheetUrl: true,
            _count: {
              select: {
                documentIntakes: {
                  where: { driveUrl: { not: null } },
                },
              },
            },
          },
        }),
        tx.documentIntake.findMany({
          where: {
            companyId,
            driveUrl: { not: null },
          },
          orderBy: { driveSyncedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            fileName: true,
            driveUrl: true,
            driveFolderUrl: true,
            source: true,
            driveSyncedAt: true,
            project: { select: { code: true, name: true } },
          },
        }),
      ]);
    });

    const driveConnected = !!currentUser?.googleRefreshToken;
    const driveConfigured = isDriveConfigured();
    const serviceAccountConfigured = isDriveServiceAccountConfigured();
    const oauthConfigured = isUserDriveOAuthConfigured();
    const companyDriveOwner = company?.googleDriveOwnerUserId
      ? await withRlsContext(prisma, tenantRlsContext(req.user!), (tx) => tx.user.findFirst({
        where: { id: company.googleDriveOwnerUserId!, companyId },
        select: { id: true, email: true, name: true, googleDriveLinkedAt: true, googleRefreshToken: true },
      }))
      : null;
    const companyDriveOwnerConnected = !!companyDriveOwner?.googleRefreshToken;

    res.json({
      data: {
        companyName: company?.nameTh ?? company?.nameEn ?? null,
        driveConnected,
        driveConfigured,
        oauthConfigured,
        serviceAccountConfigured,
        sheetsConfigured: isSheetsConfigured(),
        linkedAt: currentUser?.googleDriveLinkedAt ?? null,
        companyDriveOwner: companyDriveOwner
          ? {
              id: companyDriveOwner.id,
              email: companyDriveOwner.email,
              name: companyDriveOwner.name,
              linkedAt: companyDriveOwner.googleDriveLinkedAt,
              connected: companyDriveOwnerConnected,
            }
          : null,
        driveMode: companyDriveOwnerConnected
          ? 'company_owner'
          : (driveConnected
              ? 'current_user'
              : (serviceAccountConfigured ? 'service_account' : (oauthConfigured ? 'oauth_ready' : 'not_configured'))),
        workspaceSheetUrl: company?.googleWorkspaceSheetUrl ?? null,
        workspaceSheetSyncedAt: company?.googleWorkspaceSheetSyncedAt ?? null,
        projects: projects.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          status: p.status,
          driveFolderUrl: p.driveFolderUrl,
          googleSheetUrl: p.googleSheetUrl,
          fileCount: p._count.documentIntakes,
        })),
        recentFiles: recentFiles.map((f) => ({
          id: f.id,
          fileName: f.fileName ?? f.id,
          driveUrl: f.driveUrl,
          driveFolderUrl: f.driveFolderUrl,
          projectName: f.project?.name ?? null,
          projectCode: f.project?.code ?? null,
          source: f.source,
          driveSyncedAt: f.driveSyncedAt,
        })),
      },
    });
  } catch (err) {
    logger.error('Failed to load drive summary', { error: err });
    res.status(500).json({ error: 'Failed to load drive summary' });
  }
});

/* ─── POST /api/dashboard/drive/folder ─── */
dashboardRouter.post('/drive/folder', async (req, res) => {
  try {
    const companyId = req.user!.companyId;

    const { company, currentUser, companyOwner } = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [companyRecord, userRecord] = await Promise.all([
        tx.company.findUnique({
          where: { id: companyId },
          select: { nameTh: true, nameEn: true, taxId: true, email: true, googleDriveOwnerUserId: true },
        }),
        tx.user.findUnique({
          where: { id: req.user!.userId },
          select: { email: true, googleRefreshToken: true },
        }),
      ]);
      const owner = companyRecord?.googleDriveOwnerUserId
        ? await tx.user.findFirst({
          where: { id: companyRecord.googleDriveOwnerUserId, companyId },
          select: { email: true, googleRefreshToken: true },
        })
        : null;
      return { company: companyRecord, currentUser: userRecord, companyOwner: owner };
    });

    const companyName = company?.nameTh ?? company?.nameEn ?? companyId;
    const selectedRefreshToken = companyOwner?.googleRefreshToken ?? currentUser?.googleRefreshToken ?? null;
    const folder = await ensureCompanyDriveFolder({
      companyName,
      companyTaxId: company?.taxId ?? null,
      userRefreshToken: selectedRefreshToken,
      shareWithEmails: [company?.email, companyOwner?.email, currentUser?.email].filter(Boolean) as string[],
    });

    res.json({
      data: {
        folderId: folder.folderId,
        folderUrl: folder.folderUrl,
        userDrive: folder.userDrive,
      },
    });
  } catch (err) {
    logger.error('Failed to ensure company Drive folder', { error: err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create company Drive folder' });
  }
});

/* ─── POST /api/dashboard/workspace-sheet/sync ───
 * Trigger an immediate Master Sheet rebuild for the caller's company.
 * Returns the existing sheet URL when available (the worker queue is
 * debounced — synchronous "create new sheet on first call" would block
 * the request 5–15s, so we expose a fast-path: if the row already has
 * a sheet, return its URL; otherwise enqueue + tell the client to retry.
 */
dashboardRouter.post('/workspace-sheet/sync', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const company = await withSystemRlsContext(prisma, (tx) => tx.company.findUnique({
      where: { id: companyId },
      select: { googleWorkspaceSheetUrl: true, googleDriveOwnerUserId: true },
    }));
    const [companyOwner, currentUser] = await Promise.all([
      company?.googleDriveOwnerUserId
        ? withSystemRlsContext(prisma, (tx) => tx.user.findFirst({
          where: { id: company.googleDriveOwnerUserId!, companyId },
          select: { googleRefreshToken: true },
        }))
        : Promise.resolve(null),
      withSystemRlsContext(prisma, (tx) => tx.user.findFirst({
        where: { id: req.user!.userId, companyId },
        select: { googleRefreshToken: true },
      })),
    ]);

    if (!isDriveServiceAccountConfigured() && !companyOwner?.googleRefreshToken) {
      if (currentUser?.googleRefreshToken) {
        await withSystemRlsContext(prisma, (tx) => tx.company.update({
          where: { id: companyId },
          data: { googleDriveOwnerUserId: req.user!.userId, googleDriveOwnerLinkedAt: new Date() },
        }));
      } else {
        res.status(409).json({
          error: 'Connect a company Google Drive owner before creating the master tax register sheet.',
          data: { status: 'needs_drive_owner' },
        });
        return;
      }
    }

    if (!isDriveServiceAccountConfigured() && !isUserDriveOAuthConfigured()) {
      res.status(409).json({
        error: 'Google Drive OAuth is not configured for this environment.',
        data: { status: 'not_configured' },
      });
      return;
    }

    // Bypass the worker queue's debounce by removing the existing
    // scheduled job (if any) before re-enqueueing. The worker dedupes
    // on jobId, so this guarantees a fresh run.
    await masterSheetQueue.remove(`master-sheet-${companyId}`).catch(() => undefined);
    const queued = await enqueueMasterSheetSync(companyId, { immediate: true });

    if (!queued) {
      res.status(409).json({
        error: 'Google Sheets is not configured for this environment.',
        data: { status: 'not_configured' },
      });
      return;
    }

    res.json({
      data: {
        url: company?.googleWorkspaceSheetUrl ?? null,
        status: company?.googleWorkspaceSheetUrl ? 'ready' : 'queued',
      },
    });
  } catch (err) {
    logger.error('workspace-sheet sync failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to trigger workspace sheet sync' });
  }
});

/* ─── POST /api/dashboard/rd-compliance/trigger ─── (manual trigger for testing) */
dashboardRouter.post('/rd-compliance/trigger', async (req, res) => {
  try {
    const { year, month } = req.body as { year?: number; month?: number };
    const job = await rdComplianceQueue.add(
      'manual-rd-compliance-check',
      { triggeredBy: 'manual', year, month },
      { priority: 1 },
    );
    res.json({ message: 'Compliance check triggered', jobId: job.id });
  } catch (err) {
    logger.error('Failed to trigger compliance check', { err });
    res.status(500).json({ error: 'Failed to trigger compliance check' });
  }
});

/* ─── GET /api/company/profile ─── */
dashboardRouter.get('/profile', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: {
        nameTh: true,
        nameEn: true,
        taxId: true,
        branchCode: true,
        branchNameTh: true,
        addressTh: true,
        addressEn: true,
        phone: true,
        email: true,
        logoUrl: true,
        documentBankAccounts: true,
        documentSignatureProfile: true,
        certificateBlob: true,
        certificatePath: true,
        certificatePassword: true,
        rdClientId: true,
        rdClientSecret: true,
        rdEnvironment: true,
      },
    });

    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    const {
      certificateBlob,
      certificatePath,
      certificatePassword,
      rdClientId,
      rdClientSecret,
      rdEnvironment,
      ...profile
    } = company;
    const runtimeConfig = resolveCompanyRuntimeConfig({
      certificateBlob,
      certificatePath,
      certificatePassword,
      rdClientId,
      rdClientSecret,
      rdEnvironment,
    });
    const certStatus = getCertificateInfo({
      certBlob: runtimeConfig.certBlob,
      certPath: runtimeConfig.certPath,
      certPassword: runtimeConfig.certPassword,
      cacheKey: req.user!.companyId,
    });
    const electronicInvoicingReady = Boolean(
      runtimeConfig.rdClientId &&
      runtimeConfig.rdClientSecret &&
      certStatus.loaded &&
      !certStatus.isExpired &&
      !certStatus.isDev,
    );

    res.json({ data: { ...profile, electronicInvoicingReady } });
  } catch (err) {
    logger.error('Failed to fetch company profile', { err });
    res.status(500).json({ error: 'Failed to fetch company profile' });
  }
});

/* ─── GET /api/company/document-profile ─── */
dashboardRouter.get('/document-profile', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: {
        documentBankAccounts: true,
        documentSignatureProfile: true,
      },
    });

    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    res.json({
      data: {
        bankAccounts: Array.isArray(company.documentBankAccounts) ? company.documentBankAccounts : [],
        signatureProfile: company.documentSignatureProfile ?? null,
      },
    });
  } catch (err) {
    logger.error('Failed to fetch document profile', { err });
    res.status(500).json({ error: 'Failed to fetch document profile' });
  }
});

/* ─── PATCH /api/company/document-profile ─── */
dashboardRouter.patch('/document-profile', async (req, res) => {
  try {
    const body = documentProfileSchema.parse(req.body);
    const data: Prisma.CompanyUpdateInput = {};

    if (body.bankAccounts !== undefined) {
      data.documentBankAccounts = normalizeBankAccounts(body.bankAccounts) as Prisma.InputJsonValue;
    }

    if (body.signatureProfile !== undefined) {
      data.documentSignatureProfile = body.signatureProfile
        ? {
            signatureImageUrl: body.signatureProfile.signatureImageUrl ?? null,
            signerName: body.signatureProfile.signerName?.trim() || null,
            signerTitle: body.signatureProfile.signerTitle?.trim() || null,
            securityNote: body.signatureProfile.securityNote?.trim() || null,
            updatedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue
        : Prisma.JsonNull;
    }

    const company = await prisma.company.update({
      where: { id: req.user!.companyId },
      data,
      select: {
        documentBankAccounts: true,
        documentSignatureProfile: true,
      },
    });

    res.json({
      data: {
        bankAccounts: Array.isArray(company.documentBankAccounts) ? company.documentBankAccounts : [],
        signatureProfile: company.documentSignatureProfile ?? null,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid document profile', details: err.errors });
      return;
    }
    logger.error('Failed to update document profile', { err });
    res.status(500).json({ error: 'Failed to update document profile' });
  }
});
