import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { generateCustomerStatementExcel } from '../services/exportService';
import { generateCustomerStatementPdf } from '../services/pdfService';
import { sendStatementToCustomer } from '../services/emailService';
import { auditLog } from '../services/auditService';
import {
  getLimitErrorMessage,
  getUsageLimit,
  getUsageValue,
  hasFeatureAccess,
  resolveCompanyAccessPolicy,
} from '../services/accessPolicyService';

export const customersRouter = Router();

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
});

customersRouter.get('/', async (req, res) => {
  try {
    const { search, page = '1', limit = '50' } = req.query;
    const pageNumber = parseInt(page as string);
    const limitNumber = parseInt(limit as string);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Record<string, unknown> = { companyId: req.user!.companyId, isActive: true };
    if (search) {
      where.OR = [
        { nameTh: { contains: search as string } },
        { nameEn: { contains: search as string, mode: 'insensitive' } },
        { taxId: { contains: search as string } },
      ];
    }

    const { customers, total } = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [items, count] = await Promise.all([
        tx.customer.findMany({ where, skip, take: limitNumber, orderBy: { nameTh: 'asc' } }),
        tx.customer.count({ where }),
      ]);

      return { customers: items, total: count };
    });

    res.json({ data: customers, pagination: { page: pageNumber, total } });
  } catch {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

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

    const body = customerSchema.parse(req.body);
    const customer = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.customer.create({
        data: { ...body, companyId: req.user!.companyId },
      });
    });
    res.status(201).json({ data: customer });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

customersRouter.put('/:id', async (req, res) => {
  try {
    const body = customerSchema.partial().parse(req.body);
    const customer = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.customer.updateMany({
        where: { id: req.params.id, companyId: req.user!.companyId },
        data: body,
      });
    });
    if (customer.count === 0) { res.status(404).json({ error: 'Customer not found' }); return; }
    res.json({ message: 'Customer updated' });
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
