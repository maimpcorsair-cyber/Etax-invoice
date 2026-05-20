// Unit tests for routes/line/helpers. These pure functions are used
// across the LINE bot — message handlers, template editor, OCR summary.
// The test suite guards against silent regressions when the file is
// split further or refactored.
//
// Run: cd backend && npm run test:unit

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordFromJson,
  stringFromUnknown,
  numberFromUnknown,
  warningTextFromJson,
  summarizeDocumentIntakeOcr,
  isGroupTextCommand,
  parseTemplateReply,
  detectLineFileMimeType,
  maskLineUserId,
  paymentAmount,
  paymentReference,
  hasUsefulLineOcrData,
  closeAmount,
  PURCHASE_TEMPLATE_FIELDS,
  BANK_TRANSFER_TEMPLATE_FIELDS,
} from './helpers';
import type { OcrResult } from '../../services/aiService';

// ── value coercion ───────────────────────────────────────────────────

test('stringFromUnknown returns trimmed string or null', () => {
  assert.equal(stringFromUnknown('hello'), 'hello');
  assert.equal(stringFromUnknown('  spaced  '), 'spaced');
  assert.equal(stringFromUnknown(''), null);
  assert.equal(stringFromUnknown('   '), null);
  assert.equal(stringFromUnknown(123), null);
  assert.equal(stringFromUnknown(null), null);
  assert.equal(stringFromUnknown(undefined), null);
});

test('numberFromUnknown returns finite number or null', () => {
  assert.equal(numberFromUnknown(42), 42);
  assert.equal(numberFromUnknown(0), 0);
  assert.equal(numberFromUnknown(-3.14), -3.14);
  assert.equal(numberFromUnknown(NaN), null);
  assert.equal(numberFromUnknown(Infinity), null);
  assert.equal(numberFromUnknown('42'), null);
  assert.equal(numberFromUnknown(null), null);
});

test('recordFromJson narrows JsonValue to plain object', () => {
  assert.deepEqual(recordFromJson({ a: 1 }), { a: 1 });
  assert.equal(recordFromJson(null), null);
  assert.equal(recordFromJson(undefined), null);
  assert.equal(recordFromJson([1, 2, 3]), null); // arrays explicitly excluded
  assert.equal(recordFromJson('string'), null);
  assert.equal(recordFromJson(42), null);
});

test('warningTextFromJson extracts message + code strings', () => {
  assert.deepEqual(warningTextFromJson(['hello', 'world']), ['hello', 'world']);
  assert.deepEqual(
    warningTextFromJson([{ message: 'something failed' }, { code: 'X-1' }]),
    ['something failed', 'X-1'],
  );
  assert.deepEqual(warningTextFromJson([]), []);
  assert.deepEqual(warningTextFromJson(null), []);
  assert.deepEqual(warningTextFromJson('not an array'), []);
  // mixed valid + invalid items get filtered
  assert.deepEqual(warningTextFromJson(['ok', 123, null, { message: 'two' }]), ['ok', 'two']);
});

// ── summarizeDocumentIntakeOcr ───────────────────────────────────────

test('summarizeDocumentIntakeOcr pulls supplier / invoice / totals from OCR JSON', () => {
  const ocr = {
    documentType: 'tax_invoice',
    documentTypeLabel: 'ใบกำกับภาษี',
    supplierName: 'บริษัท ABC จำกัด',
    invoiceNumber: 'INV-001',
    total: 10700,
    vatAmount: 700,
    confidence: 'high',
  };
  const summary = summarizeDocumentIntakeOcr(ocr, ['analysis:openai', 'low confidence on date']);
  assert.equal(summary.documentType, 'tax_invoice');
  assert.equal(summary.counterparty, 'บริษัท ABC จำกัด');
  assert.equal(summary.invoiceNumber, 'INV-001');
  assert.equal(summary.total, 10700);
  assert.deepEqual(summary.stages, ['openai']);
  assert.equal(summary.warningCount, 1);
  assert.equal(summary.firstWarning, 'low confidence on date');
});

