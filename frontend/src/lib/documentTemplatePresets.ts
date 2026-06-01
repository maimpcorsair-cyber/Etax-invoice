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

export const DEFAULT_SYSTEM_DOCUMENT_TEMPLATE_ID = 'builtin:minimal-dark-accent';
export const DEFAULT_SYSTEM_DOCUMENT_TEMPLATE_SWATCHES: BuiltinDocumentTemplate['swatches'] = [
  'bg-white',
  'bg-gray-900',
  'bg-black',
];

// Curated set. Every built-in template renders through the same formal A4
// base (clean white paper, thin accent rule, full accounting footer); the
// only thing a template changes is the accent colour. So we keep a small,
// modern set of distinct accent tones instead of dozens of near-identical
// entries. tagEn drives the dropdown grouping (Minimal → "เรียบง่าย/ทางการ",
// Cute → "สีพาสเทล/ร้านค้า"). Builders expose a separate system-default
// entry that currently resolves to the formal monochrome preset.
export const builtinDocumentTemplates: BuiltinDocumentTemplate[] = [
  // ── ทางการ / Professional ───────────────────────────────────────────
  {
    id: 'builtin:pro-navy',
    nameTh: 'มืออาชีพ · กรมท่า',
    nameEn: 'Professional · Navy',
    descriptionTh: 'น้ำเงินกรมท่า ดูทางการและน่าเชื่อถือ เหมาะกับองค์กรและงาน B2B',
    descriptionEn: 'Navy accent — corporate and trustworthy, ideal for B2B.',
    tagTh: 'ทางการ',
    tagEn: 'Minimal',
    accentClass: 'border-blue-200 bg-white text-blue-900',
    swatches: ['bg-white', 'bg-blue-900', 'bg-slate-800'],
    supports: ALL_DOCUMENT_TYPES,
  },
  {
    id: 'builtin:minimal-gray',
    nameTh: 'มินิมอล · เทา',
    nameEn: 'Minimal · Slate',
    descriptionTh: 'เทาเรียบ สะอาดตา เป็นกลาง ใช้ได้กับธุรกิจทุกประเภท',
    descriptionEn: 'Neutral slate — clean and understated for any business.',
    tagTh: 'ทางการ',
    tagEn: 'Minimal',
    accentClass: 'border-gray-200 bg-white text-gray-700',
    swatches: ['bg-white', 'bg-gray-500', 'bg-gray-800'],
    supports: ALL_DOCUMENT_TYPES,
  },
  {
    id: 'builtin:minimal-dark-accent',
    nameTh: 'ขาว-ดำ · ทางการ',
    nameEn: 'Mono · Formal',
    descriptionTh: 'ขาว-ดำ คอนทราสต์สูง คมและเป็นทางการที่สุด',
    descriptionEn: 'High-contrast black & white — the most formal look.',
    tagTh: 'ทางการ',
    tagEn: 'Minimal',
    accentClass: 'border-gray-300 bg-white text-gray-900',
    swatches: ['bg-white', 'bg-gray-900', 'bg-black'],
    supports: ALL_DOCUMENT_TYPES,
  },
  {
    id: 'builtin:pro-corp-teal',
    nameTh: 'เขียวธุรกิจ',
    nameEn: 'Business · Teal',
    descriptionTh: 'เขียวน้ำทะเล ทันสมัยแต่สุภาพ เหมาะกับงานบริการและเทค',
    descriptionEn: 'Teal accent — modern yet professional, great for services/tech.',
    tagTh: 'ทางการ',
    tagEn: 'Minimal',
    accentClass: 'border-teal-200 bg-white text-teal-800',
    swatches: ['bg-white', 'bg-teal-700', 'bg-slate-800'],
    supports: ALL_DOCUMENT_TYPES,
  },
  // ── สี / ร้านค้า ────────────────────────────────────────────────────
  {
    id: 'builtin:cute-pastel-pink',
    nameTh: 'ชมพูพาสเทล',
    nameEn: 'Soft Pink',
    descriptionTh: 'ชมพูนุ่ม อบอุ่นเป็นมิตร เหมาะกับร้านค้าและงานไลฟ์สไตล์',
    descriptionEn: 'Soft pink — warm and friendly for shops and lifestyle brands.',
    tagTh: 'ร้านค้า',
    tagEn: 'Cute',
    accentClass: 'border-pink-200 bg-white text-pink-700',
    swatches: ['bg-white', 'bg-pink-400', 'bg-pink-900'],
    supports: ALL_DOCUMENT_TYPES,
  },
  {
    id: 'builtin:cute-baby-blue',
    nameTh: 'ฟ้าพาสเทล',
    nameEn: 'Soft Blue',
    descriptionTh: 'ฟ้าอ่อนสดใส สะอาดและเป็นมิตร',
    descriptionEn: 'Light blue — fresh, clean and approachable.',
    tagTh: 'ร้านค้า',
    tagEn: 'Cute',
    accentClass: 'border-sky-200 bg-white text-sky-700',
    swatches: ['bg-white', 'bg-sky-400', 'bg-sky-900'],
    supports: ALL_DOCUMENT_TYPES,
  },
  {
    id: 'builtin:minimal-beige',
    nameTh: 'ครีม · เบจ',
    nameEn: 'Warm Beige',
    descriptionTh: 'โทนครีมอบอุ่น ดูพรีเมียม เหมาะกับงานคราฟต์และคาเฟ่',
    descriptionEn: 'Warm beige — premium feel for craft and café brands.',
    tagTh: 'ร้านค้า',
    tagEn: 'Cute',
    accentClass: 'border-amber-200 bg-white text-amber-800',
    swatches: ['bg-white', 'bg-amber-600', 'bg-amber-900'],
    supports: ALL_DOCUMENT_TYPES,
  },
];

export function supportsDocumentType(template: BuiltinDocumentTemplate, type: InvoiceType) {
  return template.supports.includes(type);
}
