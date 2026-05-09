import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { auditLog } from '../services/auditService';
import { logger } from '../config/logger';

export const projectsRouter = Router();

const statusSchema = z.enum(['active', 'on_hold', 'completed', 'archived']);
const memberRoleSchema = z.enum(['owner', 'approver', 'member', 'viewer']);

const projectPayloadSchema = z.object({
  code: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  customerName: z.string().trim().max(160).optional().nullable(),
  budgetAmount: z.number().min(0).max(999999999999).default(0),
  status: statusSchema.default('active'),
  ownerId: z.string().min(1).optional().nullable(),
  approverId: z.string().min(1).optional().nullable(),
  startDate: z.string().min(1).optional().nullable(),
  endDate: z.string().min(1).optional().nullable(),
  memberIds: z.array(z.string().min(1)).optional().default([]),
});

const updateProjectPayloadSchema = projectPayloadSchema.partial().extend({
  memberIds: z.array(z.string().min(1)).optional(),
});

const memberPayloadSchema = z.object({
  userId: z.string().min(1),
  role: memberRoleSchema.default('member'),
});

const assignPayloadSchema = z.object({
  targetType: z.enum(['purchase_invoice', 'document_intake', 'expense_voucher', 'invoice', 'line_group']),
  targetId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
});

function normalizeCode(input?: string | null) {
  return input?.trim().toUpperCase().replace(/\s+/g, '-') || '';
}

async function generateProjectCode(companyId: string, tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  const count = await tx.project.count({
    where: {
      companyId,
      code: { startsWith: `PRJ-${year}-` },
    },
  });
  return `PRJ-${year}-${String(count + 1).padStart(3, '0')}`;
}

async function ensureProjectUsersInCompany(
  companyId: string,
  userIds: Array<string | null | undefined>,
  tx: Prisma.TransactionClient,
) {
  const ids = [...new Set(userIds.filter(Boolean) as string[])];
  if (ids.length === 0) return;
  const count = await tx.user.count({ where: { companyId, id: { in: ids }, isActive: true } });
  if (count !== ids.length) {
    throw new Error('One or more project users are not active users in this company');
  }
}

async function ensureProjectBelongsToCompany(
  companyId: string,
  projectId: string | null,
  tx: Prisma.TransactionClient,
) {
  if (!projectId) return;
  const project = await tx.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('Project not found');
}

function asNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

