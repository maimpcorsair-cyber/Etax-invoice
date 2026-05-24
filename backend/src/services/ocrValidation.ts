import type { OcrResult } from './aiService';
import { logger } from '../config/logger';

// Post-OCR validation + classification repair.
//
// The single-prompt OCR pipeline classifies documents AND extracts fields in
// one LLM call, which makes classification mistakes propagate into all the
// downstream UX (wrong Flex card layout, wrong fields rendered, wrong field
// mapping to DB). Concrete bug: a restaurant POS receipt for ฿176 was tagged
// as bank_transfer, so the slip-style card rendered with empty "📤 จาก /
// 📥 ถึง" because the receipt has no payer/payee.
//
// This module runs AFTER the OCR provider returns and:
//   1. Checks classification signals against rawText
//   2. Downgrades or reclassifies when the document type is implausible
//   3. Backfills supplierName from header text when the AI missed it
//   4. Surfaces every correction as a validation warning so we can measure
//      how often the model is wrong (used to build a regression corpus)
//
// Cheap, deterministic, no extra API calls.

const BANK_SIGNAL_REGEX = /\b(KBank|Kasikorn|กสิกร|SCB|ไทยพาณิชย์|Siam Commercial|Bangkok Bank|BBL|กรุงเทพ|KTB|Krungthai|กรุงไทย|Krungsri|กรุงศรี|BAY|TTB|ทหารไทย|ธนชาต|GSB|ออมสิน|BAAC|ธ\.ก\.ส\.|CIMB|UOB|TISCO|TBank|ทิสโก้)\b/i;
const PROMPTPAY_REGEX = /\b(PromptPay|พร้อมเพย์|promptpay)\b/i;
const TRANSFER_KEYWORD_REGEX = /\b(โอนเงิน|Transfer|โอนสำเร็จ|Transaction Successful|ทำรายการสำเร็จ|เลขที่รายการ|reference no|from account|to account|จากบัญชี|ไปยังบัญชี|ผู้โอน|ผู้รับเงิน)\b/i;
const ACCOUNT_NUMBER_REGEX = /\b\d{3}-\d{1,3}-\d{4,7}-\d{1,2}\b|x{3,}-?\d{4,}/i; // "XXX-X-X6770-X" style or masked

