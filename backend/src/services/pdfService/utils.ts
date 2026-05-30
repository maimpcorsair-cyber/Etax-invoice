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
  quotation: { th: 'ใบเสนอราคา', en: 'Quotation', both: 'ใบเสนอราคา / Quotation' },
  tax_invoice: { th: 'ใบกำกับภาษี', en: 'Tax Invoice', both: 'ใบกำกับภาษี / Tax Invoice' },
  tax_invoice_receipt: { th: 'ใบกำกับภาษี/ใบเสร็จรับเงิน', en: 'Tax Invoice / Receipt', both: 'ใบกำกับภาษี/ใบเสร็จรับเงิน / Tax Invoice / Receipt' },
  receipt: { th: 'ใบเสร็จรับเงิน', en: 'Receipt', both: 'ใบเสร็จรับเงิน / Receipt' },
  credit_note: { th: 'ใบลดหนี้', en: 'Credit Note', both: 'ใบลดหนี้ / Credit Note' },
  debit_note: { th: 'ใบเพิ่มหนี้', en: 'Debit Note', both: 'ใบเพิ่มหนี้ / Debit Note' },
};

export const ALL_DOCUMENT_TYPES = ['quotation', 'tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note'];

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

// ── Document theme map (color + label per built-in template) ─────────

export function resolveDocumentTheme(templateId?: string | null) {
  const themes: Record<string, {
    className: string;
    accent: string;
    accent2: string;
    soft: string;
    ink: string;
    label: string;
    mark: string;
  }> = {
    'builtin:simple-slate': { className: 'theme-minimal', accent: '#475569', accent2: '#1e293b', soft: '#f8fafc', ink: '#111827', label: 'เรียบง่าย', mark: '' },
    'builtin:official-navy': { className: 'theme-official', accent: '#1d4ed8', accent2: '#0f172a', soft: '#eef4ff', ink: '#102044', label: 'ทางการ', mark: '' },
    'builtin:luxury-gold': { className: 'theme-luxury', accent: '#b7791f', accent2: '#17120a', soft: '#fff8e6', ink: '#231a0b', label: 'หรูหรา', mark: '' },
    'builtin:local-friendly': { className: 'theme-local', accent: '#c2410c', accent2: '#7c2d12', soft: '#fff7ed', ink: '#431407', label: 'ชาวบ้าน อ่านง่าย', mark: '' },
    'builtin:accounting-green': { className: 'theme-green', accent: '#059669', accent2: '#064e3b', soft: '#ecfdf5', ink: '#063d2a', label: 'บัญชีเขียว', mark: '' },
    'builtin:soft-cyan': { className: 'theme-cyan', accent: '#0891b2', accent2: '#155e75', soft: '#ecfeff', ink: '#123d4b', label: 'ทันสมัย', mark: '' },
    'builtin:executive-blue': { className: 'theme-executive', accent: '#1d4ed8', accent2: '#0f172a', soft: '#eef4ff', ink: '#102044', label: 'Executive Blue', mark: 'EXECUTIVE' },
    'builtin:paid-stamp': { className: 'theme-paid', accent: '#059669', accent2: '#047857', soft: '#ecfdf5', ink: '#063d2a', label: 'Paid Stamp Receipt', mark: 'PAID' },
    'builtin:bank-transfer': { className: 'theme-transfer', accent: '#0891b2', accent2: '#155e75', soft: '#ecfeff', ink: '#123d4b', label: 'Bank Transfer Ready', mark: 'TRANSFER' },
    'builtin:modern-minimal': { className: 'theme-minimal', accent: '#334155', accent2: '#0f172a', soft: '#f8fafc', ink: '#111827', label: 'Modern Minimal', mark: 'MINIMAL' },
    'builtin:credit-control': { className: 'theme-credit', accent: '#d97706', accent2: '#92400e', soft: '#fffbeb', ink: '#4a2d08', label: 'Credit Control', mark: 'CREDIT' },
    'builtin:debit-adjustment': { className: 'theme-debit', accent: '#e11d48', accent2: '#9f1239', soft: '#fff1f2', ink: '#4c1020', label: 'Debit Adjustment', mark: 'DEBIT' },
    'builtin:compliance-ledger': { className: 'theme-ledger', accent: '#4f46e5', accent2: '#312e81', soft: '#eef2ff', ink: '#1f1b4d', label: 'Compliance Ledger', mark: 'AUDIT' },
    'builtin:minimal-white': { className: 'theme-minimal-white', accent: '#374151', accent2: '#111827', soft: '#f9fafb', ink: '#111827', label: 'Minimal White', mark: '' },
    'builtin:minimal-gray': { className: 'theme-minimal-gray', accent: '#6b7280', accent2: '#374151', soft: '#f3f4f6', ink: '#111827', label: 'Minimal Gray', mark: '' },
    'builtin:minimal-light-gray': { className: 'theme-minimal-light-gray', accent: '#64748b', accent2: '#334155', soft: '#f5f7fa', ink: '#111827', label: 'Minimal Light Gray', mark: '' },
    'builtin:minimal-line': { className: 'theme-minimal-line', accent: '#0d9488', accent2: '#0f766e', soft: '#f0fdfa', ink: '#134e4a', label: 'Minimal Line', mark: '' },
    'builtin:minimal-mint': { className: 'theme-minimal-mint', accent: '#34d399', accent2: '#047857', soft: '#ecfdf5', ink: '#064e3b', label: 'Minimal Mint', mark: '' },
    'builtin:minimal-beige': { className: 'theme-minimal-beige', accent: '#b7791f', accent2: '#7c4a03', soft: '#fff8ea', ink: '#3f2b16', label: 'Minimal Beige', mark: '' },
    'builtin:minimal-dark-accent': { className: 'theme-minimal-dark-accent', accent: '#111827', accent2: '#020617', soft: '#f3f4f6', ink: '#111827', label: 'Minimal Dark Accent', mark: '' },
    'builtin:minimal-sans': { className: 'theme-minimal-sans', accent: '#1f2937', accent2: '#111827', soft: '#f9fafb', ink: '#111827', label: 'Minimal Sans', mark: '' },
    'builtin:minimal-space': { className: 'theme-minimal-space', accent: '#94a3b8', accent2: '#475569', soft: '#f8fafc', ink: '#1e293b', label: 'Minimal Space', mark: '' },
    'builtin:cute-pink':   { className: 'theme-cute-pink',   accent: '#f472b6', accent2: '#be185d', soft: '#fdf2f8', ink: '#831843', label: 'Cute Pink',   mark: '' },
    'builtin:cute-blue':   { className: 'theme-cute-blue',   accent: '#60a5fa', accent2: '#1d4ed8', soft: '#eff6ff', ink: '#1e3a5f', label: 'Cute Blue',   mark: '' },
    'builtin:cute-yellow': { className: 'theme-cute-yellow', accent: '#fbbf24', accent2: '#d97706', soft: '#fffbeb', ink: '#78350f', label: 'Cute Yellow', mark: '' },
    'builtin:cute-green':  { className: 'theme-cute-green',  accent: '#34d399', accent2: '#059669', soft: '#ecfdf5', ink: '#064e3b', label: 'Cute Green',  mark: '' },
    'builtin:cute-kawaii': { className: 'theme-cute-kawaii', accent: '#a78bfa', accent2: '#7c3aed', soft: '#f5f3ff', ink: '#4c1d95', label: 'Cute Kawaii', mark: '' },
    'builtin:pro-blue-modern':   { className: 'theme-pro-blue-modern',   accent: '#1e40af', accent2: '#1e3a8a', soft: '#dbeafe', ink: '#1e40af', label: 'Pro สีน้ำเงิน',    mark: '' },
    'builtin:pro-bw':            { className: 'theme-pro-bw',            accent: '#111827', accent2: '#111827', soft: '#f3f4f6', ink: '#111827', label: 'Pro ขาวดำ',        mark: '' },
    'builtin:pro-navy':          { className: 'theme-pro-navy',          accent: '#1e3a5f', accent2: '#1e3a5f', soft: '#e8edf5', ink: '#1e3a5f', label: 'Pro กรมท่า',       mark: '' },
    'builtin:pro-soft-pastel':   { className: 'theme-pro-soft-pastel',   accent: '#7c3aed', accent2: '#4c1d95', soft: '#f5f3ff', ink: '#7c3aed', label: 'Pro พาสเทล',      mark: '' },
    'builtin:pro-corp-teal':     { className: 'theme-pro-corp-teal',     accent: '#0f766e', accent2: '#0f766e', soft: '#ccfbf1', ink: '#0f766e', label: 'Pro เขียวน้ำ',    mark: '' },
    'builtin:pro-elegant-beige': { className: 'theme-pro-elegant-beige', accent: '#92400e', accent2: '#92400e', soft: '#fffbeb', ink: '#92400e', label: 'Pro เบจ',          mark: '' },
    'builtin:pro-green-eco':     { className: 'theme-pro-green-eco',     accent: '#166534', accent2: '#166534', soft: '#dcfce7', ink: '#166534', label: 'Pro เขียว Eco',   mark: '' },
    'builtin:pro-gradient':      { className: 'theme-pro-gradient',      accent: '#7c3aed', accent2: '#1e40af', soft: '#ede9fe', ink: '#7c3aed', label: 'Pro Gradient',     mark: '' },
    'builtin:pro-classic-orange':{ className: 'theme-pro-classic-orange',accent: '#c2410c', accent2: '#c2410c', soft: '#ffedd5', ink: '#c2410c', label: 'Pro ส้มคลาสสิก', mark: '' },
    'builtin:pro-biz-clean':     { className: 'theme-pro-biz-clean',     accent: '#334155', accent2: '#334155', soft: '#f1f5f9', ink: '#334155', label: 'Pro สะอาด',       mark: '' },
    'builtin:crayon':            { className: 'theme-crayon', accent: '#f43f5e', accent2: '#8b5cf6', soft: '#fff7f0', ink: '#1a1a2e', label: 'Crayon', mark: '✏️' },
    'builtin:dark-king':    { className: 'theme-dark-king',    accent: '#d4af37', accent2: '#b8960a', soft: '#111111', ink: '#ffffff', label: 'Dark King',    mark: '♛' },
    'builtin:dark-samurai': { className: 'theme-dark-samurai', accent: '#c0392b', accent2: '#922b21', soft: '#111111', ink: '#e8e8e8', label: 'Dark Samurai', mark: '⚔' },
    'builtin:dark-carbon':  { className: 'theme-dark-carbon',  accent: '#00bcd4', accent2: '#008fa1', soft: '#0f1f22', ink: '#cccccc', label: 'Dark Carbon',  mark: '◈' },
    'builtin:dark-wolf':    { className: 'theme-dark-wolf',    accent: '#7c8db5', accent2: '#5a6d95', soft: '#0d1020', ink: '#d0d4e0', label: 'Dark Wolf',    mark: '◆' },
    'builtin:dark-shadow':  { className: 'theme-dark-shadow',  accent: '#6c3483', accent2: '#512e75', soft: '#0f0018', ink: '#cccccc', label: 'Dark Shadow',  mark: '▲' },
    'builtin:dark-matrix':  { className: 'theme-dark-matrix',  accent: '#00ff41', accent2: '#00cc33', soft: '#001500', ink: '#00ff41', label: 'Dark Matrix',  mark: '▶' },
    'builtin:dark-graffiti':{ className: 'theme-dark-graffiti',accent: '#ff6b35', accent2: '#e05520', soft: '#151515', ink: '#ffffff', label: 'Dark Graffiti', mark: '★' },
    'builtin:dark-cyber':   { className: 'theme-dark-cyber',   accent: '#00f5ff', accent2: '#00c4cc', soft: '#080020', ink: '#e0e0ff', label: 'Dark Cyber',   mark: '⬡' },
    'builtin:dark-gold':    { className: 'theme-dark-gold',    accent: '#ffd700', accent2: '#ccac00', soft: '#0f0d00', ink: '#f0e0a0', label: 'Dark Gold',    mark: '✦' },
    'builtin:dark-mono':    { className: 'theme-dark-mono',    accent: '#ffffff', accent2: '#cccccc', soft: '#151515', ink: '#e0e0e0', label: 'Dark Mono',    mark: '■' },
    'builtin:anime-ink':     { className: 'theme-anime-ink',     accent: '#1a1a1a', accent2: '#333333', soft: '#f5f5f5', ink: '#111111', label: 'Anime Ink',     mark: '◼' },
    'builtin:anime-flame':   { className: 'theme-anime-flame',   accent: '#e53e3e', accent2: '#c53030', soft: '#fff5f5', ink: '#1a0000', label: 'Anime Flame',   mark: '🔥' },
    'builtin:anime-energy':  { className: 'theme-anime-energy',  accent: '#2b6cb0', accent2: '#2c5282', soft: '#ebf8ff', ink: '#1a2040', label: 'Anime Energy',  mark: '⚡' },
    'builtin:anime-shadow':  { className: 'theme-anime-shadow',  accent: '#6b46c1', accent2: '#553c9a', soft: '#f3e8ff', ink: '#2d1b69', label: 'Anime Shadow',  mark: '◆' },
    'builtin:anime-mecha':   { className: 'theme-anime-mecha',   accent: '#2d3748', accent2: '#1a202c', soft: '#edf2f7', ink: '#1a202c', label: 'Anime Mecha',   mark: '⚙' },
    'builtin:anime-chibi':   { className: 'theme-anime-chibi',   accent: '#d53f8c', accent2: '#b83280', soft: '#fed7e2', ink: '#702459', label: 'Anime Chibi',   mark: '★' },
    'builtin:anime-idol':    { className: 'theme-anime-idol',    accent: '#d69e2e', accent2: '#b7791f', soft: '#fefce8', ink: '#744210', label: 'Anime Idol',    mark: '✦' },
    'builtin:anime-fantasy': { className: 'theme-anime-fantasy', accent: '#276749', accent2: '#1c4532', soft: '#e6fffa', ink: '#1c4532', label: 'Anime Fantasy', mark: '✿' },
    'builtin:anime-tokyo':   { className: 'theme-anime-tokyo',   accent: '#e94560', accent2: '#c73652', soft: '#0f3460', ink: '#e0e0ff', label: 'Anime Tokyo',   mark: '◈' },
    'builtin:anime-pastel':  { className: 'theme-anime-pastel',  accent: '#b794f4', accent2: '#9f7aea', soft: '#f5f0ff', ink: '#553c7b', label: 'Anime Pastel',  mark: '♡' },
  };

  return themes[templateId ?? ''] ?? { className: 'theme-standard', accent: '#1e3a8a', accent2: '#2563eb', soft: '#f2f6fd', ink: '#15254b', label: 'System Standard', mark: 'STANDARD' };
}
