import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import { amountInWordsThai, amountInWordsEnglish } from './invoiceService';
import { logger } from '../config/logger';
import prisma from '../config/database';

type Language = 'th' | 'en' | 'both';

interface PdfInvoiceData {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date | null;
  type: string;
  language: Language;
  seller: {
    nameTh: string;
    nameEn?: string | null;
    taxId: string;
    branchCode: string;
    branchNameTh?: string | null;
    addressTh: string;
    addressEn?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    logoUrl?: string | null;
  };
  buyer: {
    nameTh: string;
    nameEn?: string | null;
    taxId: string;
    branchCode: string;
    addressTh: string;
    addressEn?: string | null;
  };
  items: {
    nameTh: string;
    nameEn?: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    discount: number;
    vatType: string;
    amount: number;
    vatAmount: number;
    totalAmount: number;
  }[];
  subtotal: number;
  vatAmount: number;
  discount: number;
  total: number;
  notes?: string | null;
  paymentMethod?: string | null;
  documentLogoUrl?: string | null;
  showCompanyLogo?: boolean;
  templateId?: string | null;
  templateName?: string | null;
  templateHtml?: string | null;
  templateNote?: string | null;
  documentMode?: 'ordinary' | 'electronic' | null;
  bankPaymentInfo?: string | null;
  signatureImageUrl?: string | null;
  signerName?: string | null;
  signerTitle?: string | null;
  onlineViewUrl?: string | null;
  onlineQrDataUrl?: string | null;
}

interface CustomerStatementPdfData {
  language: Language;
  companyName: string;
  customer: {
    nameTh: string;
    nameEn?: string | null;
    taxId: string;
    addressTh?: string | null;
    addressEn?: string | null;
    email?: string | null;
  };
  generatedAt: Date;
  summary: {
    totalOutstanding: number;
    overdueOutstanding: number;
    currentOutstanding: number;
    totalBilled: number;
    totalCredits: number;
    totalReceived: number;
  };
  aging: {
    current: number;
    days1To30: number;
    days31To60: number;
    days61To90: number;
    days90Plus: number;
  };
  entries: Array<{
    invoiceNumber: string;
    type: string;
    status: string;
    invoiceDate: Date;
    dueDate?: Date | null;
    signedTotal: number;
    paidAmount: number;
    outstandingAmount: number;
    runningBalance: number;
    ageDays: number;
  }>;
}

const DOC_TITLE: Record<string, Record<Language | 'both', string>> = {
  tax_invoice: { th: 'ใบกำกับภาษี', en: 'Tax Invoice', both: 'ใบกำกับภาษี / Tax Invoice' },
  tax_invoice_receipt: { th: 'ใบกำกับภาษี/ใบเสร็จรับเงิน', en: 'Tax Invoice / Receipt', both: 'ใบกำกับภาษี/ใบเสร็จรับเงิน / Tax Invoice / Receipt' },
  receipt: { th: 'ใบเสร็จรับเงิน', en: 'Receipt', both: 'ใบเสร็จรับเงิน / Receipt' },
  credit_note: { th: 'ใบลดหนี้', en: 'Credit Note', both: 'ใบลดหนี้ / Credit Note' },
  debit_note: { th: 'ใบเพิ่มหนี้', en: 'Debit Note', both: 'ใบเพิ่มหนี้ / Debit Note' },
};

const ALL_DOCUMENT_TYPES = ['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note'];

