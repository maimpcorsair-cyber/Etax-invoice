import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { auditLog } from '../services/auditService';
import { calculateInvoicePaymentSummary } from '../services/paymentService';

export const paymentsRouter = Router({ mergeParams: true });

const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['cash', 'transfer', 'cheque', 'credit_card', 'other']),
  reference: z.string().optional(),
  paidAt: z.string().optional(),
  note: z.string().optional(),
});

/* GET /api/invoices/:invoiceId/payments */
paymentsRouter.get('/', async (req, res) => {
  try {
    const { invoiceId } = req.params as { invoiceId: string };
    const invoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findFirst({
        where: { id: invoiceId, companyId: req.user!.companyId },
      });
    });
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }

    const payments = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.payment.findMany({
        where: { invoiceId },
        orderBy: { paidAt: 'desc' },
      });
    });
    res.json({ data: payments });
  } catch {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

/* POST /api/invoices/:invoiceId/payments — บันทึกการรับชำระเงิน */
paymentsRouter.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { invoiceId } = req.params as { invoiceId: string };
    const body = paymentSchema.parse(req.body);

    const invoice = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findFirst({
        where: { id: invoiceId, companyId: req.user!.companyId },
      });
    });
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    if (invoice.status === 'cancelled') { res.status(400).json({ error: 'Cannot record payment for cancelled invoice' }); return; }

    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();

    let paymentId = '';
    const { payment, summary } = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const createdPayment = await tx.payment.create({
        data: {
          id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          invoiceId: invoice.id,
          amount: body.amount,
          method: body.method,
          reference: body.reference ?? null,
          paidAt,
          note: body.note ?? null,
          createdBy: req.user!.userId,
        },
      });
      paymentId = createdPayment.id;

      const paymentSummary = await calculateInvoicePaymentSummary(tx, invoice.id);

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          isPaid: paymentSummary.isPaid,
          paidAt: paymentSummary.paidAt,
          paidAmount: paymentSummary.paidAmount,
        },
      });

      return { payment: createdPayment, summary: paymentSummary };
    });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'invoice.payment_recorded',
      resourceType: 'invoice',
      resourceId: invoice.id,
      details: { invoiceNumber: invoice.invoiceNumber, amount: body.amount, method: body.method },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.status(201).json({
      data: payment,
      invoiceIsPaid: summary.isPaid,
      invoicePaidAmount: summary.paidAmount,
      paymentId,
    });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

/* DELETE /api/invoices/:invoiceId/payments/:paymentId */
paymentsRouter.delete('/:paymentId', requireRole('admin'), async (req, res) => {
  try {
    const { invoiceId } = req.params as { invoiceId: string };
    const payment = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.payment.findFirst({
        where: { id: req.params.paymentId, invoiceId },
        include: { invoice: { select: { companyId: true } } },
      });
    });
    if (!payment || payment.invoice.companyId !== req.user!.companyId) {
      res.status(404).json({ error: 'Payment not found' }); return;
    }
    const summary = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await tx.payment.delete({ where: { id: payment.id } });
      const paymentSummary = await calculateInvoicePaymentSummary(tx, invoiceId);
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          isPaid: paymentSummary.isPaid,
          paidAt: paymentSummary.paidAt,
          paidAmount: paymentSummary.paidAmount || null,
        },
      });
      return paymentSummary;
    });

    res.json({ message: 'Payment deleted', invoiceIsPaid: summary.isPaid, invoicePaidAmount: summary.paidAmount });
  } catch {
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});
