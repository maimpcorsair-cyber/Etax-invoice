import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { withInvoiceLock, withRlsContext, tenantRlsContext } from '../config/rls';
import { generateInvoiceNumber } from '../services/invoiceService';

// ใบส่งของ (Delivery Note) — operational delivery document.
// Not a tax document. No e-Tax submission, no VAT remittance obligation.
// Lifecycle: draft -> issued -> delivered -> converted/cancelled.

export const deliveryNotesRouter = Router();

const itemSchema = z.object({
  productId: z.string().optional().nullable(),
  nameTh: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional().nullable(),
  descriptionTh: z.string().max(500).optional().nullable(),
  descriptionEn: z.string().max(500).optional().nullable(),
  quantity: z.number().positive(),
  deliveredQty: z.number().nonnegative().optional(),
  unit: z.string().max(50),
  unitPrice: z.number().nonnegative().optional().nullable(),
  vatType: z.enum(['vat7', 'vatExempt', 'vatZero']).default('vat7'),
});

const deliveryNoteCreateSchema = z.object({
  buyerId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  quotationId: z.string().optional().nullable(),
  invoiceId: z.string().optional().nullable(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  language: z.enum(['th', 'en', 'both']).default('th'),
  items: z.array(itemSchema).min(1).max(200),
  shippingAddress: z.string().max(1000).optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  contactPhone: z.string().max(50).optional().nullable(),
  vehicleNo: z.string().max(100).optional().nullable(),
  trackingNo: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  deliveryTerms: z.string().max(500).optional().nullable(),
});

function computeAmount(input: z.infer<typeof itemSchema>) {
  if (input.unitPrice === undefined || input.unitPrice === null) return null;
  return +(input.quantity * input.unitPrice).toFixed(2);
}

async function generateDeliveryNoteNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  return withInvoiceLock(prisma, companyId, async (tx) => {
    const latest = await tx.deliveryNote.findFirst({
      where: { companyId, deliveryNoteNumber: { startsWith: `DN-${year}` } },
      orderBy: { deliveryNoteNumber: 'desc' },
    });
    let seq = 0;
    if (latest?.deliveryNoteNumber) {
      const parts = latest.deliveryNoteNumber.split('-');
      seq = parseInt(parts[parts.length - 1], 10) || 0;
    }
    return `DN-${year}-${(seq + 1).toString().padStart(6, '0')}`;
  });
}

async function assertLinkedRecordsTenant(
  companyId: string,
  refs: {
    buyerId?: string | null;
    projectId?: string | null;
    quotationId?: string | null;
    invoiceId?: string | null;
  },
) {
  if (refs.buyerId) {
    const buyer = await prisma.customer.findFirst({ where: { id: refs.buyerId, companyId } });
    if (!buyer) return 'Buyer (customer) not found in your company';
  }
  if (refs.projectId) {
    const project = await prisma.project.findFirst({ where: { id: refs.projectId, companyId } });
    if (!project) return 'Project not found in your company';
  }
  if (refs.quotationId) {
    const quotation = await prisma.quotation.findFirst({ where: { id: refs.quotationId, companyId } });
    if (!quotation) return 'Quotation not found in your company';
  }
  if (refs.invoiceId) {
    const invoice = await prisma.invoice.findFirst({ where: { id: refs.invoiceId, companyId } });
    if (!invoice) return 'Invoice not found in your company';
  }
  return null;
}

deliveryNotesRouter.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const where: Record<string, unknown> = { companyId: req.user!.companyId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { deliveryNoteNumber: { contains: search, mode: 'insensitive' } },
        { buyer: { is: { nameTh: { contains: search, mode: 'insensitive' } } } },
        { buyer: { is: { nameEn: { contains: search, mode: 'insensitive' } } } },
        { trackingNo: { contains: search, mode: 'insensitive' } },
      ];
    }

    const result = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [rows, total] = await Promise.all([
        tx.deliveryNote.findMany({
          where,
          orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }],
          include: {
            buyer: { select: { id: true, nameTh: true, nameEn: true, taxId: true } },
            items: true,
          },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.deliveryNote.count({ where }),
      ]);
      return { rows, total };
    });

    res.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (err) {
    logger.error('list delivery notes failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to list delivery notes' });
  }
});

deliveryNotesRouter.get('/:id', async (req, res) => {
  try {
    const deliveryNote = await prisma.deliveryNote.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: {
        buyer: true,
        items: { orderBy: { id: 'asc' } },
        project: { select: { id: true, code: true, name: true } },
        quotation: { select: { id: true, quotationNumber: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });
    if (!deliveryNote) {
      res.status(404).json({ error: 'Delivery note not found' });
      return;
    }
    res.json({ data: deliveryNote });
  } catch (err) {
    logger.error('get delivery note failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to get delivery note' });
  }
});

