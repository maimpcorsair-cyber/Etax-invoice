import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { auditLog } from '../services/auditService';
import { hasFeatureAccess, resolveCompanyAccessPolicy } from '../services/accessPolicyService';
import { generateVoucherNumber, getExpenseLimit } from '../services/expenseService';
import { logger } from '../config/logger';

export const expensesRouter = Router();

const attachmentSchema = z.object({
  fileName: z.string().optional(),
  fileType: z.enum(['image', 'pdf', 'link']).default('image'),
  url: z.string().url('Attachment URL must be a valid URL'),
  evidenceType: z.enum(['receipt', 'chat', 'map', 'other']).default('receipt'),
});

const WHT_RATES = [1, 3, 5] as const;

const expenseItemSchema = z.object({
  description: z.string().min(1),
  category: z.string().optional(),
  amount: z.number().positive(),
  date: z.string().min(1),
  notes: z.string().optional(),
  vendorName: z.string().optional(),
  vendorTaxId: z.string().optional(),
  whtApplicable: z.boolean().default(false),
  whtRate: z.number().refine((v) => (WHT_RATES as readonly number[]).includes(v), { message: 'whtRate must be 1, 3 or 5' }).optional().nullable(),
  attachments: z.array(attachmentSchema).optional(),
});

const createVoucherSchema = z.object({
  voucherDate: z.string().min(1),
  description: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(expenseItemSchema).min(1),
});

const updateVoucherSchema = createVoucherSchema;

const rejectSchema = z.object({
  rejectionNote: z.string().min(1),
});

const settingsSchema = z.object({
  expenseLimit: z.number().positive().nullable(),
});

/* ─── List ─── */
expensesRouter.get('/', async (req, res) => {
  try {
    const { status, dateFrom, dateTo, search } = req.query;
    const companyId = req.user!.companyId;

    const where: Prisma.ExpenseVoucherWhereInput = { companyId };
    if (status && status !== 'all') where.status = status as never;
    if (dateFrom || dateTo) {
      where.voucherDate = {};
      if (dateFrom) where.voucherDate.gte = new Date(dateFrom as string);
      if (dateTo) where.voucherDate.lte = new Date(dateTo as string);
    }
    if (search) {
      where.OR = [
        { voucherNumber: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const vouchers = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.expenseVoucher.findMany({
        where,
        include: { items: { select: { id: true, attachments: { select: { id: true } } } } },
        orderBy: { voucherDate: 'desc' },
      });
    });

    const data = vouchers.map((v) => ({
      ...v,
      totalAmount: Number(v.totalAmount),
      itemCount: v.items.length,
      attachmentCount: v.items.reduce((sum, i) => sum + i.attachments.length, 0),
      items: undefined,
    }));

    res.json({ data });
  } catch (err) {
    logger.error('Failed to list expense vouchers', { error: err });
    res.status(500).json({ error: 'Failed to list expense vouchers' });
  }
});

/* ─── Settings ─── */
expensesRouter.get('/settings', async (req, res) => {
  try {
    const limit = await getExpenseLimit(req.user!.companyId);
    res.json({ data: { expenseLimit: limit } });
  } catch (err) {
    logger.error('Failed to get expense settings', { error: err });
    res.status(500).json({ error: 'Failed to get expense settings' });
  }
});

expensesRouter.patch('/settings', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const body = settingsSchema.parse(req.body);
    await prisma.company.update({
      where: { id: req.user!.companyId },
      data: { expenseLimit: body.expenseLimit },
    });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'expense.settings_update',
      resourceType: 'company',
      resourceId: req.user!.companyId,
      details: { expenseLimit: body.expenseLimit },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ data: { expenseLimit: body.expenseLimit } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to update expense settings', { error: err });
    res.status(500).json({ error: 'Failed to update expense settings' });
  }
});

/* ─── Petty Cash: get balance ─── */
expensesRouter.get('/petty-cash', async (req, res) => {
  try {
    const record = await prisma.pettyCash.findUnique({ where: { companyId: req.user!.companyId } });
    res.json({ data: { balance: record ? Number(record.balance) : 0, cashierId: record?.cashierId ?? null } });
  } catch (err) {
    logger.error('Failed to get petty cash', { error: err });
    res.status(500).json({ error: 'Failed to get petty cash' });
  }
});

