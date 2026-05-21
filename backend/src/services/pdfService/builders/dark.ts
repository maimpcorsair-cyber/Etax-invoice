import { escapeHtml, formatCurrency, formatDateEn, formatDateTh } from '../utils';
import { buildHtmlPosterTemplate, originalDarkArtwork } from './_posterTemplate';
import type { PosterTemplateTokens } from './_posterTemplate';
import { amountInWordsThai, amountInWordsEnglish } from '../../invoiceService';
import type { PdfInvoiceData } from '../../pdfService';

export function buildHtmlDark(data: PdfInvoiceData, variant: string): string {
  const posterTokenMap: Record<string, Omit<PosterTemplateTokens, 'group' | 'art'>> = {
    king:     { bg:'#050505', paper:'#070707', ink:'#f8eac0', muted:'#b5a77b', accent:'#d4af37', accent2:'#17120a', soft:'#15120b', border:'#3f341b', headerText:'#fff6d7', title:'Dark King', subtitle:'Luxury Gold' },
    samurai:  { bg:'#0a0000', paper:'#0e0505', ink:'#f2dddd', muted:'#b58b8b', accent:'#c0392b', accent2:'#250707', soft:'#180808', border:'#4a1212', headerText:'#fff1f1', title:'Steel Samurai', subtitle:'Crimson Steel' },
    carbon:   { bg:'#041014', paper:'#061015', ink:'#d6f7ff', muted:'#84aeb8', accent:'#00bcd4', accent2:'#001f27', soft:'#092029', border:'#0b4c58', headerText:'#e8fbff', title:'Carbon X', subtitle:'Electric Carbon' },
    wolf:     { bg:'#060810', paper:'#080b18', ink:'#dce5ff', muted:'#94a3c7', accent:'#7c8db5', accent2:'#10172d', soft:'#11182f', border:'#273251', headerText:'#eef3ff', title:'Midnight Wolf', subtitle:'Midnight Ledger' },
    shadow:   { bg:'#08000f', paper:'#0c0018', ink:'#eadcff', muted:'#ad90c8', accent:'#9b59b6', accent2:'#190029', soft:'#160021', border:'#402055', headerText:'#fbf4ff', title:'Shadow Tech', subtitle:'Dark Purple' },
    matrix:   { bg:'#000500', paper:'#000900', ink:'#baffc9', muted:'#58b96d', accent:'#00ff41', accent2:'#001a08', soft:'#001506', border:'#005f1b', headerText:'#d8ffe0', title:'Black Matrix', subtitle:'Green Code' },
    graffiti: { bg:'#101010', paper:'#141414', ink:'#fff0e8', muted:'#b7a197', accent:'#ff6b35', accent2:'#26100a', soft:'#1f1511', border:'#5a2b18', headerText:'#fff5ef', title:'Urban Graffiti', subtitle:'Street Heat' },
    cyber:    { bg:'#05001a', paper:'#070020', ink:'#e6e6ff', muted:'#a7a4d4', accent:'#00f5ff', accent2:'#120044', soft:'#100038', border:'#2743a7', headerText:'#ecfeff', title:'Cyber Neon', subtitle:'Neon Grid' },
    gold:     { bg:'#080600', paper:'#0f0d00', ink:'#fff2b8', muted:'#bfae68', accent:'#ffd700', accent2:'#211600', soft:'#1a1403', border:'#5b4300', headerText:'#fff6c7', title:'Luxury Gold', subtitle:'Black Reserve' },
    mono:     { bg:'#050505', paper:'#0b0b0b', ink:'#f4f4f5', muted:'#a1a1aa', accent:'#ffffff', accent2:'#151515', soft:'#18181b', border:'#3f3f46', headerText:'#ffffff', title:'Mono Minimal', subtitle:'Pure Mono' },
  };
  const posterTokens = posterTokenMap[variant] ?? posterTokenMap.king;
  return buildHtmlPosterTemplate(data, {
    ...posterTokens,
    group: 'dark',
    art: originalDarkArtwork(variant, posterTokens.accent, posterTokens.accent2),
  });

  const isTh = data.language !== 'en';

  type DarkTokens = {
    bg: string; text: string; accent: string; headerBg: string;
    tableBg: string; tableHeader: string; tableHeaderText: string;
    borderColor: string; totalBg: string; totalText: string;
  };

  const tokenMap: Record<string, DarkTokens> = {
    king:     { bg:'#050505', text:'#f0e6c8', accent:'#d4af37', headerBg:'#0d0d0d', tableBg:'#111111', tableHeader:'#d4af37', tableHeaderText:'#000', borderColor:'#2a2a2a', totalBg:'#d4af37', totalText:'#000' },
    samurai:  { bg:'#0a0000', text:'#e8e0e0', accent:'#c0392b', headerBg:'#180000', tableBg:'#0f0808', tableHeader:'#c0392b', tableHeaderText:'#fff', borderColor:'#2a0000', totalBg:'#c0392b', totalText:'#fff' },
    carbon:   { bg:'#060a0d', text:'#b0d0d8', accent:'#00bcd4', headerBg:'#001a1f', tableBg:'#0a1518', tableHeader:'#00bcd4', tableHeaderText:'#000', borderColor:'#003a42', totalBg:'#00bcd4', totalText:'#000' },
    wolf:     { bg:'#060810', text:'#c8d0e8', accent:'#7c8db5', headerBg:'#080b18', tableBg:'#0b0e1c', tableHeader:'#1e2844', tableHeaderText:'#9aa8d0', borderColor:'#1a2040', totalBg:'#1e2844', totalText:'#9aa8d0' },
    shadow:   { bg:'#08000f', text:'#d0c0e8', accent:'#9b59b6', headerBg:'#110020', tableBg:'#0c0018', tableHeader:'#6c3483', tableHeaderText:'#fff', borderColor:'#2a0050', totalBg:'#6c3483', totalText:'#fff' },
    matrix:   { bg:'#000500', text:'#00ff41', accent:'#00ff41', headerBg:'#001000', tableBg:'#001500', tableHeader:'#002800', tableHeaderText:'#00ff41', borderColor:'#004000', totalBg:'#00ff41', totalText:'#000' },
    graffiti: { bg:'#111111', text:'#f0f0f0', accent:'#ff6b35', headerBg:'#1a1a1a', tableBg:'#161616', tableHeader:'#ff6b35', tableHeaderText:'#000', borderColor:'#303030', totalBg:'#ff6b35', totalText:'#000' },
    cyber:    { bg:'#05001a', text:'#d0d8ff', accent:'#00f5ff', headerBg:'#08002a', tableBg:'#080020', tableHeader:'#00f5ff', tableHeaderText:'#000014', borderColor:'#1a006a', totalBg:'#00f5ff', totalText:'#000' },
    gold:     { bg:'#080600', text:'#f0e0a0', accent:'#ffd700', headerBg:'#140e00', tableBg:'#0f0d00', tableHeader:'#ffd700', tableHeaderText:'#000', borderColor:'#3a2800', totalBg:'#ffd700', totalText:'#000' },
    mono:     { bg:'#0a0a0a', text:'#e0e0e0', accent:'#ffffff', headerBg:'#111111', tableBg:'#151515', tableHeader:'#222222', tableHeaderText:'#ffffff', borderColor:'#2a2a2a', totalBg:'#ffffff', totalText:'#000000' },
  };

  const t = tokenMap[variant] ?? tokenMap.king;

  const sellerName = isTh ? data.seller.nameTh : (data.seller.nameEn ?? data.seller.nameTh);
  const sellerAddr = isTh ? (data.seller.addressTh ?? '') : (data.seller.addressEn ?? data.seller.addressTh ?? '');
  const buyerName  = isTh ? data.buyer.nameTh  : (data.buyer.nameEn  ?? data.buyer.nameTh);
  const buyerAddr  = isTh ? (data.buyer.addressTh ?? '') : (data.buyer.addressEn ?? data.buyer.addressTh ?? '');
  const buyerBranch = data.buyer.branchCode === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : (data.buyer.branchCode ?? '');
  const sellerBranch = data.seller.branchCode === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : (data.seller.branchCode ?? '');
  const dateStr = isTh ? formatDateTh(data.invoiceDate) : formatDateEn(data.invoiceDate);
  const dueDateStr = data.dueDate ? (isTh ? formatDateTh(data.dueDate!) : formatDateEn(data.dueDate!)) : '-';
  const totalWords = isTh ? amountInWordsThai(data.total) : amountInWordsEnglish(data.total);

  const itemRows = data.items.map((item, idx) => {
    const name = isTh ? item.nameTh : (item.nameEn ?? item.nameTh);
    return `<tr>
      <td style="text-align:center;color:${t.accent};font-weight:700">${idx + 1}</td>
      <td>${escapeHtml(name)}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:center">${escapeHtml(item.unit)}</td>
      <td style="text-align:right">${formatCurrency(item.unitPrice)}</td>
      <td style="text-align:right;font-weight:600;color:${t.accent}">${formatCurrency(item.totalAmount)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&family=Rajdhani:wght@500;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Sarabun',sans-serif;font-size:12px;background:${t.bg};color:${t.text}}
  .page{width:794px;min-height:1123px;background:${t.bg}}
  .header{background:${t.headerBg};padding:28px 40px;display:flex;justify-content:space-between;align-items:flex-start}
  .accent-line{height:2px;background:${t.accent};opacity:0.8}
  .company-name{font-family:'Rajdhani',sans-serif;font-size:19px;font-weight:700;color:${t.accent};letter-spacing:2px;text-transform:uppercase;margin-bottom:4px}
  .company-detail{font-size:10px;color:${t.text};opacity:0.6;line-height:1.6}
  .doc-title{font-family:'Rajdhani',sans-serif;font-size:22px;font-weight:700;color:${t.accent};letter-spacing:3px;text-align:right}
  .doc-subtitle{font-size:11px;color:${t.text};opacity:0.6;text-align:right;margin-top:2px}
  .doc-meta{margin-top:10px;text-align:right;font-size:11px;color:${t.text};opacity:0.75;line-height:1.8}
  .body{padding:24px 40px}
  .bill-box{border:1px solid ${t.borderColor};padding:14px 16px;margin-bottom:20px;background:${t.tableBg}}
  .bill-label{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${t.accent};margin-bottom:6px}
  .buyer-name{font-size:14px;font-weight:600;color:${t.text}}
  .buyer-detail{font-size:10px;color:${t.text};opacity:0.55;margin-top:3px;line-height:1.6}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{background:${t.tableHeader};color:${t.tableHeaderText};padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-align:left}
  td{padding:7px 10px;border-bottom:1px solid ${t.borderColor};font-size:11px;color:${t.text}}
  tr:nth-child(even) td{background:${t.tableBg}}
  .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:20px}
  .totals-inner{width:260px;border:1px solid ${t.borderColor}}
  .t-row{display:flex;justify-content:space-between;padding:5px 12px;font-size:11px;color:${t.text};opacity:0.8;border-bottom:1px solid ${t.borderColor}}
  .t-row.grand{background:${t.totalBg};color:${t.totalText};opacity:1;font-family:'Rajdhani',sans-serif;font-size:15px;font-weight:700;letter-spacing:1px;border:none}
  .words{padding:10px 14px;border:1px solid ${t.borderColor};font-size:10px;color:${t.text};opacity:0.65;margin-bottom:12px}
  .notes{padding:10px 14px;border:1px solid ${t.borderColor};font-size:10px;color:${t.text};opacity:0.65;margin-bottom:12px}
  .sig-row{display:flex;gap:16px;margin-top:20px}
  .sig-box{flex:1;text-align:center;border-top:1px solid ${t.borderColor};padding-top:36px;font-size:10px;color:${t.text};opacity:0.5}
</style></head><body><div class="page">

<div class="header">
  <div>
    <div class="company-name">${escapeHtml(sellerName)}</div>
    <div class="company-detail">
      ${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.seller.taxId)}<br>
      ${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(sellerBranch)}<br>
      ${escapeHtml(sellerAddr)}<br>
      ${data.seller.phone ? escapeHtml(data.seller.phone ?? '') : ''}${data.seller.email ? ' · ' + escapeHtml(data.seller.email ?? '') : ''}
    </div>
  </div>
  <div>
    <div class="doc-title">${isTh ? 'ใบกำกับภาษี' : 'TAX INVOICE'}</div>
    <div class="doc-subtitle">${isTh ? 'TAX INVOICE / ใบเสร็จรับเงิน' : 'ใบกำกับภาษี / ใบเสร็จรับเงิน'}</div>
    <div class="doc-meta">
      ${isTh ? 'เลขที่' : 'No.'}: <strong style="color:${t.accent}">${escapeHtml(data.invoiceNumber)}</strong><br>
      ${isTh ? 'วันที่' : 'Date'}: ${dateStr}<br>
      ${data.dueDate ? `${isTh ? 'ครบกำหนด' : 'Due'}: ${dueDateStr}` : ''}
    </div>
  </div>
</div>
<div class="accent-line"></div>

<div class="body">
  <div class="bill-box">
    <div class="bill-label">${isTh ? '▸ ผู้ซื้อ / BILL TO' : '▸ BILL TO / ผู้ซื้อ'}</div>
    <div class="buyer-name">${escapeHtml(buyerName)}</div>
    <div class="buyer-detail">
      ${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.buyer.taxId)} &nbsp;|&nbsp;
      ${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(buyerBranch)}<br>
      ${escapeHtml(buyerAddr)}
    </div>
  </div>

  <table>
    <thead><tr>
      <th style="width:36px;text-align:center">#</th>
      <th>${isTh ? 'รายการ' : 'Description'}</th>
      <th style="width:54px;text-align:center">${isTh ? 'จำนวน' : 'Qty'}</th>
      <th style="width:54px;text-align:center">${isTh ? 'หน่วย' : 'Unit'}</th>
      <th style="width:100px;text-align:right">${isTh ? 'ราคา/หน่วย' : 'Unit Price'}</th>
      <th style="width:100px;text-align:right">${isTh ? 'จำนวนเงิน' : 'Amount'}</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals-wrap"><div class="totals-inner">
    <div class="t-row"><span>${isTh ? 'ยอดรวม' : 'Subtotal'}</span><span>${formatCurrency(data.subtotal)}</span></div>
    <div class="t-row"><span>${isTh ? 'ภาษีมูลค่าเพิ่ม 7%' : 'VAT 7%'}</span><span>${formatCurrency(data.vatAmount)}</span></div>
    <div class="t-row grand"><span>${isTh ? 'ยอดรวมสุทธิ' : 'GRAND TOTAL'}</span><span>${formatCurrency(data.total)}</span></div>
  </div></div>

  <div class="words">${isTh ? 'จำนวนเงินเป็นตัวอักษร: ' : 'Amount in Words: '}${escapeHtml(totalWords)}</div>
  ${data.notes ? `<div class="notes"><strong style="color:${t.accent}">${isTh ? 'หมายเหตุ' : 'Notes'}:</strong> ${escapeHtml(data.notes ?? '')}</div>` : ''}
  ${data.bankPaymentInfo ? `<div class="notes"><strong style="color:${t.accent}">${isTh ? 'ข้อมูลบัญชี' : 'Bank Transfer'}:</strong><br><span style="white-space:pre-line">${escapeHtml(data.bankPaymentInfo ?? '')}</span></div>` : ''}
  ${data.promptPayQrDataUrl ? `<div class="notes" style="display:flex;gap:12px;align-items:center"><img src="${data.promptPayQrDataUrl}" alt="PromptPay QR" style="width:88px;height:88px;background:#fff;padding:4px;border-radius:4px;flex-shrink:0"/><div style="font-size:11px;line-height:1.5"><div style="font-weight:700;color:${t.accent}">📱 PromptPay</div><div>${isTh ? 'สแกนเพื่อชำระยอด' : 'Scan to pay'} <strong>${formatCurrency(data.total)}</strong></div>${data.promptPayTarget ? `<div style="opacity:0.7">${escapeHtml(String(data.promptPayTarget))}</div>` : ''}<div style="opacity:0.5;font-size:10px">Ref: ${escapeHtml(data.invoiceNumber)}</div></div></div>` : ''}

  <div class="sig-row">
    <div class="sig-box">
      ${data.signatureImageUrl ? `<img src="${data.signatureImageUrl}" style="height:40px;margin-bottom:4px" alt="sig"/>` : ''}
      <div style="border-top:1px solid ${t.borderColor};padding-top:6px;margin-top:4px">${isTh ? 'ผู้มีอำนาจลงนาม' : 'Authorized Signatory'}</div>
      ${data.signerName ? `<div style="color:${t.accent};font-size:11px;font-weight:600">${escapeHtml(data.signerName ?? '')}</div>` : ''}
      ${data.signerTitle ? `<div style="font-size:10px">${escapeHtml(data.signerTitle ?? '')}</div>` : ''}
    </div>
    <div class="sig-box">
      <div style="border-top:1px solid ${t.borderColor};padding-top:6px;margin-top:40px">${isTh ? 'ผู้รับสินค้า' : 'Received by'}</div>
    </div>
    ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? `
    <div class="sig-box">
      <img src="${data.onlineQrDataUrl}" style="width:60px;height:60px;margin-bottom:4px" alt="QR"/>
      <div style="border-top:1px solid ${t.borderColor};padding-top:6px;font-size:9px">${isTh ? 'สแกนเพื่อตรวจสอบ' : 'Scan to verify'}</div>
    </div>` : ''}
  </div>
</div>
</div></body></html>`;
}
