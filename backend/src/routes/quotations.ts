import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { withInvoiceLock, withRlsContext, tenantRlsContext } from '../config/rls';
import { generateInvoiceNumber } from '../services/invoiceService';
import { buildHtmlForCompany, generatePdfFromHtml } from '../services/pdfService';
import { buildQuotationPdfData } from '../services/quotationPdfService';
import { buildQuotationShareUrl, signQuotationShareToken } from '../services/quotationShareToken';
import { runQuotationExpiry } from '../services/quotationExpiryService';

// ใบเสนอราคา (Quotation) — pre-sale offer document.
// Not a tax document. No e-Tax submission, no VAT remittance obligation.
// Lifecycle: draft → sent → accepted → converted (to Invoice).
//
// Conversion: POST /:id/convert-to-invoice creates an Invoice from the
// quotation's items + buyer + totals and sets convertedToInvoiceId. The
// quotation status flips to 'converted' atomically with the Invoice insert.

export const quotationsRouter = Router();

const itemSchema = z.object({
  productId: z.string().optional().nullable(),
  sectionTitle: z.string().trim().max(160).optional().nullable(),
  nameTh: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional().nullable(),
  descriptionTh: z.string().max(500).optional().nullable(),
  descriptionEn: z.string().max(500).optional().nullable(),
  quantity: z.number().positive(),
  unit: z.string().max(50),
  unitPrice: z.number().nonnegative(),
  // Line-level discount is PERCENT (0-100) — matches Invoice + RecurringInvoice
  discountAmount: z.number().min(0).max(100).default(0),
  vatType: z.enum(['vat7', 'vatExempt', 'vatZero']).default('vat7'),
});

const quotationCreateSchema = z.object({
  buyerId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  quotationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  language: z.enum(['th', 'en', 'both']).default('th'),
  kind: z.enum(['general', 'service', 'service_project', 'boq_contract', 'recurring_rental', 'logistics_import_export']).default('general'),
  serviceDetails: z.object({
    scope: z.string().trim().max(3000).optional().nullable(),
    deliverables: z.string().trim().max(3000).optional().nullable(),
    exclusions: z.string().trim().max(2000).optional().nullable(),
    duration: z.string().trim().max(500).optional().nullable(),
    warranty: z.string().trim().max(1000).optional().nullable(),
    depositPercent: z.number().min(0).max(100).optional().nullable(),
    revisionRounds: z.number().int().min(0).max(99).optional().nullable(),
    revisionTerms: z.string().trim().max(1000).optional().nullable(),
    contractDuration: z.string().trim().max(500).optional().nullable(),
    billingCycle: z.string().trim().max(500).optional().nullable(),
    sla: z.string().trim().max(1000).optional().nullable(),
    cancellationTerms: z.string().trim().max(1000).optional().nullable(),
    securityDeposit: z.number().min(0).optional().nullable(),
    origin: z.string().trim().max(500).optional().nullable(),
    destination: z.string().trim().max(500).optional().nullable(),
    incoterms: z.string().trim().max(120).optional().nullable(),
    shipmentMode: z.string().trim().max(160).optional().nullable(),
    cargoDetails: z.string().trim().max(1000).optional().nullable(),
    currency: z.string().trim().max(12).optional().nullable(),
    exchangeRate: z.number().min(0).optional().nullable(),
    freightCharge: z.number().min(0).optional().nullable(),
    localCharge: z.number().min(0).optional().nullable(),
    customsFee: z.number().min(0).optional().nullable(),
    insurance: z.number().min(0).optional().nullable(),
    milestones: z.array(z.object({
      title: z.string().trim().min(1).max(160),
      amount: z.number().min(0),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      note: z.string().trim().max(300).optional().nullable(),
    })).max(20).default([]),
  }).optional().nullable(),
  templateId: z.string().max(120).optional().nullable(),
  items: z.array(itemSchema).min(1).max(200),
  discountAmount: z.number().nonnegative().default(0),
  // Management / agency fee added on top of the item subtotal, before VAT.
  feePercent: z.number().min(0).max(100).optional().nullable(),
  feeLabel: z.string().trim().max(80).optional().nullable(),
  // Informational withholding-tax estimate ("1" | "3" | "5" %).
  whtRate: z.enum(['1', '3', '5']).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  paymentTerms: z.string().max(500).optional().nullable(),
  deliveryTerms: z.string().max(500).optional().nullable(),
});

