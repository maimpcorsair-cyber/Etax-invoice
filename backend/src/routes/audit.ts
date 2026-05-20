import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext, withSystemRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { resolveCompanyAccessPolicy } from '../services/accessPolicyService';
import { exportCompanyWorkspaceToSheets } from '../services/googleSheetsService';
import { isDriveConfigured } from '../services/googleDriveService';
import { logger } from '../config/logger';

export const auditRouter = Router();

const exportPackageSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2099),
  month: z.coerce.number().int().min(1).max(12),
  shareWithEmail: z.string().email().optional(),
});

auditRouter.post('/export-package', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    if (!isDriveConfigured()) {
      res.status(400).json({ error: 'Google Drive/Sheets not configured for this company' });
      return;
    }

    const body = exportPackageSchema.parse(req.body);
    const { year, month } = body;
    const companyId = req.user!.companyId;

    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);
    const period = `${year}-${String(month).padStart(2, '0')}`;

    const [company, currentUser, purchaseInvoices, invoices, expenses] = await Promise.all([
      withSystemRlsContext(prisma, (tx) => tx.company.findFirst({
        where: { id: companyId },
        select: { nameTh: true, nameEn: true, googleWorkspaceSheetId: true },
      })),
      withSystemRlsContext(prisma, (tx) => tx.user.findFirst({
        where: { id: req.user!.userId },
        select: { email: true, googleRefreshToken: true },
      })),
      withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => tx.purchaseInvoice.findMany({
        where: { companyId, invoiceDate: { gte: from, lte: to } },
        include: { project: { select: { code: true, name: true } } },
        orderBy: { invoiceDate: 'asc' },
        take: 5000,
      })),
      withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => tx.invoice.findMany({
        where: { companyId, invoiceDate: { gte: from, lte: to }, status: { not: 'draft' } },
        include: {
          project: { select: { code: true, name: true } },
          buyer: { select: { nameTh: true, nameEn: true } },
        },
        orderBy: { invoiceDate: 'asc' },
        take: 5000,
      })),
      withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => tx.expenseVoucher.findMany({
        where: { companyId, voucherDate: { gte: from, lte: to } },
        include: { items: true, project: { select: { code: true, name: true } } },
        orderBy: { voucherDate: 'asc' },
        take: 2000,
      })),
    ]);

    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    const companyName = company.nameTh || company.nameEn || 'Billboy';

    const taxStatusLabel = (v: string) => v === 'vat7' ? 'ขอคืนภาษีซื้อได้' : v === 'vatZero' ? 'VAT 0%' : 'ไม่มี VAT';
    const fmtDate = (d: Date | null | undefined) => d ? d.toISOString().slice(0, 10) : '';

    const shareTargets = [currentUser?.email, body.shareWithEmail].filter((e): e is string => !!e);

    const result = await exportCompanyWorkspaceToSheets({
      period: `Audit ${period}`,
      companyName,
      userRefreshToken: currentUser?.googleRefreshToken ?? null,
      sharedWithEmails: shareTargets,
      tabs: {
        products: [],
        inputVat: purchaseInvoices.map((pi) => ({
          date: fmtDate(pi.invoiceDate),
          supplier: pi.supplierName,
          documentNo: pi.invoiceNumber ?? '',
          project: pi.project ? `${pi.project.code} ${pi.project.name}` : '',
          category: pi.category ?? '',
          subtotal: pi.subtotal,
          vat: pi.vatAmount,
          total: pi.total,
          taxStatus: taxStatusLabel(pi.vatType),
          attachmentUrl: pi.pdfUrl ?? '',
        })),
        outputVat: invoices.map((inv) => ({
          date: fmtDate(inv.invoiceDate),
          buyer: inv.buyer?.nameTh || inv.buyer?.nameEn || '',
          documentNo: inv.invoiceNumber,
          project: inv.project ? `${inv.project.code} ${inv.project.name}` : '',
          status: inv.status,
          subtotal: inv.subtotal,
          vat: inv.vatAmount,
          total: inv.total,
          attachmentUrl: (inv as { driveUrl?: string | null }).driveUrl ?? inv.pdfUrl ?? '',
        })),
        expenses: expenses.map((ev) => ({
          date: fmtDate(ev.voucherDate),
          voucherNo: ev.voucherNumber,
          project: ev.project ? `${ev.project.code} ${ev.project.name}` : '',
          category: ev.items.map((i) => i.category).filter(Boolean).join(', '),
          description: ev.items.map((i) => i.description).join(', ').slice(0, 200),
          amount: Number(ev.totalAmount),
          status: ev.status,
          attachmentUrl: '',
        })),
        customerEvidence: [],
        missingDocs: [],
        projectSummary: [],
      },
    });

    logger.info('[audit] Export package created', { companyId, period, url: result.url });
    res.json({ data: { url: result.url, period } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('[audit] Export package failed', { error: err });
    res.status(500).json({ error: 'Failed to create audit export package' });
  }
});

auditRouter.get('/', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!policy.canViewAuditLogs) {
      res.status(403).json({ error: 'Upgrade to Business or Enterprise to access audit logs' });
      return;
    }

    const { page = '1', limit = '50', action, userId } = req.query;
    const pageNumber = parseInt(page as string);
    const limitNumber = parseInt(limit as string);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Record<string, unknown> = { companyId: req.user!.companyId };
    if (action) where.action = { contains: action as string };
    if (userId) where.userId = userId;

    const { logs, total } = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [items, count] = await Promise.all([
        tx.auditLog.findMany({
          where,
          skip,
          take: limitNumber,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true, email: true } } },
        }),
        tx.auditLog.count({ where }),
      ]);
      return { logs: items, total: count };
    });

    res.json({
      data: logs.map((log) => ({
        id: log.id,
        companyId: log.companyId,
        userId: log.userId,
        userName: log.user.name || log.user.email,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        details: log.details,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        language: log.language,
        createdAt: log.createdAt,
      })),
      pagination: { page: pageNumber, limit: limitNumber, total },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});