deliveryNotesRouter.post('/', async (req, res) => {
  try {
    const body = deliveryNoteCreateSchema.parse(req.body);

    const buyer = await prisma.customer.findFirst({
      where: { id: body.buyerId, companyId: req.user!.companyId },
    });
    if (!buyer) {
      res.status(400).json({ error: 'Buyer (customer) not found in your company' });
      return;
    }

    const linkError = await assertLinkedRecordsTenant(req.user!.companyId, {
      projectId: body.projectId,
      quotationId: body.quotationId,
      invoiceId: body.invoiceId,
    });
    if (linkError) {
      res.status(400).json({ error: linkError });
      return;
    }

    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: {
        nameTh: true, nameEn: true, taxId: true, branchCode: true,
        branchNameTh: true, branchNameEn: true,
        addressTh: true, addressEn: true,
        phone: true, email: true, website: true, logoUrl: true,
      },
    });

    const deliveryNoteNumber = await generateDeliveryNoteNumber(req.user!.companyId);
    const created = await prisma.deliveryNote.create({
      data: {
        companyId: req.user!.companyId,
        projectId: body.projectId ?? null,
        quotationId: body.quotationId ?? null,
        invoiceId: body.invoiceId ?? null,
        deliveryNoteNumber,
        language: body.language,
        deliveryDate: new Date(`${body.deliveryDate}T00:00:00.000Z`),
        expectedDate: body.expectedDate ? new Date(`${body.expectedDate}T23:59:59.000Z`) : null,
        buyerId: body.buyerId,
        seller: (company ?? {}) as object,
        shippingAddress: body.shippingAddress ?? buyer.addressTh ?? null,
        contactName: body.contactName ?? buyer.contactPerson ?? null,
        contactPhone: body.contactPhone ?? buyer.phone ?? null,
        vehicleNo: body.vehicleNo ?? null,
        trackingNo: body.trackingNo ?? null,
        notes: body.notes ?? null,
        deliveryTerms: body.deliveryTerms ?? null,
        createdBy: req.user!.userId,
        items: {
          create: body.items.map((item) => ({
            productId: item.productId ?? null,
            nameTh: item.nameTh,
            nameEn: item.nameEn ?? null,
            descriptionTh: item.descriptionTh ?? null,
            descriptionEn: item.descriptionEn ?? null,
            quantity: item.quantity,
            deliveredQty: item.deliveredQty ?? item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice ?? null,
            vatType: item.vatType,
            amount: computeAmount(item),
          })),
        },
      },
      include: { items: true, buyer: true },
    });

    res.status(201).json({ data: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    logger.error('create delivery note failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to create delivery note' });
  }
});

deliveryNotesRouter.patch('/:id', async (req, res) => {
  try {
    const existing = await prisma.deliveryNote.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Delivery note not found' });
      return;
    }
    if (existing.status !== 'draft') {
      res.status(400).json({ error: `Cannot edit a delivery note in status '${existing.status}'` });
      return;
    }

    const body = deliveryNoteCreateSchema.partial().parse(req.body);
    const linkError = await assertLinkedRecordsTenant(req.user!.companyId, {
      buyerId: body.buyerId,
      projectId: body.projectId,
      quotationId: body.quotationId,
      invoiceId: body.invoiceId,
    });
    if (linkError) {
      res.status(400).json({ error: linkError });
      return;
    }

    let itemsUpdate: object | undefined;
    if (body.items) {
      itemsUpdate = {
        deleteMany: {},
        create: body.items.map((item) => ({
          productId: item.productId ?? null,
          nameTh: item.nameTh,
          nameEn: item.nameEn ?? null,
          descriptionTh: item.descriptionTh ?? null,
          descriptionEn: item.descriptionEn ?? null,
          quantity: item.quantity,
          deliveredQty: item.deliveredQty ?? item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice ?? null,
          vatType: item.vatType,
          amount: computeAmount(item),
        })),
      };
    }

    const updated = await prisma.deliveryNote.update({
      where: { id: existing.id },
      data: {
        ...(body.buyerId ? { buyerId: body.buyerId } : {}),
        ...(body.projectId !== undefined ? { projectId: body.projectId ?? null } : {}),
        ...(body.quotationId !== undefined ? { quotationId: body.quotationId ?? null } : {}),
        ...(body.invoiceId !== undefined ? { invoiceId: body.invoiceId ?? null } : {}),
        ...(body.deliveryDate ? { deliveryDate: new Date(`${body.deliveryDate}T00:00:00.000Z`) } : {}),
        ...(body.expectedDate !== undefined ? { expectedDate: body.expectedDate ? new Date(`${body.expectedDate}T23:59:59.000Z`) : null } : {}),
        ...(body.language ? { language: body.language } : {}),
        ...(body.shippingAddress !== undefined ? { shippingAddress: body.shippingAddress ?? null } : {}),
        ...(body.contactName !== undefined ? { contactName: body.contactName ?? null } : {}),
        ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone ?? null } : {}),
        ...(body.vehicleNo !== undefined ? { vehicleNo: body.vehicleNo ?? null } : {}),
        ...(body.trackingNo !== undefined ? { trackingNo: body.trackingNo ?? null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
        ...(body.deliveryTerms !== undefined ? { deliveryTerms: body.deliveryTerms ?? null } : {}),
        ...(itemsUpdate ? { items: itemsUpdate } : {}),
      },
      include: { items: true, buyer: true },
    });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    logger.error('update delivery note failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to update delivery note' });
  }
});

