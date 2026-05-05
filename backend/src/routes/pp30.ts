import { Router } from 'express';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { authenticate } from '../middleware/auth';
import {
  hasFeatureAccess,
  resolveCompanyAccessPolicy,
} from '../services/accessPolicyService';
import { exportPp30ToSheets } from '../services/googleSheetsService';
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
        include: { items: true },
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
      salesByVat[key].totalExclVat += item.amount;
      salesByVat[key].vat += item.vatAmount;
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
    purchasesByVat[key].totalExclVat += p.subtotal;
    purchasesByVat[key].vat += p.vatAmount;
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
    });

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
        byRate[r].totalWithheld += cert.whtAmount;
        byRate[r].totalAmount += cert.totalAmount;
      }
    }

    const totalCertificates = certs.length;
    const totalWithheld = certs.reduce<number>((s, c) => s + c.whtAmount, 0);
    const totalAmount = certs.reduce<number>((s, c) => s + c.totalAmount, 0);

    // Income type labels (มาตรา 40)
    const incomeTypeLabels: Record<string, string> = {
      '1': 'มาตรา 40(1) — เงินได้จากการจ้าง',
      '2': 'มาตรา 40(2) — เงินได้จากทรัพย์สิน',
      '4': 'มาตรา 40(4) — เงินได้จากการรับจ้าง/นายหน้า',
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
          label: incomeTypeLabels[rate] ?? rate,
          count: data.count,
          totalWithheld: Math.round(data.totalWithheld * 100) / 100,
          totalAmount: Math.round(data.totalAmount * 100) / 100,
        })),
        certificates: certs.map((c) => ({
          id: c.id,
          certificateNumber: c.certificateNumber,
          whtRate: c.whtRate,
          whtAmount: c.whtAmount,
          totalAmount: c.totalAmount,
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
