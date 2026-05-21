import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { withInvoiceLock, withRlsContext, tenantRlsContext } from '../config/rls';
import { generatePdfFromHtml } from '../services/pdfService';
import { escapeHtml, formatCurrency, formatDateEn, formatDateTh } from '../services/pdfService/utils';

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

function optionalDate(value: Date | null | undefined, language: string) {
  if (!value) return '-';
  return language === 'en' ? formatDateEn(value) : formatDateTh(value);
}

function textValue(source: unknown, key: string) {
  if (!source || typeof source !== 'object') return '';
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function buildDeliveryNoteHtml(note: {
  deliveryNoteNumber: string;
  language: string;
  deliveryDate: Date;
  expectedDate: Date | null;
  deliveredAt: Date | null;
  seller: unknown;
  buyer: {
    nameTh: string;
    nameEn: string | null;
    taxId: string;
    branchCode: string;
    branchNameTh?: string | null;
    addressTh: string;
    addressEn?: string | null;
  };
  items: Array<{
    nameTh: string;
    nameEn: string | null;
    descriptionTh: string | null;
    descriptionEn: string | null;
    quantity: number;
    deliveredQty: number;
    unit: string;
    unitPrice: number | null;
    amount: number | null;
  }>;
  status: string;
  shippingAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  vehicleNo: string | null;
  trackingNo: string | null;
  notes: string | null;
  deliveryTerms: string | null;
  quotation?: { quotationNumber: string } | null;
  invoice?: { invoiceNumber: string } | null;
}) {
  const isEn = note.language === 'en';
  const seller = note.seller;
  const sellerName = textValue(seller, isEn ? 'nameEn' : 'nameTh') || textValue(seller, 'nameTh') || '-';
  const sellerAddress = textValue(seller, isEn ? 'addressEn' : 'addressTh') || textValue(seller, 'addressTh') || '-';
  const buyerName = (isEn ? note.buyer.nameEn : note.buyer.nameTh) || note.buyer.nameTh || '-';
  const buyerAddress = (isEn ? note.buyer.addressEn : note.buyer.addressTh) || note.buyer.addressTh || '-';
  const deliveredTotal = note.items.reduce((sum, item) => sum + Number(item.deliveredQty || 0), 0);
  const amountTotal = note.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const showAmount = note.items.some((item) => item.amount !== null && item.unitPrice !== null);

  const labels = {
    title: isEn ? 'Delivery Note' : 'ใบส่งของ',
    subtitle: isEn ? 'Operational delivery document, not a tax invoice' : 'เอกสารส่งมอบสินค้า/บริการ ไม่ใช่เอกสารภาษี',
    number: isEn ? 'No.' : 'เลขที่',
    deliveryDate: isEn ? 'Delivery date' : 'วันที่ส่งของ',
    expectedDate: isEn ? 'Expected date' : 'กำหนดส่ง',
    deliveredAt: isEn ? 'Delivered at' : 'ส่งครบเมื่อ',
    status: isEn ? 'Status' : 'สถานะ',
    seller: isEn ? 'Sender' : 'ผู้ส่ง',
    buyer: isEn ? 'Recipient' : 'ผู้รับ/ลูกค้า',
    shipping: isEn ? 'Shipping details' : 'รายละเอียดการจัดส่ง',
    contact: isEn ? 'Contact' : 'ผู้รับสินค้า',
    phone: isEn ? 'Phone' : 'โทรศัพท์',
    vehicle: isEn ? 'Vehicle / carrier' : 'ทะเบียนรถ / ผู้ขนส่ง',
    tracking: isEn ? 'Tracking' : 'Tracking',
    reference: isEn ? 'Reference' : 'เอกสารอ้างอิง',
    item: isEn ? 'Item' : 'รายการ',
    ordered: isEn ? 'Ordered' : 'จำนวนสั่ง',
    delivered: isEn ? 'Delivered' : 'จำนวนส่ง',
    unit: isEn ? 'Unit' : 'หน่วย',
    unitPrice: isEn ? 'Unit price' : 'ราคา/หน่วย',
    amount: isEn ? 'Amount' : 'มูลค่า',
    totalDelivered: isEn ? 'Total delivered' : 'จำนวนส่งรวม',
    notes: isEn ? 'Notes' : 'หมายเหตุ',
    terms: isEn ? 'Delivery terms' : 'เงื่อนไขการส่งของ',
    signature: isEn ? 'Recipient signature' : 'ลายเซ็นผู้รับสินค้า',
    date: isEn ? 'Date' : 'วันที่',
  };

  const reference = [
    note.quotation?.quotationNumber ? `${isEn ? 'Quotation' : 'ใบเสนอราคา'}: ${note.quotation.quotationNumber}` : null,
    note.invoice?.invoiceNumber ? `${isEn ? 'Invoice' : 'ใบกำกับภาษี'}: ${note.invoice.invoiceNumber}` : null,
  ].filter(Boolean).join(' / ') || '-';

  const itemRows = note.items.map((item, index) => {
    const itemName = (isEn ? item.nameEn : item.nameTh) || item.nameTh;
    const desc = (isEn ? item.descriptionEn : item.descriptionTh) || item.descriptionTh || '';
    return `
      <tr>
        <td class="idx">${index + 1}</td>
        <td>
          <div class="item-name">${escapeHtml(itemName)}</div>
          ${desc ? `<div class="muted">${escapeHtml(desc)}</div>` : ''}
        </td>
        <td class="num">${formatCurrency(item.quantity)}</td>
        <td class="num">${formatCurrency(item.deliveredQty)}</td>
        <td>${escapeHtml(item.unit)}</td>
        ${showAmount ? `<td class="num">${item.unitPrice === null ? '-' : formatCurrency(item.unitPrice)}</td><td class="num">${item.amount === null ? '-' : formatCurrency(item.amount)}</td>` : ''}
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'th'}">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', sans-serif; color:#0f172a; margin:0; padding:28px; background:#fff; }
  .page { max-width: 210mm; margin:0 auto; }
  .top { display:flex; justify-content:space-between; gap:24px; border-bottom:3px solid #155e75; padding-bottom:18px; margin-bottom:18px; }
  .eyebrow { font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:#64748b; }
  h1 { margin:4px 0 2px; font-size:30px; color:#0f172a; }
  .subtitle { font-size:12px; color:#64748b; }
  .meta { min-width:230px; border:1px solid #cbd5e1; border-radius:10px; padding:12px; font-size:12px; }
  .meta-row, .summary-row { display:flex; justify-content:space-between; gap:12px; margin:3px 0; }
  .label { color:#64748b; }
  .value { font-weight:600; text-align:right; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
  .card { border:1px solid #e2e8f0; border-radius:10px; padding:14px; min-height:118px; }
  .card h2 { margin:0 0 8px; font-size:14px; color:#155e75; }
  .muted { color:#64748b; font-size:11px; }
  .strong { font-weight:600; }
  table { width:100%; border-collapse:collapse; margin-top:14px; font-size:12px; }
  th { background:#f1f5f9; color:#334155; text-align:left; padding:9px; border:1px solid #cbd5e1; font-size:11px; }
  td { padding:9px; border:1px solid #e2e8f0; vertical-align:top; }
  .idx { width:34px; text-align:center; color:#64748b; }
  .num { text-align:right; white-space:nowrap; }
  .item-name { font-weight:600; }
  .summary { display:flex; justify-content:flex-end; margin-top:12px; }
  .summary-box { width:280px; border:1px solid #cbd5e1; border-radius:10px; padding:12px; background:#f8fafc; }
  .footer-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:14px; }
  .signature { margin-top:34px; display:grid; grid-template-columns:1fr 1fr; gap:48px; text-align:center; font-size:12px; }
  .sig-line { border-top:1px solid #64748b; padding-top:8px; }
  @page { size:A4; margin:10mm; }
  @media print { body { padding:0; } .page { max-width:none; } }
</style>
</head>
<body>
<main class="page">
  <section class="top">
    <div>
      <div class="eyebrow">Billboy</div>
      <h1>${labels.title}</h1>
      <div class="subtitle">${labels.subtitle}</div>
    </div>
    <div class="meta">
      <div class="meta-row"><span class="label">${labels.number}</span><span class="value">${escapeHtml(note.deliveryNoteNumber)}</span></div>
      <div class="meta-row"><span class="label">${labels.deliveryDate}</span><span class="value">${optionalDate(note.deliveryDate, note.language)}</span></div>
      <div class="meta-row"><span class="label">${labels.expectedDate}</span><span class="value">${optionalDate(note.expectedDate, note.language)}</span></div>
      <div class="meta-row"><span class="label">${labels.deliveredAt}</span><span class="value">${optionalDate(note.deliveredAt, note.language)}</span></div>
      <div class="meta-row"><span class="label">${labels.status}</span><span class="value">${escapeHtml(note.status)}</span></div>
    </div>
  </section>

  <section class="grid">
    <div class="card">
      <h2>${labels.seller}</h2>
      <div class="strong">${escapeHtml(sellerName)}</div>
      <div>${escapeHtml(sellerAddress)}</div>
      <div class="muted">${escapeHtml(textValue(seller, 'taxId') ? `Tax ID: ${textValue(seller, 'taxId')}` : '')}</div>
      <div class="muted">${escapeHtml([textValue(seller, 'phone'), textValue(seller, 'email')].filter(Boolean).join(' · '))}</div>
    </div>
    <div class="card">
      <h2>${labels.buyer}</h2>
      <div class="strong">${escapeHtml(buyerName)}</div>
      <div>${escapeHtml(buyerAddress)}</div>
      <div class="muted">Tax ID: ${escapeHtml(note.buyer.taxId)} / Branch: ${escapeHtml(note.buyer.branchCode)}</div>
    </div>
  </section>

  <section class="card">
    <h2>${labels.shipping}</h2>
    <div>${escapeHtml(note.shippingAddress || buyerAddress)}</div>
    <div class="muted">${labels.contact}: ${escapeHtml(note.contactName || '-')} · ${labels.phone}: ${escapeHtml(note.contactPhone || '-')}</div>
    <div class="muted">${labels.vehicle}: ${escapeHtml(note.vehicleNo || '-')} · ${labels.tracking}: ${escapeHtml(note.trackingNo || '-')}</div>
    <div class="muted">${labels.reference}: ${escapeHtml(reference)}</div>
  </section>

  <table>
    <thead>
      <tr>
        <th class="idx">#</th>
        <th>${labels.item}</th>
        <th class="num">${labels.ordered}</th>
        <th class="num">${labels.delivered}</th>
        <th>${labels.unit}</th>
        ${showAmount ? `<th class="num">${labels.unitPrice}</th><th class="num">${labels.amount}</th>` : ''}
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <section class="summary">
    <div class="summary-box">
      <div class="summary-row"><span>${labels.totalDelivered}</span><strong>${formatCurrency(deliveredTotal)}</strong></div>
      ${showAmount ? `<div class="summary-row"><span>${labels.amount}</span><strong>${formatCurrency(amountTotal)}</strong></div>` : ''}
    </div>
  </section>

  <section class="footer-grid">
    <div class="card"><h2>${labels.terms}</h2><div>${escapeHtml(note.deliveryTerms || '-')}</div></div>
    <div class="card"><h2>${labels.notes}</h2><div>${escapeHtml(note.notes || '-')}</div></div>
  </section>

  <section class="signature">
    <div><div class="sig-line">${labels.signature}</div></div>
    <div><div class="sig-line">${labels.date}</div></div>
  </section>
</main>
</body>
</html>`;
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

deliveryNotesRouter.get('/:id/preview', async (req, res) => {
  try {
    const deliveryNote = await prisma.deliveryNote.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: {
        buyer: true,
        items: { orderBy: { id: 'asc' } },
        quotation: { select: { quotationNumber: true } },
        invoice: { select: { invoiceNumber: true } },
      },
    });
    if (!deliveryNote) {
      res.status(404).json({ error: 'Delivery note not found' });
      return;
    }

    const html = buildDeliveryNoteHtml(deliveryNote);
    if (req.query.format === 'pdf') {
      const pdfBuffer = await generatePdfFromHtml(html);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${deliveryNote.deliveryNoteNumber}.pdf"`);
      res.send(pdfBuffer);
      return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(html, 'utf8'));
    res.send(html);
  } catch (err) {
    logger.error('delivery note preview failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to generate delivery note preview' });
  }
});

deliveryNotesRouter.post('/from-quotation/:quotationId', async (req, res) => {
  try {
    const quotation = await prisma.quotation.findFirst({
      where: { id: req.params.quotationId, companyId: req.user!.companyId },
      include: { items: true, buyer: true },
    });
    if (!quotation) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }
    if (['rejected', 'expired', 'cancelled'].includes(quotation.status)) {
      res.status(400).json({ error: `Cannot create a delivery note from a ${quotation.status} quotation` });
      return;
    }

    const existing = await prisma.deliveryNote.findFirst({
      where: { companyId: req.user!.companyId, quotationId: quotation.id, status: { not: 'cancelled' } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      res.status(409).json({ error: 'Delivery note already exists for this quotation', data: existing });
      return;
    }

    const deliveryNoteNumber = await generateDeliveryNoteNumber(req.user!.companyId);
    const created = await prisma.deliveryNote.create({
      data: {
        companyId: quotation.companyId,
        projectId: quotation.projectId,
        quotationId: quotation.id,
        deliveryNoteNumber,
        status: 'draft',
        language: quotation.language,
        deliveryDate: new Date(),
        buyerId: quotation.buyerId,
        seller: quotation.seller as object,
        shippingAddress: quotation.buyer.addressTh,
        contactName: quotation.buyer.contactPerson,
        contactPhone: quotation.buyer.phone,
        deliveryTerms: quotation.deliveryTerms,
        notes: quotation.notes,
        createdBy: req.user!.userId,
        items: {
          create: quotation.items.map((item) => ({
            productId: item.productId,
            nameTh: item.nameTh,
            nameEn: item.nameEn,
            descriptionTh: item.descriptionTh,
            descriptionEn: item.descriptionEn,
            quantity: item.quantity,
            deliveredQty: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            vatType: item.vatType,
            amount: item.amount,
          })),
        },
      },
      include: { buyer: true, items: true, quotation: { select: { id: true, quotationNumber: true } } },
    });

    res.status(201).json({ data: created });
  } catch (err) {
    logger.error('create delivery note from quotation failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to create delivery note from quotation' });
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

    const draftSeq = Date.now().toString().slice(-6);
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    const invoiceNumber = `DRAFT-${ym}-${draftSeq}`;
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
