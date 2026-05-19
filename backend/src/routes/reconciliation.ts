import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { withRlsContext, tenantRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';

// Lean bank reconciliation MVP — the third gap from STRATEGY.md Phase 2.
// Doesn't try to be a full ledger; the 80/20 is "I uploaded my bank
// statement CSV; tell me which invoices got paid."
//
// Flow:
//   1. POST /parse — multipart CSV upload, returns parsed transactions
//      and a list of suggested matches (Invoice for credits, Purchase
//      for debits). Stateless — no DB row created at this step.
//   2. POST /match — frontend confirms one match; backend creates a
//      Payment row (for Invoice) or sets isPaid=true (for Purchase).
//
// CSV format is auto-detected from headers — most Thai banks export a
// shape like Date,Description,Debit,Credit,Balance. We look for keywords
// rather than fixed positions so a variety of banks work without config.

export const reconciliationRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — bank CSVs are tiny
});

// ── CSV parsing ──────────────────────────────────────────────────────

interface ParsedTxn {
  rowIndex: number;
  date: string;          // ISO YYYY-MM-DD
  description: string;
  debit: number;         // money out
  credit: number;        // money in
}

// Very forgiving — strips quotes/whitespace, accepts comma OR tab.
function splitCsvLine(line: string): string[] {
  // Handles quoted fields with embedded commas.
  const out: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (c === '"') inQuote = false;
      else current += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',' || c === '\t') { out.push(current); current = ''; }
      else current += c;
    }
  }
  out.push(current);
  return out.map((s) => s.trim());
}

function detectColumnIndexes(header: string[]): {
  date: number; description: number; debit: number; credit: number;
} {
  const norm = header.map((h) => h.toLowerCase().replace(/[^a-z0-9ก-๙]/g, ''));
  const find = (candidates: string[]) => {
    for (const cand of candidates) {
      const idx = norm.findIndex((h) => h.includes(cand));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    date: find(['date', 'วันที่', 'transactiondate', 'txndate']),
    description: find(['description', 'รายการ', 'detail', 'narrative', 'remark']),
    debit: find(['debit', 'withdraw', 'ถอน', 'จ่าย', 'out']),
    credit: find(['credit', 'deposit', 'ฝาก', 'รับ', 'in']),
  };
}

function parseAmount(raw: string): number {
  if (!raw) return 0;
  // Strip commas, currency symbols, parens (some banks use parens for negative)
  const cleaned = raw.replace(/[,฿\s]/g, '').replace(/\((.+)\)/, '-$1');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // Try ISO, Thai DD/MM/YYYY (Buddhist), Western DD/MM/YYYY
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(raw);
  if (dmy) {
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543; // Buddhist Era → CE
    return `${year}-${String(parseInt(dmy[2], 10)).padStart(2, '0')}-${String(parseInt(dmy[1], 10)).padStart(2, '0')}`;
  }
  return null;
}

function parseCsv(buffer: Buffer): ParsedTxn[] {
  const text = buffer.toString('utf8').replace(/^﻿/, ''); // strip BOM
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]);
  const cols = detectColumnIndexes(header);
  if (cols.date < 0) {
    // Fallback: assume Date,Description,Debit,Credit positional order.
    cols.date = 0; cols.description = 1; cols.debit = 2; cols.credit = 3;
  }

  const out: ParsedTxn[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const date = parseDate(cells[cols.date] ?? '');
    if (!date) continue;
    const desc = (cells[cols.description] ?? '').toString();
    const debit = cols.debit >= 0 ? parseAmount(cells[cols.debit] ?? '') : 0;
    const credit = cols.credit >= 0 ? parseAmount(cells[cols.credit] ?? '') : 0;
    if (debit === 0 && credit === 0) continue;
    out.push({ rowIndex: i, date, description: desc, debit, credit });
  }
  return out;
}

// ── Matching heuristic ───────────────────────────────────────────────

interface MatchSuggestion {
  kind: 'invoice' | 'purchase';
  id: string;
  invoiceNumber: string;
  partyName: string;
  total: number;
  invoiceDate: string;
  score: number; // 0..1 (higher = better)
}

function scoreMatch(txnDate: string, txnAmount: number, txnDesc: string, docDate: Date, docTotal: number, partyName: string): number {
  // Amount: must match within 1 baht (or 1% for larger amounts)
  const amountDiff = Math.abs(txnAmount - docTotal);
  const amountTol = Math.max(1, docTotal * 0.01);
  if (amountDiff > amountTol) return 0;
  const amountScore = 1 - (amountDiff / amountTol);

  // Date proximity — penalise > 14 days
  const dayDiff = Math.abs((new Date(txnDate).getTime() - docDate.getTime()) / 86400_000);
  if (dayDiff > 14) return 0;
  const dateScore = 1 - (dayDiff / 14);

  // Party name fuzzy match — substring of either way
  const descLower = txnDesc.toLowerCase();
  const partyLower = partyName.toLowerCase().slice(0, 12); // first chunk
  const nameScore = partyLower && descLower.includes(partyLower) ? 1 : 0;

  // Weighted: amount > date > name
  return amountScore * 0.6 + dateScore * 0.3 + nameScore * 0.1;
}

// ── POST /api/reconciliation/parse ───────────────────────────────────

