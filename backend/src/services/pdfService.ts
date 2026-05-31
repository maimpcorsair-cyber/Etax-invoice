import { launchBrowser } from './browserService';
import QRCode from 'qrcode';
import { logger } from '../config/logger';
import prisma from '../config/database';
import {
  formatDateTh,
  formatDateEn,
  formatCurrency,
  resolveTemplateLanguageHtml,
  resolveBuiltinTemplate,
  buildOnlineViewUrl,
  type Language,
} from './pdfService/utils';
import { buildHtml } from './pdfService/builders/standard';
export { buildHtml };

export interface PdfInvoiceData {
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
    discountAmount: number;
    vatType: string;
    amount: number;
    vatAmount: number;
    totalAmount: number;
  }[];
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
  feeAmount?: number | null; // management / agency fee added on top of subtotal, before VAT (agency quotations)
  feeLabel?: string | null; // label for the fee row, e.g. "ค่าบริหารงาน" / "Agency fee"
  feePercent?: number | null; // the percent used to derive feeAmount, shown next to the label
  whtRate?: string | null; // "1"|"3"|"5" — informational WHT estimate; shows หัก ณ ที่จ่าย + net payable, does not change total
  total: number;
  isPaid?: boolean | null; // suppresses the "scan to pay" PromptPay QR when already settled
  promptPayId?: string | null; // the bank account selected on THIS document; QR uses it when it matches a company account
  documentFooterNote?: string | null; // company-wide fine-print at the very bottom
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
  // PromptPay QR — a scannable QR that pre-fills the invoice total +
  // reference number. Rendered next to bankPaymentInfo in builders.
  promptPayQrDataUrl?: string | null;
  promptPayTarget?: string | null; // masked phone/national-id shown under QR
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
  const browser = await launchBrowser();

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

// ─── Minimal template builder ────────────────────────────────────────────────
/* ═══════════════════════════════════════════════════════════
   GROUP 4: DARK / MAN / TECH  (10 variants)
═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   GROUP 5: ANIME / OTAKU  (10 variants)
═══════════════════════════════════════════════════════════ */
// Look up the company's default PromptPay account and build a QR for the
// invoice total + invoice number. Returns null when no PromptPay is set,
// when the doc has 0 total (e.g., quotation drafts), or when QR generation
// fails — we never want PromptPay to block PDF rendering.
async function enrichPromptPayQr(data: PdfInvoiceData, companyId: string): Promise<{ url: string; target: string } | null> {
  if (!data.total || data.total <= 0) return null;
  // No "scan to pay" QR on a quotation (nothing to pay yet) or on a document
  // that is already settled — it would confuse the recipient.
  if (data.type === 'quotation' || data.isPaid) return null;
  try {
    const { buildPromptPayQr } = await import('./promptPayService');
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { documentBankAccounts: true },
    });
    const accounts = Array.isArray(company?.documentBankAccounts) ? (company!.documentBankAccounts as Array<Record<string, unknown>>) : [];
    const withPromptPay = accounts.filter((a) => typeof a.promptPayId === 'string' && (a.promptPayId as string).trim().length > 0);
    // Account-selection priority:
    //  1. the account chosen ON THIS document — but only if its PromptPay id is
    //     actually one of the company's configured accounts (never trust an
    //     arbitrary id from the request: that would redirect payment).
    //  2. the company's designated default account.
    //  3. first account that has a PromptPay id.
    const requested = typeof data.promptPayId === 'string' ? data.promptPayId.trim() : '';
    const ppAccount =
      (requested ? withPromptPay.find((a) => String(a.promptPayId).trim() === requested) : undefined)
      ?? withPromptPay.find((a) => a.isDefault === true)
      ?? withPromptPay[0];
    if (!ppAccount) return null;
    const target = String(ppAccount.promptPayId).trim();
    const qr = await buildPromptPayQr(target, data.total, data.invoiceNumber);
    return { url: qr.imageDataUrl, target };
  } catch (err) {
    logger.warn('[pdfService] PromptPay QR build failed (non-fatal)', { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function buildHtmlForCompany(data: PdfInvoiceData, companyId: string): Promise<string> {
  const template = await resolveTemplateForDocument(companyId, data.type, data.language, data.templateId);
  const enrichedData = await enrichElectronicDocument(data);
  const promptPay = await enrichPromptPayQr(enrichedData, companyId);

  // Company-wide defaults resolved at render time: the footer fine-print and
  // the visual signature. Anything already on `data` (the invoice form's own
  // signer, or a preview override) wins; otherwise fall back to the company
  // profile so every document — including quotations, which carry no signer
  // field — still shows the company signature + footer.
  let documentFooterNote = data.documentFooterNote ?? null;
  let signerName = data.signerName ?? null;
  let signerTitle = data.signerTitle ?? null;
  let signatureImageUrl = data.signatureImageUrl ?? null;
  if (documentFooterNote == null || (!signerName && !signatureImageUrl)) {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { documentFooterNote: true, documentSignatureProfile: true },
      });
      documentFooterNote = documentFooterNote ?? company?.documentFooterNote ?? null;
      const sig = (company?.documentSignatureProfile ?? null) as
        { signerName?: string | null; signerTitle?: string | null; signatureImageUrl?: string | null } | null;
      if (sig) {
        if (!signerName) signerName = sig.signerName ?? null;
        if (!signerTitle) signerTitle = sig.signerTitle ?? null;
        if (!signatureImageUrl) signatureImageUrl = sig.signatureImageUrl ?? null;
      }
    } catch { /* best-effort; never block rendering */ }
  }

  const mergedData = {
    ...enrichedData,
    templateName: data.templateName ?? template?.name ?? null,
    templateHtml: data.templateHtml ?? template?.html ?? null,
    templateNote: null,
    documentFooterNote,
    signerName,
    signerTitle,
    signatureImageUrl,
    promptPayQrDataUrl: promptPay?.url ?? null,
    promptPayTarget: promptPay?.target ?? null,
  };

  // Every template — built-in or custom — renders through the single formal
  // base builder, themed per templateId via resolveDocumentTheme. (The old
  // per-variant builders were unreachable behind this early return and have
  // been removed.)
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
  const browser = await launchBrowser();

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
