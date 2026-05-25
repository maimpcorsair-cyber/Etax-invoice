// Regression tests for ocrValidation. These exercise the deterministic
// repair rules against synthetic OcrResult fixtures that mirror the
// actual misclassifications we've seen from the OCR pipeline. Each fix
// in production → add a fixture here so the same mistake can't ship
// again unnoticed.
//
// Run: cd backend && npm run test:unit

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAndRepairClassification, shouldEscalateAfterValidation } from './ocrValidation';
import type { OcrResult } from './aiService';

function baseResult(overrides: Partial<OcrResult> = {}): OcrResult {
  return {
    documentType: 'other',
    documentTypeLabel: '',
    supplierName: '',
    supplierTaxId: '',
    supplierBranch: '00000',
    invoiceNumber: '',
    invoiceDate: '',
    subtotal: 0,
    vatAmount: 0,
    total: 0,
    confidence: 'medium',
    extractionProvider: 'openai',
    rawText: '',
    ...overrides,
  };
}

// ── Rule 1: bank_transfer without bank signal → re-classify ─────────

test('61 Bistro restaurant receipt mis-tagged as bank_transfer → expense_receipt', () => {
  // Real-world fixture: AI returned bank_transfer for a thermal POS bill
  // with no bank logo. rawText preserved the restaurant signals that the
  // model ignored when picking documentType.
  const input = baseResult({
    documentType: 'bank_transfer',
    documentTypeLabel: 'สลิปโอนเงิน',
    total: 176,
    payment: { amount: 176, fromName: '', toName: '61 Bistro' },
    rawText: 'Table no. 12\nGuests: 1\n61 Bistro\nผัดกระเทียม Dinner Stir Fried Garlic 140.00\nSubtotal 170.00\nService Charge(3%) 5.10\nRounding 0.90\nTotal 176.00\nThanks For Dining',
    confidence: 'medium',
  });

  const { result, corrections } = validateAndRepairClassification(input);

  assert.equal(result.documentType, 'expense_receipt');
  // Rule 1 fires first because bank_transfer has no bank signal → routes
  // to expense_receipt directly (skipping Rule 2's reclassification path).
  assert.ok(corrections.some((c) => c.includes('expense_receipt') || c.includes('no_bank_signal')));
  // payment.* should be cleared so the wrong slip card doesn't render
  assert.equal(result.payment, undefined);
  // supplierName should still be backfilled from header text via Rule 2
  // (the backfill block runs whenever restaurant.count >= 2, independent
  // of which rule did the reclassification).
  assert.ok(result.supplierName && result.supplierName.length > 0);
});

test('bank_transfer WITH bank signal stays bank_transfer', () => {
  // Counter-example: actual KBank slip. Validation must NOT change classification.
  const input = baseResult({
    documentType: 'bank_transfer',
    documentTypeLabel: 'สลิปโอนเงิน (KBank)',
    total: 176,
    payment: {
      amount: 176,
      bankName: 'KBank',
      fromName: 'นาย ธัญยธรณ์',
      toName: 'SCB มณี SHOP',
      reference: '016137195526CPM18706',
    },
    rawText: 'K+ โอนเงินสำเร็จ ทำรายการสำเร็จ KBank ฿176.00 เลขที่รายการ 016137195526CPM18706',
    confidence: 'high',
  });

  const { result, corrections } = validateAndRepairClassification(input);

  assert.equal(result.documentType, 'bank_transfer');
  assert.equal(corrections.length, 0);
  assert.deepEqual(result.payment, input.payment);
});

test('payment_advice without bank signal but no restaurant signals → receipt', () => {
  const input = baseResult({
    documentType: 'payment_advice',
    total: 500,
    rawText: 'Total 500.00 Date 2026-05-15 Time 14:30',
    confidence: 'low',
  });

  const { result, corrections } = validateAndRepairClassification(input);

  assert.equal(result.documentType, 'receipt');
  assert.ok(corrections[0].includes('no_bank_signal'));
});

