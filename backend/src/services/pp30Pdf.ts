import { launchBrowser } from './browserService';
import type { Pp30SheetData } from './googleSheetsService';

// ภ.พ.30 (monthly VAT return) summary → PDF, same Puppeteer pipeline as the
// payslip / WHT generators. Filed under 9_แบบที่ยื่นแล้ว in Drive so the audit
// trail holds the figures as submitted for the period.

function fmt(amount: number): string {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPp30Html(data: Pp30SheetData & { filedAt?: Date; rdReference?: string | null }): string {
  const s = data.sales.byVatType;
  const p = data.purchases.byVatType;
  const branch = data.company.branchCode === '00000' || !data.company.branchCode
    ? 'สำนักงานใหญ่'
    : `สาขาที่ ${data.company.branchCode}`;
  const filedLine = data.filedAt
    ? `ยื่นเมื่อ ${new Date(data.filedAt).toLocaleDateString('th-TH')}${data.rdReference ? ` · เลขที่รับ ${escapeHtml(data.rdReference)}` : ''}`
    : '';

  return `<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8" /><style>
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', 'TH Sarabun New', sans-serif; color: #0f172a; margin: 0; padding: 28px 32px; font-size: 13px; }
  .head { border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; }
  .t { font-size: 20px; font-weight: 700; color: #1e3a8a; }
  .sub { font-size: 13px; color: #475569; margin-top: 2px; }
  .meta { margin: 14px 0; font-size: 13px; }
  .meta .row { margin: 2px 0; }
  .meta .k { color: #64748b; display: inline-block; min-width: 160px; }
  h3 { font-size: 13px; color: #1e3a8a; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .total td { font-weight: 700; border-top: 1px solid #94a3b8; }
  .net { margin-top: 18px; padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
  .net.pay { background: #7f1d1d; color: #fff; }
  .net.refund { background: #064e3b; color: #fff; }
  .net .amount { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .foot { margin-top: 18px; font-size: 11px; color: #94a3b8; }
</style></head><body>
  <div class="head">
    <div class="t">แบบแสดงรายการภาษีมูลค่าเพิ่ม (ภ.พ.30)</div>
    <div class="sub">VAT Return · งวดภาษี ${escapeHtml(data.period)}${filedLine ? ` · ${filedLine}` : ''}</div>
  </div>

  <div class="meta">
    <div class="row"><span class="k">ชื่อผู้ประกอบการ</span> ${escapeHtml(data.company.nameTh || data.company.nameEn || '')}</div>
    <div class="row"><span class="k">เลขประจำตัวผู้เสียภาษี</span> ${escapeHtml(data.company.taxId)} (${escapeHtml(branch)})</div>
  </div>

  <h3>ยอดขาย (Output)</h3>
  <table>
    <tr><th>ประเภท</th><th class="num">มูลค่าก่อน VAT</th><th class="num">ภาษีขาย</th></tr>
    <tr><td>ขาย VAT 7%</td><td class="num">${fmt(s.vat7.totalExclVat)}</td><td class="num">${fmt(s.vat7.vatAmount)}</td></tr>
    <tr><td>ขาย VAT 0%</td><td class="num">${fmt(s.vatZero.totalExclVat)}</td><td class="num">-</td></tr>
    <tr><td>ขายยกเว้น VAT</td><td class="num">${fmt(s.vatExempt.totalExclVat)}</td><td class="num">-</td></tr>
    <tr class="total"><td>รวมยอดขาย</td><td class="num">${fmt(data.sales.totalExclVat)}</td><td class="num">${fmt(data.summary.outputVat)}</td></tr>
  </table>

  <h3>ยอดซื้อ (Input)</h3>
  <table>
    <tr><th>ประเภท</th><th class="num">มูลค่าก่อน VAT</th><th class="num">ภาษีซื้อ</th></tr>
    <tr><td>ซื้อ VAT 7%</td><td class="num">${fmt(p.vat7.totalExclVat)}</td><td class="num">${fmt(p.vat7.vatAmount)}</td></tr>
    <tr class="total"><td>รวมภาษีซื้อที่ขอเครดิต</td><td class="num"></td><td class="num">${fmt(data.summary.inputVat)}</td></tr>
  </table>

  ${data.summary.vatPayable > 0
    ? `<div class="net pay"><span>ภาษีที่ต้องชำระ</span><span class="amount">${fmt(data.summary.vatPayable)} บาท</span></div>`
    : `<div class="net refund"><span>ภาษีที่ชำระเกิน (ขอคืน/เครดิตยกไป)</span><span class="amount">${fmt(data.summary.vatRefundable)} บาท</span></div>`}

  <div class="foot">ออกโดยระบบ Billboy เพื่อการบันทึกและตรวจสอบ — ตัวเลขสรุป ณ เวลาที่ยื่น</div>
</body></html>`;
}

export async function generatePp30Pdf(data: Pp30SheetData & { filedAt?: Date; rdReference?: string | null }): Promise<Buffer> {
  const html = buildPp30Html(data);
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
