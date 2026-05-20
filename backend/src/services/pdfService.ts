import { launchBrowser } from './browserService';
import QRCode from 'qrcode';
import { amountInWordsThai, amountInWordsEnglish } from './invoiceService';
import { logger } from '../config/logger';
import prisma from '../config/database';
import {
  formatDateTh,
  formatDateEn,
  formatCurrency,
  escapeHtml,
  DOC_TITLE,
  ALL_DOCUMENT_TYPES,
  BUILTIN_DOCUMENT_TEMPLATES,
  resolveTemplateLanguageHtml,
  resolveBuiltinTemplate,
  compileTemplateHtml,
  buildOnlineViewUrl,
  frontendPublicAssetUrl,
  resolveDocumentTheme,
  type Language,
} from './pdfService/utils';
import { buildHtmlCrayon } from './pdfService/builders/crayon';
import { buildHtmlMinimal } from './pdfService/builders/minimal';
import { buildHtmlCute } from './pdfService/builders/cute';
import { buildHtmlProfessional } from './pdfService/builders/professional';
import { buildHtmlDark } from './pdfService/builders/dark';
import { buildHtmlAnime } from './pdfService/builders/anime';
export {
  buildHtmlCrayon,
  buildHtmlMinimal,
  buildHtmlCute,
  buildHtmlProfessional,
  buildHtmlDark,
  buildHtmlAnime,
};

export interface PdfInvoiceData {
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
    discountAmount: number;
    vatType: string;
    amount: number;
    vatAmount: number;
    totalAmount: number;
  }[];
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
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