// Live preview from un-saved form data (no buyer required — uses a sample
// buyer, like the invoice builder's preview). Same fields as create minus the
// buyerId requirement, with quotationDate optional.
const quotationPreviewSchema = quotationCreateSchema
  .omit({ buyerId: true })
  .extend({ quotationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

function computeLineTotals(input: z.infer<typeof itemSchema>) {
  // discountAmount is treated as a PERCENT (0-100) to match Invoice +
  // RecurringInvoice conventions. Without this, converting a quotation
  // to an invoice would produce different totals than the quotation
  // preview because Invoice multiplies discountAmount by gross/100.
  const grossLine = input.quantity * input.unitPrice;
  const lineDiscount = input.discountAmount > 0 ? (grossLine * input.discountAmount) / 100 : 0;
  const amount = Math.max(0, grossLine - lineDiscount);
  const vatRate = input.vatType === 'vat7' ? 0.07 : 0;
  const vatAmount = +(amount * vatRate).toFixed(2);
  const totalAmount = +(amount + vatAmount).toFixed(2);
  return { amount: +amount.toFixed(2), vatAmount, totalAmount };
}

// Roll up quotation totals including an optional management/agency fee added
// on top of the item subtotal, before VAT. The fee itself is a VATable
// service (vat7), so VAT = per-item VAT + fee VAT — which equals VAT on
// (subtotal + fee) when every line is vat7, matching agency quotations.
function computeQuotationTotals(
  items: Array<{ amount: number; vatAmount: number }>,
  discountAmount: number,
  feePercent?: number | null,
) {
  const subtotal = +items.reduce((s, i) => s + i.amount, 0).toFixed(2);
  const itemVat = items.reduce((s, i) => s + i.vatAmount, 0);
  const pct = feePercent && feePercent > 0 ? feePercent : 0;
  const feeAmount = +((subtotal * pct) / 100).toFixed(2);
  const feeVat = +(feeAmount * 0.07).toFixed(2);
  const vatAmount = +(itemVat + feeVat).toFixed(2);
  const total = +(subtotal + feeAmount + vatAmount - discountAmount).toFixed(2);
  return { subtotal, feeAmount, vatAmount, total };
}

// ── Quotation number ──────────────────────────────────────────────────
// Same pattern as Invoice: QT-YYYY-NNNNNN, advisory-lock per company.
async function generateQuotationNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  return withInvoiceLock(prisma, companyId, async (tx) => {
    const latest = await tx.quotation.findFirst({
      where: { companyId, quotationNumber: { startsWith: `QT-${year}` } },
      orderBy: { quotationNumber: 'desc' },
    });
    let seq = 0;
    if (latest?.quotationNumber) {
      const parts = latest.quotationNumber.split('-');
      seq = parseInt(parts[parts.length - 1], 10) || 0;
    }
    return `QT-${year}-${(seq + 1).toString().padStart(6, '0')}`;
  });
}

function resolveFrontendUrl(req: import('express').Request): string {
  const originHeader = req.get('origin') ?? req.get('referer');
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      // Fall through to env fallback below.
    }
  }
  return (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(',')[0].trim();
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sellerSnapshotWithTemplate(seller: unknown, templateId: string | null | undefined): object {
  const snap = objectRecord(seller);
  const documentPreferences = objectRecord(snap.documentPreferences);
  return {
    ...snap,
    documentPreferences: {
      ...documentPreferences,
      templateId: templateId ?? null,
      documentMode: 'ordinary',
    },
  };
}

type QuotationRevisionSummary = {
  id: string;
  quotationNumber: string;
  status: string;
  revisionNo: number;
  supersededById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

async function buildQuotationRevisionHistory(
  tx: Prisma.TransactionClient,
  companyId: string,
  quotation: { id: string; revisionRootId: string | null },
): Promise<QuotationRevisionSummary[]> {
  const rootId = quotation.revisionRootId ?? quotation.id;
  return tx.quotation.findMany({
    where: {
      companyId,
      OR: [{ id: rootId }, { revisionRootId: rootId }],
    },
    select: {
      id: true,
      quotationNumber: true,
      status: true,
      revisionNo: true,
      supersededById: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ revisionNo: 'asc' }, { createdAt: 'asc' }],
  });
}

function latestRevisionId(history: QuotationRevisionSummary[]): string | null {
  const latest = history.find((item) => !item.supersededById) ?? history[history.length - 1];
  return latest?.id ?? null;
}

// ── List ──────────────────────────────────────────────────────────────

// Force-expire this company's overdue `sent` quotations now, rather than
// waiting for the nightly cron (quotationExpiryWorker). Company-scoped.
quotationsRouter.post('/run-expiry', async (req, res) => {
  try {
    const expired = await runQuotationExpiry(req.user!.companyId);
    res.json({ data: { expired } });
  } catch (err) {
    logger.error('manual quotation expiry failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to run quotation expiry' });
  }
});

