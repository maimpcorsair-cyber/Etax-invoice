import test from 'node:test';
import assert from 'node:assert/strict';
import { addFrequency, calculateRecurringTotals, startOfUtcDate } from './recurringInvoiceService';

test('addFrequency advances weekly/monthly/quarterly/yearly schedules from UTC date start', () => {
  const base = startOfUtcDate(new Date('2026-05-22T13:45:00.000Z'));

  assert.equal(addFrequency(base, 'weekly', 2).toISOString(), '2026-06-05T00:00:00.000Z');
  assert.equal(addFrequency(base, 'monthly', 1).toISOString(), '2026-06-22T00:00:00.000Z');
  assert.equal(addFrequency(base, 'quarterly', 1).toISOString(), '2026-08-22T00:00:00.000Z');
  assert.equal(addFrequency(base, 'yearly', 1).toISOString(), '2027-05-22T00:00:00.000Z');
});

test('calculateRecurringTotals applies percent line discount and VAT 7 only to taxable lines', () => {
  const result = calculateRecurringTotals([
    { quantity: 2, unitPrice: 100, discountAmount: 10, vatType: 'vat7', nameTh: 'service' },
    { quantity: 1, unitPrice: 50, discountAmount: 0, vatType: 'vatExempt', nameTh: 'fee' },
  ]);

  assert.equal(result.subtotal, 230);
  assert.equal(result.vatAmount, 12.6);
  assert.equal(result.total, 242.6);
  assert.equal(result.calculated[0].totalAmount, 192.6);
  assert.equal(result.calculated[1].totalAmount, 50);
});
