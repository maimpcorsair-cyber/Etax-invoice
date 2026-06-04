import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { authenticate, requireRole } from '../middleware/auth';
import {
  hasFeatureAccess,
  resolveCompanyAccessPolicy,
} from '../services/accessPolicyService';
import { exportPp30ToSheets } from '../services/googleSheetsService';
import { syncVatFilingToDrive } from '../services/projectDriveSyncService';
import { enqueueMasterSheetSync } from '../queues';
import { auditLog } from '../services/auditService';
import { logger } from '../config/logger';

export const pp30Router = Router();

pp30Router.use(authenticate);

type VatTypeKey = 'vat7' | 'vatExempt' | 'vatZero';
const VAT_TYPES: VatTypeKey[] = ['vat7', 'vatExempt', 'vatZero'];

interface VatLine {
  totalExclVat: number;
  vat: number;
}

function emptyLine(): VatLine {
  return { totalExclVat: 0, vat: 0 };
}

function parseYearMonth(year: unknown, month: unknown): { from: Date; to: Date; period: string } | null {
  if (typeof year !== 'string' || typeof month !== 'string') return null;
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  const period = `${y}-${String(m).padStart(2, '0')}`;
  return { from, to, period };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function asNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === 'object' && value !== null && 'toString' in value
    ? Number((value as { toString(): string }).toString())
    : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function emptyWhtSummary(period: string) {
  const rateLabels: Record<string, string> = {
    '1': 'หัก ณ ที่จ่าย 1%',
    '3': 'หัก ณ ที่จ่าย 3%',
    '5': 'หัก ณ ที่จ่าย 5%',
  };
  const byRate = ['1', '3', '5'].map((rate) => ({
    rate,
    label: rateLabels[rate] ?? rate,
    count: 0,
    totalWithheld: 0,
    totalAmount: 0,
  }));
  return {
    period,
    data: {
      period,
      totalCertificates: 0,
      totalWithheld: 0,
      totalAmount: 0,
      byRate,
      certificates: [],
    },
  };
}

async function buildPp30(req: Express.Request extends never ? never : { user: NonNullable<Express.Request['user']> }, from: Date, to: Date) {
  const companyId = req.user.companyId;

  const [company, payload] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { nameTh: true, nameEn: true, taxId: true, branchCode: true },
    }),
    withRlsContext(prisma, tenantRlsContext(req.user), async (tx) => {
      const sales = await tx.invoice.findMany({
        where: {
          companyId,
          invoiceDate: { gte: from, lte: to },
          status: { in: ['approved', 'submitted'] },
        },
        select: {
          id: true,
          items: {
            select: {
              vatType: true,
              amount: true,
              vatAmount: true,
            },
          },
        },
      });
      const purchases = await tx.purchaseInvoice.findMany({
        where: {
          companyId,
          invoiceDate: { gte: from, lte: to },
        },
      });
      return { sales, purchases };
    }),
  ]);

  const salesByVat: Record<VatTypeKey, VatLine> = {
    vat7: emptyLine(),
    vatZero: emptyLine(),
    vatExempt: emptyLine(),
  };
  for (const inv of payload.sales) {
    for (const item of inv.items) {
      const key: VatTypeKey = VAT_TYPES.includes(item.vatType as VatTypeKey)
        ? (item.vatType as VatTypeKey)
        : 'vat7';
      salesByVat[key].totalExclVat += asNumber(item.amount);
      salesByVat[key].vat += asNumber(item.vatAmount);
    }
  }

  const purchasesByVat: Record<VatTypeKey, VatLine> = {
    vat7: emptyLine(),
    vatZero: emptyLine(),
    vatExempt: emptyLine(),
  };
  for (const p of payload.purchases) {
    const key: VatTypeKey = VAT_TYPES.includes(p.vatType as VatTypeKey)
      ? (p.vatType as VatTypeKey)
      : 'vat7';
    purchasesByVat[key].totalExclVat += asNumber(p.subtotal);
    purchasesByVat[key].vat += asNumber(p.vatAmount);
  }

  const totalSalesExclVat =
    salesByVat.vat7.totalExclVat + salesByVat.vatZero.totalExclVat + salesByVat.vatExempt.totalExclVat;
  const outputVat = salesByVat.vat7.vat;
  const inputVat = purchasesByVat.vat7.vat;
  const diff = outputVat - inputVat;
  const vatPayable = diff > 0 ? diff : 0;
  const vatRefundable = diff < 0 ? -diff : 0;

  return {
    company: company ?? { nameTh: '', nameEn: '', taxId: '', branchCode: '' },
    sales: {
      byVatType: {
        vat7: { totalExclVat: salesByVat.vat7.totalExclVat, vatAmount: salesByVat.vat7.vat },
        vatZero: { totalExclVat: salesByVat.vatZero.totalExclVat, vatAmount: salesByVat.vatZero.vat },
        vatExempt: { totalExclVat: salesByVat.vatExempt.totalExclVat, vatAmount: 0 },
      },
      totalExclVat: totalSalesExclVat,
      outputVat,
      totalInclVat: totalSalesExclVat + outputVat,
    },
    purchases: {
      byVatType: {
        vat7: { totalExclVat: purchasesByVat.vat7.totalExclVat, vatAmount: purchasesByVat.vat7.vat },
        vatZero: { totalExclVat: purchasesByVat.vatZero.totalExclVat, vatAmount: purchasesByVat.vatZero.vat },
        vatExempt: { totalExclVat: purchasesByVat.vatExempt.totalExclVat, vatAmount: 0 },
      },
      totalExclVat: purchasesByVat.vat7.totalExclVat + purchasesByVat.vatZero.totalExclVat + purchasesByVat.vatExempt.totalExclVat,
      inputVat,
      totalInclVat: (purchasesByVat.vat7.totalExclVat + purchasesByVat.vatZero.totalExclVat + purchasesByVat.vatExempt.totalExclVat) + inputVat,
    },
    summary: {
      totalSalesExclVat,
      outputVat,
      inputVat,
      vatPayable,
      vatRefundable,
    },
  };
}