quotationsRouter.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const includeSuperseded = req.query.includeSuperseded === 'true';

    const where: Record<string, unknown> = { companyId: req.user!.companyId };
    if (!includeSuperseded) where.supersededById = null;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { quotationNumber: { contains: search, mode: 'insensitive' } },
        { buyer: { is: { nameTh: { contains: search, mode: 'insensitive' } } } },
        { buyer: { is: { nameEn: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const result = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [rows, total] = await Promise.all([
        tx.quotation.findMany({
          where,
          orderBy: [{ quotationDate: 'desc' }, { createdAt: 'desc' }],
          include: { buyer: { select: { id: true, nameTh: true, nameEn: true, taxId: true } } },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.quotation.count({ where }),
      ]);

      const roots = [...new Set(rows.map((row) => row.revisionRootId ?? row.id))];
      const allRevisions = roots.length > 0
        ? await tx.quotation.findMany({
          where: {
            companyId: req.user!.companyId,
            OR: [{ id: { in: roots } }, { revisionRootId: { in: roots } }],
          },
          select: { id: true, revisionRootId: true },
        })
        : [];
      const counts = allRevisions.reduce<Record<string, number>>((acc, row) => {
        const root = row.revisionRootId ?? row.id;
        acc[root] = (acc[root] ?? 0) + 1;
        return acc;
      }, {});
      return {
        rows: rows.map((row) => ({
          ...row,
          revisionCount: counts[row.revisionRootId ?? row.id] ?? 1,
        })),
        total,
      };
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
    logger.error('list quotations failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to list quotations' });
  }
});

// ── Get one ────────────────────────────────────────────────────────────

quotationsRouter.get('/:id', async (req, res) => {
  try {
    const result = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const quotation = await tx.quotation.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: {
          buyer: true,
          items: { orderBy: { id: 'asc' } },
          project: { select: { id: true, code: true, name: true } },
        },
      });
      if (!quotation) return null;
      const revisionHistory = await buildQuotationRevisionHistory(tx, req.user!.companyId, quotation);
      return { quotation, revisionHistory };
    });
    const quotation = result?.quotation;
    if (!quotation) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }
    const documentPreferences = objectRecord(objectRecord(quotation.seller).documentPreferences);
    res.json({
      data: {
        ...quotation,
        revisionHistory: result.revisionHistory,
        latestRevisionId: latestRevisionId(result.revisionHistory),
        templateId: typeof documentPreferences.templateId === 'string' ? documentPreferences.templateId : null,
      },
    });
  } catch (err) {
    logger.error('get quotation failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to get quotation' });
  }
});

// ── Preview / PDF ────────────────────────────────────────────────────

