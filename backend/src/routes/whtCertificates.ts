import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { authenticate, requireRole } from '../middleware/auth';
import { auditLog } from '../services/auditService';
import { generateWhtCertificatePdf } from '../services/whtCertificatePdf';
import { logger } from '../config/logger';

export const whtCertificatesRouter = Router();

whtCertificatesRouter.use(authenticate);

/* ─── Zod schemas ─── */
const createWhtSchema = z.object({
  invoiceId: z.string().optional(),
  whtRate: z.enum(['1', '3', '5']),
  totalAmount: z.number().positive(),
  recipientName: z.string().min(1),
  recipientTaxId: z.string().min(1),
  recipientBranch: z.string().default('00000'),
  incomeType: z.enum(['1', '2', '4']).optional(),
  paymentDate: z.string(), // ISO date string
});

const updateWhtSchema = z.object({
  whtRate: z.enum(['1', '3', '5']).optional(),
  totalAmount: z.number().positive().optional(),
  recipientName: z.string().min(1).optional(),
  recipientTaxId: z.string().min(1).optional(),
  recipientBranch: z.string().optional(),
  incomeType: z.enum(['1', '2', '4']).optional(),
  paymentDate: z.string().optional(),
});

/* ─── Certificate number generator ─── */
async function generateCertNumber(companyId: string, companyTaxId: string): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Find the highest sequence number for this company + period
  const existing = await prisma.whtCertificate.findFirst({
    where: {
      companyId,
      certificateNumber: { startsWith: `WHT-${companyTaxId}-${ym}` },
    },
    orderBy: { certificateNumber: 'desc' },
    select: { certificateNumber: true },
  });

  let seq = 1;
  if (existing) {
    const last = existing.certificateNumber.split('-').pop();
    if (last) seq = parseInt(last, 10) + 1;
  }

  return `WHT-${companyTaxId}-${ym}-${String(seq).padStart(4, '0')}`;
}

/* ─── List ─── */
whtCertificatesRouter.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '20', search, from, to } = req.query;
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Record<string, unknown> = { companyId: req.user!.companyId };

    if (search) {
      where.OR = [
        { certificateNumber: { contains: search as string, mode: 'insensitive' } },
        { recipientName: { contains: search as string } },
        { recipientTaxId: { contains: search as string } },
      ];
    }

    if (from || to) {
      where.paymentDate = {
        ...(from ? { gte: new Date(from as string) } : {}),
        ...(to ? { lte: new Date(to as string) } : {}),
      };
    }

    const [items, total] = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [data, count] = await Promise.all([
        tx.whtCertificate.findMany({
          where,
          skip,
          take: limitNumber,
          orderBy: { createdAt: 'desc' },
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true, total: true, invoiceDate: true },
            },
          },
        }),
        tx.whtCertificate.count({ where }),
      ]);
      return [data, count];
    });

    res.json({
      data: items,
      pagination: { page: pageNumber, limit: limitNumber, total, totalPages: Math.ceil(total / limitNumber) },
    });
  } catch (err) {
    logger.error('Failed to list WHT certificates', { error: err });
    res.status(500).json({ error: 'Failed to fetch WHT certificates' });
  }
});

/* ─── Get one ─── */
whtCertificatesRouter.get('/:id', async (req, res) => {
  try {
    const cert = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.whtCertificate.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: {
          invoice: {
            select: {
              id: true, invoiceNumber: true, type: true, status: true,
              total: true, invoiceDate: true, subtotal: true, vatAmount: true,
              buyer: { select: { nameTh: true, nameEn: true, taxId: true } },
            },
          },
        },
      });
    });

    if (!cert) { res.status(404).json({ error: 'Certificate not found' }); return; }
    res.json({ data: cert });
  } catch (err) {
    logger.error('Failed to fetch WHT certificate', { error: err });
    res.status(500).json({ error: 'Failed to fetch WHT certificate' });
  }
});

