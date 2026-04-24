import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeInvoicePayments } from './paymentService';

test('summarizeInvoicePayments keeps invoice unpaid for partial payments', () => {
  const firstPaymentAt = new Date('2026-04-23T10:00:00.000Z');
  const secondPaymentAt = new Date('2026-04-24T10:00:00.000Z');

  const summary = summarizeInvoicePayments(1000, [
    { amount: 400, paidAt: firstPaymentAt },
    { amount: 300, paidAt: secondPaymentAt },
  ]);

  assert.equal(summary.paidAmount, 700);
  assert.equal(summary.isPaid, false);
  assert.equal(summary.paidAt, null);
});

test('summarizeInvoicePayments marks invoice paid when cumulative payments reach total', () => {
  const firstPaymentAt = new Date('2026-04-23T10:00:00.000Z');
  const secondPaymentAt = new Date('2026-04-24T10:00:00.000Z');

  const summary = summarizeInvoicePayments(1000, [
    { amount: 400, paidAt: firstPaymentAt },
    { amount: 600, paidAt: secondPaymentAt },
  ]);

  assert.equal(summary.paidAmount, 1000);
  assert.equal(summary.isPaid, true);
  assert.equal(summary.paidAt?.toISOString(), secondPaymentAt.toISOString());
});

test('summarizeInvoicePayments resets paid flags when no payments remain', () => {
  const summary = summarizeInvoicePayments(1000, []);

  assert.equal(summary.paidAmount, 0);
  assert.equal(summary.isPaid, false);
  assert.equal(summary.paidAt, null);
});
