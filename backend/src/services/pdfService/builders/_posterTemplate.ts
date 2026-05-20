// Shared rendering helpers for the Dark + Anime poster templates.
// originalDarkArtwork and originalAnimeArtwork generate the SVG hero panel
// for each variant; buildHtmlPosterTemplate assembles the full HTML using
// those plus a token bag passed by the caller.

import { formatDateTh, formatDateEn, formatCurrency, escapeHtml, DOC_TITLE } from '../utils';
import { amountInWordsThai, amountInWordsEnglish } from '../../invoiceService';
import type { PdfInvoiceData } from '../../pdfService';

export type PosterTemplateTokens = {
  group: 'anime' | 'dark';
  bg: string;
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  soft: string;
  border: string;
  headerText: string;
  title: string;
  subtitle: string;
  art: string;
};

export function originalAnimeArtwork(variant: string, accent: string, accent2: string, soft: string, dark = false) {
  const skin = dark ? '#f7d7c4' : '#ffd8c7';
  const hairMap: Record<string, string> = {
    ink: '#111111',
    flame: '#b91c1c',
    energy: '#1d4ed8',
    shadow: '#4c1d95',
    mecha: '#475569',
    chibi: '#ec4899',
    idol: '#d97706',
    fantasy: '#047857',
    tokyo: '#e94560',
    pastel: '#a78bfa',
  };
  const hair = hairMap[variant] ?? accent;
  const aura = dark ? `${accent}55` : `${soft}`;

  return `
    <svg class="poster-art-svg" viewBox="0 0 280 360" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="animeGlow-${variant}" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.45"/>
          <stop offset="58%" stop-color="${accent2}" stop-opacity="0.16"/>
          <stop offset="100%" stop-color="${aura}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="animeHair-${variant}" x1="30" y1="40" x2="230" y2="260">
          <stop offset="0%" stop-color="${hair}"/>
          <stop offset="100%" stop-color="${accent2}"/>
        </linearGradient>
        <linearGradient id="animeSuit-${variant}" x1="70" y1="190" x2="222" y2="344">
          <stop offset="0%" stop-color="${accent2}"/>
          <stop offset="100%" stop-color="${accent}"/>
        </linearGradient>
      </defs>
      <rect width="280" height="360" rx="24" fill="url(#animeGlow-${variant})"/>
      <path d="M28 280 C88 218 185 214 252 276 L252 360 L28 360 Z" fill="url(#animeSuit-${variant})" opacity="0.92"/>
      <path d="M90 225 C105 200 125 188 143 188 C165 188 188 202 200 226 L188 360 L99 360 Z" fill="${dark ? '#111827' : '#ffffff'}" opacity="0.92"/>
      <path d="M68 128 C64 78 98 36 142 36 C192 36 223 82 216 134 C239 155 232 199 202 214 C189 238 166 254 141 254 C114 254 91 238 78 215 C49 199 43 155 68 128 Z" fill="url(#animeHair-${variant})"/>
      <path d="M88 122 C98 74 128 48 165 54 C146 72 145 96 172 117 C152 108 129 108 108 124 C101 129 94 130 88 122 Z" fill="${dark ? '#ffffff' : '#ffffff'}" opacity="0.18"/>
      <ellipse cx="141" cy="151" rx="54" ry="62" fill="${skin}"/>
      <path d="M86 144 C105 116 124 101 151 95 C143 126 120 144 86 144 Z" fill="url(#animeHair-${variant})"/>
      <path d="M128 139 C116 133 104 133 94 141" stroke="${dark ? '#0f172a' : '#111827'}" stroke-width="4" stroke-linecap="round"/>
      <path d="M154 139 C168 132 181 133 191 142" stroke="${dark ? '#0f172a' : '#111827'}" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="111" cy="157" rx="9" ry="13" fill="${accent2}"/>
      <ellipse cx="173" cy="157" rx="9" ry="13" fill="${accent2}"/>
      <circle cx="108" cy="152" r="3" fill="#fff"/>
      <circle cx="170" cy="152" r="3" fill="#fff"/>
      <path d="M130 181 Q141 188 153 181" stroke="#8f4d3d" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M103 207 C128 225 158 225 183 207" stroke="${accent}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M51 103 L35 76 M224 104 L249 77 M46 220 L24 240 M226 224 L254 244" stroke="${accent}" stroke-width="5" stroke-linecap="round" opacity="0.75"/>
      <circle cx="48" cy="74" r="5" fill="${accent}"/>
      <circle cx="238" cy="72" r="5" fill="${accent}"/>
      <circle cx="38" cy="244" r="4" fill="${accent2}"/>
      <circle cx="247" cy="248" r="4" fill="${accent2}"/>
      <text x="140" y="334" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="${dark ? '#ffffff' : accent2}" opacity="0.55">ORIGINAL ART</text>
    </svg>`;
}