/* ─── PP.30 monthly data ─── */
pp30Router.get('/', async (req, res) => {
  try {
    const range = parseYearMonth(req.query.year, req.query.month);
    if (!range) {
      res.status(400).json({ error: '`year` and `month` query parameters are required (e.g. year=2025&month=04)' });
      return;
    }

    const data = await buildPp30({ user: req.user! }, range.from, range.to);

    res.json({
      data: {
        period: range.period,
        ...data,
      },
    });
  } catch (err) {
    logger.error('Failed to compute PP.30', { error: err });
    res.status(500).json({ error: 'Failed to compute PP.30' });
  }
});

/* ─── Mark a period's PP.30 as filed (snapshot + Drive evidence) ─── */
const fileSchema = z.object({
  year: z.union([z.string(), z.number()]),
  month: z.union([z.string(), z.number()]),
  rdReference: z.string().trim().max(120).optional(),
  filedAt: z.string().optional(),
});

pp30Router.post('/file', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = fileSchema.parse(req.body);
    const range = parseYearMonth(String(body.year), String(body.month));
    if (!range) {
      res.status(400).json({ error: '`year` and `month` are required (e.g. year=2026, month=4)' });
      return;
    }

    const data = await buildPp30({ user: req.user! }, range.from, range.to);
    const snapshot = { period: range.period, ...data } as unknown as Prisma.InputJsonValue;
    const filedAt = body.filedAt ? new Date(body.filedAt) : new Date();

    const filing = await withRlsContext(prisma, tenantRlsContext(req.user!), (tx) => tx.vatFiling.upsert({
      where: { companyId_period: { companyId: req.user!.companyId, period: range.period } },
      create: {
        companyId: req.user!.companyId,
        period: range.period,
        filedAt,
        rdReference: body.rdReference ?? null,
        outputVat: data.summary.outputVat,
        inputVat: data.summary.inputVat,
        vatPayable: data.summary.vatPayable,
        vatRefundable: data.summary.vatRefundable,
        totalSalesExclVat: data.summary.totalSalesExclVat,
        snapshot,
        filedBy: req.user!.userId,
      },
      // Re-filing a period overwrites the snapshot and clears the old Drive
      // file id so syncVatFilingToDrive re-uploads the corrected return.
      update: {
        filedAt,
        rdReference: body.rdReference ?? null,
        outputVat: data.summary.outputVat,
        inputVat: data.summary.inputVat,
        vatPayable: data.summary.vatPayable,
        vatRefundable: data.summary.vatRefundable,
        totalSalesExclVat: data.summary.totalSalesExclVat,
        snapshot,
        filedBy: req.user!.userId,
        driveFileId: null,
        driveUrl: null,
      },
    }));

    await auditLog({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'vat_filing.file',
      resourceType: 'vat_filing',
      resourceId: filing.id,
      details: { period: range.period, vatPayable: data.summary.vatPayable, vatRefundable: data.summary.vatRefundable },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    void syncVatFilingToDrive(filing.id)
      .then(() => enqueueMasterSheetSync(req.user!.companyId))
      .catch((error) => logger.warn('Failed to sync PP.30 filing to Drive', { error, vatFilingId: filing.id }));
    void enqueueMasterSheetSync(req.user!.companyId);

    res.status(201).json({ data: filing });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to file PP.30', { error: err });
    res.status(500).json({ error: 'Failed to record PP.30 filing' });
  }
});

