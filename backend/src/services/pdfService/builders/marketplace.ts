import { DOC_TITLE, escapeHtml, formatCurrency, formatDateEn, formatDateTh, frontendPublicAssetUrl } from '../utils';
import { amountInWordsThai, amountInWordsEnglish } from '../../invoiceService';
import type { PdfInvoiceData } from '../../pdfService';

export type MarketplaceTemplateTokens = {
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

export const MARKETPLACE_TEMPLATE_TOKENS: Record<string, MarketplaceTemplateTokens> = {
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

export function marketplaceDecorSvg(tokens: MarketplaceTemplateTokens) {
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

export type PrintTemplateTone = 'minimal' | 'cute';

export type PrintTemplateLayoutSpec = {
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

export function resolvePrintTemplateLayout(tokens: MarketplaceTemplateTokens): PrintTemplateLayoutSpec {
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

export function renderPrintTemplateOrnaments(tokens: MarketplaceTemplateTokens, layout: PrintTemplateLayoutSpec) {
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

export function buildHtmlGeneratedTemplate(data: PdfInvoiceData, tokens: MarketplaceTemplateTokens): string {
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

export function buildHtmlMarketplace(data: PdfInvoiceData, tokens: MarketplaceTemplateTokens): string {
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