/* ─── Petty Cash: top up ─── */
expensesRouter.post('/petty-cash/topup', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { amount, cashierId } = z.object({
      amount: z.number().positive(),
      cashierId: z.string().optional(),
    }).parse(req.body);

    const record = await prisma.pettyCash.upsert({
      where: { companyId: req.user!.companyId },
      create: { companyId: req.user!.companyId, balance: amount, cashierId: cashierId ?? null },
      update: { balance: { increment: amount }, ...(cashierId ? { cashierId } : {}) },
    });

    await auditLog({
      companyId: req.user!.companyId, userId: req.user!.userId, role: req.user!.role,
      action: 'petty_cash.topup', resourceType: 'company', resourceId: req.user!.companyId,
      details: { amount, newBalance: Number(record.balance) },
      ipAddress: req.ip ?? '', userAgent: req.get('user-agent') ?? '', language: 'th',
    });

    res.json({ data: { balance: Number(record.balance) } });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    logger.error('Failed to top up petty cash', { error: err });
    res.status(500).json({ error: 'Failed to top up petty cash' });
  }
});

/* ─── Detail ─── */
expensesRouter.get('/:id', async (req, res) => {
  try {
    const voucher = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.expenseVoucher.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: {
          items: {
            include: {
              attachments: {
                select: { id: true, fileName: true, fileType: true, url: true, evidenceType: true, createdAt: true },
              },
            },
            orderBy: { date: 'asc' },
          },
        },
      });
    });
    if (!voucher) {
      res.status(404).json({ error: 'Voucher not found' });
      return;
    }
    res.json({
      data: {
        ...voucher,
        totalAmount: Number(voucher.totalAmount),
        items: voucher.items.map((i) => ({ ...i, amount: Number(i.amount) })),
      },
    });
  } catch (err) {
    logger.error('Failed to get expense voucher', { error: err });
    res.status(500).json({ error: 'Failed to get expense voucher' });
  }
});

function calcWht(amount: number, whtApplicable: boolean, whtRate?: number | null) {
  if (!whtApplicable || !whtRate) return { whtAmount: null, netAmount: null };
  const whtAmount = Math.round(amount * whtRate) / 100;
  const netAmount = Math.round((amount - whtAmount) * 100) / 100;
  return { whtAmount, netAmount };
}

function buildItemCreate(items: z.infer<typeof expenseItemSchema>[]) {
  return items.map((item) => {
    const { whtAmount, netAmount } = calcWht(item.amount, item.whtApplicable, item.whtRate);
    return {
      description: item.description,
      category: item.category,
      amount: item.amount,
      date: new Date(item.date),
      notes: item.notes,
      vendorName: item.vendorName,
      vendorTaxId: item.vendorTaxId,
      whtApplicable: item.whtApplicable,
      whtRate: item.whtApplicable && item.whtRate ? item.whtRate : null,
      whtAmount,
      netAmount,
      attachments: item.attachments?.length
        ? {
            create: item.attachments.map((att) => ({
              fileName: att.fileName,
              fileType: att.fileType,
              url: att.url,
              evidenceType: att.evidenceType,
            })),
          }
        : undefined,
    };
  });
}

/* ─── Create ─── */
expensesRouter.post('/', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'create_invoice')) {
      res.status(403).json({ error: 'Your current plan does not support expense vouchers' });
      return;
    }

    const body = createVoucherSchema.parse(req.body);
    const limit = await getExpenseLimit(req.user!.companyId);

    if (limit !== null) {
      for (const item of body.items) {
        if (item.amount > limit) {
          res.status(400).json({ error: `Item "${item.description}" exceeds expense limit of ${limit} THB` });
          return;
        }
      }
    }

    const voucherNumber = await generateVoucherNumber(req.user!.companyId);
    const totalAmount = body.items.reduce((sum, i) => sum + i.amount, 0);

    const created = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.expenseVoucher.create({
        data: {
          companyId: req.user!.companyId,
          voucherNumber,
          voucherDate: new Date(body.voucherDate),
          description: body.description,
          notes: body.notes,
          totalAmount,
          createdBy: req.user!.userId,
          items: { create: buildItemCreate(body.items) },
        },
        include: { items: { include: { attachments: true } } },
      });
    });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'expense_voucher.create',
      resourceType: 'expense_voucher',
      resourceId: created.id,
      details: { voucherNumber, totalAmount, itemCount: body.items.length },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.status(201).json({
      data: {
        ...created,
        totalAmount: Number(created.totalAmount),
        items: created.items.map((i) => ({ ...i, amount: Number(i.amount) })),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'Voucher number conflict — please retry' });
      return;
    }
    logger.error('Failed to create expense voucher', { error: err });
    res.status(500).json({ error: 'Failed to create expense voucher' });
  }
});

