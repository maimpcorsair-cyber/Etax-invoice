// Shared formatting helpers for the PDF builders. Extracted from
// pdfService.ts so individual template builders can be moved to
// per-variant files without each one having to duplicate or re-implement
// these primitives.

export type Language = 'th' | 'en' | 'both';

export function formatDateTh(date: Date): string {
  const buddhistYear = date.getFullYear() + 543;
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  return `${date.getDate()} ${months[date.getMonth()]} ${buddhistYear}`;
}

export function formatDateEn(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Document type / built-in template registry ───────────────────────

export const DOC_TITLE: Record<string, Record<Language | 'both', string>> = {
  tax_invoice: { th: 'ใบกำกับภาษี', en: 'Tax Invoice', both: 'ใบกำกับภาษี / Tax Invoice' },
  tax_invoice_receipt: { th: 'ใบกำกับภาษี/ใบเสร็จรับเงิน', en: 'Tax Invoice / Receipt', both: 'ใบกำกับภาษี/ใบเสร็จรับเงิน / Tax Invoice / Receipt' },
  receipt: { th: 'ใบเสร็จรับเงิน', en: 'Receipt', both: 'ใบเสร็จรับเงิน / Receipt' },
  credit_note: { th: 'ใบลดหนี้', en: 'Credit Note', both: 'ใบลดหนี้ / Credit Note' },
  debit_note: { th: 'ใบเพิ่มหนี้', en: 'Debit Note', both: 'ใบเพิ่มหนี้ / Debit Note' },
};

export const ALL_DOCUMENT_TYPES = ['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note'];

export const BUILTIN_DOCUMENT_TEMPLATES: Record<string, {
  name: string;
  supportedTypes: string[];
}> = {
  'builtin:simple-slate': { name: 'เรียบง่าย', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:official-navy': { name: 'ทางการ', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:luxury-gold': { name: 'หรูหรา', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:local-friendly': { name: 'ชาวบ้าน อ่านง่าย', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:accounting-green': { name: 'บัญชีเขียว', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:soft-cyan': { name: 'ทันสมัย', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:executive-blue': { name: 'ทางการ', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:paid-stamp': { name: 'บัญชีเขียว', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:bank-transfer': { name: 'ทันสมัย', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:modern-minimal': { name: 'เรียบง่าย', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:credit-control': { name: 'ทางการ', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:debit-adjustment': { name: 'ทางการ', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:compliance-ledger': { name: 'ทางการ', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-white': { name: 'Minimal White', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-gray': { name: 'Minimal Gray', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-light-gray': { name: 'Minimal Light Gray', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-line': { name: 'Minimal Line', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-mint': { name: 'Minimal Mint', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-beige': { name: 'Minimal Beige', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-dark-accent': { name: 'Minimal Dark Accent', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-sans': { name: 'Minimal Sans', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-space': { name: 'Minimal Space', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:minimal-fine-line': { name: 'Minimal Fine Line', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-pink':   { name: 'Cute Pink',   supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-blue':   { name: 'Cute Blue',   supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-yellow': { name: 'Cute Yellow', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-green':  { name: 'Cute Green',  supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-kawaii': { name: 'Cute Kawaii', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-pastel-pink': { name: 'Cute Pastel Pink', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-baby-blue': { name: 'Cute Baby Blue', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-soft-green': { name: 'Cute Soft Green', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-yellow-sunshine': { name: 'Cute Yellow Sunshine', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:cute-lovely-purple': { name: 'Cute Lovely Purple', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-blue-modern':   { name: 'Pro สีน้ำเงิน',    supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-bw':            { name: 'Pro ขาวดำ',        supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-navy':          { name: 'Pro กรมท่า',       supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-soft-pastel':   { name: 'Pro พาสเทล',      supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-corp-teal':     { name: 'Pro เขียวน้ำ',    supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-elegant-beige': { name: 'Pro เบจ',          supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-green-eco':     { name: 'Pro เขียว Eco',   supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-gradient':      { name: 'Pro Gradient',     supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-classic-orange':{ name: 'Pro ส้มคลาสสิก', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:pro-biz-clean':     { name: 'Pro สะอาด',       supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:crayon':            { name: 'Crayon Drawing',   supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:dark-king':    { name: 'Dark King',    supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:dark-samurai': { name: 'Dark Samurai', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:dark-carbon':  { name: 'Dark Carbon',  supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:dark-wolf':    { name: 'Dark Wolf',    supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:dark-shadow':  { name: 'Dark Shadow',  supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:dark-matrix':  { name: 'Dark Matrix',  supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:dark-graffiti':{ name: 'Dark Graffiti',supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:dark-cyber':   { name: 'Dark Cyber',   supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:dark-gold':    { name: 'Dark Gold',    supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:dark-mono':    { name: 'Dark Mono',    supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:anime-ink':     { name: 'Anime Ink',     supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:anime-flame':   { name: 'Anime Flame',   supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:anime-energy':  { name: 'Anime Energy',  supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:anime-shadow':  { name: 'Anime Shadow',  supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:anime-mecha':   { name: 'Anime Mecha',   supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:anime-chibi':   { name: 'Anime Chibi',   supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:anime-idol':    { name: 'Anime Idol',    supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:anime-fantasy': { name: 'Anime Fantasy', supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:anime-tokyo':   { name: 'Anime Tokyo',   supportedTypes: ALL_DOCUMENT_TYPES },
  'builtin:anime-pastel':  { name: 'Anime Pastel',  supportedTypes: ALL_DOCUMENT_TYPES },
};

export function resolveBuiltinTemplate(type: string, language: Language, templateId?: string | null) {
  void language;
  if (!templateId?.startsWith('builtin:')) return null;

  const template = BUILTIN_DOCUMENT_TEMPLATES[templateId];
  if (!template || !template.supportedTypes.includes(type)) return null;

  return {
    id: templateId,
    name: template.name,
    html: '',
  };
}

// ── Template rendering helpers ───────────────────────────────────────

export function resolveTemplateLanguageHtml(template: { htmlTh: string; htmlEn: string }, language: Language) {
  if (language === 'en') return template.htmlEn;
  if (language === 'th') return template.htmlTh;
  return `${template.htmlTh}\n${template.htmlEn}`;
}

export function compileTemplateHtml(templateHtml: string, context: Record<string, string>): string {
  return templateHtml.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => context[key] ?? '');
}

// ── Online verify URL + frontend public assets ───────────────────────

export function buildOnlineViewUrl(invoiceNumber: string) {
  const baseUrl = process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'https://etax-invoice.vercel.app';
  return `${baseUrl.replace(/\/$/, '')}/verify/${encodeURIComponent(invoiceNumber)}`;
}

export function frontendPublicAssetUrl(path: string) {
  const baseUrl = process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'https://etax-invoice.vercel.app';
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}
