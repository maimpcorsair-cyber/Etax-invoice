import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { generateCustomerStatementExcel } from '../services/exportService';
import { generateCustomerStatementPdf } from '../services/pdfService';
import { sendStatementToCustomer } from '../services/emailService';
import { auditLog } from '../services/auditService';
import { logger } from '../config/logger';
import { uploadToDrive, isDriveConfigured } from '../services/googleDriveService';
import type { DriveCustomerDocumentFolder } from '../services/googleDriveService';
import {
  buildCustomerReadiness,
  normalizeCustomerKind,
  normalizeCustomerPartyRole,
  normalizeCustomerUseCase,
} from '../services/customerReadinessService';
import type { CustomerDocumentType, CustomerUseCase } from '../services/customerReadinessService';
import {
  getLimitErrorMessage,
  getUsageLimit,
  getUsageValue,
  hasFeatureAccess,
  resolveCompanyAccessPolicy,
} from '../services/accessPolicyService';

export const customersRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const customerKindSchema = z.enum(['company', 'individual']).default('company');
const customerPartyRoleSchema = z.enum(['customer', 'supplier', 'both']).default('customer');
const customerUseCaseSchema = z.enum(['general', 'full_tax_invoice', 'credit', 'contract_project', 'vendor_payee']).default('general');
const documentTypeSchema = z.enum([
  'company_registration',
  'vat_certificate',
  'contract',
  'credit_agreement',
  'director_id',
  'personal_id',
  'bank_account',
  'other',
]);
const documentStatusSchema = z.enum(['uploaded', 'verified', 'rejected']);

const optionalCurrencySchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'string') return Number(value.replace(/,/g, ''));
  return value;
}, z.number().min(0).max(9999999999.99).nullable().optional());

const optionalCreditDaysSchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'string') return Number(value);
  return value;
}, z.number().int().min(0).max(3650).nullable().optional());

const customerSchema = z.object({
  nameTh: z.string().min(1),
  nameEn: z.string().optional(),
  taxId: z.string().length(13),
  branchCode: z.string().default('00000'),
  branchNameTh: z.string().optional(),
  branchNameEn: z.string().optional(),
  addressTh: z.string().min(1),
  addressEn: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  contactPerson: z.string().optional(),
  personalId: z.string().length(13).optional().or(z.literal('')),  // เลขบัตร ปชช. (บุคคลธรรมดา)
  creditLimit: optionalCurrencySchema,
  creditDays: optionalCreditDaysSchema,
  partyRole: customerPartyRoleSchema.optional(),
  customerKind: customerKindSchema.optional(),
  useCase: customerUseCaseSchema.optional(),
});

const customerDocumentPatchSchema = z.object({
  status: documentStatusSchema.optional(),
  notes: z.string().max(500).optional().nullable(),
});

const customerDocumentUploadSchema = z.object({
  documentType: documentTypeSchema,
  requiredFor: customerUseCaseSchema.optional(),
  notes: z.string().max(500).optional().nullable(),
});

function sensitiveDocumentType(documentType: string) {
  return ['director_id', 'personal_id'].includes(documentType);
}

function customerDriveFolder(documentType: CustomerDocumentType): DriveCustomerDocumentFolder {
  if (documentType === 'company_registration') return '01_Registration';
  if (documentType === 'vat_certificate') return '02_VAT';
  if (documentType === 'director_id' || documentType === 'personal_id') return '04_ID_Verification';
  if (documentType === 'bank_account') return '05_Bank_Accounts';
  return '03_Contracts_Credit';
}

function normalizeCustomerPayload(body: z.infer<typeof customerSchema>) {
  const customerKind = normalizeCustomerKind(body.customerKind, body.personalId);
  const useCase = normalizeCustomerUseCase(body.useCase);
  const partyRole = normalizeCustomerPartyRole(body.partyRole, useCase);
  const personalId = customerKind === 'individual' ? body.personalId || body.taxId : body.personalId || '';
  return {
    ...body,
    partyRole,
    customerKind,
    useCase: partyRole === 'supplier' && useCase === 'general' ? 'vendor_payee' : useCase,
    personalId,
    branchCode: customerKind === 'individual' ? '00000' : body.branchCode,
    branchNameTh: customerKind === 'individual' ? '' : body.branchNameTh,
    branchNameEn: customerKind === 'individual' ? '' : body.branchNameEn,
    nameEn: customerKind === 'individual' ? '' : body.nameEn,
    addressEn: customerKind === 'individual' ? '' : body.addressEn,
  };
}

