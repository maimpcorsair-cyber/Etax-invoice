import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Calculator, TrendingUp, TrendingDown, FileSpreadsheet, Loader2,
  ArrowRight, Calendar, FolderOpen,
} from 'lucide-react';
import { MonthEndWorkspacePreview, type MonthEndWorkspace } from '../components/monthEnd/MonthEndWorkspacePreview';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import type { VatSummaryData } from '../types';

const TH_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

export default function VatSummary() {
  const { isThai, formatCurrency } = useLanguage();
  const { token } = useAuthStore();
  const { policy } = useCompanyAccessPolicy();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<VatSummaryData | null>(null);
  const [monthEnd, setMonthEnd] = useState<MonthEndWorkspace | null>(null);
  const [monthEndError, setMonthEndError] = useState<string | null>(null);
  const [monthEndTab, setMonthEndTab] = useState('inputVat');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'sales' | 'purchases' | null>(null);
  const [auditExporting, setAuditExporting] = useState(false);
  const [auditUrl, setAuditUrl] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = monthRange(year, month);
      const headers = { Authorization: `Bearer ${token}` };
      const [vatRes, monthEndRes] = await Promise.all([
        fetch(`/api/vat-summary?from=${from}&to=${to}`, { headers }),
        fetch(`/api/dashboard/month-end-workspace?year=${year}&month=${month}`, { headers }),
      ]);

      if (!vatRes.ok) throw new Error(`VAT summary HTTP ${vatRes.status}`);
      const vatJson = await vatRes.json();
      setData(vatJson.data ?? null);

      if (monthEndRes.ok) {
        const monthEndJson = await monthEndRes.json() as { data: MonthEndWorkspace };
        setMonthEnd(monthEndJson.data ?? null);
        setMonthEndError(null);
      } else {
        const json = await monthEndRes.json().catch(() => ({})) as { error?: string; message?: string };
        setMonthEnd(null);
        setMonthEndError(json.error || json.message || `HTTP ${monthEndRes.status}`);
      }
    } catch (err) {
      setData(null);
      setMonthEnd(null);
      setMonthEndError(err instanceof Error ? err.message : null);
    } finally {
      setLoading(false);
    }
  }, [year, month, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleExport(kind: 'sales' | 'purchases') {
    if (!policy?.canExportExcel) {
      alert(isThai ? 'แพ็กเกจนี้ยังไม่รองรับการส่งออก' : 'This plan does not support export');
      return;
    }
    setExporting(kind);
    try {
      const { from, to } = monthRange(year, month);
      const endpoint = kind === 'sales' ? 'sales-detail' : 'purchase-detail';
      const res = await fetch(`/api/vat-summary/${endpoint}?from=${from}&to=${to}&format=excel`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vat-${kind}-${year}-${String(month).padStart(2, '0')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert(isThai ? 'ส่งออกไม่สำเร็จ' : 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  async function handleAuditExport() {
    setAuditExporting(true);
    setAuditUrl(null);
    try {
      const res = await fetch('/api/audit/export-package', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      });
      const json = await res.json() as { data?: { url: string }; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setAuditUrl(json.data?.url ?? null);
    } catch (err) {
      alert(isThai
        ? `สร้าง Audit Package ไม่สำเร็จ: ${err instanceof Error ? err.message : 'ไม่ทราบสาเหตุ'}`
        : `Audit export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setAuditExporting(false);
    }
  }

  const yearOptions: number[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) yearOptions.push(y);

  const periodLabel = isThai
    ? `${TH_MONTHS[month - 1]} ${year + 543}`
    : `${EN_MONTHS[month - 1]} ${year}`;

  const outputVat = data?.sales.outputVat ?? 0;
  const inputVat = data?.purchases.inputVat ?? 0;
  const vatPayable = data?.vatPayable ?? (outputVat - inputVat);
  const mustPay = vatPayable > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Calculator className="w-6 h-6 text-primary-600" />
          {isThai ? 'สรุปภาษี / VAT Summary' : 'VAT Summary'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isThai
            ? 'สรุปภาษีขาย (Output VAT) และภาษีซื้อ (Input VAT) ตามรอบเดือน'
            : 'Monthly summary of Output VAT (sales) and Input VAT (purchases)'}
        </p>
      </div>

      {/* Period selector */}
      <div className="card">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">
            {isThai ? 'งวด' : 'Period'}:
          </span>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="input-field w-auto"
          >
            {(isThai ? TH_MONTHS : EN_MONTHS).map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input-field w-auto"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{isThai ? y + 543 : y}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500 ml-auto">{periodLabel}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
          {/* Top row: 3 main cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Output VAT */}
            <div className="card border-l-4 border-l-green-500">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900">
                  {isThai ? 'ภาษีขาย (Output VAT)' : 'Output VAT (Sales)'}
                </h3>
              </div>
              <p className="text-2xl font-bold text-green-700">{formatCurrency(outputVat)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {data?.sales.count ?? 0} {isThai ? 'ใบกำกับ' : 'invoices'} ·
                {' '}{formatCurrency(data?.sales.totalExclVat ?? 0)} {isThai ? '(ก่อน VAT)' : 'excl. VAT'}
              </p>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <Link to="/app/invoices" className="text-xs font-medium text-primary-600 hover:underline">
                  {isThai ? 'ดูรายละเอียด' : 'View details'}
                </Link>
                <button
                  onClick={() => handleExport('sales')}
                  disabled={exporting === 'sales' || !policy?.canExportExcel}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
                >
                  {exporting === 'sales' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                  {isThai ? 'Excel' : 'Excel'}
                </button>
              </div>
            </div>

            {/* Input VAT */}
            <div className="card border-l-4 border-l-blue-500">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900">
                  {isThai ? 'ภาษีซื้อ (Input VAT)' : 'Input VAT (Purchases)'}
                </h3>
              </div>
              <p className="text-2xl font-bold text-blue-700">{formatCurrency(inputVat)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {data?.purchases.count ?? 0} {isThai ? 'ใบกำกับ' : 'invoices'} ·
                {' '}{formatCurrency(data?.purchases.totalExclVat ?? 0)} {isThai ? '(ก่อน VAT)' : 'excl. VAT'}
              </p>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <Link to="/app/purchase-invoices" className="text-xs font-medium text-primary-600 hover:underline">
                  {isThai ? 'ดูรายละเอียด' : 'View details'}
                </Link>
                <button
                  onClick={() => handleExport('purchases')}
                  disabled={exporting === 'purchases' || !policy?.canExportExcel}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
                >
                  {exporting === 'purchases' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                  Excel
                </button>
              </div>
            </div>

            {/* VAT Payable */}
            <div className={`card border-l-4 ${mustPay ? 'border-l-red-500 bg-red-50/30' : 'border-l-emerald-500 bg-emerald-50/30'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${mustPay ? 'bg-red-100' : 'bg-emerald-100'}`}>
                  <Calculator className={`w-5 h-5 ${mustPay ? 'text-red-600' : 'text-emerald-600'}`} />
                </div>
                <h3 className="font-semibold text-gray-900">
                  {mustPay
                    ? (isThai ? 'ภาษีที่ต้องชำระ' : 'VAT Payable')
                    : (isThai ? 'ภาษีที่ขอคืน' : 'VAT Refundable')}
                </h3>
              </div>
              <p className={`text-2xl font-bold ${mustPay ? 'text-red-700' : 'text-emerald-700'}`}>
                {mustPay
                  ? (isThai ? `ต้องชำระ ${formatCurrency(vatPayable)}` : formatCurrency(vatPayable))
                  : (isThai ? `ขอคืน ${formatCurrency(Math.abs(vatPayable))}` : formatCurrency(Math.abs(vatPayable)))}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {isThai ? 'Output VAT − Input VAT' : 'Output VAT − Input VAT'}
              </p>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <Link
                  to={`/app/pp30?year=${year}&month=${month}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                >
                  {isThai ? 'ดูรายงาน ภ.พ.30' : 'View PP.30 report'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* Audit Export Package */}
          <div className="card flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <FolderOpen className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  {isThai ? 'Export สำหรับ Auditor' : 'Audit Export Package'}
                </p>
                <p className="text-xs text-gray-500">
                  {isThai
                    ? 'สร้าง Google Sheet รวมภาษีซื้อ ภาษีขาย และค่าใช้จ่าย สำหรับส่งผู้สอบบัญชี'
                    : 'Creates a Google Sheet with input VAT, output VAT, and expenses for the auditor'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {auditUrl && (
                <a
                  href={auditUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {isThai ? 'เปิด Google Sheet' : 'Open Google Sheet'}
                </a>
              )}
              <button
                onClick={handleAuditExport}
                disabled={auditExporting}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                {auditExporting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <FolderOpen className="w-4 h-4" />}
                {isThai ? (auditExporting ? 'กำลังสร้าง...' : `สร้าง Audit ${periodLabel}`) : (auditExporting ? 'Creating...' : `Export ${periodLabel}`)}
              </button>
            </div>
          </div>

          {monthEnd ? (
            <MonthEndWorkspacePreview
              workspace={monthEnd}
              title={isThai ? 'ตารางปิดภาษีรายเดือน' : 'Monthly Tax Closing Workspace'}
              description={isThai
                ? 'มุมมองเดียวกับ Dashboard แต่โฟกัสงานปิดภาษี: ภาษีซื้อ ภาษีขาย ค่าใช้จ่าย เอกสารที่ต้องตรวจ และผลกระทบจากทุกโปรเจค'
                : 'The same company workspace as Dashboard, focused on tax closing: input VAT, output VAT, expenses, documents to review, and project impact.'}
              activeTab={monthEndTab}
              onTabChange={setMonthEndTab}
              formatCurrency={formatCurrency}
              isThai={isThai}
            />
          ) : monthEndError && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
              <p className="font-bold">{isThai ? 'ยังโหลดตารางปิดภาษีรายเดือนไม่สำเร็จ' : 'Monthly tax workspace is not showing yet'}</p>
              <p className="mt-1">
                {isThai
                  ? 'สรุป VAT หลักยังใช้งานได้ แต่ตารางรวมบริษัทโหลดไม่ได้ ลองรีเฟรชหน้านี้หรือเช็ค endpoint /api/dashboard/month-end-workspace'
                  : 'The main VAT summary is available, but the company sheet preview did not load. Refresh or check /api/dashboard/month-end-workspace.'}
              </p>
              <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 font-mono text-xs text-amber-900">
                {monthEndError}
              </p>
            </section>
          )}

          {/* Breakdown by VAT type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sales breakdown */}
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-green-50/40">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  {isThai ? 'แยกตามประเภท VAT — ขาย' : 'Sales — by VAT type'}
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-header">{isThai ? 'ประเภท' : 'Type'}</th>
                    <th className="table-header text-right">{isThai ? 'ก่อน VAT' : 'Excl. VAT'}</th>
                    <th className="table-header text-right">VAT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  <tr><td className="table-cell">VAT 7%</td><td className="table-cell text-right">{formatCurrency(data?.sales.byVatType.vat7.totalExclVat ?? 0)}</td><td className="table-cell text-right text-green-700">{formatCurrency(data?.sales.byVatType.vat7.vatAmount ?? 0)}</td></tr>
                  <tr><td className="table-cell">{isThai ? 'VAT 0%' : 'Zero-rated'}</td><td className="table-cell text-right">{formatCurrency(data?.sales.byVatType.vatZero.totalExclVat ?? 0)}</td><td className="table-cell text-right">{formatCurrency(data?.sales.byVatType.vatZero.vatAmount ?? 0)}</td></tr>
                  <tr><td className="table-cell">{isThai ? 'ยกเว้น VAT' : 'Exempt'}</td><td className="table-cell text-right">{formatCurrency(data?.sales.byVatType.vatExempt.totalExclVat ?? 0)}</td><td className="table-cell text-right">—</td></tr>
                </tbody>
              </table>
            </div>

            {/* Purchases breakdown */}
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-blue-50/40">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-blue-600" />
                  {isThai ? 'แยกตามประเภท VAT — ซื้อ' : 'Purchases — by VAT type'}
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-header">{isThai ? 'ประเภท' : 'Type'}</th>
                    <th className="table-header text-right">{isThai ? 'ก่อน VAT' : 'Excl. VAT'}</th>
                    <th className="table-header text-right">VAT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  <tr><td className="table-cell">VAT 7%</td><td className="table-cell text-right">{formatCurrency(data?.purchases.byVatType.vat7.totalExclVat ?? 0)}</td><td className="table-cell text-right text-blue-700">{formatCurrency(data?.purchases.byVatType.vat7.vatAmount ?? 0)}</td></tr>
                  <tr><td className="table-cell">{isThai ? 'VAT 0%' : 'Zero-rated'}</td><td className="table-cell text-right">{formatCurrency(data?.purchases.byVatType.vatZero.totalExclVat ?? 0)}</td><td className="table-cell text-right">{formatCurrency(data?.purchases.byVatType.vatZero.vatAmount ?? 0)}</td></tr>
                  <tr><td className="table-cell">{isThai ? 'ยกเว้น VAT' : 'Exempt'}</td><td className="table-cell text-right">{formatCurrency(data?.purchases.byVatType.vatExempt.totalExclVat ?? 0)}</td><td className="table-cell text-right">—</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* CTA */}
          <div className="card flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-primary-50 to-indigo-50">
            <div>
              <h3 className="font-semibold text-gray-900">
                {isThai ? 'พร้อมยื่น ภ.พ.30 แล้วหรือยัง?' : 'Ready to file PP.30?'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {isThai
                  ? 'ดูรายงาน ภ.พ.30 ที่จัดเตรียมไว้สำหรับการยื่นภาษีรายเดือน'
                  : 'View the PP.30 report prepared for monthly tax filing'}
              </p>
            </div>
            <Link
              to={`/app/pp30?year=${year}&month=${month}`}
              className="btn-primary"
            >
              {isThai ? 'ดูรายงาน ภ.พ.30 เดือนนี้' : 'View PP.30 Report'}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
