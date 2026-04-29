import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { authenticate, requireRole } from '../middleware/auth';
import { auditLog } from '../services/auditService';
import {
  hasFeatureAccess,
  resolveCompanyAccessPolicy,
} from '../services/accessPolicyService';
import { logger } from '../config/logger';
import { downloadFromStorage, getPresignedUrl, isStorageConfigured, uploadToStorage } from '../services/storageService';
import { ocrSupplierInvoice, OcrResult } from '../services/aiService';

export const purchaseInvoicesRouter = Router();

purchaseInvoicesRouter.use(authenticate);

const vatTypeEnum = z.enum(['vat7', 'vatExempt', 'vatZero']);

const createPurchaseInvoiceSchema = z.object({
  supplierName: z.string().min(1),
  supplierTaxId: z.string().regex(/^\d{13}$/, 'supplierTaxId must be 13 digits'),
  supplierBranch: z.string().optional().default('00000'),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().min(1),
  dueDate: z.string().optional(),
  subtotal: z.number().min(0),
  vatAmount: z.number().min(0).default(0),
  vatType: vatTypeEnum.default('vat7'),
  description: z.string().optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
  pdfUrl: z.string().optional(),
});

const updatePurchaseInvoiceSchema = createPurchaseInvoiceSchema;

const uploadDocumentSchema = z.object({
  fileName: z.string().optional(),
  mimeType: z.string().min(1),
  fileBase64: z.string().min(1),
});

const attachDocumentSchema = z.object({
  purchaseInvoiceId: z.string().min(1),
});

const purchaseRecordDocumentTypes = new Set<OcrResult['documentType']>([
  'tax_invoice',
  'receipt',
  'invoice',
  'billing_note',
  'expense_receipt',
  'credit_note',
  'debit_note',
]);

function documentFileUrl(item: { id: string; fileUrl?: string | null }) {
  return item.fileUrl || `/api/purchase-invoices/document-intakes/${item.id}/file`;
}

function documentDateRange(days = 30) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  return from;
}

async function findDuplicatePurchase(companyId: string, supplierTaxId: string, invoiceNumber: string) {
  if (!supplierTaxId || supplierTaxId.length !== 13 || !invoiceNumber) return null;
  return prisma.purchaseInvoice.findFirst({
    where: { companyId, supplierTaxId, invoiceNumber },
    select: {
      id: true,
      supplierName: true,
      supplierTaxId: true,
      invoiceNumber: true,
      invoiceDate: true,
      total: true,
      pdfUrl: true,
    },
  });
}

function normalizeOcrPurchasePayload(result: OcrResult, fileUrl?: string | null) {
  const supplierTaxId = (result.supplierTaxId ?? '').replace(/\D/g, '');
  const invoiceDate = result.invoiceDate || new Date().toISOString().slice(0, 10);
  const total = Number(result.total || 0);
  const vatAmount = Number(result.vatAmount || 0);
  const subtotal = Number(result.subtotal || (total > 0 ? Math.max(total - vatAmount, 0) : 0));
  const vatType = vatAmount > 0 ? 'vat7' : (result.taxTreatment === 'vat_exempt' ? 'vatExempt' : 'vatZero');
  const missing = [
    result.supplierName ? null : 'supplierName',
    supplierTaxId.length === 13 ? null : 'supplierTaxId',
    result.invoiceNumber ? null : 'invoiceNumber',
    result.invoiceDate ? null : 'invoiceDate',
    total > 0 ? null : 'total',
  ].filter(Boolean) as string[];

  return {
    missing,
    payload: {
      supplierName: result.supplierName || 'ไม่ทราบผู้ขาย',
      supplierTaxId,
      supplierBranch: result.supplierBranch || '00000',
      invoiceNumber: result.invoiceNumber || `OCR-${Date.now()}`,
      invoiceDate,
      dueDate: result.documentMetadata?.dueDate || undefined,
      subtotal,
      vatAmount,
      vatType: vatType as 'vat7' | 'vatExempt' | 'vatZero',
      description: [
        `Document AI confirmed (${result.documentTypeLabel || result.documentType})`,
        result.postingSuggestion,
        result.extractionProvider,
      ].filter(Boolean).join(' · '),
      category: result.expenseSubcategory || result.expenseCategory,
      notes: [
        result.confidence ? `AI confidence: ${result.confidence}` : null,
        result.validationWarnings?.length ? `Warnings: ${result.validationWarnings.join(', ')}` : null,
      ].filter(Boolean).join('\n') || undefined,
      pdfUrl: fileUrl || undefined,
    },
  };
}