export function originalDarkArtwork(variant: string, accent: string, accent2: string) {
  const markMap: Record<string, string> = {
    king: 'CROWN',
    samurai: 'STEEL',
    carbon: 'CARBON',
    wolf: 'MIDNIGHT',
    shadow: 'SHADOW',
    matrix: 'MATRIX',
    graffiti: 'URBAN',
    cyber: 'CYBER',
    gold: 'LUXURY',
    mono: 'MONO',
  };
  const mark = markMap[variant] ?? 'DARK';

  return `
    <svg class="poster-art-svg" viewBox="0 0 280 360" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="darkPanel-${variant}" x1="20" y1="0" x2="260" y2="360">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.46"/>
          <stop offset="48%" stop-color="${accent2}" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </linearGradient>
        <pattern id="grid-${variant}" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="${accent}" stroke-opacity="0.18" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="280" height="360" rx="22" fill="url(#darkPanel-${variant})"/>
      <rect x="18" y="18" width="244" height="324" rx="18" fill="url(#grid-${variant})"/>
      <path d="M55 260 C92 168 181 138 238 58" stroke="${accent}" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
      <path d="M45 104 L116 55 L188 92 L236 48" stroke="${accent2}" stroke-width="3" fill="none" opacity="0.85"/>
      <circle cx="116" cy="55" r="8" fill="${accent}"/>
      <circle cx="188" cy="92" r="7" fill="${accent2}"/>
      <path d="M92 218 L140 124 L188 218 Z" fill="none" stroke="${accent}" stroke-width="5" opacity="0.85"/>
      <path d="M115 202 L140 154 L165 202 Z" fill="${accent}" opacity="0.18"/>
      <text x="140" y="292" text-anchor="middle" font-family="Rajdhani, Arial, sans-serif" font-size="31" font-weight="800" fill="${accent}" letter-spacing="3">${mark}</text>
      <text x="140" y="318" text-anchor="middle" font-family="Rajdhani, Arial, sans-serif" font-size="11" font-weight="700" fill="#ffffff" opacity="0.56" letter-spacing="4">TAX INVOICE</text>
    </svg>`;
}