function normalizeCustomerPatch(body: Partial<z.infer<typeof customerSchema>>) {
  const update: Record<string, unknown> = { ...body };
  const explicitKind = body.customerKind;
  const explicitRole = body.partyRole;
  if (explicitKind) update.customerKind = normalizeCustomerKind(explicitKind, body.personalId);
  if (explicitRole) update.partyRole = normalizeCustomerPartyRole(explicitRole, body.useCase);
  if (body.useCase || explicitRole === 'supplier') {
    const useCase = normalizeCustomerUseCase(body.useCase);
    update.useCase = explicitRole === 'supplier' && useCase === 'general' ? 'vendor_payee' : useCase;
  }
  if (explicitKind === 'individual') {
    const personalId = body.personalId || body.taxId || '';
    update.taxId = personalId;
    update.personalId = personalId;
    update.branchCode = '00000';
    update.branchNameTh = '';
    update.branchNameEn = '';
    update.nameEn = '';
    update.addressEn = '';
  } else if (explicitKind === 'company') {
    update.personalId = body.personalId || '';
  }
  return update;
}

function withReadiness<T extends {
  documents?: Array<{ documentType: string; status: string }>;
  partyRole?: string | null;
  customerKind?: string | null;
  useCase?: string | null;
  personalId?: string | null;
  nameTh?: string | null;
  taxId?: string | null;
  branchCode?: string | null;
  addressTh?: string | null;
}>(customer: T) {
  const documents = customer.documents ?? [];
  return {
    ...customer,
    readiness: buildCustomerReadiness(customer, documents),
  };
}

async function loadCustomerForCompany(companyId: string, customerId: string) {
  return withRlsContext(prisma, { companyId, systemMode: false }, async (tx) => {
    return tx.customer.findFirst({
      where: { id: customerId, companyId, isActive: true },
      include: { documents: { orderBy: { uploadedAt: 'desc' } } },
    });
  });
}

async function getDriveUploadContext(companyId: string, currentUserId: string) {
  const [company, currentUser] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { nameTh: true, nameEn: true, email: true, googleDriveOwnerUserId: true },
    }),
    prisma.user.findFirst({
      where: { id: currentUserId, companyId },
      select: { email: true, googleRefreshToken: true },
    }),
  ]);

  const owner = company?.googleDriveOwnerUserId
    ? await prisma.user.findFirst({
      where: { id: company.googleDriveOwnerUserId, companyId },
      select: { email: true, googleRefreshToken: true },
    })
    : null;

  return {
    companyName: company?.nameTh ?? company?.nameEn ?? 'Billboy',
    refreshToken: owner?.googleRefreshToken ?? currentUser?.googleRefreshToken ?? null,
    shareWithEmails: [company?.email, owner?.email, currentUser?.email].filter(Boolean) as string[],
  };
}

async function refreshCustomerReadiness(
  tx: Prisma.TransactionClient,
  companyId: string,
  customerId: string,
) {
  const customer = await tx.customer.findFirst({
    where: { id: customerId, companyId },
    include: { documents: true },
  });
  if (!customer) return null;
  const readiness = buildCustomerReadiness(customer, customer.documents);
  return tx.customer.update({
    where: { id: customer.id },
    data: {
      verificationStatus: readiness.status,
      vatEvidenceStatus: readiness.vatEvidenceStatus,
    },
    include: { documents: true },
  });
}

function supportedCustomerDocumentMimeType(mimeType: string) {
  return ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mimeType);
}

