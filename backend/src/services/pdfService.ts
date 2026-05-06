import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import { amountInWordsThai, amountInWordsEnglish } from './invoiceService';
import { logger } from '../config/logger';
import prisma from '../config/database';

type Language = 'th' | 'en' | 'both';

interface PdfInvoiceData {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date | null;
  type: string;
  language: Language;
  seller: {
    nameTh: string;
    nameEn?: string | null;
    taxId: string;
    branchCode: string;
    branchNameTh?: string | null;
    addressTh: string;
    addressEn?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    logoUrl?: string | null;
  };
  buyer: {
    nameTh: string;
    nameEn?: string | null;
    taxId: string;
    branchCode: string;
    addressTh: string;
    addressEn?: string | null;
  };
  items: {
    nameTh: string;
    nameEn?: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    discount: number;
    vatType: string;
    amount: number;
    vatAmount: number;
    totalAmount: number;
  }[];
  subtotal: number;
  vatAmount: number;
  discount: number;
  total: number;
  notes?: string | null;
  paymentMethod?: string | null;
  documentLogoUrl?: string | null;
  showCompanyLogo?: boolean;
  templateId?: string | null;
  templateName?: string | null;
  templateHtml?: string | null;
  templateNote?: string | null;
  documentMode?: 'ordinary' | 'electronic' | null;
  bankPaymentInfo?: string | null;
  signatureImageUrl?: string | null;
  signerName?: string | null;
  signerTitle?: string | null;
  onlineViewUrl?: string | null;
  onlineQrDataUrl?: string | null;
}

interface CustomerStatementPdfData {
  language: Language;
  companyName: string;
  customer: {
    nameTh: string;
    nameEn?: string | null;
    taxId: string;
    addressTh?: string | null;
    addressEn?: string | null;
    email?: string | null;
  };
  generatedAt: Date;
  summary: {
    totalOutstanding: number;
    overdueOutstanding: number;
    currentOutstanding: number;
    totalBilled: number;
    totalCredits: number;
    totalReceived: number;
  };
  aging: {
    current: number;
    days1To30: number;
    days31To60: number;
    days61To90: number;
    days90Plus: number;
  };
  entries: Array<{
    invoiceNumber: string;
    type: string;
    status: string;
    invoiceDate: Date;
    dueDate?: Date | null;
    signedTotal: number;
    paidAmount: number;
    outstandingAmount: number;
    runningBalance: number;
    ageDays: number;
  }>;
}

const DOC_TITLE: Record<string, Record<Language | 'both', string>> = {
  tax_invoice: { th: 'ใบกำกับภาษี', en: 'Tax Invoice', both: 'ใบกำกับภาษี / Tax Invoice' },
  tax_invoice_receipt: { th: 'ใบกำกับภาษี/ใบเสร็จรับเงิน', en: 'Tax Invoice / Receipt', both: 'ใบกำกับภาษี/ใบเสร็จรับเงิน / Tax Invoice / Receipt' },
  receipt: { th: 'ใบเสร็จรับเงิน', en: 'Receipt', both: 'ใบเสร็จรับเงิน / Receipt' },
  credit_note: { th: 'ใบลดหนี้', en: 'Credit Note', both: 'ใบลดหนี้ / Credit Note' },
  debit_note: { th: 'ใบเพิ่มหนี้', en: 'Debit Note', both: 'ใบเพิ่มหนี้ / Debit Note' },
};

const ALL_DOCUMENT_TYPES = ['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note'];