// Restaurant POS signals. Any 2+ → expense_receipt.
const RESTAURANT_SIGNALS: Array<{ re: RegExp; label: string }> = [
  { re: /\bTable\s*(no|number)?[:#]?\s*\d+\b/i, label: 'table_no' },
  { re: /โต๊ะ\s*(ที่)?\s*\d+/i, label: 'table_thai' },
  { re: /\bGuests?\s*[:]\s*\d+/i, label: 'guests' },
  { re: /\bPax\s*[:]\s*\d+/i, label: 'pax' },
  { re: /Service Charge|ค่าบริการ\s*\d+%?/i, label: 'service_charge' },
  { re: /Thanks For Dining|Thank you for dining|ขอบคุณที่ใช้บริการ/i, label: 'thanks_dining' },
  { re: /\bRounding\b/i, label: 'rounding' },
  { re: /\bOrder\s*#|Bill\s*no\.?|Check\s*no\.?/i, label: 'order_id' },
  { re: /\b(ผัด|แกง|ต้ม|ตำ|ยำ|ข้าว|ก๋วยเตี๋ยว|เนื้อ|หมู|ไก่|ปลา|กุ้ง|coffee|latte|espresso|cappuccino|beer|wine|cola|coke|tea)\b/i, label: 'food_keyword' },
];

const TAX_INVOICE_HEADER_REGEX = /(ใบกำกับภาษี|TAX\s*INVOICE)/i;
const TAX_ID_REGEX = /\b(\d-?\d{4}-?\d{5}-?\d{2}-?\d|\d{13})\b/;

type DocumentType = OcrResult['documentType'];

interface ValidationResult {
  result: OcrResult;
  corrections: string[];
}

function combinedHaystack(result: OcrResult): string {
  // Pool all the places OCR signals can hide so the regexes have one large
  // string to inspect. rawText is the biggest, but the model sometimes drops
  // signals there and keeps them only on structured fields.
  return [
    result.rawText ?? '',
    result.supplierName ?? '',
    result.documentTypeLabel ?? '',
    result.payment?.bankName ?? '',
    result.payment?.fromName ?? '',
    result.payment?.toName ?? '',
    result.payment?.fromAccount ?? '',
    result.payment?.toAccount ?? '',
    result.expenseSubcategory ?? '',
    result.postingSuggestion ?? '',
  ].filter(Boolean).join('\n');
}

function detectBankSignals(text: string): boolean {
  return BANK_SIGNAL_REGEX.test(text)
    || PROMPTPAY_REGEX.test(text)
    || TRANSFER_KEYWORD_REGEX.test(text)
    || ACCOUNT_NUMBER_REGEX.test(text);
}

function countRestaurantSignals(text: string): { count: number; matched: string[] } {
  const matched: string[] = [];
  for (const { re, label } of RESTAURANT_SIGNALS) {
    if (re.test(text)) matched.push(label);
  }
  return { count: matched.length, matched };
}

function pickRestaurantSupplier(text: string, current: string | undefined): string | undefined {
  // Heuristic: the first non-empty line in rawText that ISN'T a known
  // boilerplate label is usually the restaurant brand. We don't try too
  // hard — when the model already got a brand-shaped supplierName we keep
  // it. When supplierName is empty, we look for a Title Case line near the
  // top of the document.
  if (current && current.trim().length >= 2) return current;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const skipKeywords = /^(table|guest|date|time|invoice|receipt|bill|order|item|qty|total|subtotal|service charge|รวม|ยอด|วันที่)/i;
  for (const line of lines.slice(0, 8)) {
    if (line.length < 2 || line.length > 60) continue;
    if (skipKeywords.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    // Reasonable brand-shaped line: contains letters, mixed case OR Thai.
    if (/[A-Za-z฀-๿]/.test(line)) return line;
  }
  return current;
}

export function validateAndRepairClassification(input: OcrResult): ValidationResult {
  const corrections: string[] = [];
  const haystack = combinedHaystack(input);

  let result: OcrResult = { ...input };

  const hasBankSignal = detectBankSignals(haystack);
  const restaurant = countRestaurantSignals(haystack);
  const hasTaxInvoiceHeader = TAX_INVOICE_HEADER_REGEX.test(haystack);
  const hasTaxId = TAX_ID_REGEX.test(haystack) || (result.supplierTaxId?.replace(/\D/g, '').length === 13);

  // RULE 1 — bank_transfer / payment_advice without ANY bank signal is wrong.
  // Re-route to expense_receipt (the most likely intent for a small-total
  // doc that nonetheless has a Total + Date but no bank logo).
  if ((result.documentType === 'bank_transfer' || result.documentType === 'payment_advice') && !hasBankSignal) {
    const target: DocumentType = restaurant.count >= 2 ? 'expense_receipt' : 'receipt';
    corrections.push(`${result.documentType}→${target}:no_bank_signal`);
    result = {
      ...result,
      documentType: target,
      documentTypeLabel: target === 'expense_receipt' ? 'ใบเสร็จค่าใช้จ่าย' : 'ใบเสร็จรับเงิน',
      // Clear payment-specific fields so the wrong slip card doesn't render.
      payment: undefined,
    };
  }

  // RULE 2 — 2+ restaurant signals: force expense_receipt, set meals
  // category, populate supplierName from header when missing.
  if (restaurant.count >= 2 && result.documentType !== 'expense_receipt') {
    corrections.push(`${result.documentType}→expense_receipt:restaurant_signals(${restaurant.matched.join(',')})`);
    result = {
      ...result,
      documentType: 'expense_receipt',
      documentTypeLabel: 'ใบเสร็จค่าใช้จ่าย (ร้านอาหาร)',
      expenseCategory: result.expenseCategory || 'meals',
      taxTreatment: result.taxTreatment === 'input_vat_claimable' ? result.taxTreatment : 'non_deductible',
    };
  }

  if (restaurant.count >= 2) {
    const brand = pickRestaurantSupplier(haystack, result.supplierName);
    if (brand && brand !== result.supplierName) {
      corrections.push(`backfill_supplierName:${brand}`);
      result = { ...result, supplierName: brand };
    }
  }

  // RULE 3 — claimed tax_invoice but no header text AND no tax ID is
  // suspicious. Downgrade to receipt so the user isn't shown a tax
  // invoice card they'd have to manually fix.
  if (result.documentType === 'tax_invoice' && !hasTaxInvoiceHeader && !hasTaxId) {
    corrections.push('tax_invoice→receipt:no_header_no_taxid');
    result = {
      ...result,
      documentType: 'receipt',
      documentTypeLabel: 'ใบเสร็จรับเงิน',
    };
  }

  if (corrections.length > 0) {
    const warnings = [...(result.validationWarnings ?? []), ...corrections.map((c) => `auto-repair: ${c}`)];
    result = { ...result, validationWarnings: warnings };
    logger.info('[ocrValidation] classification repaired', {
      original: input.documentType,
      repaired: result.documentType,
      corrections,
    });
  }

  return { result, corrections };
}
