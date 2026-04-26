import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { authenticate } from '../middleware/auth';
import {
  hasFeatureAccess,
  resolveCompanyAccessPolicy,
} from '../services/accessPolicyService';
import { logger } from '../config/logger';

export const vatSummaryRouter = Router();

vatSummaryRouter.use(authenticate);

type VatTypeKey = 'vat7' | 'vatExempt' | 'vatZero';
const VAT_TYPES: VatTypeKey[] = ['vat7', 'vatExempt', 'vatZero'];

interface VatBucket {
  count: number;
  totalExclVat: number;
  vat: number;
  totalInclVat: number;
}

function emptyBucket(): VatBucket {
  return { count: 0, totalExclVat: 0, vat: 0, totalInclVat: 0 };
}

function emptyByVatType(): Record<VatTypeKey, VatBucket> {
  return {
    vat7: emptyBucket(),
    vatExempt: emptyBucket(),
    vatZero: emptyBucket(),
  };
}

function parseRange(req: { query: Record<string, unknown> }): { from: Date; to: Date; fromStr: string; toStr: string } | null {
  const fromStr = typeof req.query.from === 'string' ? req.query.from : '';
  const toStr = typeof req.query.to === 'string' ? req.query.to : '';
  if (!fromStr || !toStr) return null;
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  // Make `to` inclusive of the entire day
  to.setHours(23, 59, 59, 999);
  return { from, to, fromStr, toStr };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const headerLine = headers.map(csvEscape).join(',');
  const bodyLines = rows.map((row) => row.map(csvEscape).join(','));
  // BOM for Excel UTF-8
  return '﻿' + [headerLine, ...bodyLines].join('\n');
}

/* ─── VAT Summary (sales + purchases) ─── */
vatSummaryRouter.get('/', async (req, res) => {
  try {
    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: 'Both `from` and `to` query parameters (YYYY-MM-DD) are required' });
      return;
    }
    const { from, to, fromStr, toStr } = range;
    const companyId = req.user!.companyId;

    const { sales, purchases } = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const salesInvoices = await tx.invoice.findMany({
        where: {
          companyId,
          invoiceDate: { gte: from, lte: to },
          status: { in: ['approved', 'submitted'] },
        },
        include: { items: true },
      });

      const purchaseInvoices = await tx.purchaseInvoice.findMany({
        where: {
          companyId,
          invoiceDate: { gte: from, lte: to },
        },
      });

      return { sales: salesInvoices, purchases: purchaseInvoices };
    });

    // Sales aggregation: invoice-level totals + by-vat-type breakdown via items
    const salesByVatType = emptyByVatType();
    let salesTotalExclVat = 0;
    let salesOutputVat = 0;
    let salesTotalInclVat = 0;

    for (const inv of sales) {
      salesTotalExclVat += inv.subtotal;
      salesOutputVat += inv.vatAmount;
      salesTotalInclVat += inv.total;

      // Group by vatType using items (each line carries its own vatType)
      for (const item of inv.items) {
        const key = (VAT_TYPES.includes(item.vatType as VatTypeKey) ? item.vatType : 'vat7') as VatTypeKey;
        const bucket = salesByVatType[key];
        bucket.totalExclVat += item.amount;
        bucket.vat += item.vatAmount;
        bucket.totalInclVat += item.totalAmount;
      }
    }
    // Count = number of invoices that contain at least one item of that vatType
    for (const inv of sales) {
      const seen = new Set<VatTypeKey>();
      for (const item of inv.items) {
        const key = (VAT_TYPES.includes(item.vatType as VatTypeKey) ? item.vatType : 'vat7') as VatTypeKey;
        if (!seen.has(key)) {
          salesByVatType[key].count += 1;
          seen.add(key);
        }
      }
    }

    // Purchases aggregation
    const purchasesByVatType = emptyByVatType();
    let purchasesTotalExclVat = 0;
    let purchasesInputVat = 0;
    let purchasesTotalInclVat = 0;

    for (const p of purchases) {
      purchasesTotalExclVat += p.subtotal;
      purchasesInputVat += p.vatAmount;
      purchasesTotalInclVat += p.total;

      const key = (VAT_TYPES.includes(p.vatType as VatTypeKey) ? p.vatType : 'vat7') as VatTypeKey;
      const bucket = purchasesByVatType[key];
      bucket.count += 1;
      bucket.totalExclVat += p.subtotal;
      bucket.vat += p.vatAmount;
      bucket.totalInclVat += p.total;
    }

    const vatPayable = salesOutputVat - purchasesInputVat;

    res.json({
      data: {
        period: { from: fromStr, to: toStr },
        sales: {
          count: sales.length,
          totalExclVat: salesTotalExclVat,
          outputVat: salesOutputVat,
          totalInclVat: salesTotalInclVat,
          byVatType: salesByVatType,
        },
        purchases: {
          count: purchases.length,
          totalExclVat: purchasesTotalExclVat,
          inputVat: purchasesInputVat,
          totalInclVat: purchasesTotalInclVat,
          byVatType: purchasesByVatType,
        },
        vatPayable,
      },
    });
  } catch (err) {
    logger.error('Failed to compute VAT summary', { error: err });
    res.status(500).json({ error: 'Failed to compute VAT summary' });
  }
});

