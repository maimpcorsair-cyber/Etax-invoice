import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext, withSystemRlsContext } from '../config/rls';
import { invoiceQueue, rdSubmissionQueue } from '../queues';
import { auditLog } from '../services/auditService';
import { requireRole } from '../middleware/auth';
import { generateInvoiceNumber } from '../services/invoiceService';
import { generateInvoiceExcel } from '../services/exportService';
import { exportInvoicesToSheets } from '../services/googleSheetsService';
import { sendInvoiceToCustomer } from '../services/emailService';
import { generatePdf, generatePdfFromHtml, buildHtmlForCompany } from '../services/pdfService';
import {
  getLimitErrorMessage,
  getUsageLimit,
  getUsageValue,
  hasFeatureAccess,
  resolveCompanyAccessPolicy,
} from '../services/accessPolicyService';

export const invoicesRouter = Router();

const itemSchema = z.object({
  productId: z.string().optional(),
  nameTh: z.string().min(1),
  nameEn: z.string().optional(),
  descriptionTh: z.string().optional(),
  descriptionEn: z.string().optional(),
  quantity: z.number().positive(),
  unit: z.string(),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(100).default(0),
  vatType: z.enum(['vat7', 'vatExempt', 'vatZero']),
});

const createInvoiceSchema = z.object({
  type: z.enum(['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note']),
  language: z.enum(['th', 'en', 'both']),
  invoiceDate: z.string(),
  dueDate: z.string().optional(),
  customerId: z.string(),
  items: z.array(itemSchema).min(1),
  discount: z.number().min(0).default(0),
  notes: z.string().optional(),
  paymentMethod: z.string().optional(),
  templateId: z.string().optional(),
  documentMode: z.enum(['ordinary', 'electronic']).optional(),
  bankPaymentInfo: z.string().optional(),
  showCompanyLogo: z.boolean().optional(),
  documentLogoUrl: z.string().optional(),
  signatureImageUrl: z.string().optional(),
  signerName: z.string().optional(),
  signerTitle: z.string().optional(),
  referenceInvoiceId: z.string().optional(),
  referenceDocNumber: z.string().optional(),
  asDraft: z.boolean().optional().default(false),
});
const updateInvoiceSchema = createInvoiceSchema;

const previewInvoiceSchema = z.object({
  type: z.enum(['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note']),
  language: z.enum(['th', 'en', 'both']),
  invoiceDate: z.string(),
  dueDate: z.string().optional(),
  items: z.array(itemSchema).min(1),
  notes: z.string().optional(),
  logoUrl: z.string().optional(),
  templateId: z.string().optional(),
  documentMode: z.enum(['ordinary', 'electronic']).optional(),
  bankPaymentInfo: z.string().optional(),
  showCompanyLogo: z.boolean().optional(),
  signatureImageUrl: z.string().optional(),
  signerName: z.string().optional(),
  signerTitle: z.string().optional(),
})

function calculateTotals(items: z.infer<typeof itemSchema>[]) {
  const VAT_RATE = 0.07;
  let subtotal = 0;
  let totalVat = 0;

  const calculated = items.map((item) => {
    const gross = item.quantity * item.unitPrice;
    const discountAmt = item.discount > 0 ? (gross * item.discount) / 100 : 0;
    const amount = gross - discountAmt;
    const vatAmount = item.vatType === 'vat7' ? amount * VAT_RATE : 0;
    subtotal += amount;
    totalVat += vatAmount;
    return { ...item, amount, vatAmount, totalAmount: amount + vatAmount };
  });

  return { calculated, subtotal, totalVat, total: subtotal + totalVat };
}

/**
 * Queue an invoice for RD submission.
 * Used by:
 *   - POST /              → T01 (tax_invoice_receipt) cash sale: auto-submit on create
 *   - POST /:id/issue-receipt → T03 (receipt): auto-submit when payment received
 *   - POST /:id/submit-rd → manual trigger for T02/T04/T05 after approval
 *
 * IMPORTANT: uses rdSubmissionQueue (not invoiceQueue) — rdSubmitWorker listens on 'rd-submission'.
 */
async function queueRdSubmission(invoiceId: string) {
  await withSystemRlsContext(prisma, (tx) => tx.invoice.update({
    where: { id: invoiceId },
    data: { status: 'approved', rdSubmissionStatus: 'pending' },
  }), { role: 'queue' });
  await rdSubmissionQueue.add('submit-to-rd', { invoiceId }, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

async function enqueueInvoicePdf(invoiceId: string, language: string) {
  try {
    // Timeout after 5 s — if Redis is unreachable we must not block the HTTP response
    await Promise.race([
      invoiceQueue.add('generate-pdf', { invoiceId, language }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('PDF queue timeout')), 5000),
      ),
    ]);
  } catch (err) {
    console.error('Failed to enqueue invoice PDF job (best-effort):', err);
  }
}

