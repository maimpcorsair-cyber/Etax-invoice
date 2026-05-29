import { DOC_TITLE, buildOnlineViewUrl, compileTemplateHtml, escapeHtml, formatCurrency, formatDateEn, formatDateTh, resolveDocumentTheme } from '../utils';
import { amountInWordsThai, amountInWordsEnglish } from '../../invoiceService';
import type { PdfInvoiceData } from '../../pdfService';

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
  const onePageCompact = !customTemplateBlock && data.items.length <= 3;
  const documentEyebrow = isElectronicDocument
    ? 'Electronic Tax Document'
    : (isTh ? 'เอกสาร' : 'Document');
  const shouldRenderSignature = Boolean(data.signatureImageUrl || data.signerName || data.signerTitle);

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
  .page {
    max-width: 210mm;
    min-height: calc(297mm - 40px);
    margin: 0 auto;
    display: flex;
  }
  .muted-inline { color: #5f6b7a; }
  .document-shell {
    width: 100%;
    min-height: inherit;
    display: flex;
    flex-direction: column;
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
  .document-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 28px 30px 24px;
    position: relative;
    z-index: 1;
  }
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
    margin-top: auto;
    padding-top: 18px;
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
  .compact-one-page {
    padding: 8px;
    font-size: 11.5px;
  }
  .compact-one-page .document-shell {
    border-radius: 18px;
    box-shadow: 0 10px 32px rgba(15, 23, 42, 0.06);
  }
  .compact-one-page .document-body {
    padding: 20px 22px 18px;
  }
  .compact-one-page .hero {
    grid-template-columns: minmax(0, 1.35fr) minmax(250px, 0.85fr);
    gap: 16px;
    padding-bottom: 12px;
  }
  .compact-one-page .company-name {
    font-size: 18px;
    margin-bottom: 5px;
  }
  .compact-one-page .company-legal,
  .compact-one-page .party-detail,
  .compact-one-page .bank-text {
    font-size: 10.5px;
    line-height: 1.45;
  }
  .compact-one-page .title-card {
    border-radius: 16px;
    padding: 12px 14px;
  }
  .compact-one-page .title-card h1 {
    font-size: 23px;
    line-height: 1.08;
  }
  .compact-one-page .eyebrow {
    margin-bottom: 5px;
  }
  .compact-one-page .template-badge {
    margin-top: 6px;
    padding: 4px 9px;
    font-size: 9.5px;
  }
  .compact-one-page .overview-grid {
    gap: 12px;
    margin: 13px 0 12px;
  }
  .compact-one-page .party-card {
    padding: 12px;
  }
  .compact-one-page .party-column {
    min-height: 88px;
    padding: 10px 11px;
  }
  .compact-one-page .meta-card {
    padding: 10px 12px;
  }
  .compact-one-page .section-label {
    margin-bottom: 7px;
    font-size: 9.5px;
  }
  .compact-one-page .meta-list {
    gap: 5px;
  }
  .compact-one-page .meta-row {
    grid-template-columns: 92px minmax(0, 1fr);
    padding-bottom: 5px;
    font-size: 10.5px;
  }
  .compact-one-page .meta-value.emphasize {
    font-size: 13px;
  }
  .compact-one-page .items-section {
    border-radius: 15px;
  }
  .compact-one-page .items-header {
    padding: 9px 13px 8px;
  }
  .compact-one-page table {
    font-size: 10.5px;
  }
  .compact-one-page thead th,
  .compact-one-page tbody td {
    padding: 7px 6px;
  }
  .compact-one-page .summary-grid {
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 12px;
    margin-top: 12px;
  }
  .compact-one-page .notes-card,
  .compact-one-page .words-card,
  .compact-one-page .totals-card,
  .compact-one-page .bank-box,
  .compact-one-page .online-box {
    border-radius: 13px;
  }
  .compact-one-page .notes-card,
  .compact-one-page .words-card,
  .compact-one-page .bank-box,
  .compact-one-page .online-box {
    padding: 10px 12px;
  }
  .compact-one-page .totals-header {
    padding: 9px 12px 7px;
  }
  .compact-one-page .totals-row {
    padding: 8px 12px;
    font-size: 10.5px;
  }
  .compact-one-page .totals-row.grand strong {
    font-size: 14px;
  }
  .compact-one-page .signature-grid {
    margin-top: 12px;
    grid-template-columns: 1fr;
  }
  .compact-one-page .sig-card {
    padding: 10px 12px;
  }
  .compact-one-page .sig-space {
    height: 34px;
  }
  .compact-one-page .document-support {
    grid-template-columns: 1fr;
    gap: 10px;
    margin-top: auto;
    padding-top: 14px;
  }
  .compact-one-page .promptpay-row img {
    width: 74px !important;
    height: 74px !important;
  }
  .compact-one-page .footer {
    margin-top: 10px;
    padding-top: 9px;
    font-size: 9.5px;
  }
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

  @media print {
    body { padding: 0; }
    .page { min-height: calc(297mm - 20mm); }
  }
</style>
</head>
<body class="${theme.className}${onePageCompact ? ' compact-one-page' : ''}">
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
            <div class="eyebrow">${documentEyebrow}</div>
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

      ${shouldRenderSignature ? `
        <div class="signature-grid">
          <div class="sig-card">
            <div class="sig-space">${data.signatureImageUrl ? `<img class="sig-image" src="${data.signatureImageUrl}" alt="authorized signature"/>` : ''}</div>
            <div class="sig-line"></div>
            <div class="sig-title">${labels.preparedBy}</div>
            ${(data.signerName || data.signerTitle) ? `<div class="sig-name">${escapeHtml([data.signerName, data.signerTitle].filter(Boolean).join(' · '))}</div>` : ''}
          </div>
        </div>
      ` : ''}

      ${(data.bankPaymentInfo || isElectronicDocument || data.promptPayQrDataUrl) ? `
        <div class="document-support">
          ${data.bankPaymentInfo || data.promptPayQrDataUrl ? `
            <div class="bank-box">
              <div class="section-label">${labels.bankPayment}</div>
              ${data.bankPaymentInfo ? `<div class="bank-text">${escapeHtml(data.bankPaymentInfo)}</div>` : ''}
              ${data.promptPayQrDataUrl ? `
                <div class="promptpay-row" style="display:flex;gap:12px;align-items:center;margin-top:${data.bankPaymentInfo ? '8px' : '0'};padding-top:${data.bankPaymentInfo ? '8px' : '0'};${data.bankPaymentInfo ? 'border-top:1px dashed #cbd5e1;' : ''}">
                  <img src="${data.promptPayQrDataUrl}" alt="PromptPay QR" style="width:96px;height:96px;flex-shrink:0"/>
                  <div style="font-size:11px;line-height:1.5;color:#0f172a;">
                    <div style="font-weight:700;color:#0d3b8a;margin-bottom:2px">📱 PromptPay</div>
                    <div>${isTh ? 'สแกนเพื่อชำระยอด' : 'Scan to pay'} <strong>${formatCurrency(data.total)}</strong></div>
                    ${data.promptPayTarget ? `<div style="color:#64748b;margin-top:2px">${escapeHtml(String(data.promptPayTarget))}</div>` : ''}
                    <div style="color:#94a3b8;margin-top:2px;font-size:10px">${isTh ? 'อ้างอิง' : 'Ref'}: ${escapeHtml(data.invoiceNumber)}</div>
                  </div>
                </div>
              ` : ''}
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

      ${isElectronicDocument ? `
        <div class="electronic-cert">
          <div>${labels.electronicCertified}</div>
          <div class="cert-pill">ELECTRONIC DOCUMENT</div>
        </div>
      ` : ''}

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