// Live preview from current form data (before saving), mirroring the invoice
// builder. Returns HTML (?format=html) for the inline iframe, or a PDF.
quotationsRouter.post('/preview', async (req, res) => {
  try {
    const body = quotationPreviewSchema.parse(req.body);
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: {
        nameTh: true, nameEn: true, taxId: true, branchCode: true,
        branchNameTh: true, branchNameEn: true,
        addressTh: true, addressEn: true,
        phone: true, email: true, website: true, logoUrl: true,
      },
    });

    const enrichedItems = body.items.map((item) => ({
      ...item,
      ...computeLineTotals(item),
      productId: item.productId ?? null,
      sectionTitle: item.sectionTitle ?? null,
      nameEn: item.nameEn ?? null,
      descriptionTh: item.descriptionTh ?? null,
      descriptionEn: item.descriptionEn ?? null,
    }));
    const { subtotal, vatAmount, total } = computeQuotationTotals(enrichedItems, body.discountAmount, body.feePercent);

    const previewQuotation = {
      quotationNumber: 'PREVIEW-001',
      quotationDate: body.quotationDate ? new Date(`${body.quotationDate}T00:00:00.000Z`) : new Date(),
      validUntil: body.validUntil ? new Date(`${body.validUntil}T23:59:59.000Z`) : null,
      language: body.language,
      kind: body.kind,
      serviceDetails: body.kind !== 'general' ? (body.serviceDetails ?? {}) : null,
      seller: sellerSnapshotWithTemplate(company ?? {}, body.templateId),
      subtotal,
      vatAmount,
      discountAmount: body.discountAmount,
      feePercent: body.feePercent ?? null,
      feeLabel: body.feeLabel ?? null,
      whtRate: body.whtRate ?? null,
      total,
      notes: body.notes ?? null,
      paymentTerms: body.paymentTerms ?? null,
      deliveryTerms: body.deliveryTerms ?? null,
      buyer: {
        nameTh: 'ลูกค้าตัวอย่าง',
        nameEn: 'Sample Customer',
        taxId: '0000000000000',
        branchCode: '00000',
        addressTh: 'ที่อยู่ตัวอย่าง',
        addressEn: 'Sample Address',
      },
      items: enrichedItems,
    };

    const pdfData = buildQuotationPdfData(previewQuotation as Parameters<typeof buildQuotationPdfData>[0]);
    const html = await buildHtmlForCompany(pdfData, req.user!.companyId);
    if (req.query.format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(html, 'utf8'));
      res.send(html);
      return;
    }
    const pdf = await generatePdfFromHtml(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="quotation-preview.pdf"');
    res.send(pdf);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    logger.error('quotation preview (form) failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

quotationsRouter.get('/:id/preview', async (req, res) => {
  try {
    const quotation = await prisma.quotation.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: {
        buyer: true,
        items: { orderBy: { id: 'asc' } },
      },
    });
    if (!quotation) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }

    const pdfData = buildQuotationPdfData(quotation);
    const html = await buildHtmlForCompany(pdfData, req.user!.companyId);
    if (req.query.format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      return;
    }

    const pdf = await generatePdfFromHtml(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${quotation.quotationNumber}.pdf"`);
    res.send(pdf);
  } catch (err) {
    logger.error('quotation preview failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to generate quotation PDF' });
  }
});

quotationsRouter.post('/:id/share-link', async (req, res) => {
  try {
    const quotation = await prisma.quotation.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { id: true, quotationNumber: true, status: true, supersededById: true },
    });
    if (!quotation) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }
    if (quotation.status === 'draft') {
      res.status(400).json({ error: 'Save and prepare the quotation before sharing it with a customer' });
      return;
    }
    if (quotation.status === 'cancelled' || quotation.status === 'converted') {
      res.status(400).json({ error: `Cannot share a ${quotation.status} quotation` });
      return;
    }
    if (quotation.supersededById) {
      res.status(409).json({ error: 'This quotation has a newer revision. Share the latest quotation instead.' });
      return;
    }

    const token = signQuotationShareToken({ quotationId: quotation.id, companyId: req.user!.companyId });
    const url = buildQuotationShareUrl(resolveFrontendUrl(req), token);

    res.json({ url, token, quotationNumber: quotation.quotationNumber });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create quotation share link';
    res.status(500).json({ error: message });
  }
});

// ── Create ────────────────────────────────────────────────────────────