customersRouter.get('/', async (req, res) => {
  try {
    const { search, page = '1', limit = '50', partyRole } = req.query;
    const pageNumber = parseInt(page as string);
    const limitNumber = parseInt(limit as string);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Record<string, unknown> = { companyId: req.user!.companyId, isActive: true };
    const andFilters: Array<Record<string, unknown>> = [];
    if (partyRole === 'customer' || partyRole === 'supplier') {
      andFilters.push({ OR: [{ partyRole }, { partyRole: 'both' }] });
    } else if (partyRole === 'both') {
      andFilters.push({ partyRole: 'both' });
    }
    if (search) {
      andFilters.push({ OR: [
        { nameTh: { contains: search as string } },
        { nameEn: { contains: search as string, mode: 'insensitive' } },
        { taxId: { contains: search as string } },
      ] });
    }
    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const { customers, total } = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [items, count] = await Promise.all([
        tx.customer.findMany({
          where,
          skip,
          take: limitNumber,
          orderBy: { nameTh: 'asc' },
          include: { documents: { orderBy: { uploadedAt: 'desc' } } },
        }),
        tx.customer.count({ where }),
      ]);

      return { customers: items, total: count };
    });

    res.json({ data: customers.map(withReadiness), pagination: { page: pageNumber, total } });
  } catch {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

customersRouter.get('/:id/documents', async (req, res) => {
  try {
    const customer = await loadCustomerForCompany(req.user!.companyId, req.params.id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    res.json({ data: customer.documents, readiness: buildCustomerReadiness(customer, customer.documents) });
  } catch (err) {
    logger.error('Failed to fetch customer documents', { error: err, customerId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch customer documents' });
  }
});

customersRouter.post(
  '/:id/documents/upload',
  requireRole('admin', 'super_admin', 'accountant'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'File is required' });
        return;
      }
      if (!supportedCustomerDocumentMimeType(req.file.mimetype)) {
        res.status(400).json({ error: 'Only PDF, JPG, PNG, and WebP customer documents are supported' });
        return;
      }
      if (!isDriveConfigured()) {
        res.status(503).json({ error: 'Google Drive is not configured' });
        return;
      }

      const body = customerDocumentUploadSchema.parse(req.body);
      const customer = await loadCustomerForCompany(req.user!.companyId, req.params.id);
      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      const driveContext = await getDriveUploadContext(req.user!.companyId, req.user!.userId);
      const driveResult = await uploadToDrive(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        driveContext.companyName,
        driveContext.refreshToken,
        {
          customerCode: customer.taxId,
          customerName: customer.nameTh,
          customerDocumentFolder: customerDriveFolder(body.documentType),
          shareWithEmails: driveContext.shareWithEmails,
          duplicatePolicy: 'rename',
        },
      );

      const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        await tx.customerDocument.create({
          data: {
            companyId: req.user!.companyId,
            customerId: customer.id,
            uploadedById: req.user!.userId,
            documentType: body.documentType,
            requiredFor: body.requiredFor ?? (customer.useCase as CustomerUseCase) ?? 'general',
            status: 'uploaded',
            fileName: driveResult.fileName,
            mimeType: req.file!.mimetype,
            fileSize: req.file!.size,
            driveFileId: driveResult.fileId,
            driveUrl: driveResult.url,
            driveFolderId: driveResult.folderId,
            driveFolderUrl: driveResult.folderUrl,
            driveUserDrive: driveResult.userDrive,
            sensitive: sensitiveDocumentType(body.documentType),
            notes: body.notes ?? null,
          },
        });
        return refreshCustomerReadiness(tx, req.user!.companyId, customer.id);
      });

      res.status(201).json({
        data: updated?.documents ?? [],
        readiness: updated ? buildCustomerReadiness(updated, updated.documents) : null,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: err.errors });
        return;
      }
      logger.error('Failed to upload customer document', { error: err, customerId: req.params.id });
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to upload customer document' });
    }
  },
);

customersRouter.patch(
  '/:id/documents/:documentId',
  requireRole('admin', 'super_admin', 'accountant'),
  async (req, res) => {
    try {
      const body = customerDocumentPatchSchema.parse(req.body);
      const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        const existing = await tx.customerDocument.findFirst({
          where: { id: req.params.documentId, customerId: req.params.id, companyId: req.user!.companyId },
        });
        if (!existing) return null;

        await tx.customerDocument.update({
          where: { id: existing.id },
          data: {
            ...(body.status ? { status: body.status, verifiedAt: body.status === 'verified' ? new Date() : null } : {}),
            ...(body.notes !== undefined ? { notes: body.notes } : {}),
          },
        });
        return refreshCustomerReadiness(tx, req.user!.companyId, req.params.id);
      });
      if (!updated) {
        res.status(404).json({ error: 'Customer document not found' });
        return;
      }
      res.json({ data: updated.documents, readiness: buildCustomerReadiness(updated, updated.documents) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: err.errors });
        return;
      }
      logger.error('Failed to update customer document', { error: err, documentId: req.params.documentId });
      res.status(500).json({ error: 'Failed to update customer document' });
    }
  },
);

