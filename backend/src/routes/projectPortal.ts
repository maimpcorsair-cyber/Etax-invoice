import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';
import { logger } from '../config/logger';
import { isStorageConfigured, uploadToStorage } from '../services/storageService';
import { checkStorageQuota, incrementStorageUsed } from '../services/storageQuotaService';

export const projectPortalRouter = Router();

type ProjectPortalToken = {
  type: 'project_guest';
  companyId: string;
  projectId: string;
  groupLinkId: string;
};

const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(180).optional(),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  fileBase64: z.string().min(1),
});

const guestCommentSchema = z.object({
  message: z.string().trim().min(1).max(1200),
});

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

function asNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return value.toNumber();
}

function documentKind(item: {
  mimeType: string;
  targetType: string | null;
  purchaseInvoiceId: string | null;
  ocrResult: Prisma.JsonValue | null;
}) {
  const text = JSON.stringify(item.ocrResult ?? {}).toLowerCase();
  if (item.purchaseInvoiceId || item.targetType === 'purchase_invoice') return 'input_vat';
  if (text.includes('bank') || text.includes('transfer') || text.includes('promptpay') || text.includes('สลิป')) return 'payment_proof';
  if (item.mimeType.includes('pdf')) return 'document';
  if (item.mimeType.includes('image')) return 'image';
  return 'file';
}

function needsAction(item: {
  status: string;
  error: string | null;
  warnings: Prisma.JsonValue | null;
  purchaseInvoiceId: string | null;
  targetId: string | null;
}) {
  if (item.status === 'failed') return true;
  if (item.error) return true;
  if (Array.isArray(item.warnings) && item.warnings.length > 0) return true;
  if (!item.purchaseInvoiceId && !item.targetId && item.status !== 'completed') return true;
  return false;
}

function verifyPortalToken(token: string) {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as ProjectPortalToken;
  if (payload.type !== 'project_guest') throw new Error('Invalid portal token');
  return payload;
}

async function assertPortalAccess(payload: ProjectPortalToken) {
  return withSystemRlsContext(prisma, (tx) => {
    return tx.lineGroupLink.findFirst({
      where: {
        id: payload.groupLinkId,
        companyId: payload.companyId,
        projectId: payload.projectId,
        isActive: true,
        project: { status: { not: 'archived' } },
      },
      select: {
        id: true,
        groupName: true,
        companyId: true,
        projectId: true,
        project: { select: { id: true, code: true, name: true } },
      },
    });
  });
}