async function readDocumentIntakeBuffer(item: { fileBase64?: string | null; storageKey?: string | null }) {
  if (item.fileBase64) return Buffer.from(item.fileBase64, 'base64');
  if (item.storageKey) return downloadFromStorage(item.storageKey);
  return null;
}

async function analyzeDocumentBuffer(buffer: Buffer, mimeType: string, companyId: string): Promise<OcrResult> {
  if (mimeType === 'application/pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();
      const pdfText = (textResult.text ?? '').trim().slice(0, 8000);
      if (pdfText.length > 30) {
        return ocrSupplierInvoice(Buffer.from(pdfText, 'utf-8').toString('base64'), 'text/plain', {
          pageCount: textResult.total ?? 1,
          source: 'text_pdf',
          companyId,
        });
      }
    } catch (err) {
      logger.warn('Purchase document pdf text extraction failed; falling back to OCR', { error: String(err) });
    }
    return ocrSupplierInvoice(buffer.toString('base64'), 'application/pdf', {
      source: 'scan_pdf',
      companyId,
    });
  }
  return ocrSupplierInvoice(buffer.toString('base64'), mimeType, {
    source: mimeType.startsWith('image/') ? 'image' : 'unknown',
    companyId,
  });
}

type ListQuery = {
  from?: string;
  to?: string;
  search?: string;
  page?: string;
  limit?: string;
};

/* ─── List ─── */
purchaseInvoicesRouter.get('/', async (req, res) => {
  try {
    const { from, to, search, page = '1', limit = '20' } = req.query as ListQuery;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.PurchaseInvoiceWhereInput = { companyId: req.user!.companyId };
    if (from || to) {
      where.invoiceDate = {};
      if (from) (where.invoiceDate as Prisma.DateTimeFilter).gte = new Date(from);
      if (to) (where.invoiceDate as Prisma.DateTimeFilter).lte = new Date(to);
    }
    if (search) {
      where.OR = [
        { supplierName: { contains: search, mode: 'insensitive' } },
        { supplierTaxId: { contains: search } },
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const { items, total } = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [rows, count] = await Promise.all([
        tx.purchaseInvoice.findMany({
          where,
          skip,
          take: limitNumber,
          orderBy: { invoiceDate: 'desc' },
        }),
        tx.purchaseInvoice.count({ where }),
      ]);
      return { items: rows, total: count };
    });

    res.json({
      data: items,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (err) {
    logger.error('Failed to list purchase invoices', { error: err });
    res.status(500).json({ error: 'Failed to fetch purchase invoices' });
  }
});

/* ─── Get one ─── */
purchaseInvoicesRouter.get('/document-intakes/review', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const where: Prisma.DocumentIntakeWhereInput = {
      companyId: req.user!.companyId,
      status: status && status !== 'all'
        ? status
        : { in: ['received', 'processing', 'awaiting_input', 'awaiting_confirmation', 'needs_review', 'failed'] },
    };

    const items = await prisma.documentIntake.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        source: true,
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
    });

    res.json({ data: items });
  } catch (err) {
    logger.error('Failed to list document intakes', { error: err });
    res.status(500).json({ error: 'Failed to fetch document intakes' });
  }
});

