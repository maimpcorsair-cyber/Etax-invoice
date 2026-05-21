import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { auditLog } from '../services/auditService';
import {
  addFrequency,
  generateRecurringInvoiceDraft,
  parseDateOnly,
  startOfUtcDate,
} from '../services/recurringInvoiceService';

export const recurringInvoicesRouter = Router();

const itemSchema = z.object({
  productId: z.string().optional().nullable(),
  nameTh: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional().nullable(),
  descriptionTh: z.string().max(500).optional().nullable(),
  descriptionEn: z.string().max(500).optional().nullable(),
  quantity: z.number().positive(),
  unit: z.string().max(50),
  unitPrice: z.number().nonnegative(),
  discountAmount: z.number().min(0).max(100).default(0),
  vatType: z.enum(['vat7', 'vatExempt', 'vatZero']).default('vat7'),
});

const recurringInvoiceSchema = z.object({
  name: z.string().min(1).max(200),
  customerId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  interval: z.number().int().min(1).max(36).default(1),
  language: z.enum(['th', 'en', 'both']).default('th'),
  invoiceType: z.enum(['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note']).default('tax_invoice'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nextRunDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dueDays: z.number().int().min(0).max(365).optional().nullable(),
  maxRuns: z.number().int().min(1).max(240).optional().nullable(),
  discountAmount: z.number().nonnegative().default(0),
  notes: z.string().max(1000).optional().nullable(),
  paymentMethod: z.string().max(100).optional().nullable(),
  items: z.array(itemSchema).min(1).max(200),
});

const statusSchema = z.object({
  status: z.enum(['active', 'paused', 'cancelled']),
});

const generateSchema = z.object({
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

async function assertLinkedRecordsTenant(companyId: string, customerId: string, projectId?: string | null) {
  const [customer, project] = await Promise.all([
    prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } }),
    projectId ? prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (!customer) throw new Error('Customer not found');
  if (projectId && !project) throw new Error('Project not found');
}

const includeRecurringInvoice = {
  customer: { select: { id: true, nameTh: true, nameEn: true, taxId: true, creditDays: true } },
  project: { select: { id: true, code: true, name: true } },
  items: { orderBy: { id: 'asc' } },
  runs: {
    orderBy: { generatedAt: 'desc' },
    take: 5,
    include: { invoice: { select: { id: true, invoiceNumber: true, total: true, status: true, invoiceDate: true } } },
  },
} as const;

recurringInvoicesRouter.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const where: Prisma.RecurringInvoiceWhereInput = { companyId: req.user!.companyId };
    if (status && status !== 'all') {
      const parsedStatus = z.enum(['active', 'paused', 'ended', 'cancelled']).safeParse(status);
      if (parsedStatus.success) where.status = parsedStatus.data;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { customer: { is: { nameTh: { contains: search, mode: 'insensitive' } } } },
        { customer: { is: { nameEn: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const result = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [rows, total] = await Promise.all([
        tx.recurringInvoice.findMany({
          where,
          orderBy: [{ nextRunDate: 'asc' }, { createdAt: 'desc' }],
          include: includeRecurringInvoice,
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.recurringInvoice.count({ where }),
      ]);
      return { rows, total };
    });

    res.json({
      data: result.rows,
      pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
    });
  } catch (err) {
    logger.error('list recurring invoices failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to list recurring invoices' });
  }
});

recurringInvoicesRouter.get('/:id', async (req, res) => {
  try {
    const data = await prisma.recurringInvoice.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: includeRecurringInvoice,
    });
    if (!data) {
      res.status(404).json({ error: 'Recurring invoice not found' });
      return;
    }
    res.json({ data });
  } catch (err) {
    logger.error('get recurring invoice failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to get recurring invoice' });
  }
});

recurringInvoicesRouter.post('/', async (req, res) => {
  try {
    const body = recurringInvoiceSchema.parse(req.body);
    await assertLinkedRecordsTenant(req.user!.companyId, body.customerId, body.projectId);

    const startDate = parseDateOnly(body.startDate);
    const nextRunDate = body.nextRunDate ? parseDateOnly(body.nextRunDate) : startDate;

    const created = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => tx.recurringInvoice.create({
      data: {
        companyId: req.user!.companyId,
        projectId: body.projectId ?? null,
        customerId: body.customerId,
        name: body.name,
        frequency: body.frequency,
        interval: body.interval,
        language: body.language,
        invoiceType: body.invoiceType,
        startDate,
        nextRunDate,
        endDate: body.endDate ? parseDateOnly(body.endDate) : null,
        dueDays: body.dueDays ?? null,
        maxRuns: body.maxRuns ?? null,
        discountAmount: body.discountAmount,
        notes: body.notes ?? null,
        paymentMethod: body.paymentMethod ?? null,
        createdBy: req.user!.userId,
        items: {
          create: body.items.map((item) => ({
            productId: item.productId ?? null,
            nameTh: item.nameTh,
            nameEn: item.nameEn ?? null,
            descriptionTh: item.descriptionTh ?? null,
            descriptionEn: item.descriptionEn ?? null,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            vatType: item.vatType,
          })),
        },
      },
      include: includeRecurringInvoice,
    }));

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'recurring_invoice.create',
      resourceType: 'recurring_invoice',
      resourceId: created.id,
      details: { name: created.name, frequency: created.frequency, nextRunDate: created.nextRunDate },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: created.language === 'en' ? 'en' : 'th',
    });

    res.status(201).json({ data: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    logger.error('create recurring invoice failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(err instanceof Error && err.message.includes('not found') ? 404 : 500).json({ error: err instanceof Error ? err.message : 'Failed to create recurring invoice' });
  }
});