const BUILTIN_DOCUMENT_TEMPLATES: Record<string, {
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

function formatDateTh(date: Date): string {
  const buddhistYear = date.getFullYear() + 543;
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  return `${date.getDate()} ${months[date.getMonth()]} ${buddhistYear}`;
}

function formatDateEn(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveTemplateLanguageHtml(template: { htmlTh: string; htmlEn: string }, language: Language) {
  if (language === 'en') return template.htmlEn;
  if (language === 'th') return template.htmlTh;
  return `${template.htmlTh}\n${template.htmlEn}`;
}

function resolveBuiltinTemplate(type: string, language: Language, templateId?: string | null) {
  if (!templateId?.startsWith('builtin:')) return null;

  const template = BUILTIN_DOCUMENT_TEMPLATES[templateId];
  if (!template || !template.supportedTypes.includes(type)) return null;

  return {
    id: templateId,
    name: template.name,
    html: '',
  };
}

function compileTemplateHtml(templateHtml: string, context: Record<string, string>): string {
  return templateHtml.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => context[key] ?? '');
}

function resolveDocumentTheme(templateId?: string | null) {
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

function buildOnlineViewUrl(invoiceNumber: string) {
  const baseUrl = process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'https://etax-invoice.vercel.app';
  return `${baseUrl.replace(/\/$/, '')}/verify/${encodeURIComponent(invoiceNumber)}`;
}

function frontendPublicAssetUrl(path: string) {
  const baseUrl = process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'https://etax-invoice.vercel.app';
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

async function enrichElectronicDocument(data: PdfInvoiceData): Promise<PdfInvoiceData> {
  if (data.documentMode !== 'electronic' || data.onlineQrDataUrl) return data;

  const onlineViewUrl = data.onlineViewUrl ?? buildOnlineViewUrl(data.invoiceNumber);
  const onlineQrDataUrl = await QRCode.toDataURL(onlineViewUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 180,
  });

  return { ...data, onlineViewUrl, onlineQrDataUrl };
}

function buildHtml(data: PdfInvoiceData): string {
  const isTh = data.language === 'th';
  const isEn = data.language === 'en';
  const isBoth = data.language === 'both';

  const docTitle = DOC_TITLE[data.type]?.[data.language] ?? 'ใบกำกับภาษี';
  const dateStr = isTh ? formatDateTh(data.invoiceDate) : formatDateEn(data.invoiceDate);
  const totalWords = isTh
    ? amountInWordsThai(data.total)
    : isEn
      ? amountInWordsEnglish(data.total)
      : `${amountInWordsThai(data.total)} / ${amountInWordsEnglish(data.total)}`;

  const fontUrl = 'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap';
  const theme = resolveDocumentTheme(data.templateId);

  const itemRows = data.items.map((item, idx) => {
    const nameLine = isBoth
      ? `<span class="item-name">${item.nameTh}</span>${item.nameEn ? `<span class="item-subname">${item.nameEn}</span>` : ''}`
      : isTh
        ? `<span class="item-name">${item.nameTh}</span>`
        : `<span class="item-name">${item.nameEn ?? item.nameTh}</span>`;
    return `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${nameLine}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:center">${item.unit}</td>
        <td style="text-align:right">${formatCurrency(item.unitPrice)}</td>
        <td style="text-align:center">${item.discount > 0 ? item.discount + '%' : '-'}</td>
        <td style="text-align:center">${item.vatType === 'vatExempt' ? (isTh ? 'ยกเว้น' : 'Exempt') : item.vatType === 'vatZero' ? '0%' : '7%'}</td>
        <td style="text-align:right">${formatCurrency(item.amount)}</td>
        <td style="text-align:right">${formatCurrency(item.vatAmount)}</td>
        <td style="text-align:right"><strong>${formatCurrency(item.totalAmount)}</strong></td>
      </tr>`;
  }).join('');

  const labels = {
    seller: isTh ? 'ผู้ขาย' : isEn ? 'Seller' : 'ผู้ขาย / Seller',
    buyer: isTh ? 'ผู้ซื้อ' : isEn ? 'Buyer' : 'ผู้ซื้อ / Buyer',
    taxId: isTh ? 'เลขประจำตัวผู้เสียภาษี' : isEn ? 'Tax ID' : 'เลขประจำตัวผู้เสียภาษี / Tax ID',
    branch: isTh ? 'สาขา' : isEn ? 'Branch' : 'สาขา / Branch',
    branchHeadOffice: isTh ? 'สำนักงานใหญ่' : isEn ? 'Head Office' : 'สำนักงานใหญ่ / Head Office',
    no: isTh ? 'ลำดับ' : isEn ? 'No.' : 'No.',
    item: isTh ? 'รายการ' : isEn ? 'Description' : 'รายการ / Description',
    qty: isTh ? 'จำนวน' : isEn ? 'Qty' : 'Qty',
    unit: isTh ? 'หน่วย' : isEn ? 'Unit' : 'Unit',
    price: isTh ? 'ราคา/หน่วย' : isEn ? 'Unit Price' : 'Unit Price',
    disc: isTh ? 'ส่วนลด' : isEn ? 'Disc.' : 'Disc.',
    vat: isTh ? 'VAT' : isEn ? 'VAT' : 'VAT',
    amount: isTh ? 'ราคา' : isEn ? 'Amount' : 'Amount',
    vatAmt: isTh ? 'ภาษี' : isEn ? 'Tax' : 'Tax',
    total: isTh ? 'รวม' : isEn ? 'Total' : 'Total',
    subtotal: isTh ? 'ยอดรวมก่อน VAT' : isEn ? 'Subtotal (excl. VAT)' : 'Subtotal',
    vatTotal: isTh ? 'ภาษีมูลค่าเพิ่ม (7%)' : isEn ? 'VAT (7%)' : 'VAT (7%)',
    grandTotal: isTh ? 'ยอดรวมสุทธิ' : isEn ? 'Grand Total' : 'Grand Total',
    words: isTh ? 'จำนวนเงินเป็นตัวอักษร' : isEn ? 'Amount in Words' : 'Amount in Words',
    invoiceNo: isTh ? 'เลขที่' : isEn ? 'Invoice No.' : 'No.',
    date: isTh ? 'วันที่' : isEn ? 'Date' : 'Date',
    origDoc: isTh ? 'ต้นฉบับ' : isEn ? 'ORIGINAL' : 'ต้นฉบับ / ORIGINAL',
    dueDate: isTh ? 'วันครบกำหนด' : isEn ? 'Due Date' : 'วันครบกำหนด / Due Date',
    paymentMethod: isTh ? 'วิธีชำระเงิน' : isEn ? 'Payment Method' : 'วิธีชำระเงิน / Payment Method',
    notes: isTh ? 'หมายเหตุ' : isEn ? 'Notes' : 'หมายเหตุ / Notes',
    preparedBy: isTh ? 'ผู้จัดทำ / ผู้ออกเอกสาร' : isEn ? 'Prepared by / Issuer' : 'ผู้จัดทำ / Prepared by',
    receivedBy: isTh ? 'ผู้รับสินค้า / ลูกค้า' : isEn ? 'Received by / Customer' : 'ผู้รับ / Customer',
    electronicDoc: isTh ? 'เอกสารนี้สร้างและจัดเก็บในรูปแบบอิเล็กทรอนิกส์' : isEn ? 'This document is generated and stored electronically.' : 'เอกสารนี้สร้างและจัดเก็บในรูปแบบอิเล็กทรอนิกส์ / This document is generated and stored electronically.',
    ordinaryDoc: isTh ? 'เอกสารฉบับปกติ' : isEn ? 'Ordinary document' : 'เอกสารฉบับปกติ / Ordinary document',
    electronicCertified: isTh ? 'เอกสารอิเล็กทรอนิกส์ตามรูปแบบ e-Tax' : isEn ? 'Electronic e-Tax document' : 'เอกสารอิเล็กทรอนิกส์ตามรูปแบบ e-Tax / Electronic e-Tax document',
    onlineQr: isTh ? 'สแกนเพื่อตรวจสอบ/ดูเอกสารออนไลน์' : isEn ? 'Scan to view or verify online' : 'สแกนเพื่อตรวจสอบ/ดูเอกสารออนไลน์ / Scan to verify online',
    bankPayment: isTh ? 'ข้อมูลบัญชีสำหรับโอนเงิน' : isEn ? 'Bank transfer information' : 'ข้อมูลบัญชีสำหรับโอนเงิน / Bank transfer information',
  };

  const sellerName = isTh ? data.seller.nameTh : isEn ? (data.seller.nameEn ?? data.seller.nameTh) : `${data.seller.nameTh} / ${data.seller.nameEn ?? data.seller.nameTh}`;
  const buyerName = isTh ? data.buyer.nameTh : isEn ? (data.buyer.nameEn ?? data.buyer.nameTh) : `${data.buyer.nameTh} / ${data.buyer.nameEn ?? data.buyer.nameTh}`;
  const sellerAddr = isTh ? data.seller.addressTh : isEn ? (data.seller.addressEn ?? data.seller.addressTh) : `${data.seller.addressTh}${data.seller.addressEn ? `<br/><span class="muted-inline">${data.seller.addressEn}</span>` : ''}`;
  const buyerAddr = isTh ? data.buyer.addressTh : isEn ? (data.buyer.addressEn ?? data.buyer.addressTh) : `${data.buyer.addressTh}${data.buyer.addressEn ? `<br/><span class="muted-inline">${data.buyer.addressEn}</span>` : ''}`;
  const sellerBranch = data.seller.branchCode === '00000'
    ? labels.branchHeadOffice
    : `${data.seller.branchCode}${data.seller.branchNameTh ? ` ${data.seller.branchNameTh}` : ''}`;
  const buyerBranch = data.buyer.branchCode === '00000'
    ? labels.branchHeadOffice
    : data.buyer.branchCode;
  const customTemplateBlock = data.templateHtml
    ? compileTemplateHtml(data.templateHtml, {
        documentTitle: escapeHtml(docTitle),
        invoiceNumber: escapeHtml(data.invoiceNumber),
        invoiceDate: escapeHtml(dateStr),
        dueDate: escapeHtml(data.dueDate ? (isTh ? formatDateTh(data.dueDate) : formatDateEn(data.dueDate)) : '-'),
        sellerName: escapeHtml(sellerName),
        buyerName: escapeHtml(buyerName),
        sellerTaxId: escapeHtml(data.seller.taxId),
        buyerTaxId: escapeHtml(data.buyer.taxId),
        subtotal: escapeHtml(formatCurrency(data.subtotal)),
        vatAmount: escapeHtml(formatCurrency(data.vatAmount)),
        total: escapeHtml(formatCurrency(data.total)),
        amountInWords: escapeHtml(totalWords),
        paymentMethod: escapeHtml(data.paymentMethod ?? '-'),
        notes: escapeHtml(data.notes ?? '-'),
      })
    : null;
  const metaRows = [
    { label: labels.invoiceNo, value: data.invoiceNumber, emphasize: true },
    { label: labels.date, value: dateStr },
    ...(data.dueDate ? [{ label: labels.dueDate, value: isTh ? formatDateTh(data.dueDate) : formatDateEn(data.dueDate) }] : []),
    ...(data.paymentMethod ? [{ label: labels.paymentMethod, value: data.paymentMethod }] : []),
  ];
  const isElectronicDocument = data.documentMode === 'electronic';

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="${fontUrl}" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    --accent: ${theme.accent};
    --accent-2: ${theme.accent2};
    --accent-soft: ${theme.soft};
    --theme-ink: ${theme.ink};
    font-family: 'Sarabun', sans-serif;
    font-size: 13px;
    color: #172033;
    background: #ffffff;
    padding: 20px;
  }
  .page { max-width: 210mm; margin: 0 auto; }
  .muted-inline { color: #5f6b7a; }
  .document-shell {
    border: 1px solid var(--accent);
    border-radius: 24px;
    overflow: hidden;
    background: #ffffff;
    box-shadow: 0 18px 60px rgba(15, 23, 42, 0.08);
    position: relative;
  }
  .top-accent { height: 10px; background: linear-gradient(90deg, var(--accent-2) 0%, var(--accent) 52%, var(--accent-soft) 100%); }
  .watermark {
    position: absolute;
    right: 24px;
    top: 118px;
    font-size: 54px;
    line-height: 1;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--accent);
    opacity: 0.055;
    transform: rotate(-8deg);
    pointer-events: none;
  }
  .document-body { padding: 28px 30px 24px; position: relative; z-index: 1; }
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(260px, 0.9fr);
    gap: 24px;
    align-items: start;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--accent);
  }
  .brand-area { display: flex; gap: 16px; align-items: flex-start; }
  .brand-logo {
    width: 78px;
    height: 78px;
    object-fit: contain;
    flex-shrink: 0;
    border: 1px solid var(--accent);
    border-radius: 18px;
    padding: 10px;
    background: #f8fbff;
  }
  .company-name {
    font-size: 22px;
    line-height: 1.2;
    font-weight: 700;
    color: var(--theme-ink);
    margin-bottom: 8px;
  }
  .company-legal {
    display: grid;
    gap: 4px;
    color: #4b5565;
    font-size: 11.5px;
    line-height: 1.55;
  }
  .hero-right {
    display: grid;
    gap: 12px;
    justify-items: end;
  }
  .doc-logo-right {
    width: 88px;
    height: 88px;
    object-fit: contain;
    border: 1px solid var(--accent);
    border-radius: 18px;
    padding: 8px;
    background: #f8fbff;
  }
  .title-card {
    width: 100%;
    border: 1px solid #dbe4f2;
    border-radius: 20px;
    background: linear-gradient(180deg, #ffffff 0%, var(--accent-soft) 100%);
    padding: 16px 18px 14px;
    text-align: right;
  }
  .eyebrow {
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    font-weight: 600;
    margin-bottom: 8px;
  }
  .title-card h1 {
    font-size: 28px;
    line-height: 1.1;
    font-weight: 700;
    color: var(--accent-2);
    margin-bottom: 6px;
  }
  .copy-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 5px 11px;
    border-radius: 999px;
    border: 1px solid var(--accent);
    background: #ffffff;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--accent-2);
    text-transform: uppercase;
  }
  .template-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    border-radius: 999px;
    background: var(--accent-2);
    color: #ffffff;
    padding: 6px 12px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .overview-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(250px, 0.9fr);
    gap: 18px;
    margin: 22px 0 18px;
  }
  .template-banner {
    margin-top: 18px;
    border: 1px solid var(--accent);
    border-radius: 18px;
    background: linear-gradient(135deg, var(--accent-soft) 0%, #ffffff 72%);
    padding: 16px 18px;
    border-left: 7px solid var(--accent);
  }
  .template-banner .section-label { margin-bottom: 8px; }
  .template-banner p,
  .template-banner div,
  .template-banner span,
  .template-banner li {
    color: #334155;
    font-size: 11.5px;
    line-height: 1.7;
  }
  .template-banner strong { color: var(--accent-2); }
  .party-card, .meta-card, .notes-card, .words-card, .totals-card {
    border: 1px solid #dde5f0;
    border-radius: 18px;
    background: #ffffff;
  }
  .party-card { padding: 18px; }
  .meta-card { padding: 14px 16px; background: #fbfcfe; }
  .section-label {
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #6b7688;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .party-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
  .party-column {
    padding: 14px 14px 12px;
    border-radius: 16px;
    background: #f9fbff;
    border: 1px solid #e5ecf5;
    min-height: 132px;
  }
  .party-title {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #6a7690;
    font-weight: 700;
    margin-bottom: 10px;
  }
  .party-name {
    font-size: 15px;
    line-height: 1.35;
    color: #15254b;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .party-detail {
    color: #556171;
    font-size: 11.5px;
    line-height: 1.65;
  }
  .meta-list { display: grid; gap: 8px; }
  .meta-row {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    font-size: 12px;
    line-height: 1.45;
    padding-bottom: 8px;
    border-bottom: 1px solid #e8edf5;
  }
  .meta-row:last-child { border-bottom: none; padding-bottom: 0; }
  .meta-key { color: #6d7789; }
  .meta-value { color: #162444; font-weight: 600; word-break: break-word; }
  .meta-value.emphasize { font-size: 15px; font-weight: 700; color: var(--accent-2); }
  .items-section {
    margin-top: 8px;
    border: 1px solid #dde5f0;
    border-radius: 20px;
    overflow: hidden;
    background: #ffffff;
  }
  .items-header {
    padding: 14px 18px 12px;
    border-bottom: 1px solid #e4ebf4;
    background: linear-gradient(180deg, #fbfdff 0%, #f4f8fe 100%);
  }
  .items-header h2 {
    font-size: 13px;
    font-weight: 700;
    color: #1e2f5a;
  }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  thead th {
    background: var(--accent-2);
    color: #ffffff;
    padding: 10px 8px;
    text-align: left;
    font-weight: 700;
    font-size: 10.5px;
    letter-spacing: 0.04em;
  }
  tbody td {
    padding: 10px 8px;
    border-bottom: 1px solid #edf2f7;
    vertical-align: top;
    color: #243348;
  }
  tbody tr:nth-child(even) td { background: #fbfcfe; }
  tbody tr:last-child td { border-bottom: none; }
  .item-name { font-weight: 600; color: #162444; line-height: 1.45; }
  .item-subname { display: block; margin-top: 2px; font-size: 10.5px; color: #72809a; }
  .summary-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 18px;
    align-items: start;
    margin-top: 18px;
  }
  .notes-stack { display: grid; gap: 12px; }
  .notes-card, .words-card { padding: 16px 18px; }
  .notes-text, .words-text {
    color: #445063;
    font-size: 11.5px;
    line-height: 1.7;
  }
  .words-text strong {
    color: #162444;
    font-size: 13px;
    font-weight: 700;
  }
  .totals-card {
    overflow: hidden;
    background: linear-gradient(180deg, #ffffff 0%, #f9fbff 100%);
  }
  .totals-header {
    padding: 14px 16px 10px;
    border-bottom: 1px solid #e5ecf5;
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #6b7688;
    font-weight: 700;
  }
  .totals-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 11px 16px;
    font-size: 12px;
    color: #435065;
    border-bottom: 1px solid #e9eff7;
  }
  .totals-row strong { color: #162444; font-weight: 700; }
  .totals-row.grand {
    background: var(--accent-2);
    color: #ffffff;
    border-bottom: none;
  }
  .totals-row.grand strong { color: #ffffff; font-size: 16px; }
  .signature-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 22px;
    margin-top: 28px;
  }
  .sig-card {
    border: 1px solid #dde5f0;
    border-radius: 18px;
    padding: 18px 18px 16px;
    background: #fcfdff;
    text-align: center;
  }
  .sig-space {
    height: 58px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sig-image {
    max-height: 54px;
    max-width: 170px;
    object-fit: contain;
  }
  .sig-line {
    border-top: 1px solid #c8d2e4;
    margin: 0 auto 10px;
    width: 72%;
  }
  .sig-title {
    font-size: 11px;
    font-weight: 600;
    color: #556171;
  }
  .sig-name {
    margin-top: 3px;
    font-size: 10px;
    color: #6b7280;
  }
  .document-support {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 170px;
    gap: 16px;
    align-items: stretch;
    margin-top: 18px;
  }
  .bank-box, .online-box {
    border: 1px solid #dde5f0;
    border-radius: 16px;
    background: #ffffff;
    padding: 14px 16px;
  }
  .bank-text {
    white-space: pre-line;
    color: #344154;
    font-size: 11.5px;
    line-height: 1.7;
  }
  .online-box {
    text-align: center;
    background: linear-gradient(180deg, var(--accent-soft) 0%, #ffffff 100%);
  }
  .online-qr {
    width: 112px;
    height: 112px;
    object-fit: contain;
    border: 1px solid #d9e2ef;
    border-radius: 10px;
    background: #ffffff;
    padding: 6px;
    margin-bottom: 8px;
  }
  .electronic-cert {
    margin-top: 16px;
    border-top: 1px solid #e6edf6;
    padding-top: 12px;
    display: flex;
    justify-content: space-between;
    gap: 14px;
    color: #5e6b7d;
    font-size: 10.5px;
    line-height: 1.6;
  }
  .cert-pill {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-2);
    border: 1px solid var(--accent);
    padding: 5px 10px;
    font-weight: 700;
    white-space: nowrap;
  }
  .footer {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid #e6edf6;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 10.5px;
    line-height: 1.55;
    color: #778296;
  }
  .footer-right { text-align: right; }
  .theme-paid .document-shell { border-width: 2px; }
  .theme-paid .title-card::after {
    content: 'PAID';
    display: inline-block;
    margin-top: 10px;
    border: 2px solid var(--accent);
    color: var(--accent);
    border-radius: 10px;
    padding: 4px 14px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.14em;
    transform: rotate(-4deg);
  }
  .theme-minimal .document-shell { box-shadow: none; border-radius: 10px; }
  .theme-minimal .top-accent { height: 4px; }
  .theme-minimal .title-card,
  .theme-minimal .party-card,
  .theme-minimal .meta-card,
  .theme-minimal .items-section,
  .theme-minimal .totals-card,
  .theme-minimal .sig-card {
    border-radius: 8px;
  }
  .theme-credit thead th { background: #92400e; }
  .theme-debit thead th { background: #9f1239; }
  .theme-luxury .document-shell {
    border-width: 2px;
    box-shadow: 0 22px 70px rgba(23, 18, 10, 0.14);
  }
  .theme-luxury .title-card {
    background: linear-gradient(135deg, #17120a 0%, #3a2a10 58%, #fff3c4 100%);
    color: #ffffff;
  }
  .theme-luxury .title-card h1,
  .theme-luxury .eyebrow {
    color: #fff7d6;
  }
  .theme-luxury .copy-pill {
    border-color: #f4d06f;
    color: #3a2a10;
  }
  .theme-local .document-shell,
  .theme-local .party-card,
  .theme-local .meta-card,
  .theme-local .items-section,
  .theme-local .totals-card,
  .theme-local .sig-card {
    border-radius: 12px;
  }
  .theme-local tbody td {
    font-size: 12px;
  }
  .theme-ledger .party-column,
  .theme-ledger .meta-card {
    background-image: linear-gradient(#eef2ff 1px, transparent 1px);
    background-size: 100% 28px;
  }
  /* ── Minimal White ── */
  .theme-minimal-white .document-shell { border: 1px solid #e5e7eb; border-radius: 4px; box-shadow: none; }
  .theme-minimal-white .top-accent { background: #e5e7eb; height: 3px; }
  .theme-minimal-white .title-card { background: white; border: 1px solid #e5e7eb; border-radius: 4px; }
  .theme-minimal-white .hero { border-bottom: 1px solid #e5e7eb; }
  .theme-minimal-white .eyebrow { color: #6b7280; }
  .theme-minimal-white .totals-row.grand { background: #f3f4f6; }

  /* ── Minimal Gray ── */
  .theme-minimal-gray .document-shell { border: 1px solid #d1d5db; border-radius: 4px; box-shadow: none; }
  .theme-minimal-gray .top-accent { background: #9ca3af; height: 4px; }
  .theme-minimal-gray .hero { background: #f9fafb; padding: 20px; border-bottom: 1px solid #d1d5db; }
  .theme-minimal-gray .title-card { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; }
  .theme-minimal-gray .totals-row.grand { background: #e5e7eb; }

  /* ── Minimal Line ── */
  .theme-minimal-line .document-shell { border: 1px solid #ccfbf1; border-radius: 4px; box-shadow: none; }
  .theme-minimal-line .top-accent { height: 4px; background: #0d9488; }
  .theme-minimal-line .title-card { background: white; border: 1px solid #99f6e4; border-radius: 4px; }
  .theme-minimal-line .title-card h1 { color: #0f766e; }
  .theme-minimal-line .hero { border-bottom: 2px solid #0d9488; }
  .theme-minimal-line .totals-row.grand { background: #0d9488; border-radius: 6px; }
  .theme-minimal-line .totals-row.grand span,
  .theme-minimal-line .totals-row.grand strong { color: white; }

  /* ── Minimal Sans ── */
  .theme-minimal-sans .document-shell { border: 1px solid #e5e7eb; border-radius: 4px; box-shadow: none; }
  .theme-minimal-sans .top-accent { background: #1f2937; height: 5px; }
  .theme-minimal-sans .title-card { background: white; border: 1px solid #e5e7eb; border-radius: 4px; }
  .theme-minimal-sans .title-card h1 { color: #111827; font-size: 24px; }
  .theme-minimal-sans .hero { border-bottom: 1px solid #1f2937; }
  .theme-minimal-sans .totals-row.grand { background: #111827; border-radius: 4px; }
  .theme-minimal-sans .totals-row.grand span,
  .theme-minimal-sans .totals-row.grand strong { color: white; }
  .theme-minimal-sans .company-name { font-size: 20px; font-weight: 800; }
  .theme-minimal-sans table th { background: #1f2937; color: white; }

  /* ── Minimal Space ── */
  .theme-minimal-space .document-shell { border: none; border-radius: 8px; box-shadow: 0 2px 16px rgba(0,0,0,0.06); }
  .theme-minimal-space .top-accent { display: none; }
  .theme-minimal-space .document-body { padding: 40px 44px 36px; }
  .theme-minimal-space .title-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; }
  .theme-minimal-space .hero { border-bottom: 1px solid #e2e8f0; padding-bottom: 28px; }
  .theme-minimal-space .totals-row.grand { background: #f1f5f9; border-radius: 6px; }

  @media print { body { padding: 0; } }
</style>
</head>
<body class="${theme.className}">
<div class="page">
  <div class="document-shell">
    <div class="top-accent"></div>
    <div class="watermark">${theme.mark}</div>
    <div class="document-body">
      <div class="hero">
        <div class="brand-area">
          ${data.showCompanyLogo !== false && data.seller.logoUrl ? `<img class="brand-logo" src="${data.seller.logoUrl}" alt="seller logo"/>` : ''}
          <div>
            <div class="company-name">${sellerName}</div>
            <div class="company-legal">
              <div>${labels.taxId}: ${data.seller.taxId}</div>
              <div>${labels.branch}: ${sellerBranch}</div>
              <div>${sellerAddr}</div>
              ${(data.seller.phone || data.seller.email || data.seller.website) ? `<div>${data.seller.phone ? `Tel. ${data.seller.phone}` : ''}${data.seller.phone && data.seller.email ? ' | ' : ''}${data.seller.email ? data.seller.email : ''}${(data.seller.phone || data.seller.email) && data.seller.website ? ' | ' : ''}${data.seller.website ? data.seller.website : ''}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="hero-right">
          ${data.documentLogoUrl ? `<img class="doc-logo-right" src="${data.documentLogoUrl}" alt="document logo"/>` : ''}
          <div class="title-card">
            <div class="eyebrow">Electronic Tax Document</div>
            <h1>${docTitle}</h1>
            <div class="copy-pill">${labels.origDoc}</div>
            <div class="template-badge">${escapeHtml(data.templateName ?? theme.label)}</div>
          </div>
        </div>
      </div>

      ${customTemplateBlock ? `
        <div class="template-banner">
          <div class="section-label">${data.templateName ? `Template: ${escapeHtml(data.templateName)}` : 'Document Template'}</div>
          ${customTemplateBlock}
        </div>
      ` : ''}

      <div class="overview-grid">
        <div class="party-card">
          <div class="section-label">${labels.buyer}</div>
          <div class="party-grid">
            <div class="party-column">
              <div class="party-name">${buyerName}</div>
              <div class="party-detail">
                <div>${labels.taxId}: <strong>${data.buyer.taxId}</strong></div>
                <div>${labels.branch}: <strong>${buyerBranch}</strong></div>
                <div>${buyerAddr}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="meta-card">
          <div class="section-label">Document Details</div>
          <div class="meta-list">
            ${metaRows.map((row) => `
              <div class="meta-row">
                <div class="meta-key">${row.label}</div>
                <div class="meta-value${row.emphasize ? ' emphasize' : ''}">${row.value}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="items-section">
        <div class="items-header">
          <h2>${labels.item}</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:42px;text-align:center">${labels.no}</th>
              <th>${labels.item}</th>
              <th style="width:54px;text-align:center">${labels.qty}</th>
              <th style="width:56px;text-align:center">${labels.unit}</th>
              <th style="width:96px;text-align:right">${labels.price}</th>
              <th style="width:56px;text-align:center">${labels.disc}</th>
              <th style="width:52px;text-align:center">${labels.vat}</th>
              <th style="width:96px;text-align:right">${labels.amount}</th>
              <th style="width:78px;text-align:right">${labels.vatAmt}</th>
              <th style="width:102px;text-align:right">${labels.total}</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>

      <div class="summary-grid">
        <div class="notes-stack">
          <div class="words-card">
            <div class="section-label">${labels.words}</div>
            <div class="words-text"><strong>${totalWords}</strong></div>
          </div>

          ${(data.notes || data.templateNote) ? `
            <div class="notes-card">
              <div class="section-label">${labels.notes}</div>
              <div class="notes-text">
                ${data.notes ? `<div>${data.notes}</div>` : ''}
                ${data.templateNote ? `<div style="margin-top:${data.notes ? '8px' : '0'}; color:#64748b;">${data.templateNote}</div>` : ''}
              </div>
            </div>
          ` : ''}
        </div>

        <div class="totals-card">
          <div class="totals-header">${labels.grandTotal}</div>
          <div class="totals-row"><span>${labels.subtotal}</span><strong>${formatCurrency(data.subtotal)} THB</strong></div>
          <div class="totals-row"><span>${labels.vatTotal}</span><strong>${formatCurrency(data.vatAmount)} THB</strong></div>
          <div class="totals-row grand"><span>${labels.grandTotal}</span><strong>${formatCurrency(data.total)} THB</strong></div>
        </div>
      </div>

      ${(!isElectronicDocument || data.signatureImageUrl || data.signerName || data.signerTitle) ? `
        <div class="signature-grid">
          <div class="sig-card">
            <div class="sig-space">${data.signatureImageUrl ? `<img class="sig-image" src="${data.signatureImageUrl}" alt="authorized signature"/>` : ''}</div>
            <div class="sig-line"></div>
            <div class="sig-title">${labels.preparedBy}</div>
            ${(data.signerName || data.signerTitle) ? `<div class="sig-name">${escapeHtml([data.signerName, data.signerTitle].filter(Boolean).join(' · '))}</div>` : ''}
          </div>
          ${!isElectronicDocument ? `<div class="sig-card">
            <div class="sig-space"></div>
            <div class="sig-line"></div>
            <div class="sig-title">${labels.receivedBy}</div>
          </div>` : '<div></div>'}
        </div>
      ` : ''}

      ${(data.bankPaymentInfo || isElectronicDocument) ? `
        <div class="document-support">
          ${data.bankPaymentInfo ? `
            <div class="bank-box">
              <div class="section-label">${labels.bankPayment}</div>
              <div class="bank-text">${escapeHtml(data.bankPaymentInfo)}</div>
            </div>
          ` : '<div></div>'}
          ${isElectronicDocument ? `
            <div class="online-box">
              ${data.onlineQrDataUrl ? `<img class="online-qr" src="${data.onlineQrDataUrl}" alt="online document QR"/>` : ''}
              <div class="section-label" style="margin-bottom:4px">${labels.onlineQr}</div>
              <div style="font-size:10px;line-height:1.45;color:#64748b;word-break:break-all;">${escapeHtml(data.onlineViewUrl ?? buildOnlineViewUrl(data.invoiceNumber))}</div>
            </div>
          ` : '<div></div>'}
        </div>
      ` : ''}

      <div class="electronic-cert">
        <div>
          ${isElectronicDocument
            ? `${labels.electronicCertified}`
            : labels.ordinaryDoc}
        </div>
        <div class="cert-pill">${isElectronicDocument ? 'ELECTRONIC DOCUMENT' : 'ORDINARY DOCUMENT'}</div>
      </div>

      <div class="footer">
        <div>e-Tax Invoice System &nbsp;|&nbsp; ${isElectronicDocument ? 'e-Tax Electronic Document' : 'Standard Document'}</div>
        <div class="footer-right">${docTitle} &nbsp;·&nbsp; ${new Date().getFullYear()}</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

async function resolveTemplateForDocument(
  companyId: string,
  type: string,
  language: Language,
  templateId?: string | null,
) {
  const builtinTemplate = resolveBuiltinTemplate(type, language, templateId);
  if (builtinTemplate) return builtinTemplate;

  if (templateId?.startsWith('builtin:')) return null;

  const where = templateId
    ? { id: templateId, companyId }
    : { companyId, type, language, isActive: true };

  const template = await prisma.documentTemplate.findFirst({
    where,
    select: { id: true, name: true, htmlTh: true, htmlEn: true, language: true, type: true },
  });

  if (!template) return null;

  return {
    id: template.id,
    name: template.name,
    html: resolveTemplateLanguageHtml(template, language),
  };
}

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30_000);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.emulateMediaType('print');

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function generatePdf(data: PdfInvoiceData): Promise<Buffer> {
  const enrichedData = await enrichElectronicDocument(data);
  return generatePdfFromHtml(buildHtml({
    ...enrichedData,
    templateNote: data.templateNote ?? null,
  }));
}

export { buildHtml };

// ─── Minimal template builder ────────────────────────────────────────────────
function buildHtmlMinimal(data: PdfInvoiceData, variant: string): string {
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

function buildHtmlCute(data: PdfInvoiceData, variant: string): string {
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

function buildHtmlProfessional(data: PdfInvoiceData, variant: string): string {
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
      <td class="center">${item.discount > 0 ? `${item.discount}%` : '-'}</td>
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

type PosterTemplateTokens = {
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

function originalAnimeArtwork(variant: string, accent: string, accent2: string, soft: string, dark = false) {
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

function originalDarkArtwork(variant: string, accent: string, accent2: string) {
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

function buildHtmlPosterTemplate(data: PdfInvoiceData, tokens: PosterTemplateTokens): string {
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

/* ═══════════════════════════════════════════════════════════
   GROUP 4: DARK / MAN / TECH  (10 variants)
═══════════════════════════════════════════════════════════ */
function buildHtmlDark(data: PdfInvoiceData, variant: string): string {
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

/* ═══════════════════════════════════════════════════════════
   GROUP 5: ANIME / OTAKU  (10 variants)
═══════════════════════════════════════════════════════════ */
function buildHtmlAnime(data: PdfInvoiceData, variant: string): string {
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

function buildHtmlCrayon(data: PdfInvoiceData): string {
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

type MarketplaceTemplateTokens = {
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

const MARKETPLACE_TEMPLATE_TOKENS: Record<string, MarketplaceTemplateTokens> = {
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

function marketplaceDecorSvg(tokens: MarketplaceTemplateTokens) {
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

type PrintTemplateTone = 'minimal' | 'cute';

type PrintTemplateLayoutSpec = {
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

function resolvePrintTemplateLayout(tokens: MarketplaceTemplateTokens): PrintTemplateLayoutSpec {
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

function renderPrintTemplateOrnaments(tokens: MarketplaceTemplateTokens, layout: PrintTemplateLayoutSpec) {
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

function buildHtmlGeneratedTemplate(data: PdfInvoiceData, tokens: MarketplaceTemplateTokens): string {
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

function buildHtmlMarketplace(data: PdfInvoiceData, tokens: MarketplaceTemplateTokens): string {
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
      <td class="center">${item.discount > 0 ? `${item.discount}%` : '-'}</td>
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

export async function buildHtmlForCompany(data: PdfInvoiceData, companyId: string): Promise<string> {
  const template = await resolveTemplateForDocument(companyId, data.type, data.language, data.templateId);
  const enrichedData = await enrichElectronicDocument(data);

  const mergedData = {
    ...enrichedData,
    templateName: data.templateName ?? template?.name ?? null,
    templateHtml: data.templateHtml ?? template?.html ?? null,
    templateNote: null,
  };

  const marketplaceTokens = mergedData.templateId ? MARKETPLACE_TEMPLATE_TOKENS[mergedData.templateId] : null;
  if (marketplaceTokens) {
    return buildHtmlMarketplace(mergedData, marketplaceTokens);
  }

  // Route to specialized builders
  if (mergedData.templateId?.startsWith('builtin:minimal-')) {
    const variant = mergedData.templateId.replace('builtin:minimal-', '');
    return buildHtmlMinimal(mergedData, variant);
  }

  if (mergedData.templateId?.startsWith('builtin:cute-')) {
    const variant = mergedData.templateId.replace('builtin:cute-', '');
    return buildHtmlCute(mergedData, variant);
  }

  if (mergedData.templateId?.startsWith('builtin:pro-')) {
    const variant = mergedData.templateId.replace('builtin:pro-', '');
    return buildHtmlProfessional(mergedData, variant);
  }

  if (mergedData.templateId === 'builtin:crayon') {
    return buildHtmlCrayon(mergedData);
  }

  if (mergedData.templateId?.startsWith('builtin:dark-')) {
    const variant = mergedData.templateId.replace('builtin:dark-', '');
    return buildHtmlDark(mergedData, variant);
  }

  if (mergedData.templateId?.startsWith('builtin:anime-')) {
    const variant = mergedData.templateId.replace('builtin:anime-', '');
    return buildHtmlAnime(mergedData, variant);
  }

  return buildHtml(mergedData);
}

function buildCustomerStatementHtml(data: CustomerStatementPdfData): string {
  const isTh = data.language !== 'en';
  const customerName = isTh ? data.customer.nameTh : (data.customer.nameEn ?? data.customer.nameTh);
  const customerAltName = isTh ? data.customer.nameEn : data.customer.nameTh;
  const customerAddress = isTh ? (data.customer.addressTh ?? '-') : (data.customer.addressEn ?? data.customer.addressTh ?? '-');

  const agingRows = [
    [isTh ? 'ยังไม่เกินกำหนด' : 'Current', data.aging.current],
    ['1-30', data.aging.days1To30],
    ['31-60', data.aging.days31To60],
    ['61-90', data.aging.days61To90],
    ['90+', data.aging.days90Plus],
  ];

  const entryRows = data.entries.map((entry) => `
    <tr>
      <td>${entry.invoiceNumber}</td>
      <td>${entry.type}</td>
      <td>${isTh ? formatDateTh(entry.invoiceDate) : formatDateEn(entry.invoiceDate)}</td>
      <td>${entry.dueDate ? (isTh ? formatDateTh(entry.dueDate) : formatDateEn(entry.dueDate)) : '-'}</td>
      <td style="text-align:right">${formatCurrency(entry.signedTotal)}</td>
      <td style="text-align:right">${formatCurrency(entry.paidAmount)}</td>
      <td style="text-align:right">${formatCurrency(entry.outstandingAmount)}</td>
      <td style="text-align:right">${formatCurrency(entry.runningBalance)}</td>
      <td style="text-align:right">${entry.ageDays}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; }
  .page { max-width: 210mm; margin: 0 auto; }
  .header { display:flex; justify-content:space-between; gap:24px; border-bottom: 3px solid #0f766e; padding-bottom: 16px; margin-bottom: 20px; }
  .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .18em; color: #64748b; }
  h1 { margin: 6px 0 0; font-size: 26px; color: #0f172a; }
  .meta { text-align:right; font-size: 12px; color:#475569; }
  .grid { display:grid; grid-template-columns: 1.3fr .9fr; gap: 16px; margin-bottom: 16px; }
  .card { border:1px solid #e2e8f0; border-radius: 14px; padding: 14px; background:#fff; }
  .card h2 { margin: 0 0 8px; font-size: 14px; color:#0f172a; }
  .muted { color:#64748b; font-size: 12px; }
  .summary-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
  .summary-item { border-radius: 14px; padding: 14px; background:#f8fafc; border:1px solid #e2e8f0; }
  .summary-item strong { display:block; font-size: 18px; margin-top: 4px; color:#0f172a; }
  table { width:100%; border-collapse: collapse; font-size: 12px; }
  th { text-align:left; font-weight:600; color:#475569; padding: 8px 6px; border-bottom:1px solid #cbd5e1; }
  td { padding: 8px 6px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
  .section-title { margin: 20px 0 10px; font-size: 15px; font-weight: 700; color:#0f172a; }
  .footer { margin-top: 18px; border-top:1px solid #e2e8f0; padding-top: 8px; font-size: 10px; text-align:center; color:#94a3b8; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="eyebrow">Statement of Account</div>
        <h1>${isTh ? 'รายงานลูกหนี้คงค้าง' : 'Customer Statement'}</h1>
        <div class="muted">${data.companyName}</div>
      </div>
      <div class="meta">
        <div>${isTh ? 'ออกรายงานเมื่อ' : 'Generated at'}</div>
        <strong>${isTh ? formatDateTh(data.generatedAt) : formatDateEn(data.generatedAt)}</strong>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>${isTh ? 'ข้อมูลลูกค้า' : 'Customer details'}</h2>
        <div><strong>${customerName}</strong></div>
        ${customerAltName ? `<div class="muted" style="margin-top:2px">${customerAltName}</div>` : ''}
        <div style="margin-top:8px">${isTh ? 'เลขผู้เสียภาษี' : 'Tax ID'}: ${data.customer.taxId}</div>
        <div class="muted" style="margin-top:6px">${customerAddress}</div>
        ${data.customer.email ? `<div class="muted" style="margin-top:6px">${data.customer.email}</div>` : ''}
      </div>
      <div class="card">
        <h2>${isTh ? 'สรุปยอด' : 'Balance summary'}</h2>
        <div class="muted">${isTh ? 'ยอดค้างรวม' : 'Total outstanding'}</div>
        <strong style="font-size:22px">${formatCurrency(data.summary.totalOutstanding)} THB</strong>
        <div style="margin-top:10px" class="muted">${isTh ? 'ยอดเกินกำหนด' : 'Overdue outstanding'}: ${formatCurrency(data.summary.overdueOutstanding)} THB</div>
        <div class="muted">${isTh ? 'รับชำระแล้ว' : 'Total received'}: ${formatCurrency(data.summary.totalReceived)} THB</div>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-item">
        <div class="muted">${isTh ? 'ยอดวางบิล' : 'Total billed'}</div>
        <strong>${formatCurrency(data.summary.totalBilled)}</strong>
      </div>
      <div class="summary-item">
        <div class="muted">${isTh ? 'เครดิตโน้ต' : 'Credits'}</div>
        <strong>${formatCurrency(data.summary.totalCredits)}</strong>
      </div>
      <div class="summary-item">
        <div class="muted">${isTh ? 'ยอดปัจจุบัน' : 'Current outstanding'}</div>
        <strong>${formatCurrency(data.summary.currentOutstanding)}</strong>
      </div>
    </div>

    <div class="section-title">${isTh ? 'Aging Summary' : 'Aging Summary'}</div>
    <table>
      <thead>
        <tr>
          <th>${isTh ? 'ช่วงอายุหนี้' : 'Bucket'}</th>
          <th style="text-align:right">${isTh ? 'ยอดค้าง' : 'Outstanding'}</th>
        </tr>
      </thead>
      <tbody>
        ${agingRows.map(([label, amount]) => `
          <tr>
            <td>${label}</td>
            <td style="text-align:right">${formatCurrency(amount as number)} THB</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="section-title">${isTh ? 'รายการเอกสาร' : 'Statement entries'}</div>
    <table>
      <thead>
        <tr>
          <th>${isTh ? 'เลขที่เอกสาร' : 'Document No.'}</th>
          <th>${isTh ? 'ประเภท' : 'Type'}</th>
          <th>${isTh ? 'วันที่เอกสาร' : 'Invoice date'}</th>
          <th>${isTh ? 'ครบกำหนด' : 'Due date'}</th>
          <th style="text-align:right">${isTh ? 'ยอดเอกสาร' : 'Amount'}</th>
          <th style="text-align:right">${isTh ? 'รับชำระแล้ว' : 'Paid'}</th>
          <th style="text-align:right">${isTh ? 'คงเหลือ' : 'Outstanding'}</th>
          <th style="text-align:right">${isTh ? 'คงค้างสะสม' : 'Running balance'}</th>
          <th style="text-align:right">${isTh ? 'อายุหนี้' : 'Age'}</th>
        </tr>
      </thead>
      <tbody>
        ${entryRows}
      </tbody>
    </table>

    <div class="footer">e-Tax Invoice System | ${isTh ? 'เอกสารนี้สร้างจากระบบอัตโนมัติ' : 'This statement was generated automatically'}</div>
  </div>
</body>
</html>`;
}

export async function generateCustomerStatementPdf(data: CustomerStatementPdfData): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30_000);
    await page.setContent(buildCustomerStatementHtml(data), { waitUntil: 'domcontentloaded' });
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
logger.debug('pdfService loaded');