quotationsRouter.post('/', async (req, res) => {
  try {
    const body = quotationCreateSchema.parse(req.body);

    // Verify the buyer exists in this tenant
    const buyer = await prisma.customer.findFirst({
      where: { id: body.buyerId, companyId: req.user!.companyId },
    });
    if (!buyer) {
      res.status(400).json({ error: 'Buyer (customer) not found in your company' });
      return;
    }
    if (body.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: body.projectId, companyId: req.user!.companyId },
        select: { id: true },
      });
      if (!project) {
        res.status(400).json({ error: 'Project not found in your company' });
        return;
      }
    }

    // Snapshot the seller (company) at issue time so future renames don't
    // mutate the historical document
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: {
        nameTh: true, nameEn: true, taxId: true, branchCode: true,
        branchNameTh: true, branchNameEn: true,
        addressTh: true, addressEn: true,
        phone: true, email: true, website: true, logoUrl: true,
      },
    });

    const enrichedItems = body.items.map((item) => {
      const totals = computeLineTotals(item);
      return { ...item, ...totals };
    });
    const { subtotal, vatAmount, total } = computeQuotationTotals(enrichedItems, body.discountAmount, body.feePercent);

    const quotationNumber = await generateQuotationNumber(req.user!.companyId);

    const created = await prisma.quotation.create({
      data: {
        companyId: req.user!.companyId,
        projectId: body.projectId ?? null,
        quotationNumber,
        language: body.language,
        kind: body.kind,
        serviceDetails: body.kind !== 'general' ? body.serviceDetails ?? {} : Prisma.JsonNull,
        quotationDate: new Date(`${body.quotationDate}T00:00:00.000Z`),
        validUntil: body.validUntil ? new Date(`${body.validUntil}T23:59:59.000Z`) : null,
        buyerId: body.buyerId,
        seller: sellerSnapshotWithTemplate(company ?? {}, body.templateId),
        subtotal,
        vatAmount,
        discountAmount: body.discountAmount,
        feePercent: body.feePercent ?? null,
        feeLabel: body.feeLabel ?? null,
        whtRate: body.whtRate ?? null,
        total,
        notes: body.notes ?? null,
        paymentTerms: body.paymentTerms ?? null,
        deliveryTerms: body.deliveryTerms ?? null,
        createdBy: req.user!.userId,
        items: {
          create: enrichedItems.map((item) => ({
            productId: item.productId ?? null,
            sectionTitle: item.sectionTitle ?? null,
            nameTh: item.nameTh,
            nameEn: item.nameEn ?? null,
            descriptionTh: item.descriptionTh ?? null,
            descriptionEn: item.descriptionEn ?? null,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            vatType: item.vatType,
            amount: item.amount,
            vatAmount: item.vatAmount,
            totalAmount: item.totalAmount,
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
    logger.error('create quotation failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to create quotation' });
  }
});

// ── Revise locked quotation ───────────────────────────────────────────

quotationsRouter.post('/:id/revise', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, companyId },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }
    if (existing.supersededById) {
      res.status(409).json({ error: 'This quotation already has a newer revision. Open the latest revision before editing.' });
      return;
    }
    if (existing.status === 'draft') {
      res.status(400).json({ error: 'Draft quotations can be edited directly' });
      return;
    }
    if (existing.status === 'converted') {
      res.status(400).json({ error: 'Converted quotations are locked. Create a new quotation for a new deal.' });
      return;
    }
    if (existing.status === 'cancelled') {
      res.status(400).json({ error: 'Cancelled quotations cannot be revised. Create a new quotation instead.' });
      return;
    }

    const rootId = existing.revisionRootId ?? existing.id;
    const [quotationNumber, latestRevision] = await Promise.all([
      generateQuotationNumber(companyId),
      prisma.quotation.findFirst({
        where: {
          companyId,
          OR: [{ id: rootId }, { revisionRootId: rootId }],
        },
        orderBy: [{ revisionNo: 'desc' }, { createdAt: 'desc' }],
        select: { revisionNo: true },
      }),
    ]);
    const revisionNo = (latestRevision?.revisionNo ?? existing.revisionNo ?? 0) + 1;
    const now = new Date();
    const validUntil = new Date(now.getTime() + 30 * 86400_000);
    validUntil.setHours(23, 59, 59, 0);

    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.quotation.create({
        data: {
          companyId: existing.companyId,
          projectId: existing.projectId,
          quotationNumber,
          status: 'draft',
          language: existing.language,
          kind: existing.kind,
          serviceDetails: existing.serviceDetails ?? Prisma.JsonNull,
          quotationDate: now,
          validUntil,
          buyerId: existing.buyerId,
          seller: existing.seller as object,
          subtotal: existing.subtotal,
          vatAmount: existing.vatAmount,
          discountAmount: existing.discountAmount,
          feePercent: existing.feePercent,
          feeLabel: existing.feeLabel,
          total: existing.total,
          whtRate: existing.whtRate,
          notes: existing.notes,
          paymentTerms: existing.paymentTerms,
          deliveryTerms: existing.deliveryTerms,
          revisionRootId: rootId,
          revisionNo,
          createdBy: req.user!.userId,
          items: {
            create: existing.items.map((item) => ({
              productId: item.productId,
              sectionTitle: item.sectionTitle,
              nameTh: item.nameTh,
              nameEn: item.nameEn,
              descriptionTh: item.descriptionTh,
              descriptionEn: item.descriptionEn,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              vatType: item.vatType,
              amount: item.amount,
              vatAmount: item.vatAmount,
              totalAmount: item.totalAmount,
            })),
          },
        },
        include: {
          buyer: true,
          items: { orderBy: { id: 'asc' } },
        },
      });

      await tx.quotation.update({
        where: { id: existing.id },
        data: { supersededById: created.id, supersededAt: now },
      });

      return created;
    });

    res.status(201).json({ data: result });
  } catch (err) {
    logger.error('revise quotation failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to create quotation revision' });
  }
});