export function buildHtml(data: PdfInvoiceData): string {
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
    const nameThEsc = escapeHtml(item.nameTh ?? '');
    const nameEnEsc = item.nameEn ? escapeHtml(item.nameEn) : '';
    const unitEsc = escapeHtml(item.unit ?? '');
    const nameLine = isBoth
      ? `<span class="item-name">${nameThEsc}</span>${nameEnEsc ? `<span class="item-subname">${nameEnEsc}</span>` : ''}`
      : isTh
        ? `<span class="item-name">${nameThEsc}</span>`
        : `<span class="item-name">${nameEnEsc || nameThEsc}</span>`;
    return `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${nameLine}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:center">${unitEsc}</td>
        <td style="text-align:right">${formatCurrency(item.unitPrice)}</td>
        <td style="text-align:center">${item.discountAmount > 0 ? item.discountAmount + '%' : '-'}</td>
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

  // Pre-escape every user-controlled field that gets interpolated into the
  // HTML below. Puppeteer renders this in a real Chromium, so unescaped <
  // turns into live DOM — historic XSS / SSRF surface (the headless
  // browser could fetch attacker URLs with our session token). Escape
  // ONCE at the source, retain any literal markup (<br/>, span wrappers)
  // around the escaped values, and never re-interpolate raw data.* below.
  const sellerNameTh = escapeHtml(data.seller.nameTh ?? '');
  const sellerNameEn = data.seller.nameEn ? escapeHtml(data.seller.nameEn) : '';
  const sellerAddrTh = escapeHtml(data.seller.addressTh ?? '');
  const sellerAddrEn = data.seller.addressEn ? escapeHtml(data.seller.addressEn) : '';
  const buyerNameTh = escapeHtml(data.buyer.nameTh ?? '');
  const buyerNameEn = data.buyer.nameEn ? escapeHtml(data.buyer.nameEn) : '';
  const buyerAddrTh = escapeHtml(data.buyer.addressTh ?? '');
  const buyerAddrEn = data.buyer.addressEn ? escapeHtml(data.buyer.addressEn) : '';
  const buyerTaxIdEsc = escapeHtml(data.buyer.taxId ?? '');
  const buyerBranchCodeEsc = data.buyer.branchCode ? escapeHtml(data.buyer.branchCode) : '';

  const sellerName = isTh ? sellerNameTh : isEn ? (sellerNameEn || sellerNameTh) : `${sellerNameTh} / ${sellerNameEn || sellerNameTh}`;
  const buyerName = isTh ? buyerNameTh : isEn ? (buyerNameEn || buyerNameTh) : `${buyerNameTh} / ${buyerNameEn || buyerNameTh}`;
  const sellerAddr = isTh ? sellerAddrTh : isEn ? (sellerAddrEn || sellerAddrTh) : `${sellerAddrTh}${sellerAddrEn ? `<br/><span class="muted-inline">${sellerAddrEn}</span>` : ''}`;
  const buyerAddr = isTh ? buyerAddrTh : isEn ? (buyerAddrEn || buyerAddrTh) : `${buyerAddrTh}${buyerAddrEn ? `<br/><span class="muted-inline">${buyerAddrEn}</span>` : ''}`;
  const sellerBranchNameThEsc = data.seller.branchNameTh ? escapeHtml(data.seller.branchNameTh) : '';
  const sellerBranchCodeEsc = data.seller.branchCode ? escapeHtml(data.seller.branchCode) : '';
  const sellerBranch = data.seller.branchCode === '00000'
    ? labels.branchHeadOffice
    : `${sellerBranchCodeEsc}${sellerBranchNameThEsc ? ` ${sellerBranchNameThEsc}` : ''}`;
  const buyerBranch = data.buyer.branchCode === '00000'
    ? labels.branchHeadOffice
    : buyerBranchCodeEsc;
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
                <div>${labels.taxId}: <strong>${buyerTaxIdEsc}</strong></div>
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
                ${data.notes ? `<div>${escapeHtml(data.notes)}</div>` : ''}
                ${data.templateNote ? `<div style="margin-top:${data.notes ? '8px' : '0'}; color:#64748b;">${escapeHtml(data.templateNote)}</div>` : ''}
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
  const browser = await launchBrowser();

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

// ─── Minimal template builder ────────────────────────────────────────────────
/* ═══════════════════════════════════════════════════════════
   GROUP 4: DARK / MAN / TECH  (10 variants)
═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   GROUP 5: ANIME / OTAKU  (10 variants)
═══════════════════════════════════════════════════════════ */
type MarketplaceTemplateTokens = {
  id: string;
  name: string;
  bg: string;
  paper: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
  border: string;
  tableHead: string;
  totalBg: string;
  decor:
    | 'minimal' | 'gray' | 'line' | 'sans' | 'space' | 'mint' | 'beige' | 'darkAccent'
    | 'bunny' | 'cloudBear' | 'sunflower' | 'leafMascot' | 'cat' | 'cactus' | 'rainbow'
    | 'cube' | 'leaf' | 'gold' | 'tech' | 'mono' | 'seal' | 'gradient' | 'truck' | 'anime';
  dark?: boolean;
};

const MARKETPLACE_TEMPLATE_TOKENS: Record<string, MarketplaceTemplateTokens> = {
  'builtin:minimal-white': {
    id: '01', name: 'Minimal White', bg: '#f7f8fa', paper: '#ffffff', accent: '#111827', accent2: '#e6e8ed',
    text: '#111827', muted: '#5d6878', border: '#d6dbe4', tableHead: '#eef1f5', totalBg: '#f4f6f9', decor: 'minimal',
  },
  'builtin:minimal-gray': {
    id: '02', name: 'Minimal Gray', bg: '#eef0f4', paper: '#fafafa', accent: '#5f6875', accent2: '#d7dbe1',
    text: '#172033', muted: '#687385', border: '#cfd5dd', tableHead: '#eceff3', totalBg: '#e7ebf0', decor: 'gray',
  },
  'builtin:minimal-line': {
    id: '03', name: 'Minimal Line', bg: '#ffffff', paper: '#ffffff', accent: '#111827', accent2: '#f1f3f5',
    text: '#111827', muted: '#667085', border: '#bfc6d1', tableHead: '#111827', totalBg: '#111827', decor: 'line',
  },
  'builtin:minimal-sans': {
    id: '04', name: 'Minimal Sans', bg: '#f8fafc', paper: '#ffffff', accent: '#1f2937', accent2: '#eef1f5',
    text: '#111827', muted: '#667085', border: '#d7dde6', tableHead: '#1f2937', totalBg: '#f3f4f6', decor: 'sans',
  },
  'builtin:minimal-space': {
    id: '05', name: 'Minimal Space', bg: '#fafafa', paper: '#ffffff', accent: '#475569', accent2: '#f1f5f9',
    text: '#1e293b', muted: '#728095', border: '#e2e8f0', tableHead: '#f8fafc', totalBg: '#f1f5f9', decor: 'space',
  },
  'builtin:minimal-light-gray': {
    id: '11', name: 'Minimal Light Gray', bg: '#f1f3f6', paper: '#ffffff', accent: '#6b7280', accent2: '#eef1f5',
    text: '#111827', muted: '#6b7280', border: '#d9dee7', tableHead: '#f1f3f6', totalBg: '#f4f6f9', decor: 'gray',
  },
  'builtin:minimal-fine-line': {
    id: '12', name: 'Minimal Fine Line', bg: '#ffffff', paper: '#ffffff', accent: '#1f2937', accent2: '#f8fafc',
    text: '#111827', muted: '#667085', border: '#c6ccd5', tableHead: '#111827', totalBg: '#f5f6f8', decor: 'line',
  },
  'builtin:minimal-mint': {
    id: '13', name: 'Minimal Mint', bg: '#effdf8', paper: '#ffffff', accent: '#66c7ad', accent2: '#d9f4eb',
    text: '#164b42', muted: '#6c817b', border: '#c9eadf', tableHead: '#e8f7f1', totalBg: '#dff4ec', decor: 'mint',
  },
  'builtin:minimal-beige': {
    id: '14', name: 'Minimal Beige', bg: '#fff8ea', paper: '#fffdf8', accent: '#c09a4a', accent2: '#f3e5c3',
    text: '#3f2b16', muted: '#826e52', border: '#ead8b6', tableHead: '#f7ecd1', totalBg: '#f1e0b7', decor: 'beige',
  },
  'builtin:minimal-dark-accent': {
    id: '15', name: 'Minimal Dark Accent', bg: '#f7f8fa', paper: '#ffffff', accent: '#111827', accent2: '#e8eaef',
    text: '#111827', muted: '#6b7280', border: '#d5dae3', tableHead: '#111827', totalBg: '#111827', decor: 'darkAccent',
  },
  'builtin:cute-pink': {
    id: '06', name: 'Cute Pink', bg: '#fff1f6', paper: '#fff9fc', accent: '#ec6b9d', accent2: '#ffd8e8',
    text: '#5a2440', muted: '#9d6b83', border: '#f5c6dc', tableHead: '#ee7eaa', totalBg: '#ffe2ef', decor: 'bunny',
  },
  'builtin:cute-blue': {
    id: '07', name: 'Cute Blue', bg: '#eff8ff', paper: '#fbfdff', accent: '#64aee9', accent2: '#d8efff',
    text: '#213f62', muted: '#6a829d', border: '#c8e2f7', tableHead: '#6fb8eb', totalBg: '#e3f3ff', decor: 'cloudBear',
  },
  'builtin:cute-yellow': {
    id: '08', name: 'Cute Yellow', bg: '#fff9db', paper: '#fffdf4', accent: '#f6b51d', accent2: '#fff0a8',
    text: '#5b3b0b', muted: '#8a754b', border: '#f3dda1', tableHead: '#f3bd2f', totalBg: '#fff1a8', decor: 'sunflower',
  },
  'builtin:cute-green': {
    id: '09', name: 'Cute Green', bg: '#f0fbeb', paper: '#fbfff8', accent: '#6bbd5d', accent2: '#dff3d3',
    text: '#24451f', muted: '#71836d', border: '#cde7c6', tableHead: '#72bf65', totalBg: '#e5f6d9', decor: 'leafMascot',
  },
  'builtin:cute-kawaii': {
    id: '10', name: 'Cute Kawaii', bg: '#f8f2ff', paper: '#fffaff', accent: '#9a72de', accent2: '#eadcff',
    text: '#45226c', muted: '#7b6b92', border: '#ddcdf4', tableHead: '#9a72de', totalBg: '#eee2ff', decor: 'cat',
  },
  'builtin:cute-pastel-pink': {
    id: '16', name: 'Cute Pastel Pink', bg: '#fff4f8', paper: '#fffafd', accent: '#ee8ab1', accent2: '#ffe1ec',
    text: '#642945', muted: '#9a7085', border: '#f4c9db', tableHead: '#ef91b9', totalBg: '#ffe4ef', decor: 'bunny',
  },
  'builtin:cute-baby-blue': {
    id: '17', name: 'Cute Baby Blue', bg: '#f0f9ff', paper: '#fbfdff', accent: '#86c9ef', accent2: '#ddf4ff',
    text: '#264863', muted: '#718aa0', border: '#cfe8f6', tableHead: '#8bcaf0', totalBg: '#e5f6ff', decor: 'cloudBear',
  },
  'builtin:cute-soft-green': {
    id: '18', name: 'Cute Soft Green', bg: '#f2fae9', paper: '#fdfff9', accent: '#9ac660', accent2: '#e8f3d2',
    text: '#41521f', muted: '#77845c', border: '#dcecc4', tableHead: '#98c660', totalBg: '#ebf5d7', decor: 'cactus',
  },
  'builtin:cute-yellow-sunshine': {
    id: '19', name: 'Cute Yellow Sunshine', bg: '#fff8dc', paper: '#fffdf5', accent: '#f5bd22', accent2: '#ffeaa0',
    text: '#664810', muted: '#8b784f', border: '#f0daa1', tableHead: '#f2bd29', totalBg: '#fff0a0', decor: 'rainbow',
  },
  'builtin:cute-lovely-purple': {
    id: '20', name: 'Cute Lovely Purple', bg: '#faf2ff', paper: '#fffaff', accent: '#b48be9', accent2: '#f0e1ff',
    text: '#543078', muted: '#877298', border: '#e4d0f5', tableHead: '#b48be9', totalBg: '#f1e4ff', decor: 'cat',
  },
};

function marketplaceDecorSvg(tokens: MarketplaceTemplateTokens) {
  const color = tokens.dark ? tokens.accent : tokens.accent;
  if (tokens.decor === 'bunny') {
    return `<svg class="decor-svg cute-art" viewBox="0 0 180 180" aria-hidden="true">
      <ellipse cx="88" cy="90" rx="34" ry="29" fill="${color}" opacity=".14"/>
      <ellipse cx="68" cy="48" rx="10" ry="25" fill="${color}" opacity=".14"/>
      <ellipse cx="108" cy="48" rx="10" ry="25" fill="${color}" opacity=".14"/>
      <circle cx="78" cy="86" r="3.2" fill="${tokens.text}" opacity=".68"/>
      <circle cx="98" cy="86" r="3.2" fill="${tokens.text}" opacity=".68"/>
      <path d="M80 99 Q88 106 97 99" stroke="${tokens.text}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".58"/>
      <path d="M42 130 C29 116 45 101 58 114 C70 101 86 116 73 130 L58 146 Z" fill="${color}" opacity=".15"/>
    </svg>`;
  }
  if (tokens.decor === 'cloudBear') {
    return `<svg class="decor-svg cute-art" viewBox="0 0 180 180" aria-hidden="true">
      <path d="M34 76 C22 76 16 66 21 56 C25 47 37 47 42 55 C50 39 73 46 72 64 C91 64 96 88 77 92 H34 Z" fill="${color}" opacity=".15"/>
      <circle cx="108" cy="92" r="24" fill="${color}" opacity=".15"/>
      <circle cx="90" cy="72" r="11" fill="${color}" opacity=".16"/>
      <circle cx="126" cy="72" r="11" fill="${color}" opacity=".16"/>
      <circle cx="100" cy="90" r="3" fill="${tokens.text}" opacity=".62"/>
      <circle cx="116" cy="90" r="3" fill="${tokens.text}" opacity=".62"/>
      <path d="M101 104 Q108 110 115 104" stroke="${tokens.text}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".52"/>
    </svg>`;
  }
  if (tokens.decor === 'sunflower') {
    return `<svg class="decor-svg cute-art" viewBox="0 0 180 180" aria-hidden="true">
      <circle cx="102" cy="62" r="22" fill="${color}" opacity=".2"/>
      <path d="M102 24 V10 M102 114 V130 M64 62 H48 M156 62 H170 M75 35 L64 24 M130 35 L142 24 M75 90 L64 102 M130 90 L142 102" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity=".22"/>
      <path d="M36 140 C49 108 62 108 76 140 M70 140 C84 108 100 108 114 140 M106 140 C120 108 134 108 146 140" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" opacity=".18"/>
    </svg>`;
  }
  if (tokens.decor === 'leafMascot') {
    return `<svg class="decor-svg cute-art" viewBox="0 0 180 180" aria-hidden="true">
      <path d="M48 142 C76 84 124 86 146 36 C101 42 66 70 48 142 Z" fill="${color}" opacity=".16"/>
      <path d="M57 128 C84 102 112 72 138 44" stroke="${color}" stroke-width="4" opacity=".22" stroke-linecap="round"/>
      <circle cx="95" cy="76" r="20" fill="${color}" opacity=".13"/>
      <circle cx="88" cy="74" r="2.7" fill="${tokens.text}" opacity=".62"/>
      <circle cx="102" cy="74" r="2.7" fill="${tokens.text}" opacity=".62"/>
    </svg>`;
  }
  if (tokens.decor === 'cat') {
    return `<svg class="decor-svg cute-art" viewBox="0 0 180 180" aria-hidden="true">
      <path d="M66 78 L54 48 L82 67 M118 78 L130 48 L102 67" fill="${color}" opacity=".15"/>
      <circle cx="92" cy="94" r="36" fill="${color}" opacity=".15"/>
      <circle cx="82" cy="90" r="3.2" fill="${tokens.text}" opacity=".62"/>
      <circle cx="102" cy="90" r="3.2" fill="${tokens.text}" opacity=".62"/>
      <path d="M85 104 Q92 110 99 104" stroke="${tokens.text}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".58"/>
      <path d="M52 108 H78 M106 108 H132" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity=".22"/>
    </svg>`;
  }
  if (tokens.decor === 'cactus') {
    return `<svg class="decor-svg cute-art" viewBox="0 0 180 180" aria-hidden="true">
      <path d="M90 146 V70 C90 56 110 56 110 70 V88 C124 84 134 92 134 106 V124 H120 V108 C120 100 110 100 110 110 V146 Z" fill="${color}" opacity=".17"/>
      <path d="M80 98 C65 88 52 98 52 114 V128 H66 V116 C66 106 76 106 80 114 Z" fill="${color}" opacity=".14"/>
      <circle cx="94" cy="84" r="2.6" fill="${tokens.text}" opacity=".62"/>
      <circle cx="106" cy="84" r="2.6" fill="${tokens.text}" opacity=".62"/>
    </svg>`;
  }
  if (tokens.decor === 'rainbow') {
    return `<svg class="decor-svg cute-art" viewBox="0 0 180 180" aria-hidden="true">
      <path d="M38 122 C56 70 124 70 142 122" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" opacity=".18"/>
      <path d="M56 122 C70 90 110 90 124 122" fill="none" stroke="${tokens.accent2}" stroke-width="9" stroke-linecap="round" opacity=".42"/>
      <circle cx="122" cy="54" r="19" fill="${color}" opacity=".19"/>
      <path d="M36 144 C22 144 18 130 29 124 C33 109 54 114 54 130 C69 130 70 144 56 144 Z" fill="${tokens.accent2}" opacity=".45"/>
    </svg>`;
  }
  if (tokens.decor === 'anime') {
    return `<svg class="decor-svg anime-art" viewBox="0 0 180 180" aria-hidden="true">
      <path d="M52 118 C25 96 42 52 76 70 C92 34 148 54 132 98 C124 124 82 139 52 118 Z" fill="${color}" opacity=".15"/>
      <circle cx="70" cy="72" r="26" fill="#ffd8c8"/><path d="M39 72 C48 37 86 27 112 49 C142 44 154 78 130 103 C118 75 89 70 39 72 Z" fill="${tokens.accent}" opacity=".72"/>
      <circle cx="61" cy="77" r="4" fill="${tokens.text}"/><circle cx="91" cy="77" r="4" fill="${tokens.text}"/><path d="M70 93 Q78 99 88 93" stroke="${tokens.text}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M33 42 L20 29 M145 45 L161 32 M35 132 L20 146 M143 132 L160 146" stroke="${tokens.accent}" stroke-width="4" stroke-linecap="round" opacity=".55"/>
    </svg>`;
  }
  if (tokens.decor === 'truck') {
    return `<svg class="decor-svg" viewBox="0 0 180 180" aria-hidden="true">
      <path d="M22 92 H98 V62 H128 L154 92 H164 V122 H22 Z" fill="${tokens.accent}" opacity=".2"/>
      <path d="M30 86 H98 V58 H126 L154 86 H164" fill="none" stroke="${tokens.accent}" stroke-width="7" stroke-linejoin="round"/>
      <circle cx="62" cy="125" r="13" fill="${tokens.accent}"/><circle cx="132" cy="125" r="13" fill="${tokens.accent}"/>
      <path d="M18 146 H166" stroke="${tokens.accent}" stroke-width="5" opacity=".35"/>
    </svg>`;
  }
  if (tokens.decor === 'seal') {
    return `<svg class="decor-svg" viewBox="0 0 180 180" aria-hidden="true">
      <circle cx="90" cy="90" r="54" fill="none" stroke="${tokens.accent}" stroke-width="5" opacity=".18"/>
      <path d="M90 34 L112 82 H166 L122 110 L139 162 L90 130 L41 162 L58 110 L14 82 H68 Z" fill="${tokens.accent}" opacity=".16"/>
      <path d="M66 112 H114 M72 94 H108 M80 76 H100" stroke="${tokens.accent}" stroke-width="6" stroke-linecap="round" opacity=".42"/>
    </svg>`;
  }
  if (tokens.decor === 'tech' || tokens.decor === 'gold') {
    return `<svg class="decor-svg" viewBox="0 0 180 180" aria-hidden="true">
      <path d="M20 142 C52 80 96 52 160 24" fill="none" stroke="${tokens.accent}" stroke-width="7" stroke-linecap="round" opacity=".35"/>
      <path d="M28 70 L62 40 L94 60 L150 28" fill="none" stroke="${tokens.accent}" stroke-width="3" opacity=".48"/>
      <circle cx="126" cy="58" r="28" fill="${tokens.accent}" opacity=".12"/>
      <path d="M58 126 L90 68 L122 126 Z" fill="none" stroke="${tokens.accent}" stroke-width="4" opacity=".45"/>
    </svg>`;
  }
  return `<svg class="decor-svg" viewBox="0 0 180 180" aria-hidden="true">
    <rect x="28" y="42" width="112" height="78" rx="12" fill="none" stroke="${tokens.accent}" stroke-width="4" opacity=".18"/>
    <path d="M42 66 H126 M42 88 H112 M42 110 H96" stroke="${tokens.accent}" stroke-width="5" stroke-linecap="round" opacity=".22"/>
    <circle cx="136" cy="44" r="26" fill="${tokens.accent}" opacity=".1"/>
  </svg>`;
}

type PrintTemplateTone = 'minimal' | 'cute';

type PrintTemplateLayoutSpec = {
  tone: PrintTemplateTone;
  radius: number;
  contentLeft: number;
  contentWidth: number;
  headerTop: number;
  partyTop: number;
  tableTop: number;
  wordsTop: number;
  notesTop: number;
  totalsTop: number;
  signatureBottom: number;
  qrBottom: number;
};

function resolvePrintTemplateLayout(tokens: MarketplaceTemplateTokens): PrintTemplateLayoutSpec {
  const cuteDecor = ['bunny', 'cloudBear', 'sunflower', 'leafMascot', 'cat', 'cactus', 'rainbow'].includes(tokens.decor);
  return {
    tone: cuteDecor ? 'cute' : 'minimal',
    radius: cuteDecor ? 24 : 8,
    contentLeft: 56,
    contentWidth: 682,
    headerTop: cuteDecor ? 70 : 64,
    partyTop: cuteDecor ? 244 : 226,
    tableTop: cuteDecor ? 408 : 392,
    wordsTop: cuteDecor ? 810 : 802,
    notesTop: cuteDecor ? 870 : 858,
    totalsTop: cuteDecor ? 790 : 782,
    signatureBottom: cuteDecor ? 84 : 84,
    qrBottom: cuteDecor ? 72 : 72,
  };
}

function renderPrintTemplateOrnaments(tokens: MarketplaceTemplateTokens, layout: PrintTemplateLayoutSpec) {
  const cute = layout.tone === 'cute';
  const topFill = cute ? tokens.accent2 : tokens.tableHead;
  const topAccent = cute ? tokens.accent : tokens.accent;
  const bottomFill = cute ? tokens.bg : `${tokens.accent2}66`;
  const mascot = marketplaceDecorSvg(tokens);
  const generatedAssets = cute
    ? `<span class="asset asset-receipt"></span>
       <span class="asset asset-cloud"></span>
       <span class="asset asset-rainbow"></span>
       <span class="asset asset-wave"></span>
       <span class="asset asset-flower"></span>`
    : '';
  const cornerMarks = cute
    ? `<span class="spark s1"></span><span class="spark s2"></span><span class="spark s3"></span><span class="spark s4"></span>
       <span class="heart h1"></span><span class="heart h2"></span>`
    : `<span class="minimal-mark m1"></span><span class="minimal-mark m2"></span>`;

  return `
  <svg class="paper-wave top-wave" viewBox="0 0 794 170" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 0 H794 V92 C700 132 620 54 520 92 C424 128 344 124 250 88 C158 52 82 84 0 118 Z" fill="${topFill}" opacity="${cute ? '.74' : '.42'}"/>
    <path d="M0 120 C90 82 160 52 250 88 C344 124 424 128 520 92 C620 54 700 132 794 92" fill="none" stroke="${topAccent}" stroke-width="${cute ? '3' : '2'}" stroke-dasharray="${cute ? '8 10' : '0'}" opacity="${cute ? '.34' : '.22'}"/>
  </svg>
  <svg class="paper-wave bottom-wave" viewBox="0 0 794 150" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 58 C96 18 170 76 264 48 C370 16 462 24 560 62 C650 96 724 66 794 36 V150 H0 Z" fill="${bottomFill}" opacity="${cute ? '.82' : '.5'}"/>
    <path d="M0 58 C96 18 170 76 264 48 C370 16 462 24 560 62 C650 96 724 66 794 36" fill="none" stroke="${topAccent}" stroke-width="2" stroke-dasharray="${cute ? '7 9' : '0'}" opacity="${cute ? '.25' : '.16'}"/>
  </svg>
  <div class="decor decor-top">${mascot}</div>
  ${cute ? `<div class="decor decor-bottom">${mascot}</div>` : ''}
  ${generatedAssets}
  ${cornerMarks}`;
}

function buildHtmlGeneratedTemplate(data: PdfInvoiceData, tokens: MarketplaceTemplateTokens): string {
  const isTh = data.language !== 'en';
  const isEn = data.language === 'en';
  const docTitle = DOC_TITLE[data.type]?.[data.language] ?? 'ใบกำกับภาษี';
  const dateStr = isTh ? formatDateTh(data.invoiceDate) : formatDateEn(data.invoiceDate);
  const dueStr = data.dueDate ? (isTh ? formatDateTh(data.dueDate) : formatDateEn(data.dueDate)) : '';
  const sellerName = isTh ? data.seller.nameTh : (data.seller.nameEn ?? data.seller.nameTh);
  const buyerName = isTh ? data.buyer.nameTh : (data.buyer.nameEn ?? data.buyer.nameTh);
  const sellerAddr = isTh ? data.seller.addressTh : (data.seller.addressEn ?? data.seller.addressTh);
  const buyerAddr = isTh ? data.buyer.addressTh : (data.buyer.addressEn ?? data.buyer.addressTh);
  const sellerBranch = data.seller.branchCode === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.seller.branchCode;
  const buyerBranch = data.buyer.branchCode === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.buyer.branchCode;
  const totalWords = isTh
    ? amountInWordsThai(data.total)
    : isEn ? amountInWordsEnglish(data.total) : `${amountInWordsThai(data.total)} / ${amountInWordsEnglish(data.total)}`;
  const layout = resolvePrintTemplateLayout(tokens);
  const cuteTemplateDecor = layout.tone === 'cute';
  const titleColor = cuteTemplateDecor ? tokens.accent : '#1f2937';
  const rowText = cuteTemplateDecor ? tokens.text : '#252a31';
  const tableTop = layout.tableTop;
  const maxRows = 10;
  const itemRows = data.items.slice(0, maxRows).map((item, idx) => {
    const name = isTh ? item.nameTh : (item.nameEn ?? item.nameTh);
    return `<tr>
      <td>${idx + 1}</td>
      <td class="item-name">${escapeHtml(name)}</td>
      <td>${item.quantity}</td>
      <td>${escapeHtml(item.unit)}</td>
      <td>${formatCurrency(item.unitPrice)}</td>
      <td>${formatCurrency(item.totalAmount)}</td>
    </tr>`;
  }).join('');
  const emptyRows = Array.from({ length: Math.max(0, maxRows - data.items.slice(0, maxRows).length) }, () => (
    '<tr class="empty-row"><td></td><td></td><td></td><td></td><td></td><td></td></tr>'
  )).join('');
  const pageBackground = cuteTemplateDecor
    ? `radial-gradient(circle at 94% 13%, ${tokens.accent2}55 0 98px, transparent 99px),
       radial-gradient(circle at 9% 93%, ${tokens.accent2}66 0 132px, transparent 133px),
       linear-gradient(180deg, ${tokens.paper} 0%, #fffefe 52%, ${tokens.bg} 100%)`
    : `linear-gradient(180deg, ${tokens.paper} 0%, #ffffff 58%, ${tokens.bg} 100%)`;
  const borderRadius = layout.radius;
  const headerTextColor = cuteTemplateDecor || tokens.tableHead === '#111827' ? '#ffffff' : rowText;
  const assetPackUrl = frontendPublicAssetUrl('/brand/templates/doodle-asset-pack-v1.png?v=20260506c');
  const ornaments = renderPrintTemplateOrnaments(tokens, layout);

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Sarabun',sans-serif;background:#f5f5f5;color:${rowText};font-size:12px}
.page{width:794px;height:1123px;margin:0 auto;position:relative;background:${pageBackground};overflow:hidden;border:1px solid ${tokens.border}}
.template-skin{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.paper-wave{position:absolute;left:0;width:100%;z-index:0}
.top-wave{top:0;height:170px}.bottom-wave{bottom:0;height:150px}
.asset{position:absolute;z-index:0;background-image:var(--asset-pack);background-repeat:no-repeat;background-size:430% 720%;opacity:.9}
.asset-receipt{left:70px;top:138px;width:56px;height:76px;background-position:0% 0%;opacity:.1}
.asset-cloud{right:124px;top:128px;width:76px;height:50px;background-position:100% 16.5%;opacity:.14}
.asset-rainbow{left:286px;bottom:52px;width:88px;height:60px;background-position:33.33% 66.5%;opacity:.24}
.asset-wave{left:52px;right:52px;bottom:38px;height:18px;background-size:330% 600%;background-position:50% 84%;opacity:.16}
.asset-flower{left:104px;bottom:136px;width:42px;height:54px;background-position:33.33% 33%;opacity:.18}
.spark{position:absolute;width:8px;height:8px;border-radius:999px;background:${tokens.accent};opacity:.42}
.spark.s1{left:54px;top:92px}.spark.s2{right:62px;top:154px;width:6px;height:6px}.spark.s3{left:94px;bottom:166px;width:7px;height:7px}.spark.s4{right:126px;bottom:92px;width:9px;height:9px;background:${tokens.accent2}}
.heart{position:absolute;width:13px;height:13px;background:${tokens.accent};opacity:.28;transform:rotate(45deg);border-radius:3px}
.heart::before,.heart::after{content:'';position:absolute;width:13px;height:13px;border-radius:999px;background:inherit}
.heart::before{left:-7px;top:0}.heart::after{left:0;top:-7px}.heart.h1{left:150px;top:116px}.heart.h2{right:114px;bottom:126px;width:10px;height:10px}
.minimal-mark{position:absolute;border:1px solid ${tokens.border};opacity:.48}.minimal-mark.m1{left:42px;top:42px;width:72px;height:72px;border-radius:999px}.minimal-mark.m2{right:44px;bottom:46px;width:96px;height:28px;border-radius:999px}
.decor-top,.decor-bottom{position:absolute;z-index:0;pointer-events:none;color:${tokens.accent}}
.decor-top{right:42px;top:48px;width:176px;height:176px;opacity:${cuteTemplateDecor ? '.26' : '.12'}}
.decor-bottom{left:32px;bottom:82px;width:178px;height:178px;opacity:${cuteTemplateDecor ? '.42' : '.14'}}
.decor-top .decor-svg,.decor-bottom .decor-svg{position:static;width:100%;height:100%;display:block;pointer-events:none}
.layer{position:absolute;z-index:1}
.seller{left:${layout.contentLeft + 24}px;top:${layout.headerTop}px;width:370px}
.seller-logo{position:absolute;left:${cuteTemplateDecor ? -62 : -68}px;top:0;width:48px;height:48px;object-fit:contain;border-radius:10px;background:rgba(255,255,255,.72);padding:5px}
.company-name{font-size:17px;line-height:1.25;font-weight:800;color:${titleColor};margin-bottom:5px;max-width:340px}
.company-detail{font-size:10.4px;line-height:1.52;color:${tokens.muted}}
.doc{right:${layout.contentLeft}px;top:${layout.headerTop}px;width:250px;text-align:right}
.doc-title{font-size:28px;line-height:1.08;font-weight:800;color:${titleColor}}
.doc-sub{font-size:11px;line-height:1.3;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:${tokens.accent};margin-top:4px}
.copy{display:inline-block;margin-top:9px;border:1px solid ${tokens.accent};border-radius:999px;padding:3px 13px;background:rgba(255,255,255,.78);font-size:10px;font-weight:800;color:${titleColor}}
.meta{right:${layout.contentLeft}px;top:${layout.partyTop}px;width:242px;display:grid;gap:7px;padding:14px;border:1px solid ${tokens.border};border-radius:${borderRadius}px;background:rgba(255,255,255,.82)}
.meta-row{display:grid;grid-template-columns:82px 1fr;gap:8px;font-size:11px;line-height:1.35}
.meta-key{color:${tokens.muted}}
.meta-val{text-align:right;font-weight:800;color:${rowText};word-break:break-word}
.buyer{left:${layout.contentLeft}px;top:${layout.partyTop}px;width:${cuteTemplateDecor ? 438 : 408}px;min-height:122px;padding:16px 18px;border:1px solid ${tokens.border};border-radius:${borderRadius}px;background:rgba(255,255,255,.86)}
.label{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;font-weight:800;color:${tokens.accent};margin-bottom:7px}
.buyer-name{font-size:13.2px;font-weight:800;line-height:1.32;color:${rowText};margin-bottom:4px}
.buyer-detail{font-size:10.4px;line-height:1.55;color:${tokens.muted}}
.table-wrap{left:${layout.contentLeft}px;top:${tableTop}px;width:${layout.contentWidth}px;border:1px solid ${tokens.border};border-radius:${borderRadius}px;overflow:hidden;background:rgba(255,255,255,.9)}
.table{width:100%;border-collapse:collapse;table-layout:fixed;background:transparent}
.table col:nth-child(1){width:45px}.table col:nth-child(3){width:62px}.table col:nth-child(4){width:66px}.table col:nth-child(5){width:102px}.table col:nth-child(6){width:110px}
.table th{height:42px;padding:0 10px;text-align:left;font-size:9.8px;font-weight:800;color:${headerTextColor};background:${tokens.tableHead};border-right:1px solid rgba(255,255,255,.28)}
.table th:first-child,.table td:first-child{text-align:center}
.table th:nth-child(3),.table td:nth-child(3){text-align:center}
.table th:nth-child(4),.table td:nth-child(4){text-align:center}
.table th:nth-child(5),.table td:nth-child(5){text-align:right}
.table th:nth-child(6),.table td:nth-child(6){text-align:right}
.table td{height:34px;padding:6px 10px;font-size:10.7px;line-height:1.35;color:${rowText};vertical-align:top;border-top:1px solid ${tokens.border};border-right:1px solid ${tokens.border}}
.table tbody tr:nth-child(even) td{background:${cuteTemplateDecor ? 'rgba(255,255,255,.34)' : 'rgba(248,250,252,.5)'}}
.table th:last-child,.table td:last-child{border-right:none}
.table .empty-row td{color:transparent}
.table .item-name{text-align:left;font-weight:700}
.words{left:${layout.contentLeft}px;top:${layout.wordsTop}px;width:390px;padding:9px 0}
.words-text{font-size:11px;line-height:1.55;color:${rowText};font-weight:700}
.notes{left:${layout.contentLeft}px;top:${layout.notesTop}px;width:390px;font-size:10.5px;line-height:1.55;color:${tokens.muted};white-space:pre-line}
.totals{right:${layout.contentLeft}px;top:${layout.totalsTop}px;width:282px;border:1px solid ${tokens.border};border-radius:${borderRadius}px;background:rgba(255,255,255,.9);overflow:hidden}
.total-row{display:grid;grid-template-columns:1fr auto;gap:12px;padding:7px 14px;font-size:11.3px;color:${tokens.muted};border-bottom:1px solid rgba(148,163,184,.24)}
.total-row strong{font-weight:800;color:${rowText}}
.total-row.grand{background:${cuteTemplateDecor ? tokens.totalBg : 'rgba(241,245,249,.78)'};color:${rowText};font-weight:800;border-bottom:none;padding:10px 14px}
.sig-left{left:260px;bottom:${layout.signatureBottom}px;width:170px;text-align:center}
.sig-right{left:462px;bottom:${layout.signatureBottom}px;width:170px;text-align:center}
.sig-space{height:40px;display:flex;align-items:center;justify-content:center}
.sig-image{max-width:145px;max-height:38px;object-fit:contain}
.sig-line{border-top:1px solid rgba(71,85,105,.55);margin:4px auto 6px;width:84%}
.sig-label{font-size:10px;color:${tokens.muted};line-height:1.35}
.sig-name{font-size:10px;font-weight:800;color:${rowText};margin-top:2px}
.qr{right:${layout.contentLeft}px;bottom:${layout.qrBottom}px;width:102px;text-align:center;z-index:2}
.qr-img{width:88px;height:88px;object-fit:contain;background:#fff;border:1px solid ${tokens.border};border-radius:8px;padding:4px}
.qr-label{font-size:8.8px;color:${tokens.muted};margin-top:3px}
.footer{left:50px;right:50px;bottom:34px;display:flex;justify-content:space-between;gap:12px;font-size:9px;color:${tokens.muted}}
@media print{body{background:#fff}.page{margin:0}}
</style>
</head>
<body>
<div class="page">
  <div class="template-skin" style="--asset-pack:url('${assetPackUrl}')">${ornaments}</div>
  <div class="layer seller">
    ${data.showCompanyLogo !== false && data.seller.logoUrl ? `<img class="seller-logo" src="${data.seller.logoUrl}" alt="logo"/>` : ''}
    <div class="company-name">${escapeHtml(sellerName)}</div>
    <div class="company-detail">${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.seller.taxId)}<br/>${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(sellerBranch)}<br/>${escapeHtml(sellerAddr)}</div>
  </div>
  <div class="layer doc"><div class="doc-title">${escapeHtml(docTitle)}</div><div class="doc-sub">TAX INVOICE</div><div class="copy">${isTh ? 'ต้นฉบับ' : 'ORIGINAL'}</div></div>
  <div class="layer meta">
    <div class="meta-row"><div class="meta-key">${isTh ? 'เลขที่' : 'No.'}</div><div class="meta-val">${escapeHtml(data.invoiceNumber)}</div></div>
    <div class="meta-row"><div class="meta-key">${isTh ? 'วันที่' : 'Date'}</div><div class="meta-val">${escapeHtml(dateStr)}</div></div>
    <div class="meta-row"><div class="meta-key">${isTh ? 'ครบกำหนด' : 'Due'}</div><div class="meta-val">${escapeHtml(dueStr || '-')}</div></div>
  </div>
  <div class="layer buyer"><div class="label">${isTh ? 'ผู้ซื้อ / Bill To' : 'Bill To'}</div><div class="buyer-name">${escapeHtml(buyerName)}</div><div class="buyer-detail">${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: <strong>${escapeHtml(data.buyer.taxId)}</strong><br/>${isTh ? 'สาขา' : 'Branch'}: <strong>${escapeHtml(buyerBranch)}</strong><br/>${escapeHtml(buyerAddr)}</div></div>
  <div class="layer table-wrap"><table class="table"><colgroup><col/><col/><col/><col/><col/><col/></colgroup><thead><tr><th>${isTh ? 'ลำดับ' : 'No.'}</th><th>${isTh ? 'รายการ' : 'Description'}</th><th>${isTh ? 'จำนวน' : 'Qty'}</th><th>${isTh ? 'หน่วย' : 'Unit'}</th><th>${isTh ? 'ราคา/หน่วย' : 'Unit Price'}</th><th>${isTh ? 'จำนวนเงิน' : 'Amount'}</th></tr></thead><tbody>${itemRows}${emptyRows}</tbody></table></div>
  <div class="layer words"><div class="label">${isTh ? 'จำนวนเงินเป็นตัวอักษร' : 'Amount in Words'}</div><div class="words-text">${escapeHtml(totalWords)}</div></div>
  ${data.notes || data.bankPaymentInfo ? `<div class="layer notes">${data.notes ? escapeHtml(data.notes) : ''}${data.notes && data.bankPaymentInfo ? '<br/>' : ''}${data.bankPaymentInfo ? escapeHtml(data.bankPaymentInfo) : ''}</div>` : ''}
  <div class="layer totals">
    <div class="total-row"><span>${isTh ? 'ยอดรวม' : 'Subtotal'}</span><strong>${formatCurrency(data.subtotal)}</strong></div>
    <div class="total-row"><span>${isTh ? 'ภาษีมูลค่าเพิ่ม 7%' : 'VAT 7%'}</span><strong>${formatCurrency(data.vatAmount)}</strong></div>
    <div class="total-row grand"><span>${isTh ? 'ยอดรวมสุทธิ' : 'Grand Total'}</span><strong>${formatCurrency(data.total)}</strong></div>
  </div>
  <div class="layer sig-left"><div class="sig-space">${data.signatureImageUrl ? `<img class="sig-image" src="${data.signatureImageUrl}" alt="signature"/>` : ''}</div><div class="sig-line"></div><div class="sig-label">${isTh ? 'ผู้จัดทำ / ผู้ออกเอกสาร' : 'Prepared by / Issuer'}</div>${(data.signerName || data.signerTitle) ? `<div class="sig-name">${escapeHtml([data.signerName, data.signerTitle].filter(Boolean).join(' · '))}</div>` : ''}</div>
  <div class="layer sig-right"><div class="sig-space"></div><div class="sig-line"></div><div class="sig-label">${isTh ? 'ผู้รับสินค้า / ลูกค้า' : 'Received by / Customer'}</div></div>
  ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? `<div class="layer qr"><img class="qr-img" src="${data.onlineQrDataUrl}" alt="QR"/><div class="qr-label">${isTh ? 'สแกนตรวจสอบเอกสาร' : 'Scan to verify'}</div></div>` : ''}
  <div class="layer footer"><div>${data.documentMode === 'electronic' ? (isTh ? 'เอกสารอิเล็กทรอนิกส์ตามรูปแบบ e-Tax' : 'Electronic e-Tax document') : (isTh ? 'เอกสารฉบับปกติ' : 'Ordinary document')}</div><div>${escapeHtml(docTitle)} · ${escapeHtml(data.invoiceNumber)}</div></div>
</div>
</body>
</html>`;
}

function buildHtmlMarketplace(data: PdfInvoiceData, tokens: MarketplaceTemplateTokens): string {
  return buildHtmlGeneratedTemplate(data, tokens);

  const isTh = data.language !== 'en';
  const isEn = data.language === 'en';
  const docTitle = DOC_TITLE[data.type]?.[data.language] ?? 'ใบกำกับภาษี';
  const dateStr = isTh ? formatDateTh(data.invoiceDate) : formatDateEn(data.invoiceDate);
  const dueStr = data.dueDate ? (isTh ? formatDateTh(data.dueDate as Date) : formatDateEn(data.dueDate as Date)) : '';
  const sellerName = isTh ? data.seller.nameTh : (data.seller.nameEn ?? data.seller.nameTh);
  const buyerName = isTh ? data.buyer.nameTh : (data.buyer.nameEn ?? data.buyer.nameTh);
  const sellerAddr = isTh ? data.seller.addressTh : (data.seller.addressEn ?? data.seller.addressTh);
  const buyerAddr = isTh ? data.buyer.addressTh : (data.buyer.addressEn ?? data.buyer.addressTh);
  const sellerBranch = data.seller.branchCode === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.seller.branchCode;
  const buyerBranch = data.buyer.branchCode === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.buyer.branchCode;
  const totalWords = isTh
    ? amountInWordsThai(data.total)
    : isEn ? amountInWordsEnglish(data.total) : `${amountInWordsThai(data.total)} / ${amountInWordsEnglish(data.total)}`;
  const dark = !!tokens.dark;
  const coloredTableDecor = ['cube', 'leaf', 'seal', 'gradient', 'truck', 'anime', 'line', 'darkAccent', 'bunny', 'cloudBear', 'sunflower', 'leafMascot', 'cat', 'cactus', 'rainbow'];
  const tableHeadText = dark || coloredTableDecor.includes(tokens.decor) ? '#ffffff' : tokens.text;
  const totalText = dark || ['cube', 'gradient', 'line', 'darkAccent'].includes(tokens.decor) ? '#ffffff' : tokens.text;
  const headerBg = tokens.decor === 'gradient'
    ? `linear-gradient(135deg, ${tokens.accent} 0%, ${tokens.accent2} 100%)`
    : dark ? tokens.paper : tokens.paper;
  const topAccent = tokens.decor === 'gradient'
    ? `linear-gradient(135deg, ${tokens.accent} 0%, ${tokens.accent2} 100%)`
    : tokens.accent;
  const cuteTemplateDecor = ['bunny', 'cloudBear', 'sunflower', 'leafMascot', 'cat', 'cactus', 'rainbow'].includes(tokens.decor);
  const generatedBackgroundUrl = frontendPublicAssetUrl(
    cuteTemplateDecor
      ? '/brand/templates/tax-template-cute-pastel.png?v=20260506a'
      : '/brand/templates/tax-template-minimal-line.png?v=20260506a',
  );
  const generatedBackgroundOpacity = cuteTemplateDecor ? 0.34 : 0.22;
  const itemRows = data.items.map((item, idx) => {
    const name = isTh ? item.nameTh : (item.nameEn ?? item.nameTh);
    return `<tr>
      <td class="center">${idx + 1}</td>
      <td><strong>${escapeHtml(name)}</strong>${data.language === 'both' && item.nameEn ? `<span>${escapeHtml(item.nameEn)}</span>` : ''}</td>
      <td class="center">${item.quantity}</td>
      <td class="center">${escapeHtml(item.unit)}</td>
      <td class="right">${formatCurrency(item.unitPrice)}</td>
      <td class="center">${item.discountAmount > 0 ? `${item.discountAmount}%` : '-'}</td>
      <td class="right strong">${formatCurrency(item.totalAmount)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Sarabun',sans-serif;background:${tokens.bg};color:${tokens.text};font-size:12px}
.page{width:794px;min-height:1123px;background:${tokens.bg};padding:24px;position:relative;overflow:hidden}
.page::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 88% 8%,${tokens.accent}38,transparent 210px),radial-gradient(circle at 10% 92%,${tokens.accent2}55,transparent 220px),repeating-linear-gradient(135deg,transparent 0 18px,${tokens.border}26 18px 19px);pointer-events:none}
.sheet{min-height:1075px;border:1px solid ${tokens.border};border-radius:20px;background:${tokens.paper};overflow:hidden;position:relative;box-shadow:0 26px 70px rgba(15,23,42,.16)}
.sheet::before{content:'';position:absolute;inset:0;background:url("${generatedBackgroundUrl}") center/cover no-repeat;opacity:${generatedBackgroundOpacity};z-index:0;pointer-events:none}
.sheet::after{content:'';position:absolute;right:-48px;top:110px;width:230px;height:230px;border-radius:34px;background:${tokens.accent}18;transform:rotate(16deg);z-index:0}
.header{position:relative;z-index:1;display:grid;grid-template-columns:1fr 245px;gap:28px;padding:28px 32px 24px;background:${headerBg};color:${dark ? tokens.text : tokens.text}}
.brand{display:flex;gap:14px;align-items:flex-start}.logo{display:grid;place-items:center;width:60px;height:60px;border-radius:16px;background:${topAccent};color:${tableHeadText};font-weight:800;font-size:13px;box-shadow:0 14px 28px ${tokens.accent}33}
.company-name{font-size:18px;line-height:1.25;font-weight:800}.company-detail{margin-top:7px;color:${tokens.muted};font-size:10.5px;line-height:1.65}
.doc{text-align:right}.doc-title{font-size:25px;line-height:1.15;font-weight:800;color:${tokens.accent}}.doc-sub{font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;margin-top:3px;color:${tokens.accent}}.copy{display:inline-block;margin-top:8px;border:1px solid ${tokens.accent};border-radius:999px;padding:3px 9px;color:${tokens.accent};font-size:10px;font-weight:800}
.meta-box{margin-top:13px;border:1px solid ${tokens.border};border-radius:13px;overflow:hidden;background:${dark ? '#0b1118' : '#ffffff'};display:grid;grid-template-columns:1fr}
.meta-row{display:grid;grid-template-columns:86px 1fr;padding:7px 10px;border-bottom:1px solid ${tokens.border};font-size:10.8px}.meta-row:last-child{border-bottom:none}.meta-key{color:${tokens.muted}}.meta-val{font-weight:800;text-align:right;color:${tokens.text}}
.decor-svg{position:absolute;right:10px;top:96px;width:220px;height:220px;z-index:0;pointer-events:none}.accent-bar{height:9px;background:${topAccent};position:relative;z-index:1}
.body{position:relative;z-index:1;padding:22px 32px 24px}
.party-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:17px}.party{border:1px solid ${tokens.border};border-radius:14px;background:${dark ? '#0b1118' : '#fff'};padding:13px 15px;min-height:118px}.party.buyer{background:${tokens.accent2}${dark ? '18' : '44'}}
.label{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:${tokens.accent};margin-bottom:7px}.party-name{font-size:14px;font-weight:800;line-height:1.32;margin-bottom:5px}.party-detail{font-size:10.5px;line-height:1.62;color:${tokens.muted}}
.table-wrap{border:1px solid ${tokens.border};border-radius:15px;overflow:hidden;background:${dark ? '#0b1118' : '#fff'};margin-bottom:16px}.table-title{display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:${tokens.accent2}${dark ? '22' : '55'};border-bottom:1px solid ${tokens.border}}.table-title strong{font-size:12px;color:${tokens.accent}}.table-title span{font-size:10px;color:${tokens.muted}}
table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:${tokens.tableHead};color:${tableHeadText};padding:8px 6px;text-align:left;font-size:9.5px;font-weight:800}td{padding:8px 6px;border-bottom:1px solid ${tokens.border};font-size:10.8px;line-height:1.45;color:${tokens.text};vertical-align:top}tbody tr:nth-child(even) td{background:${dark ? 'rgba(255,255,255,.035)' : 'rgba(15,23,42,.026)'}}tbody tr:last-child td{border-bottom:none}td span{display:block;color:${tokens.muted};font-size:9.4px}.center{text-align:center}.right{text-align:right}.strong{font-weight:800;color:${tokens.accent}}
.summary{display:grid;grid-template-columns:1fr 292px;gap:16px;align-items:start}.stack{display:grid;gap:10px}.info,.totals{border:1px solid ${tokens.border};border-radius:14px;background:${dark ? '#0b1118' : '#fff'};overflow:hidden}.info{padding:12px 14px}.info-text{font-size:11px;line-height:1.65;color:${tokens.text};white-space:pre-line}.total-title{padding:11px 14px;background:${tokens.accent2}${dark ? '22' : '55'};border-bottom:1px solid ${tokens.border};font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;font-weight:800;color:${tokens.accent}}.total-row{display:grid;grid-template-columns:1fr auto;gap:10px;padding:9px 14px;border-bottom:1px solid ${tokens.border};font-size:11.5px;color:${tokens.muted}}.total-row strong{color:${tokens.text};font-weight:800}.grand{background:${tokens.totalBg};color:${totalText};border-bottom:none}.grand strong{color:${totalText};font-size:15px}
.support{display:grid;grid-template-columns:1fr 1fr ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? '132px' : '0'};gap:14px;margin-top:18px}.sig,.qr{border:1px solid ${tokens.border};border-radius:14px;background:${dark ? '#0b1118' : '#fff'};padding:12px;text-align:center;min-height:112px}.sig-space{height:44px;display:flex;align-items:center;justify-content:center}.sig-image{max-height:42px;max-width:150px;object-fit:contain}.sig-line{border-top:1px solid ${tokens.border};width:74%;margin:6px auto 7px}.sig-label{font-size:10.5px;color:${tokens.muted};line-height:1.35}.sig-name{margin-top:4px;color:${tokens.accent};font-weight:800;font-size:10.5px}.qr{display:${data.documentMode === 'electronic' && data.onlineQrDataUrl ? 'block' : 'none'}}.qr-img{width:72px;height:72px;object-fit:contain;background:#fff;border-radius:9px;border:1px solid ${tokens.border};padding:4px}.qr-label{font-size:9.5px;color:${tokens.muted};margin-top:6px}
.footer{display:flex;justify-content:space-between;gap:12px;margin-top:14px;padding-top:11px;border-top:1px solid ${tokens.border};font-size:10px;color:${tokens.muted};line-height:1.5}
@media print{body{background:${tokens.paper}}.page{padding:0}.sheet{border-radius:0;box-shadow:none}}
</style></head>
<body><div class="page"><div class="sheet">
  ${marketplaceDecorSvg(tokens)}
  <div class="header">
    <div class="brand">
      ${data.showCompanyLogo !== false && data.seller.logoUrl ? `<img class="logo" src="${data.seller.logoUrl}" alt="logo"/>` : `<div class="logo">${tokens.id}</div>`}
      <div><div class="company-name">${escapeHtml(sellerName)}</div><div class="company-detail">${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.seller.taxId)}<br/>${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(sellerBranch)}<br/>${escapeHtml(sellerAddr)}</div></div>
    </div>
    <div class="doc">
      <div class="doc-title">${escapeHtml(docTitle)}</div><div class="doc-sub">TAX INVOICE</div><div class="copy">${isTh ? 'ต้นฉบับ' : 'ORIGINAL'}</div>
      <div class="meta-box">
        <div class="meta-row"><div class="meta-key">${isTh ? 'เลขที่' : 'No.'}</div><div class="meta-val">${escapeHtml(data.invoiceNumber)}</div></div>
        <div class="meta-row"><div class="meta-key">${isTh ? 'วันที่' : 'Date'}</div><div class="meta-val">${escapeHtml(dateStr)}</div></div>
        <div class="meta-row"><div class="meta-key">${isTh ? 'เครดิต' : 'Credit'}</div><div class="meta-val">${dueStr ? escapeHtml(dueStr) : '-'}</div></div>
      </div>
    </div>
  </div><div class="accent-bar"></div>
  <div class="body">
    <div class="party-grid">
      <div class="party"><div class="label">${isTh ? 'ผู้ขาย / Seller' : 'Seller'}</div><div class="party-name">${escapeHtml(sellerName)}</div><div class="party-detail">${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: <strong>${escapeHtml(data.seller.taxId)}</strong><br/>${isTh ? 'สาขา' : 'Branch'}: <strong>${escapeHtml(sellerBranch)}</strong><br/>${escapeHtml(sellerAddr)}</div></div>
      <div class="party buyer"><div class="label">${isTh ? 'ผู้ซื้อ / Bill To' : 'Bill To'}</div><div class="party-name">${escapeHtml(buyerName)}</div><div class="party-detail">${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: <strong>${escapeHtml(data.buyer.taxId)}</strong><br/>${isTh ? 'สาขา' : 'Branch'}: <strong>${escapeHtml(buyerBranch)}</strong><br/>${escapeHtml(buyerAddr)}</div></div>
    </div>
    <div class="table-wrap"><div class="table-title"><strong>${isTh ? 'รายการสินค้า/บริการ' : 'Items'}</strong><span>${tokens.name}</span></div><table><thead><tr>
      <th style="width:38px;text-align:center">${isTh ? 'ลำดับ' : 'No.'}</th><th>${isTh ? 'รายการ' : 'Description'}</th><th style="width:52px;text-align:center">${isTh ? 'จำนวน' : 'Qty'}</th><th style="width:56px;text-align:center">${isTh ? 'หน่วย' : 'Unit'}</th><th style="width:92px;text-align:right">${isTh ? 'ราคา/หน่วย' : 'Unit Price'}</th><th style="width:54px;text-align:center">${isTh ? 'ส่วนลด' : 'Disc.'}</th><th style="width:96px;text-align:right">${isTh ? 'จำนวนเงิน' : 'Amount'}</th>
    </tr></thead><tbody>${itemRows}</tbody></table></div>
    <div class="summary"><div class="stack">
      <div class="info"><div class="label">${isTh ? 'จำนวนเงินเป็นตัวอักษร' : 'Amount in Words'}</div><div class="info-text"><strong>${escapeHtml(totalWords)}</strong></div></div>
      ${data.notes ? `<div class="info"><div class="label">${isTh ? 'หมายเหตุ' : 'Notes'}</div><div class="info-text">${escapeHtml(data.notes ?? '')}</div></div>` : ''}
      ${data.bankPaymentInfo ? `<div class="info"><div class="label">${isTh ? 'ช่องทางชำระเงิน' : 'Payment Details'}</div><div class="info-text">${escapeHtml(data.bankPaymentInfo ?? '')}</div></div>` : ''}
    </div><div class="totals"><div class="total-title">${isTh ? 'สรุปยอด' : 'Summary'}</div><div class="total-row"><span>${isTh ? 'ยอดรวม' : 'Subtotal'}</span><strong>${formatCurrency(data.subtotal)}</strong></div><div class="total-row"><span>${isTh ? 'ภาษีมูลค่าเพิ่ม 7%' : 'VAT 7%'}</span><strong>${formatCurrency(data.vatAmount)}</strong></div><div class="total-row grand"><span>${isTh ? 'ยอดรวมสุทธิ' : 'Grand Total'}</span><strong>${formatCurrency(data.total)}</strong></div></div></div>
    <div class="support">
      <div class="sig"><div class="sig-space">${data.signatureImageUrl ? `<img class="sig-image" src="${data.signatureImageUrl}" alt="signature"/>` : ''}</div><div class="sig-line"></div><div class="sig-label">${isTh ? 'ผู้จัดทำ / ผู้ออกเอกสาร' : 'Prepared by / Issuer'}</div>${(data.signerName || data.signerTitle) ? `<div class="sig-name">${escapeHtml([data.signerName, data.signerTitle].filter(Boolean).join(' · '))}</div>` : ''}</div>
      <div class="sig"><div class="sig-space"></div><div class="sig-line"></div><div class="sig-label">${isTh ? 'ผู้รับสินค้า / ลูกค้า' : 'Received by / Customer'}</div></div>
      ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? `<div class="qr"><img class="qr-img" src="${data.onlineQrDataUrl}" alt="QR"/><div class="qr-label">${isTh ? 'สแกนตรวจสอบเอกสาร' : 'Scan to verify'}</div></div>` : ''}
    </div>
    <div class="footer"><div>${data.documentMode === 'electronic' ? (isTh ? 'เอกสารอิเล็กทรอนิกส์ตามรูปแบบ e-Tax' : 'Electronic e-Tax document') : (isTh ? 'เอกสารฉบับปกติ' : 'Ordinary document')}</div><div>${escapeHtml(docTitle)} · ${escapeHtml(data.invoiceNumber)}</div></div>
  </div>
</div></div></body></html>`;
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

  const marketplaceTokens = mergedData.templateId ? MARKETPLACE_TEMPLATE_TOKENS[mergedData.templateId] : null;
  if (marketplaceTokens) {
    return buildHtmlMarketplace(mergedData, marketplaceTokens);
  }

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

  if (mergedData.templateId?.startsWith('builtin:dark-')) {
    const variant = mergedData.templateId.replace('builtin:dark-', '');
    return buildHtmlDark(mergedData, variant);
  }

  if (mergedData.templateId?.startsWith('builtin:anime-')) {
    const variant = mergedData.templateId.replace('builtin:anime-', '');
    return buildHtmlAnime(mergedData, variant);
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
  const browser = await launchBrowser();

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
