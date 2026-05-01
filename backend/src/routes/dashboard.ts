import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { logger } from '../config/logger';
import { rdComplianceQueue } from '../queues/rdComplianceQueue';

export const dashboardRouter = Router();

dashboardRouter.get('/integration-status', async (req, res) => {
  try {
    const [lineLink, company, user] = await Promise.all([
      prisma.lineUserLink.findUnique({
        where: { userId: req.user!.userId },
        select: { isActive: true, displayName: true, linkedAt: true },
      }),
      prisma.company.findUnique({
        where: { id: req.user!.companyId },
        select: { lineNotifyEnabled: true },
      }),
      prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { email: true, googleSub: true },
      }),
    ]);

    const googleSheetsConfigured = !!(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON
      || process.env.GOOGLE_APPLICATION_CREDENTIALS
      || process.env.GOOGLE_CLIENT_EMAIL
    );
    const googleDriveConfigured = !!(
      process.env.GOOGLE_DRIVE_ENABLED === 'true'
      || process.env.GOOGLE_DRIVE_FOLDER_ID
    );

    res.json({
      data: {
        lineAi: {
          connected: !!lineLink?.isActive,
          displayName: lineLink?.displayName ?? null,
          linkedAt: lineLink?.linkedAt ?? null,
          notificationsEnabled: !!company?.lineNotifyEnabled,
        },
        googleAccount: {
          connected: !!user?.googleSub,
          email: user?.email ?? req.user?.email ?? null,
        },
        googleSheets: {
          connected: googleSheetsConfigured,
          mode: googleSheetsConfigured ? 'service_account' : 'not_configured',
        },
        googleDrive: {
          connected: googleDriveConfigured,
          mode: googleDriveConfigured ? 'workspace_folder' : 'not_configured',
        },
      },
    });
  } catch (err) {
    logger.error('Failed to load integration status', { error: err });
    res.status(500).json({ error: 'Failed to load integration status' });
  }
});

