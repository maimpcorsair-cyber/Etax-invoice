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
import { isStorageConfigured, uploadToStorage } from '../services/storageService';

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
        : { in: ['received', 'processing', 'needs_review', 'failed'] },
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

purchaseInvoicesRouter.get('/document-intakes/:id/file', async (req, res) => {
  try {
    const item = await prisma.documentIntake.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { fileBase64: true, fileName: true, mimeType: true, fileUrl: true },
    });
    if (!item) {
      res.status(404).json({ error: 'Document not found' });
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
    if (isStorageConfigured()) {
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
        fileBase64: buffer.toString('base64'),
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
