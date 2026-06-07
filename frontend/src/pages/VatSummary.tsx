import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Calculator, TrendingUp, TrendingDown, FileSpreadsheet, Loader2,
  ArrowRight, FolderOpen, FileText, Receipt, Link2,
} from 'lucide-react';
import { MonthEndWorkspacePreview, type MonthEndWorkspace } from '../components/monthEnd/MonthEndWorkspacePreview';
import SectionSubNav from '../components/SectionSubNav';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import type { VatSummaryData } from '../types';
import { ToastStack, type FeedbackToast } from '../components/ui/AppFeedback';

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
  const [toasts, setToasts] = useState<FeedbackToast[]>([]);

  const showToast = useCallback((toast: Omit<FeedbackToast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, toast.tone === 'error' ? 7000 : 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

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
      showToast({
        tone: 'warning',
        title: isThai ? 'แพ็กเกจนี้ยังไม่รองรับการส่งออก' : 'This plan does not support export',
        description: isThai ? 'อัปเกรดแพ็กเกจเพื่อดาวน์โหลดรายละเอียด VAT เป็นไฟล์' : 'Upgrade the plan to download VAT detail files.',
      });
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
      showToast({ tone: 'error', title: isThai ? 'ส่งออกไม่สำเร็จ' : 'Export failed' });
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
      showToast({
        tone: 'error',
        title: isThai ? 'สร้าง Audit Package ไม่สำเร็จ' : 'Audit export failed',
        description: err instanceof Error ? err.message : (isThai ? 'ไม่ทราบสาเหตุ' : 'Unknown error'),
      });
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
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <div className="space-y-4">
      <SectionSubNav
        items={[
          { key: 'financials', to: '/app/reports/financials', label: isThai ? 'งบการเงิน' : 'Financials', icon: TrendingUp },
          { key: 'vat', to: '/app/vat-summary', label: isThai ? 'สรุปภาษีมูลค่าเพิ่ม' : 'VAT Summary', icon: Calculator },
          { key: 'pp30', to: '/app/pp30', label: isThai ? 'ภพ.30' : 'PP30 Filing', icon: FileText },
          { key: 'wht', to: '/app/wht-certificates', label: isThai ? 'ภงด.3/53 (หัก ณ ที่จ่าย)' : 'WHT Certificates', icon: Receipt },
          { key: 'reconciliation', to: '/app/reports/reconciliation', label: isThai ? 'กระทบยอดธนาคาร' : 'Bank Reconciliation', icon: Link2 },
        ]}
      />
      <section className="workspace-command">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.7fr)] lg:items-stretch">
          <div className="min-w-0">
            <p className="premium-eyebrow"><Calculator className="h-3.5 w-3.5" />{isThai ? 'ความพร้อมยื่น VAT' : 'VAT Filing Readiness'}</p>
            <p className="mt-4 text-sm font-semibold text-slate-500">{periodLabel}</p>
            <h1 className="mt-1 text-xl font-bold leading-tight text-slate-950 sm:text-3xl">
              {mustPay ? (isThai ? 'ภาษีที่ต้องชำระโดยประมาณ' : 'Estimated VAT payable') : (isThai ? 'ภาษีขอคืนโดยประมาณ' : 'Estimated VAT refundable')}
            </h1>
            <div className={`mt-2 text-[2.15rem] font-bold leading-none tabular-nums sm:text-[2.5rem] ${mustPay ? 'text-rose-600' : 'text-primary-800'}`}>
              {loading ? '—' : formatCurrency(Math.abs(vatPayable))}
            </div>
            <div className="mt-3 h-px w-40 bg-slate-200" />
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:mt-5 sm:gap-3">
              <div className="border-t border-slate-200 px-1 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? 'ภาษีขาย' : 'Output VAT'}</p>
                <p className="mt-1 font-bold text-slate-950 tabular-nums">{loading ? '—' : formatCurrency(outputVat)}</p>
              </div>
              <div className="border-t border-slate-200 px-1 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? 'ภาษีซื้อ' : 'Input VAT'}</p>
                <p className="mt-1 font-bold text-slate-950 tabular-nums">{loading ? '—' : formatCurrency(inputVat)}</p>
              </div>
            </div>
          </div>
          <div className="workspace-command-rail">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isThai ? 'เลือกงวดภาษี' : 'Filing period'}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input-field">
                {(isThai ? TH_MONTHS : EN_MONTHS).map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-field">
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{isThai ? y + 543 : y}</option>
                ))}
              </select>
            </div>
            <Link
              to={`/app/pp30?year=${year}&month=${month}`}
              className="btn-primary mt-4 w-full justify-center px-4 py-2.5 text-sm"
            >
              {isThai ? 'เปิดรายงาน ภ.พ.30' : 'Open PP.30 report'}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
          <div className="rounded-[20px] border border-slate-200 bg-white/90 p-3 shadow-sm">
            <div className="mb-3 flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-700">{isThai ? 'รายการตรวจรอบภาษี' : 'Filing worklist'}</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">{isThai ? 'ตัวเลขที่ต้องเช็คก่อนยื่น' : 'Numbers to verify before filing'}</h2>
              </div>
              <p className="text-xs font-semibold text-slate-600">Output VAT - Input VAT</p>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <VatWorkItem
                icon={<TrendingUp className="h-4 w-4" />}
                label={isThai ? 'ภาษีขาย' : 'Output VAT'}
                value={formatCurrency(outputVat)}
                detail={`${data?.sales.count ?? 0} ${isThai ? 'ใบกำกับ' : 'invoices'} · ${formatCurrency(data?.sales.totalExclVat ?? 0)}`}
                actionLabel={isThai ? 'ดูขาย' : 'Sales detail'}
                actionHref="/app/invoices"
                onExport={() => handleExport('sales')}
                exporting={exporting === 'sales'}
                canExport={Boolean(policy?.canExportExcel)}
              />
              <VatWorkItem
                icon={<TrendingDown className="h-4 w-4" />}
                label={isThai ? 'ภาษีซื้อ' : 'Input VAT'}
                value={formatCurrency(inputVat)}
                detail={`${data?.purchases.count ?? 0} ${isThai ? 'ใบกำกับ' : 'invoices'} · ${formatCurrency(data?.purchases.totalExclVat ?? 0)}`}
                actionLabel={isThai ? 'ดูซื้อ' : 'Purchase detail'}
                actionHref="/app/purchase-invoices"
                onExport={() => handleExport('purchases')}
                exporting={exporting === 'purchases'}
                canExport={Boolean(policy?.canExportExcel)}
              />
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-700 text-white shadow-sm">
                  <Calculator className="h-4 w-4" />
                </span>
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  {mustPay ? (isThai ? 'ต้องชำระ' : 'Payable') : (isThai ? 'ขอคืน' : 'Refundable')}
                </p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${mustPay ? 'text-red-700' : 'text-emerald-700'}`}>
                  {formatCurrency(Math.abs(vatPayable))}
                </p>
                <Link to={`/app/pp30?year=${year}&month=${month}`} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:text-primary-900">
                  {isThai ? 'เปิด ภ.พ.30' : 'Open PP.30'}
                  <ArrowRight className="h-3.5 w-3.5" />
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
          <div className="card flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-primary-50 to-primary-50">
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
    </>
  );
}

function VatWorkItem({
  icon,
  label,
  value,
  detail,
  actionLabel,
  actionHref,
  onExport,
  exporting,
  canExport,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  actionLabel: string;
  actionHref: string;
  onExport: () => void;
  exporting: boolean;
  canExport: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-700 text-white shadow-sm">{icon}</span>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950 tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <Link to={actionHref} className="text-xs font-bold text-primary-700 hover:text-primary-900">{actionLabel}</Link>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting || !canExport}
          className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 disabled:opacity-50"
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
          Excel
        </button>
      </div>
    </div>
  );
}
