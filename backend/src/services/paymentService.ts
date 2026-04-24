import { Prisma } from '@prisma/client';

export interface InvoicePaymentSummary {
  paidAmount: number;
  isPaid: boolean;
  paidAt: Date | null;
}

export interface PaymentSnapshot {
  amount: number;
  paidAt: Date;
}

export function summarizeInvoicePayments(
  total: number,
  payments: PaymentSnapshot[],
): InvoicePaymentSummary {
  const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const isPaid = paidAmount >= total;
  const paidAt = isPaid && payments.length > 0 ? payments[payments.length - 1].paidAt : null;

  return { paidAmount, isPaid, paidAt };
}

export async function calculateInvoicePaymentSummary(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<InvoicePaymentSummary> {
  const [payments, invoice] = await Promise.all([
    tx.payment.findMany({
      where: { invoiceId },
      select: { amount: true, paidAt: true },
      orderBy: { paidAt: 'asc' },
    }),
    tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { total: true },
    }),
  ]);

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  return summarizeInvoicePayments(invoice.total, payments);
}
