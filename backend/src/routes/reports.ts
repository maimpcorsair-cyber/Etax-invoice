import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { withRlsContext, tenantRlsContext } from '../config/rls';

// SME-grade financial reports — Profit & Loss and a simplified Balance
// Sheet. Both aggregate over existing Invoice / PurchaseInvoice /
// ExpenseVoucher rows; they do NOT require a separate journal model
// (full double-entry accounting is out of scope — this is the "show me
// my profit" answer that competitors like FlowAccount and PEAK lead with).
//
// All math is naïve sum of recorded amounts. Cancelled / rejected docs
// are excluded. Project filter is supported so service businesses can
// see per-project P&L alongside company-wide.

export const reportsRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  projectId: z.string().optional(),
});

function parseDateRange(query: unknown): { from: Date; to: Date; projectId?: string } {
  const parsed = dateRangeSchema.parse(query);
  // Default to current month if not provided.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    from: parsed.from ? new Date(`${parsed.from}T00:00:00.000Z`) : monthStart,
    to: parsed.to ? new Date(`${parsed.to}T23:59:59.999Z`) : monthEnd,
    projectId: parsed.projectId,
  };
}

// ── GET /api/reports/p-and-l ─────────────────────────────────────────

reportsRouter.get('/p-and-l', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const { from, to, projectId } = parseDateRange(req.query);

    const result = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      // Revenue: invoices issued within range, excluding cancelled/rejected.
      // We use `subtotal` (pre-VAT) as revenue — VAT belongs in its own bucket.
      const invoices = await tx.invoice.findMany({
        where: {
          companyId,
          ...(projectId ? { projectId } : {}),
          invoiceDate: { gte: from, lte: to },
          status: { notIn: ['cancelled', 'rejected'] },
        },
        select: { type: true, subtotal: true, vatAmount: true, total: true, status: true },
      });

      // Cost: purchase invoices in range. We don't have a goods/services
      // split on the model so all purchases are treated as cost — the user
      // can categorise into COGS vs opex through `category` later if they
      // need more rigorous P&L breakdown.
      const purchases = await tx.purchaseInvoice.findMany({
        where: {
          companyId,
          ...(projectId ? { projectId } : {}),
          invoiceDate: { gte: from, lte: to },
        },
        select: { subtotal: true, vatAmount: true, total: true, category: true },
      });

      // Operating expenses: petty-cash vouchers. Reject rejected ones.
      const expenses = await tx.expenseVoucher.findMany({
        where: {
          companyId,
          ...(projectId ? { projectId } : {}),
          voucherDate: { gte: from, lte: to },
          status: { not: 'rejected' },
        },
        select: { totalAmount: true, items: { select: { category: true, amount: true } } },
      });

      return { invoices, purchases, expenses };
    });

    // ── Revenue ──
    const revenueByType: Record<string, number> = {};
    let revenueGross = 0;
    let outputVat = 0;
    for (const inv of result.invoices) {
      const sub = inv.subtotal ?? 0;
      revenueGross += sub;
      outputVat += inv.vatAmount ?? 0;
      revenueByType[inv.type] = (revenueByType[inv.type] ?? 0) + sub;
    }

    // ── COGS (purchases) ──
    let cogsTotal = 0;
    let inputVat = 0;
    const cogsByCategory: Record<string, number> = {};
    for (const p of result.purchases) {
      const sub = p.subtotal ?? 0;
      cogsTotal += sub;
      inputVat += p.vatAmount ?? 0;
      const cat = (p.category ?? 'uncategorized').toLowerCase();
      cogsByCategory[cat] = (cogsByCategory[cat] ?? 0) + sub;
    }

    // ── Operating expenses ──
    let opexTotal = 0;
    const opexByCategory: Record<string, number> = {};
    for (const ev of result.expenses) {
      opexTotal += Number(ev.totalAmount ?? 0);
      for (const item of ev.items) {
        const cat = (item.category ?? 'uncategorized').toLowerCase();
        opexByCategory[cat] = (opexByCategory[cat] ?? 0) + Number(item.amount ?? 0);
      }
    }

    const grossProfit = revenueGross - cogsTotal;
    const operatingProfit = grossProfit - opexTotal;
    const netVatPayable = outputVat - inputVat;

    res.json({
      data: {
        period: { from: from.toISOString(), to: to.toISOString() },
        projectId: projectId ?? null,
        revenue: { gross: revenueGross, byType: revenueByType, invoiceCount: result.invoices.length },
        cogs: { total: cogsTotal, byCategory: cogsByCategory, purchaseCount: result.purchases.length },
        grossProfit,
        grossMargin: revenueGross > 0 ? grossProfit / revenueGross : 0,
        operatingExpenses: { total: opexTotal, byCategory: opexByCategory, voucherCount: result.expenses.length },
        operatingProfit,
        operatingMargin: revenueGross > 0 ? operatingProfit / revenueGross : 0,
        vat: { collected: outputVat, paid: inputVat, netPayable: netVatPayable },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query', details: err.issues });
      return;
    }
    logger.error('p-and-l report failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to build P&L' });
  }
});