/* ─── Update (draft only) ─── */
expensesRouter.patch('/:id', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = updateVoucherSchema.parse(req.body);
    const companyId = req.user!.companyId;

    const existing = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.expenseVoucher.findFirst({ where: { id: req.params.id, companyId } });
    });
    if (!existing) { res.status(404).json({ error: 'Voucher not found' }); return; }
    if (existing.status !== 'draft') { res.status(400).json({ error: 'Only draft vouchers can be edited' }); return; }

    const limit = await getExpenseLimit(companyId);
    if (limit !== null) {
      for (const item of body.items) {
        if (item.amount > limit) {
          res.status(400).json({ error: `Item "${item.description}" exceeds expense limit of ${limit} THB` });
          return;
        }
      }
    }

    const totalAmount = body.items.reduce((sum, i) => sum + i.amount, 0);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.expenseItem.deleteMany({ where: { voucherId: existing.id } });
      return tx.expenseVoucher.update({
        where: { id: existing.id },
        data: {
          voucherDate: new Date(body.voucherDate),
          description: body.description,
          notes: body.notes,
          totalAmount,
          items: { create: buildItemCreate(body.items) },
        },
        include: { items: { include: { attachments: true } } },
      });
    });

    await auditLog({
      companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'expense_voucher.update',
      resourceType: 'expense_voucher',
      resourceId: updated.id,
      details: { voucherNumber: updated.voucherNumber, totalAmount, itemCount: body.items.length },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({
      data: {
        ...updated,
        totalAmount: Number(updated.totalAmount),
        items: updated.items.map((i) => ({ ...i, amount: Number(i.amount) })),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to update expense voucher', { error: err });
    res.status(500).json({ error: 'Failed to update expense voucher' });
  }
});

/* ─── Delete (draft only) ─── */
expensesRouter.delete('/:id', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const existing = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.expenseVoucher.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
    });
    if (!existing) { res.status(404).json({ error: 'Voucher not found' }); return; }
    if (existing.status !== 'draft') { res.status(400).json({ error: 'Only draft vouchers can be deleted' }); return; }

    await prisma.expenseVoucher.delete({ where: { id: existing.id } });

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'expense_voucher.delete',
      resourceType: 'expense_voucher',
      resourceId: existing.id,
      details: { voucherNumber: existing.voucherNumber },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete expense voucher', { error: err });
    res.status(500).json({ error: 'Failed to delete expense voucher' });
  }
});

/* ─── Submit ─── */
expensesRouter.post('/:id/submit', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const existing = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.expenseVoucher.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
    });
    if (!existing) { res.status(404).json({ error: 'Voucher not found' }); return; }
    if (existing.status !== 'draft') { res.status(400).json({ error: 'Only draft vouchers can be submitted' }); return; }

    const updated = await prisma.expenseVoucher.update({
      where: { id: existing.id },
      data: { status: 'submitted', submittedBy: req.user!.userId, submittedAt: new Date() },
    });

    await auditLog({
      companyId: req.user!.companyId, userId: req.user!.userId, role: req.user!.role,
      action: 'expense_voucher.submit', resourceType: 'expense_voucher', resourceId: updated.id,
      details: { voucherNumber: updated.voucherNumber },
      ipAddress: req.ip ?? '', userAgent: req.get('user-agent') ?? '', language: 'th',
    });

    res.json({ data: { ...updated, totalAmount: Number(updated.totalAmount) } });
  } catch (err) {
    logger.error('Failed to submit expense voucher', { error: err });
    res.status(500).json({ error: 'Failed to submit expense voucher' });
  }
});