/* ─── GET /api/dashboard/stats ─── */
dashboardRouter.get('/stats', async (req, res) => {
  try {
    const companyId = req.user!.companyId;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [
      totalInvoices,
      totalRevenueAgg,
      pendingCount,
      rdSuccessCount,
      rdPendingCount,
      receivableRows,
      monthlyRows,
    ] = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return Promise.all([
        tx.invoice.count({
          where: { companyId, status: { not: 'cancelled' } },
        }),
        tx.invoice.aggregate({
          where: { companyId, status: { in: ['approved', 'submitted'] } },
          _sum: { total: true },
        }),
        tx.invoice.count({
          where: { companyId, status: 'pending' },
        }),
        tx.invoice.count({
          where: { companyId, rdSubmissionStatus: 'success' },
        }),
        tx.invoice.count({
          where: { companyId, rdSubmissionStatus: { in: ['pending', 'in_progress'] } },
        }),
        tx.invoice.findMany({
          where: {
            companyId,
            status: { not: 'cancelled' },
            type: { in: ['tax_invoice', 'debit_note'] },
          },
          select: {
            total: true,
            paidAmount: true,
            dueDate: true,
            invoiceDate: true,
          },
        }),
        tx.$queryRaw<Array<{ month: string; total: number }>>(
          Prisma.sql`
            SELECT
              TO_CHAR("invoiceDate", 'YYYY-MM') AS month,
              SUM(total)::float                  AS total
            FROM invoices
            WHERE
              "companyId" = ${companyId}
              AND status   <> 'cancelled'
              AND "invoiceDate" >= ${sixMonthsAgo}
            GROUP BY TO_CHAR("invoiceDate", 'YYYY-MM')
            ORDER BY month ASC
          `,
        ),
      ]);
    });

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const receivables = receivableRows.map((row) => {
      const paidAmount = row.paidAmount ?? 0;
      const outstandingAmount = Math.max(row.total - paidAmount, 0);
      const dueDate = row.dueDate ?? row.invoiceDate;
      const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      const ageDays = outstandingAmount > 0
        ? Math.max(0, Math.floor((startOfDay.getTime() - dueStart.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
      return { outstandingAmount, ageDays };
    });

    const totalOutstanding = receivables.reduce((sum, row) => sum + row.outstandingAmount, 0);
    const overdueOutstanding = receivables.filter((row) => row.ageDays > 0).reduce((sum, row) => sum + row.outstandingAmount, 0);
    const currentOutstanding = receivables.filter((row) => row.ageDays === 0).reduce((sum, row) => sum + row.outstandingAmount, 0);

    res.json({
      data: {
        totalInvoices,
        totalRevenue: totalRevenueAgg._sum.total ?? 0,
        pendingCount,
        rdSuccessCount,
        rdPendingCount,
        receivables: {
          totalOutstanding,
          overdueOutstanding,
          currentOutstanding,
          aging: {
            current: currentOutstanding,
            days1To30: receivables.filter((row) => row.ageDays >= 1 && row.ageDays <= 30).reduce((sum, row) => sum + row.outstandingAmount, 0),
            days31To60: receivables.filter((row) => row.ageDays >= 31 && row.ageDays <= 60).reduce((sum, row) => sum + row.outstandingAmount, 0),
            days61To90: receivables.filter((row) => row.ageDays >= 61 && row.ageDays <= 90).reduce((sum, row) => sum + row.outstandingAmount, 0),
            days90Plus: receivables.filter((row) => row.ageDays > 90).reduce((sum, row) => sum + row.outstandingAmount, 0),
          },
        },
        monthlyRevenue: monthlyRows.map((row) => ({
          month: row.month,
          total: Number(row.total),
        })),
      },
    });
  } catch (err) {
    logger.error('Failed to fetch dashboard stats', { err });
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

/* ─── GET /api/dashboard/rd-compliance ─── */
dashboardRouter.get('/rd-compliance', async (req, res) => {
  try {
    const companyId = req.user!.companyId;

    // Last 3 full months + current partial month
    const months: { year: number; month: number; label: string }[] = [];
    const now = new Date();
    for (let i = 3; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      });
    }

    const results = await Promise.all(
      months.map(async ({ year, month, label }) => {
        const start = new Date(year, month - 1, 1);
        const end   = new Date(year, month, 0, 23, 59, 59);

        const rows = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
          return tx.invoice.groupBy({
            by: ['type', 'rdSubmissionStatus'],
            where: {
              companyId,
              invoiceDate: { gte: start, lte: end },
              status: { not: 'cancelled' },
            },
            _count: { id: true },
            _sum: { total: true },
          });
        });

        // Totals
        const total     = rows.reduce((s, r) => s + r._count.id, 0);
        const success   = rows.filter(r => r.rdSubmissionStatus === 'success').reduce((s, r) => s + r._count.id, 0);
        const failed    = rows.filter(r => r.rdSubmissionStatus === 'failed').reduce((s, r) => s + r._count.id, 0);
        const pending   = rows.filter(r => ['pending', 'in_progress', 'retrying'].includes(r.rdSubmissionStatus ?? '')).reduce((s, r) => s + r._count.id, 0);
        const unsubmitted = total - success - failed - pending;

        // Deadline: 15th of the following month
        const deadline  = new Date(year, month, 15);
        const isPast    = now > deadline;
        const daysLeft  = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return {
          month: label,
          deadline: deadline.toISOString().split('T')[0],
          isPast,
          daysLeft: isPast ? 0 : daysLeft,
          total,
          success,
          failed,
          pending,
          unsubmitted,
          complianceRate: total > 0 ? Math.round((success / total) * 100) : 100,
          byType: ['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note'].map(type => {
            const typeRows = rows.filter(r => r.type === type);
            const typeTotal = typeRows.reduce((s, r) => s + r._count.id, 0);
            const typeSuccess = typeRows.filter(r => r.rdSubmissionStatus === 'success').reduce((s, r) => s + r._count.id, 0);
            return {
              type,
              code: { tax_invoice: 'T02', tax_invoice_receipt: 'T01', receipt: 'T03', credit_note: 'T04', debit_note: 'T05' }[type] ?? type,
              total: typeTotal,
              success: typeSuccess,
              failed: typeRows.filter(r => r.rdSubmissionStatus === 'failed').reduce((s, r) => s + r._count.id, 0),
              totalAmount: typeRows.reduce((s, r) => s + (r._sum.total ?? 0), 0),
            };
          }).filter(t => t.total > 0),
        };
      }),
    );

    res.json({ data: results });
  } catch (err) {
    logger.error('Failed to fetch RD compliance stats', { err });
    res.status(500).json({ error: 'Failed to fetch RD compliance stats' });
  }
});

/* ─── POST /api/dashboard/rd-compliance/trigger ─── (manual trigger for testing) */
dashboardRouter.post('/rd-compliance/trigger', async (req, res) => {
  try {
    const { year, month } = req.body as { year?: number; month?: number };
    const job = await rdComplianceQueue.add(
      'manual-rd-compliance-check',
      { triggeredBy: 'manual', year, month },
      { priority: 1 },
    );
    res.json({ message: 'Compliance check triggered', jobId: job.id });
  } catch (err) {
    logger.error('Failed to trigger compliance check', { err });
    res.status(500).json({ error: 'Failed to trigger compliance check' });
  }
});

/* ─── GET /api/company/profile ─── */
dashboardRouter.get('/profile', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: {
        nameTh: true,
        nameEn: true,
        taxId: true,
        branchCode: true,
        branchNameTh: true,
        addressTh: true,
        addressEn: true,
        phone: true,
        email: true,
        logoUrl: true,
      },
    });

    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    res.json({ data: company });
  } catch (err) {
    logger.error('Failed to fetch company profile', { err });
    res.status(500).json({ error: 'Failed to fetch company profile' });
  }
});