reconciliationRouter.post(
  '/parse',
  requireRole('admin', 'super_admin', 'accountant'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'CSV file is required (multipart field: file)' });
        return;
      }
      const txns = parseCsv(req.file.buffer);
      if (txns.length === 0) {
        res.status(400).json({ error: 'No transactions found — check CSV header has Date/Debit/Credit columns' });
        return;
      }

      const companyId = req.user!.companyId;
      // Pull unpaid invoices + purchases within the same date window as
      // the CSV to keep the join small.
      const dates = txns.map((t) => t.date).sort();
      const fromDate = new Date(`${dates[0]}T00:00:00.000Z`);
      const toDate = new Date(`${dates[dates.length - 1]}T23:59:59.999Z`);
      const windowStart = new Date(fromDate.getTime() - 30 * 86400_000);
      const windowEnd = new Date(toDate.getTime() + 30 * 86400_000);

      const { unpaidInvoices, unpaidPurchases } = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        const [invoices, purchases] = await Promise.all([
          tx.invoice.findMany({
            where: {
              companyId,
              isPaid: false,
              status: { notIn: ['cancelled', 'rejected'] },
              invoiceDate: { gte: windowStart, lte: windowEnd },
            },
            include: { buyer: { select: { nameTh: true, nameEn: true } } },
          }),
          tx.purchaseInvoice.findMany({
            where: {
              companyId,
              isPaid: false,
              invoiceDate: { gte: windowStart, lte: windowEnd },
            },
          }),
        ]);
        return { unpaidInvoices: invoices, unpaidPurchases: purchases };
      });

      const matched = txns.map((txn) => {
        const suggestions: MatchSuggestion[] = [];
        if (txn.credit > 0) {
          for (const inv of unpaidInvoices) {
            const partyName = inv.buyer?.nameTh || inv.buyer?.nameEn || '';
            const score = scoreMatch(txn.date, txn.credit, txn.description, inv.invoiceDate, inv.total, partyName);
            if (score > 0) {
              suggestions.push({
                kind: 'invoice', id: inv.id, invoiceNumber: inv.invoiceNumber,
                partyName, total: inv.total, invoiceDate: inv.invoiceDate.toISOString().slice(0, 10), score,
              });
            }
          }
        }
        if (txn.debit > 0) {
          for (const p of unpaidPurchases) {
            const score = scoreMatch(txn.date, txn.debit, txn.description, p.invoiceDate, p.total, p.supplierName);
            if (score > 0) {
              suggestions.push({
                kind: 'purchase', id: p.id, invoiceNumber: p.invoiceNumber,
                partyName: p.supplierName, total: p.total, invoiceDate: p.invoiceDate.toISOString().slice(0, 10), score,
              });
            }
          }
        }
        suggestions.sort((a, b) => b.score - a.score);
        return { ...txn, suggestions: suggestions.slice(0, 3) };
      });

      res.json({
        data: {
          transactionCount: txns.length,
          autoMatchedCount: matched.filter((t) => t.suggestions[0]?.score && t.suggestions[0].score > 0.85).length,
          transactions: matched,
        },
      });
    } catch (err) {
      logger.error('reconciliation parse failed', { err: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: 'Failed to parse bank statement' });
    }
  },
);

// ── POST /api/reconciliation/match ───────────────────────────────────

const matchSchema = z.object({
  kind: z.enum(['invoice', 'purchase']),
  documentId: z.string().min(1),
  amount: z.number().positive(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().max(200).optional(),
});

reconciliationRouter.post(
  '/match',
  requireRole('admin', 'super_admin', 'accountant'),
  async (req, res) => {
    try {
      const body = matchSchema.parse(req.body);
      const companyId = req.user!.companyId;

      if (body.kind === 'invoice') {
        // Create a Payment row + mark invoice paid if fully covered.
        const invoice = await prisma.invoice.findFirst({
          where: { id: body.documentId, companyId },
          include: { payments: { select: { amount: true } } },
        });
        if (!invoice) {
          res.status(404).json({ error: 'Invoice not found' });
          return;
        }
        const alreadyPaid = invoice.payments.reduce((s, p) => s + (p.amount ?? 0), 0);
        const newPaidTotal = alreadyPaid + body.amount;
        const isNowPaid = newPaidTotal >= invoice.total - 0.5;

        await prisma.$transaction([
          prisma.payment.create({
            data: {
              invoiceId: invoice.id,
              amount: body.amount,
              method: 'transfer',
              reference: body.reference ?? null,
              paidAt: new Date(`${body.paidAt}T00:00:00.000Z`),
              createdBy: req.user!.userId,
            },
          }),
          prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              paidAmount: newPaidTotal,
              isPaid: isNowPaid,
              paidAt: isNowPaid ? new Date(`${body.paidAt}T00:00:00.000Z`) : null,
            },
          }),
        ]);
        res.json({ data: { kind: 'invoice', invoiceId: invoice.id, isPaid: isNowPaid, paidAmount: newPaidTotal } });
        return;
      }

      // body.kind === 'purchase'
      const purchase = await prisma.purchaseInvoice.findFirst({
        where: { id: body.documentId, companyId },
      });
      if (!purchase) {
        res.status(404).json({ error: 'Purchase invoice not found' });
        return;
      }
      await prisma.purchaseInvoice.update({
        where: { id: purchase.id },
        data: { isPaid: true, paidAt: new Date(`${body.paidAt}T00:00:00.000Z`) },
      });
      res.json({ data: { kind: 'purchase', purchaseInvoiceId: purchase.id, isPaid: true } });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: err.issues });
        return;
      }
      logger.error('reconciliation match failed', { err: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: 'Failed to record match' });
    }
  },
);