recurringInvoicesRouter.patch('/:id', async (req, res) => {
  try {
    const existing = await prisma.recurringInvoice.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { id: true, status: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Recurring invoice not found' });
      return;
    }
    if (existing.status === 'cancelled') {
      res.status(400).json({ error: 'Cannot edit a cancelled recurring invoice' });
      return;
    }

    const body = recurringInvoiceSchema.partial().parse(req.body);
    if (body.customerId || body.projectId !== undefined) {
      await assertLinkedRecordsTenant(req.user!.companyId, body.customerId ?? (await prisma.recurringInvoice.findUnique({ where: { id: existing.id }, select: { customerId: true } }))!.customerId, body.projectId);
    }

    const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => tx.recurringInvoice.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.customerId !== undefined ? { customerId: body.customerId } : {}),
        ...(body.projectId !== undefined ? { projectId: body.projectId ?? null } : {}),
        ...(body.frequency !== undefined ? { frequency: body.frequency } : {}),
        ...(body.interval !== undefined ? { interval: body.interval } : {}),
        ...(body.language !== undefined ? { language: body.language } : {}),
        ...(body.invoiceType !== undefined ? { invoiceType: body.invoiceType } : {}),
        ...(body.startDate !== undefined ? { startDate: parseDateOnly(body.startDate) } : {}),
        ...(body.nextRunDate !== undefined ? { nextRunDate: body.nextRunDate ? parseDateOnly(body.nextRunDate) : undefined } : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate ? parseDateOnly(body.endDate) : null } : {}),
        ...(body.dueDays !== undefined ? { dueDays: body.dueDays ?? null } : {}),
        ...(body.maxRuns !== undefined ? { maxRuns: body.maxRuns ?? null } : {}),
        ...(body.discountAmount !== undefined ? { discountAmount: body.discountAmount } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
        ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod ?? null } : {}),
        ...(body.items !== undefined ? {
          items: {
            deleteMany: {},
            create: body.items.map((item) => ({
              productId: item.productId ?? null,
              nameTh: item.nameTh,
              nameEn: item.nameEn ?? null,
              descriptionTh: item.descriptionTh ?? null,
              descriptionEn: item.descriptionEn ?? null,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              vatType: item.vatType,
            })),
          },
        } : {}),
      },
      include: includeRecurringInvoice,
    }));

    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    logger.error('update recurring invoice failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(err instanceof Error && err.message.includes('not found') ? 404 : 500).json({ error: err instanceof Error ? err.message : 'Failed to update recurring invoice' });
  }
});

recurringInvoicesRouter.post('/:id/status', async (req, res) => {
  try {
    const body = statusSchema.parse(req.body);
    const existing = await prisma.recurringInvoice.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Recurring invoice not found' });
      return;
    }
    const data = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => tx.recurringInvoice.update({
      where: { id: existing.id },
      data: { status: body.status },
      include: includeRecurringInvoice,
    }));
    res.json({ data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    logger.error('update recurring invoice status failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to update recurring invoice status' });
  }
});

recurringInvoicesRouter.post('/:id/generate', async (req, res) => {
  try {
    const body = generateSchema.parse(req.body ?? {});
    const result = await generateRecurringInvoiceDraft({
      recurringInvoiceId: req.params.id,
      scheduledFor: body.scheduledFor ? startOfUtcDate(parseDateOnly(body.scheduledFor)) : undefined,
      user: req.user!,
      triggeredBy: 'manual',
    });
    res.status(201).json({ data: result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'This recurring invoice already generated a draft for that date' });
      return;
    }
    logger.error('generate recurring invoice failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(err instanceof Error && err.message.includes('not found') ? 404 : 500).json({ error: err instanceof Error ? err.message : 'Failed to generate recurring invoice' });
  }
});

recurringInvoicesRouter.post('/from-invoice/:invoiceId', async (req, res) => {
  try {
    const body = z.object({
      name: z.string().min(1).max(200).optional(),
      frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).default('monthly'),
      interval: z.number().int().min(1).max(36).default(1),
      nextRunDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      dueDays: z.number().int().min(0).max(365).optional().nullable(),
      maxRuns: z.number().int().min(1).max(240).optional().nullable(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    }).parse(req.body ?? {});

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.invoiceId, companyId: req.user!.companyId },
      include: { items: true, buyer: { select: { nameTh: true } } },
    });
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const baseDate = startOfUtcDate(new Date(invoice.invoiceDate));
    const nextRunDate = body.nextRunDate ? parseDateOnly(body.nextRunDate) : addFrequency(baseDate, body.frequency, body.interval);
    const created = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => tx.recurringInvoice.create({
      data: {
        companyId: invoice.companyId,
        projectId: invoice.projectId,
        customerId: invoice.buyerId,
        name: body.name ?? `${invoice.buyer.nameTh} / ${invoice.invoiceNumber}`,
        frequency: body.frequency,
        interval: body.interval,
        language: invoice.language,
        invoiceType: invoice.type,
        startDate: baseDate,
        nextRunDate,
        endDate: body.endDate ? parseDateOnly(body.endDate) : null,
        dueDays: body.dueDays ?? null,
        maxRuns: body.maxRuns ?? null,
        discountAmount: invoice.discountAmount,
        notes: invoice.notes,
        paymentMethod: invoice.paymentMethod,
        createdBy: req.user!.userId,
        items: {
          create: invoice.items.map((item) => ({
            productId: item.productId,
            nameTh: item.nameTh,
            nameEn: item.nameEn,
            descriptionTh: item.descriptionTh,
            descriptionEn: item.descriptionEn,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            vatType: item.vatType,
          })),
        },
      },
      include: includeRecurringInvoice,
    }));
    res.status(201).json({ data: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    logger.error('create recurring invoice from invoice failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to create recurring invoice from invoice' });
  }
});