/* ─── Create ─── */
whtCertificatesRouter.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const body = createWhtSchema.parse(req.body);

    const [company] = await Promise.all([
      prisma.company.findUnique({
        where: { id: req.user!.companyId },
        select: { id: true, nameTh: true, nameEn: true, taxId: true, branchCode: true, addressTh: true },
      }),
    ]);
    if (!company) { res.status(404).json({ error: 'Company not found' }); return; }

    // Validate invoice if provided
    if (body.invoiceId) {
      const invoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        return tx.invoice.findFirst({
          where: { id: body.invoiceId, companyId: req.user!.companyId },
          include: { buyer: { select: { nameTh: true, nameEn: true, taxId: true, branchCode: true } } },
        });
      });
      if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    }

    const rate = parseFloat(body.whtRate) / 100;
    const whtAmount = Math.round(body.totalAmount * rate * 100) / 100;
    const netAmount = Math.round((body.totalAmount - whtAmount) * 100) / 100;

    const certificateNumber = await generateCertNumber(req.user!.companyId, company.taxId);

    const cert = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.whtCertificate.create({
        data: {
          companyId: req.user!.companyId,
          invoiceId: body.invoiceId ?? null,
          certificateNumber,
          whtRate: body.whtRate,
          whtAmount,
          totalAmount: body.totalAmount,
          netAmount,
          recipientName: body.recipientName,
          recipientTaxId: body.recipientTaxId,
          recipientBranch: body.recipientBranch,
          incomeType: body.incomeType ?? body.whtRate,
          paymentDate: new Date(body.paymentDate),
          createdBy: req.user!.userId,
        },
      });
    });

    // If linked to an invoice, update invoice WHT fields and link the cert
    if (body.invoiceId) {
      await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        await tx.invoice.update({
          where: { id: body.invoiceId },
          data: { whtAmount, whtRate: body.whtRate, whtCertificateId: cert.id },
        });
      });
    }

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'wht_certificate.create',
      resourceType: 'wht_certificate',
      resourceId: cert.id,
      details: { certificateNumber, whtRate: body.whtRate, whtAmount, totalAmount: body.totalAmount, invoiceId: body.invoiceId },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.status(201).json({ data: cert });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    logger.error('Failed to create WHT certificate', { error: err });
    res.status(500).json({ error: 'Failed to create WHT certificate' });
  }
});

/* ─── Update ─── */
whtCertificatesRouter.patch('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const body = updateWhtSchema.parse(req.body);

    const existing = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.whtCertificate.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
      });
    });
    if (!existing) { res.status(404).json({ error: 'Certificate not found' }); return; }

    const totalAmount = body.totalAmount ?? existing.totalAmount;
    const whtRate = body.whtRate ?? existing.whtRate;
    const rate = parseFloat(whtRate) / 100;
    const whtAmount = Math.round(totalAmount * rate * 100) / 100;
    const netAmount = Math.round((totalAmount - whtAmount) * 100) / 100;

    const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.whtCertificate.update({
        where: { id: req.params.id },
        data: {
          ...(body.whtRate !== undefined ? { whtRate: body.whtRate } : {}),
          ...(body.totalAmount !== undefined ? { totalAmount: body.totalAmount, whtAmount, netAmount } : {}),
          ...(body.recipientName !== undefined ? { recipientName: body.recipientName } : {}),
          ...(body.recipientTaxId !== undefined ? { recipientTaxId: body.recipientTaxId } : {}),
          ...(body.recipientBranch !== undefined ? { recipientBranch: body.recipientBranch } : {}),
          ...(body.incomeType !== undefined ? { incomeType: body.incomeType } : {}),
          ...(body.paymentDate !== undefined ? { paymentDate: new Date(body.paymentDate) } : {}),
        },
      });
    });

    // Update linked invoice if WHT params changed
    if (existing.invoiceId && (body.whtRate || body.totalAmount)) {
      await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        await tx.invoice.update({
          where: { id: existing.invoiceId! },
          data: { whtAmount, whtRate, whtCertificateId: existing.id },
        });
      });
    }

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'wht_certificate.update',
      resourceType: 'wht_certificate',
      resourceId: existing.id,
      details: { certificateNumber: existing.certificateNumber },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    logger.error('Failed to update WHT certificate', { error: err });
    res.status(500).json({ error: 'Failed to update WHT certificate' });
  }
});

/* ─── Delete ─── */
whtCertificatesRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const existing = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.whtCertificate.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
      });
    });
    if (!existing) { res.status(404).json({ error: 'Certificate not found' }); return; }

    // Unlink from invoice
    if (existing.invoiceId) {
      await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        await tx.invoice.update({
          where: { id: existing.invoiceId! },
          data: { whtAmount: 0, whtRate: null, whtCertificateId: null },
        });
      });
    }

    await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await tx.whtCertificate.delete({ where: { id: req.params.id } });
    });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'wht_certificate.delete',
      resourceType: 'wht_certificate',
      resourceId: existing.id,
      details: { certificateNumber: existing.certificateNumber },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ message: 'Certificate deleted' });
  } catch (err) {
    logger.error('Failed to delete WHT certificate', { error: err });
    res.status(500).json({ error: 'Failed to delete WHT certificate' });
  }
});

/* ─── Download PDF ─── */
whtCertificatesRouter.get('/:id/pdf', async (req, res) => {
  try {
    const cert = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.whtCertificate.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: {
          company: { select: { nameTh: true, nameEn: true, taxId: true, branchCode: true, addressTh: true } },
          invoice: {
            select: {
              id: true, invoiceNumber: true, total: true, invoiceDate: true,
              buyer: { select: { nameTh: true, nameEn: true, taxId: true, branchCode: true } },
            },
          },
        },
      });
    });

    if (!cert) { res.status(404).json({ error: 'Certificate not found' }); return; }

    const pdfBuffer = await generateWhtCertificatePdf(cert);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cert.certificateNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    logger.error('Failed to generate WHT certificate PDF', { error: err });
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});
