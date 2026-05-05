import puppeteer from 'puppeteer';
import type { WhtCertificate, Company } from '@prisma/client';
import { amountInWordsThai } from './invoiceService';
import { logger } from '../config/logger';

type WhtPdfData = WhtCertificate & {
  company: Pick<Company, 'nameTh' | 'nameEn' | 'taxId' | 'branchCode' | 'addressTh'>;
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: number;
    invoiceDate: Date;
    buyer: { nameTh: string; nameEn: string | null; taxId: string; branchCode: string };
  } | null;
};

const INCOME_TYPE_LABELS_TH: Record<string, string> = {
  '1': 'เงินได้ที่จ่ายตามมาตรา 40(1) ค่าจ้าง',
  '2': 'เงินได้ที่จ่ายตามมาตรา 40(2) ค่าเช่าทรัพย์สิน ค่าดอกเบี้ย',
  '4': 'เงินได้ที่จ่ายตามมาตรา 40(4)(ก) ค่าบริการ ค่านายหน้า',
};

const WHT_RATE_LABELS_TH: Record<string, string> = {
  '1': '1% (ร้อยละหนึ่ง)',
  '3': '3% (ร้อยละสาม)',
  '5': '5% (ร้อยละห้า)',
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

function buildWhtHtml(data: WhtPdfData): string {
  const now = new Date();
  const titleDate = formatDateTh(now);

  const incomeTypeLabel = INCOME_TYPE_LABELS_TH[data.incomeType ?? ''] ?? '';
  const rateLabel = WHT_RATE_LABELS_TH[data.whtRate] ?? `${data.whtRate}%`;
  const whtRateNum = parseFloat(data.whtRate) / 100;

  const paymentDate = data.paymentDate instanceof Date ? data.paymentDate : new Date(data.paymentDate);
  const paymentDateStr = formatDateTh(paymentDate);

  const totalWords = amountInWordsThai(data.totalAmount);
  const whtWords = amountInWordsThai(data.whtAmount);

  const sellerName = data.company.nameTh;
  const sellerTaxId = data.company.taxId;
  const sellerBranch = data.company.branchCode === '00000'
    ? 'สำนักงานใหญ่'
    : `สาขาที่ ${data.company.branchCode}`;
  const sellerAddr = data.company.addressTh;

  const buyerName = data.recipientName;
  const buyerTaxId = data.recipientTaxId;
  const buyerBranch = data.recipientBranch === '00000'
    ? 'สำนักงานใหญ่'
    : `สาขาที่ ${data.recipientBranch}`;

  const invoiceInfo = data.invoice
    ? `<div class="meta-row"><div class="meta-key">เลขที่ใบกำกับภาษี</div><div class="meta-val">${escapeHtml(data.invoice.invoiceNumber)}</div></div>
       <div class="meta-row"><div class="meta-key">วันที่ใบกำกับภาษี</div><div class="meta-val">${formatDateTh(data.invoice.invoiceDate)}</div></div>`
    : '';

  const fontUrl = 'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap';

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="${fontUrl}" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Sarabun', sans-serif;
    font-size: 13px;
    color: #1a1a2e;
    background: #ffffff;
    padding: 20px;
  }
  .page { max-width: 210mm; margin: 0 auto; }

  .document-shell {
    border: 2px solid #c0392b;
    border-radius: 0;
    overflow: hidden;
    background: #ffffff;
    position: relative;
  }

  .top-bar {
    background: #c0392b;
    color: #ffffff;
    padding: 14px 24px 12px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .doc-title-area h1 {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 2px;
    color: #ffffff;
  }

  .doc-title-area .subtitle {
    font-size: 13px;
    font-weight: 500;
    color: #fdecea;
    margin-top: 4px;
    letter-spacing: 0.5px;
  }

  .cert-number-box {
    text-align: right;
    border: 1px solid rgba(255,255,255,0.4);
    border-radius: 8px;
    padding: 8px 12px;
    background: rgba(255,255,255,0.08);
  }

  .cert-number-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #fdecea;
    margin-bottom: 4px;
  }

  .cert-number-value {
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 1px;
  }

  .accent-strip {
    height: 4px;
    background: linear-gradient(90deg, #7f1d1d, #c0392b 50%, #fca5a5);
  }

  .body { padding: 22px 28px 24px; }

  .intro-section {
    background: #fff5f5;
    border: 1px solid #fecaca;
    border-radius: 12px;
    padding: 14px 18px;
    margin-bottom: 18px;
  }

  .intro-section p {
    font-size: 13px;
    line-height: 1.75;
    color: #7f1d1d;
  }

  .section-label {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #c0392b;
    margin-bottom: 10px;
    border-bottom: 2px solid #fecaca;
    padding-bottom: 5px;
  }

  .party-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 18px;
  }

  .party-card {
    border: 1px solid #fecaca;
    border-radius: 12px;
    padding: 14px 16px;
    background: #fff;
  }

  .party-card.payer {
    background: #fff5f5;
    border-color: #fca5a5;
  }

  .party-name {
    font-size: 15px;
    font-weight: 700;
    color: #1a1a2e;
    margin-bottom: 6px;
    line-height: 1.3;
  }

  .party-detail {
    font-size: 12px;
    color: #64748b;
    line-height: 1.7;
  }

  .party-detail strong {
    color: #374151;
  }

  .wht-summary-card {
    border: 2px solid #c0392b;
    border-radius: 12px;
    background: linear-gradient(135deg, #fff5f5 0%, #ffffff 100%);
    padding: 16px 20px;
    margin-bottom: 18px;
  }

  .wht-summary-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }

  .wht-summary-header h2 {
    font-size: 15px;
    font-weight: 700;
    color: #7f1d1d;
  }

  .wht-rate-badge {
    background: #c0392b;
    color: #ffffff;
    border-radius: 8px;
    padding: 5px 14px;
    font-size: 16px;
    font-weight: 700;
  }

  .wht-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .wht-table th {
    background: #fef2f2;
    color: #991b1b;
    padding: 8px 14px;
    text-align: left;
    font-weight: 700;
    border-bottom: 2px solid #fecaca;
  }

  .wht-table td {
    padding: 9px 14px;
    border-bottom: 1px solid #fee2e2;
    color: #374151;
    font-size: 13px;
  }

  .wht-table tr:last-child td {
    border-bottom: none;
  }

  .wht-table .amount-col {
    text-align: right;
    font-weight: 600;
    color: #1a1a2e;
  }

  .wht-table .wht-row td {
    background: #fff5f5;
    font-weight: 700;
    color: #991b1b;
    border-top: 2px solid #fca5a5;
    border-bottom: none;
  }

  .wht-table .net-row td {
    background: #fecaca;
    color: #7f1d1d;
    font-weight: 800;
    font-size: 14px;
  }

  .amount-in-words {
    margin-top: 12px;
    background: #fff;
    border: 1px solid #fecaca;
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 13px;
  }

  .amount-in-words-label {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    color: #c0392b;
    letter-spacing: 0.12em;
    margin-bottom: 5px;
  }

  .amount-in-words-value {
    color: #374151;
    line-height: 1.65;
  }

  .amount-in-words-value strong {
    font-weight: 700;
    color: #1a1a2e;
  }

  .income-type-box {
    background: #fff;
    border: 1px solid #fecaca;
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 18px;
    font-size: 13px;
  }

  .income-type-box .label {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #c0392b;
    margin-bottom: 5px;
  }

  .signature-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 28px;
  }

  .sig-card {
    border: 1px solid #fecaca;
    border-radius: 12px;
    padding: 16px 18px;
    text-align: center;
    background: #fff;
  }

  .sig-space {
    height: 56px;
    border-bottom: 1px solid #c4c4c4;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sig-title {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    margin-top: 6px;
    line-height: 1.5;
  }

  .footer {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px solid #fecaca;
    display: flex;
    justify-content: space-between;
    font-size: 10.5px;
    color: #94a3b8;
    line-height: 1.55;
  }

  .footer-right { text-align: right; }

  .cert-badge {
    display: inline-block;
    background: #c0392b;
    color: #ffffff;
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-top: 4px;
  }

  .watermark {
    position: absolute;
    right: 32px;
    top: 180px;
    font-size: 80px;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: #c0392b;
    opacity: 0.05;
    transform: rotate(-8deg);
    pointer-events: none;
  }

  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="document-shell">
    <div class="watermark">50 ทวิ</div>

    <div class="top-bar">
      <div class="doc-title-area">
        <h1>ใบรับรองหักภาษี ณ ที่จ่าย</h1>
        <div class="subtitle">Withholding Tax Certificate (Por 50 Tor)</div>
      </div>
      <div class="cert-number-box">
        <div class="cert-number-label">เลขที่ใบรับรอง</div>
        <div class="cert-number-value">${escapeHtml(data.certificateNumber)}</div>
      </div>
    </div>
    <div class="accent-strip"></div>

    <div class="body">

      <div class="intro-section">
        <p>
          ผู้มีหน้าที่หักภาษี ณ ที่จ่าย ขอออกใบรับรองหักภาษี ณ ที่จ่ายนี้ไว้เป็นหลักฐานว่า
          ได้หักภาษีไว้จากเงินได้ที่จ่ายให้แก่ผู้รับเงินได้ตามที่ระบุไว้ในใบรับรองนี้
          และนำส่งเงินภาษีที่หักไว้นั้นต่อกรมสรรพากรแล้ว
        </p>
      </div>

      <div class="party-grid">
        <div class="party-card">
          <div class="section-label">ผู้หักภาษี (Withholding Agent)</div>
          <div class="party-name">${escapeHtml(sellerName)}</div>
          <div class="party-detail">
            <div>เลขประจำตัวผู้เสียภาษี: <strong>${escapeHtml(sellerTaxId)}</strong></div>
            <div>${sellerBranch}</div>
            <div>${escapeHtml(sellerAddr)}</div>
          </div>
        </div>
        <div class="party-card payer">
          <div class="section-label">ผู้ถูกหักภาษี (Payee)</div>
          <div class="party-name">${escapeHtml(buyerName)}</div>
          <div class="party-detail">
            <div>เลขประจำตัวผู้เสียภาษี: <strong>${escapeHtml(buyerTaxId)}</strong></div>
            <div>${buyerBranch}</div>
          </div>
        </div>
      </div>

      ${invoiceInfo ? `
      <div class="income-type-box">
        <div class="label">ข้อมูลใบกำกับภาษีที่เกี่ยวข้อง</div>
        ${invoiceInfo}
      </div>` : ''}

      <div class="wht-summary-card">
        <div class="wht-summary-header">
          <h2>รายละเอียดการหักภาษี (Withholding Details)</h2>
          <div class="wht-rate-badge">${rateLabel}</div>
        </div>

        <table class="wht-table">
          <thead>
            <tr>
              <th>รายการ</th>
              <th style="text-align:right">จำนวนเงิน (บาท)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>ยอดเงินได้ก่อนหักภาษี (Income before WHT)</td>
              <td class="amount-col">${formatCurrency(data.totalAmount)}</td>
            </tr>
            <tr>
              <td>ภาษีที่หักไว้ (Withholding Tax @ ${rateLabel})</td>
              <td class="amount-col">${formatCurrency(data.whtAmount)}</td>
            </tr>
            <tr class="net-row">
              <td>ยอดเงินสุทธิหลังหักภาษี (Net Amount after WHT)</td>
              <td class="amount-col">${formatCurrency(data.netAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div class="amount-in-words">
          <div class="amount-in-words-label">จำนวนเงินภาษีที่หักไว้เป็นตัวอักษร</div>
          <div class="amount-in-words-value">
            <strong>${whtWords}</strong> ถ้วน
          </div>
        </div>
      </div>

      ${incomeTypeLabel ? `
      <div class="income-type-box">
        <div class="label">ประเภทของเงินได้ (Type of Income)</div>
        <div>${escapeHtml(incomeTypeLabel)}</div>
      </div>` : ''}

      <div class="signature-grid">
        <div class="sig-card">
          <div class="sig-space"></div>
          <div class="sig-title">
            ผู้อำนวยการหรือผู้มีอำนาจลงนาม<br/>
            Authorized Signatory
          </div>
        </div>
        <div class="sig-card">
          <div class="sig-space"></div>
          <div class="sig-title">
            ผู้รับเงินได้<br/>
            Payee / Recipient
          </div>
        </div>
      </div>

      <div class="footer">
        <div>
          ออกเมื่อวันที่ ${titleDate} | ระบบ e-Tax Invoice
        </div>
        <div class="footer-right">
          <div class="cert-badge">50 ทวิ</div>
          <div>${escapeHtml(data.certificateNumber)} · ${formatDateTh(data.createdAt)}</div>
        </div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

export async function generateWhtCertificatePdf(cert: WhtPdfData): Promise<Buffer> {
  const html = buildWhtHtml(cert);

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
