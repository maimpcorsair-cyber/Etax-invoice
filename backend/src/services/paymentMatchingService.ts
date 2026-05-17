import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { logger } from '../config/logger';

export interface PaymentMatchCandidate {
  invoiceId: string;
  invoiceNumber: string;
  buyerName: string;
  total: number;
  paidAmount: number;
  invoiceDate: Date;
  dueDate: Date | null;
  outstanding: number;
  score: number;
  reasons: string[];
}

export interface SlipFingerprint {
  companyId: string;
  amount: number;
  paidAt: Date;
  reference?: string | null;
  counterpartyName?: string | null;
}

const SCORE_AUTO_MATCH = 80;
const SCORE_SHORTLIST = 50;
const DATE_NEAR_DAYS = 14;
const DATE_FAR_DAYS = 60;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').toLowerCase();
}

function similarityScore(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  // Trigram overlap
  const trig = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const tx = trig(x);
  const ty = trig(y);
  if (!tx.size || !ty.size) return 0;
  let overlap = 0;
  for (const g of tx) if (ty.has(g)) overlap += 1;
  return overlap / Math.max(tx.size, ty.size);
}

export function scoreCandidate(
  invoice: { total: number; paidAmount: number | null; invoiceDate: Date; dueDate: Date | null; invoiceNumber: string; buyer: { nameTh: string | null; nameEn: string | null } },
  slip: SlipFingerprint,
): { score: number; reasons: string[]; outstanding: number } {
  const reasons: string[] = [];
  let score = 0;

  const outstanding = Math.max(0, invoice.total - (invoice.paidAmount ?? 0));

  // Amount (max 40)
  const amountDelta = Math.abs(invoice.total - slip.amount);
  const outstandingDelta = Math.abs(outstanding - slip.amount);
  if (amountDelta <= 1 || outstandingDelta <= 1) {
    score += 40;
    reasons.push('amount:exact');
  } else if (amountDelta / Math.max(invoice.total, 1) <= 0.01) {
    score += 30;
    reasons.push('amount:within_1pct');
  }

  // Date proximity (max 20)
  const dDays = daysBetween(slip.paidAt, invoice.invoiceDate);
  if (dDays <= 1) {
    score += 20;
    reasons.push('date:same_day');
  } else if (dDays <= DATE_NEAR_DAYS) {
    score += 14;
    reasons.push('date:within_2_weeks');
  } else if (dDays <= DATE_FAR_DAYS) {
    score += 6;
    reasons.push('date:within_2_months');
  }

  // Buyer name similarity (max 30)
  const buyerName = invoice.buyer.nameTh || invoice.buyer.nameEn || '';
  const nameSim = similarityScore(buyerName, slip.counterpartyName ?? '');
  if (nameSim >= 0.85) {
    score += 30;
    reasons.push('buyer:strong_match');
  } else if (nameSim >= 0.5) {
    score += 18;
    reasons.push('buyer:partial_match');
  }

  // Reference match (max 10)
  if (slip.reference) {
    const ref = normalize(slip.reference);
    const inv = normalize(invoice.invoiceNumber);
    if (ref && inv && (ref.includes(inv) || inv.includes(ref))) {
      score += 10;
      reasons.push('reference:matches_invoice_number');
    }
  }

  return { score: Math.min(100, score), reasons, outstanding };
}

export async function findInvoiceCandidates(slip: SlipFingerprint): Promise<PaymentMatchCandidate[]> {
  const window = 90; // days
  const from = new Date(slip.paidAt.getTime() - window * 86_400_000);
  const to = new Date(slip.paidAt.getTime() + 7 * 86_400_000);

  const candidates = await prisma.invoice.findMany({
    where: {
      companyId: slip.companyId,
      isPaid: false,
      status: { not: 'cancelled' },
      invoiceDate: { gte: from, lte: to },
    },
    include: { buyer: { select: { nameTh: true, nameEn: true } } },
    orderBy: { invoiceDate: 'desc' },
    take: 30,
  });

  return candidates
    .map((invoice) => {
      const { score, reasons, outstanding } = scoreCandidate(invoice, slip);
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        buyerName: invoice.buyer.nameTh || invoice.buyer.nameEn || '',
        total: invoice.total,
        paidAmount: invoice.paidAmount ?? 0,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        outstanding,
        score,
        reasons,
      };
    })
    .filter((c) => c.score >= SCORE_SHORTLIST)
    .sort((a, b) => b.score - a.score);
}

export interface PurchaseMatchCandidate {
  purchaseInvoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  total: number;
  invoiceDate: Date;
  score: number;
  reasons: string[];
}