// ── GET /api/reports/balance-sheet ───────────────────────────────────

const balanceSheetSchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

reportsRouter.get('/balance-sheet', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const parsed = balanceSheetSchema.parse(req.query);
    const asOf = parsed.asOf ? new Date(`${parsed.asOf}T23:59:59.999Z`) : new Date();

    const result = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      // Accounts receivable: invoices issued by asOf, not paid yet, not cancelled.
      const arInvoices = await tx.invoice.findMany({
        where: {
          companyId,
          invoiceDate: { lte: asOf },
          status: { notIn: ['cancelled', 'rejected'] },
          isPaid: false,
        },
        select: { total: true, dueDate: true, invoiceDate: true },
      });

      // Accounts payable: purchase invoices recorded by asOf, not paid.
      const apPurchases = await tx.purchaseInvoice.findMany({
        where: {
          companyId,
          invoiceDate: { lte: asOf },
          isPaid: false,
        },
        select: { total: true, dueDate: true, invoiceDate: true },
      });

      // VAT position: cumulative output - input up to asOf. Cancelled
      // docs excluded since their VAT was never reported.
      const [outputAgg, inputAgg] = await Promise.all([
        tx.invoice.aggregate({
          where: { companyId, invoiceDate: { lte: asOf }, status: { notIn: ['cancelled', 'rejected'] } },
          _sum: { vatAmount: true },
        }),
        tx.purchaseInvoice.aggregate({
          where: { companyId, invoiceDate: { lte: asOf } },
          _sum: { vatAmount: true },
        }),
      ]);

      return { arInvoices, apPurchases, outputAgg, inputAgg };
    });

    const arTotal = result.arInvoices.reduce((s, i) => s + (i.total ?? 0), 0);
    const apTotal = result.apPurchases.reduce((s, p) => s + (p.total ?? 0), 0);
    const outputVat = result.outputAgg._sum.vatAmount ?? 0;
    const inputVat = result.inputAgg._sum.vatAmount ?? 0;
    const vatPayable = Math.max(0, outputVat - inputVat);

    // Aging buckets on AR (audit-friendly)
    const today = new Date();
    const arAging = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 };
    for (const inv of result.arInvoices) {
      const dueRef = inv.dueDate ?? inv.invoiceDate;
      const daysOverdue = Math.floor((today.getTime() - new Date(dueRef).getTime()) / 86400_000);
      const total = inv.total ?? 0;
      if (daysOverdue <= 0) arAging.current += total;
      else if (daysOverdue <= 30) arAging.days1_30 += total;
      else if (daysOverdue <= 60) arAging.days31_60 += total;
      else if (daysOverdue <= 90) arAging.days61_90 += total;
      else arAging.days90plus += total;
    }

    // Simplified balance sheet: Assets - Liabilities = Equity.
    // Bank cash is left at 0 — v1 doesn't read bank statements yet
    // (Phase 2.3 will reconcile). User can add a manual cash entry later.
    const totalAssets = arTotal; // cash placeholder = 0
    const totalLiabilities = apTotal + vatPayable;
    const equity = totalAssets - totalLiabilities;

    res.json({
      data: {
        asOf: asOf.toISOString(),
        assets: {
          accountsReceivable: arTotal,
          accountsReceivableAging: arAging,
          cash: 0, // placeholder until bank reconciliation lands
          total: totalAssets,
        },
        liabilities: {
          accountsPayable: apTotal,
          vatPayable,
          total: totalLiabilities,
        },
        equity,
        notes: [
          'Cash is set to 0 until bank reconciliation is wired (Phase 2.3).',
          'Equity = Assets − Liabilities; no separate retained earnings tracking yet.',
        ],
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query', details: err.issues });
      return;
    }
    logger.error('balance-sheet report failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to build balance sheet' });
  }
});
