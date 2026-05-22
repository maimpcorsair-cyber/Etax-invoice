import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { systemRlsContext, tenantRlsContext, withRlsContext, withSystemRlsContext } from '../config/rls';
import type { AuthPayload } from '../middleware/auth';
import {
  getLimitErrorMessage,
  getUsageLimit,
  getUsageValue,
  hasFeatureAccess,
  resolveCompanyAccessPolicy,
} from './accessPolicyService';
import { generateInvoiceNumber } from './invoiceService';

const VAT_RATE = 0.07;

type RecurringInvoiceWithItems = Prisma.RecurringInvoiceGetPayload<{
  include: { items: true };
}>;

export function startOfUtcDate(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function addFrequency(date: Date, frequency: string, interval: number): Date {
  const safeInterval = Math.max(1, interval || 1);
  const next = new Date(date);
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + (7 * safeInterval));
  if (frequency === 'monthly') next.setUTCMonth(next.getUTCMonth() + safeInterval);
  if (frequency === 'quarterly') next.setUTCMonth(next.getUTCMonth() + (3 * safeInterval));
  if (frequency === 'yearly') next.setUTCFullYear(next.getUTCFullYear() + safeInterval);
  return startOfUtcDate(next);
}

export function calculateRecurringTotals<T extends {
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  vatType: string;
}>(items: T[]) {
  const calculated = items.map((item) => {
    const gross = item.quantity * item.unitPrice;
    const lineDiscount = item.discountAmount > 0 ? (gross * item.discountAmount) / 100 : 0;
    const amount = +(gross - lineDiscount).toFixed(2);
    const vatAmount = item.vatType === 'vat7' ? +(amount * VAT_RATE).toFixed(2) : 0;
    return {
      ...item,
      amount,
      vatAmount,
      totalAmount: +(amount + vatAmount).toFixed(2),
    };
  });
  const subtotal = +calculated.reduce((sum, item) => sum + item.amount, 0).toFixed(2);
  const vatAmount = +calculated.reduce((sum, item) => sum + item.vatAmount, 0).toFixed(2);
  return { calculated, subtotal, vatAmount, total: +(subtotal + vatAmount).toFixed(2) };
}

// Drafts use the same advisory-lock + per-tenant sequence as real invoices
// so two cron workers (or a cron + manual generate) can't collide on the
// same invoiceNumber and hit the [companyId, invoiceNumber] unique key.
async function buildDraftInvoiceNumber(companyId: string, invoiceType: string): Promise<string> {
  return generateInvoiceNumber(companyId, invoiceType);
}

async function resolveCompanySeller(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      nameTh: true,
      nameEn: true,
      taxId: true,
      branchCode: true,
      branchNameTh: true,
      branchNameEn: true,
      addressTh: true,
      addressEn: true,
      phone: true,
      email: true,
      website: true,
      logoUrl: true,
      documentBankAccounts: true,
      documentSignatureProfile: true,
    },
  });
  if (!company) throw new Error('Company not found');
  return {
    nameTh: company.nameTh,
    nameEn: company.nameEn,
    taxId: company.taxId,
    branchCode: company.branchCode,
    branchNameTh: company.branchNameTh,
    branchNameEn: company.branchNameEn,
    addressTh: company.addressTh,
    addressEn: company.addressEn,
    phone: company.phone,
    email: company.email,
    website: company.website,
    logoUrl: company.logoUrl,
    documentPreferences: {
      bankPaymentInfo: company.documentBankAccounts ?? null,
      signatureProfile: company.documentSignatureProfile ?? null,
    },
  };
}

