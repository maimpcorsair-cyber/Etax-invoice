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
  .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
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
  .sig-space { height: 58px; }
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
          <div class="party-grid">
            <div class="party-column">
              <div class="party-title">${labels.seller}</div>
              <div class="party-name">${sellerName}</div>
              <div class="party-detail">
                <div>${labels.taxId}: <strong>${data.seller.taxId}</strong></div>
                <div>${labels.branch}: <strong>${sellerBranch}</strong></div>
                <div>${sellerAddr}</div>
                ${data.seller.phone || data.seller.email ? `<div style="margin-top:4px">${[data.seller.phone ? `Tel. ${data.seller.phone}` : '', data.seller.email ?? ''].filter(Boolean).join(' | ')}</div>` : ''}
              </div>
            </div>
            <div class="party-column">
              <div class="party-title">${labels.buyer}</div>
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

      ${!isElectronicDocument ? `
        <div class="signature-grid">
          <div class="sig-card">
            <div class="sig-space"></div>
            <div class="sig-line"></div>
            <div class="sig-title">${labels.preparedBy}</div>
          </div>
          <div class="sig-card">
            <div class="sig-space"></div>
            <div class="sig-line"></div>
            <div class="sig-title">${labels.receivedBy}</div>
          </div>
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

export async function buildHtmlForCompany(data: PdfInvoiceData, companyId: string): Promise<string> {
  const template = await resolveTemplateForDocument(companyId, data.type, data.language, data.templateId);
  const enrichedData = await enrichElectronicDocument(data);
  return buildHtml({
    ...enrichedData,
    templateName: data.templateName ?? template?.name ?? null,
    templateHtml: data.templateHtml ?? template?.html ?? null,
    templateNote: null,
  });
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