/* ─── List filed PP.30 periods ─── */
pp30Router.get('/filings', async (req, res) => {
  try {
    const filings = await withRlsContext(prisma, tenantRlsContext(req.user!), (tx) => tx.vatFiling.findMany({
      where: { companyId: req.user!.companyId },
      orderBy: { period: 'desc' },
      select: {
        id: true, period: true, filedAt: true, rdReference: true,
        outputVat: true, inputVat: true, vatPayable: true, vatRefundable: true,
        driveUrl: true, driveFolderUrl: true,
      },
    }));
    res.json({ data: filings });
  } catch (err) {
    logger.error('Failed to list PP.30 filings', { error: err });
    res.status(500).json({ error: 'Failed to list PP.30 filings' });
  }
});

/* ─── PP.30 WHT Summary ─── */
pp30Router.get('/wht', async (req, res) => {
  try {
    const range = parseYearMonth(req.query.year, req.query.month);
    if (!range) {
      res.status(400).json({ error: '`year` and `month` query parameters are required' });
      return;
    }

    const certs = await prisma.whtCertificate.findMany({
      where: {
        companyId: req.user!.companyId,
        paymentDate: { gte: range.from, lte: range.to },
      },
      orderBy: { paymentDate: 'asc' },
      select: {
        id: true,
        certificateNumber: true,
        whtRate: true,
        whtAmount: true,
        totalAmount: true,
        recipientName: true,
        recipientTaxId: true,
        paymentDate: true,
      },
    }).catch((err) => {
      logger.error('pp30/wht certificates query failed; returning empty summary', err);
      return null;
    });

    if (!certs) {
      res.json(emptyWhtSummary(range.period));
      return;
    }

    // Group by rate
    const byRate: Record<string, { count: number; totalWithheld: number; totalAmount: number }> = {
      '1': { count: 0, totalWithheld: 0, totalAmount: 0 },
      '3': { count: 0, totalWithheld: 0, totalAmount: 0 },
      '5': { count: 0, totalWithheld: 0, totalAmount: 0 },
    };
    for (const cert of certs) {
      const r = cert.whtRate;
      if (byRate[r]) {
        byRate[r].count += 1;
        byRate[r].totalWithheld += asNumber(cert.whtAmount);
        byRate[r].totalAmount += asNumber(cert.totalAmount);
      }
    }

    const totalCertificates = certs.length;
    const totalWithheld = certs.reduce<number>((s, c) => s + asNumber(c.whtAmount), 0);
    const totalAmount = certs.reduce<number>((s, c) => s + asNumber(c.totalAmount), 0);

    const rateLabels: Record<string, string> = {
      '1': 'หัก ณ ที่จ่าย 1%',
      '3': 'หัก ณ ที่จ่าย 3%',
      '5': 'หัก ณ ที่จ่าย 5%',
    };

    res.json({
      period: range.period,
      data: {
        period: range.period,
        totalCertificates,
        totalWithheld,
        totalAmount,
        byRate: Object.entries(byRate).map(([rate, data]) => ({
          rate,
          label: rateLabels[rate] ?? rate,
          count: data.count,
          totalWithheld: Math.round(data.totalWithheld * 100) / 100,
          totalAmount: Math.round(data.totalAmount * 100) / 100,
        })),
        certificates: certs.map((c) => ({
          id: c.id,
          certificateNumber: c.certificateNumber,
          whtRate: c.whtRate,
          whtAmount: asNumber(c.whtAmount),
          totalAmount: asNumber(c.totalAmount),
          recipientName: c.recipientName,
          recipientTaxId: c.recipientTaxId,
          paymentDate: c.paymentDate.toISOString(),
        })),
      },
    });
  } catch (err) {
    logger.error('pp30/wht error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── PP.30 CSV export ─── */
pp30Router.get('/export/sheets', async (req, res) => {
  try {
    const range = parseYearMonth(req.query.year, req.query.month);
    if (!range) {
      res.status(400).json({ error: '`year` and `month` query parameters are required' });
      return;
    }

    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'export_google_sheets')) {
      res.status(403).json({ error: 'Upgrade to Business or Enterprise to export PP.30 to Google Sheets' });
      return;
    }

    const data = await buildPp30({ user: req.user! }, range.from, range.to);
    const url = await exportPp30ToSheets({ period: range.period, ...data });
    res.json({ url });
  } catch (err) {
    logger.error('Failed to export PP.30 to Google Sheets', { error: err });
    res.status(500).json({ error: 'Failed to export PP.30 to Google Sheets' });
  }
});

pp30Router.get('/export', async (req, res) => {
  try {
    const range = parseYearMonth(req.query.year, req.query.month);
    if (!range) {
      res.status(400).json({ error: '`year` and `month` query parameters are required' });
      return;
    }

    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'export_excel')) {
      res.status(403).json({ error: 'Upgrade your plan to export PP.30 reports' });
      return;
    }

    const data = await buildPp30({ user: req.user! }, range.from, range.to);

    const lines: string[] = [];
    lines.push(['Field', 'Value'].map(csvEscape).join(','));
    lines.push(['Period', range.period].map(csvEscape).join(','));
    lines.push(['Company Name (TH)', data.company.nameTh ?? ''].map(csvEscape).join(','));
    lines.push(['Company Tax ID', data.company.taxId ?? ''].map(csvEscape).join(','));
    lines.push(['Branch Code', data.company.branchCode ?? ''].map(csvEscape).join(','));
    lines.push('');
    lines.push(['Sales — Category', 'Total Excl. VAT', 'VAT'].map(csvEscape).join(','));
    lines.push(['VAT 7%', data.sales.byVatType.vat7.totalExclVat, data.sales.byVatType.vat7.vatAmount].map(csvEscape).join(','));
    lines.push(['VAT 0% (Zero-rated)', data.sales.byVatType.vatZero.totalExclVat, data.sales.byVatType.vatZero.vatAmount].map(csvEscape).join(','));
    lines.push(['VAT Exempt', data.sales.byVatType.vatExempt.totalExclVat, ''].map(csvEscape).join(','));
    lines.push('');
    lines.push(['Purchases — Category', 'Total Excl. VAT', 'VAT'].map(csvEscape).join(','));
    lines.push(['VAT 7%', data.purchases.byVatType.vat7.totalExclVat, data.purchases.byVatType.vat7.vatAmount].map(csvEscape).join(','));
    lines.push('');
    lines.push(['Summary', 'Amount'].map(csvEscape).join(','));
    lines.push(['Total Sales Excl. VAT', data.summary.totalSalesExclVat].map(csvEscape).join(','));
    lines.push(['Output VAT', data.summary.outputVat].map(csvEscape).join(','));
    lines.push(['Input VAT', data.summary.inputVat].map(csvEscape).join(','));
    lines.push(['VAT Payable', data.summary.vatPayable].map(csvEscape).join(','));
    lines.push(['VAT Refundable', data.summary.vatRefundable].map(csvEscape).join(','));

    const csv = '﻿' + lines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pp30-${range.period}.csv"`);
    res.send(csv);
  } catch (err) {
    logger.error('Failed to export PP.30', { error: err });
    res.status(500).json({ error: 'Failed to export PP.30' });
  }
});