customersRouter.delete(
  '/:id/documents/:documentId',
  requireRole('admin', 'super_admin', 'accountant'),
  async (req, res) => {
    try {
      const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        const existing = await tx.customerDocument.findFirst({
          where: { id: req.params.documentId, customerId: req.params.id, companyId: req.user!.companyId },
        });
        if (!existing) return null;
        await tx.customerDocument.delete({ where: { id: existing.id } });
        return refreshCustomerReadiness(tx, req.user!.companyId, req.params.id);
      });
      if (!updated) {
        res.status(404).json({ error: 'Customer document not found' });
        return;
      }
      res.json({ data: updated.documents, readiness: buildCustomerReadiness(updated, updated.documents) });
    } catch (err) {
      logger.error('Failed to delete customer document metadata', { error: err, documentId: req.params.documentId });
      res.status(500).json({ error: 'Failed to delete customer document' });
    }
  },
);

customersRouter.get('/:id/statement', async (req, res) => {
  try {
    const customer = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.customer.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId, isActive: true },
      });
    });

    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const invoices = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findMany({
        where: {
          companyId: req.user!.companyId,
          buyerId: customer.id,
          status: { not: 'cancelled' },
        },
        orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          payments: {
            orderBy: { paidAt: 'desc' },
          },
        },
      });
    });

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const chargeTypes = new Set(['tax_invoice', 'debit_note']);
    const creditTypes = new Set(['credit_note']);

    const chronologicalEntries = [...invoices].reverse().map((invoice) => {
      const paidAmount = invoice.paidAmount ?? invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
      const signedTotal = creditTypes.has(invoice.type) ? -invoice.total : invoice.total;
      const outstandingAmount = chargeTypes.has(invoice.type)
        ? Math.max(invoice.total - paidAmount, 0)
        : 0;
      const dueDate = invoice.dueDate ?? invoice.invoiceDate;
      const dueDateStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      const ageDays = outstandingAmount > 0
        ? Math.max(0, Math.floor((startOfDay.getTime() - dueDateStart.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        type: invoice.type,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        total: invoice.total,
        signedTotal,
        paidAmount,
        outstandingAmount,
        isPaid: invoice.isPaid,
        ageDays,
        rdSubmissionStatus: invoice.rdSubmissionStatus,
        paymentCount: invoice.payments.length,
      };
    });

    let runningBalance = 0;
    const statementEntries = chronologicalEntries
      .map((entry) => {
        runningBalance += entry.signedTotal - entry.paidAmount;
        return { ...entry, runningBalance };
      })
      .reverse();

    const outstandingEntries = statementEntries.filter((entry) => entry.outstandingAmount > 0);
    const totalOutstanding = outstandingEntries.reduce((sum, entry) => sum + entry.outstandingAmount, 0);
    const overdueOutstanding = outstandingEntries
      .filter((entry) => entry.ageDays > 0)
      .reduce((sum, entry) => sum + entry.outstandingAmount, 0);
    const currentOutstanding = outstandingEntries
      .filter((entry) => entry.ageDays === 0)
      .reduce((sum, entry) => sum + entry.outstandingAmount, 0);

    const aging = {
      current: currentOutstanding,
      days1To30: outstandingEntries.filter((entry) => entry.ageDays >= 1 && entry.ageDays <= 30).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days31To60: outstandingEntries.filter((entry) => entry.ageDays >= 31 && entry.ageDays <= 60).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days61To90: outstandingEntries.filter((entry) => entry.ageDays >= 61 && entry.ageDays <= 90).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days90Plus: outstandingEntries.filter((entry) => entry.ageDays > 90).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
    };

    const summary = {
      totalDocuments: statementEntries.length,
      openInvoices: outstandingEntries.length,
      totalOutstanding,
      overdueOutstanding,
      currentOutstanding,
      totalBilled: statementEntries
        .filter((entry) => entry.signedTotal > 0)
        .reduce((sum, entry) => sum + entry.signedTotal, 0),
      totalCredits: Math.abs(
        statementEntries
          .filter((entry) => entry.signedTotal < 0)
          .reduce((sum, entry) => sum + entry.signedTotal, 0),
      ),
      totalReceived: invoices.reduce((sum, invoice) => sum + (invoice.paidAmount ?? invoice.payments.reduce((inner, payment) => inner + payment.amount, 0)), 0),
    };

    res.json({
      data: {
        customer,
        summary,
        aging,
        entries: statementEntries,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to load customer statement' });
  }
});

customersRouter.get('/:id/statement/export', async (req, res) => {
  try {
    const customer = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.customer.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId, isActive: true },
      });
    });
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const invoices = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findMany({
        where: {
          companyId: req.user!.companyId,
          buyerId: customer.id,
          status: { not: 'cancelled' },
        },
        orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
        include: { payments: { orderBy: { paidAt: 'desc' } } },
      });
    });

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const chargeTypes = new Set(['tax_invoice', 'debit_note']);
    const creditTypes = new Set(['credit_note']);

    let runningBalance = 0;
    const entries = [...invoices]
      .reverse()
      .map((invoice) => {
        const paidAmount = invoice.paidAmount ?? invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
        const signedTotal = creditTypes.has(invoice.type) ? -invoice.total : invoice.total;
        const outstandingAmount = chargeTypes.has(invoice.type)
          ? Math.max(invoice.total - paidAmount, 0)
          : 0;
        const dueDate = invoice.dueDate ?? invoice.invoiceDate;
        const dueDateStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        const ageDays = outstandingAmount > 0
          ? Math.max(0, Math.floor((startOfDay.getTime() - dueDateStart.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;
        runningBalance += signedTotal - paidAmount;
        return {
          invoiceNumber: invoice.invoiceNumber,
          type: invoice.type,
          status: invoice.status,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          signedTotal,
          paidAmount,
          outstandingAmount,
          runningBalance,
          ageDays,
        };
      });

    const summary = {
      totalOutstanding: entries.reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      overdueOutstanding: entries.filter((entry) => entry.ageDays > 0).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      currentOutstanding: entries.filter((entry) => entry.ageDays === 0).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      totalBilled: entries.filter((entry) => entry.signedTotal > 0).reduce((sum, entry) => sum + entry.signedTotal, 0),
      totalCredits: Math.abs(entries.filter((entry) => entry.signedTotal < 0).reduce((sum, entry) => sum + entry.signedTotal, 0)),
      totalReceived: entries.reduce((sum, entry) => sum + entry.paidAmount, 0),
    };
    const aging = {
      current: entries.filter((entry) => entry.ageDays === 0).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days1To30: entries.filter((entry) => entry.ageDays >= 1 && entry.ageDays <= 30).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days31To60: entries.filter((entry) => entry.ageDays >= 31 && entry.ageDays <= 60).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days61To90: entries.filter((entry) => entry.ageDays >= 61 && entry.ageDays <= 90).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days90Plus: entries.filter((entry) => entry.ageDays > 90).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
    };

    const buffer = await generateCustomerStatementExcel({
      customerNameTh: customer.nameTh,
      customerNameEn: customer.nameEn,
      generatedAt: new Date(),
      summary,
      aging,
      entries,
    });

    const filename = `statement-${customer.taxId}-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch {
    res.status(500).json({ error: 'Failed to export customer statement' });
  }
});

customersRouter.get('/:id/statement/pdf', async (req, res) => {
  try {
    const customer = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.customer.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId, isActive: true },
      });
    });
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const [company, invoices] = await Promise.all([
      prisma.company.findUnique({ where: { id: req.user!.companyId } }),
      withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        return tx.invoice.findMany({
          where: {
            companyId: req.user!.companyId,
            buyerId: customer.id,
            status: { not: 'cancelled' },
          },
          orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
          include: { payments: { orderBy: { paidAt: 'desc' } } },
        });
      }),
    ]);

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const chargeTypes = new Set(['tax_invoice', 'debit_note']);
    const creditTypes = new Set(['credit_note']);

    let runningBalance = 0;
    const entries = [...invoices]
      .reverse()
      .map((invoice) => {
        const paidAmount = invoice.paidAmount ?? invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
        const signedTotal = creditTypes.has(invoice.type) ? -invoice.total : invoice.total;
        const outstandingAmount = chargeTypes.has(invoice.type) ? Math.max(invoice.total - paidAmount, 0) : 0;
        const dueDate = invoice.dueDate ?? invoice.invoiceDate;
        const dueDateStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        const ageDays = outstandingAmount > 0
          ? Math.max(0, Math.floor((startOfDay.getTime() - dueDateStart.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;
        runningBalance += signedTotal - paidAmount;
        return {
          invoiceNumber: invoice.invoiceNumber,
          type: invoice.type,
          status: invoice.status,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          signedTotal,
          paidAmount,
          outstandingAmount,
          runningBalance,
          ageDays,
        };
      });

    const summary = {
      totalOutstanding: entries.reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      overdueOutstanding: entries.filter((entry) => entry.ageDays > 0).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      currentOutstanding: entries.filter((entry) => entry.ageDays === 0).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      totalBilled: entries.filter((entry) => entry.signedTotal > 0).reduce((sum, entry) => sum + entry.signedTotal, 0),
      totalCredits: Math.abs(entries.filter((entry) => entry.signedTotal < 0).reduce((sum, entry) => sum + entry.signedTotal, 0)),
      totalReceived: entries.reduce((sum, entry) => sum + entry.paidAmount, 0),
    };
    const aging = {
      current: entries.filter((entry) => entry.ageDays === 0).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days1To30: entries.filter((entry) => entry.ageDays >= 1 && entry.ageDays <= 30).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days31To60: entries.filter((entry) => entry.ageDays >= 31 && entry.ageDays <= 60).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days61To90: entries.filter((entry) => entry.ageDays >= 61 && entry.ageDays <= 90).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days90Plus: entries.filter((entry) => entry.ageDays > 90).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
    };

    const pdfBuffer = await generateCustomerStatementPdf({
      language: (req.query.lang === 'en' ? 'en' : 'th'),
      companyName: company?.nameTh ?? 'e-Tax Invoice System',
      customer: {
        nameTh: customer.nameTh,
        nameEn: customer.nameEn,
        taxId: customer.taxId,
        addressTh: customer.addressTh,
        addressEn: customer.addressEn,
        email: customer.email,
      },
      generatedAt: new Date(),
      summary,
      aging,
      entries,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="statement-${customer.taxId}.pdf"`);
    res.send(pdfBuffer);
  } catch {
    res.status(500).json({ error: 'Failed to generate customer statement PDF' });
  }
});