test('summarizeDocumentIntakeOcr falls back to payment fields for bank transfers', () => {
  const ocr = {
    documentType: 'bank_transfer',
    payment: { toName: 'Beneficiary Co', amount: 5000, reference: 'TXN123' },
  };
  const summary = summarizeDocumentIntakeOcr(ocr, []);
  assert.equal(summary.counterparty, 'Beneficiary Co');
  assert.equal(summary.invoiceNumber, 'TXN123');
  assert.equal(summary.total, 5000);
});

// ── isGroupTextCommand ───────────────────────────────────────────────

test('isGroupTextCommand recognises 6-digit OTP', () => {
  assert.equal(isGroupTextCommand('123456'), true);
  assert.equal(isGroupTextCommand('/link 123456'), true);
  assert.equal(isGroupTextCommand('ผูกโปรเจค 123456'), true);
  assert.equal(isGroupTextCommand('12345'), false); // 5 digits
  assert.equal(isGroupTextCommand('1234567'), false); // 7 digits
});

test('isGroupTextCommand recognises core help / status commands', () => {
  for (const text of ['help', 'ช่วยเหลือ', 'สถานะ', 'ใบล่าสุด', 'สรุปภาษี']) {
    assert.equal(isGroupTextCommand(text), true, `expected '${text}' to be a command`);
  }
});

test('isGroupTextCommand returns false for ordinary group chat', () => {
  assert.equal(isGroupTextCommand('hello team'), false);
  assert.equal(isGroupTextCommand(''), false);
  assert.equal(isGroupTextCommand('   '), false);
});

test('isGroupTextCommand recognises document-search prefixes', () => {
  assert.equal(isGroupTextCommand('ส่งใบ INV-001'), true);
  assert.equal(isGroupTextCommand('pdf INV-001'), true);
  assert.equal(isGroupTextCommand('ค้นหา supplier'), true);
});

// ── parseTemplateReply ───────────────────────────────────────────────

test('parseTemplateReply parses money values, strips commas', () => {
  const moneyField = PURCHASE_TEMPLATE_FIELDS.find((f) => f.type === 'money')!;
  assert.equal(parseTemplateReply(moneyField, '10700'), 10700);
  assert.equal(parseTemplateReply(moneyField, '10,700'), 10700);
  assert.equal(parseTemplateReply(moneyField, '10,700.50'), 10700.50);
  assert.equal(parseTemplateReply(moneyField, '0'), null); // amounts must be > 0
  assert.equal(parseTemplateReply(moneyField, 'abc'), null);
});

test('parseTemplateReply validates 13-digit tax ID, strips non-digits', () => {
  const taxIdField = PURCHASE_TEMPLATE_FIELDS.find((f) => f.type === 'tax_id')!;
  assert.equal(parseTemplateReply(taxIdField, '0105567890123'), '0105567890123');
  assert.equal(parseTemplateReply(taxIdField, '0-1055-67890-12-3'), '0105567890123');
  assert.equal(parseTemplateReply(taxIdField, '0105'), null); // too short
  assert.equal(parseTemplateReply(taxIdField, '01055678901234'), null); // 14 digits
});

test('parseTemplateReply converts Buddhist year DD/MM/YYYY to ISO', () => {
  const dateField = PURCHASE_TEMPLATE_FIELDS.find((f) => f.type === 'date')!;
  assert.equal(parseTemplateReply(dateField, '27/04/2569'), '2026-04-27');
  assert.equal(parseTemplateReply(dateField, '1/1/2569'), '2026-01-01');
  // Already-ISO passes through
  assert.equal(parseTemplateReply(dateField, '2026-04-27'), '2026-04-27');
  // Garbage rejected
  assert.equal(parseTemplateReply(dateField, '27 April'), null);
});