// ── Rule 2: 2+ restaurant signals → expense_receipt ──────────────────

test('coffee shop receipt → expense_receipt + meals', () => {
  const input = baseResult({
    documentType: 'receipt',
    total: 95,
    rawText: 'After You\nTable 5\nLatte 75\nService Charge 10%\nThanks for dining\nTotal 95.00',
    confidence: 'medium',
  });

  const { result, corrections } = validateAndRepairClassification(input);

  assert.equal(result.documentType, 'expense_receipt');
  assert.equal(result.expenseCategory, 'meals');
  assert.ok(corrections.some((c) => c.includes('restaurant_signals')));
});

test('food court receipt with rounding line', () => {
  const input = baseResult({
    documentType: 'invoice',
    total: 80,
    rawText: 'MK Suki Table no. 22 Guests: 2 ต้มยำ 75 Rounding 5 Total 80',
    confidence: 'medium',
  });

  const { result } = validateAndRepairClassification(input);

  assert.equal(result.documentType, 'expense_receipt');
});

// ── Rule 3: tax_invoice without header AND tax ID → receipt ─────────

test('claimed tax_invoice with neither header nor tax ID → receipt', () => {
  const input = baseResult({
    documentType: 'tax_invoice',
    documentTypeLabel: 'ใบกำกับภาษี',
    total: 200,
    rawText: '7-Eleven\nMilk 50\nBread 30\nTotal 200',
    confidence: 'medium',
  });

  const { result, corrections } = validateAndRepairClassification(input);

  assert.equal(result.documentType, 'receipt');
  assert.ok(corrections[0].includes('tax_invoice'));
});

test('tax_invoice with header AND tax ID stays tax_invoice', () => {
  const input = baseResult({
    documentType: 'tax_invoice',
    documentTypeLabel: 'ใบกำกับภาษี',
    supplierTaxId: '0105536123456',
    total: 1070,
    vatAmount: 70,
    subtotal: 1000,
    rawText: 'ใบกำกับภาษี / TAX INVOICE\nบริษัท ABC จำกัด\nเลขผู้เสียภาษี 0-1055-36123-45-6\nVAT 7% 70.00\nTotal 1070',
    confidence: 'high',
  });

  const { result, corrections } = validateAndRepairClassification(input);

  assert.equal(result.documentType, 'tax_invoice');
  assert.equal(corrections.length, 0);
});

// ── Escalation oracle ───────────────────────────────────────────────

test('low confidence → escalate', () => {
  const decision = shouldEscalateAfterValidation(baseResult({ confidence: 'low' }), 0);
  assert.equal(decision.escalate, true);
  assert.equal(decision.reason, 'low_confidence');
});

test('2+ corrections → escalate', () => {
  const decision = shouldEscalateAfterValidation(baseResult({ confidence: 'medium' }), 2);
  assert.equal(decision.escalate, true);
  assert.ok(decision.reason.includes('correction'));
});

test('clean medium-confidence result → no escalation', () => {
  const decision = shouldEscalateAfterValidation(
    baseResult({ documentType: 'tax_invoice', confidence: 'medium', total: 1000, rawText: 'tax invoice ABC Ltd' }),
    0,
  );
  assert.equal(decision.escalate, false);
});

test('documentType "other" → escalate', () => {
  const decision = shouldEscalateAfterValidation(baseResult({ documentType: 'other', confidence: 'medium' }), 0);
  assert.equal(decision.escalate, true);
  assert.equal(decision.reason, 'doctype_other');
});

test('minimal extraction (short rawText, no amount) → escalate', () => {
  // documentType must NOT be 'other' here — otherwise the earlier rule
  // ('doctype_other') fires first and we wouldn't be exercising the
  // minimal-extraction path.
  const decision = shouldEscalateAfterValidation(
    baseResult({ documentType: 'receipt', rawText: 'abc', total: 0, confidence: 'medium' }),
    0,
  );
  assert.equal(decision.escalate, true);
  assert.equal(decision.reason, 'minimal_extraction');
});