export function buildHtmlPosterTemplate(data: PdfInvoiceData, tokens: PosterTemplateTokens): string {
  const isTh = data.language !== 'en';
  const isBoth = data.language === 'both';
  const docTitle = DOC_TITLE[data.type]?.[data.language] ?? 'ใบกำกับภาษี';
  const dateStr = isTh ? formatDateTh(data.invoiceDate) : formatDateEn(data.invoiceDate);
  const dueStr = data.dueDate ? (isTh ? formatDateTh(data.dueDate) : formatDateEn(data.dueDate)) : '';
  const totalWords = isTh
    ? amountInWordsThai(data.total)
    : amountInWordsEnglish(data.total);
  const sellerName = isTh ? data.seller.nameTh : (data.seller.nameEn ?? data.seller.nameTh);
  const sellerAddr = isTh ? data.seller.addressTh : (data.seller.addressEn ?? data.seller.addressTh);
  const buyerName = isTh ? data.buyer.nameTh : (data.buyer.nameEn ?? data.buyer.nameTh);
  const buyerAddr = isTh ? data.buyer.addressTh : (data.buyer.addressEn ?? data.buyer.addressTh);
  const sellerBranch = data.seller.branchCode === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.seller.branchCode;
  const buyerBranch = data.buyer.branchCode === '00000' ? (isTh ? 'สำนักงานใหญ่' : 'Head Office') : data.buyer.branchCode;
  const isDark = tokens.group === 'dark';

  const itemRows = data.items.map((item, idx) => {
    const name = isTh ? item.nameTh : (item.nameEn ?? item.nameTh);
    return `<tr>
      <td class="center">${idx + 1}</td>
      <td><strong>${escapeHtml(name)}</strong>${isBoth && item.nameEn ? `<span>${escapeHtml(item.nameEn)}</span>` : ''}</td>
      <td class="center">${item.quantity}</td>
      <td class="center">${escapeHtml(item.unit)}</td>
      <td class="right">${formatCurrency(item.unitPrice)}</td>
      <td class="center">${item.vatType === 'vatExempt' ? (isTh ? 'ยกเว้น' : 'Exempt') : item.vatType === 'vatZero' ? '0%' : '7%'}</td>
      <td class="right strong">${formatCurrency(item.totalAmount)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="${isTh ? 'th' : 'en'}"><head><meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Sarabun',sans-serif;background:${tokens.bg};color:${tokens.ink};font-size:12px}
  .page{width:794px;min-height:1123px;background:${tokens.paper};position:relative;overflow:hidden}
  .page::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 82px 86px,${tokens.accent}2e,transparent 190px),radial-gradient(circle at 690px 1040px,${tokens.accent2}28,transparent 220px);pointer-events:none}
  .shell{position:relative;z-index:1;min-height:1123px;padding:26px 32px 24px}
  .hero{display:grid;grid-template-columns:minmax(0,1fr) 246px;gap:22px;align-items:stretch;margin-bottom:18px}
  .hero-main{border:1px solid ${tokens.border};border-radius:20px;background:${isDark ? '#080b12' : '#ffffff'};overflow:hidden;box-shadow:0 18px 48px rgba(15,23,42,.10)}
  .hero-top{background:${tokens.accent2};color:${tokens.headerText};padding:20px 22px;display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
  .seller-lockup{display:flex;gap:13px;align-items:flex-start;min-width:0}
  .logo-img{width:58px;height:58px;object-fit:contain;border-radius:12px;background:rgba(255,255,255,.14);padding:7px;flex:0 0 auto}
  .eyebrow{font-size:9px;letter-spacing:.16em;text-transform:uppercase;font-weight:800;opacity:.68;margin-bottom:5px}
  .company-name{font-size:18px;line-height:1.25;font-weight:800;color:${tokens.headerText}}
  .company-detail{margin-top:6px;font-size:10.5px;line-height:1.62;opacity:.82}
  .doc-head{text-align:right;min-width:196px}
  .doc-title{font-size:24px;line-height:1.15;font-weight:800;color:${tokens.headerText}}
  .doc-subtitle{font-family:'Rajdhani',sans-serif;font-size:13px;letter-spacing:.18em;text-transform:uppercase;opacity:.75;margin-top:4px}
  .copy-pill{display:inline-block;margin-top:8px;border:1px solid currentColor;border-radius:999px;padding:2px 9px;font-size:10px;font-weight:800;letter-spacing:.08em}
  .meta-strip{display:grid;grid-template-columns:repeat(3,1fr);background:${tokens.soft};border-top:1px solid ${tokens.border}}
  .meta-cell{padding:10px 14px;border-right:1px solid ${tokens.border};min-height:54px}
  .meta-cell:last-child{border-right:none}
  .meta-label{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:${tokens.muted};font-weight:800}
  .meta-value{font-size:11.5px;font-weight:800;color:${tokens.ink};margin-top:3px;word-break:break-word}
  .poster-panel{border-radius:22px;overflow:hidden;position:relative;min-height:270px;background:${tokens.bg};box-shadow:0 18px 48px rgba(0,0,0,.22)}
  .poster-art-svg{width:100%;height:100%;display:block}
  .party-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
  .party-card{border:1px solid ${tokens.border};border-radius:14px;background:${isDark ? '#0d111a' : '#fff'};padding:13px 15px;min-height:112px}
  .party-card.buyer{background:${tokens.soft}}
  .section-label{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:${tokens.accent};margin-bottom:7px}
  .party-name{font-size:13.5px;font-weight:800;color:${tokens.ink};line-height:1.35;margin-bottom:5px}
  .party-detail{font-size:10.5px;line-height:1.62;color:${tokens.muted}}
  .items{border:1px solid ${tokens.border};border-radius:15px;overflow:hidden;background:${isDark ? '#0b1018' : '#fff'};margin-bottom:15px}
  .items-header{display:flex;justify-content:space-between;padding:10px 13px;background:${tokens.soft};border-bottom:1px solid ${tokens.border}}
  .items-header strong{color:${tokens.accent2};font-size:12px}
  .items-header span{color:${tokens.muted};font-size:10px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th{background:${tokens.accent2};color:${tokens.headerText};padding:8px 6px;font-size:9.5px;font-weight:800;text-align:left}
  td{padding:8px 6px;border-bottom:1px solid ${tokens.border};font-size:10.8px;line-height:1.44;color:${tokens.ink};vertical-align:top}
  tr:nth-child(even) td{background:${isDark ? 'rgba(255,255,255,.035)' : 'rgba(15,23,42,.025)'}}
  tr:last-child td{border-bottom:none}
  td span{display:block;color:${tokens.muted};font-size:9.5px;margin-top:2px}
  .center{text-align:center}.right{text-align:right}.strong{font-weight:800;color:${tokens.accent}}
  .summary{display:grid;grid-template-columns:1fr 292px;gap:15px;align-items:start}
  .info-stack{display:grid;gap:10px}
  .info-box,.total-box{border:1px solid ${tokens.border};border-radius:14px;background:${isDark ? '#0d111a' : '#fff'};overflow:hidden}
  .info-box{padding:12px 14px}
  .info-text{font-size:11px;line-height:1.64;color:${tokens.ink};white-space:pre-line}
  .total-title{padding:11px 14px;background:${tokens.soft};border-bottom:1px solid ${tokens.border};font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:${tokens.accent2}}
  .total-row{display:grid;grid-template-columns:1fr auto;gap:10px;padding:9px 14px;border-bottom:1px solid ${tokens.border};font-size:11.5px;color:${tokens.muted}}
  .total-row strong{color:${tokens.ink};font-weight:800}
  .total-row.grand{background:${tokens.accent2};color:${tokens.headerText};border-bottom:none;padding:12px 14px}
  .total-row.grand strong{color:${tokens.headerText};font-size:15px}
  .support{display:grid;grid-template-columns:1fr 1fr ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? '126px' : '0'};gap:12px;margin-top:16px}
  .sig,.qr{border:1px solid ${tokens.border};border-radius:14px;background:${isDark ? '#0d111a' : '#fff'};padding:11px;text-align:center;min-height:106px}
  .sig-space{height:42px;display:flex;align-items:center;justify-content:center}.sig-image{max-height:40px;max-width:150px;object-fit:contain}
  .sig-line{border-top:1px solid ${tokens.border};width:72%;margin:6px auto 7px}.sig-label{font-size:10.5px;color:${tokens.muted};line-height:1.35}.sig-name{margin-top:4px;color:${tokens.accent};font-weight:800;font-size:10.5px}
  .qr{display:${data.documentMode === 'electronic' && data.onlineQrDataUrl ? 'block' : 'none'}}.qr img{width:68px;height:68px;object-fit:contain;background:#fff;border-radius:8px;padding:4px}.qr-label{font-size:9.5px;color:${tokens.muted};margin-top:5px}
  .footer{display:flex;justify-content:space-between;gap:12px;margin-top:13px;padding-top:10px;border-top:1px solid ${tokens.border};font-size:10px;color:${tokens.muted};line-height:1.45}
  @media print{body{background:${tokens.paper}}}
</style></head><body><div class="page"><div class="shell">
  <div class="hero">
    <div class="hero-main">
      <div class="hero-top">
        <div class="seller-lockup">
          ${data.showCompanyLogo !== false && data.seller.logoUrl ? `<img class="logo-img" src="${data.seller.logoUrl}" alt="logo"/>` : ''}
          <div><div class="eyebrow">${isTh ? 'ผู้ขาย' : 'Seller'}</div><div class="company-name">${escapeHtml(sellerName)}</div><div class="company-detail">${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: ${escapeHtml(data.seller.taxId)}<br/>${isTh ? 'สาขา' : 'Branch'}: ${escapeHtml(sellerBranch)}<br/>${escapeHtml(sellerAddr)}</div></div>
        </div>
        <div class="doc-head"><div class="doc-title">${escapeHtml(docTitle)}</div><div class="doc-subtitle">${tokens.subtitle}</div><div class="copy-pill">${isTh ? 'ต้นฉบับ' : 'ORIGINAL'}</div></div>
      </div>
      <div class="meta-strip">
        <div class="meta-cell"><div class="meta-label">${isTh ? 'เลขที่' : 'No.'}</div><div class="meta-value">${escapeHtml(data.invoiceNumber)}</div></div>
        <div class="meta-cell"><div class="meta-label">${isTh ? 'วันที่' : 'Date'}</div><div class="meta-value">${escapeHtml(dateStr)}</div></div>
        <div class="meta-cell"><div class="meta-label">${isTh ? 'ครบกำหนด' : 'Due'}</div><div class="meta-value">${escapeHtml(dueStr || '-')}</div></div>
      </div>
    </div>
    <div class="poster-panel">${tokens.art}</div>
  </div>

  <div class="party-grid">
    <div class="party-card"><div class="section-label">${isTh ? 'ผู้ขาย / Seller' : 'Seller'}</div><div class="party-name">${escapeHtml(sellerName)}</div><div class="party-detail">${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: <strong>${escapeHtml(data.seller.taxId)}</strong><br/>${isTh ? 'สาขา' : 'Branch'}: <strong>${escapeHtml(sellerBranch)}</strong><br/>${escapeHtml(sellerAddr)}</div></div>
    <div class="party-card buyer"><div class="section-label">${isTh ? 'ผู้ซื้อ / Bill To' : 'Bill To'}</div><div class="party-name">${escapeHtml(buyerName)}</div><div class="party-detail">${isTh ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: <strong>${escapeHtml(data.buyer.taxId)}</strong><br/>${isTh ? 'สาขา' : 'Branch'}: <strong>${escapeHtml(buyerBranch)}</strong><br/>${escapeHtml(buyerAddr)}</div></div>
  </div>

  <div class="items"><div class="items-header"><strong>${isTh ? 'รายการสินค้า/บริการ' : 'Items'}</strong><span>${data.items.length} ${isTh ? 'รายการ' : 'items'}</span></div><table><thead><tr>
    <th style="width:36px;text-align:center">${isTh ? 'ลำดับ' : 'No.'}</th><th>${isTh ? 'รายการ' : 'Description'}</th><th style="width:48px;text-align:center">${isTh ? 'จำนวน' : 'Qty'}</th><th style="width:48px;text-align:center">${isTh ? 'หน่วย' : 'Unit'}</th><th style="width:82px;text-align:right">${isTh ? 'ราคา/หน่วย' : 'Unit Price'}</th><th style="width:46px;text-align:center">VAT</th><th style="width:92px;text-align:right">${isTh ? 'รวม' : 'Total'}</th>
  </tr></thead><tbody>${itemRows}</tbody></table></div>

  <div class="summary">
    <div class="info-stack">
      <div class="info-box"><div class="section-label">${isTh ? 'จำนวนเงินเป็นตัวอักษร' : 'Amount in Words'}</div><div class="info-text"><strong>${escapeHtml(totalWords)}</strong></div></div>
      ${data.notes ? `<div class="info-box"><div class="section-label">${isTh ? 'หมายเหตุ' : 'Notes'}</div><div class="info-text">${escapeHtml(data.notes)}</div></div>` : ''}
      ${data.bankPaymentInfo ? `<div class="info-box"><div class="section-label">${isTh ? 'ช่องทางชำระเงิน' : 'Payment Details'}</div><div class="info-text">${escapeHtml(data.bankPaymentInfo)}</div></div>` : ''}
    </div>
    <div class="total-box"><div class="total-title">${isTh ? 'สรุปยอด' : 'Summary'}</div><div class="total-row"><span>${isTh ? 'ยอดก่อน VAT' : 'Subtotal'}</span><strong>${formatCurrency(data.subtotal)} THB</strong></div><div class="total-row"><span>${isTh ? 'ภาษีมูลค่าเพิ่ม 7%' : 'VAT 7%'}</span><strong>${formatCurrency(data.vatAmount)} THB</strong></div><div class="total-row grand"><span>${isTh ? 'ยอดรวมสุทธิ' : 'Grand Total'}</span><strong>${formatCurrency(data.total)} THB</strong></div></div>
  </div>

  <div class="support">
    <div class="sig"><div class="sig-space">${data.signatureImageUrl ? `<img class="sig-image" src="${data.signatureImageUrl}" alt="signature"/>` : ''}</div><div class="sig-line"></div><div class="sig-label">${isTh ? 'ผู้จัดทำ / ผู้ออกเอกสาร' : 'Prepared by / Issuer'}</div>${(data.signerName || data.signerTitle) ? `<div class="sig-name">${escapeHtml([data.signerName, data.signerTitle].filter(Boolean).join(' · '))}</div>` : ''}</div>
    <div class="sig"><div class="sig-space"></div><div class="sig-line"></div><div class="sig-label">${isTh ? 'ผู้รับสินค้า / ลูกค้า' : 'Received by / Customer'}</div></div>
    ${data.documentMode === 'electronic' && data.onlineQrDataUrl ? `<div class="qr"><img src="${data.onlineQrDataUrl}" alt="QR"/><div class="qr-label">${isTh ? 'สแกนตรวจสอบ' : 'Scan to verify'}</div></div>` : ''}
  </div>
  <div class="footer"><div>${data.documentMode === 'electronic' ? (isTh ? 'เอกสารอิเล็กทรอนิกส์ตามรูปแบบ e-Tax' : 'Electronic e-Tax document') : (isTh ? 'เอกสารฉบับปกติ' : 'Ordinary document')}</div><div>${escapeHtml(docTitle)} · ${escapeHtml(data.invoiceNumber)}</div></div>
</div></div></body></html>`;
}

