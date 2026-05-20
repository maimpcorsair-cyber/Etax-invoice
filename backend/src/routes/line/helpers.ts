// Pure helpers extracted from routes/line.ts. Each function is stateless,
// does not touch Redis / Prisma / the LINE SDK, and operates only on the
// values passed to it. Safe to test in isolation and to call from
// non-LINE contexts (e.g., job workers that share OcrResult shape).

import type { Prisma } from '@prisma/client';
import type { OcrResult } from '../../services/aiService';
import { PURCHASE_RECORD_DOCUMENT_TYPES } from '../../services/documentOcrService';

// ── JSON / value coercion helpers ────────────────────────────────────

export function recordFromJson(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function stringFromUnknown(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function numberFromUnknown(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function warningTextFromJson(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        return stringFromUnknown(record.message) ?? stringFromUnknown(record.code);
      }
      return null;
    })
    .filter((item): item is string => !!item);
}

export function summarizeDocumentIntakeOcr(ocrResult: Prisma.JsonValue | null | undefined, warnings: Prisma.JsonValue | null | undefined) {
  const ocr = recordFromJson(ocrResult);
  const payment = recordFromJson(ocr?.payment as Prisma.JsonValue | null | undefined);
  const metadata = recordFromJson(ocr?.documentMetadata as Prisma.JsonValue | null | undefined);
  const warningTexts = warningTextFromJson(warnings);
  const stages = warningTexts
    .filter((item) => item.startsWith('analysis:'))
    .map((item) => item.replace(/^analysis:/, ''));
  const validationWarnings = warningTexts.filter((item) => !item.startsWith('analysis:'));

  return {
    documentType: stringFromUnknown(ocr?.documentType),
    documentTypeLabel: stringFromUnknown(ocr?.documentTypeLabel),
    counterparty:
      stringFromUnknown(ocr?.supplierName)
      ?? stringFromUnknown(payment?.toName)
      ?? stringFromUnknown(payment?.fromName),
    invoiceNumber:
      stringFromUnknown(ocr?.invoiceNumber)
      ?? stringFromUnknown(payment?.reference)
      ?? stringFromUnknown(metadata?.purchaseOrderNumber)
      ?? stringFromUnknown(metadata?.quotationNumber),
    total:
      numberFromUnknown(ocr?.total)
      ?? numberFromUnknown(payment?.amount),
    vatAmount: numberFromUnknown(ocr?.vatAmount),
    confidence: stringFromUnknown(ocr?.confidence),
    stages,
    warningCount: validationWarnings.length,
    firstWarning: validationWarnings[0] ?? null,
  };
}

// ── Group/chat command detection ─────────────────────────────────────

export function isGroupTextCommand(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower) return false;
  if (/^(?:\/link-group\s+|\/link\s+|ผูกโปรเจค\s+|ผูกกลุ่ม\s+)?\d{6}$/i.test(lower)) return true;
  if (['เข้าทีม', 'สมัครทีม', 'join', 'join project', 'ผูกบัญชี', 'สมัคร', 'เข้าโปรเจค', 'เข้าโปรเจกต์'].includes(lower)) return true;
  if (['help', 'ช่วยเหลือ', 'ลิงก์', 'link', 'เข้าเว็บ', 'เข้าระบบ', 'login', 'เปิดระบบ', 'ดูเอกสาร'].includes(lower)) return true;
  if (['สถานะ', 'สรุปโปรเจค', 'สรุปโปรเจกต์', 'สรุปภาษี', 'ยอดภาษี', 'ใบล่าสุด', 'เอกสารล่าสุด', 'ล่าสุด', 'ใบเดือนนี้', 'เอกสารเดือนนี้'].includes(lower)) return true;
  if (/^(?:ส่งใบ|ขอใบ|ดูใบ|หาใบ|pdf|ค้นหา)\s+.+/i.test(lower)) return true;
  return false;
}

// ── Document template field handling (LINE pending-intake editor) ────

export type DocumentTemplateField = {
  key: string;
  label: string;
  hint: string;
  type: 'text' | 'tax_id' | 'date' | 'money';
};

export const PURCHASE_TEMPLATE_FIELDS: DocumentTemplateField[] = [
  { key: 'supplierName', label: 'ชื่อผู้ขาย', hint: 'เช่น บริษัท ABC จำกัด', type: 'text' },
  { key: 'supplierTaxId', label: 'เลขผู้เสียภาษีผู้ขาย (13 หลัก)', hint: 'เช่น 0105567890123', type: 'tax_id' },
  { key: 'invoiceDate', label: 'วันที่เอกสาร', hint: 'เช่น 27/04/2567 หรือ 2026-04-27', type: 'date' },
  { key: 'total', label: 'ยอดรวมทั้งสิ้น', hint: 'เช่น 10700', type: 'money' },
];

