import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';
import { logger } from '../config/logger';

export const projectPortalRouter = Router();

type ProjectPortalToken = {
  type: 'project_guest';
  companyId: string;
  projectId: string;
  groupLinkId: string;
};

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

projectPortalRouter.get('/:token', async (req, res) => {
  try {
    const payload = jwt.verify(req.params.token, process.env.JWT_SECRET!) as ProjectPortalToken;
    if (payload.type !== 'project_guest') {
      res.status(401).json({ error: 'Invalid portal token' });
      return;
    }

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