test('parseTemplateReply text type returns trimmed or null', () => {
  const refField = BANK_TRANSFER_TEMPLATE_FIELDS.find((f) => f.key === 'payment.reference')!;
  assert.equal(parseTemplateReply(refField, '  TXN-001  '), 'TXN-001');
  assert.equal(parseTemplateReply(refField, ''), null);
  assert.equal(parseTemplateReply(refField, '   '), null);
});

// ── detectLineFileMimeType ───────────────────────────────────────────

test('detectLineFileMimeType identifies PDF by magic header', () => {
  const pdfBuf = Buffer.from('%PDF-1.4\n...');
  assert.equal(detectLineFileMimeType(pdfBuf, 'application/octet-stream'), 'application/pdf');
});

test('detectLineFileMimeType identifies JPEG by magic header', () => {
  const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(detectLineFileMimeType(jpegBuf, 'application/octet-stream'), 'image/jpeg');
});

test('detectLineFileMimeType identifies PNG by full magic header', () => {
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(detectLineFileMimeType(pngBuf, 'application/octet-stream'), 'image/png');
});

test('detectLineFileMimeType respects Content-Type header even for unknown magic', () => {
  const buf = Buffer.from([0, 0, 0]);
  assert.equal(detectLineFileMimeType(buf, 'application/pdf'), 'application/pdf');
  assert.equal(detectLineFileMimeType(buf, 'image/png'), 'image/png');
});

test('detectLineFileMimeType defaults to image/jpeg for LINE image messages', () => {
  const buf = Buffer.from([0, 0, 0]);
  assert.equal(detectLineFileMimeType(buf, '', 'image'), 'image/jpeg');
});

// ── maskLineUserId ───────────────────────────────────────────────────

test('maskLineUserId masks long IDs to first3…last4', () => {
  assert.equal(maskLineUserId('U1234567890abcdef'), 'U12…cdef');
});

test('maskLineUserId returns "linked" for short IDs', () => {
  assert.equal(maskLineUserId('short'), 'linked');
  assert.equal(maskLineUserId('U12345'), 'linked');
});

test('maskLineUserId handles null/empty', () => {
  assert.equal(maskLineUserId(null), null);
  assert.equal(maskLineUserId(undefined), null);
  assert.equal(maskLineUserId(''), null);
});

// ── OcrResult accessors ──────────────────────────────────────────────

test('paymentAmount prefers explicit payment.amount over total', () => {
  const ocr = { payment: { amount: 500 }, total: 1000 } as unknown as OcrResult;
  assert.equal(paymentAmount(ocr), 500);
});

test('paymentAmount falls back to total when payment absent', () => {
  const ocr = { total: 1000 } as unknown as OcrResult;
  assert.equal(paymentAmount(ocr), 1000);
});

test('paymentAmount returns 0 when both absent', () => {
  assert.equal(paymentAmount({} as OcrResult), 0);
});

test('paymentReference prefers payment.reference over invoiceNumber', () => {
  const ocr = { payment: { reference: 'TXN1' }, invoiceNumber: 'INV1' } as unknown as OcrResult;
  assert.equal(paymentReference(ocr), 'TXN1');
});

test('hasUsefulLineOcrData detects any useful field', () => {
  assert.equal(hasUsefulLineOcrData(undefined), false);
  assert.equal(hasUsefulLineOcrData({} as OcrResult), false);
  assert.equal(hasUsefulLineOcrData({ supplierName: 'Co' } as OcrResult), true);
  assert.equal(hasUsefulLineOcrData({ total: 100 } as OcrResult), true);
});

test('closeAmount accepts ±1 baht rounding gap', () => {
  assert.equal(closeAmount(100, 100), true);
  assert.equal(closeAmount(100, 101), true);
  assert.equal(closeAmount(100, 99), true);
  assert.equal(closeAmount(100, 102), false);
  assert.equal(closeAmount(100, 0), false);
});