async function projectBudgetSummary(companyId: string, projectId: string, tx: Prisma.TransactionClient) {
  const [purchaseAll, purchasePaid, expenseCommitted, expenseApproved, intakes] = await Promise.all([
    tx.purchaseInvoice.aggregate({
      where: { companyId, projectId },
      _sum: { total: true },
      _count: { _all: true },
    }),
    tx.purchaseInvoice.aggregate({
      where: { companyId, projectId, isPaid: true },
      _sum: { total: true },
    }),
    tx.expenseVoucher.aggregate({
      where: { companyId, projectId, status: { in: ['submitted', 'approved'] } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    tx.expenseVoucher.aggregate({
      where: { companyId, projectId, status: 'approved' },
      _sum: { totalAmount: true },
    }),
    tx.documentIntake.groupBy({
      by: ['status'],
      where: { companyId, projectId },
      _count: { _all: true },
    }),
  ]);

  const purchaseCommitted = asNumber(purchaseAll._sum.total);
  const purchasePaidAmount = asNumber(purchasePaid._sum.total);
  const expenseCommittedAmount = asNumber(expenseCommitted._sum.totalAmount);
  const expenseApprovedAmount = asNumber(expenseApproved._sum.totalAmount);
  const intakeByStatus = Object.fromEntries(intakes.map((row) => [row.status, row._count._all]));

  return {
    committedAmount: purchaseCommitted + expenseCommittedAmount,
    paidAmount: purchasePaidAmount + expenseApprovedAmount,
    purchaseCount: purchaseAll._count._all,
    expenseVoucherCount: expenseCommitted._count._all,
    documentIntakeCount: intakes.reduce((sum, row) => sum + row._count._all, 0),
    documentIntakesByStatus: intakeByStatus,
  };
}

function serializeProject(project: Prisma.ProjectGetPayload<{
  include: {
    owner: { select: { id: true; name: true; email: true; role: true } };
    approver: { select: { id: true; name: true; email: true; role: true } };
    members: { include: { user: { select: { id: true; name: true; email: true; role: true } } } };
  };
}>, summary: Awaited<ReturnType<typeof projectBudgetSummary>>) {
  const budgetAmount = asNumber(project.budgetAmount);
  const remainingAmount = budgetAmount - summary.committedAmount;
  return {
    ...project,
    budgetAmount,
    summary: {
      ...summary,
      remainingAmount,
      budgetUsedPercent: budgetAmount > 0 ? Math.round((summary.committedAmount / budgetAmount) * 1000) / 10 : 0,
      isOverBudget: budgetAmount > 0 && summary.committedAmount > budgetAmount,
    },
  };
}

projectsRouter.get('/users', async (req, res) => {
  try {
    const users = await withRlsContext(prisma, tenantRlsContext(req.user!), (tx) =>
      tx.user.findMany({
        where: { companyId: req.user!.companyId, isActive: true },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, email: true, role: true },
      }),
    );
    res.json({ data: users });
  } catch (err) {
    logger.error('Failed to list project users', { error: err });
    res.status(500).json({ error: 'Failed to fetch project users' });
  }
});

projectsRouter.get('/', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const status = typeof req.query.status === 'string' ? req.query.status : 'active';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const projects = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const where: Prisma.ProjectWhereInput = { companyId };
      if (status !== 'all') where.status = status as never;
      if (search) {
        where.OR = [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { customerName: { contains: search, mode: 'insensitive' } },
        ];
      }

      const rows = await tx.project.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true, role: true } },
          approver: { select: { id: true, name: true, email: true, role: true } },
          members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        take: 200,
      });

      return Promise.all(rows.map(async (project) => serializeProject(project, await projectBudgetSummary(companyId, project.id, tx))));
    });

    res.json({ data: projects });
  } catch (err) {
    logger.error('Failed to list projects', { error: err });
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

projectsRouter.get('/:id', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const project = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const row = await tx.project.findFirst({
        where: { id: req.params.id, companyId },
        include: {
          owner: { select: { id: true, name: true, email: true, role: true } },
          approver: { select: { id: true, name: true, email: true, role: true } },
          members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        },
      });
      if (!row) return null;
      return serializeProject(row, await projectBudgetSummary(companyId, row.id, tx));
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ data: project });
  } catch (err) {
    logger.error('Failed to get project', { error: err });
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

projectsRouter.post('/', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = projectPayloadSchema.parse(req.body);
    const companyId = req.user!.companyId;

    const created = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await ensureProjectUsersInCompany(companyId, [body.ownerId, body.approverId, ...body.memberIds], tx);
      const code = normalizeCode(body.code) || await generateProjectCode(companyId, tx);
      const memberIds = [...new Set([...(body.memberIds ?? []), body.ownerId, body.approverId].filter(Boolean) as string[])];
      return tx.project.create({
        data: {
          companyId,
          code,
          name: body.name,
          description: body.description || null,
          customerName: body.customerName || null,
          budgetAmount: body.budgetAmount,
          status: body.status,
          ownerId: body.ownerId || null,
          approverId: body.approverId || null,
          startDate: body.startDate ? new Date(body.startDate) : null,
          endDate: body.endDate ? new Date(body.endDate) : null,
          createdBy: req.user!.userId,
          members: {
            create: memberIds.map((userId) => ({
              userId,
              role: userId === body.ownerId ? 'owner' : userId === body.approverId ? 'approver' : 'member',
            })),
          },
        },
      });
    });

    await auditLog({
      companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'project.create',
      resourceType: 'project',
      resourceId: created.id,
      details: { code: created.code, name: created.name, budgetAmount: asNumber(created.budgetAmount) },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.status(201).json({ data: { ...created, budgetAmount: asNumber(created.budgetAmount) } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'Project code already exists' });
      return;
    }
    logger.error('Failed to create project', { error: err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create project' });
  }
});