// ── Update (draft only) ───────────────────────────────────────────────

quotationsRouter.patch('/:id', async (req, res) => {
  try {
    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }
    // Only drafts are freely editable. Sent/accepted lock the document so an
    // accountant doesn't accidentally change a price after the customer has
    // already received the PDF.
    if (existing.status !== 'draft') {
      res.status(400).json({ error: `Cannot edit a quotation in status '${existing.status}'` });
      return;
    }

    const body = quotationCreateSchema.partial().parse(req.body);
    if (body.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: body.projectId, companyId: req.user!.companyId },
        select: { id: true },
      });
      if (!project) {
        res.status(400).json({ error: 'Project not found in your company' });
        return;
      }
    }

    // Build the update — items are replaced wholesale to keep totals in sync
    let itemsUpdate: object | undefined;
    let recomputedTotals: { subtotal: number; vatAmount: number; total: number } | undefined;
    if (body.items) {
      const enrichedItems = body.items.map((item) => {
        const totals = computeLineTotals(item);
        return { ...item, ...totals };
      });
      const discount = body.discountAmount ?? existing.discountAmount;
      const feePercent = body.feePercent !== undefined ? body.feePercent : existing.feePercent;
      const { subtotal, vatAmount, total } = computeQuotationTotals(enrichedItems, discount, feePercent);
      recomputedTotals = { subtotal, vatAmount, total };
      itemsUpdate = {
        deleteMany: {},
        create: enrichedItems.map((item) => ({
          productId: item.productId ?? null,
          sectionTitle: item.sectionTitle ?? null,
          nameTh: item.nameTh,
          nameEn: item.nameEn ?? null,
          descriptionTh: item.descriptionTh ?? null,
          descriptionEn: item.descriptionEn ?? null,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          vatType: item.vatType,
          amount: item.amount,
          vatAmount: item.vatAmount,
          totalAmount: item.totalAmount,
        })),
      };
    }

    const updated = await prisma.quotation.update({
      where: { id: existing.id },
      data: {
        ...(body.buyerId ? { buyerId: body.buyerId } : {}),
        ...(body.projectId !== undefined ? { projectId: body.projectId ?? null } : {}),
        ...(body.quotationDate ? { quotationDate: new Date(`${body.quotationDate}T00:00:00.000Z`) } : {}),
        ...(body.validUntil !== undefined ? { validUntil: body.validUntil ? new Date(`${body.validUntil}T23:59:59.000Z`) : null } : {}),
        ...(body.language ? { language: body.language } : {}),
        ...(body.kind ? { kind: body.kind } : {}),
        ...(body.kind === 'general'
          ? { serviceDetails: Prisma.JsonNull }
          : body.serviceDetails !== undefined
            ? { serviceDetails: body.serviceDetails ?? Prisma.JsonNull }
            : {}),
        ...(body.discountAmount !== undefined ? { discountAmount: body.discountAmount } : {}),
        ...(body.feePercent !== undefined ? { feePercent: body.feePercent ?? null } : {}),
        ...(body.feeLabel !== undefined ? { feeLabel: body.feeLabel ?? null } : {}),
        ...(body.whtRate !== undefined ? { whtRate: body.whtRate ?? null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
        ...(body.paymentTerms !== undefined ? { paymentTerms: body.paymentTerms ?? null } : {}),
        ...(body.deliveryTerms !== undefined ? { deliveryTerms: body.deliveryTerms ?? null } : {}),
        ...(body.templateId !== undefined ? { seller: sellerSnapshotWithTemplate(existing.seller, body.templateId) } : {}),
        ...(recomputedTotals ? recomputedTotals : {}),
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
    logger.error('update quotation failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to update quotation' });
  }
});

// ── Status transitions ────────────────────────────────────────────────

const statusSchema = z.object({
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'cancelled']),
  reason: z.string().max(500).optional(),
});

