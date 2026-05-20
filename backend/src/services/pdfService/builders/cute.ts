import { DOC_TITLE, escapeHtml, formatCurrency, formatDateEn, formatDateTh } from '../utils';
import { amountInWordsThai, amountInWordsEnglish } from '../../invoiceService';
import type { PdfInvoiceData } from '../../pdfService';

export function buildHtmlCute(data: PdfInvoiceData, variant: string): string {
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
  const dueStr = data.dueDate ? (isTh ? formatDateTh(data.dueDate as Date) : formatDateEn(data.dueDate as Date)) : '';

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
