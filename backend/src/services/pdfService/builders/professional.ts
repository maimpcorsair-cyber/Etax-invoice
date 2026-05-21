import { DOC_TITLE, escapeHtml, formatCurrency, formatDateEn, formatDateTh } from '../utils';
import { amountInWordsThai, amountInWordsEnglish } from '../../invoiceService';
import type { PdfInvoiceData } from '../../pdfService';

export function buildHtmlProfessional(data: PdfInvoiceData, variant: string): string {
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

  const labels = {
    seller: isTh ? 'ผู้ขาย' : isEn ? 'Seller' : 'ผู้ขาย / Seller',
    buyer: isTh ? 'ผู้ซื้อ' : isEn ? 'Buyer' : 'ผู้ซื้อ / Buyer',
    taxId: isTh ? 'เลขประจำตัวผู้เสียภาษี' : isEn ? 'Tax ID' : 'เลขประจำตัวผู้เสียภาษี / Tax ID',
    branch: isTh ? 'สาขา' : isEn ? 'Branch' : 'สาขา / Branch',
    invoiceNo: isTh ? 'เลขที่' : isEn ? 'No.' : 'เลขที่ / No.',
    date: isTh ? 'วันที่' : isEn ? 'Date' : 'วันที่ / Date',
    due: isTh ? 'ครบกำหนด' : isEn ? 'Due' : 'ครบกำหนด / Due',
    no: isTh ? 'ลำดับ' : isEn ? 'No.' : 'No.',
    item: isTh ? 'รายการ' : isEn ? 'Description' : 'รายการ / Description',
    qty: isTh ? 'จำนวน' : isEn ? 'Qty' : 'Qty',
    unit: isTh ? 'หน่วย' : isEn ? 'Unit' : 'Unit',
    price: isTh ? 'ราคา/หน่วย' : isEn ? 'Unit Price' : 'Unit Price',
    disc: isTh ? 'ส่วนลด' : isEn ? 'Disc.' : 'Disc.',
    vat: isTh ? 'VAT' : 'VAT',
    amount: isTh ? 'รวม' : isEn ? 'Total' : 'Total',
    subtotal: isTh ? 'ยอดก่อน VAT' : isEn ? 'Subtotal' : 'Subtotal',
    vatTotal: isTh ? 'ภาษีมูลค่าเพิ่ม 7%' : isEn ? 'VAT 7%' : 'VAT 7%',
    grandTotal: isTh ? 'ยอดรวมสุทธิ' : isEn ? 'Grand Total' : 'Grand Total',
    words: isTh ? 'จำนวนเงินเป็นตัวอักษร' : isEn ? 'Amount in Words' : 'Amount in Words',
    notes: isTh ? 'หมายเหตุ' : isEn ? 'Notes' : 'หมายเหตุ / Notes',
    bank: isTh ? 'ช่องทางชำระเงิน' : isEn ? 'Payment Details' : 'ช่องทางชำระเงิน / Payment Details',
    verify: isTh ? 'สแกนตรวจสอบเอกสาร' : isEn ? 'Scan to verify' : 'สแกนตรวจสอบ / Scan to verify',
    issuer: isTh ? 'ผู้จัดทำ / ผู้ออกเอกสาร' : isEn ? 'Prepared by / Issuer' : 'ผู้จัดทำ / Prepared by',
    receiver: isTh ? 'ผู้รับสินค้า / ลูกค้า' : isEn ? 'Received by / Customer' : 'ผู้รับ / Customer',
    original: isTh ? 'ต้นฉบับ' : isEn ? 'ORIGINAL' : 'ต้นฉบับ / ORIGINAL',
    certified: isTh ? 'เอกสารอิเล็กทรอนิกส์ตามรูปแบบ e-Tax' : isEn ? 'Electronic e-Tax document' : 'เอกสารอิเล็กทรอนิกส์ / Electronic e-Tax document',
  };

  type ProTokens = {
    accent: string;
    accent2: string;
    soft: string;
    paper: string;
    ink: string;
    muted: string;
    headerBg: string;
    headerText: string;
    tableHeaderBg: string;
    tableHeaderText: string;
    border: string;
    totalBg: string;
    totalText: string;
    motif: string;
  };

  const v: Record<string, ProTokens> = {
    'blue-modern':    { accent:'#1e40af', accent2:'#0f2d6b', soft:'#eaf2ff', paper:'#ffffff', ink:'#0f1f3d', muted:'#64748b', headerBg:'#123574', headerText:'#ffffff', tableHeaderBg:'#123574', tableHeaderText:'#ffffff', border:'#c7d8f3', totalBg:'#123574', totalText:'#ffffff', motif:'PRO' },
    'bw':             { accent:'#111827', accent2:'#000000', soft:'#f3f4f6', paper:'#ffffff', ink:'#111827', muted:'#6b7280', headerBg:'#111827', headerText:'#ffffff', tableHeaderBg:'#111827', tableHeaderText:'#ffffff', border:'#d1d5db', totalBg:'#111827', totalText:'#ffffff', motif:'MINIMAL' },
    'navy':           { accent:'#1e3a5f', accent2:'#0b1b33', soft:'#edf3fb', paper:'#ffffff', ink:'#10233f', muted:'#64748b', headerBg:'#132b49', headerText:'#ffffff', tableHeaderBg:'#1e3a5f', tableHeaderText:'#ffffff', border:'#c7d2e8', totalBg:'#132b49', totalText:'#ffffff', motif:'OFFICIAL' },
    'soft-pastel':    { accent:'#7c3aed', accent2:'#4c1d95', soft:'#f5f3ff', paper:'#ffffff', ink:'#31205f', muted:'#766894', headerBg:'#f1edff', headerText:'#4c1d95', tableHeaderBg:'#7c3aed', tableHeaderText:'#ffffff', border:'#ddd6fe', totalBg:'#4c1d95', totalText:'#ffffff', motif:'SOFT' },
    'corp-teal':      { accent:'#0f766e', accent2:'#134e4a', soft:'#e7fffb', paper:'#ffffff', ink:'#123d3b', muted:'#5f7674', headerBg:'#0f766e', headerText:'#ffffff', tableHeaderBg:'#0f766e', tableHeaderText:'#ffffff', border:'#99f6e4', totalBg:'#134e4a', totalText:'#ffffff', motif:'TECH' },
    'elegant-beige':  { accent:'#92400e', accent2:'#5f2b07', soft:'#fff7df', paper:'#fffdf8', ink:'#3b2a16', muted:'#806b55', headerBg:'#fff1c7', headerText:'#5f2b07', tableHeaderBg:'#92400e', tableHeaderText:'#ffffff', border:'#ecd08f', totalBg:'#5f2b07', totalText:'#ffffff', motif:'ELITE' },
    'green-eco':      { accent:'#166534', accent2:'#0f3d22', soft:'#ecfdf3', paper:'#ffffff', ink:'#143421', muted:'#607568', headerBg:'#166534', headerText:'#ffffff', tableHeaderBg:'#166534', tableHeaderText:'#ffffff', border:'#bbf7d0', totalBg:'#0f3d22', totalText:'#ffffff', motif:'ECO' },
    'gradient':       { accent:'#7c3aed', accent2:'#1e40af', soft:'#eef2ff', paper:'#ffffff', ink:'#1c244b', muted:'#64748b', headerBg:'linear-gradient(135deg,#123574 0%,#7c3aed 100%)', headerText:'#ffffff', tableHeaderBg:'linear-gradient(90deg,#123574 0%,#7c3aed 100%)', tableHeaderText:'#ffffff', border:'#d8d5ff', totalBg:'linear-gradient(135deg,#123574 0%,#7c3aed 100%)', totalText:'#ffffff', motif:'NEXT' },
    'classic-orange': { accent:'#c2410c', accent2:'#7c2d12', soft:'#fff3e7', paper:'#ffffff', ink:'#40200f', muted:'#7a6658', headerBg:'#fff3e7', headerText:'#7c2d12', tableHeaderBg:'#c2410c', tableHeaderText:'#ffffff', border:'#fed7aa', totalBg:'#7c2d12', totalText:'#ffffff', motif:'CLASSIC' },
    'biz-clean':      { accent:'#334155', accent2:'#0f172a', soft:'#f4f7fb', paper:'#ffffff', ink:'#172033', muted:'#64748b', headerBg:'#f8fafc', headerText:'#0f172a', tableHeaderBg:'#334155', tableHeaderText:'#ffffff', border:'#dfe7f0', totalBg:'#0f172a', totalText:'#ffffff', motif:'CLEAN' },
  };
  const t = v[variant] ?? v['blue-modern'];

  const itemRows = data.items.map((item, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td><strong>${escapeHtml(isTh ? item.nameTh : (item.nameEn ?? item.nameTh))}</strong>${data.language === 'both' && item.nameEn ? `<span>${escapeHtml(item.nameEn)}</span>` : ''}</td>
      <td class="center">${item.quantity}</td>
      <td class="center">${escapeHtml(item.unit)}</td>
      <td class="right">${formatCurrency(item.unitPrice)}</td>
      <td class="center">${item.discountAmount > 0 ? `${item.discountAmount}%` : '-'}</td>
      <td class="center">${item.vatType === 'vatExempt' ? (isTh ? 'ยกเว้น' : 'Exempt') : item.vatType === 'vatZero' ? '0%' : '7%'}</td>
      <td class="right strong">${formatCurrency(item.totalAmount)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="${fontUrl}" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 12px; color: ${t.ink}; background: #ffffff; }
  .page { width: 794px; min-height: 1123px; background: ${t.paper}; padding: 24px; position: relative; overflow: hidden; }
  .page::before {
    content: '${t.motif}';
    position: absolute;
    right: 30px;
    top: 236px;
    font-size: 74px;
    font-weight: 800;
    letter-spacing: 0.16em;
    color: ${t.accent};
    opacity: 0.045;
    transform: rotate(-8deg);
  }
  .sheet { min-height: 1075px; border: 1px solid ${t.border}; border-radius: 18px; background: ${t.paper}; overflow: hidden; position: relative; }
  .header { background: ${t.headerBg}; color: ${t.headerText}; padding: 28px 32px 24px; display: grid; grid-template-columns: 1fr 262px; gap: 28px; align-items: start; }
  .seller-wrap { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
  .logo-img { width: 62px; height: 62px; object-fit: contain; border-radius: 10px; background: rgba(255,255,255,0.2); padding: 7px; flex: 0 0 auto; }
  .label { font-size: 9.5px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.72; margin-bottom: 7px; }
  .company-name { font-size: 19px; line-height: 1.25; font-weight: 800; color: ${t.headerText}; }
  .company-detail { font-size: 10.5px; line-height: 1.65; margin-top: 7px; opacity: 0.86; }
  .doc-panel { text-align: right; }
  .doc-kicker { font-size: 10px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.72; }
  .doc-title { font-size: 25px; line-height: 1.18; font-weight: 800; margin-top: 4px; color: ${t.headerText}; }
  .copy-badge { display: inline-block; margin-top: 8px; padding: 3px 9px; border: 1px solid currentColor; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; opacity: 0.88; }
  .meta-grid { margin-top: 14px; display: grid; gap: 5px; font-size: 11px; }
  .meta-row { display: grid; grid-template-columns: 82px 1fr; gap: 8px; }
  .meta-key { opacity: 0.72; }
  .meta-value { font-weight: 800; word-break: break-word; }
  .accent-rail { height: 8px; background: linear-gradient(90deg, ${t.accent2} 0%, ${t.accent} 58%, ${t.soft} 100%); }
  .body { padding: 22px 32px 24px; position: relative; z-index: 1; }
  .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
  .party-card { border: 1px solid ${t.border}; border-radius: 12px; padding: 13px 15px; background: ${t.soft}; min-height: 122px; }
  .party-card.seller { background: #ffffff; }
  .party-title { font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: ${t.accent}; margin-bottom: 8px; }
  .party-name { font-size: 14px; font-weight: 800; line-height: 1.35; color: ${t.ink}; margin-bottom: 5px; }
  .party-detail { color: ${t.muted}; font-size: 10.5px; line-height: 1.62; }
  .items-shell { border: 1px solid ${t.border}; border-radius: 14px; overflow: hidden; background: #ffffff; margin-bottom: 16px; }
  .items-title { display: flex; justify-content: space-between; align-items: center; padding: 11px 14px; background: ${t.soft}; border-bottom: 1px solid ${t.border}; }
  .items-title strong { color: ${t.accent2}; font-size: 12px; }
  .items-title span { color: ${t.muted}; font-size: 10px; }
  .items-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .items-table th { background: ${t.tableHeaderBg}; color: ${t.tableHeaderText}; padding: 8px 6px; text-align: left; font-size: 9.5px; font-weight: 800; letter-spacing: 0.04em; }
  .items-table td { padding: 8px 6px; border-bottom: 1px solid ${t.border}; color: ${t.ink}; font-size: 10.8px; line-height: 1.45; vertical-align: top; }
  .items-table tbody tr:nth-child(even) td { background: #fbfdff; }
  .items-table tbody tr:last-child td { border-bottom: none; }
  .items-table .center { text-align: center; }
  .items-table .right { text-align: right; }
  .items-table .strong { font-weight: 800; color: ${t.accent2}; }
  .items-table td span { display: block; margin-top: 2px; color: ${t.muted}; font-size: 9.5px; font-weight: 400; }
  .summary-grid { display: grid; grid-template-columns: 1fr 292px; gap: 16px; align-items: start; }
  .info-stack { display: grid; gap: 10px; }
  .info-box, .totals-box { border: 1px solid ${t.border}; border-radius: 12px; background: #ffffff; overflow: hidden; }
  .info-box { padding: 12px 14px; }
  .info-label, .totals-label { font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: ${t.accent}; margin-bottom: 6px; }
  .info-text { font-size: 11px; line-height: 1.65; color: ${t.ink}; white-space: pre-line; }
  .totals-label { margin: 0; padding: 11px 14px; color: ${t.accent2}; background: ${t.soft}; border-bottom: 1px solid ${t.border}; }
  .total-row { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 9px 14px; border-bottom: 1px solid ${t.border}; color: ${t.muted}; font-size: 11.5px; }
  .total-row strong { color: ${t.ink}; font-weight: 800; }
  .total-row.grand { background: ${t.totalBg}; color: ${t.totalText}; border-bottom: none; padding: 12px 14px; }
  .total-row.grand strong { color: ${t.totalText}; font-size: 15px; }
  .support-grid { display: grid; grid-template-columns: 1fr 1fr ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? '132px' : '0'}; gap: 14px; margin-top: 18px; align-items: stretch; }
  .sig-box, .qr-box { border: 1px solid ${t.border}; border-radius: 12px; background: #ffffff; padding: 12px; text-align: center; min-height: 112px; }
  .sig-space { height: 44px; display: flex; align-items: center; justify-content: center; }
  .sig-image { max-height: 42px; max-width: 150px; object-fit: contain; }
  .sig-line { border-top: 1px solid ${t.border}; margin: 6px auto 7px; width: 74%; }
  .sig-label { color: ${t.muted}; font-size: 10.5px; line-height: 1.35; }
  .sig-name { margin-top: 4px; color: ${t.accent2}; font-size: 10.5px; font-weight: 800; }
  .qr-box { display: ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? 'block' : 'none'}; }
  .qr-img { width: 70px; height: 70px; object-fit: contain; padding: 4px; border: 1px solid ${t.border}; border-radius: 8px; background: #ffffff; }
  .qr-label { margin-top: 6px; color: ${t.muted}; font-size: 9.5px; line-height: 1.35; }
  .cert-footer { margin-top: 14px; padding-top: 11px; border-top: 1px solid ${t.border}; display: flex; justify-content: space-between; gap: 12px; color: ${t.muted}; font-size: 10px; line-height: 1.5; }
  .cert-pill { color: ${t.accent2}; background: ${t.soft}; border: 1px solid ${t.border}; border-radius: 999px; padding: 4px 9px; font-weight: 800; white-space: nowrap; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="page">
<div class="sheet">
  <div class="header">
    <div class="seller-wrap">
      ${data.showCompanyLogo !== false && data.seller.logoUrl ? `<img class="logo-img" src="${data.seller.logoUrl}" alt="logo"/>` : ''}
      <div>
        <div class="label">${labels.seller}</div>
        <div class="company-name">${escapeHtml(sellerName)}</div>
        <div class="company-detail">
          <div>${labels.taxId}: ${escapeHtml(data.seller.taxId)}</div>
          <div>${labels.branch}: ${escapeHtml(sellerBranch)}</div>
          <div>${escapeHtml(sellerAddr)}</div>
          ${(data.seller.phone || data.seller.email) ? `<div>${data.seller.phone ? escapeHtml(data.seller.phone) : ''}${data.seller.phone && data.seller.email ? ' | ' : ''}${data.seller.email ? escapeHtml(data.seller.email) : ''}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="doc-panel">
      <div class="doc-kicker">Tax Invoice</div>
      <div class="doc-title">${escapeHtml(docTitle)}</div>
      <div class="copy-badge">${labels.original}</div>
      <div class="meta-grid">
        <div class="meta-row"><div class="meta-key">${labels.invoiceNo}</div><div class="meta-value">${escapeHtml(data.invoiceNumber)}</div></div>
        <div class="meta-row"><div class="meta-key">${labels.date}</div><div class="meta-value">${escapeHtml(dateStr)}</div></div>
        ${dueStr ? `<div class="meta-row"><div class="meta-key">${labels.due}</div><div class="meta-value">${escapeHtml(dueStr)}</div></div>` : ''}
      </div>
    </div>
  </div>
  <div class="accent-rail"></div>

  <div class="body">
    <div class="party-grid">
      <div class="party-card seller">
        <div class="party-title">${labels.seller}</div>
        <div class="party-name">${escapeHtml(sellerName)}</div>
        <div class="party-detail">
          <div>${labels.taxId}: <strong>${escapeHtml(data.seller.taxId)}</strong></div>
          <div>${labels.branch}: <strong>${escapeHtml(sellerBranch)}</strong></div>
          <div>${escapeHtml(sellerAddr)}</div>
        </div>
      </div>
      <div class="party-card">
        <div class="party-title">${labels.buyer}</div>
        <div class="party-name">${escapeHtml(buyerName)}</div>
        <div class="party-detail">
          <div>${labels.taxId}: <strong>${escapeHtml(data.buyer.taxId)}</strong></div>
          <div>${labels.branch}: <strong>${escapeHtml(buyerBranch)}</strong></div>
          <div>${escapeHtml(buyerAddr)}</div>
        </div>
      </div>
    </div>

    <div class="items-shell">
      <div class="items-title"><strong>${labels.item}</strong><span>${data.items.length} ${isTh ? 'รายการ' : 'items'}</span></div>
      <table class="items-table">
        <thead>
          <tr>
            <th style="width:38px;text-align:center">${labels.no}</th>
            <th>${labels.item}</th>
            <th style="width:48px;text-align:center">${labels.qty}</th>
            <th style="width:50px;text-align:center">${labels.unit}</th>
            <th style="width:82px;text-align:right">${labels.price}</th>
            <th style="width:52px;text-align:center">${labels.disc}</th>
            <th style="width:48px;text-align:center">${labels.vat}</th>
            <th style="width:92px;text-align:right">${labels.amount}</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>

    <div class="summary-grid">
      <div class="info-stack">
        <div class="info-box">
          <div class="info-label">${labels.words}</div>
          <div class="info-text"><strong>${escapeHtml(totalWords)}</strong></div>
        </div>
        ${data.notes ? `<div class="info-box"><div class="info-label">${labels.notes}</div><div class="info-text">${escapeHtml(data.notes)}</div></div>` : ''}
        ${data.bankPaymentInfo ? `<div class="info-box"><div class="info-label">${labels.bank}</div><div class="info-text">${escapeHtml(data.bankPaymentInfo)}</div></div>` : ''}
        ${data.promptPayQrDataUrl ? `<div class="info-box" style="display:flex;gap:12px;align-items:center"><img src="${data.promptPayQrDataUrl}" alt="PromptPay QR" style="width:96px;height:96px;flex-shrink:0"/><div style="font-size:11px;line-height:1.5"><div style="font-weight:700;color:#1e40af">📱 PromptPay</div><div>${isTh ? 'สแกนเพื่อชำระยอด' : 'Scan to pay'} <strong>${formatCurrency(data.total)}</strong></div>${data.promptPayTarget ? `<div style="color:#64748b">${escapeHtml(String(data.promptPayTarget))}</div>` : ''}<div style="color:#94a3b8;font-size:10px">${isTh ? 'อ้างอิง' : 'Ref'}: ${escapeHtml(data.invoiceNumber)}</div></div></div>` : ''}
      </div>
      <div class="totals-box">
        <div class="totals-label">${labels.grandTotal}</div>
        <div class="total-row"><span>${labels.subtotal}</span><strong>${formatCurrency(data.subtotal)} THB</strong></div>
        <div class="total-row"><span>${labels.vatTotal}</span><strong>${formatCurrency(data.vatAmount)} THB</strong></div>
        <div class="total-row grand"><span>${labels.grandTotal}</span><strong>${formatCurrency(data.total)} THB</strong></div>
      </div>
    </div>

    <div class="support-grid">
      <div class="sig-box">
        <div class="sig-space">${data.signatureImageUrl ? `<img class="sig-image" src="${data.signatureImageUrl}" alt="signature"/>` : ''}</div>
        <div class="sig-line"></div>
        <div class="sig-label">${labels.issuer}</div>
        ${(data.signerName || data.signerTitle) ? `<div class="sig-name">${escapeHtml([data.signerName, data.signerTitle].filter(Boolean).join(' · '))}</div>` : ''}
      </div>
      <div class="sig-box">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <div class="sig-label">${labels.receiver}</div>
      </div>
      ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? `
      <div class="qr-box">
        <img class="qr-img" src="${data.onlineQrDataUrl}" alt="QR"/>
        <div class="qr-label">${labels.verify}</div>
      </div>` : ''}
    </div>

    <div class="cert-footer">
      <div>${data.documentMode === 'electronic' ? labels.certified : (isTh ? 'เอกสารฉบับปกติ' : 'Ordinary document')}</div>
      <div class="cert-pill">${data.documentMode === 'electronic' ? 'ELECTRONIC DOCUMENT' : 'ORDINARY DOCUMENT'}</div>
    </div>
    <div class="cert-footer" style="margin-top:8px;padding-top:8px">
      <div>${isTh ? 'เอกสารนี้ออกโดยระบบ Billboy e-Tax' : 'Issued via Billboy e-Tax System'}</div>
      <div>${escapeHtml(docTitle)} · ${escapeHtml(data.invoiceNumber)}</div>
    </div>
  </div>
</div>
</div>
</body>
</html>`;
}