const statusSchema = z.object({
  status: z.enum(['draft', 'issued', 'delivered', 'cancelled']),
  reason: z.string().max(500).optional(),
});

deliveryNotesRouter.post('/:id/status', async (req, res) => {
  try {
    const body = statusSchema.parse(req.body);
    const existing = await prisma.deliveryNote.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Delivery note not found' });
      return;
    }
    if (existing.status === 'converted') {
      res.status(400).json({ error: 'Delivery note already converted to an invoice — cannot change status' });
      return;
    }

    const updated = await prisma.deliveryNote.update({
      where: { id: existing.id },
      data: {
        status: body.status,
        ...(body.status === 'delivered' ? { deliveredAt: new Date() } : {}),
        ...(body.status === 'cancelled'
          ? { cancelledAt: new Date(), cancelledBy: req.user!.userId, cancelReason: body.reason ?? null }
          : {}),
      },
    });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    logger.error('update delivery note status failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to update status' });
  }
});

deliveryNotesRouter.post('/:id/convert-to-invoice', async (req, res) => {
  try {
    const existing = await prisma.deliveryNote.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: { items: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Delivery note not found' });
      return;
    }
    if (existing.status === 'converted') {
      res.status(400).json({ error: 'Delivery note already converted' });
      return;
    }
    if (existing.status === 'cancelled') {
      res.status(400).json({ error: 'Cannot convert a cancelled delivery note' });
      return;
    }

    const invoiceNumber = await generateInvoiceNumber(req.user!.companyId, 'tax_invoice');
    const invoiceItems = existing.items.map((item) => {
      const unitPrice = item.unitPrice ?? 0;
      const amount = +(item.quantity * unitPrice).toFixed(2);
      const vatAmount = item.vatType === 'vat7' ? +(amount * 0.07).toFixed(2) : 0;
      return {
        productId: item.productId,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        descriptionTh: item.descriptionTh,
        descriptionEn: item.descriptionEn,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice,
        discountAmount: 0,
        vatType: item.vatType,
        amount,
        vatAmount,
        totalAmount: +(amount + vatAmount).toFixed(2),
      };
    });
    const subtotal = +invoiceItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2);
    const vatAmount = +invoiceItems.reduce((sum, item) => sum + item.vatAmount, 0).toFixed(2);
    const total = +(subtotal + vatAmount).toFixed(2);

    const result = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          companyId: existing.companyId,
          projectId: existing.projectId,
          invoiceNumber,
          type: 'tax_invoice',
          status: 'draft',
          language: existing.language,
          invoiceDate: new Date(),
          buyerId: existing.buyerId,
          seller: existing.seller as object,
          subtotal,
          vatAmount,
          discountAmount: 0,
          total,
          notes: existing.notes,
          createdBy: req.user!.userId,
          items: { create: invoiceItems },
        },
        include: { items: true },
      });

      const updatedDeliveryNote = await tx.deliveryNote.update({
        where: { id: existing.id },
        data: { status: 'converted', invoiceId: invoice.id },
      });

      return { invoice, deliveryNote: updatedDeliveryNote };
    });

    res.status(201).json({ data: result });
  } catch (err) {
    logger.error('convert delivery note failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to convert delivery note to invoice' });
  }
});

deliveryNotesRouter.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.deliveryNote.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Delivery note not found' });
      return;
    }
    if (existing.status !== 'draft') {
      res.status(400).json({ error: `Cannot delete a ${existing.status} delivery note — change status to 'cancelled' instead` });
      return;
    }
    await prisma.deliveryNote.delete({ where: { id: existing.id } });
    res.json({ data: { id: existing.id, deleted: true } });
  } catch (err) {
    logger.error('delete delivery note failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to delete delivery note' });
  }
});