/* ─── Sales detail ─── */
vatSummaryRouter.get('/sales-detail', async (req, res) => {
  try {
    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: 'Both `from` and `to` query parameters (YYYY-MM-DD) are required' });
      return;
    }
    const { from, to, fromStr, toStr } = range;
    const format = (req.query.format === 'excel' ? 'excel' : 'json') as 'excel' | 'json';

    if (format === 'excel') {
      const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
      if (!hasFeatureAccess(policy, 'export_excel')) {
        res.status(403).json({ error: 'Upgrade your plan to export VAT reports' });
        return;
      }
    }

    const invoices = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.invoice.findMany({
        where: {
          companyId: req.user!.companyId,
          invoiceDate: { gte: from, lte: to },
          status: { in: ['approved', 'submitted'] },
        },
        orderBy: { invoiceDate: 'asc' },
        include: {
          buyer: { select: { nameTh: true, nameEn: true, taxId: true } },
          items: true,
        },
      });
    });

    type Row = {
      invoiceNumber: string;
      invoiceDate: string;
      customerName: string;
      customerTaxId: string;
      description: string;
      subtotal: number;
      vatAmount: number;
      total: number;
      vatType: string;
    };

    const rows: Row[] = invoices.map((inv) => {
      // Pick predominant vatType: vat7 if any item has it, else vatZero, else vatExempt
      const vatTypes = new Set(inv.items.map((i) => i.vatType));
      let vatType = 'vat7';
      if (vatTypes.has('vat7')) vatType = 'vat7';
      else if (vatTypes.has('vatZero')) vatType = 'vatZero';
      else if (vatTypes.has('vatExempt')) vatType = 'vatExempt';

      const description = inv.items
        .map((i) => i.nameTh || i.nameEn || '')
        .filter(Boolean)
        .join('; ');

      return {
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate.toISOString().slice(0, 10),
        customerName: inv.buyer.nameTh ?? inv.buyer.nameEn ?? '',
        customerTaxId: inv.buyer.taxId ?? '',
        description,
        subtotal: inv.subtotal,
        vatAmount: inv.vatAmount,
        total: inv.total,
        vatType,
      };
    });

    if (format === 'excel') {
      const headers = [
        'Invoice Number',
        'Invoice Date',
        'Customer Name',
        'Customer Tax ID',
        'Description',
        'Subtotal',
        'VAT Amount',
        'Total',
        'VAT Type',
      ];
      const csv = toCsv(
        headers,
        rows.map((r) => [
          r.invoiceNumber,
          r.invoiceDate,
          r.customerName,
          r.customerTaxId,
          r.description,
          r.subtotal,
          r.vatAmount,
          r.total,
          r.vatType,
        ]),
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sales-vat-${fromStr}-${toStr}.csv"`);
      res.send(csv);
      return;
    }

    res.json({ data: rows, period: { from: fromStr, to: toStr } });
  } catch (err) {
    logger.error('Failed to fetch sales detail', { error: err });
    res.status(500).json({ error: 'Failed to fetch sales detail' });
  }
});

/* ─── Purchase detail ─── */
vatSummaryRouter.get('/purchase-detail', async (req, res) => {
  try {
    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: 'Both `from` and `to` query parameters (YYYY-MM-DD) are required' });
      return;
    }
    const { from, to, fromStr, toStr } = range;
    const format = (req.query.format === 'excel' ? 'excel' : 'json') as 'excel' | 'json';

    if (format === 'excel') {
      const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
      if (!hasFeatureAccess(policy, 'export_excel')) {
        res.status(403).json({ error: 'Upgrade your plan to export VAT reports' });
        return;
      }
    }

    const purchases = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.purchaseInvoice.findMany({
        where: {
          companyId: req.user!.companyId,
          invoiceDate: { gte: from, lte: to },
        },
        orderBy: { invoiceDate: 'asc' },
      });
    });

    const rows = purchases.map((p) => ({
      supplierName: p.supplierName,
      supplierTaxId: p.supplierTaxId,
      invoiceNumber: p.invoiceNumber,
      invoiceDate: p.invoiceDate.toISOString().slice(0, 10),
      description: p.description ?? '',
      subtotal: p.subtotal,
      vatAmount: p.vatAmount,
      total: p.total,
      vatType: p.vatType,
    }));

    if (format === 'excel') {
      const headers = [
        'Supplier Name',
        'Supplier Tax ID',
        'Invoice Number',
        'Invoice Date',
        'Description',
        'Subtotal',
        'VAT Amount',
        'Total',
        'VAT Type',
      ];
      const csv = toCsv(
        headers,
        rows.map((r) => [
          r.supplierName,
          r.supplierTaxId,
          r.invoiceNumber,
          r.invoiceDate,
          r.description,
          r.subtotal,
          r.vatAmount,
          r.total,
          r.vatType,
        ]),
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="purchase-vat-${fromStr}-${toStr}.csv"`);
      res.send(csv);
      return;
    }

    res.json({ data: rows, period: { from: fromStr, to: toStr } });
  } catch (err) {
    logger.error('Failed to fetch purchase detail', { error: err });
    res.status(500).json({ error: 'Failed to fetch purchase detail' });
  }
});

// Suppress unused-import warning for Prisma if tree-shaken
void Prisma;