purchaseInvoicesRouter.get('/document-intakes', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const where: Prisma.DocumentIntakeWhereInput = {
      companyId: req.user!.companyId,
    };
    if (status && status !== 'all') where.status = status;
    if (type === 'pdf') where.mimeType = 'application/pdf';
    if (type === 'image') where.mimeType = { startsWith: 'image/' };

    const items = await prisma.documentIntake.findMany({
      where,
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
    });

    res.json({ data: items });
  } catch (err) {
    logger.error('Failed to list document library', { error: err });
    res.status(500).json({ error: 'Failed to fetch document library' });
  }
});

purchaseInvoicesRouter.get('/document-intakes/stats/summary', async (req, res) => {
  try {
    const since = documentDateRange(30);
    const companyId = req.user!.companyId;
    const [
      byStatus,
      bySource,
      recentFailures,
      duplicateWarnings,
      storageBacked,
      dbBacked,
      totalLast30Days,
    ] = await Promise.all([
      prisma.documentIntake.groupBy({
        by: ['status'],
        where: { companyId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.documentIntake.groupBy({
        by: ['source'],
        where: { companyId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.documentIntake.count({
        where: { companyId, status: 'failed', createdAt: { gte: since } },
      }),
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
      prisma.documentIntake.count({
        where: { companyId, storageKey: { not: null }, createdAt: { gte: since } },
      }),
      prisma.documentIntake.count({
        where: { companyId, fileBase64: { not: null }, createdAt: { gte: since } },
      }),
      prisma.documentIntake.count({
        where: { companyId, createdAt: { gte: since } },
      }),
    ]);

    res.json({
      data: {
        windowDays: 30,
        totalLast30Days,
        failedLast30Days: recentFailures,
        duplicateWarnings,
        storage: {
          configured: isStorageConfigured(),
          storageBacked,
          databaseBacked: dbBacked,
        },
        byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
        bySource: Object.fromEntries(bySource.map((row) => [row.source, row._count._all])),
      },
    });
  } catch (err) {
    logger.error('Failed to summarize document intakes', { error: err });
    res.status(500).json({ error: 'Failed to fetch document stats' });
  }
});

purchaseInvoicesRouter.get('/document-intakes/:id/file', async (req, res) => {
  try {
    const item = await prisma.documentIntake.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { fileBase64: true, fileName: true, mimeType: true, fileUrl: true, storageKey: true },
    });
    if (!item) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    if (item.storageKey) {
      res.redirect(await getPresignedUrl(item.storageKey, 900));
      return;
    }
    if (item.fileUrl) {
      res.redirect(item.fileUrl);
      return;
    }
    if (!item.fileBase64) {
      res.status(404).json({ error: 'Document file is not available' });
      return;
    }
    const buffer = Buffer.from(item.fileBase64, 'base64');
    res.setHeader('Content-Type', item.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${item.fileName || `document.${item.mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`}"`);
    res.send(buffer);
  } catch (err) {
    logger.error('Failed to stream document intake file', { error: err });
    res.status(500).json({ error: 'Failed to open document file' });
  }
});

purchaseInvoicesRouter.post('/document-intakes/upload', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = uploadDocumentSchema.parse(req.body);
    const buffer = Buffer.from(body.fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(body.mimeType)) {
      res.status(400).json({ error: 'Unsupported file type' });
      return;
    }
    if (buffer.length > 10 * 1024 * 1024) {
      res.status(413).json({ error: 'File is too large' });
      return;
    }

    let fileUrl: string | undefined;
    let storageKey: string | undefined;
    const storageReady = isStorageConfigured();
    if (storageReady) {
      const ext = body.mimeType === 'application/pdf' ? 'pdf' : body.mimeType.split('/')[1] || 'bin';
      storageKey = `companies/${req.user!.companyId}/document-intakes/web/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      fileUrl = await uploadToStorage(storageKey, buffer, body.mimeType);
    }

    const created = await prisma.documentIntake.create({
      data: {
        companyId: req.user!.companyId,
        userId: req.user!.userId,
        source: 'web',
        fileName: body.fileName,
        mimeType: body.mimeType,
        fileSize: buffer.length,
        fileBase64: storageReady ? undefined : buffer.toString('base64'),
        fileUrl,
        storageKey,
        status: 'needs_review',
      },
    });
    res.status(201).json({ data: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to upload purchase document', { error: err });
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

purchaseInvoicesRouter.post('/document-intakes/:id/analyze', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const item = await prisma.documentIntake.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: {
        id: true,
        companyId: true,
        fileBase64: true,
        storageKey: true,
        mimeType: true,
        fileUrl: true,
      },
    });
    if (!item) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(item.mimeType)) {
      res.status(400).json({ error: 'Unsupported file type' });
      return;
    }

    const buffer = await readDocumentIntakeBuffer(item);
    if (!buffer) {
      res.status(404).json({ error: 'Original file is not available' });
      return;
    }

    await prisma.documentIntake.update({
      where: { id: item.id },
      data: { status: 'processing', error: null },
    });

    const result = await analyzeDocumentBuffer(buffer, item.mimeType, req.user!.companyId);
    const hasUsefulData = result.supplierName || result.invoiceNumber || result.total || result.vatAmount || result.payment?.amount;
    const status = hasUsefulData && purchaseRecordDocumentTypes.has(result.documentType)
      ? 'awaiting_confirmation'
      : 'needs_review';

    const updated = await prisma.documentIntake.update({
      where: { id: item.id },
      data: {
        status,
        ocrResult: result as unknown as Prisma.InputJsonValue,
        warnings: result.validationWarnings as unknown as Prisma.InputJsonValue,
        error: hasUsefulData ? null : 'OCR returned no useful fields',
        processedAt: new Date(),
      },
    });

    res.json({ data: updated });
  } catch (err) {
    logger.error('Failed to analyze purchase document', { error: err });
    await prisma.documentIntake.updateMany({
      where: { id: req.params.id, companyId: req.user!.companyId },
      data: {
        status: 'failed',
        error: err instanceof Error ? err.message : 'OCR failed',
        processedAt: new Date(),
      },
    });
    res.status(500).json({ error: 'Failed to analyze document' });
  }
});

purchaseInvoicesRouter.post('/document-intakes/:id/confirm-purchase', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const item = await prisma.documentIntake.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { id: true, fileUrl: true, ocrResult: true },
    });
    if (!item) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const result = item.ocrResult as unknown as OcrResult | null;
    if (!result) {
      res.status(400).json({ error: 'Document has no OCR result yet' });
      return;
    }
    if (!purchaseRecordDocumentTypes.has(result.documentType)) {
      res.status(400).json({ error: 'This document type is not a purchase invoice/receipt' });
      return;
    }

    const normalized = normalizeOcrPurchasePayload(result, documentFileUrl(item));
    if (normalized.missing.length > 0) {
      await prisma.documentIntake.update({
        where: { id: item.id },
        data: {
          status: 'needs_review',
          warnings: [...(result.validationWarnings ?? []), ...normalized.missing.map((field) => `missing:${field}`)] as unknown as Prisma.InputJsonValue,
          error: `Missing required fields: ${normalized.missing.join(', ')}`,
        },
      });
      res.status(422).json({ error: 'Missing required OCR fields', missing: normalized.missing });
      return;
    }

    const duplicate = await findDuplicatePurchase(
      req.user!.companyId,
      normalized.payload.supplierTaxId,
      normalized.payload.invoiceNumber,
    );
    if (duplicate) {
      await prisma.documentIntake.update({
        where: { id: item.id },
        data: {
          status: 'needs_review',
          targetType: 'purchase_invoice',
          targetId: duplicate.id,
          purchaseInvoiceId: duplicate.id,
          warnings: [...(result.validationWarnings ?? []), 'duplicate:purchase_invoice'] as unknown as Prisma.InputJsonValue,
          error: `Duplicate purchase invoice: ${duplicate.invoiceNumber}`,
          processedAt: new Date(),
        },
      });
      res.status(409).json({
        error: 'Duplicate purchase invoice',
        duplicate,
      });
      return;
    }

    const created = await prisma.purchaseInvoice.create({
      data: {
        companyId: req.user!.companyId,
        ...normalized.payload,
        total: normalized.payload.subtotal + normalized.payload.vatAmount,
        createdBy: req.user!.userId,
      },
    });
    const updated = await prisma.documentIntake.update({
      where: { id: item.id },
      data: {
        status: 'saved',
        targetType: 'purchase_invoice',
        targetId: created.id,
        purchaseInvoiceId: created.id,
        error: null,
        processedAt: new Date(),
      },
    });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'document_intake.confirm_purchase',
      resourceType: 'document_intake',
      resourceId: item.id,
      details: { purchaseInvoiceId: created.id, supplierName: created.supplierName, total: created.total },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.status(201).json({ data: updated, purchaseInvoice: created });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'Purchase invoice with this supplier and invoice number already exists' });
      return;
    }
    logger.error('Failed to confirm purchase document', { error: err });
    res.status(500).json({ error: 'Failed to confirm purchase document' });
  }
});

purchaseInvoicesRouter.post('/document-intakes/:id/attach-purchase', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = attachDocumentSchema.parse(req.body);
    const [item, purchase] = await Promise.all([
      prisma.documentIntake.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        select: { id: true, fileUrl: true },
      }),
      prisma.purchaseInvoice.findFirst({
        where: { id: body.purchaseInvoiceId, companyId: req.user!.companyId },
        select: { id: true, pdfUrl: true },
      }),
    ]);
    if (!item || !purchase) {
      res.status(404).json({ error: 'Document or purchase invoice not found' });
      return;
    }

    const file = documentFileUrl(item);
    const [updated] = await prisma.$transaction([
      prisma.documentIntake.update({
        where: { id: item.id },
        data: {
          status: 'saved',
          targetType: 'purchase_invoice',
          targetId: purchase.id,
          purchaseInvoiceId: purchase.id,
          error: null,
          processedAt: new Date(),
        },
      }),
      prisma.purchaseInvoice.update({
        where: { id: purchase.id },
        data: purchase.pdfUrl ? {} : { pdfUrl: file },
      }),
    ]);

    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to attach purchase document', { error: err });
    res.status(500).json({ error: 'Failed to attach document' });
  }
});

purchaseInvoicesRouter.post('/document-intakes/:id/reject', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const updated = await prisma.documentIntake.updateMany({
      where: { id: req.params.id, companyId: req.user!.companyId },
      data: { status: 'rejected', error: 'rejected_by_user', processedAt: new Date() },
    });
    if (updated.count === 0) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to reject purchase document', { error: err });
    res.status(500).json({ error: 'Failed to reject document' });
  }
});

/* ─── Get one ─── */
purchaseInvoicesRouter.get('/:id', async (req, res) => {
  try {
    const item = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.purchaseInvoice.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
      });
    });
    if (!item) {
      res.status(404).json({ error: 'Purchase invoice not found' });
      return;
    }
    res.json({ data: item });
  } catch (err) {
    logger.error('Failed to get purchase invoice', { error: err });
    res.status(500).json({ error: 'Failed to fetch purchase invoice' });
  }
});

/* ─── Create ─── */
purchaseInvoicesRouter.post('/', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'create_invoice')) {
      res.status(403).json({ error: 'Your current plan cannot record purchase invoices' });
      return;
    }

    const body = createPurchaseInvoiceSchema.parse(req.body);
    const total = body.subtotal + body.vatAmount;

    const created = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.purchaseInvoice.create({
        data: {
          companyId: req.user!.companyId,
          supplierName: body.supplierName,
          supplierTaxId: body.supplierTaxId,
          supplierBranch: body.supplierBranch ?? '00000',
          invoiceNumber: body.invoiceNumber,
          invoiceDate: new Date(body.invoiceDate),
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          subtotal: body.subtotal,
          vatAmount: body.vatAmount,
          total,
          vatType: body.vatType,
          description: body.description,
          category: body.category,
          notes: body.notes,
          pdfUrl: body.pdfUrl,
          createdBy: req.user!.userId,
        },
      });
    });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'purchase_invoice.create',
      resourceType: 'purchase_invoice',
      resourceId: created.id,
      details: {
        supplierName: created.supplierName,
        supplierTaxId: created.supplierTaxId,
        invoiceNumber: created.invoiceNumber,
        total: created.total,
      },
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
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'Purchase invoice with this supplier and invoice number already exists' });
      return;
    }
    logger.error('Failed to create purchase invoice', { error: err });
    res.status(500).json({ error: 'Failed to create purchase invoice' });
  }
});

/* ─── Update ─── */
purchaseInvoicesRouter.patch('/:id', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = updatePurchaseInvoiceSchema.parse(req.body);
    const total = body.subtotal + body.vatAmount;

    const existing = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.purchaseInvoice.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
      });
    });
    if (!existing) {
      res.status(404).json({ error: 'Purchase invoice not found' });
      return;
    }

    const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.purchaseInvoice.update({
        where: { id: existing.id },
        data: {
          supplierName: body.supplierName,
          supplierTaxId: body.supplierTaxId,
          supplierBranch: body.supplierBranch ?? '00000',
          invoiceNumber: body.invoiceNumber,
          invoiceDate: new Date(body.invoiceDate),
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          subtotal: body.subtotal,
          vatAmount: body.vatAmount,
          total,
          vatType: body.vatType,
          description: body.description,
          category: body.category,
          notes: body.notes,
          pdfUrl: body.pdfUrl,
        },
      });
    });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'purchase_invoice.update',
      resourceType: 'purchase_invoice',
      resourceId: updated.id,
      details: {
        supplierName: updated.supplierName,
        invoiceNumber: updated.invoiceNumber,
        total: updated.total,
      },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'Purchase invoice with this supplier and invoice number already exists' });
      return;
    }
    logger.error('Failed to update purchase invoice', { error: err });
    res.status(500).json({ error: 'Failed to update purchase invoice' });
  }
});

/* ─── Delete ─── */
purchaseInvoicesRouter.delete('/:id', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const existing = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.purchaseInvoice.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
      });
    });
    if (!existing) {
      res.status(404).json({ error: 'Purchase invoice not found' });
      return;
    }

    await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await tx.purchaseInvoice.delete({ where: { id: existing.id } });
      return null;
    });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'purchase_invoice.delete',
      resourceType: 'purchase_invoice',
      resourceId: existing.id,
      details: {
        supplierName: existing.supplierName,
        invoiceNumber: existing.invoiceNumber,
      },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ message: 'Purchase invoice deleted' });
  } catch (err) {
    logger.error('Failed to delete purchase invoice', { error: err });
    res.status(500).json({ error: 'Failed to delete purchase invoice' });
  }
});

/* ─── Mark Paid ─── */
purchaseInvoicesRouter.post('/:id/mark-paid', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const existing = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.purchaseInvoice.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
      });
    });
    if (!existing) {
      res.status(404).json({ error: 'Purchase invoice not found' });
      return;
    }
    if (existing.isPaid) {
      res.status(400).json({ error: 'Purchase invoice is already marked as paid' });
      return;
    }

    const paidAt = new Date();
    const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.purchaseInvoice.update({
        where: { id: existing.id },
        data: { isPaid: true, paidAt },
      });
    });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'purchase_invoice.mark_paid',
      resourceType: 'purchase_invoice',
      resourceId: updated.id,
      details: {
        invoiceNumber: updated.invoiceNumber,
        paidAt: paidAt.toISOString(),
      },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ data: updated });
  } catch (err) {
    logger.error('Failed to mark purchase invoice paid', { error: err });
    res.status(500).json({ error: 'Failed to mark purchase invoice as paid' });
  }
});