customersRouter.post('/:id/statement/send-email', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'send_invoice_email')) {
      res.status(403).json({ error: 'Upgrade your plan to send documents by email from the system' });
      return;
    }

    const customer = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.customer.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId, isActive: true },
      });
    });
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    if (!customer.email) {
      res.status(400).json({ error: 'Customer has no email address' });
      return;
    }

    const [company, invoices] = await Promise.all([
      prisma.company.findUnique({ where: { id: req.user!.companyId } }),
      withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        return tx.invoice.findMany({
          where: {
            companyId: req.user!.companyId,
            buyerId: customer.id,
            status: { not: 'cancelled' },
          },
          orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
          include: { payments: { orderBy: { paidAt: 'desc' } } },
        });
      }),
    ]);

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const chargeTypes = new Set(['tax_invoice', 'debit_note']);
    const creditTypes = new Set(['credit_note']);
    let runningBalance = 0;

    const entries = [...invoices]
      .reverse()
      .map((invoice) => {
        const paidAmount = invoice.paidAmount ?? invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
        const signedTotal = creditTypes.has(invoice.type) ? -invoice.total : invoice.total;
        const outstandingAmount = chargeTypes.has(invoice.type) ? Math.max(invoice.total - paidAmount, 0) : 0;
        const dueDate = invoice.dueDate ?? invoice.invoiceDate;
        const dueDateStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        const ageDays = outstandingAmount > 0
          ? Math.max(0, Math.floor((startOfDay.getTime() - dueDateStart.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;
        runningBalance += signedTotal - paidAmount;
        return {
          invoiceNumber: invoice.invoiceNumber,
          type: invoice.type,
          status: invoice.status,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          signedTotal,
          paidAmount,
          outstandingAmount,
          runningBalance,
          ageDays,
        };
      });

    const summary = {
      totalOutstanding: entries.reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      overdueOutstanding: entries.filter((entry) => entry.ageDays > 0).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      currentOutstanding: entries.filter((entry) => entry.ageDays === 0).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      totalBilled: entries.filter((entry) => entry.signedTotal > 0).reduce((sum, entry) => sum + entry.signedTotal, 0),
      totalCredits: Math.abs(entries.filter((entry) => entry.signedTotal < 0).reduce((sum, entry) => sum + entry.signedTotal, 0)),
      totalReceived: entries.reduce((sum, entry) => sum + entry.paidAmount, 0),
    };
    const aging = {
      current: entries.filter((entry) => entry.ageDays === 0).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days1To30: entries.filter((entry) => entry.ageDays >= 1 && entry.ageDays <= 30).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days31To60: entries.filter((entry) => entry.ageDays >= 31 && entry.ageDays <= 60).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days61To90: entries.filter((entry) => entry.ageDays >= 61 && entry.ageDays <= 90).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
      days90Plus: entries.filter((entry) => entry.ageDays > 90).reduce((sum, entry) => sum + entry.outstandingAmount, 0),
    };

    const language = req.body?.lang === 'en' ? 'en' : 'th';
    const pdfBuffer = await generateCustomerStatementPdf({
      language,
      companyName: company?.nameTh ?? 'e-Tax Invoice System',
      customer: {
        nameTh: customer.nameTh,
        nameEn: customer.nameEn,
        taxId: customer.taxId,
        addressTh: customer.addressTh,
        addressEn: customer.addressEn,
        email: customer.email,
      },
      generatedAt: new Date(),
      summary,
      aging,
      entries,
    });

    const filename = `statement-${customer.taxId}-${new Date().toISOString().split('T')[0]}.pdf`;
    await sendStatementToCustomer({
      customerNameTh: customer.nameTh,
      customerNameEn: customer.nameEn,
      customerEmail: customer.email,
      companyNameTh: company?.nameTh ?? 'e-Tax Invoice System',
      language,
      totalOutstanding: summary.totalOutstanding,
      generatedAt: new Date(),
      filename,
      pdfBuffer,
    });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'customer.statement_send_email',
      resourceType: 'customer',
      resourceId: customer.id,
      details: {
        customerNameTh: customer.nameTh,
        customerEmail: customer.email,
        totalOutstanding: summary.totalOutstanding,
        filename,
      },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language,
    });

    res.json({ message: 'Statement email sent', to: customer.email });
  } catch {
    res.status(500).json({ error: 'Failed to send statement email' });
  }
});