projectPortalRouter.get('/:token', async (req, res) => {
  try {
    const payload = verifyPortalToken(req.params.token);

    const data = await withSystemRlsContext(prisma, async (tx) => {
      const group = await tx.lineGroupLink.findFirst({
        where: {
          id: payload.groupLinkId,
          companyId: payload.companyId,
          projectId: payload.projectId,
          isActive: true,
        },
        select: { id: true, groupName: true, linkedAt: true },
      });
      if (!group) return null;

      const project = await tx.project.findFirst({
        where: { id: payload.projectId, companyId: payload.companyId, status: { not: 'archived' } },
        include: {
          company: { select: { nameTh: true, nameEn: true } },
          owner: { select: { name: true } },
          approver: { select: { name: true } },
        },
      });
      if (!project) return null;

      const [purchaseSummary, paidPurchaseSummary, expenseSummary, approvedExpenseSummary, revenueSummary, files] = await Promise.all([
        tx.purchaseInvoice.aggregate({
          where: { companyId: payload.companyId, projectId: payload.projectId },
          _sum: { total: true, vatAmount: true },
          _count: true,
        }),
        tx.purchaseInvoice.aggregate({
          where: { companyId: payload.companyId, projectId: payload.projectId, isPaid: true },
          _sum: { total: true },
        }),
        tx.expenseVoucher.aggregate({
          where: { companyId: payload.companyId, projectId: payload.projectId, status: { in: ['submitted', 'approved'] } },
          _sum: { totalAmount: true },
          _count: true,
        }),
        tx.expenseVoucher.aggregate({
          where: { companyId: payload.companyId, projectId: payload.projectId, status: 'approved' },
          _sum: { totalAmount: true },
        }),
        tx.invoice.aggregate({
          where: { companyId: payload.companyId, projectId: payload.projectId, status: { not: 'cancelled' } },
          _sum: { total: true },
          _count: true,
        }),
        tx.documentIntake.findMany({
          where: { companyId: payload.companyId, projectId: payload.projectId },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            id: true,
            source: true,
            fileName: true,
            mimeType: true,
            status: true,
            error: true,
            warnings: true,
            targetType: true,
            targetId: true,
            purchaseInvoiceId: true,
            ocrResult: true,
            createdAt: true,
            updatedAt: true,
            comments: {
              where: { status: 'open' },
              orderBy: { createdAt: 'desc' },
              take: 3,
              select: {
                id: true,
                authorType: true,
                authorName: true,
                kind: true,
                status: true,
                message: true,
                createdAt: true,
              },
            },
          },
        }),
      ]);

      const purchaseTotal = asNumber(purchaseSummary._sum.total);
      const paidPurchaseTotal = asNumber(paidPurchaseSummary._sum.total);
      const expenseTotal = asNumber(expenseSummary._sum.totalAmount);
      const approvedExpenseTotal = asNumber(approvedExpenseSummary._sum.totalAmount);
      const revenueTotal = asNumber(revenueSummary._sum.total);
      const committedCost = purchaseTotal + expenseTotal;
      const paidCost = paidPurchaseTotal + approvedExpenseTotal;
      const budgetAmount = asNumber(project.budgetAmount);
      const actionNeededCount = files.filter(needsAction).length;

      return {
        project: {
          id: project.id,
          code: project.code,
          name: project.name,
          customerName: project.customerName,
          description: project.description,
          status: project.status,
          budgetAmount,
          startDate: project.startDate,
          endDate: project.endDate,
          ownerName: project.owner?.name ?? null,
          approverName: project.approver?.name ?? null,
        },
        company: {
          name: project.company.nameTh || project.company.nameEn,
        },
        lineGroup: group,
        summary: {
          purchaseTotal,
          paidPurchaseTotal,
          expenseTotal,
          approvedExpenseTotal,
          revenueTotal,
          committedCost,
          paidCost,
          remainingBudget: budgetAmount - committedCost,
          estimatedMargin: revenueTotal - committedCost,
          inputVat: asNumber(purchaseSummary._sum.vatAmount),
          purchaseCount: purchaseSummary._count,
          expenseCount: expenseSummary._count,
          invoiceCount: revenueSummary._count,
          filesCount: files.length,
          actionNeededCount,
        },
        recentFiles: files.map((item) => ({
          id: item.id,
          source: item.source,
          fileName: item.fileName,
          mimeType: item.mimeType,
          status: item.status,
          kind: documentKind(item),
          needsAction: needsAction(item),
          error: item.error,
          comments: item.comments.reverse(),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
        generatedAt: new Date().toISOString(),
      };
    });

    if (!data) {
      res.status(404).json({ error: 'Project portal not found or expired' });
      return;
    }

    res.json({ data });
  } catch (err) {
    logger.warn('Failed to open project guest portal', { error: err });
    res.status(401).json({ error: 'Invalid or expired project portal link' });
  }
});

projectPortalRouter.post('/:token/documents/:documentIntakeId/comments', async (req, res) => {
  try {
    const payload = verifyPortalToken(req.params.token);
    const group = await assertPortalAccess(payload);
    if (!group || !group.project) {
      res.status(404).json({ error: 'Project portal not found or expired' });
      return;
    }

    const body = guestCommentSchema.parse(req.body);
    const created = await withSystemRlsContext(prisma, async (tx) => {
      const document = await tx.documentIntake.findFirst({
        where: {
          id: req.params.documentIntakeId,
          companyId: payload.companyId,
          projectId: payload.projectId,
        },
        select: { id: true },
      });
      if (!document) return null;

      return tx.documentComment.create({
        data: {
          companyId: payload.companyId,
          projectId: payload.projectId,
          documentIntakeId: document.id,
          authorType: 'guest',
          authorName: group.groupName || 'LINE guest',
          kind: 'reply',
          status: 'open',
          message: body.message,
        },
        select: {
          id: true,
          authorType: true,
          authorName: true,
          kind: true,
          status: true,
          message: true,
          createdAt: true,
        },
      });
    });

    if (!created) {
      res.status(404).json({ error: 'Project document not found' });
      return;
    }

    res.status(201).json({ data: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.warn('Project guest comment failed', { error: err });
    res.status(401).json({ error: err instanceof Error ? err.message : 'Failed to send project comment' });
  }
});

projectPortalRouter.post('/:token/upload', async (req, res) => {
  try {
    const payload = verifyPortalToken(req.params.token);
    const group = await assertPortalAccess(payload);
    if (!group || !group.project) {
      res.status(404).json({ error: 'Project portal not found or expired' });
      return;
    }

    const body = uploadSchema.parse(req.body);
    const buffer = Buffer.from(body.fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (buffer.length === 0) {
      res.status(400).json({ error: 'Empty file' });
      return;
    }
    if (buffer.length > MAX_UPLOAD_SIZE) {
      res.status(413).json({ error: 'File is too large' });
      return;
    }

    const quota = await checkStorageQuota(payload.companyId, buffer.length);
    if (!quota.allowed) {
      res.status(413).json({ error: 'Storage quota exceeded / พื้นที่เก็บข้อมูลเต็ม' });
      return;
    }

    let fileUrl: string | undefined;
    let storageKey: string | undefined;
    const storageReady = isStorageConfigured();
    if (storageReady) {
      const ext = body.mimeType === 'application/pdf' ? 'pdf' : body.mimeType.split('/')[1] || 'bin';
      storageKey = `companies/${payload.companyId}/document-intakes/project-portal/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      fileUrl = await uploadToStorage(storageKey, buffer, body.mimeType);
    }

    const created = await withSystemRlsContext(prisma, async (tx) => {
      return tx.documentIntake.create({
        data: {
          companyId: payload.companyId,
          projectId: payload.projectId,
          userId: `project-guest:${group.id}`,
          source: 'project_guest',
          sourceMessageId: `portal:${group.id}:${Date.now()}`,
          fileName: body.fileName,
          mimeType: body.mimeType,
          fileSize: buffer.length,
          fileBase64: storageReady ? undefined : buffer.toString('base64'),
          fileUrl,
          storageKey,
          status: 'needs_review',
          warnings: ['uploaded_by_project_guest'] as Prisma.InputJsonValue,
          error: 'Uploaded from project guest portal; accountant review required',
        },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          status: true,
          source: true,
          createdAt: true,
        },
      });
    });
    await incrementStorageUsed(payload.companyId, buffer.length);

    res.status(201).json({
      data: created,
      message: 'Uploaded to project. Accountant review required.',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.warn('Project guest upload failed', { error: err });
    res.status(401).json({ error: err instanceof Error ? err.message : 'Failed to upload project document' });
  }
});
