import { Router } from 'express';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { authenticate } from '../middleware/auth';
import {
  hasFeatureAccess,
  resolveCompanyAccessPolicy,
} from '../services/accessPolicyService';
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
      vat7: { totalExclVat: salesByVat.vat7.totalExclVat, vat: salesByVat.vat7.vat },
      vatZero: { totalExclVat: salesByVat.vatZero.totalExclVat, vat: salesByVat.vatZero.vat },
      vatExempt: { totalExclVat: salesByVat.vatExempt.totalExclVat },
    },
    purchases: {
      vat7: { totalExclVat: purchasesByVat.vat7.totalExclVat, vat: purchasesByVat.vat7.vat },
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

/* ─── PP.30 CSV export ─── */
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

    const format = (req.query.format === 'csv' || !req.query.format ? 'csv' : 'csv') as 'csv';
    void format;

    const data = await buildPp30({ user: req.user! }, range.from, range.to);

    const lines: string[] = [];
    lines.push(['Field', 'Value'].map(csvEscape).join(','));
    lines.push(['Period', range.period].map(csvEscape).join(','));
    lines.push(['Company Name (TH)', data.company.nameTh ?? ''].map(csvEscape).join(','));
    lines.push(['Company Tax ID', data.company.taxId ?? ''].map(csvEscape).join(','));
    lines.push(['Branch Code', data.company.branchCode ?? ''].map(csvEscape).join(','));
    lines.push('');
    lines.push(['Sales — Category', 'Total Excl. VAT', 'VAT'].map(csvEscape).join(','));
    lines.push(['VAT 7%', data.sales.vat7.totalExclVat, data.sales.vat7.vat].map(csvEscape).join(','));
    lines.push(['VAT 0% (Zero-rated)', data.sales.vatZero.totalExclVat, data.sales.vatZero.vat].map(csvEscape).join(','));
    lines.push(['VAT Exempt', data.sales.vatExempt.totalExclVat, ''].map(csvEscape).join(','));
    lines.push('');
    lines.push(['Purchases — Category', 'Total Excl. VAT', 'VAT'].map(csvEscape).join(','));
    lines.push(['VAT 7%', data.purchases.vat7.totalExclVat, data.purchases.vat7.vat].map(csvEscape).join(','));
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