quotationsRouter.post('/:id/status', async (req, res) => {
  try {
    const body = statusSchema.parse(req.body);
    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }
    if (existing.status === 'converted') {
      res.status(400).json({ error: 'Quotation already converted to an invoice — cannot change status' });
      return;
    }
    if (existing.supersededById) {
      res.status(409).json({ error: 'This quotation has a newer revision. Update the latest revision instead.' });
      return;
    }

    const updated = await prisma.quotation.update({
      where: { id: existing.id },
      data: {
        status: body.status,
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
    logger.error('update quotation status failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ── Convert to Invoice ────────────────────────────────────────────────
// Atomically: create an Invoice with the quotation's items + buyer + total,
// then flip the quotation's status to 'converted' with a back-link.

quotationsRouter.post('/:id/convert-to-invoice', async (req, res) => {
  try {
    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: { items: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }
    if (existing.status === 'converted') {
      res.status(400).json({ error: 'Quotation already converted' });
      return;
    }
    if (existing.supersededById) {
      res.status(409).json({ error: 'This quotation has a newer revision. Convert the latest accepted revision instead.' });
      return;
    }
    if (existing.status === 'cancelled' || existing.status === 'rejected' || existing.status === 'expired') {
      res.status(400).json({ error: `Cannot convert a ${existing.status} quotation` });
      return;
    }

    const invoiceNumber = await generateInvoiceNumber(req.user!.companyId, 'tax_invoice');

    // A management/agency fee lives on the quotation as a percent, not a line.
    // The quotation totals already bake it in (subtotal excludes it, vat/total
    // include it), so on the invoice we must materialize the fee as a real line
    // item — otherwise subtotal + VAT would not reconcile to total and the
    // e-Tax XML would be rejected. Adding the line lifts the invoice subtotal to
    // (item subtotal + fee), which reconciles against the carried-over VAT/total.
    const feeAmount = existing.feePercent && existing.feePercent > 0
      ? +((existing.subtotal * existing.feePercent) / 100).toFixed(2)
      : 0;
    const feeLine = feeAmount > 0
      ? {
        productId: null,
        nameTh: existing.feeLabel || 'ค่าบริหารงาน',
        nameEn: existing.feeLabel || 'Management fee',
        descriptionTh: existing.feePercent ? `${existing.feePercent}% ของยอดก่อน VAT` : null,
        descriptionEn: null,
        quantity: 1,
        unit: 'งาน',
        unitPrice: feeAmount,
        discountAmount: 0,
        vatType: 'vat7' as const,
        amount: feeAmount,
        vatAmount: +(feeAmount * 0.07).toFixed(2),
        totalAmount: +(feeAmount * 1.07).toFixed(2),
      }
      : null;
    const invoiceSubtotal = +(existing.subtotal + feeAmount).toFixed(2);

    const result = await prisma.$transaction(async (tx) => {
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
          subtotal: invoiceSubtotal,
          vatAmount: existing.vatAmount,
          discountAmount: existing.discountAmount,
          total: existing.total,
          whtRate: existing.whtRate,
          notes: existing.notes,
          createdBy: req.user!.userId,
          items: {
            create: [
              ...existing.items.map((item) => ({
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
                amount: item.amount,
                vatAmount: item.vatAmount,
                totalAmount: item.totalAmount,
              })),
              ...(feeLine ? [feeLine] : []),
            ],
          },
        },
        include: { items: true },
      });

      const updatedQuotation = await tx.quotation.update({
        where: { id: existing.id },
        data: {
          status: 'converted',
          convertedToInvoiceId: invoice.id,
          convertedAt: new Date(),
        },
      });

      return { invoice, quotation: updatedQuotation };
    });

    res.status(201).json({ data: result });
  } catch (err) {
    logger.error('convert quotation failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to convert quotation to invoice' });
  }
});

// ── Delete (draft only) ───────────────────────────────────────────────

quotationsRouter.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }
    if (existing.status !== 'draft') {
      res.status(400).json({ error: `Cannot delete a ${existing.status} quotation — change status to 'cancelled' instead` });
      return;
    }
    await prisma.quotation.delete({ where: { id: existing.id } });
    res.json({ data: { id: existing.id, deleted: true } });
  } catch (err) {
    logger.error('delete quotation failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to delete quotation' });
  }
});