projectsRouter.patch('/:id', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = updateProjectPayloadSchema.parse(req.body);
    const companyId = req.user!.companyId;

    const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const existing = await tx.project.findFirst({ where: { id: req.params.id, companyId }, select: { id: true } });
      if (!existing) return null;
      await ensureProjectUsersInCompany(companyId, [body.ownerId, body.approverId, ...(body.memberIds ?? [])], tx);
      const data: Prisma.ProjectUpdateInput = {
        code: body.code === undefined ? undefined : normalizeCode(body.code),
        name: body.name,
        description: body.description === undefined ? undefined : body.description || null,
        customerName: body.customerName === undefined ? undefined : body.customerName || null,
        budgetAmount: body.budgetAmount,
        status: body.status,
        owner: body.ownerId === undefined ? undefined : body.ownerId ? { connect: { id: body.ownerId } } : { disconnect: true },
        approver: body.approverId === undefined ? undefined : body.approverId ? { connect: { id: body.approverId } } : { disconnect: true },
        startDate: body.startDate === undefined ? undefined : body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate === undefined ? undefined : body.endDate ? new Date(body.endDate) : null,
      };
      const project = await tx.project.update({ where: { id: existing.id }, data });
      if (body.memberIds) {
        const memberIds = [...new Set([...(body.memberIds ?? []), body.ownerId, body.approverId].filter(Boolean) as string[])];
        await tx.projectMember.deleteMany({ where: { projectId: existing.id } });
        if (memberIds.length > 0) {
          await tx.projectMember.createMany({
            data: memberIds.map((userId) => ({
              projectId: existing.id,
              userId,
              role: userId === body.ownerId ? 'owner' : userId === body.approverId ? 'approver' : 'member',
            })),
            skipDuplicates: true,
          });
        }
      }
      return project;
    });

    if (!updated) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await auditLog({
      companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'project.update',
      resourceType: 'project',
      resourceId: updated.id,
      details: { code: updated.code, name: updated.name, status: updated.status },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ data: { ...updated, budgetAmount: asNumber(updated.budgetAmount) } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'Project code already exists' });
      return;
    }
    logger.error('Failed to update project', { error: err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update project' });
  }
});

projectsRouter.delete('/:id', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const archived = await withRlsContext(prisma, tenantRlsContext(req.user!), (tx) =>
      tx.project.updateMany({
        where: { id: req.params.id, companyId: req.user!.companyId },
        data: { status: 'archived' },
      }),
    );
    if (archived.count === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    logger.error('Failed to archive project', { error: err });
    res.status(500).json({ error: 'Failed to archive project' });
  }
});

projectsRouter.post('/:id/members', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = memberPayloadSchema.parse(req.body);
    const companyId = req.user!.companyId;
    const member = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await ensureProjectBelongsToCompany(companyId, req.params.id, tx);
      await ensureProjectUsersInCompany(companyId, [body.userId], tx);
      return tx.projectMember.upsert({
        where: { projectId_userId: { projectId: req.params.id, userId: body.userId } },
        update: { role: body.role },
        create: { projectId: req.params.id, userId: body.userId, role: body.role },
      });
    });
    res.status(201).json({ data: member });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to upsert project member', { error: err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update project member' });
  }
});

projectsRouter.delete('/:id/members/:userId', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await ensureProjectBelongsToCompany(req.user!.companyId, req.params.id, tx);
      await tx.projectMember.deleteMany({ where: { projectId: req.params.id, userId: req.params.userId } });
    });
    res.status(204).send();
  } catch (err) {
    logger.error('Failed to delete project member', { error: err });
    res.status(500).json({ error: 'Failed to remove project member' });
  }
});

projectsRouter.post('/assign-document', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = assignPayloadSchema.parse(req.body);
    const companyId = req.user!.companyId;
    const data = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await ensureProjectBelongsToCompany(companyId, body.projectId, tx);
      if (body.targetType === 'purchase_invoice') {
        return tx.purchaseInvoice.updateMany({ where: { id: body.targetId, companyId }, data: { projectId: body.projectId } });
      }
      if (body.targetType === 'document_intake') {
        return tx.documentIntake.updateMany({ where: { id: body.targetId, companyId }, data: { projectId: body.projectId } });
      }
      if (body.targetType === 'expense_voucher') {
        return tx.expenseVoucher.updateMany({ where: { id: body.targetId, companyId }, data: { projectId: body.projectId } });
      }
      if (body.targetType === 'invoice') {
        return tx.invoice.updateMany({ where: { id: body.targetId, companyId }, data: { projectId: body.projectId } });
      }
      return tx.lineGroupLink.updateMany({ where: { id: body.targetId, companyId }, data: { projectId: body.projectId } });
    });
    if (data.count === 0) {
      res.status(404).json({ error: 'Target document not found' });
      return;
    }
    res.json({ data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to assign document to project', { error: err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to assign document' });
  }
});