/* ─── Approve ─── */
expensesRouter.post('/:id/approve', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const existing = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.expenseVoucher.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
    });
    if (!existing) { res.status(404).json({ error: 'Voucher not found' }); return; }
    if (existing.status !== 'submitted') { res.status(400).json({ error: 'Only submitted vouchers can be approved' }); return; }

    const companyId = req.user!.companyId;

    // Approve and deduct petty cash in one transaction
    const [updated] = await prisma.$transaction([
      prisma.expenseVoucher.update({
        where: { id: existing.id },
        data: { status: 'approved', approvedBy: req.user!.userId, approvedAt: new Date() },
      }),
      // Upsert petty cash record and deduct balance (clamps at 0)
      prisma.$executeRaw`
        INSERT INTO petty_cash (id, company_id, balance, created_at, updated_at)
        VALUES (gen_random_uuid()::text, ${companyId}, 0 - ${existing.totalAmount}, now(), now())
        ON CONFLICT (company_id)
        DO UPDATE SET balance = petty_cash.balance - ${existing.totalAmount}, updated_at = now()
      `,
    ]);

    await auditLog({
      companyId, userId: req.user!.userId, role: req.user!.role,
      action: 'expense_voucher.approve', resourceType: 'expense_voucher', resourceId: updated.id,
      details: { voucherNumber: updated.voucherNumber, totalAmount: Number(updated.totalAmount) },
      ipAddress: req.ip ?? '', userAgent: req.get('user-agent') ?? '', language: 'th',
    });

    res.json({ data: { ...updated, totalAmount: Number(updated.totalAmount) } });
  } catch (err) {
    logger.error('Failed to approve expense voucher', { error: err });
    res.status(500).json({ error: 'Failed to approve expense voucher' });
  }
});

/* ─── Reject ─── */
expensesRouter.post('/:id/reject', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const body = rejectSchema.parse(req.body);
    const existing = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.expenseVoucher.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
    });
    if (!existing) { res.status(404).json({ error: 'Voucher not found' }); return; }
    if (existing.status !== 'submitted') { res.status(400).json({ error: 'Only submitted vouchers can be rejected' }); return; }

    const updated = await prisma.expenseVoucher.update({
      where: { id: existing.id },
      data: { status: 'rejected', rejectedBy: req.user!.userId, rejectedAt: new Date(), rejectionNote: body.rejectionNote },
    });

    await auditLog({
      companyId: req.user!.companyId, userId: req.user!.userId, role: req.user!.role,
      action: 'expense_voucher.reject', resourceType: 'expense_voucher', resourceId: updated.id,
      details: { voucherNumber: updated.voucherNumber, rejectionNote: body.rejectionNote },
      ipAddress: req.ip ?? '', userAgent: req.get('user-agent') ?? '', language: 'th',
    });

    res.json({ data: { ...updated, totalAmount: Number(updated.totalAmount) } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to reject expense voucher', { error: err });
    res.status(500).json({ error: 'Failed to reject expense voucher' });
  }
});

/* ─── Add attachment to an item ─── */
expensesRouter.post('/:id/items/:itemId/attachments', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const voucher = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.expenseVoucher.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId }, select: { id: true, status: true } });
    });
    if (!voucher) { res.status(404).json({ error: 'Voucher not found' }); return; }
    if (voucher.status !== 'draft') { res.status(400).json({ error: 'Only draft vouchers can be modified' }); return; }

    const item = await prisma.expenseItem.findFirst({ where: { id: req.params.itemId, voucherId: voucher.id } });
    if (!item) { res.status(404).json({ error: 'Expense item not found' }); return; }

    const body = attachmentSchema.parse(req.body);
    const attachment = await prisma.expenseAttachment.create({
      data: { expenseItemId: item.id, fileName: body.fileName, fileType: body.fileType, url: body.url, evidenceType: body.evidenceType },
    });

    res.status(201).json({ data: attachment });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to add attachment', { error: err });
    res.status(500).json({ error: 'Failed to add attachment' });
  }
});

/* ─── Delete attachment ─── */
expensesRouter.delete('/:id/items/:itemId/attachments/:attachmentId', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const voucher = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.expenseVoucher.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId }, select: { id: true, status: true } });
    });
    if (!voucher) { res.status(404).json({ error: 'Voucher not found' }); return; }
    if (voucher.status !== 'draft') { res.status(400).json({ error: 'Only draft vouchers can be modified' }); return; }

    const attachment = await prisma.expenseAttachment.findFirst({
      where: { id: req.params.attachmentId, expenseItemId: req.params.itemId },
    });
    if (!attachment) { res.status(404).json({ error: 'Attachment not found' }); return; }

    await prisma.expenseAttachment.delete({ where: { id: attachment.id } });
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete attachment', { error: err });
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});