export async function generateRecurringInvoiceDraft(options: {
  recurringInvoiceId: string;
  scheduledFor?: Date;
  user?: AuthPayload;
  triggeredBy: 'manual' | 'cron';
}) {
  const template = await prisma.recurringInvoice.findFirst({
    where: {
      id: options.recurringInvoiceId,
      ...(options.user ? { companyId: options.user.companyId } : {}),
    },
    include: { items: true },
  });
  if (!template) throw new Error('Recurring invoice not found');
  if (template.status !== 'active') throw new Error('Recurring invoice is not active');
  if (template.items.length === 0) throw new Error('Recurring invoice has no items');

  const scheduledFor = startOfUtcDate(options.scheduledFor ?? template.nextRunDate);
  if (template.endDate && scheduledFor > startOfUtcDate(template.endDate)) {
    throw new Error('Recurring invoice is past its end date');
  }
  if (template.maxRuns !== null && template.runCount >= template.maxRuns) {
    throw new Error('Recurring invoice reached its max runs');
  }

  const policy = await resolveCompanyAccessPolicy(template.companyId);
  const limit = getUsageLimit(policy, 'documents');
  if (!hasFeatureAccess(policy, 'create_invoice')) {
    throw new Error('Your current plan cannot create invoices');
  }
  if (limit !== null && getUsageValue(policy, 'documents') >= limit) {
    throw new Error(getLimitErrorMessage('documents', policy));
  }

  const seller = await resolveCompanySeller(template.companyId);
  const { calculated, subtotal, vatAmount } = calculateRecurringTotals(template.items);
  const total = +(subtotal + vatAmount - template.discountAmount).toFixed(2);
  const invoiceDate = scheduledFor;
  const dueDate = typeof template.dueDays === 'number' ? addDays(invoiceDate, template.dueDays) : null;
  const invoiceNumber = await buildDraftInvoiceNumber(template.companyId, template.invoiceType);
  const nextRunDate = addFrequency(scheduledFor, template.frequency, template.interval);
  const shouldEnd = (template.endDate !== null && nextRunDate > startOfUtcDate(template.endDate))
    || (template.maxRuns !== null && template.runCount + 1 >= template.maxRuns);

  const ctx = options.user ? tenantRlsContext(options.user) : systemRlsContext({ companyId: template.companyId, role: 'recurring-invoice-worker' });
  return withRlsContext(prisma, ctx, async (tx) => {
    const run = await tx.recurringInvoiceRun.create({
      data: {
        recurringInvoiceId: template.id,
        companyId: template.companyId,
        scheduledFor,
        status: 'generating',
      },
    });

    const invoice = await tx.invoice.create({
      data: {
        companyId: template.companyId,
        projectId: template.projectId,
        invoiceNumber,
        type: template.invoiceType,
        status: 'draft',
        language: template.language,
        invoiceDate,
        dueDate,
        buyerId: template.customerId,
        seller,
        subtotal,
        vatAmount,
        discountAmount: template.discountAmount,
        total,
        notes: template.notes,
        paymentMethod: template.paymentMethod,
        isPaid: false,
        createdBy: template.createdBy,
        items: {
          create: calculated.map((item) => ({
            productId: item.productId,
            nameTh: item.nameTh,
            nameEn: item.nameEn,
            descriptionTh: item.descriptionTh,
            descriptionEn: item.descriptionEn,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            vatType: item.vatType as 'vat7' | 'vatExempt' | 'vatZero',
            amount: item.amount,
            vatAmount: item.vatAmount,
            totalAmount: item.totalAmount,
          })),
        },
      },
      include: { items: true, buyer: true },
    });

    const updated = await tx.recurringInvoice.update({
      where: { id: template.id },
      data: {
        runCount: { increment: 1 },
        lastRunAt: new Date(),
        nextRunDate,
        status: shouldEnd ? 'ended' : 'active',
      },
      include: { items: true, customer: true, runs: { orderBy: { generatedAt: 'desc' }, take: 5, include: { invoice: true } } },
    });

    const completedRun = await tx.recurringInvoiceRun.update({
      where: { id: run.id },
      data: {
        invoiceId: invoice.id,
        status: 'generated',
      },
      include: { invoice: true },
    });

    return { invoice, recurringInvoice: updated, run: completedRun };
  });
}

export async function generateDueRecurringInvoices(now = new Date()) {
  const today = startOfUtcDate(now);
  const dueTemplates = await withSystemRlsContext(prisma, (tx) => tx.recurringInvoice.findMany({
    where: {
      status: 'active',
      nextRunDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
    },
    include: { items: true },
    orderBy: [{ nextRunDate: 'asc' }, { createdAt: 'asc' }],
    take: 100,
  }), { role: 'recurring-invoice-worker' });

  const results: Array<{ id: string; invoiceId?: string; error?: string }> = [];
  for (const template of dueTemplates as RecurringInvoiceWithItems[]) {
    try {
      const result = await generateRecurringInvoiceDraft({
        recurringInvoiceId: template.id,
        scheduledFor: template.nextRunDate,
        triggeredBy: 'cron',
      });
      results.push({ id: template.id, invoiceId: result.invoice.id });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        results.push({ id: template.id, error: 'duplicate scheduled run' });
      } else {
        results.push({ id: template.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return results;
}
