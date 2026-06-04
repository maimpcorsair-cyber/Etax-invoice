import { launchBrowser } from './browserService';
import type { Payslip, PayrollRun, Company } from '@prisma/client';

// Thai payslip (สลิปเงินเดือน) — HTML→PDF via Puppeteer, same pipeline as the
// WHT 50ทวิ generator. Payroll never produced a stored PDF before; this gives
// the audit trail one document per payslip to file under 5_เงินเดือน in Drive.

export type PayslipPdfData = Payslip & {
  payrollRun: Pick<PayrollRun, 'year' | 'month' | 'payDate'>;
  company: Pick<Company, 'nameTh' | 'nameEn' | 'taxId' | 'addressTh'>;
};

type Adjustment = { label?: string; amount?: number; type?: 'addition' | 'deduction' };

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function fmt(amount: number): string {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
}

function formatPayDate(date: Date): string {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function adjustmentsOf(payslip: Payslip): Adjustment[] {
  const raw = payslip.adjustments;
  return Array.isArray(raw) ? (raw as Adjustment[]) : [];
}

function rows(items: Array<{ label: string; amount: number }>): string {
  return items
    .filter((i) => i.amount)
    .map((i) => `<tr><td>${escapeHtml(i.label)}</td><td class="num">${fmt(i.amount)}</td></tr>`)
    .join('');
}

function buildPayslipHtml(data: PayslipPdfData): string {
  const period = `${THAI_MONTHS[(data.payrollRun.month - 1 + 12) % 12]} ${data.payrollRun.year + 543}`;
  const adjustments = adjustmentsOf(data);
  const additions = adjustments.filter((a) => a.type === 'addition').map((a) => ({ label: a.label || 'รายได้อื่น', amount: Number(a.amount || 0) }));
  const deductions = adjustments.filter((a) => a.type === 'deduction').map((a) => ({ label: a.label || 'รายการหัก', amount: Number(a.amount || 0) }));

  const earnings = rows([{ label: 'เงินเดือนพื้นฐาน', amount: data.baseSalary }, ...additions]);
  const deductionRows = rows([
    { label: 'ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1)', amount: data.whtAmount },
    { label: 'ประกันสังคม (สปส.)', amount: data.ssoEmployee },
    { label: 'กองทุนสำรองเลี้ยงชีพ (PVD)', amount: data.pvdAmount },
    ...deductions,
  ]);
  const totalDeductions = data.whtAmount + data.ssoEmployee + data.pvdAmount + deductions.reduce((s, d) => s + d.amount, 0);

  return `<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8" /><style>
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', 'TH Sarabun New', sans-serif; color: #0f172a; margin: 0; padding: 28px 32px; font-size: 13px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; }
  .company { max-width: 60%; }
  .company .name { font-size: 18px; font-weight: 700; color: #1e3a8a; }
  .company .meta { font-size: 12px; color: #475569; margin-top: 2px; }
  .title { text-align: right; }
  .title .t { font-size: 20px; font-weight: 700; }
  .title .p { font-size: 13px; color: #475569; margin-top: 2px; }
  .emp { display: flex; gap: 28px; margin: 16px 0; font-size: 13px; }
  .emp .k { color: #64748b; }
  .emp .v { font-weight: 600; }
  .cols { display: flex; gap: 20px; }
  .col { flex: 1; }
  .col h3 { font-size: 13px; margin: 0 0 6px; color: #1e3a8a; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 0; border-bottom: 1px solid #e2e8f0; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .subtotal td { font-weight: 700; border-top: 1px solid #94a3b8; border-bottom: none; }
  .net { margin-top: 18px; background: #1e3a8a; color: #fff; padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
  .net .label { font-size: 14px; }
  .net .amount { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .foot { margin-top: 18px; font-size: 11px; color: #94a3b8; }
</style></head><body>
  <div class="head">
    <div class="company">
      <div class="name">${escapeHtml(data.company.nameTh || data.company.nameEn || '')}</div>
      <div class="meta">เลขประจำตัวผู้เสียภาษี ${escapeHtml(data.company.taxId)}</div>
      ${data.company.addressTh ? `<div class="meta">${escapeHtml(data.company.addressTh)}</div>` : ''}
    </div>
    <div class="title">
      <div class="t">สลิปเงินเดือน</div>
      <div class="p">Payslip · งวด ${escapeHtml(period)}</div>
      <div class="p">วันที่จ่าย ${escapeHtml(formatPayDate(data.payrollRun.payDate))}</div>
    </div>
  </div>

  <div class="emp">
    <div><span class="k">พนักงาน</span><br/><span class="v">${escapeHtml(data.employeeName)}</span></div>
    <div><span class="k">รหัส</span><br/><span class="v">${escapeHtml(data.employeeCode)}</span></div>
    ${data.position ? `<div><span class="k">ตำแหน่ง</span><br/><span class="v">${escapeHtml(data.position)}</span></div>` : ''}
  </div>

  <div class="cols">
    <div class="col">
      <h3>รายได้</h3>
      <table>${earnings}
        <tr class="subtotal"><td>รวมรายได้ (Gross)</td><td class="num">${fmt(data.gross)}</td></tr>
      </table>
    </div>
    <div class="col">
      <h3>รายการหัก</h3>
      <table>${deductionRows}
        <tr class="subtotal"><td>รวมรายการหัก</td><td class="num">${fmt(totalDeductions)}</td></tr>
      </table>
    </div>
  </div>

  <div class="net">
    <span class="label">เงินสุทธิที่ได้รับ (Net Pay)</span>
    <span class="amount">${fmt(data.net)} บาท</span>
  </div>

  <div class="foot">
    ประกันสังคมส่วนนายจ้าง ${fmt(data.ssoEmployer)} บาท · เอกสารนี้ออกโดยระบบ Billboy เพื่อการบันทึกและตรวจสอบ (ภ.ง.ด.1)
  </div>
</body></html>`;
}

export async function generatePayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  const html = buildPayslipHtml(data);
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