function scorePurchaseCandidate(
  purchase: { total: number; invoiceDate: Date; invoiceNumber: string; supplierName: string },
  slip: SlipFingerprint,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const amountDelta = Math.abs(purchase.total - slip.amount);
  if (amountDelta <= 1) {
    score += 40;
    reasons.push('amount:exact');
  } else if (amountDelta / Math.max(purchase.total, 1) <= 0.01) {
    score += 30;
    reasons.push('amount:within_1pct');
  } else if (amountDelta / Math.max(purchase.total, 1) <= 0.05) {
    score += 15;
    reasons.push('amount:within_5pct');
  }

  const dDays = daysBetween(slip.paidAt, purchase.invoiceDate);
  if (dDays <= 1) {
    score += 20;
    reasons.push('date:same_day');
  } else if (dDays <= DATE_NEAR_DAYS) {
    score += 14;
    reasons.push('date:within_2_weeks');
  } else if (dDays <= DATE_FAR_DAYS) {
    score += 6;
    reasons.push('date:within_2_months');
  }

  const supplierSim = similarityScore(purchase.supplierName, slip.counterpartyName ?? '');
  if (supplierSim >= 0.85) {
    score += 30;
    reasons.push('supplier:strong_match');
  } else if (supplierSim >= 0.5) {
    score += 18;
    reasons.push('supplier:partial_match');
  }

  if (slip.reference) {
    const ref = normalize(slip.reference);
    const inv = normalize(purchase.invoiceNumber);
    if (ref && inv && (ref.includes(inv) || inv.includes(ref))) {
      score += 10;
      reasons.push('reference:matches_invoice_number');
    }
  }

  return { score: Math.min(100, score), reasons };
}

export async function findPurchaseInvoiceCandidates(slip: SlipFingerprint): Promise<PurchaseMatchCandidate[]> {
  const window = 90;
  const from = new Date(slip.paidAt.getTime() - window * 86_400_000);
  const to = new Date(slip.paidAt.getTime() + 7 * 86_400_000);

  const purchases = await prisma.purchaseInvoice.findMany({
    where: {
      companyId: slip.companyId,
      isPaid: false,
      invoiceDate: { gte: from, lte: to },
    },
    orderBy: { invoiceDate: 'desc' },
    take: 30,
  });

  return purchases
    .map((p) => {
      const { score, reasons } = scorePurchaseCandidate(p, slip);
      return {
        purchaseInvoiceId: p.id,
        invoiceNumber: p.invoiceNumber,
        supplierName: p.supplierName,
        total: p.total,
        invoiceDate: p.invoiceDate,
        score,
        reasons,
      };
    })
    .filter((c) => c.score >= SCORE_SHORTLIST)
    .sort((a, b) => b.score - a.score);
}

export interface AutoMatchResult {
  status: 'auto_matched' | 'shortlist' | 'unmatched';
  invoiceId?: string;
  paymentId?: string;
  matchScore?: number;
  candidates: PaymentMatchCandidate[];
}

export async function attemptAutoMatchAndPay(
  slip: SlipFingerprint,
  context: { intakeId?: string | null; createdBy: string; note?: string },
): Promise<AutoMatchResult> {
  const candidates = await findInvoiceCandidates(slip);
  const top = candidates[0];
  if (!top || top.score < SCORE_AUTO_MATCH) {
    return {
      status: top && top.score >= SCORE_SHORTLIST ? 'shortlist' : 'unmatched',
      candidates,
    };
  }

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          invoiceId: top.invoiceId,
          amount: slip.amount,
          method: 'transfer',
          reference: slip.reference ?? undefined,
          paidAt: slip.paidAt,
          note: context.note,
          createdBy: context.createdBy,
          evidenceIntakeId: context.intakeId ?? undefined,
          matchScore: top.score,
          matchedBy: 'auto',
        },
      });

      const sum = await tx.payment.aggregate({
        _sum: { amount: true },
        where: { invoiceId: top.invoiceId },
      });
      const paidAmount = sum._sum.amount ?? 0;
      const isPaid = paidAmount >= top.total - 0.5;
      await tx.invoice.update({
        where: { id: top.invoiceId },
        data: {
          isPaid,
          paidAt: isPaid ? slip.paidAt : null,
          paidAmount,
        },
      });
      return created;
    });

    logger.info('[paymentMatch] auto-matched bank slip to invoice', {
      invoiceId: top.invoiceId,
      score: top.score,
      amount: slip.amount,
      intakeId: context.intakeId,
    });

    return {
      status: 'auto_matched',
      invoiceId: top.invoiceId,
      paymentId: payment.id,
      matchScore: top.score,
      candidates,
    };
  } catch (err) {
    logger.warn('[paymentMatch] auto-match failed', {
      error: err instanceof Error ? err.message : String(err),
      slipAmount: slip.amount,
    });
    return { status: 'unmatched', candidates };
  }
}

export type { Prisma };
