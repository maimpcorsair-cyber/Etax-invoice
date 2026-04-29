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
  /** Tailwind bg colors for color swatch preview [header, accent, body] */
  swatches: [string, string, string];
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
    id: 'builtin:simple-slate',
    nameTh: 'เรียบง่าย — เทาเข้ม',
    nameEn: 'Simple Slate',
    descriptionTh: 'สะอาด อ่านง่าย ใช้ได้กับลูกค้าทุกกลุ่ม โทนเทาเข้มแบบมืออาชีพ',
    descriptionEn: 'Clean, readable, and professional in a calm slate tone.',
    tagTh: 'เทาเข้ม',
    tagEn: 'Slate',
    accentClass: 'border-slate-200 bg-slate-50 text-slate-700',
    swatches: ['bg-slate-700', 'bg-slate-400', 'bg-slate-100'],
    supports: ALL_DOCUMENT_TYPES,
  },
  {
    id: 'builtin:official-navy',
    nameTh: 'ทางการ — น้ำเงินกรมท่า',
    nameEn: 'Official Navy',
    descriptionTh: 'โทนน้ำเงินกรมท่า เหมาะกับเอกสารบริษัท งานราชการ และเอกสารที่ต้องดูน่าเชื่อถือ',
    descriptionEn: 'Formal navy styling for corporate, government, and high-trust documents.',
    tagTh: 'น้ำเงินกรมท่า',
    tagEn: 'Navy',
    accentClass: 'border-blue-200 bg-blue-50 text-blue-700',
    swatches: ['bg-blue-900', 'bg-blue-500', 'bg-blue-50'],
    supports: ALL_DOCUMENT_TYPES,
  },
  {
    id: 'builtin:luxury-gold',
    nameTh: 'หรูหรา — ดำทอง',
    nameEn: 'Luxury Gold',
    descriptionTh: 'โทนดำทอง พรีเมียม เหมาะกับแบรนด์ที่อยากให้เอกสารดูแพงและมีระดับ',
    descriptionEn: 'A premium black-and-gold tone for elevated brand documents.',
    tagTh: 'ดำทอง',
    tagEn: 'Gold',
    accentClass: 'border-yellow-300 bg-yellow-50 text-yellow-800',
    swatches: ['bg-neutral-900', 'bg-yellow-400', 'bg-yellow-50'],
    supports: ALL_DOCUMENT_TYPES,
  },
  {
    id: 'builtin:local-friendly',
    nameTh: 'อบอุ่น — เป็นกันเอง',
    nameEn: 'Local Friendly',
    descriptionTh: 'โทนอบอุ่น ตัวเอกสารดูเป็นมิตร อ่านง่าย เหมาะกับร้านค้าและธุรกิจทั่วไป',
    descriptionEn: 'Warm, approachable, and easy to read for everyday businesses.',
    tagTh: 'อบอุ่น',
    tagEn: 'Warm',
    accentClass: 'border-orange-200 bg-orange-50 text-orange-700',
    swatches: ['bg-orange-600', 'bg-amber-400', 'bg-orange-50'],
    supports: ALL_DOCUMENT_TYPES,
  },
  {
    id: 'builtin:accounting-green',
    nameTh: 'บัญชี — เขียวสุภาพ',
    nameEn: 'Accounting Green',
    descriptionTh: 'โทนเขียว สุภาพ เหมาะกับใบเสร็จ งานรับชำระ และเอกสารที่เน้นความเรียบร้อย',
    descriptionEn: 'A tidy green tone for receipts, payment records, and accounting workflows.',
    tagTh: 'เขียว',
    tagEn: 'Green',
    accentClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    swatches: ['bg-emerald-700', 'bg-emerald-400', 'bg-emerald-50'],
    supports: ALL_DOCUMENT_TYPES,
  },
  {
    id: 'builtin:soft-cyan',
    nameTh: 'ทันสมัย — ฟ้าเขียว',
    nameEn: 'Modern Cyan',
    descriptionTh: 'โทนฟ้าอมเขียว ดูทันสมัย เหมาะกับบริษัทเทคโนโลยีและบริการดิจิทัล',
    descriptionEn: 'A modern cyan tone for technology and digital-service companies.',
    tagTh: 'ฟ้าเขียว',
    tagEn: 'Cyan',
    accentClass: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    swatches: ['bg-cyan-700', 'bg-cyan-400', 'bg-cyan-100'],
    supports: ALL_DOCUMENT_TYPES,
  },
];

export function supportsDocumentType(template: BuiltinDocumentTemplate, type: InvoiceType) {
  return template.supports.includes(type);
}
