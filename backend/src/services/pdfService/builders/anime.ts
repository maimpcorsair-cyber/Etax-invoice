import { escapeHtml, formatCurrency, formatDateEn, formatDateTh } from '../utils';
import { buildHtmlPosterTemplate, originalAnimeArtwork } from './_posterTemplate';
import type { PosterTemplateTokens } from './_posterTemplate';
import { amountInWordsThai, amountInWordsEnglish } from '../../invoiceService';
import type { PdfInvoiceData } from '../../pdfService';

export function buildHtmlAnime(data: PdfInvoiceData, variant: string): string {
  const posterTokenMap: Record<string, Omit<PosterTemplateTokens, 'group' | 'art'>> = {
    ink:     { bg:'#f8fafc', paper:'#ffffff', ink:'#111111', muted:'#64748b', accent:'#c0392b', accent2:'#111111', soft:'#f3f4f6', border:'#d4d4d8', headerText:'#ffffff', title:'Anime Black Ink', subtitle:'Manga Ink' },
    flame:   { bg:'#fff5f5', paper:'#ffffff', ink:'#260606', muted:'#8b5a5a', accent:'#ef4444', accent2:'#991b1b', soft:'#fff1f2', border:'#fecaca', headerText:'#ffffff', title:'Anime Red Flame', subtitle:'Red Flame' },
    energy:  { bg:'#eff6ff', paper:'#ffffff', ink:'#172554', muted:'#607399', accent:'#3b82f6', accent2:'#1d4ed8', soft:'#dbeafe', border:'#bfdbfe', headerText:'#ffffff', title:'Anime Blue Energy', subtitle:'Blue Energy' },
    shadow:  { bg:'#faf5ff', paper:'#ffffff', ink:'#2e1065', muted:'#7e659c', accent:'#a855f7', accent2:'#581c87', soft:'#f3e8ff', border:'#e9d5ff', headerText:'#ffffff', title:'Anime Purple Shadow', subtitle:'Purple Shadow' },
    mecha:   { bg:'#f1f5f9', paper:'#ffffff', ink:'#1e293b', muted:'#64748b', accent:'#64748b', accent2:'#1e293b', soft:'#e2e8f0', border:'#cbd5e1', headerText:'#f8fafc', title:'Anime Mecha Gear', subtitle:'Mecha Gear' },
    chibi:   { bg:'#fdf2f8', paper:'#ffffff', ink:'#831843', muted:'#9d6381', accent:'#ec4899', accent2:'#be185d', soft:'#fce7f3', border:'#fbcfe8', headerText:'#ffffff', title:'Anime Chibi Cute', subtitle:'Chibi Cute' },
    idol:    { bg:'#fefce8', paper:'#ffffff', ink:'#713f12', muted:'#9a7a39', accent:'#eab308', accent2:'#a16207', soft:'#fef3c7', border:'#fde68a', headerText:'#ffffff', title:'Anime Idol Stage', subtitle:'Idol Stage' },
    fantasy: { bg:'#ecfdf5', paper:'#ffffff', ink:'#064e3b', muted:'#5b7b6f', accent:'#10b981', accent2:'#047857', soft:'#d1fae5', border:'#a7f3d0', headerText:'#ffffff', title:'Anime Fantasy', subtitle:'Fantasy Forest' },
    tokyo:   { bg:'#111827', paper:'#151022', ink:'#f5d0fe', muted:'#c4a9d8', accent:'#e94560', accent2:'#312e81', soft:'#241432', border:'#6d285c', headerText:'#ffffff', title:'Anime Tokyo Night', subtitle:'Tokyo Night' },
    pastel:  { bg:'#fbf7ff', paper:'#ffffff', ink:'#553c7b', muted:'#8d77aa', accent:'#b794f4', accent2:'#7c3aed', soft:'#f5f0ff', border:'#ddd6fe', headerText:'#ffffff', title:'Anime Pastel Otaku', subtitle:'Pastel Otaku' },
  };
  const posterTokens = posterTokenMap[variant] ?? posterTokenMap.ink;
  const darkArt = variant === 'tokyo';
  return buildHtmlPosterTemplate(data, {
    ...posterTokens,
    group: 'anime',
    art: originalAnimeArtwork(variant, posterTokens.accent, posterTokens.accent2, posterTokens.soft, darkArt),
  });

  const isTh = data.language !== 'en';

  type AnimeTokens = {
    bg: string; text: string; accent: string; headerBg: string; headerText: string;
    tableBg: string; tableHeader: string; tableHeaderText: string;
    borderColor: string; totalBg: string; totalText: string;
    deco: string; isDark: boolean;
  };

  const tokenMap: Record<string, AnimeTokens> = {
    ink:     { bg:'#ffffff', text:'#111111', accent:'#c0392b', headerBg:'#111111', headerText:'#ffffff', tableBg:'#f7f7f7', tableHeader:'#111111', tableHeaderText:'#ffffff', borderColor:'#222222', totalBg:'#111111', totalText:'#ffffff', deco:'◆', isDark:false },
    flame:   { bg:'#fff5f5', text:'#1a0000', accent:'#e53e3e', headerBg:'#c53030', headerText:'#fff', tableBg:'#fff0f0', tableHeader:'#c53030', tableHeaderText:'#fff', borderColor:'#feb2b2', totalBg:'#c53030', totalText:'#fff', deco:'🔥', isDark:false },
    energy:  { bg:'#f0f8ff', text:'#1a2040', accent:'#2b6cb0', headerBg:'#2c5282', headerText:'#fff', tableBg:'#ebf8ff', tableHeader:'#2c5282', tableHeaderText:'#fff', borderColor:'#90cdf4', totalBg:'#2c5282', totalText:'#fff', deco:'⚡', isDark:false },
    shadow:  { bg:'#f8f5ff', text:'#2d1b69', accent:'#6b46c1', headerBg:'#553c9a', headerText:'#fff', tableBg:'#f3e8ff', tableHeader:'#553c9a', tableHeaderText:'#fff', borderColor:'#d6bcfa', totalBg:'#553c9a', totalText:'#fff', deco:'★', isDark:false },
    mecha:   { bg:'#f0f4f8', text:'#1a202c', accent:'#2d3748', headerBg:'#1a202c', headerText:'#e2e8f0', tableBg:'#edf2f7', tableHeader:'#2d3748', tableHeaderText:'#e2e8f0', borderColor:'#a0aec0', totalBg:'#1a202c', totalText:'#e2e8f0', deco:'⬡', isDark:false },
    chibi:   { bg:'#fff5f9', text:'#702459', accent:'#d53f8c', headerBg:'#ed64a6', headerText:'#fff', tableBg:'#ffe4f0', tableHeader:'#d53f8c', tableHeaderText:'#fff', borderColor:'#fbb6ce', totalBg:'#d53f8c', totalText:'#fff', deco:'♥', isDark:false },
    idol:    { bg:'#fffff0', text:'#744210', accent:'#d69e2e', headerBg:'#d69e2e', headerText:'#fff', tableBg:'#fefce8', tableHeader:'#b7791f', tableHeaderText:'#fff', borderColor:'#f6e05e', totalBg:'#d69e2e', totalText:'#fff', deco:'✦', isDark:false },
    fantasy: { bg:'#f0fff4', text:'#1c4532', accent:'#276749', headerBg:'#276749', headerText:'#fff', tableBg:'#e6fffa', tableHeader:'#276749', tableHeaderText:'#fff', borderColor:'#9ae6b4', totalBg:'#276749', totalText:'#fff', deco:'✿', isDark:false },
    tokyo:   { bg:'#1a1a2e', text:'#e0e0ff', accent:'#e94560', headerBg:'#16213e', headerText:'#e94560', tableBg:'#0f3460', tableHeader:'#e94560', tableHeaderText:'#fff', borderColor:'#533483', totalBg:'#e94560', totalText:'#fff', deco:'⊕', isDark:true },
    pastel:  { bg:'#fef9ff', text:'#553c7b', accent:'#9f7aea', headerBg:'#e9d8fd', headerText:'#553c7b', tableBg:'#f5f0ff', tableHeader:'#d6bcfa', tableHeaderText:'#553c7b', borderColor:'#d6bcfa', totalBg:'#9f7aea', totalText:'#fff', deco:'✧', isDark:false },
  };

  const t = tokenMap[variant] ?? tokenMap.ink;

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
      <td style="text-align:center;font-weight:700;color:${t.accent}">${idx + 1}</td>
      <td>${escapeHtml(name)}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:center">${escapeHtml(item.unit)}</td>
      <td style="text-align:right">${formatCurrency(item.unitPrice)}</td>
      <td style="text-align:right;font-weight:600">${formatCurrency(item.totalAmount)}</td>
    </tr>`;
  }).join('');

  const lineColor = t.isDark ? `${t.accent}55` : t.borderColor;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Sarabun',sans-serif;font-size:12px;background:${t.bg};color:${t.text}}
  .page{width:794px;min-height:1123px;background:${t.bg}}
  .header{background:${t.headerBg};color:${t.headerText};padding:24px 40px;display:flex;justify-content:space-between;align-items:flex-start}
  .deco-strip{height:4px;background:${t.accent};opacity:0.6}
  .company-name{font-size:16px;font-weight:700;margin-bottom:4px}
  .company-detail{font-size:10px;opacity:0.75;line-height:1.6}
  .deco-badge{font-size:22px;margin-bottom:6px;display:block;text-align:right}
  .doc-title{font-size:20px;font-weight:700;text-align:right;letter-spacing:2px}
  .doc-subtitle{font-size:10px;opacity:0.75;text-align:right;margin-top:2px}
  .doc-meta{text-align:right;font-size:11px;opacity:0.85;margin-top:8px;line-height:1.8}
  .body{padding:22px 40px}
  .bill-box{border:2px solid ${t.accent};border-radius:8px;padding:12px 16px;margin-bottom:18px;background:${t.tableBg}}
  .bill-label{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${t.accent};margin-bottom:5px}
  .buyer-name{font-size:14px;font-weight:700;color:${t.text}}
  .buyer-detail{font-size:10px;opacity:0.65;margin-top:3px;line-height:1.6}
  table{width:100%;border-collapse:collapse;margin-bottom:14px}
  th{background:${t.tableHeader};color:${t.tableHeaderText};padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:0.5px;text-align:left}
  th:first-child{border-radius:6px 0 0 0} th:last-child{border-radius:0 6px 0 0}
  td{padding:7px 10px;border-bottom:1px solid ${lineColor};font-size:11px}
  tr:nth-child(even) td{background:${t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}}
  .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:18px}
  .totals-inner{width:270px;border:2px solid ${t.borderColor};border-radius:8px;overflow:hidden}
  .t-row{display:flex;justify-content:space-between;padding:5px 14px;font-size:11px;border-bottom:1px solid ${lineColor}}
  .t-row.grand{background:${t.totalBg};color:${t.totalText};font-size:14px;font-weight:700;border:none;padding:9px 14px}
  .words{padding:10px 14px;border:1px solid ${t.borderColor};border-radius:6px;font-size:10px;opacity:0.7;margin-bottom:12px}
  .notes{padding:10px 14px;border:1px solid ${t.borderColor};border-radius:6px;font-size:10px;opacity:0.7;margin-bottom:12px}
  .sig-row{display:flex;gap:16px;margin-top:20px}
  .sig-box{flex:1;text-align:center;padding-top:40px;border-top:2px dashed ${t.borderColor};font-size:10px;opacity:0.6}
</style></head><body><div class="page">

<div class="header">
  <div>
    <div class="company-name">${escapeHtml(sellerName)}</div>
    <div class="company-detail">
      ${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.seller.taxId)}<br>
      ${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(sellerBranch)}<br>
      ${escapeHtml(sellerAddr)}
    </div>
  </div>
  <div>
    <span class="deco-badge">${t.deco}</span>
    <div class="doc-title">${isTh ? 'ใบกำกับภาษี' : 'TAX INVOICE'}</div>
    <div class="doc-subtitle">${isTh ? 'TAX INVOICE / ใบเสร็จรับเงิน' : 'ใบกำกับภาษี'}</div>
    <div class="doc-meta">
      ${isTh ? 'เลขที่' : 'No.'}: <strong>${escapeHtml(data.invoiceNumber)}</strong><br>
      ${isTh ? 'วันที่' : 'Date'}: ${dateStr}<br>
      ${data.dueDate ? `${isTh ? 'ครบกำหนด' : 'Due'}: ${dueDateStr}` : ''}
    </div>
  </div>
</div>
<div class="deco-strip"></div>

<div class="body">
  <div class="bill-box">
    <div class="bill-label">${t.deco} ${isTh ? 'ผู้ซื้อ / BILL TO' : 'BILL TO / ผู้ซื้อ'}</div>
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

  <div class="sig-row">
    <div class="sig-box">
      ${data.signatureImageUrl ? `<img src="${data.signatureImageUrl}" style="height:36px;margin-bottom:4px" alt="sig"/>` : ''}
      <div>${isTh ? 'ผู้มีอำนาจลงนาม' : 'Authorized Signatory'}</div>
      ${data.signerName ? `<div style="color:${t.accent};font-weight:700;font-size:11px">${escapeHtml(data.signerName ?? '')}</div>` : ''}
      ${data.signerTitle ? `<div style="font-size:10px">${escapeHtml(data.signerTitle ?? '')}</div>` : ''}
    </div>
    <div class="sig-box">
      <div>${isTh ? 'ผู้รับสินค้า' : 'Received by'}</div>
    </div>
    ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? `
    <div class="sig-box">
      <img src="${data.onlineQrDataUrl}" style="width:60px;height:60px;margin-bottom:6px" alt="QR"/>
      <div style="font-size:9px">${isTh ? 'สแกนเพื่อตรวจสอบ' : 'Scan to verify'}</div>
    </div>` : ''}
  </div>
</div>
</div></body></html>`;
}