const BUILTIN_DOCUMENT_TEMPLATES: Record<string, {
  name: string;
  supportedTypes: string[];
}> = {
  'builtin:simple-slate': { name: 'เรียบง่าย', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:official-navy': { name: 'ทางการ', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:luxury-gold': { name: 'หรูหรา', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:local-friendly': { name: 'ชาวบ้าน อ่านง่าย', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:accounting-green': { name: 'บัญชีเขียว', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:soft-cyan': { name: 'ทันสมัย', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:executive-blue': { name: 'ทางการ', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:paid-stamp': { name: 'บัญชีเขียว', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:bank-transfer': { name: 'ทันสมัย', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:modern-minimal': { name: 'เรียบง่าย', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:credit-control': { name: 'ทางการ', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:debit-adjustment': { name: 'ทางการ', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:compliance-ledger': { name: 'ทางการ', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-white': { name: 'Minimal White', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-gray': { name: 'Minimal Gray', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-line': { name: 'Minimal Line', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-sans': { name: 'Minimal Sans', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-space': { name: 'Minimal Space', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-pink':   { name: 'Cute Pink',   supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-blue':   { name: 'Cute Blue',   supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-yellow': { name: 'Cute Yellow', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-green':  { name: 'Cute Green',  supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-kawaii': { name: 'Cute Kawaii', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-blue-modern':   { name: 'Pro สีน้ำเงิน',    supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-bw':            { name: 'Pro ขาวดำ',        supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-navy':          { name: 'Pro กรมท่า',       supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-soft-pastel':   { name: 'Pro พาสเทล',      supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-corp-teal':     { name: 'Pro เขียวน้ำ',    supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-elegant-beige': { name: 'Pro เบจ',          supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-green-eco':     { name: 'Pro เขียว Eco',   supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-gradient':      { name: 'Pro Gradient',     supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-classic-orange':{ name: 'Pro ส้มคลาสสิก', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-biz-clean':     { name: 'Pro สะอาด',       supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:crayon':            { name: 'Crayon Drawing',   supportedTypes: ALL_DOCUMENT_TYPES },
};

function formatDateTh(date: Date): string {
  const buddhistYear = date.getFullYear() + 543;
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  return `${date.getDate()} ${months[date.getMonth()]} ${buddhistYear}`;
}

function formatDateEn(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveTemplateLanguageHtml(template: { htmlTh: string; htmlEn: string }, language: Language) {
  if (language === 'en') return template.htmlEn;
  if (language === 'th') return template.htmlTh;
  return `${template.htmlTh}\n${template.htmlEn}`;
}

function resolveBuiltinTemplate(type: string, language: Language, templateId?: string | null) {
  if (!templateId?.startsWith('builtin:')) return null;

  const template = BUILTIN_DOCUMENT_TEMPLATES[templateId];
  if (!template || !template.supportedTypes.includes(type)) return null;

  return {
    id: templateId,
    name: template.name,
    html: '',
  };
}

function compileTemplateHtml(templateHtml: string, context: Record<string, string>): string {
  return templateHtml.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => context[key] ?? '');
}

function resolveDocumentTheme(templateId?: string | null) {
  const themes: Record<string, {
    className: string;
    accent: string;
    accent2: string;
    soft: string;
    ink: string;
    label: string;
    mark: string;
  }> = {
    'builtin:simple-slate': { className: 'theme-minimal', accent: '#475569', accent2: '#1e293b', soft: '#f8fafc', ink: '#111827', label: 'เรียบง่าย', mark: '' },
    'builtin:official-navy': { className: 'theme-official', accent: '#1d4ed8', accent2: '#0f172a', soft: '#eef4ff', ink: '#102044', label: 'ทางการ', mark: '' },
    'builtin:luxury-gold': { className: 'theme-luxury', accent: '#b7791f', accent2: '#17120a', soft: '#fff8e6', ink: '#231a0b', label: 'หรูหรา', mark: '' },
    'builtin:local-friendly': { className: 'theme-local', accent: '#c2410c', accent2: '#7c2d12', soft: '#fff7ed', ink: '#431407', label: 'ชาวบ้าน อ่านง่าย', mark: '' },
    'builtin:accounting-green': { className: 'theme-green', accent: '#059669', accent2: '#064e3b', soft: '#ecfdf5', ink: '#063d2a', label: 'บัญชีเขียว', mark: '' },
    'builtin:soft-cyan': { className: 'theme-cyan', accent: '#0891b2', accent2: '#155e75', soft: '#ecfeff', ink: '#123d4b', label: 'ทันสมัย', mark: '' },
    'builtin:executive-blue': { className: 'theme-executive', accent: '#1d4ed8', accent2: '#0f172a', soft: '#eef4ff', ink: '#102044', label: 'Executive Blue', mark: 'EXECUTIVE' },
    'builtin:paid-stamp': { className: 'theme-paid', accent: '#059669', accent2: '#047857', soft: '#ecfdf5', ink: '#063d2a', label: 'Paid Stamp Receipt', mark: 'PAID' },
    'builtin:bank-transfer': { className: 'theme-transfer', accent: '#0891b2', accent2: '#155e75', soft: '#ecfeff', ink: '#123d4b', label: 'Bank Transfer Ready', mark: 'TRANSFER' },
    'builtin:modern-minimal': { className: 'theme-minimal', accent: '#334155', accent2: '#0f172a', soft: '#f8fafc', ink: '#111827', label: 'Modern Minimal', mark: 'MINIMAL' },
    'builtin:credit-control': { className: 'theme-credit', accent: '#d97706', accent2: '#92400e', soft: '#fffbeb', ink: '#4a2d08', label: 'Credit Control', mark: 'CREDIT' },
    'builtin:debit-adjustment': { className: 'theme-debit', accent: '#e11d48', accent2: '#9f1239', soft: '#fff1f2', ink: '#4c1020', label: 'Debit Adjustment', mark: 'DEBIT' },
    'builtin:compliance-ledger': { className: 'theme-ledger', accent: '#4f46e5', accent2: '#312e81', soft: '#eef2ff', ink: '#1f1b4d', label: 'Compliance Ledger', mark: 'AUDIT' },
    'builtin:minimal-white': { className: 'theme-minimal-white', accent: '#374151', accent2: '#111827', soft: '#f9fafb', ink: '#111827', label: 'Minimal White', mark: '' },
    'builtin:minimal-gray': { className: 'theme-minimal-gray', accent: '#6b7280', accent2: '#374151', soft: '#f3f4f6', ink: '#111827', label: 'Minimal Gray', mark: '' },
    'builtin:minimal-line': { className: 'theme-minimal-line', accent: '#0d9488', accent2: '#0f766e', soft: '#f0fdfa', ink: '#134e4a', label: 'Minimal Line', mark: '' },
    'builtin:minimal-sans': { className: 'theme-minimal-sans', accent: '#1f2937', accent2: '#111827', soft: '#f9fafb', ink: '#111827', label: 'Minimal Sans', mark: '' },
    'builtin:minimal-space': { className: 'theme-minimal-space', accent: '#94a3b8', accent2: '#475569', soft: '#f8fafc', ink: '#1e293b', label: 'Minimal Space', mark: '' },
    'builtin:cute-pink':   { className: 'theme-cute-pink',   accent: '#f472b6', accent2: '#be185d', soft: '#fdf2f8', ink: '#831843', label: 'Cute Pink',   mark: '' },
    'builtin:cute-blue':   { className: 'theme-cute-blue',   accent: '#60a5fa', accent2: '#1d4ed8', soft: '#eff6ff', ink: '#1e3a5f', label: 'Cute Blue',   mark: '' },
    'builtin:cute-yellow': { className: 'theme-cute-yellow', accent: '#fbbf24', accent2: '#d97706', soft: '#fffbeb', ink: '#78350f', label: 'Cute Yellow', mark: '' },
    'builtin:cute-green':  { className: 'theme-cute-green',  accent: '#34d399', accent2: '#059669', soft: '#ecfdf5', ink: '#064e3b', label: 'Cute Green',  mark: '' },
    'builtin:cute-kawaii': { className: 'theme-cute-kawaii', accent: '#a78bfa', accent2: '#7c3aed', soft: '#f5f3ff', ink: '#4c1d95', label: 'Cute Kawaii', mark: '' },
    'builtin:pro-blue-modern':   { className: 'theme-pro-blue-modern',   accent: '#1e40af', accent2: '#1e3a8a', soft: '#dbeafe', ink: '#1e40af', label: 'Pro สีน้ำเงิน',    mark: '' },
    'builtin:pro-bw':            { className: 'theme-pro-bw',            accent: '#111827', accent2: '#111827', soft: '#f3f4f6', ink: '#111827', label: 'Pro ขาวดำ',        mark: '' },
    'builtin:pro-navy':          { className: 'theme-pro-navy',          accent: '#1e3a5f', accent2: '#1e3a5f', soft: '#e8edf5', ink: '#1e3a5f', label: 'Pro กรมท่า',       mark: '' },
    'builtin:pro-soft-pastel':   { className: 'theme-pro-soft-pastel',   accent: '#7c3aed', accent2: '#4c1d95', soft: '#f5f3ff', ink: '#7c3aed', label: 'Pro พาสเทล',      mark: '' },
    'builtin:pro-corp-teal':     { className: 'theme-pro-corp-teal',     accent: '#0f766e', accent2: '#0f766e', soft: '#ccfbf1', ink: '#0f766e', label: 'Pro เขียวน้ำ',    mark: '' },
    'builtin:pro-elegant-beige': { className: 'theme-pro-elegant-beige', accent: '#92400e', accent2: '#92400e', soft: '#fffbeb', ink: '#92400e', label: 'Pro เบจ',          mark: '' },
    'builtin:pro-green-eco':     { className: 'theme-pro-green-eco',     accent: '#166534', accent2: '#166534', soft: '#dcfce7', ink: '#166534', label: 'Pro เขียว Eco',   mark: '' },
    'builtin:pro-gradient':      { className: 'theme-pro-gradient',      accent: '#7c3aed', accent2: '#1e40af', soft: '#ede9fe', ink: '#7c3aed', label: 'Pro Gradient',     mark: '' },
    'builtin:pro-classic-orange':{ className: 'theme-pro-classic-orange',accent: '#c2410c', accent2: '#c2410c', soft: '#ffedd5', ink: '#c2410c', label: 'Pro ส้มคลาสสิก', mark: '' },
    'builtin:pro-biz-clean':     { className: 'theme-pro-biz-clean',     accent: '#334155', accent2: '#334155', soft: '#f1f5f9', ink: '#334155', label: 'Pro สะอาด',       mark: '' },
    'builtin:crayon':            { className: 'theme-crayon', accent: '#f43f5e', accent2: '#8b5cf6', soft: '#fff7f0', ink: '#1a1a2e', label: 'Crayon', mark: '✏️' },
  };

  return themes[templateId ?? ''] ?? { className: 'theme-standard', accent: '#1e3a8a', accent2: '#2563eb', soft: '#f2f6fd', ink: '#15254b', label: 'System Standard', mark: 'STANDARD' };
}

function buildOnlineViewUrl(invoiceNumber: string) {
  const baseUrl = process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'https://etax-invoice.vercel.app';
  return `${baseUrl.replace(/\/$/, '')}/verify/${encodeURIComponent(invoiceNumber)}`;
}

async function enrichElectronicDocument(data: PdfInvoiceData): Promise<PdfInvoiceData> {
  if (data.documentMode !== 'electronic' || data.onlineQrDataUrl) return data;

  const onlineViewUrl = data.onlineViewUrl ?? buildOnlineViewUrl(data.invoiceNumber);
  const onlineQrDataUrl = await QRCode.toDataURL(onlineViewUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 180,
  });

  return { ...data, onlineViewUrl, onlineQrDataUrl };
}

function buildHtml(data: PdfInvoiceData): string {
  const isTh = data.language === 'th';
  const isEn = data.language === 'en';
  const isBoth = data.language === 'both';

  const docTitle = DOC_TITLE[data.type]?.[data.language] ?? 'ใบกำกับภาษี';
  const dateStr = isTh ? formatDateTh(data.invoiceDate) : formatDateEn(data.invoiceDate);
  const totalWords = isTh
    ? amountInWordsThai(data.total)
    : isEn
      ? amountInWordsEnglish(data.total)
      : `${amountInWordsThai(data.total)} / ${amountInWordsEnglish(data.total)}`;

  const fontUrl = 'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap';
  const theme = resolveDocumentTheme(data.templateId);

  const itemRows = data.items.map((item, idx) => {
    const nameLine = isBoth
      ? `<span class="item-name">${item.nameTh}</span>${item.nameEn ? `<span class="item-subname">${item.nameEn}</span>` : ''}`
      : isTh
        ? `<span class="item-name">${item.nameTh}</span>`
        : `<span class="item-name">${item.nameEn ?? item.nameTh}</span>`;
    return `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${nameLine}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:center">${item.unit}</td>
        <td style="text-align:right">${formatCurrency(item.unitPrice)}</td>
        <td style="text-align:center">${item.discount > 0 ? item.discount + '%' : '-'}</td>
        <td style="text-align:center">${item.vatType === 'vatExempt' ? (isTh ? 'ยกเว้น' : 'Exempt') : item.vatType === 'vatZero' ? '0%' : '7%'}</td>
        <td style="text-align:right">${formatCurrency(item.amount)}</td>
        <td style="text-align:right">${formatCurrency(item.vatAmount)}</td>
        <td style="text-align:right"><strong>${formatCurrency(item.totalAmount)}</strong></td>
      </tr>`;
  }).join('');

  const labels = {
    seller: isTh ? 'ผู้ขาย' : isEn ? 'Seller' : 'ผู้ขาย / Seller',
    buyer: isTh ? 'ผู้ซื้อ' : isEn ? 'Buyer' : 'ผู้ซื้อ / Buyer',
    taxId: isTh ? 'เลขประจำตัวผู้เสียภาษี' : isEn ? 'Tax ID' : 'เลขประจำตัวผู้เสียภาษี / Tax ID',
    branch: isTh ? 'สาขา' : isEn ? 'Branch' : 'สาขา / Branch',
    branchHeadOffice: isTh ? 'สำนักงานใหญ่' : isEn ? 'Head Office' : 'สำนักงานใหญ่ / Head Office',
    no: isTh ? 'ลำดับ' : isEn ? 'No.' : 'No.',
    item: isTh ? 'รายการ' : isEn ? 'Description' : 'รายการ / Description',
    qty: isTh ? 'จำนวน' : isEn ? 'Qty' : 'Qty',
    unit: isTh ? 'หน่วย' : isEn ? 'Unit' : 'Unit',
    price: isTh ? 'ราคา/หน่วย' : isEn ? 'Unit Price' : 'Unit Price',
    disc: isTh ? 'ส่วนลด' : isEn ? 'Disc.' : 'Disc.',
    vat: isTh ? 'VAT' : isEn ? 'VAT' : 'VAT',
    amount: isTh ? 'ราคา' : isEn ? 'Amount' : 'Amount',
    vatAmt: isTh ? 'ภาษี' : isEn ? 'Tax' : 'Tax',
    total: isTh ? 'รวม' : isEn ? 'Total' : 'Total',
    subtotal: isTh ? 'ยอดรวมก่อน VAT' : isEn ? 'Subtotal (excl. VAT)' : 'Subtotal',
    vatTotal: isTh ? 'ภาษีมูลค่าเพิ่ม (7%)' : isEn ? 'VAT (7%)' : 'VAT (7%)',
    grandTotal: isTh ? 'ยอดรวมสุทธิ' : isEn ? 'Grand Total' : 'Grand Total',
    words: isTh ? 'จำนวนเงินเป็นตัวอักษร' : isEn ? 'Amount in Words' : 'Amount in Words',
    invoiceNo: isTh ? 'เลขที่' : isEn ? 'Invoice No.' : 'No.',
    date: isTh ? 'วันที่' : isEn ? 'Date' : 'Date',
    origDoc: isTh ? 'ต้นฉบับ' : isEn ? 'ORIGINAL' : 'ต้นฉบับ / ORIGINAL',
    dueDate: isTh ? 'วันครบกำหนด' : isEn ? 'Due Date' : 'วันครบกำหนด / Due Date',
    paymentMethod: isTh ? 'วิธีชำระเงิน' : isEn ? 'Payment Method' : 'วิธีชำระเงิน / Payment Method',
    notes: isTh ? 'หมายเหตุ' : isEn ? 'Notes' : 'หมายเหตุ / Notes',
    preparedBy: isTh ? 'ผู้จัดทำ / ผู้ออกเอกสาร' : isEn ? 'Prepared by / Issuer' : 'ผู้จัดทำ / Prepared by',
    receivedBy: isTh ? 'ผู้รับสินค้า / ลูกค้า' : isEn ? 'Received by / Customer' : 'ผู้รับ / Customer',
    electronicDoc: isTh ? 'เอกสารนี้สร้างและจัดเก็บในรูปแบบอิเล็กทรอนิกส์' : isEn ? 'This document is generated and stored electronically.' : 'เอกสารนี้สร้างและจัดเก็บในรูปแบบอิเล็กทรอนิกส์ / This document is generated and stored electronically.',
    ordinaryDoc: isTh ? 'เอกสารฉบับปกติ' : isEn ? 'Ordinary document' : 'เอกสารฉบับปกติ / Ordinary document',
    electronicCertified: isTh ? 'เอกสารอิเล็กทรอนิกส์ตามรูปแบบ e-Tax' : isEn ? 'Electronic e-Tax document' : 'เอกสารอิเล็กทรอนิกส์ตามรูปแบบ e-Tax / Electronic e-Tax document',
    onlineQr: isTh ? 'สแกนเพื่อตรวจสอบ/ดูเอกสารออนไลน์' : isEn ? 'Scan to view or verify online' : 'สแกนเพื่อตรวจสอบ/ดูเอกสารออนไลน์ / Scan to verify online',
    bankPayment: isTh ? 'ข้อมูลบัญชีสำหรับโอนเงิน' : isEn ? 'Bank transfer information' : 'ข้อมูลบัญชีสำหรับโอนเงิน / Bank transfer information',
  };

  const sellerName = isTh ? data.seller.nameTh : isEn ? (data.seller.nameEn ?? data.seller.nameTh) : `${data.seller.nameTh} / ${data.seller.nameEn ?? data.seller.nameTh}`;
  const buyerName = isTh ? data.buyer.nameTh : isEn ? (data.buyer.nameEn ?? data.buyer.nameTh) : `${data.buyer.nameTh} / ${data.buyer.nameEn ?? data.buyer.nameTh}`;
  const sellerAddr = isTh ? data.seller.addressTh : isEn ? (data.seller.addressEn ?? data.seller.addressTh) : `${data.seller.addressTh}${data.seller.addressEn ? `<br/><span class="muted-inline">${data.seller.addressEn}</span>` : ''}`;
  const buyerAddr = isTh ? data.buyer.addressTh : isEn ? (data.buyer.addressEn ?? data.buyer.addressTh) : `${data.buyer.addressTh}${data.buyer.addressEn ? `<br/><span class="muted-inline">${data.buyer.addressEn}</span>` : ''}`;
  const sellerBranch = data.seller.branchCode === '00000'
    ? labels.branchHeadOffice
    : `${data.seller.branchCode}${data.seller.branchNameTh ? ` ${data.seller.branchNameTh}` : ''}`;
  const buyerBranch = data.buyer.branchCode === '00000'
    ? labels.branchHeadOffice
    : data.buyer.branchCode;
  const customTemplateBlock = data.templateHtml
    ? compileTemplateHtml(data.templateHtml, {
        documentTitle: escapeHtml(docTitle),
        invoiceNumber: escapeHtml(data.invoiceNumber),
        invoiceDate: escapeHtml(dateStr),
        dueDate: escapeHtml(data.dueDate ? (isTh ? formatDateTh(data.dueDate) : formatDateEn(data.dueDate)) : '-'),
        sellerName: escapeHtml(sellerName),
        buyerName: escapeHtml(buyerName),
        sellerTaxId: escapeHtml(data.seller.taxId),
        buyerTaxId: escapeHtml(data.buyer.taxId),
        subtotal: escapeHtml(formatCurrency(data.subtotal)),
        vatAmount: escapeHtml(formatCurrency(data.vatAmount)),
        total: escapeHtml(formatCurrency(data.total)),
        amountInWords: escapeHtml(totalWords),
        paymentMethod: escapeHtml(data.paymentMethod ?? '-'),
        notes: escapeHtml(data.notes ?? '-'),
      })
    : null;
  const metaRows = [
    { label: labels.invoiceNo, value: data.invoiceNumber, emphasize: true },
    { label: labels.date, value: dateStr },
    ...(data.dueDate ? [{ label: labels.dueDate, value: isTh ? formatDateTh(data.dueDate) : formatDateEn(data.dueDate) }] : []),
    ...(data.paymentMethod ? [{ label: labels.paymentMethod, value: data.paymentMethod }] : []),
  ];
  const isElectronicDocument = data.documentMode === 'electronic';

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="${fontUrl}" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    --accent: ${theme.accent};
    --accent-2: ${theme.accent2};
    --accent-soft: ${theme.soft};
    --theme-ink: ${theme.ink};
    font-family: 'Sarabun', sans-serif;
    font-size: 13px;
    color: #172033;
    background: #ffffff;
    padding: 20px;
  }
  .page { max-width: 210mm; margin: 0 auto; }
  .muted-inline { color: #5f6b7a; }
  .document-shell {
    border: 1px solid var(--accent);
    border-radius: 24px;
    overflow: hidden;
    background: #ffffff;
    box-shadow: 0 18px 60px rgba(15, 23, 42, 0.08);
    position: relative;
  }
  .top-accent { height: 10px; background: linear-gradient(90deg, var(--accent-2) 0%, var(--accent) 52%, var(--accent-soft) 100%); }
  .watermark {
    position: absolute;
    right: 24px;
    top: 118px;
    font-size: 54px;
    line-height: 1;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--accent);
    opacity: 0.055;
    transform: rotate(-8deg);
    pointer-events: none;
  }
  .document-body { padding: 28px 30px 24px; position: relative; z-index: 1; }
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(260px, 0.9fr);
    gap: 24px;
    align-items: start;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--accent);
  }
  .brand-area { display: flex; gap: 16px; align-items: flex-start; }
  .brand-logo {
    width: 78px;
    height: 78px;
    object-fit: contain;
    flex-shrink: 0;
    border: 1px solid var(--accent);
    border-radius: 18px;
    padding: 10px;
    background: #f8fbff;
  }
  .company-name {
    font-size: 22px;
    line-height: 1.2;
    font-weight: 700;
    color: var(--theme-ink);
    margin-bottom: 8px;
  }
  .company-legal {
    display: grid;
    gap: 4px;
    color: #4b5565;
    font-size: 11.5px;
    line-height: 1.55;
  }
  .hero-right {
    display: grid;
    gap: 12px;
    justify-items: end;
  }
  .doc-logo-right {
    width: 88px;
    height: 88px;
    object-fit: contain;
    border: 1px solid var(--accent);
    border-radius: 18px;
    padding: 8px;
    background: #f8fbff;
  }
  .title-card {
    width: 100%;
    border: 1px solid #dbe4f2;
    border-radius: 20px;
    background: linear-gradient(180deg, #ffffff 0%, var(--accent-soft) 100%);
    padding: 16px 18px 14px;
    text-align: right;
  }
  .eyebrow {
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    font-weight: 600;
    margin-bottom: 8px;
  }
  .title-card h1 {
    font-size: 28px;
    line-height: 1.1;
    font-weight: 700;
    color: var(--accent-2);
    margin-bottom: 6px;
  }
  .copy-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 5px 11px;
    border-radius: 999px;
    border: 1px solid var(--accent);
    background: #ffffff;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--accent-2);
    text-transform: uppercase;
  }
  .template-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    border-radius: 999px;
    background: var(--accent-2);
    color: #ffffff;
    padding: 6px 12px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .overview-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(250px, 0.9fr);
    gap: 18px;
    margin: 22px 0 18px;
  }
  .template-banner {
    margin-top: 18px;
    border: 1px solid var(--accent);
    border-radius: 18px;
    background: linear-gradient(135deg, var(--accent-soft) 0%, #ffffff 72%);
    padding: 16px 18px;
    border-left: 7px solid var(--accent);
  }
  .template-banner .section-label { margin-bottom: 8px; }
  .template-banner p,
  .template-banner div,
  .template-banner span,
  .template-banner li {
    color: #334155;
    font-size: 11.5px;
    line-height: 1.7;
  }
  .template-banner strong { color: var(--accent-2); }
  .party-card, .meta-card, .notes-card, .words-card, .totals-card {
    border: 1px solid #dde5f0;
    border-radius: 18px;
    background: #ffffff;
  }
  .party-card { padding: 18px; }
  .meta-card { padding: 14px 16px; background: #fbfcfe; }
  .section-label {
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #6b7688;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .party-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
  .party-column {
    padding: 14px 14px 12px;
    border-radius: 16px;
    background: #f9fbff;
    border: 1px solid #e5ecf5;
    min-height: 132px;
  }
  .party-title {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #6a7690;
    font-weight: 700;
    margin-bottom: 10px;
  }
  .party-name {
    font-size: 15px;
    line-height: 1.35;
    color: #15254b;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .party-detail {
    color: #556171;
    font-size: 11.5px;
    line-height: 1.65;
  }
  .meta-list { display: grid; gap: 8px; }
  .meta-row {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    font-size: 12px;
    line-height: 1.45;
    padding-bottom: 8px;
    border-bottom: 1px solid #e8edf5;
  }
  .meta-row:last-child { border-bottom: none; padding-bottom: 0; }
  .meta-key { color: #6d7789; }
  .meta-value { color: #162444; font-weight: 600; word-break: break-word; }
  .meta-value.emphasize { font-size: 15px; font-weight: 700; color: var(--accent-2); }
  .items-section {
    margin-top: 8px;
    border: 1px solid #dde5f0;
    border-radius: 20px;
    overflow: hidden;
    background: #ffffff;
  }
  .items-header {
    padding: 14px 18px 12px;
    border-bottom: 1px solid #e4ebf4;
    background: linear-gradient(180deg, #fbfdff 0%, #f4f8fe 100%);
  }
  .items-header h2 {
    font-size: 13px;
    font-weight: 700;
    color: #1e2f5a;
  }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  thead th {
    background: var(--accent-2);
    color: #ffffff;
    padding: 10px 8px;
    text-align: left;
    font-weight: 700;
    font-size: 10.5px;
    letter-spacing: 0.04em;
  }
  tbody td {
    padding: 10px 8px;
    border-bottom: 1px solid #edf2f7;
    vertical-align: top;
    color: #243348;
  }
  tbody tr:nth-child(even) td { background: #fbfcfe; }
  tbody tr:last-child td { border-bottom: none; }
  .item-name { font-weight: 600; color: #162444; line-height: 1.45; }
  .item-subname { display: block; margin-top: 2px; font-size: 10.5px; color: #72809a; }
  .summary-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 18px;
    align-items: start;
    margin-top: 18px;
  }
  .notes-stack { display: grid; gap: 12px; }
  .notes-card, .words-card { padding: 16px 18px; }
  .notes-text, .words-text {
    color: #445063;
    font-size: 11.5px;
    line-height: 1.7;
  }
  .words-text strong {
    color: #162444;
    font-size: 13px;
    font-weight: 700;
  }
  .totals-card {
    overflow: hidden;
    background: linear-gradient(180deg, #ffffff 0%, #f9fbff 100%);
  }
  .totals-header {
    padding: 14px 16px 10px;
    border-bottom: 1px solid #e5ecf5;
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #6b7688;
    font-weight: 700;
  }
  .totals-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 11px 16px;
    font-size: 12px;
    color: #435065;
    border-bottom: 1px solid #e9eff7;
  }
  .totals-row strong { color: #162444; font-weight: 700; }
  .totals-row.grand {
    background: var(--accent-2);
    color: #ffffff;
    border-bottom: none;
  }
  .totals-row.grand strong { color: #ffffff; font-size: 16px; }
  .signature-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 22px;
    margin-top: 28px;
  }
  .sig-card {
    border: 1px solid #dde5f0;
    border-radius: 18px;
    padding: 18px 18px 16px;
    background: #fcfdff;
    text-align: center;
  }
  .sig-space {
    height: 58px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sig-image {
    max-height: 54px;
    max-width: 170px;
    object-fit: contain;
  }
  .sig-line {
    border-top: 1px solid #c8d2e4;
    margin: 0 auto 10px;
    width: 72%;
  }
  .sig-title {
    font-size: 11px;
    font-weight: 600;
    color: #556171;
  }
  .sig-name {
    margin-top: 3px;
    font-size: 10px;
    color: #6b7280;
  }
  .document-support {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 170px;
    gap: 16px;
    align-items: stretch;
    margin-top: 18px;
  }
  .bank-box, .online-box {
    border: 1px solid #dde5f0;
    border-radius: 16px;
    background: #ffffff;
    padding: 14px 16px;
  }
  .bank-text {
    white-space: pre-line;
    color: #344154;
    font-size: 11.5px;
    line-height: 1.7;
  }
  .online-box {
    text-align: center;
    background: linear-gradient(180deg, var(--accent-soft) 0%, #ffffff 100%);
  }
  .online-qr {
    width: 112px;
    height: 112px;
    object-fit: contain;
    border: 1px solid #d9e2ef;
    border-radius: 10px;
    background: #ffffff;
    padding: 6px;
    margin-bottom: 8px;
  }
  .electronic-cert {
    margin-top: 16px;
    border-top: 1px solid #e6edf6;
    padding-top: 12px;
    display: flex;
    justify-content: space-between;
    gap: 14px;
    color: #5e6b7d;
    font-size: 10.5px;
    line-height: 1.6;
  }
  .cert-pill {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-2);
    border: 1px solid var(--accent);
    padding: 5px 10px;
    font-weight: 700;
    white-space: nowrap;
  }
  .footer {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid #e6edf6;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 10.5px;
    line-height: 1.55;
    color: #778296;
  }
  .footer-right { text-align: right; }
  .theme-paid .document-shell { border-width: 2px; }
  .theme-paid .title-card::after {
    content: 'PAID';
    display: inline-block;
    margin-top: 10px;
    border: 2px solid var(--accent);
    color: var(--accent);
    border-radius: 10px;
    padding: 4px 14px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.14em;
    transform: rotate(-4deg);
  }
  .theme-minimal .document-shell { box-shadow: none; border-radius: 10px; }
  .theme-minimal .top-accent { height: 4px; }
  .theme-minimal .title-card,
  .theme-minimal .party-card,
  .theme-minimal .meta-card,
  .theme-minimal .items-section,
  .theme-minimal .totals-card,
  .theme-minimal .sig-card {
    border-radius: 8px;
  }
  .theme-credit thead th { background: #92400e; }
  .theme-debit thead th { background: #9f1239; }
  .theme-luxury .document-shell {
    border-width: 2px;
    box-shadow: 0 22px 70px rgba(23, 18, 10, 0.14);
  }
  .theme-luxury .title-card {
    background: linear-gradient(135deg, #17120a 0%, #3a2a10 58%, #fff3c4 100%);
    color: #ffffff;
  }
  .theme-luxury .title-card h1,
  .theme-luxury .eyebrow {
    color: #fff7d6;
  }
  .theme-luxury .copy-pill {
    border-color: #f4d06f;
    color: #3a2a10;
  }
  .theme-local .document-shell,
  .theme-local .party-card,
  .theme-local .meta-card,
  .theme-local .items-section,
  .theme-local .totals-card,
  .theme-local .sig-card {
    border-radius: 12px;
  }
  .theme-local tbody td {
    font-size: 12px;
  }
  .theme-ledger .party-column,
  .theme-ledger .meta-card {
    background-image: linear-gradient(#eef2ff 1px, transparent 1px);
    background-size: 100% 28px;
  }
  /* ── Minimal White ── */
  .theme-minimal-white .document-shell { border: 1px solid #e5e7eb; border-radius: 4px; box-shadow: none; }
  .theme-minimal-white .top-accent { background: #e5e7eb; height: 3px; }
  .theme-minimal-white .title-card { background: white; border: 1px solid #e5e7eb; border-radius: 4px; }
  .theme-minimal-white .hero { border-bottom: 1px solid #e5e7eb; }
  .theme-minimal-white .eyebrow { color: #6b7280; }
  .theme-minimal-white .totals-row.grand { background: #f3f4f6; }

  /* ── Minimal Gray ── */
  .theme-minimal-gray .document-shell { border: 1px solid #d1d5db; border-radius: 4px; box-shadow: none; }
  .theme-minimal-gray .top-accent { background: #9ca3af; height: 4px; }
  .theme-minimal-gray .hero { background: #f9fafb; padding: 20px; border-bottom: 1px solid #d1d5db; }
  .theme-minimal-gray .title-card { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; }
  .theme-minimal-gray .totals-row.grand { background: #e5e7eb; }

  /* ── Minimal Line ── */
  .theme-minimal-line .document-shell { border: 1px solid #ccfbf1; border-radius: 4px; box-shadow: none; }
  .theme-minimal-line .top-accent { height: 4px; background: #0d9488; }
  .theme-minimal-line .title-card { background: white; border: 1px solid #99f6e4; border-radius: 4px; }
  .theme-minimal-line .title-card h1 { color: #0f766e; }
  .theme-minimal-line .hero { border-bottom: 2px solid #0d9488; }
  .theme-minimal-line .totals-row.grand { background: #0d9488; border-radius: 6px; }
  .theme-minimal-line .totals-row.grand span,
  .theme-minimal-line .totals-row.grand strong { color: white; }

  /* ── Minimal Sans ── */
  .theme-minimal-sans .document-shell { border: 1px solid #e5e7eb; border-radius: 4px; box-shadow: none; }
  .theme-minimal-sans .top-accent { background: #1f2937; height: 5px; }
  .theme-minimal-sans .title-card { background: white; border: 1px solid #e5e7eb; border-radius: 4px; }
  .theme-minimal-sans .title-card h1 { color: #111827; font-size: 24px; }
  .theme-minimal-sans .hero { border-bottom: 1px solid #1f2937; }
  .theme-minimal-sans .totals-row.grand { background: #111827; border-radius: 4px; }
  .theme-minimal-sans .totals-row.grand span,
  .theme-minimal-sans .totals-row.grand strong { color: white; }
  .theme-minimal-sans .company-name { font-size: 20px; font-weight: 800; }
  .theme-minimal-sans table th { background: #1f2937; color: white; }

  /* ── Minimal Space ── */
  .theme-minimal-space .document-shell { border: none; border-radius: 8px; box-shadow: 0 2px 16px rgba(0,0,0,0.06); }
  .theme-minimal-space .top-accent { display: none; }
  .theme-minimal-space .document-body { padding: 40px 44px 36px; }
  .theme-minimal-space .title-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; }
  .theme-minimal-space .hero { border-bottom: 1px solid #e2e8f0; padding-bottom: 28px; }
  .theme-minimal-space .totals-row.grand { background: #f1f5f9; border-radius: 6px; }

  @media print { body { padding: 0; } }
</style>
</head>
<body class="${theme.className}">
<div class="page">
  <div class="document-shell">
    <div class="top-accent"></div>
    <div class="watermark">${theme.mark}</div>
    <div class="document-body">
      <div class="hero">
        <div class="brand-area">
          ${data.showCompanyLogo !== false && data.seller.logoUrl ? `<img class="brand-logo" src="${data.seller.logoUrl}" alt="seller logo"/>` : ''}
          <div>
            <div class="company-name">${sellerName}</div>
            <div class="company-legal">
              <div>${labels.taxId}: ${data.seller.taxId}</div>
              <div>${labels.branch}: ${sellerBranch}</div>
              <div>${sellerAddr}</div>
              ${(data.seller.phone || data.seller.email || data.seller.website) ? `<div>${data.seller.phone ? `Tel. ${data.seller.phone}` : ''}${data.seller.phone && data.seller.email ? ' | ' : ''}${data.seller.email ? data.seller.email : ''}${(data.seller.phone || data.seller.email) && data.seller.website ? ' | ' : ''}${data.seller.website ? data.seller.website : ''}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="hero-right">
          ${data.documentLogoUrl ? `<img class="doc-logo-right" src="${data.documentLogoUrl}" alt="document logo"/>` : ''}
          <div class="title-card">
            <div class="eyebrow">Electronic Tax Document</div>
            <h1>${docTitle}</h1>
            <div class="copy-pill">${labels.origDoc}</div>
            <div class="template-badge">${escapeHtml(data.templateName ?? theme.label)}</div>
          </div>
        </div>
      </div>

      ${customTemplateBlock ? `
        <div class="template-banner">
          <div class="section-label">${data.templateName ? `Template: ${escapeHtml(data.templateName)}` : 'Document Template'}</div>
          ${customTemplateBlock}
        </div>
      ` : ''}

      <div class="overview-grid">
        <div class="party-card">
          <div class="section-label">${labels.buyer}</div>
          <div class="party-grid">
            <div class="party-column">
              <div class="party-name">${buyerName}</div>
              <div class="party-detail">
                <div>${labels.taxId}: <strong>${data.buyer.taxId}</strong></div>
                <div>${labels.branch}: <strong>${buyerBranch}</strong></div>
                <div>${buyerAddr}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="meta-card">
          <div class="section-label">Document Details</div>
          <div class="meta-list">
            ${metaRows.map((row) => `
              <div class="meta-row">
                <div class="meta-key">${row.label}</div>
                <div class="meta-value${row.emphasize ? ' emphasize' : ''}">${row.value}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="items-section">
        <div class="items-header">
          <h2>${labels.item}</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:42px;text-align:center">${labels.no}</th>
              <th>${labels.item}</th>
              <th style="width:54px;text-align:center">${labels.qty}</th>
              <th style="width:56px;text-align:center">${labels.unit}</th>
              <th style="width:96px;text-align:right">${labels.price}</th>
              <th style="width:56px;text-align:center">${labels.disc}</th>
              <th style="width:52px;text-align:center">${labels.vat}</th>
              <th style="width:96px;text-align:right">${labels.amount}</th>
              <th style="width:78px;text-align:right">${labels.vatAmt}</th>
              <th style="width:102px;text-align:right">${labels.total}</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>

      <div class="summary-grid">
        <div class="notes-stack">
          <div class="words-card">
            <div class="section-label">${labels.words}</div>
            <div class="words-text"><strong>${totalWords}</strong></div>
          </div>

          ${(data.notes || data.templateNote) ? `
            <div class="notes-card">
              <div class="section-label">${labels.notes}</div>
              <div class="notes-text">
                ${data.notes ? `<div>${data.notes}</div>` : ''}
                ${data.templateNote ? `<div style="margin-top:${data.notes ? '8px' : '0'}; color:#64748b;">${data.templateNote}</div>` : ''}
              </div>
            </div>
          ` : ''}
        </div>

        <div class="totals-card">
          <div class="totals-header">${labels.grandTotal}</div>
          <div class="totals-row"><span>${labels.subtotal}</span><strong>${formatCurrency(data.subtotal)} THB</strong></div>
          <div class="totals-row"><span>${labels.vatTotal}</span><strong>${formatCurrency(data.vatAmount)} THB</strong></div>
          <div class="totals-row grand"><span>${labels.grandTotal}</span><strong>${formatCurrency(data.total)} THB</strong></div>
        </div>
      </div>

      ${(!isElectronicDocument || data.signatureImageUrl || data.signerName || data.signerTitle) ? `
        <div class="signature-grid">
          <div class="sig-card">
            <div class="sig-space">${data.signatureImageUrl ? `<img class="sig-image" src="${data.signatureImageUrl}" alt="authorized signature"/>` : ''}</div>
            <div class="sig-line"></div>
            <div class="sig-title">${labels.preparedBy}</div>
            ${(data.signerName || data.signerTitle) ? `<div class="sig-name">${escapeHtml([data.signerName, data.signerTitle].filter(Boolean).join(' · '))}</div>` : ''}
          </div>
          ${!isElectronicDocument ? `<div class="sig-card">
            <div class="sig-space"></div>
            <div class="sig-line"></div>
            <div class="sig-title">${labels.receivedBy}</div>
          </div>` : '<div></div>'}
        </div>
      ` : ''}

      ${(data.bankPaymentInfo || isElectronicDocument) ? `
        <div class="document-support">
          ${data.bankPaymentInfo ? `
            <div class="bank-box">
              <div class="section-label">${labels.bankPayment}</div>
              <div class="bank-text">${escapeHtml(data.bankPaymentInfo)}</div>
            </div>
          ` : '<div></div>'}
          ${isElectronicDocument ? `
            <div class="online-box">
              ${data.onlineQrDataUrl ? `<img class="online-qr" src="${data.onlineQrDataUrl}" alt="online document QR"/>` : ''}
              <div class="section-label" style="margin-bottom:4px">${labels.onlineQr}</div>
              <div style="font-size:10px;line-height:1.45;color:#64748b;word-break:break-all;">${escapeHtml(data.onlineViewUrl ?? buildOnlineViewUrl(data.invoiceNumber))}</div>
            </div>
          ` : '<div></div>'}
        </div>
      ` : ''}

      <div class="electronic-cert">
        <div>
          ${isElectronicDocument
            ? `${labels.electronicCertified}`
            : labels.ordinaryDoc}
        </div>
        <div class="cert-pill">${isElectronicDocument ? 'ELECTRONIC DOCUMENT' : 'ORDINARY DOCUMENT'}</div>
      </div>

      <div class="footer">
        <div>e-Tax Invoice System &nbsp;|&nbsp; ${isElectronicDocument ? 'e-Tax Electronic Document' : 'Standard Document'}</div>
        <div class="footer-right">${docTitle} &nbsp;·&nbsp; ${new Date().getFullYear()}</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

async function resolveTemplateForDocument(
  companyId: string,
  type: string,
  language: Language,
  templateId?: string | null,
) {
  const builtinTemplate = resolveBuiltinTemplate(type, language, templateId);
  if (builtinTemplate) return builtinTemplate;

  if (templateId?.startsWith('builtin:')) return null;

  const where = templateId
    ? { id: templateId, companyId }
    : { companyId, type, language, isActive: true };

  const template = await prisma.documentTemplate.findFirst({
    where,
    select: { id: true, name: true, htmlTh: true, htmlEn: true, language: true, type: true },
  });

  if (!template) return null;

  return {
    id: template.id,
    name: template.name,
    html: resolveTemplateLanguageHtml(template, language),
  };
}

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30_000);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.emulateMediaType('print');

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function generatePdf(data: PdfInvoiceData): Promise<Buffer> {
  const enrichedData = await enrichElectronicDocument(data);
  return generatePdfFromHtml(buildHtml({
    ...enrichedData,
    templateNote: data.templateNote ?? null,
  }));
}

export { buildHtml };

// ─── Minimal template builder ────────────────────────────────────────────────
function buildHtmlMinimal(data: PdfInvoiceData, variant: string): string {
  const isTh = data.language === 'th';
  const isEn = data.language === 'en';
  const docTitle = DOC_TITLE[data.type]?.[data.language] ?? 'ใบกำกับภาษี';
  const dateStr = isTh ? formatDateTh(data.invoiceDate) : formatDateEn(data.invoiceDate);
  const totalWords = isTh
    ? amountInWordsThai(data.total)
    : isEn
      ? amountInWordsEnglish(data.total)
      : `${amountInWordsThai(data.total)} / ${amountInWordsEnglish(data.total)}`;

  const fontUrl = 'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap';

  const sellerName = isTh ? data.seller.nameTh : isEn ? (data.seller.nameEn ?? data.seller.nameTh) : `${data.seller.nameTh} / ${data.seller.nameEn ?? data.seller.nameTh}`;
  const buyerName  = isTh ? data.buyer.nameTh  : isEn ? (data.buyer.nameEn  ?? data.buyer.nameTh)  : `${data.buyer.nameTh} / ${data.buyer.nameEn ?? data.buyer.nameTh}`;
  const sellerAddr = isTh ? data.seller.addressTh : isEn ? (data.seller.addressEn ?? data.seller.addressTh) : data.seller.addressTh;
  const buyerAddr  = isTh ? data.buyer.addressTh  : isEn ? (data.buyer.addressEn  ?? data.buyer.addressTh)  : data.buyer.addressTh;
  const sellerBranch = data.seller.branchCode === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.seller.branchCode;
  const buyerBranch  = data.buyer.branchCode  === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.buyer.branchCode;

  const dueStr = data.dueDate ? (isTh ? formatDateTh(data.dueDate) : formatDateEn(data.dueDate)) : '';

  // Per-variant color tokens
  const v: Record<string, { border: string; headerBg: string; accent: string; totalBg: string; totalText: string; thBg: string; thText: string; bodyPad: string; shellBorder: string }> = {
    white: { border:'#e5e7eb', headerBg:'#ffffff', accent:'#374151', totalBg:'#f3f4f6', totalText:'#111827', thBg:'#f9fafb', thText:'#374151', bodyPad:'28px 32px', shellBorder:'1px solid #e5e7eb' },
    gray:  { border:'#d1d5db', headerBg:'#f9fafb', accent:'#6b7280', totalBg:'#e5e7eb', totalText:'#111827', thBg:'#f3f4f6', thText:'#374151', bodyPad:'28px 32px', shellBorder:'1px solid #d1d5db' },
    line:  { border:'#99f6e4', headerBg:'#ffffff', accent:'#0d9488', totalBg:'#0d9488', totalText:'#ffffff', thBg:'#f0fdfa', thText:'#0f766e', bodyPad:'28px 32px', shellBorder:'1px solid #ccfbf1' },
    sans:  { border:'#e5e7eb', headerBg:'#ffffff', accent:'#111827', totalBg:'#111827', totalText:'#ffffff', thBg:'#1f2937', thText:'#ffffff', bodyPad:'28px 32px', shellBorder:'1px solid #e5e7eb' },
    space: { border:'#e2e8f0', headerBg:'#ffffff', accent:'#475569', totalBg:'#f1f5f9', totalText:'#1e293b', thBg:'#f8fafc', thText:'#475569', bodyPad:'40px 48px', shellBorder:'none' },
  };
  const t = v[variant] ?? v.white;
  const isBold = variant === 'sans';

  const itemRows = data.items.map((item, idx) => `
    <tr>
      <td style="text-align:center">${idx + 1}</td>
      <td>${escapeHtml(isTh ? item.nameTh : (item.nameEn ?? item.nameTh))}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:center">${escapeHtml(item.unit)}</td>
      <td style="text-align:right">${formatCurrency(item.unitPrice)}</td>
      <td style="text-align:right">${formatCurrency(item.amount)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="${fontUrl}" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #111827; background: #fff; padding: 20px; }
  .page { max-width: 210mm; margin: 0 auto; }
  .shell { border: ${t.shellBorder}; border-radius: 4px; overflow: hidden; background: #fff; ${variant === 'space' ? 'box-shadow: 0 2px 16px rgba(0,0,0,0.06);' : ''} }
  .top-bar { height: ${variant === 'space' ? '0' : '4px'}; background: ${t.accent}; }
  .body { padding: ${t.bodyPad}; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: ${variant === 'line' ? '2px' : '1px'} solid ${t.accent}; margin-bottom: 18px; }
  .seller-logo { width: 64px; height: 64px; object-fit: contain; margin-right: 14px; border: 1px solid ${t.border}; border-radius: 6px; padding: 6px; }
  .seller-left { display: flex; align-items: flex-start; }
  .seller-name { font-size: ${isBold ? '18px' : '16px'}; font-weight: ${isBold ? '800' : '700'}; color: #111827; margin-bottom: 6px; }
  .seller-info { font-size: 11.5px; color: #4b5563; line-height: 1.7; }
  .doc-right { text-align: right; min-width: 200px; }
  .doc-type-th { font-size: 20px; font-weight: 700; color: ${t.accent}; line-height: 1.2; }
  .doc-type-en { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: ${t.accent}; margin-bottom: 12px; opacity: 0.8; }
  .meta-table { margin-left: auto; border-collapse: collapse; font-size: 12px; }
  .meta-table td { padding: 2px 0 2px 12px; color: #374151; }
  .meta-table td:first-child { color: #6b7280; text-align: right; padding-right: 8px; padding-left: 0; }
  .meta-table td:last-child { font-weight: 600; text-align: right; }
  .original-badge { display: inline-block; margin-top: 8px; font-size: 10.5px; border: 1px solid ${t.accent}; color: ${t.accent}; padding: 2px 8px; border-radius: 999px; letter-spacing: 0.06em; }

  /* Bill To */
  .bill-to { background: ${t.headerBg}; border: 1px solid ${t.border}; border-radius: 4px; padding: 12px 16px; margin-bottom: 16px; }
  .bill-to-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: ${t.accent}; font-weight: 700; margin-bottom: 8px; }
  .buyer-name { font-size: 13.5px; font-weight: 700; margin-bottom: 4px; }
  .buyer-info { font-size: 11.5px; color: #4b5563; line-height: 1.7; }

  /* Table */
  .items-wrap { margin-bottom: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 0; }
  th { background: ${t.thBg}; color: ${t.thText}; font-weight: ${isBold ? '700' : '600'}; padding: 8px 10px; border: 1px solid ${t.border}; font-size: 12px; white-space: nowrap; }
  td { padding: 7px 10px; border: 1px solid ${t.border}; vertical-align: top; line-height: 1.5; }
  tr:nth-child(even) td { background: ${variant === 'space' ? '#f8fafc' : variant === 'gray' ? '#fafafa' : 'transparent'}; }

  /* Totals */
  .summary { display: flex; justify-content: flex-end; margin-top: 0; border-top: 1px solid ${t.border}; }
  .totals { width: 280px; border: 1px solid ${t.border}; border-top: none; border-radius: 0 0 4px 4px; overflow: hidden; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 14px; border-bottom: 1px solid ${t.border}; font-size: 12.5px; }
  .total-row:last-child { border-bottom: none; background: ${t.totalBg}; color: ${t.totalText}; font-weight: 700; padding: 9px 14px; }
  .total-row:last-child span { color: ${t.totalText}; }

  /* Footer row */
  .footer-row { display: flex; gap: 16px; margin-top: 20px; }
  .words-box { flex: 1; border: 1px solid ${t.border}; border-radius: 4px; padding: 10px 14px; font-size: 12px; }
  .words-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; color: ${t.accent}; font-weight: 700; margin-bottom: 4px; }
  .notes-box { flex: 1; border: 1px solid ${t.border}; border-radius: 4px; padding: 10px 14px; font-size: 12px; color: #4b5563; }
  .sig-row { display: flex; gap: 16px; margin-top: 16px; }
  .sig-box { flex: 1; border: 1px solid ${t.border}; border-radius: 4px; padding: 10px 14px; text-align: center; }
  .sig-space { height: 48px; display: flex; align-items: center; justify-content: center; }
  .sig-image { max-height: 44px; object-fit: contain; }
  .sig-line { border-top: 1px solid ${t.border}; margin: 4px 24px; }
  .sig-label { font-size: 11px; color: #6b7280; margin-top: 6px; }
  .bank-box { margin-top: 12px; border: 1px solid ${t.border}; border-radius: 4px; padding: 10px 14px; font-size: 12px; color: #374151; }
  .bank-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; color: ${t.accent}; font-weight: 700; margin-bottom: 4px; }
  .doc-footer { margin-top: 12px; display: flex; justify-content: space-between; font-size: 10.5px; color: #9ca3af; border-top: 1px solid ${t.border}; padding-top: 8px; }
  .qr-box { margin-top: 12px; border: 1px solid ${t.border}; border-radius: 4px; padding: 10px 14px; display: flex; align-items: center; gap: 14px; }
  .qr-img { width: 72px; height: 72px; object-fit: contain; }
  .qr-text { font-size: 11px; color: #4b5563; line-height: 1.6; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="page">
<div class="shell">
  <div class="top-bar"></div>
  <div class="body">

    <!-- Header -->
    <div class="header">
      <div class="seller-left">
        ${data.showCompanyLogo !== false && data.seller.logoUrl ? `<img class="seller-logo" src="${data.seller.logoUrl}" alt="logo"/>` : ''}
        <div>
          <div class="seller-name">${escapeHtml(sellerName)}</div>
          <div class="seller-info">
            <div>${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.seller.taxId)}</div>
            <div>${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(sellerBranch)}</div>
            <div>${escapeHtml(sellerAddr)}</div>
            ${data.seller.phone ? `<div>โทร. ${escapeHtml(data.seller.phone)}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="doc-right">
        <div class="doc-type-th">${escapeHtml(docTitle)}</div>
        <div class="doc-type-en">TAX INVOICE</div>
        <table class="meta-table">
          <tr><td>${isTh ? 'เลขที่' : 'No.'}</td><td>${escapeHtml(data.invoiceNumber)}</td></tr>
          <tr><td>${isTh ? 'วันที่' : 'Date'}</td><td>${escapeHtml(dateStr)}</td></tr>
          ${dueStr ? `<tr><td>${isTh ? 'ครบกำหนด' : 'Due'}</td><td>${escapeHtml(dueStr)}</td></tr>` : ''}
        </table>
        <div class="original-badge">${isTh ? 'ต้นฉบับ' : 'ORIGINAL'}</div>
      </div>
    </div>

    <!-- Bill To -->
    <div class="bill-to">
      <div class="bill-to-label">${isTh ? 'ผู้ซื้อ / Bill To' : 'Bill To'}</div>
      <div class="buyer-name">${escapeHtml(buyerName)}</div>
      <div class="buyer-info">
        <div>${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.buyer.taxId)}</div>
        <div>${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(buyerBranch)}</div>
        <div>${escapeHtml(buyerAddr)}</div>
      </div>
    </div>

    <!-- Items -->
    <div class="items-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:38px;text-align:center">${isTh ? 'ลำดับ' : 'No.'}</th>
            <th>${isTh ? 'รายการ' : 'Description'}</th>
            <th style="width:52px;text-align:center">${isTh ? 'จำนวน' : 'Qty'}</th>
            <th style="width:56px;text-align:center">${isTh ? 'หน่วย' : 'Unit'}</th>
            <th style="width:100px;text-align:right">${isTh ? 'ราคา/หน่วย' : 'Unit Price'}</th>
            <th style="width:100px;text-align:right">${isTh ? 'จำนวนเงิน' : 'Amount'}</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>

    <!-- Totals (flush right below table) -->
    <div class="summary">
      <div class="totals">
        <div class="total-row"><span>${isTh ? 'ยอดรวม (Subtotal)' : 'Subtotal'}</span><span>${formatCurrency(data.subtotal)}</span></div>
        <div class="total-row"><span>${isTh ? 'ภาษีมูลค่าเพิ่ม 7% (VAT)' : 'VAT 7%'}</span><span>${formatCurrency(data.vatAmount)}</span></div>
        <div class="total-row"><span>${isTh ? 'จำนวนเงินรวมทั้งสิ้น (Total)' : 'Grand Total'}</span><span>${formatCurrency(data.total)}</span></div>
      </div>
    </div>

    <!-- Amount in words + notes -->
    <div class="footer-row" style="margin-top:16px">
      <div class="words-box">
        <div class="words-label">${isTh ? 'จำนวนเงินเป็นตัวอักษร' : 'Amount in Words'}</div>
        <div>${escapeHtml(totalWords)}</div>
      </div>
      ${data.notes ? `<div class="notes-box"><div class="words-label">${isTh ? 'หมายเหตุ' : 'Notes'}</div><div>${escapeHtml(data.notes)}</div></div>` : ''}
    </div>

    ${data.bankPaymentInfo ? `
    <div class="bank-box">
      <div class="bank-label">${isTh ? 'ข้อมูลบัญชีสำหรับโอนเงิน' : 'Bank Transfer'}</div>
      <div style="white-space:pre-line">${escapeHtml(data.bankPaymentInfo)}</div>
    </div>` : ''}

    <!-- Signatures -->
    <div class="sig-row">
      <div class="sig-box">
        <div class="sig-space">${data.signatureImageUrl ? `<img class="sig-image" src="${data.signatureImageUrl}" alt="signature"/>` : ''}</div>
        <div class="sig-line"></div>
        <div class="sig-label">${isTh ? 'ผู้จัดทำ / ผู้ออกเอกสาร' : 'Prepared by / Issuer'}</div>
        ${data.signerName ? `<div style="font-size:11px;margin-top:3px;font-weight:600">${escapeHtml(data.signerName)}</div>` : ''}
        ${data.signerTitle ? `<div style="font-size:11px;color:#6b7280">${escapeHtml(data.signerTitle)}</div>` : ''}
      </div>
      <div class="sig-box">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <div class="sig-label">${isTh ? 'ผู้รับสินค้า / ลูกค้า' : 'Received by / Customer'}</div>
      </div>
      ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? `
      <div class="sig-box" style="text-align:center">
        <img class="qr-img" src="${data.onlineQrDataUrl}" alt="QR"/>
        <div style="font-size:10px;color:#6b7280;margin-top:4px">${isTh ? 'สแกนตรวจสอบเอกสาร' : 'Scan to verify'}</div>
      </div>` : ''}
    </div>

    <div class="doc-footer">
      <div>${isTh ? 'เอกสารนี้ออกโดยระบบ Billboy e-Tax' : 'Issued via Billboy e-Tax System'}</div>
      <div>${escapeHtml(docTitle)} · ${escapeHtml(data.invoiceNumber)}</div>
    </div>

  </div>
</div>
</div>
</body>
</html>`;
}

function buildHtmlCute(data: PdfInvoiceData, variant: string): string {
  const isTh = data.language === 'th';
  const isEn = data.language === 'en';
  const docTitle = DOC_TITLE[data.type]?.[data.language] ?? 'ใบกำกับภาษี';
  const dateStr = isTh ? formatDateTh(data.invoiceDate) : formatDateEn(data.invoiceDate);
  const totalWords = isTh
    ? amountInWordsThai(data.total)
    : isEn ? amountInWordsEnglish(data.total)
    : `${amountInWordsThai(data.total)} / ${amountInWordsEnglish(data.total)}`;

  const fontUrl = 'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap';

  const sellerName = isTh ? data.seller.nameTh : isEn ? (data.seller.nameEn ?? data.seller.nameTh) : `${data.seller.nameTh} / ${data.seller.nameEn ?? data.seller.nameTh}`;
  const buyerName  = isTh ? data.buyer.nameTh  : isEn ? (data.buyer.nameEn  ?? data.buyer.nameTh)  : `${data.buyer.nameTh} / ${data.buyer.nameEn ?? data.buyer.nameTh}`;
  const sellerAddr = isTh ? data.seller.addressTh : isEn ? (data.seller.addressEn ?? data.seller.addressTh) : data.seller.addressTh;
  const buyerAddr  = isTh ? data.buyer.addressTh  : isEn ? (data.buyer.addressEn  ?? data.buyer.addressTh)  : data.buyer.addressTh;
  const sellerBranch = data.seller.branchCode === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.seller.branchCode;
  const buyerBranch  = data.buyer.branchCode  === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.buyer.branchCode;
  const dueStr = data.dueDate ? (isTh ? formatDateTh(data.dueDate) : formatDateEn(data.dueDate)) : '';

  type CuteTokens = { bg: string; headerBg: string; accent: string; accentDark: string; border: string; totalBg: string; totalText: string; thBg: string; thText: string; rowEven: string; };
  const v: Record<string, CuteTokens> = {
    pink:   { bg:'#fff0f6', headerBg:'#fce7f3', accent:'#f472b6', accentDark:'#be185d', border:'#fbcfe8', totalBg:'#f472b6', totalText:'#fff', thBg:'#fce7f3', thText:'#be185d', rowEven:'#fff5f9' },
    blue:   { bg:'#eff6ff', headerBg:'#dbeafe', accent:'#60a5fa', accentDark:'#1d4ed8', border:'#bfdbfe', totalBg:'#3b82f6', totalText:'#fff', thBg:'#dbeafe', thText:'#1e40af', rowEven:'#f0f7ff' },
    yellow: { bg:'#fffbeb', headerBg:'#fef3c7', accent:'#fbbf24', accentDark:'#d97706', border:'#fde68a', totalBg:'#f59e0b', totalText:'#fff', thBg:'#fef3c7', thText:'#92400e', rowEven:'#fffdf0' },
    green:  { bg:'#ecfdf5', headerBg:'#d1fae5', accent:'#34d399', accentDark:'#059669', border:'#a7f3d0', totalBg:'#10b981', totalText:'#fff', thBg:'#d1fae5', thText:'#065f46', rowEven:'#f0fdf8' },
    kawaii: { bg:'#f5f3ff', headerBg:'#ede9fe', accent:'#a78bfa', accentDark:'#7c3aed', border:'#ddd6fe', totalBg:'#8b5cf6', totalText:'#fff', thBg:'#ede9fe', thText:'#5b21b6', rowEven:'#faf8ff' },
  };
  const t = v[variant] ?? v.pink;

  const mascots: Record<string, string> = {
    pink: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="52" rx="22" ry="20" fill="#fce7f3"/>
      <ellipse cx="28" cy="26" rx="7" ry="14" fill="#fce7f3"/>
      <ellipse cx="52" cy="26" rx="7" ry="14" fill="#fce7f3"/>
      <ellipse cx="28" cy="26" rx="4" ry="10" fill="#fbcfe8"/>
      <ellipse cx="52" cy="26" rx="4" ry="10" fill="#fbcfe8"/>
      <ellipse cx="40" cy="50" rx="16" ry="14" fill="#fce7f3"/>
      <circle cx="34" cy="46" r="2.5" fill="#be185d"/>
      <circle cx="46" cy="46" r="2.5" fill="#be185d"/>
      <ellipse cx="40" cy="52" rx="4" ry="2.5" fill="#f9a8d4"/>
      <path d="M36 55 Q40 58 44 55" stroke="#be185d" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`,
    blue: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="50" r="22" fill="#dbeafe"/>
      <circle cx="24" cy="28" r="10" fill="#dbeafe"/>
      <circle cx="56" cy="28" r="10" fill="#dbeafe"/>
      <circle cx="24" cy="28" r="6" fill="#bfdbfe"/>
      <circle cx="56" cy="28" r="6" fill="#bfdbfe"/>
      <circle cx="40" cy="48" r="17" fill="#dbeafe"/>
      <circle cx="33" cy="44" r="2.5" fill="#1d4ed8"/>
      <circle cx="47" cy="44" r="2.5" fill="#1d4ed8"/>
      <ellipse cx="40" cy="50" rx="5" ry="3.5" fill="#bfdbfe"/>
      <path d="M36 54 Q40 57 44 54" stroke="#1d4ed8" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`,
    yellow: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="18" fill="#fbbf24"/>
      <circle cx="40" cy="40" r="13" fill="#fde68a"/>
      <line x1="40.0" y1="20.0" x2="40.0" y2="14.0" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="52.7" y1="27.3" x2="57.0" y2="22.8" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="60.0" y1="40.0" x2="66.0" y2="40.0" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="52.7" y1="52.7" x2="57.0" y2="57.2" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="40.0" y1="60.0" x2="40.0" y2="66.0" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="27.3" y1="52.7" x2="23.0" y2="57.2" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="20.0" y1="40.0" x2="14.0" y2="40.0" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="27.3" y1="27.3" x2="23.0" y2="22.8" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <circle cx="35" cy="37" r="2" fill="#d97706"/>
      <circle cx="45" cy="37" r="2" fill="#d97706"/>
      <path d="M34 44 Q40 48 46 44" stroke="#d97706" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`,
    green: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="54" rx="20" ry="16" fill="#d1fae5"/>
      <ellipse cx="40" cy="38" rx="14" ry="16" fill="#6ee7b7"/>
      <ellipse cx="40" cy="36" rx="10" ry="12" fill="#d1fae5"/>
      <polygon points="32,24 29,14 35,22" fill="#34d399"/>
      <polygon points="40,20 40,10 43,20" fill="#34d399"/>
      <polygon points="48,24 51,14 45,22" fill="#34d399"/>
      <circle cx="36" cy="32" r="2" fill="#065f46"/>
      <circle cx="44" cy="32" r="2" fill="#065f46"/>
      <path d="M36 38 Q40 41 44 38" stroke="#065f46" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`,
    kawaii: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="52" rx="20" ry="18" fill="#ede9fe"/>
      <ellipse cx="40" cy="40" rx="16" ry="16" fill="#ede9fe"/>
      <polygon points="26,28 22,14 34,26" fill="#ede9fe"/>
      <polygon points="54,28 58,14 46,26" fill="#ede9fe"/>
      <polygon points="27,27 24,17 33,25" fill="#ddd6fe"/>
      <polygon points="53,27 56,17 47,25" fill="#ddd6fe"/>
      <circle cx="35" cy="36" r="2.5" fill="#7c3aed"/>
      <circle cx="45" cy="36" r="2.5" fill="#7c3aed"/>
      <ellipse cx="40" cy="42" rx="3" ry="2" fill="#c4b5fd"/>
      <line x1="28" y1="41" x2="37" y2="42" stroke="#a78bfa" stroke-width="1" stroke-linecap="round"/>
      <line x1="28" y1="44" x2="37" y2="43" stroke="#a78bfa" stroke-width="1" stroke-linecap="round"/>
      <line x1="43" y1="42" x2="52" y2="41" stroke="#a78bfa" stroke-width="1" stroke-linecap="round"/>
      <line x1="43" y1="43" x2="52" y2="44" stroke="#a78bfa" stroke-width="1" stroke-linecap="round"/>
      <path d="M37 46 Q40 49 43 46" stroke="#7c3aed" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`,
  };

  const mascot = mascots[variant] ?? mascots.pink;

  const itemRows = data.items.map((item, idx) => `
    <tr class="${idx % 2 === 1 ? 'row-even' : ''}">
      <td style="text-align:center">${idx + 1}</td>
      <td>${escapeHtml(isTh ? item.nameTh : (item.nameEn ?? item.nameTh))}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:center">${escapeHtml(item.unit)}</td>
      <td style="text-align:right">${formatCurrency(item.unitPrice)}</td>
      <td style="text-align:right">${formatCurrency(item.amount)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="${fontUrl}" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #111827; background: ${t.bg}; padding: 20px; }
  .page { max-width: 210mm; margin: 0 auto; }
  .shell { border: 2px solid ${t.border}; border-radius: 16px; overflow: hidden; background: #fff; box-shadow: 0 4px 24px ${t.accent}22; }
  .header-band { background: ${t.headerBg}; padding: 20px 28px; border-bottom: 2px solid ${t.border}; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .header-left { display: flex; align-items: flex-start; gap: 14px; flex: 1; }
  .mascot-wrap { width: 80px; height: 80px; flex-shrink: 0; }
  .seller-name { font-size: 17px; font-weight: 700; color: ${t.accentDark}; margin-bottom: 5px; }
  .seller-info { font-size: 11.5px; color: #4b5563; line-height: 1.7; }
  .header-right { text-align: right; min-width: 190px; }
  .doc-title-th { font-size: 22px; font-weight: 800; color: ${t.accentDark}; line-height: 1.2; }
  .doc-title-en { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; color: ${t.accent}; margin-bottom: 10px; }
  .meta-box { background: #fff; border: 1.5px solid ${t.border}; border-radius: 10px; padding: 8px 14px; font-size: 11.5px; }
  .meta-row-cute { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
  .meta-row-cute .lbl { color: #6b7280; }
  .meta-row-cute .val { font-weight: 600; color: ${t.accentDark}; }
  .orig-badge { display: inline-block; margin-top: 8px; font-size: 10px; border: 1.5px solid ${t.accent}; color: ${t.accentDark}; padding: 2px 10px; border-radius: 999px; font-weight: 700; }
  .body { padding: 20px 28px 24px; }
  .bill-to { background: ${t.headerBg}; border: 1.5px solid ${t.border}; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; }
  .bill-to-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: ${t.accent}; font-weight: 700; margin-bottom: 6px; }
  .buyer-name { font-size: 13.5px; font-weight: 700; color: ${t.accentDark}; margin-bottom: 3px; }
  .buyer-info { font-size: 11.5px; color: #4b5563; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 0; border-radius: 12px; overflow: hidden; }
  th { background: ${t.thBg}; color: ${t.thText}; font-weight: 700; padding: 9px 12px; border: 1.5px solid ${t.border}; font-size: 12px; }
  td { padding: 8px 12px; border: 1.5px solid ${t.border}; vertical-align: top; line-height: 1.5; }
  tr.row-even td { background: ${t.rowEven}; }
  .summary { display: flex; justify-content: flex-end; margin-top: 0; }
  .totals { width: 290px; border: 1.5px solid ${t.border}; border-top: none; border-radius: 0 0 12px 12px; overflow: hidden; }
  .total-row { display: flex; justify-content: space-between; padding: 7px 16px; border-bottom: 1.5px solid ${t.border}; font-size: 12.5px; }
  .total-row:last-child { border-bottom: none; background: ${t.totalBg}; color: ${t.totalText}; font-weight: 700; padding: 10px 16px; }
  .total-row:last-child span { color: ${t.totalText}; }
  .words-box { margin-top: 16px; background: ${t.headerBg}; border: 1.5px solid ${t.border}; border-radius: 12px; padding: 10px 16px; font-size: 12px; }
  .words-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; color: ${t.accent}; font-weight: 700; margin-bottom: 4px; }
  .notes-box { margin-top: 10px; border: 1.5px solid ${t.border}; border-radius: 12px; padding: 10px 16px; font-size: 12px; color: #4b5563; }
  .sig-row { display: flex; gap: 12px; margin-top: 14px; }
  .sig-box { flex: 1; border: 1.5px solid ${t.border}; border-radius: 12px; padding: 10px 14px; text-align: center; background: ${t.bg}; }
  .sig-space { height: 44px; display: flex; align-items: center; justify-content: center; }
  .sig-image { max-height: 40px; object-fit: contain; }
  .sig-line { border-top: 1.5px solid ${t.border}; margin: 4px 20px; }
  .sig-label { font-size: 11px; color: #6b7280; margin-top: 6px; }
  .bank-box { margin-top: 12px; background: ${t.headerBg}; border: 1.5px solid ${t.border}; border-radius: 12px; padding: 10px 16px; font-size: 12px; }
  .bank-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; color: ${t.accent}; font-weight: 700; margin-bottom: 4px; }
  .doc-footer { margin-top: 12px; display: flex; justify-content: space-between; font-size: 10.5px; color: #9ca3af; border-top: 1.5px solid ${t.border}; padding-top: 8px; }
  @media print { body { padding: 0; background: #fff; } }
</style>
</head>
<body>
<div class="page">
<div class="shell">

  <div class="header-band">
    <div class="header-left">
      <div class="mascot-wrap">${mascot}</div>
      <div>
        ${data.showCompanyLogo !== false && data.seller.logoUrl ? `<img style="height:48px;object-fit:contain;margin-bottom:8px;display:block" src="${data.seller.logoUrl}" alt="logo"/>` : ''}
        <div class="seller-name">${escapeHtml(sellerName)}</div>
        <div class="seller-info">
          <div>${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.seller.taxId)}</div>
          <div>${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(sellerBranch)}</div>
          <div>${escapeHtml(sellerAddr)}</div>
          ${data.seller.phone ? `<div>โทร. ${escapeHtml(data.seller.phone)}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-title-th">${escapeHtml(docTitle)}</div>
      <div class="doc-title-en">TAX INVOICE</div>
      <div class="meta-box">
        <div class="meta-row-cute"><span class="lbl">${isTh ? 'เลขที่' : 'No.'}</span><span class="val">${escapeHtml(data.invoiceNumber)}</span></div>
        <div class="meta-row-cute"><span class="lbl">${isTh ? 'วันที่' : 'Date'}</span><span class="val">${escapeHtml(dateStr)}</span></div>
        ${dueStr ? `<div class="meta-row-cute"><span class="lbl">${isTh ? 'ครบกำหนด' : 'Due'}</span><span class="val">${escapeHtml(dueStr)}</span></div>` : ''}
      </div>
      <div class="orig-badge">${isTh ? 'ต้นฉบับ' : 'ORIGINAL'}</div>
    </div>
  </div>

  <div class="body">
    <div class="bill-to">
      <div class="bill-to-label">${isTh ? 'ผู้ซื้อ / Bill To' : 'Bill To'}</div>
      <div class="buyer-name">${escapeHtml(buyerName)}</div>
      <div class="buyer-info">
        <div>${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.buyer.taxId)}</div>
        <div>${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(buyerBranch)}</div>
        <div>${escapeHtml(buyerAddr)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:38px;text-align:center">${isTh ? 'ลำดับ' : 'No.'}</th>
          <th>${isTh ? 'รายการ' : 'Description'}</th>
          <th style="width:52px;text-align:center">${isTh ? 'จำนวน' : 'Qty'}</th>
          <th style="width:54px;text-align:center">${isTh ? 'หน่วย' : 'Unit'}</th>
          <th style="width:100px;text-align:right">${isTh ? 'ราคา/หน่วย' : 'Unit Price'}</th>
          <th style="width:100px;text-align:right">${isTh ? 'จำนวนเงิน' : 'Amount'}</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="summary">
      <div class="totals">
        <div class="total-row"><span>${isTh ? 'ยอดรวม (Subtotal)' : 'Subtotal'}</span><span>${formatCurrency(data.subtotal)}</span></div>
        <div class="total-row"><span>${isTh ? 'ภาษีมูลค่าเพิ่ม 7% (VAT)' : 'VAT 7%'}</span><span>${formatCurrency(data.vatAmount)}</span></div>
        <div class="total-row"><span>${isTh ? 'จำนวนเงินรวมทั้งสิ้น (Total)' : 'Grand Total'}</span><span>${formatCurrency(data.total)}</span></div>
      </div>
    </div>

    <div class="words-box">
      <div class="words-label">${isTh ? 'จำนวนเงินเป็นตัวอักษร' : 'Amount in Words'}</div>
      <div>${escapeHtml(totalWords)}</div>
    </div>

    ${data.notes ? `<div class="notes-box"><div class="words-label">${isTh ? 'หมายเหตุ' : 'Notes'}</div><div>${escapeHtml(data.notes)}</div></div>` : ''}

    ${data.bankPaymentInfo ? `
    <div class="bank-box">
      <div class="bank-label">${isTh ? 'ข้อมูลบัญชีสำหรับโอนเงิน' : 'Bank Transfer'}</div>
      <div style="white-space:pre-line">${escapeHtml(data.bankPaymentInfo)}</div>
    </div>` : ''}

    <div class="sig-row">
      <div class="sig-box">
        <div class="sig-space">${data.signatureImageUrl ? `<img class="sig-image" src="${data.signatureImageUrl}" alt="signature"/>` : ''}</div>
        <div class="sig-line"></div>
        <div class="sig-label">${isTh ? 'ผู้จัดทำ / ผู้ออกเอกสาร' : 'Prepared by / Issuer'}</div>
        ${data.signerName ? `<div style="font-size:11px;margin-top:3px;font-weight:600;color:${t.accentDark}">${escapeHtml(data.signerName)}</div>` : ''}
        ${data.signerTitle ? `<div style="font-size:11px;color:#6b7280">${escapeHtml(data.signerTitle)}</div>` : ''}
      </div>
      <div class="sig-box">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <div class="sig-label">${isTh ? 'ผู้รับสินค้า / ลูกค้า' : 'Received by / Customer'}</div>
      </div>
      ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? `
      <div class="sig-box">
        <img style="width:64px;height:64px;object-fit:contain;display:block;margin:0 auto" src="${data.onlineQrDataUrl}" alt="QR"/>
        <div style="font-size:10px;color:#6b7280;margin-top:4px;text-align:center">${isTh ? 'สแกนตรวจสอบ' : 'Scan to verify'}</div>
      </div>` : ''}
    </div>

    <div class="doc-footer">
      <div>${isTh ? 'เอกสารออกโดยระบบ Billboy e-Tax' : 'Issued via Billboy e-Tax System'}</div>
      <div>${escapeHtml(docTitle)} · ${escapeHtml(data.invoiceNumber)}</div>
    </div>
  </div>
</div>
</div>
</body>
</html>`;
}

function buildHtmlProfessional(data: PdfInvoiceData, variant: string): string {
  const isTh = data.language === 'th';
  const isEn = data.language === 'en';
  const docTitle = DOC_TITLE[data.type]?.[data.language] ?? 'ใบกำกับภาษี';
  const dateStr = isTh ? formatDateTh(data.invoiceDate) : formatDateEn(data.invoiceDate);
  const totalWords = isTh
    ? amountInWordsThai(data.total)
    : isEn
      ? amountInWordsEnglish(data.total)
      : `${amountInWordsThai(data.total)} / ${amountInWordsEnglish(data.total)}`;

  const fontUrl = 'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap';

  const sellerName = isTh ? data.seller.nameTh : isEn ? (data.seller.nameEn ?? data.seller.nameTh) : `${data.seller.nameTh} / ${data.seller.nameEn ?? data.seller.nameTh}`;
  const buyerName  = isTh ? data.buyer.nameTh  : isEn ? (data.buyer.nameEn  ?? data.buyer.nameTh)  : `${data.buyer.nameTh} / ${data.buyer.nameEn ?? data.buyer.nameTh}`;
  const sellerAddr = isTh ? data.seller.addressTh : isEn ? (data.seller.addressEn ?? data.seller.addressTh) : data.seller.addressTh;
  const buyerAddr  = isTh ? data.buyer.addressTh  : isEn ? (data.buyer.addressEn  ?? data.buyer.addressTh)  : data.buyer.addressTh;
  const sellerBranch = data.seller.branchCode === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.seller.branchCode;
  const buyerBranch  = data.buyer.branchCode  === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.buyer.branchCode;
  const dueStr = data.dueDate ? (isTh ? formatDateTh(data.dueDate) : formatDateEn(data.dueDate)) : '';

  type ProTokens = {
    accentColor: string;
    headerBg: string;
    headerText: string;
    totalBg: string;
    totalText: string;
    borderColor: string;
    tableHeaderBg: string;
    tableHeaderText: string;
  };

  const v: Record<string, ProTokens> = {
    'blue-modern':    { accentColor:'#1e40af', headerBg:'#1e3a8a',                              headerText:'#fff', totalBg:'#dbeafe', totalText:'#1e40af', borderColor:'#bfdbfe', tableHeaderBg:'#1e40af',                             tableHeaderText:'#fff' },
    'bw':             { accentColor:'#111827', headerBg:'#111827',                              headerText:'#fff', totalBg:'#f3f4f6', totalText:'#111827', borderColor:'#d1d5db', tableHeaderBg:'#374151',                             tableHeaderText:'#fff' },
    'navy':           { accentColor:'#1e3a5f', headerBg:'#1e3a5f',                              headerText:'#fff', totalBg:'#e8edf5', totalText:'#1e3a5f', borderColor:'#c7d2e8', tableHeaderBg:'#1e3a5f',                             tableHeaderText:'#fff' },
    'soft-pastel':    { accentColor:'#7c3aed', headerBg:'#ede9fe',                              headerText:'#4c1d95', totalBg:'#f5f3ff', totalText:'#7c3aed', borderColor:'#ddd6fe', tableHeaderBg:'#7c3aed',                          tableHeaderText:'#fff' },
    'corp-teal':      { accentColor:'#0f766e', headerBg:'#0f766e',                              headerText:'#fff', totalBg:'#ccfbf1', totalText:'#0f766e', borderColor:'#99f6e4', tableHeaderBg:'#0f766e',                             tableHeaderText:'#fff' },
    'elegant-beige':  { accentColor:'#92400e', headerBg:'#fef3c7',                              headerText:'#92400e', totalBg:'#fffbeb', totalText:'#92400e', borderColor:'#fde68a', tableHeaderBg:'#d97706',                          tableHeaderText:'#fff' },
    'green-eco':      { accentColor:'#166534', headerBg:'#166534',                              headerText:'#fff', totalBg:'#dcfce7', totalText:'#166534', borderColor:'#bbf7d0', tableHeaderBg:'#16a34a',                             tableHeaderText:'#fff' },
    'gradient':       { accentColor:'#7c3aed', headerBg:'linear-gradient(135deg,#1e40af,#7c3aed)', headerText:'#fff', totalBg:'#ede9fe', totalText:'#7c3aed', borderColor:'#ddd6fe', tableHeaderBg:'linear-gradient(90deg,#1e40af,#7c3aed)', tableHeaderText:'#fff' },
    'classic-orange': { accentColor:'#c2410c', headerBg:'#fff7ed',                              headerText:'#c2410c', totalBg:'#ffedd5', totalText:'#c2410c', borderColor:'#fed7aa', tableHeaderBg:'#ea580c',                          tableHeaderText:'#fff' },
    'biz-clean':      { accentColor:'#334155', headerBg:'#f8fafc',                              headerText:'#334155', totalBg:'#f1f5f9', totalText:'#334155', borderColor:'#e2e8f0', tableHeaderBg:'#475569',                          tableHeaderText:'#fff' },
  };
  const t = v[variant] ?? v['blue-modern'];

  const itemRows = data.items.map((item, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td>${escapeHtml(isTh ? item.nameTh : (item.nameEn ?? item.nameTh))}</td>
      <td class="center">${item.quantity}</td>
      <td class="center">${escapeHtml(item.unit)}</td>
      <td class="right">${formatCurrency(item.unitPrice)}</td>
      <td class="right">${formatCurrency(item.amount)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="${fontUrl}" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #111; background: #fff; }
  .page { width: 794px; min-height: 1123px; background: #fff; }

  /* Header band */
  .header { background: ${t.headerBg}; color: ${t.headerText}; padding: 32px 40px; display: flex; justify-content: space-between; align-items: flex-start; }
  .header-left .company-name { font-size: 20px; font-weight: 700; }
  .header-left .company-detail { font-size: 11px; margin-top: 4px; opacity: 0.85; line-height: 1.7; }
  .header-right { text-align: right; }
  .doc-title { font-size: 22px; font-weight: 700; letter-spacing: 1px; }
  .doc-subtitle { font-size: 12px; opacity: 0.8; }
  .doc-meta { margin-top: 8px; border-collapse: collapse; font-size: 12px; margin-left: auto; }
  .doc-meta td { padding: 1px 4px; }
  .doc-meta td:first-child { opacity: 0.8; }
  .doc-meta td:last-child { font-weight: 600; }

  /* Body */
  .body { padding: 28px 40px; }

  /* Bill To */
  .bill-section { margin-bottom: 24px; }
  .bill-to { background: #f9fafb; border-left: 4px solid ${t.accentColor}; padding: 12px 16px; border-radius: 0 6px 6px 0; }
  .bill-to .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: ${t.accentColor}; margin-bottom: 6px; }
  .bill-to .buyer-name { font-size: 14px; font-weight: 700; }
  .bill-to .buyer-detail { font-size: 11px; color: #555; margin-top: 2px; line-height: 1.7; }

  /* Items table */
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  .items-table th { background: ${t.tableHeaderBg}; color: ${t.tableHeaderText}; padding: 9px 10px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  .items-table th.num { width: 40px; text-align: center; }
  .items-table th.right { text-align: right; width: 90px; }
  .items-table td { padding: 8px 10px; border-bottom: 1px solid ${t.borderColor}; font-size: 12px; }
  .items-table td.center { text-align: center; }
  .items-table td.right { text-align: right; }
  .items-table tr:last-child td { border-bottom: none; }
  .items-table tr:nth-child(even) td { background: #fafafa; }

  /* Totals */
  .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  .totals-table { width: 280px; border-collapse: collapse; }
  .totals-table td { padding: 5px 10px; font-size: 12px; }
  .totals-table td:last-child { text-align: right; font-weight: 500; }
  .totals-table tr.divider td { border-top: 1px solid ${t.borderColor}; }
  .totals-table tr.grand td { background: ${t.totalBg}; color: ${t.totalText}; font-weight: 700; font-size: 14px; }

  /* Signature */
  .sig-row { display: flex; gap: 16px; margin-top: 16px; }
  .sig-box { flex: 1; text-align: center; border-top: 1px solid ${t.borderColor}; padding-top: 8px; font-size: 11px; color: #666; }
  .sig-space { height: 48px; display: flex; align-items: center; justify-content: center; }
  .sig-image { max-height: 44px; object-fit: contain; }

  /* Notes & bank */
  .notes { background: #f9fafb; border: 1px solid ${t.borderColor}; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; font-size: 11px; color: #555; }
  .notes-label { font-weight: 700; color: ${t.accentColor}; margin-bottom: 4px; }
  .words-box { border: 1px solid ${t.borderColor}; border-radius: 6px; padding: 10px 14px; font-size: 12px; margin-bottom: 12px; }
  .words-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${t.accentColor}; margin-bottom: 4px; }
  .bank-box { border: 1px solid ${t.borderColor}; border-radius: 6px; padding: 10px 14px; font-size: 12px; margin-bottom: 12px; }

  /* Footer */
  .doc-footer { margin-top: 12px; display: flex; justify-content: space-between; font-size: 10.5px; color: #9ca3af; border-top: 1px solid ${t.borderColor}; padding-top: 8px; }
  .logo-img { width: 56px; height: 56px; object-fit: contain; border-radius: 4px; background: rgba(255,255,255,0.15); padding: 4px; margin-right: 14px; }

  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="page">

  <!-- Header band -->
  <div class="header">
    <div class="header-left" style="display:flex;align-items:flex-start">
      ${data.showCompanyLogo !== false && data.seller.logoUrl ? `<img class="logo-img" src="${data.seller.logoUrl}" alt="logo"/>` : ''}
      <div>
        <div class="company-name">${escapeHtml(sellerName)}</div>
        <div class="company-detail">
          <div>${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.seller.taxId)}</div>
          <div>${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(sellerBranch)}</div>
          <div>${escapeHtml(sellerAddr)}</div>
          ${data.seller.phone ? `<div>${escapeHtml(data.seller.phone)}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-title">${escapeHtml(docTitle)}</div>
      <div class="doc-subtitle">TAX INVOICE</div>
      <table class="doc-meta">
        <tr><td>${isTh ? 'เลขที่' : 'No.'}</td><td>${escapeHtml(data.invoiceNumber)}</td></tr>
        <tr><td>${isTh ? 'วันที่' : 'Date'}</td><td>${escapeHtml(dateStr)}</td></tr>
        ${dueStr ? `<tr><td>${isTh ? 'ครบกำหนด' : 'Due'}</td><td>${escapeHtml(dueStr)}</td></tr>` : ''}
      </table>
    </div>
  </div>

  <!-- Body -->
  <div class="body">

    <!-- Bill To -->
    <div class="bill-section">
      <div class="bill-to">
        <div class="label">${isTh ? 'ผู้ซื้อ / Bill To' : 'Bill To'}</div>
        <div class="buyer-name">${escapeHtml(buyerName)}</div>
        <div class="buyer-detail">
          <div>${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.buyer.taxId)}</div>
          <div>${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(buyerBranch)}</div>
          <div>${escapeHtml(buyerAddr)}</div>
        </div>
      </div>
    </div>

    <!-- Items -->
    <table class="items-table">
      <thead>
        <tr>
          <th class="num">${isTh ? 'ลำดับ' : 'No.'}</th>
          <th>${isTh ? 'รายการ' : 'Description'}</th>
          <th style="width:52px;text-align:center">${isTh ? 'จำนวน' : 'Qty'}</th>
          <th style="width:56px;text-align:center">${isTh ? 'หน่วย' : 'Unit'}</th>
          <th class="right">${isTh ? 'ราคา/หน่วย' : 'Unit Price'}</th>
          <th class="right">${isTh ? 'จำนวนเงิน' : 'Amount'}</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <!-- Totals -->
    <div class="totals-wrap">
      <table class="totals-table">
        <tr><td>${isTh ? 'ยอดรวม (Subtotal)' : 'Subtotal'}</td><td>${formatCurrency(data.subtotal)}</td></tr>
        <tr><td>${isTh ? 'ภาษีมูลค่าเพิ่ม 7% (VAT)' : 'VAT 7%'}</td><td>${formatCurrency(data.vatAmount)}</td></tr>
        <tr class="divider grand"><td>${isTh ? 'จำนวนเงินรวมทั้งสิ้น (Total)' : 'Grand Total'}</td><td>${formatCurrency(data.total)}</td></tr>
      </table>
    </div>

    <!-- Amount in words -->
    <div class="words-box">
      <div class="words-label">${isTh ? 'จำนวนเงินเป็นตัวอักษร' : 'Amount in Words'}</div>
      <div>${escapeHtml(totalWords)}</div>
    </div>

    ${data.notes ? `<div class="notes"><div class="notes-label">${isTh ? 'หมายเหตุ' : 'Notes'}</div><div>${escapeHtml(data.notes)}</div></div>` : ''}

    ${data.bankPaymentInfo ? `<div class="bank-box"><div class="notes-label">${isTh ? 'ข้อมูลบัญชีสำหรับโอนเงิน' : 'Bank Transfer'}</div><div style="white-space:pre-line">${escapeHtml(data.bankPaymentInfo)}</div></div>` : ''}

    <!-- Signatures -->
    <div class="sig-row">
      <div class="sig-box">
        <div class="sig-space">${data.signatureImageUrl ? `<img class="sig-image" src="${data.signatureImageUrl}" alt="signature"/>` : ''}</div>
        <div style="font-size:11px;margin-top:3px">${isTh ? 'ผู้จัดทำ / ผู้ออกเอกสาร' : 'Prepared by / Issuer'}</div>
        ${data.signerName ? `<div style="font-size:11px;font-weight:600;margin-top:2px">${escapeHtml(data.signerName)}</div>` : ''}
        ${data.signerTitle ? `<div style="font-size:11px;color:#6b7280">${escapeHtml(data.signerTitle)}</div>` : ''}
      </div>
      <div class="sig-box">
        <div class="sig-space"></div>
        <div style="font-size:11px;margin-top:3px">${isTh ? 'ผู้รับสินค้า / ลูกค้า' : 'Received by / Customer'}</div>
      </div>
      ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? `
      <div class="sig-box" style="text-align:center">
        <img style="width:72px;height:72px;object-fit:contain" src="${data.onlineQrDataUrl}" alt="QR"/>
        <div style="font-size:10px;color:#6b7280;margin-top:4px">${isTh ? 'สแกนตรวจสอบเอกสาร' : 'Scan to verify'}</div>
      </div>` : ''}
    </div>

    <div class="doc-footer">
      <div>${isTh ? 'เอกสารนี้ออกโดยระบบ Billboy e-Tax' : 'Issued via Billboy e-Tax System'}</div>
      <div>${escapeHtml(docTitle)} · ${escapeHtml(data.invoiceNumber)}</div>
    </div>

  </div>
</div>
</body>
</html>`;
}

function buildHtmlCrayon(data: PdfInvoiceData): string {
  const isTh = data.language === 'th';
  const isEn = data.language === 'en';
  const docTitle = DOC_TITLE[data.type]?.[data.language] ?? 'ใบกำกับภาษี';
  const dateStr = isTh ? formatDateTh(data.invoiceDate) : formatDateEn(data.invoiceDate);
  const dueStr = data.dueDate ? (isTh ? formatDateTh(data.dueDate) : formatDateEn(data.dueDate)) : '';
  const totalWords = isTh
    ? amountInWordsThai(data.total)
    : isEn ? amountInWordsEnglish(data.total)
    : `${amountInWordsThai(data.total)} / ${amountInWordsEnglish(data.total)}`;

  const sellerName = isTh ? data.seller.nameTh : isEn ? (data.seller.nameEn ?? data.seller.nameTh) : `${data.seller.nameTh} / ${data.seller.nameEn ?? data.seller.nameTh}`;
  const buyerName  = isTh ? data.buyer.nameTh  : isEn ? (data.buyer.nameEn  ?? data.buyer.nameTh)  : `${data.buyer.nameTh} / ${data.buyer.nameEn ?? data.buyer.nameTh}`;
  const sellerAddr = isTh ? data.seller.addressTh : isEn ? (data.seller.addressEn ?? data.seller.addressTh) : data.seller.addressTh;
  const buyerAddr  = isTh ? data.buyer.addressTh  : isEn ? (data.buyer.addressEn  ?? data.buyer.addressTh)  : data.buyer.addressTh;
  const sellerBranch = data.seller.branchCode === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.seller.branchCode;
  const buyerBranch  = data.buyer.branchCode  === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.buyer.branchCode;

  const itemRows = data.items.map((item, idx) => `
    <tr class="${idx % 2 === 1 ? 'row-even' : ''}">
      <td class="center">${idx + 1}</td>
      <td>${escapeHtml(isTh ? item.nameTh : (item.nameEn ?? item.nameTh))}</td>
      <td class="center">${item.quantity}</td>
      <td class="right">${formatCurrency(item.unitPrice)}</td>
      <td class="right">${formatCurrency(item.amount)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Patrick+Hand&family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background: #fffef5;
    font-family: 'Patrick Hand', 'Comic Sans MS', 'Sarabun', cursive;
    font-size: 13px;
    color: #222;
    padding: 20px;
  }
  .page {
    width: 794px;
    min-height: 1123px;
    background: #fffef5;
    padding: 28px 32px;
    margin: 0 auto;
    position: relative;
    border: 4px solid #f43f5e;
    border-radius: 12px;
    box-shadow: inset 0 0 0 6px #fffef5, inset 0 0 0 10px #fde68a;
  }
  .doodle-bar {
    text-align: center;
    font-size: 20px;
    letter-spacing: 6px;
    margin-bottom: 12px;
    color: #f43f5e;
  }
  .doc-title {
    text-align: center;
    margin-bottom: 14px;
  }
  .doc-title h1 {
    font-size: 26px;
    font-weight: 900;
    color: #2563eb;
    border-bottom: 3px wavy #f43f5e;
    display: inline-block;
    padding-bottom: 4px;
    transform: rotate(-0.5deg);
  }
  .doc-title .en-title {
    font-size: 13px;
    color: #7c3aed;
    margin-top: 4px;
  }
  .wavy-divider {
    text-align: center;
    color: #f59e0b;
    font-size: 16px;
    letter-spacing: 4px;
    margin: 8px 0;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 18px;
    gap: 16px;
  }
  .meta-box {
    border: 2px dashed #10b981;
    border-radius: 10px;
    padding: 10px 14px;
    flex: 1;
    background: #f0fdf4;
    transform: rotate(0.3deg);
  }
  .meta-box.right {
    background: #eff6ff;
    border-color: #3b82f6;
    transform: rotate(-0.3deg);
  }
  .meta-label { font-size: 11px; color: #6b7280; }
  .meta-value { font-size: 13px; font-weight: 700; color: #111; margin-top: 2px; }
  .meta-row-item { margin-bottom: 4px; }
  .bill-box {
    border: 3px solid #f59e0b;
    border-radius: 14px;
    padding: 14px 18px;
    padding-top: 20px;
    margin-bottom: 18px;
    background: #fffbeb;
    position: relative;
    transform: rotate(-0.2deg);
  }
  .bill-box-label {
    position: absolute;
    top: -12px;
    left: 16px;
    background: #fef3c7;
    border: 2px solid #f59e0b;
    border-radius: 8px;
    padding: 0 8px;
    font-size: 11px;
    font-weight: 700;
    color: #92400e;
  }
  .buyer-name { font-size: 15px; font-weight: 700; color: #111; margin-bottom: 4px; }
  .buyer-detail { font-size: 12px; color: #555; margin-top: 3px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0 4px; margin-bottom: 14px; }
  thead tr th {
    background: #f43f5e;
    color: white;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 700;
  }
  thead tr th:first-child { border-radius: 10px 0 0 10px; }
  thead tr th:last-child { border-radius: 0 10px 10px 0; }
  th.right { text-align: right; }
  th.center { text-align: center; }
  td {
    padding: 8px 10px;
    background: #fff;
    border-top: 1px dashed #d1d5db;
    border-bottom: 1px dashed #d1d5db;
    font-size: 12px;
  }
  td.center { text-align: center; }
  td.right { text-align: right; }
  td:first-child { border-left: 2px dashed #a78bfa; border-radius: 8px 0 0 8px; text-align: center; }
  td:last-child { border-right: 2px dashed #a78bfa; border-radius: 0 8px 8px 0; }
  tr.row-even td { background: #fdf4ff; }
  .totals-area {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 18px;
  }
  .totals-box {
    width: 280px;
    border: 3px solid #a78bfa;
    border-radius: 16px;
    overflow: hidden;
    transform: rotate(0.3deg);
  }
  .total-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 14px;
    font-size: 12px;
    border-bottom: 1px dashed #ddd6fe;
  }
  .total-row:last-child { border-bottom: none; }
  .total-row.grand {
    background: #7c3aed;
    color: white;
    font-size: 15px;
    font-weight: 700;
    padding: 10px 14px;
  }
  .words-box {
    background: #fef9c3;
    border: 2px dashed #fbbf24;
    border-radius: 12px;
    padding: 10px 14px;
    margin-bottom: 14px;
    font-size: 12px;
    transform: rotate(0.1deg);
  }
  .words-label { font-size: 11px; color: #92400e; font-weight: 700; margin-bottom: 4px; }
  .notes-box {
    background: #f0fdf4;
    border: 2px dashed #6ee7b7;
    border-radius: 12px;
    padding: 10px 14px;
    margin-bottom: 14px;
    font-size: 12px;
    color: #555;
  }
  .bank-box {
    background: #eff6ff;
    border: 2px dashed #93c5fd;
    border-radius: 12px;
    padding: 10px 14px;
    margin-bottom: 14px;
    font-size: 12px;
    color: #1e40af;
  }
  .sig-section {
    display: flex;
    gap: 14px;
    margin-top: 18px;
    margin-bottom: 18px;
  }
  .sig-box {
    flex: 1;
    border: 2px dashed #9ca3af;
    border-radius: 12px;
    padding: 12px;
    text-align: center;
    background: #f9fafb;
    transform: rotate(0.4deg);
  }
  .sig-box:nth-child(2) { transform: rotate(-0.4deg); }
  .sig-box:nth-child(3) { transform: rotate(0.2deg); }
  .sig-space { height: 44px; display: flex; align-items: center; justify-content: center; }
  .sig-image { max-height: 40px; object-fit: contain; }
  .sig-line { border-top: 1px solid #d1d5db; margin: 4px 20px; }
  .sig-name { font-size: 11px; margin-top: 6px; color: #555; }
  .bottom-doodle {
    text-align: center;
    font-size: 18px;
    letter-spacing: 8px;
    margin-top: 16px;
    color: #10b981;
    border-top: 3px dotted #fbbf24;
    padding-top: 12px;
  }
  .logo-img { max-height: 48px; object-fit: contain; margin-bottom: 6px; display: block; }
  @media print { body { padding: 0; background: #fffef5; } }
</style>
</head>
<body>
<div class="page">

  <div class="doodle-bar">🌸 ⭐ ☁️ 🍭 ❤️ 🌈 ⭐ ☁️ 🌸</div>

  <div class="doc-title">
    <h1>${escapeHtml(docTitle)}</h1>
    <div class="en-title">TAX INVOICE / RECEIPT ✏️</div>
  </div>

  <div class="wavy-divider">~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~</div>

  <div class="meta-row">
    <div class="meta-box">
      ${data.showCompanyLogo !== false && data.seller.logoUrl ? `<img class="logo-img" src="${data.seller.logoUrl}" alt="logo"/>` : ''}
      <div class="meta-value" style="font-size:15px;color:#2563eb">${escapeHtml(sellerName)}</div>
      <div class="meta-row-item"><span class="meta-label">${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: </span><span class="meta-label" style="color:#374151">${escapeHtml(data.seller.taxId)}</span></div>
      <div class="meta-row-item"><span class="meta-label">${isTh ? 'สาขา' : 'Branch'}: </span><span class="meta-label" style="color:#374151">${escapeHtml(sellerBranch)}</span></div>
      <div class="meta-row-item"><span class="meta-label">${escapeHtml(sellerAddr)}</span></div>
      ${data.seller.phone ? `<div class="meta-row-item"><span class="meta-label">โทร. ${escapeHtml(data.seller.phone)}</span></div>` : ''}
    </div>
    <div class="meta-box right">
      <div class="meta-row-item"><span class="meta-label">${isTh ? 'เลขที่' : 'Invoice No.'}: </span><div class="meta-value">${escapeHtml(data.invoiceNumber)}</div></div>
      <div class="meta-row-item"><span class="meta-label">${isTh ? 'วันที่' : 'Date'}: </span><div class="meta-value">${escapeHtml(dateStr)}</div></div>
      ${dueStr ? `<div class="meta-row-item"><span class="meta-label">${isTh ? 'วันครบกำหนด' : 'Due Date'}: </span><div class="meta-value">${escapeHtml(dueStr)}</div></div>` : ''}
      ${data.paymentMethod ? `<div class="meta-row-item"><span class="meta-label">${isTh ? 'วิธีชำระเงิน' : 'Payment'}: </span><div class="meta-value">${escapeHtml(data.paymentMethod)}</div></div>` : ''}
      <div style="margin-top:8px;display:inline-block;border:2px solid #f43f5e;border-radius:8px;padding:2px 10px;font-size:11px;font-weight:700;color:#f43f5e">${isTh ? 'ต้นฉบับ' : 'ORIGINAL'}</div>
    </div>
  </div>

  <div class="bill-box">
    <div class="bill-box-label">📋 ${isTh ? 'ส่งถึง / Bill To' : 'Bill To'}</div>
    <div class="buyer-name">${escapeHtml(buyerName)}</div>
    <div class="buyer-detail">${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.buyer.taxId)}</div>
    <div class="buyer-detail">${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(buyerBranch)}</div>
    <div class="buyer-detail">${escapeHtml(buyerAddr)}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="center" style="width:36px">#</th>
        <th>${isTh ? 'รายการ / Description' : 'Description'}</th>
        <th class="center" style="width:60px">${isTh ? 'จำนวน' : 'Qty'}</th>
        <th class="right" style="width:90px">${isTh ? 'ราคา/หน่วย' : 'Unit Price'}</th>
        <th class="right" style="width:90px">${isTh ? 'จำนวนเงิน' : 'Amount'}</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals-area">
    <div class="totals-box">
      <div class="total-row"><span>${isTh ? 'ยอดรวม (Subtotal)' : 'Subtotal'}</span><span>${formatCurrency(data.subtotal)}</span></div>
      <div class="total-row"><span>${isTh ? 'ภาษีมูลค่าเพิ่ม 7% (VAT)' : 'VAT 7%'}</span><span>${formatCurrency(data.vatAmount)}</span></div>
      <div class="total-row grand"><span>${isTh ? 'ยอดรวมสุทธิ 🎉' : 'Grand Total 🎉'}</span><span>${formatCurrency(data.total)}</span></div>
    </div>
  </div>

  <div class="words-box">
    <div class="words-label">✏️ ${isTh ? 'จำนวนเงินเป็นตัวอักษร' : 'Amount in Words'}</div>
    <div>${escapeHtml(totalWords)}</div>
  </div>

  ${data.notes ? `<div class="notes-box"><div class="words-label" style="color:#065f46">📝 ${isTh ? 'หมายเหตุ' : 'Notes'}</div><div>${escapeHtml(data.notes)}</div></div>` : ''}

  ${data.bankPaymentInfo ? `<div class="bank-box"><div class="words-label" style="color:#1e40af">🏦 ${isTh ? 'ข้อมูลบัญชีสำหรับโอนเงิน' : 'Bank Transfer'}</div><div style="white-space:pre-line">${escapeHtml(data.bankPaymentInfo)}</div></div>` : ''}

  <div class="sig-section">
    <div class="sig-box">
      <div class="sig-space">${data.signatureImageUrl ? `<img class="sig-image" src="${data.signatureImageUrl}" alt="signature"/>` : ''}</div>
      <div class="sig-line"></div>
      <div class="sig-name">${isTh ? 'ผู้จัดทำ / ผู้ออกเอกสาร' : 'Prepared by / Issuer'}</div>
      ${data.signerName ? `<div style="font-size:11px;font-weight:700;color:#7c3aed">${escapeHtml(data.signerName)}</div>` : ''}
      ${data.signerTitle ? `<div style="font-size:11px;color:#6b7280">${escapeHtml(data.signerTitle)}</div>` : ''}
    </div>
    <div class="sig-box">
      <div class="sig-space"></div>
      <div class="sig-line"></div>
      <div class="sig-name">${isTh ? 'ผู้รับสินค้า / ลูกค้า' : 'Received by / Customer'}</div>
    </div>
    ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? `
    <div class="sig-box">
      <img style="width:64px;height:64px;object-fit:contain;display:block;margin:0 auto" src="${data.onlineQrDataUrl}" alt="QR"/>
      <div style="font-size:10px;color:#6b7280;margin-top:4px;text-align:center">${isTh ? 'สแกนตรวจสอบ' : 'Scan to verify'}</div>
    </div>` : ''}
  </div>

  <div class="bottom-doodle">🍬 🌟 🎀 💐 🌙 🎠 🌻 🍦 🎈</div>

</div>
</body>
</html>`;
}

export async function buildHtmlForCompany(data: PdfInvoiceData, companyId: string): Promise<string> {
  const template = await resolveTemplateForDocument(companyId, data.type, data.language, data.templateId);
  const enrichedData = await enrichElectronicDocument(data);

  const mergedData = {
    ...enrichedData,
    templateName: data.templateName ?? template?.name ?? null,
    templateHtml: data.templateHtml ?? template?.html ?? null,
    templateNote: null,
  };

  // Route to specialized builders
  if (mergedData.templateId?.startsWith('builtin:minimal-')) {
    const variant = mergedData.templateId.replace('builtin:minimal-', '');
    return buildHtmlMinimal(mergedData, variant);
  }

  if (mergedData.templateId?.startsWith('builtin:cute-')) {
    const variant = mergedData.templateId.replace('builtin:cute-', '');
    return buildHtmlCute(mergedData, variant);
  }

  if (mergedData.templateId?.startsWith('builtin:pro-')) {
    const variant = mergedData.templateId.replace('builtin:pro-', '');
    return buildHtmlProfessional(mergedData, variant);
  }

  if (mergedData.templateId === 'builtin:crayon') {
    return buildHtmlCrayon(mergedData);
  }

  return buildHtml(mergedData);
}

function buildCustomerStatementHtml(data: CustomerStatementPdfData): string {
  const isTh = data.language !== 'en';
  const customerName = isTh ? data.customer.nameTh : (data.customer.nameEn ?? data.customer.nameTh);
  const customerAltName = isTh ? data.customer.nameEn : data.customer.nameTh;
  const customerAddress = isTh ? (data.customer.addressTh ?? '-') : (data.customer.addressEn ?? data.customer.addressTh ?? '-');

  const agingRows = [
    [isTh ? 'ยังไม่เกินกำหนด' : 'Current', data.aging.current],
    ['1-30', data.aging.days1To30],
    ['31-60', data.aging.days31To60],
    ['61-90', data.aging.days61To90],
    ['90+', data.aging.days90Plus],
  ];

  const entryRows = data.entries.map((entry) => `
    <tr>
      <td>${entry.invoiceNumber}</td>
      <td>${entry.type}</td>
      <td>${isTh ? formatDateTh(entry.invoiceDate) : formatDateEn(entry.invoiceDate)}</td>
      <td>${entry.dueDate ? (isTh ? formatDateTh(entry.dueDate) : formatDateEn(entry.dueDate)) : '-'}</td>
      <td style="text-align:right">${formatCurrency(entry.signedTotal)}</td>
      <td style="text-align:right">${formatCurrency(entry.paidAmount)}</td>
      <td style="text-align:right">${formatCurrency(entry.outstandingAmount)}</td>
      <td style="text-align:right">${formatCurrency(entry.runningBalance)}</td>
      <td style="text-align:right">${entry.ageDays}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; }
  .page { max-width: 210mm; margin: 0 auto; }
  .header { display:flex; justify-content:space-between; gap:24px; border-bottom: 3px solid #0f766e; padding-bottom: 16px; margin-bottom: 20px; }
  .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .18em; color: #64748b; }
  h1 { margin: 6px 0 0; font-size: 26px; color: #0f172a; }
  .meta { text-align:right; font-size: 12px; color:#475569; }
  .grid { display:grid; grid-template-columns: 1.3fr .9fr; gap: 16px; margin-bottom: 16px; }
  .card { border:1px solid #e2e8f0; border-radius: 14px; padding: 14px; background:#fff; }
  .card h2 { margin: 0 0 8px; font-size: 14px; color:#0f172a; }
  .muted { color:#64748b; font-size: 12px; }
  .summary-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
  .summary-item { border-radius: 14px; padding: 14px; background:#f8fafc; border:1px solid #e2e8f0; }
  .summary-item strong { display:block; font-size: 18px; margin-top: 4px; color:#0f172a; }
  table { width:100%; border-collapse: collapse; font-size: 12px; }
  th { text-align:left; font-weight:600; color:#475569; padding: 8px 6px; border-bottom:1px solid #cbd5e1; }
  td { padding: 8px 6px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
  .section-title { margin: 20px 0 10px; font-size: 15px; font-weight: 700; color:#0f172a; }
  .footer { margin-top: 18px; border-top:1px solid #e2e8f0; padding-top: 8px; font-size: 10px; text-align:center; color:#94a3b8; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="eyebrow">Statement of Account</div>
        <h1>${isTh ? 'รายงานลูกหนี้คงค้าง' : 'Customer Statement'}</h1>
        <div class="muted">${data.companyName}</div>
      </div>
      <div class="meta">
        <div>${isTh ? 'ออกรายงานเมื่อ' : 'Generated at'}</div>
        <strong>${isTh ? formatDateTh(data.generatedAt) : formatDateEn(data.generatedAt)}</strong>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>${isTh ? 'ข้อมูลลูกค้า' : 'Customer details'}</h2>
        <div><strong>${customerName}</strong></div>
        ${customerAltName ? `<div class="muted" style="margin-top:2px">${customerAltName}</div>` : ''}
        <div style="margin-top:8px">${isTh ? 'เลขผู้เสียภาษี' : 'Tax ID'}: ${data.customer.taxId}</div>
        <div class="muted" style="margin-top:6px">${customerAddress}</div>
        ${data.customer.email ? `<div class="muted" style="margin-top:6px">${data.customer.email}</div>` : ''}
      </div>
      <div class="card">
        <h2>${isTh ? 'สรุปยอด' : 'Balance summary'}</h2>
        <div class="muted">${isTh ? 'ยอดค้างรวม' : 'Total outstanding'}</div>
        <strong style="font-size:22px">${formatCurrency(data.summary.totalOutstanding)} THB</strong>
        <div style="margin-top:10px" class="muted">${isTh ? 'ยอดเกินกำหนด' : 'Overdue outstanding'}: ${formatCurrency(data.summary.overdueOutstanding)} THB</div>
        <div class="muted">${isTh ? 'รับชำระแล้ว' : 'Total received'}: ${formatCurrency(data.summary.totalReceived)} THB</div>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-item">
        <div class="muted">${isTh ? 'ยอดวางบิล' : 'Total billed'}</div>
        <strong>${formatCurrency(data.summary.totalBilled)}</strong>
      </div>
      <div class="summary-item">
        <div class="muted">${isTh ? 'เครดิตโน้ต' : 'Credits'}</div>
        <strong>${formatCurrency(data.summary.totalCredits)}</strong>
      </div>
      <div class="summary-item">
        <div class="muted">${isTh ? 'ยอดปัจจุบัน' : 'Current outstanding'}</div>
        <strong>${formatCurrency(data.summary.currentOutstanding)}</strong>
      </div>
    </div>

    <div class="section-title">${isTh ? 'Aging Summary' : 'Aging Summary'}</div>
    <table>
      <thead>
        <tr>
          <th>${isTh ? 'ช่วงอายุหนี้' : 'Bucket'}</th>
          <th style="text-align:right">${isTh ? 'ยอดค้าง' : 'Outstanding'}</th>
        </tr>
      </thead>
      <tbody>
        ${agingRows.map(([label, amount]) => `
          <tr>
            <td>${label}</td>
            <td style="text-align:right">${formatCurrency(amount as number)} THB</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="section-title">${isTh ? 'รายการเอกสาร' : 'Statement entries'}</div>
    <table>
      <thead>
        <tr>
          <th>${isTh ? 'เลขที่เอกสาร' : 'Document No.'}</th>
          <th>${isTh ? 'ประเภท' : 'Type'}</th>
          <th>${isTh ? 'วันที่เอกสาร' : 'Invoice date'}</th>
          <th>${isTh ? 'ครบกำหนด' : 'Due date'}</th>
          <th style="text-align:right">${isTh ? 'ยอดเอกสาร' : 'Amount'}</th>
          <th style="text-align:right">${isTh ? 'รับชำระแล้ว' : 'Paid'}</th>
          <th style="text-align:right">${isTh ? 'คงเหลือ' : 'Outstanding'}</th>
          <th style="text-align:right">${isTh ? 'คงค้างสะสม' : 'Running balance'}</th>
          <th style="text-align:right">${isTh ? 'อายุหนี้' : 'Age'}</th>
        </tr>
      </thead>
      <tbody>
        ${entryRows}
      </tbody>
    </table>

    <div class="footer">e-Tax Invoice System | ${isTh ? 'เอกสารนี้สร้างจากระบบอัตโนมัติ' : 'This statement was generated automatically'}</div>
  </div>
</body>
</html>`;
}

export async function generateCustomerStatementPdf(data: CustomerStatementPdfData): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30_000);
    await page.setContent(buildCustomerStatementHtml(data), { waitUntil: 'domcontentloaded' });
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
logger.debug('pdfService loaded');