async function queueRdSubmissionBestEffort(invoiceId: string) {
  try {
    // Timeout after 5 s — if Redis is unreachable we must not block the HTTP response
    await Promise.race([
      queueRdSubmission(invoiceId),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('RD queue timeout')), 5000),
      ),
    ]);
  } catch (err) {
    console.error('Failed to enqueue RD submission job (best-effort):', err);
  }
}

/* ─── Excel Export ─── */
invoicesRouter.get('/export/excel', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'export_excel')) {
      res.status(403).json({ error: 'Upgrade to Business or Enterprise to export invoice data' });
      return;
    }

    const { status, search } = req.query;
    const where: Record<string, unknown> = { companyId: req.user!.companyId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search as string, mode: 'insensitive' } },
        { buyer: { nameTh: { contains: search as string } } },
        { buyer: { nameEn: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    const invoices = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findMany({
        where,
        orderBy: { invoiceDate: 'desc' },
        include: { buyer: { select: { nameTh: true, nameEn: true, taxId: true } } },
      });
    });

    const rows = invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      type: inv.type,
      buyerNameTh: inv.buyer.nameTh,
      buyerNameEn: inv.buyer.nameEn,
      buyerTaxId: inv.buyer.taxId,
      subtotal: inv.subtotal,
      vatAmount: inv.vatAmount,
      total: inv.total,
      status: inv.status,
      rdSubmissionStatus: inv.rdSubmissionStatus,
      rdDocId: inv.rdDocId,
      notes: inv.notes,
    }));

    const buffer = await generateInvoiceExcel(rows);
    const filename = `invoices-${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

/* ─── Google Sheets Export ─── */
invoicesRouter.post('/export/sheets', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'export_google_sheets')) {
      res.status(403).json({ error: 'Upgrade to Business or Enterprise to export to Google Sheets' });
      return;
    }

    const { status, search } = req.body as { status?: string; search?: string };
    const where: Record<string, unknown> = { companyId: req.user!.companyId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { buyer: { nameTh: { contains: search } } },
      ];
    }

    const [invoices, company] = await Promise.all([
      withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        return tx.invoice.findMany({
          where,
          orderBy: { invoiceDate: 'desc' },
          include: { buyer: { select: { nameTh: true, nameEn: true, taxId: true } } },
        });
      }),
      prisma.company.findUnique({ where: { id: req.user!.companyId } }),
    ]);

    if (!company) { res.status(404).json({ error: 'Company not found' }); return; }

    const rows = invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      type: inv.type,
      buyerNameTh: inv.buyer.nameTh,
      buyerNameEn: inv.buyer.nameEn,
      buyerTaxId: inv.buyer.taxId,
      subtotal: inv.subtotal,
      vatAmount: inv.vatAmount,
      total: inv.total,
      status: inv.status,
      rdSubmissionStatus: inv.rdSubmissionStatus,
      rdDocId: inv.rdDocId,
    }));

    const url = await exportInvoicesToSheets(rows, company.nameTh);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: 'Google Sheets export failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

invoicesRouter.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '20', status, search } = req.query;
    const pageNumber = parseInt(page as string);
    const limitNumber = parseInt(limit as string);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Record<string, unknown> = { companyId: req.user!.companyId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search as string, mode: 'insensitive' } },
        { buyer: { nameTh: { contains: search as string } } },
        { buyer: { nameEn: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    const { invoices, total } = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [items, count] = await Promise.all([
        tx.invoice.findMany({ where, skip, take: limitNumber, orderBy: { createdAt: 'desc' }, include: { buyer: { select: { nameTh: true, nameEn: true, taxId: true } }, items: true } }),
        tx.invoice.count({ where }),
      ]);
      return { invoices: items, total: count };
    });

    res.json({
      data: invoices,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

invoicesRouter.get('/template-options', async (req, res) => {
  try {
    const templates = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.documentTemplate.findMany({
        where: { companyId: req.user!.companyId },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          type: true,
          language: true,
          isActive: true,
        },
      });
    });
    res.json({ data: templates });
  } catch {
    res.status(500).json({ error: 'Failed to load template options' });
  }
});

invoicesRouter.post('/', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    const limit = getUsageLimit(policy, 'documents');
    if (!hasFeatureAccess(policy, 'create_invoice')) {
      res.status(403).json({ error: 'Your current plan cannot create invoices' });
      return;
    }
    if (limit !== null && getUsageValue(policy, 'documents') >= limit) {
      res.status(403).json({ error: getLimitErrorMessage('documents', policy) });
      return;
    }

    const body = createInvoiceSchema.parse(req.body);
    const { calculated, subtotal, totalVat, total } = calculateTotals(body.items);

    const [customer, company] = await Promise.all([
      withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        return tx.customer.findFirst({ where: { id: body.customerId, companyId: req.user!.companyId } });
      }),
      prisma.company.findUnique({ where: { id: req.user!.companyId } }),
    ]);
    if (!customer) { res.status(404).json({ error: 'Customer not found' }); return; }
    if (!company) { res.status(404).json({ error: 'Company not found' }); return; }

    // Draft save: use a temporary number; skip PDF + RD queue
    const isDraft = body.asDraft === true;
    let invoiceNumber: string;
    if (isDraft) {
      const draftSeq = Date.now().toString().slice(-6);
      const ym = new Date().toISOString().slice(0, 7).replace('-', '');
      invoiceNumber = `DRAFT-${ym}-${draftSeq}`;
    } else {
      invoiceNumber = await generateInvoiceNumber(req.user!.companyId, body.type);
    }

    // combined type (ขายสด) → isPaid = true ทันที
    const isCashSale = body.type === 'tax_invoice_receipt';

    // เอกสารที่ต้อง submit RD ทันทีเมื่อออก (VAT เกิดตอนออกเอกสาร ตาม ประมวลรัษฎากร ม. 78)
    // T01 = ขายสด (invoice+receipt รวม) — VAT เกิดตอนรับเงิน
    // T02 = ใบกำกับภาษีสินค้า — VAT เกิดตอนส่งมอบสินค้า ไม่ใช่ตอนรับเงิน
    // T04/T05 = ใบลดหนี้/เพิ่มหนี้ — ยังคง manual เพราะต้องการ approval จากผู้บริหาร
    const autoSubmitTypes = ['tax_invoice_receipt', 'tax_invoice'];

    const sellerJson = {
      nameTh: company.nameTh, nameEn: company.nameEn,
      taxId: company.taxId, branchCode: company.branchCode,
      branchNameTh: company.branchNameTh, addressTh: company.addressTh,
      addressEn: company.addressEn, phone: company.phone,
      email: company.email, logoUrl: company.logoUrl,
      documentPreferences: {
        templateId: body.templateId ?? null,
        documentMode: body.documentMode ?? 'electronic',
        bankPaymentInfo: body.bankPaymentInfo ?? null,
        showCompanyLogo: body.showCompanyLogo ?? true,
        documentLogoUrl: body.documentLogoUrl ?? null,
        signatureImageUrl: body.signatureImageUrl ?? null,
        signerName: body.signerName ?? null,
        signerTitle: body.signerTitle ?? null,
      },
    };

    const invoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.create({
        data: {
        invoiceNumber,
        type: body.type,
        language: body.language,
        status: 'draft',
        invoiceDate: new Date(body.invoiceDate),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        companyId: req.user!.companyId,
        buyerId: body.customerId,
        seller: sellerJson,
        subtotal,
        vatAmount: totalVat,
        discount: body.discount ?? 0,
        total,
        notes: body.notes,
        paymentMethod: body.paymentMethod,
        referenceInvoiceId: body.referenceInvoiceId ?? null,
        referenceDocNumber: body.referenceDocNumber ?? null,
        isPaid: isCashSale,
        paidAt: isCashSale ? new Date(body.invoiceDate) : null,
        paidAmount: isCashSale ? total : null,
        createdBy: req.user!.userId,
        items: {
          create: calculated.map((item) => ({
            productId: item.productId,
            nameTh: item.nameTh,
            nameEn: item.nameEn,
            descriptionTh: item.descriptionTh,
            descriptionEn: item.descriptionEn,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            discount: item.discount,
            vatType: item.vatType,
            vatAmount: item.vatAmount,
            amount: item.amount,
            totalAmount: item.totalAmount,
          })),
        },
      },
      include: { items: true, buyer: true },
    });
    });

    if (!isDraft) {
      await enqueueInvoicePdf(invoice.id, body.language);

      // T01 + T02: auto-approve + auto-submit ไป RD ทันที
      // T01 (ขายสด): VAT เกิดตอนรับเงิน — submit ทันที
      // T02 (ขายเงินเชื่อ): VAT เกิดตอนส่งมอบสินค้า ม. 78(1) — submit ทันทีที่ออกใบ
      // T04/T05: ยัง manual เพราะต้องการ explicit approval
      if (autoSubmitTypes.includes(body.type) && policy.canSubmitToRD) {
        await queueRdSubmissionBestEffort(invoice.id);
      }
    }

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'invoice.create',
      resourceType: 'invoice',
      resourceId: invoice.id,
      details: { invoiceNumber, type: body.type, total, autoSubmitRd: autoSubmitTypes.includes(body.type) && policy.canSubmitToRD },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: body.language === 'both' ? 'th' : body.language,
    });

    res.status(201).json({
      data: {
        ...invoice,
        templateId: body.templateId ?? null,
        documentMode: body.documentMode ?? 'electronic',
        bankPaymentInfo: body.bankPaymentInfo ?? null,
        showCompanyLogo: body.showCompanyLogo ?? true,
        documentLogoUrl: body.documentLogoUrl ?? null,
        signatureImageUrl: body.signatureImageUrl ?? null,
        signerName: body.signerName ?? null,
        signerTitle: body.signerTitle ?? null,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

/* ─── Public invoice verification (QR code) — no auth required ─── */
invoicesRouter.get('/verify/:id', async (req, res) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id },
      include: { buyer: { select: { nameTh: true, nameEn: true, taxId: true } } },
    });
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }

    const sellerSnap = invoice.seller as {
      nameTh?: string | null;
      taxId?: string | null;
    } | null;

    res.json({
      data: {
        invoiceNumber: invoice.invoiceNumber,
        type: invoice.type,
        invoiceDate: invoice.invoiceDate,
        total: invoice.total,
        status: invoice.status,
        sellerName: sellerSnap?.nameTh ?? null,
        sellerTaxId: sellerSnap?.taxId ?? null,
        buyerName: invoice.buyer.nameTh,
        issuedAt: invoice.updatedAt,
        pdfUrl: invoice.pdfUrl,
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to verify invoice' });
  }
});

invoicesRouter.get('/:id', async (req, res) => {
  try {
    const invoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: { items: true, buyer: true },
      });
    });
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    const sellerSnap = invoice.seller as {
      documentPreferences?: {
        templateId?: string | null;
        documentMode?: 'ordinary' | 'electronic' | null;
        bankPaymentInfo?: string | null;
        showCompanyLogo?: boolean | null;
        documentLogoUrl?: string | null;
        signatureImageUrl?: string | null;
        signerName?: string | null;
        signerTitle?: string | null;
      };
    } | null;
    const verificationUrl = `${process.env.APP_ORIGIN ?? 'https://etax-invoice.vercel.app'}/invoices/verify/${invoice.id}`;
    res.json({
      data: {
        ...invoice,
        templateId: sellerSnap?.documentPreferences?.templateId ?? null,
        documentMode: sellerSnap?.documentPreferences?.documentMode ?? 'electronic',
        bankPaymentInfo: sellerSnap?.documentPreferences?.bankPaymentInfo ?? null,
        showCompanyLogo: sellerSnap?.documentPreferences?.showCompanyLogo ?? true,
        documentLogoUrl: sellerSnap?.documentPreferences?.documentLogoUrl ?? null,
        signatureImageUrl: sellerSnap?.documentPreferences?.signatureImageUrl ?? null,
        signerName: sellerSnap?.documentPreferences?.signerName ?? null,
        signerTitle: sellerSnap?.documentPreferences?.signerTitle ?? null,
        verificationUrl,
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

invoicesRouter.patch('/:id', async (req, res) => {
  try {
    const body = updateInvoiceSchema.parse(req.body);
    const invoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: { items: true },
      });
    });

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    if (invoice.status === 'submitted' || invoice.rdSubmissionStatus === 'success') {
      res.status(400).json({ error: 'Submitted invoices cannot be edited' });
      return;
    }

    const { calculated, subtotal, totalVat, total } = calculateTotals(body.items);
    const [customer, company] = await Promise.all([
      withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        return tx.customer.findFirst({
          where: { id: body.customerId, companyId: req.user!.companyId },
        });
      }),
      prisma.company.findUnique({ where: { id: req.user!.companyId } }),
    ]);
    if (!customer) { res.status(404).json({ error: 'Customer not found' }); return; }
    if (!company) { res.status(404).json({ error: 'Company not found' }); return; }

    const isCashSale = body.type === 'tax_invoice_receipt';
    const sellerJson = {
      nameTh: company.nameTh, nameEn: company.nameEn,
      taxId: company.taxId, branchCode: company.branchCode,
      branchNameTh: company.branchNameTh, addressTh: company.addressTh,
      addressEn: company.addressEn, phone: company.phone,
      email: company.email, logoUrl: company.logoUrl,
      documentPreferences: {
        templateId: body.templateId ?? null,
        documentMode: body.documentMode ?? 'electronic',
        bankPaymentInfo: body.bankPaymentInfo ?? null,
        showCompanyLogo: body.showCompanyLogo ?? true,
        documentLogoUrl: body.documentLogoUrl ?? null,
        signatureImageUrl: body.signatureImageUrl ?? null,
        signerName: body.signerName ?? null,
        signerTitle: body.signerTitle ?? null,
      },
    };

    const updatedInvoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
      return tx.invoice.update({
        where: { id: invoice.id },
        data: {
          type: body.type,
          language: body.language,
          invoiceDate: new Date(body.invoiceDate),
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          buyerId: body.customerId,
          seller: sellerJson,
          subtotal,
          vatAmount: totalVat,
          discount: body.discount ?? 0,
          total,
          notes: body.notes,
          paymentMethod: body.paymentMethod,
          referenceInvoiceId: body.referenceInvoiceId ?? null,
          referenceDocNumber: body.referenceDocNumber ?? null,
          isPaid: isCashSale ? true : invoice.isPaid,
          paidAt: isCashSale ? new Date(body.invoiceDate) : invoice.paidAt,
          paidAmount: isCashSale ? total : invoice.paidAmount,
          rdSubmissionStatus: invoice.rdSubmissionStatus === 'failed' ? 'pending' : invoice.rdSubmissionStatus,
          items: {
            create: calculated.map((item) => ({
              productId: item.productId,
              nameTh: item.nameTh,
              nameEn: item.nameEn,
              descriptionTh: item.descriptionTh,
              descriptionEn: item.descriptionEn,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              discount: item.discount,
              vatType: item.vatType,
              vatAmount: item.vatAmount,
              amount: item.amount,
              totalAmount: item.totalAmount,
            })),
          },
        },
        include: { items: true, buyer: true },
      });
    });

    await enqueueInvoicePdf(updatedInvoice.id, body.language);

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'invoice.update',
      resourceType: 'invoice',
      resourceId: updatedInvoice.id,
      details: { invoiceNumber: updatedInvoice.invoiceNumber, type: body.type, total },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: body.language === 'both' ? 'th' : body.language,
    });

    res.json({
      data: {
        ...updatedInvoice,
        templateId: body.templateId ?? null,
        documentMode: body.documentMode ?? 'electronic',
        bankPaymentInfo: body.bankPaymentInfo ?? null,
        showCompanyLogo: body.showCompanyLogo ?? true,
        documentLogoUrl: body.documentLogoUrl ?? null,
        signatureImageUrl: body.signatureImageUrl ?? null,
        signerName: body.signerName ?? null,
        signerTitle: body.signerTitle ?? null,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

/* ─── Officially issue a draft invoice (ออกเอกสาร) ─── */
invoicesRouter.post('/:id/issue', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'create_invoice')) {
      res.status(403).json({ error: 'Your current plan cannot issue invoices' });
      return;
    }

    const invoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: { items: true, buyer: true },
      });
    });
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    if (invoice.status !== 'draft') {
      res.status(400).json({ error: 'Only draft invoices can be issued', status: invoice.status });
      return;
    }
    if (!invoice.invoiceNumber.startsWith('DRAFT-')) {
      res.status(409).json({ error: 'Invoice has already been issued' });
      return;
    }

    // Replace the temporary draft number with a real sequential invoice number
    const realInvoiceNumber = await generateInvoiceNumber(req.user!.companyId, invoice.type);

    const updatedInvoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.update({
        where: { id: invoice.id },
        data: { invoiceNumber: realInvoiceNumber },
        include: { items: true, buyer: true },
      });
    });

    // Queue PDF generation
    await enqueueInvoicePdf(updatedInvoice.id, updatedInvoice.language);

    // Auto-submit to RD for T01 and T02 if policy allows
    const autoSubmitTypes = ['tax_invoice_receipt', 'tax_invoice'];
    if (autoSubmitTypes.includes(updatedInvoice.type) && policy.canSubmitToRD) {
      await queueRdSubmissionBestEffort(updatedInvoice.id);
    }

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'invoice.issue',
      resourceType: 'invoice',
      resourceId: updatedInvoice.id,
      details: {
        invoiceNumber: realInvoiceNumber,
        previousDraftNumber: invoice.invoiceNumber,
        type: updatedInvoice.type,
        total: updatedInvoice.total,
        autoSubmitRd: autoSubmitTypes.includes(updatedInvoice.type) && policy.canSubmitToRD,
      },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: (updatedInvoice.language === 'both' ? 'th' : updatedInvoice.language) as 'th' | 'en',
    });

    res.json({ data: updatedInvoice, message: 'Invoice issued successfully' });
  } catch (err) {
    console.error('Issue invoice error:', err);
    res.status(500).json({ error: 'Failed to issue invoice' });
  }
});

/* ─── Issue Receipt from Tax Invoice (ใบเสร็จจากใบกำกับภาษี) ─── */
invoicesRouter.post('/:id/issue-receipt', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    const limit = getUsageLimit(policy, 'documents');
    if (limit !== null && getUsageValue(policy, 'documents') >= limit) {
      res.status(403).json({ error: getLimitErrorMessage('documents', policy) });
      return;
    }

    const { paymentMethod, note, paidAt } = req.body as {
      paymentMethod?: string;
      note?: string;
      paidAt?: string;
    };

    const taxInvoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: { items: true, buyer: true },
      });
    });
    if (!taxInvoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    if (taxInvoice.type !== 'tax_invoice') {
      res.status(400).json({ error: 'Can only issue receipt from a tax_invoice' }); return;
    }
    if (taxInvoice.isPaid) {
      res.status(400).json({ error: 'Invoice already paid / receipt already issued' }); return;
    }

    const receiptNumber = await generateInvoiceNumber(req.user!.companyId, 'receipt');
    const paidDate = paidAt ? new Date(paidAt) : new Date();

    const { receipt } = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const createdReceipt = await tx.invoice.create({
        data: {
          invoiceNumber: receiptNumber,
          type: 'receipt',
          language: taxInvoice.language,
          status: 'draft',
          invoiceDate: paidDate,
          companyId: taxInvoice.companyId,
          buyerId: taxInvoice.buyerId,
          seller: taxInvoice.seller ?? {},
          subtotal: taxInvoice.subtotal,
          vatAmount: taxInvoice.vatAmount,
          discount: taxInvoice.discount,
          total: taxInvoice.total,
          notes: note ?? taxInvoice.notes,
          paymentMethod: paymentMethod ?? taxInvoice.paymentMethod,
          referenceInvoiceId: taxInvoice.id,
          referenceDocNumber: taxInvoice.invoiceNumber,
          isPaid: true,
          paidAt: paidDate,
          paidAmount: taxInvoice.total,
          createdBy: req.user!.userId,
          items: {
            create: taxInvoice.items.map((item) => ({
              productId: item.productId,
              nameTh: item.nameTh,
              nameEn: item.nameEn,
              descriptionTh: item.descriptionTh,
              descriptionEn: item.descriptionEn,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              discount: item.discount,
              vatType: item.vatType,
              amount: item.amount,
              vatAmount: item.vatAmount,
              totalAmount: item.totalAmount,
            })),
          },
        },
        include: { items: true, buyer: true },
      });
      await tx.invoice.update({
        where: { id: taxInvoice.id },
        data: { isPaid: true, paidAt: paidDate, paidAmount: taxInvoice.total },
      });
      return { receipt: createdReceipt };
    });

    // Queue PDF generation
    await enqueueInvoicePdf(receipt.id, receipt.language);

    // T03 (receipt): เงินรับแล้ว → auto-approve + auto-submit ไป RD ทันที
    if (policy.canSubmitToRD) {
      await queueRdSubmissionBestEffort(receipt.id);
    }

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'invoice.issue_receipt',
      resourceType: 'invoice',
      resourceId: receipt.id,
      details: {
        receiptNumber: receipt.invoiceNumber,
        fromInvoiceNumber: taxInvoice.invoiceNumber,
        total: receipt.total,
        autoSubmitRd: policy.canSubmitToRD,
      },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.status(201).json({ data: receipt, message: 'Receipt issued successfully' });
  } catch (err) {
    console.error('Issue receipt error:', err);
    res.status(500).json({ error: 'Failed to issue receipt' });
  }
});

invoicesRouter.post('/:id/submit-rd', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'submit_rd')) {
      res.status(403).json({ error: 'Upgrade your plan to submit documents to the Revenue Department' });
      return;
    }

    const invoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: { items: true, buyer: true },
      });
    });
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    // รับทั้ง 'approved' (manual flow) และ 'draft' (re-submit ถ้า failed)
    if (!['approved', 'draft'].includes(invoice.status)) {
      res.status(400).json({ error: 'Invoice cannot be submitted in current state', status: invoice.status }); return;
    }
    if (invoice.rdSubmissionStatus === 'success') {
      res.status(400).json({ error: 'Invoice already submitted to RD', rdDocId: invoice.rdDocId }); return;
    }

    await queueRdSubmission(invoice.id);

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'invoice.submit_rd',
      resourceType: 'invoice',
      resourceId: invoice.id,
      details: { invoiceNumber: invoice.invoiceNumber },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ message: 'Submission queued', status: 'pending' });
  } catch {
    res.status(500).json({ error: 'Failed to submit invoice' });
  }
});

/* ─── Send invoice email to customer ─── */
invoicesRouter.post('/:id/send-email', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'send_invoice_email')) {
      res.status(403).json({ error: 'Upgrade your plan to send invoice emails from the system' });
      return;
    }

    const invoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: { buyer: true, company: true },
      });
    });
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    if (!invoice.buyer.email) { res.status(400).json({ error: 'Customer has no email address' }); return; }

    await sendInvoiceToCustomer({
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      buyerNameTh: invoice.buyer.nameTh,
      buyerNameEn: invoice.buyer.nameEn,
      buyerEmail: invoice.buyer.email,
      sellerNameTh: invoice.company.nameTh,
      language: invoice.language,
      pdfUrl: invoice.pdfUrl,
    });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'invoice.send_email',
      resourceType: 'invoice',
      resourceId: invoice.id,
      details: { invoiceNumber: invoice.invoiceNumber, to: invoice.buyer.email },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ message: 'Email sent', to: invoice.buyer.email });
  } catch {
    res.status(500).json({ error: 'Failed to send email' });
  }
});

invoicesRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const invoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
    });
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    if (invoice.status === 'submitted') { res.status(400).json({ error: 'Cannot cancel a submitted invoice' }); return; }

    await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'cancelled' } });
      return null;
    });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'invoice.cancel',
      resourceType: 'invoice',
      resourceId: invoice.id,
      details: { invoiceNumber: invoice.invoiceNumber },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ message: 'Invoice cancelled' });
  } catch {
    res.status(500).json({ error: 'Failed to cancel invoice' });
  }
});

/* ─── Preview / PDF for existing invoice by ID ─── */
invoicesRouter.get('/:id/preview', async (req, res) => {
  try {
    const invoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: { items: true, buyer: true, company: true },
      });
    });
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }

    // Use seller JSONB snapshot (state at invoice creation time)
    const sellerSnap = invoice.seller as Record<string, string | null | undefined> | null;
    const documentPrefs = ((invoice.seller as {
      documentPreferences?: {
        templateId?: string | null;
        documentMode?: 'ordinary' | 'electronic' | null;
        bankPaymentInfo?: string | null;
        showCompanyLogo?: boolean | null;
        documentLogoUrl?: string | null;
        signatureImageUrl?: string | null;
        signerName?: string | null;
        signerTitle?: string | null;
      };
    } | null)?.documentPreferences) ?? {};

    const invoiceData = {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate:   invoice.invoiceDate,
      dueDate:       invoice.dueDate ?? undefined,
      type:          invoice.type,
      language:      (invoice.language ?? 'th') as 'th' | 'en' | 'both',
      seller: {
        nameTh:      sellerSnap?.nameTh      ?? invoice.company.nameTh,
        nameEn:      sellerSnap?.nameEn      ?? invoice.company.nameEn,
        taxId:       sellerSnap?.taxId       ?? invoice.company.taxId,
        branchCode:  sellerSnap?.branchCode  ?? invoice.company.branchCode,
        branchNameTh: sellerSnap?.branchNameTh ?? invoice.company.branchNameTh,
        addressTh:   sellerSnap?.addressTh   ?? invoice.company.addressTh,
        addressEn:   sellerSnap?.addressEn   ?? invoice.company.addressEn,
        phone:       sellerSnap?.phone       ?? invoice.company.phone,
        email:       sellerSnap?.email       ?? invoice.company.email,
        logoUrl:     sellerSnap?.logoUrl     ?? (invoice.company as { logoUrl?: string | null }).logoUrl,
      },
      buyer: {
        nameTh:     invoice.buyer.nameTh,
        nameEn:     invoice.buyer.nameEn,
        taxId:      invoice.buyer.taxId,
        branchCode: invoice.buyer.branchCode,
        addressTh:  invoice.buyer.addressTh,
        addressEn:  invoice.buyer.addressEn,
      },
      items: invoice.items.map((item) => ({
        nameTh:      item.nameTh,
        nameEn:      item.nameEn,
        quantity:    item.quantity,
        unit:        item.unit,
        unitPrice:   item.unitPrice,
        discount:    item.discount,
        vatType:     item.vatType,
        amount:      item.amount,
        vatAmount:   item.vatAmount,
        totalAmount: item.totalAmount,
      })),
      subtotal:      invoice.subtotal,
      vatAmount:     invoice.vatAmount,
      discount:      invoice.discount,
      total:         invoice.total,
      notes:         invoice.notes,
      paymentMethod: invoice.paymentMethod,
      templateId: documentPrefs.templateId ?? null,
      documentMode: documentPrefs.documentMode ?? 'electronic',
      bankPaymentInfo: documentPrefs.bankPaymentInfo ?? null,
      showCompanyLogo: documentPrefs.showCompanyLogo ?? true,
      documentLogoUrl: documentPrefs.documentLogoUrl ?? null,
      signatureImageUrl: documentPrefs.signatureImageUrl ?? null,
      signerName: documentPrefs.signerName ?? null,
      signerTitle: documentPrefs.signerTitle ?? null,
      referenceDocNumber: invoice.referenceDocNumber ?? undefined,
    };

    if (req.query.format === 'pdf') {
      const html = await buildHtmlForCompany(invoiceData, req.user!.companyId);
      const pdfBuffer = await generatePdfFromHtml(html);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNumber}.pdf"`);
      res.send(pdfBuffer);
      return;
    }

    const html = await buildHtmlForCompany(invoiceData, req.user!.companyId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(html, 'utf8'));
    res.send(html);
  } catch (err) {
    console.error('Invoice preview error:', err);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

/* ─── Preview Invoice PDF (from form data, before saving) ─── */
invoicesRouter.post('/preview', async (req, res) => {
  try {
    const body = previewInvoiceSchema.parse(req.body);
    const { calculated, subtotal, totalVat, total } = calculateTotals(body.items);

    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
    });

    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    // Mock buyer data for preview
    const mockBuyer = {
      nameTh: 'ลูกค้าตัวอย่าง',
      nameEn: 'Sample Customer',
      taxId: '0000000000000',
      branchCode: '00000',
      addressTh: 'ที่อยู่ตัวอย่าง',
      addressEn: 'Sample Address',
    };

    const invoiceData = {
      invoiceNumber: 'PREVIEW-001',
      invoiceDate: new Date(body.invoiceDate),
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      type: body.type,
      language: body.language,
      seller: {
        nameTh: company.nameTh,
        nameEn: company.nameEn,
        taxId: company.taxId,
        branchCode: company.branchCode,
        branchNameTh: company.branchNameTh,
        addressTh: company.addressTh,
        addressEn: company.addressEn,
        phone: company.phone,
        email: company.email,
        website: (company as { website?: string | null }).website ?? null,
        logoUrl: (company as { logoUrl?: string | null }).logoUrl ?? null,
      },
      buyer: mockBuyer,
      items: calculated.map((item) => ({
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        discount: item.discount,
        vatType: item.vatType,
        amount: item.amount,
        vatAmount: item.vatAmount,
        totalAmount: item.totalAmount,
      })),
      subtotal,
      vatAmount: totalVat,
      discount: 0,
      total,
      notes: body.notes,
      documentLogoUrl: body.logoUrl || null,
      templateId: body.templateId ?? null,
      documentMode: body.documentMode ?? 'electronic',
      bankPaymentInfo: body.bankPaymentInfo ?? null,
      showCompanyLogo: body.showCompanyLogo ?? true,
      signatureImageUrl: body.signatureImageUrl ?? null,
      signerName: body.signerName ?? null,
      signerTitle: body.signerTitle ?? null,
    };

    if (req.query.format === 'html') {
      const html = await buildHtmlForCompany(invoiceData, req.user!.companyId);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(html, 'utf8'));
      res.send(html);
      return;
    }

    const html = await buildHtmlForCompany(invoiceData, req.user!.companyId);
    const pdfBuffer = await generatePdfFromHtml(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    console.error('Preview error:', err);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});
