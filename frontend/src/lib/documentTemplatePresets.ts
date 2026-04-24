import type { InvoiceType } from '../types';

export interface BuiltinDocumentTemplate {
  id: string;
  nameTh: string;
  nameEn: string;
  descriptionTh: string;
  descriptionEn: string;
  tagTh: string;
  tagEn: string;
  accentClass: string;
  supports: InvoiceType[];
}

const ALL_DOCUMENT_TYPES: InvoiceType[] = [
  'tax_invoice',
  'tax_invoice_receipt',
  'receipt',
  'credit_note',
  'debit_note',
];

export const builtinDocumentTemplates: BuiltinDocumentTemplate[] = [
  {
    id: 'builtin:executive-blue',
    nameTh: 'Executive Blue',
    nameEn: 'Executive Blue',
    descriptionTh: 'โทนองค์กร สุภาพ เหมาะกับใบกำกับภาษีและใบแจ้งหนี้ที่ต้องการความน่าเชื่อถือสูง',
    descriptionEn: 'Corporate, calm, and credible for formal tax invoices and enterprise billing.',
    tagTh: 'องค์กร',
    tagEn: 'Corporate',
    accentClass: 'border-blue-200 bg-blue-50 text-blue-700',
    supports: ALL_DOCUMENT_TYPES,
  },
  {
    id: 'builtin:paid-stamp',
    nameTh: 'Paid Stamp Receipt',
    nameEn: 'Paid Stamp Receipt',
    descriptionTh: 'มีบล็อกสถานะรับชำระเงินชัดเจน เหมาะกับใบกำกับภาษี/ใบเสร็จ และใบเสร็จรับเงิน',
    descriptionEn: 'Highlights payment confirmation clearly for receipts and paid tax invoices.',
    tagTh: 'ชำระแล้ว',
    tagEn: 'Paid',
    accentClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    supports: ['tax_invoice_receipt', 'receipt'],
  },
  {
    id: 'builtin:bank-transfer',
    nameTh: 'Bank Transfer Ready',
    nameEn: 'Bank Transfer Ready',
    descriptionTh: 'เน้นข้อมูลอ้างอิงการโอน การตรวจยอด และเงื่อนไขรับเงิน เหมาะกับงาน B2B',
    descriptionEn: 'Adds transfer reference, reconciliation, and payment-term emphasis for B2B billing.',
    tagTh: 'โอนเงิน',
    tagEn: 'Transfer',
    accentClass: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    supports: ['tax_invoice', 'tax_invoice_receipt', 'receipt'],
  },
  {
    id: 'builtin:modern-minimal',
    nameTh: 'Modern Minimal',
    nameEn: 'Modern Minimal',
    descriptionTh: 'สะอาด อ่านง่าย ลดสิ่งรบกวน เหมาะกับลูกค้าที่ต้องการเอกสารดูพรีเมียมแต่ไม่เยอะ',
    descriptionEn: 'Clean, quiet, and premium with minimal visual noise.',
    tagTh: 'มินิมอล',
    tagEn: 'Minimal',
    accentClass: 'border-slate-200 bg-slate-50 text-slate-700',
    supports: ALL_DOCUMENT_TYPES,
  },
  {
    id: 'builtin:credit-control',
    nameTh: 'Credit Control',
    nameEn: 'Credit Control',
    descriptionTh: 'เน้นเหตุผลการลดหนี้ เอกสารอ้างอิง และผลกระทบยอดภาษี เหมาะกับใบลดหนี้',
    descriptionEn: 'Frames credit-note reason, reference document, and VAT impact for audit clarity.',
    tagTh: 'ลดหนี้',
    tagEn: 'Credit',
    accentClass: 'border-amber-200 bg-amber-50 text-amber-700',
    supports: ['credit_note'],
  },
  {
    id: 'builtin:debit-adjustment',
    nameTh: 'Debit Adjustment',
    nameEn: 'Debit Adjustment',
    descriptionTh: 'เน้นเหตุผลการเพิ่มหนี้และรายการปรับปรุง เหมาะกับเอกสารเพิ่มหนี้ที่ต้องตรวจสอบง่าย',
    descriptionEn: 'Clarifies adjustment reason and added-charge context for debit notes.',
    tagTh: 'เพิ่มหนี้',
    tagEn: 'Debit',
    accentClass: 'border-rose-200 bg-rose-50 text-rose-700',
    supports: ['debit_note'],
  },
  {
    id: 'builtin:compliance-ledger',
    nameTh: 'Compliance Ledger',
    nameEn: 'Compliance Ledger',
    descriptionTh: 'เพิ่มจุดย้ำเลขที่เอกสาร วันที่ ผู้เสียภาษี และ audit trail สำหรับงานบัญชีที่จริงจัง',
    descriptionEn: 'Adds audit-focused checkpoints for document number, tax identity, dates, and traceability.',
    tagTh: 'ตรวจสอบง่าย',
    tagEn: 'Audit',
    accentClass: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    supports: ALL_DOCUMENT_TYPES,
  },
];

export function supportsDocumentType(template: BuiltinDocumentTemplate, type: InvoiceType) {
  return template.supports.includes(type);
}