customersRouter.post('/', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    const limit = getUsageLimit(policy, 'customers');
    if (limit !== null && getUsageValue(policy, 'customers') >= limit) {
      res.status(403).json({ error: getLimitErrorMessage('customers', policy) });
      return;
    }

    const body = normalizeCustomerPayload(customerSchema.parse(req.body));
    const readiness = buildCustomerReadiness(body, []);
    const customer = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.customer.create({
        data: {
          ...body,
          companyId: req.user!.companyId,
          verificationStatus: readiness.status,
          vatEvidenceStatus: readiness.vatEvidenceStatus,
        },
        include: { documents: true },
      });
    });
    res.status(201).json({ data: withReadiness(customer) });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

customersRouter.put('/:id', async (req, res) => {
  try {
    const body = normalizeCustomerPatch(customerSchema.partial().parse(req.body));
    const customer = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const result = await tx.customer.updateMany({
        where: { id: req.params.id, companyId: req.user!.companyId },
        data: body as Prisma.CustomerUpdateManyMutationInput,
      });
      if (result.count === 0) return null;
      return refreshCustomerReadiness(tx, req.user!.companyId, req.params.id);
    });
    if (!customer) { res.status(404).json({ error: 'Customer not found' }); return; }
    res.json({ message: 'Customer updated', data: withReadiness(customer) });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

customersRouter.delete('/:id', async (req, res) => {
  try {
    const result = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.customer.updateMany({
        where: { id: req.params.id, companyId: req.user!.companyId },
        data: { isActive: false },
      });
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    res.json({ message: 'Customer deactivated' });
  } catch {
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});
