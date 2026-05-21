import { DOC_TITLE, escapeHtml, formatCurrency, formatDateEn, formatDateTh } from '../utils';
import { amountInWordsThai, amountInWordsEnglish } from '../../invoiceService';
import type { PdfInvoiceData } from '../../pdfService';

export function buildHtmlMinimal(data: PdfInvoiceData, variant: string): string {
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

  const dueStr = data.dueDate ? (isTh ? formatDateTh(data.dueDate as Date) : formatDateEn(data.dueDate as Date)) : '';

  // Per-variant color tokens
  const v: Record<string, { border: string; headerBg: string; accent: string; totalBg: string; totalText: string; thBg: string; thText: string; bodyPad: string; shellBorder: string }> = {
    white: { border:'#e5e7eb', headerBg:'#ffffff', accent:'#374151', totalBg:'#f3f4f6', totalText:'#111827', thBg:'#f9fafb', thText:'#374151', bodyPad:'28px 32px', shellBorder:'1px solid #e5e7eb' },
    gray:  { border:'#d1d5db', headerBg:'#f9fafb', accent:'#6b7280', totalBg:'#e5e7eb', totalText:'#111827', thBg:'#f3f4f6', thText:'#374151', bodyPad:'28px 32px', shellBorder:'1px solid #d1d5db' },
    'light-gray': { border:'#d8dee8', headerBg:'#f6f8fb', accent:'#64748b', totalBg:'#e7ecf3', totalText:'#172033', thBg:'#f4f7fb', thText:'#334155', bodyPad:'30px 34px', shellBorder:'1px solid #d8dee8' },
    line:  { border:'#99f6e4', headerBg:'#ffffff', accent:'#0d9488', totalBg:'#0d9488', totalText:'#ffffff', thBg:'#f0fdfa', thText:'#0f766e', bodyPad:'28px 32px', shellBorder:'1px solid #ccfbf1' },
    mint:  { border:'#a7f3d0', headerBg:'#f0fdf4', accent:'#34d399', totalBg:'#047857', totalText:'#ffffff', thBg:'#ecfdf5', thText:'#047857', bodyPad:'30px 34px', shellBorder:'1px solid #bbf7d0' },
    beige: { border:'#ead7b2', headerBg:'#fff8ea', accent:'#b7791f', totalBg:'#7c4a03', totalText:'#ffffff', thBg:'#fff3d6', thText:'#7c4a03', bodyPad:'30px 34px', shellBorder:'1px solid #ead7b2' },
    'dark-accent': { border:'#d1d5db', headerBg:'#ffffff', accent:'#111827', totalBg:'#111827', totalText:'#ffffff', thBg:'#111827', thText:'#ffffff', bodyPad:'28px 32px', shellBorder:'2px solid #111827' },
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

    ${data.promptPayQrDataUrl ? `
    <div class="bank-box" style="display:flex;gap:12px;align-items:center">
      <img src="${data.promptPayQrDataUrl}" alt="PromptPay QR" style="width:96px;height:96px;flex-shrink:0"/>
      <div style="font-size:11px;line-height:1.5">
        <div style="font-weight:700">📱 PromptPay</div>
        <div>${isTh ? 'สแกนเพื่อชำระยอด' : 'Scan to pay'} <strong>${formatCurrency(data.total)}</strong></div>
        ${data.promptPayTarget ? `<div style="color:#64748b">${escapeHtml(String(data.promptPayTarget))}</div>` : ''}
        <div style="color:#94a3b8;font-size:10px">${isTh ? 'อ้างอิง' : 'Ref'}: ${escapeHtml(data.invoiceNumber)}</div>
      </div>
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
