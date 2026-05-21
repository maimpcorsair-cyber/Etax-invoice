import {
  formatDateTh, formatDateEn, formatCurrency, escapeHtml, DOC_TITLE,
} from '../utils';
import { amountInWordsThai, amountInWordsEnglish } from '../../invoiceService';
import type { PdfInvoiceData } from '../../pdfService';

export function buildHtmlCrayon(data: PdfInvoiceData): string {
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

  ${data.promptPayQrDataUrl ? `<div class="bank-box" style="display:flex;gap:12px;align-items:center"><img src="${data.promptPayQrDataUrl}" alt="PromptPay QR" style="width:96px;height:96px;flex-shrink:0"/><div style="font-size:11px;line-height:1.5"><div style="font-weight:700;color:#1e40af">📱 PromptPay</div><div>${isTh ? 'สแกนเพื่อชำระยอด' : 'Scan to pay'} <strong>${formatCurrency(data.total)}</strong></div>${data.promptPayTarget ? `<div style="color:#64748b">${escapeHtml(String(data.promptPayTarget))}</div>` : ''}<div style="color:#94a3b8;font-size:10px">${isTh ? 'อ้างอิง' : 'Ref'}: ${escapeHtml(data.invoiceNumber)}</div></div></div>` : ''}

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