export const BANK_TRANSFER_TEMPLATE_FIELDS: DocumentTemplateField[] = [
  { key: 'payment.amount', label: 'ยอดโอน', hint: 'เช่น 10700', type: 'money' },
  { key: 'payment.paidAt', label: 'วันที่โอน', hint: 'เช่น 27/04/2567 หรือ 2026-04-27', type: 'date' },
  { key: 'payment.reference', label: 'เลขอ้างอิงสลิป', hint: 'เช่น เลข reference/transaction id บนสลิป', type: 'text' },
];

export function templateFieldsFor(result: OcrResult): DocumentTemplateField[] {
  if (result.documentType === 'bank_transfer' || result.documentType === 'payment_advice') {
    return BANK_TRANSFER_TEMPLATE_FIELDS;
  }
  if (PURCHASE_RECORD_DOCUMENT_TYPES.has(result.documentType)) {
    return PURCHASE_TEMPLATE_FIELDS;
  }
  return [];
}

export function getTemplateValue(result: OcrResult, key: string): unknown {
  if (key.startsWith('payment.')) {
    const paymentKey = key.slice('payment.'.length) as keyof NonNullable<OcrResult['payment']>;
    return result.payment?.[paymentKey];
  }
  return (result as unknown as Record<string, unknown>)[key];
}

export function setTemplateValue(result: OcrResult, key: string, value: string | number) {
  if (key.startsWith('payment.')) {
    const paymentKey = key.slice('payment.'.length);
    result.payment = { ...(result.payment ?? {}), [paymentKey]: value };
    if (paymentKey === 'amount') result.total = Number(value);
    if (paymentKey === 'paidAt') result.invoiceDate = String(value);
    if (paymentKey === 'reference') result.invoiceNumber = String(value);
    return;
  }
  (result as unknown as Record<string, unknown>)[key] = value;
}

export function missingTemplateFields(result: OcrResult): DocumentTemplateField[] {
  return templateFieldsFor(result).filter((field) => {
    const value = getTemplateValue(result, field.key);
    return value === undefined || value === null || value === '' || value === 0;
  });
}

export function parseTemplateReply(field: DocumentTemplateField, text: string): string | number | null {
  const trimmed = text.trim();
  if (field.type === 'money') {
    const num = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(num) && num > 0 ? num : null;
  }
  if (field.type === 'tax_id') {
    const digits = trimmed.replace(/\D/g, '');
    return digits.length === 13 ? digits : null;
  }
  if (field.type === 'date') {
    const thaiMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (thaiMatch) {
      let year = Number(thaiMatch[3]);
      if (year > 2500) year -= 543;
      return `${year}-${thaiMatch[2].padStart(2, '0')}-${thaiMatch[1].padStart(2, '0')}`;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
  }
  return trimmed || null;
}

// ── Mime detection + identity masking ────────────────────────────────

export function detectLineFileMimeType(buffer: Buffer, headerContentType: string, messageType?: string): string {
  const header = headerContentType.toLowerCase();
  if (header.includes('pdf') || buffer.slice(0, 4).toString() === '%PDF') return 'application/pdf';
  if (header.includes('png') || buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (header.includes('webp') || buffer.slice(0, 4).toString() === 'RIFF') return 'image/webp';
  if (header.includes('jpeg') || header.includes('jpg') || (buffer[0] === 0xff && buffer[1] === 0xd8)) return 'image/jpeg';
  if (messageType === 'image') return 'image/jpeg';
  return headerContentType || 'application/octet-stream';
}

export function maskLineUserId(lineUserId?: string | null): string | null {
  if (!lineUserId) return null;
  if (lineUserId.length <= 10) return 'linked';
  return `${lineUserId.slice(0, 3)}…${lineUserId.slice(-4)}`;
}

// ── OcrResult convenience accessors ──────────────────────────────────

export function paymentAmount(result: OcrResult): number {
  return result.payment?.amount || result.total || 0;
}

export function paymentReference(result: OcrResult): string {
  return result.payment?.reference || result.invoiceNumber || '';
}

export function hasUsefulLineOcrData(result?: OcrResult): boolean {
  return !!(result && (result.supplierName || result.invoiceNumber || result.total || result.vatAmount || paymentAmount(result)));
}

export function closeAmount(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1;
}
