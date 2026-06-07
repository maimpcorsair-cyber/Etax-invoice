import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, Users, Play, Lock, Loader2, AlertTriangle, CheckCircle2, Download, Wallet, Receipt, ShieldCheck, Landmark } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import SectionSubNav from '../components/SectionSubNav';

interface PayrollRun {
  id: string;
  year: number;
  month: number;
  status: 'draft' | 'finalized' | 'paid';
  payDate: string;
  totalGross: number;
  totalNet: number;
  totalWht: number;
  totalSso: number;
  finalizedAt: string | null;
}

interface Payslip {
  id: string;
  employeeName: string;
  employeeCode: string;
  position: string | null;
  baseSalary: number;
  gross: number;
  whtAmount: number;
  ssoEmployee: number;
  ssoEmployer: number;
  pvdAmount: number;
  net: number;
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PayrollRuns() {
  const { i18n } = useTranslation();
  const { formatCurrency } = useLanguage();
  const token = useAuthStore((s) => s.token);
  const isThai = i18n.language === 'th';

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [payDate, setPayDate] = useState(today.toISOString().slice(0, 10));
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const draftRuns = runs.filter((run) => run.status === 'draft');
  const finalizedRuns = runs.filter((run) => run.status === 'finalized');
  const paidRuns = runs.filter((run) => run.status === 'paid');
  const latestRun = runs[0];
  const yearlyNet = runs.reduce((sum, run) => sum + run.totalNet, 0);
  const yearlyGross = runs.reduce((sum, run) => sum + run.totalGross, 0);
  const payrollTaxDue = runs.reduce((sum, run) => sum + run.totalWht + run.totalSso, 0);
  const workItems = [
    {
      label: isThai ? 'ร่างรอปิดรอบ' : 'Draft runs',
      value: draftRuns.length,
      status: draftRuns.length > 0 ? (isThai ? 'Review' : 'Review') : (isThai ? 'Clear' : 'Clear'),
      dot: draftRuns.length > 0 ? 'bg-amber-500' : 'bg-emerald-500',
      icon: Lock,
    },
    {
      label: isThai ? 'ปิดรอบแล้ว' : 'Finalized',
      value: finalizedRuns.length,
      status: finalizedRuns.length > 0 ? (isThai ? 'Export' : 'Export') : (isThai ? 'None' : 'None'),
      dot: finalizedRuns.length > 0 ? 'bg-primary-500' : 'bg-slate-300',
      icon: ShieldCheck,
    },
    {
      label: isThai ? 'จ่ายแล้ว' : 'Paid',
      value: paidRuns.length,
      status: paidRuns.length > 0 ? (isThai ? 'Done' : 'Done') : (isThai ? 'None' : 'None'),
      dot: paidRuns.length > 0 ? 'bg-emerald-500' : 'bg-slate-300',
      icon: Wallet,
    },
    {
      label: isThai ? 'ภงด.1 + สปส.' : 'WHT + SSO',
      value: formatCurrency(payrollTaxDue),
      status: isThai ? 'Liability' : 'Liability',
      dot: payrollTaxDue > 0 ? 'bg-rose-500' : 'bg-slate-300',
      icon: Receipt,
    },
  ];

  const loadRuns = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/payroll/runs?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRuns(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [token, year]);

  useEffect(() => { void loadRuns(); }, [loadRuns]);

  async function loadPayslips(run: PayrollRun) {
    if (!token) return;
    setSelectedRun(run);
    setPayslips([]);
    try {
      const res = await fetch(`/api/payroll/runs/${run.id}/payslips`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setPayslips(json.data?.payslips ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payslips');
    }
  }

  async function runPayroll() {
    if (!token || running) return;
    setRunning(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/payroll/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ year, month, payDate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSuccess(isThai
        ? `ประมวลเรียบร้อย: ${json.data.payslipCount} ใบ · รวมจ่ายสุทธิ ${formatCurrency(json.data.totalNet)}`
        : `Run created: ${json.data.payslipCount} payslips · net ${formatCurrency(json.data.totalNet)}`);
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  }

  async function finalize(run: PayrollRun) {
    if (!token) return;
    try {
      const res = await fetch(`/api/payroll/runs/${run.id}/finalize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadRuns();
      setSuccess(isThai ? 'ปิดรอบเงินเดือนเรียบร้อย — พร้อม export' : 'Finalized — ready to export');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Finalize failed');
    }
  }

  function downloadCsv(runId: string, kind: 'pnd1' | 'sso') {
    if (!token) return;
    fetch(`/api/payroll/runs/${runId}/export/${kind}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${kind}-${selectedRun?.year}-${String(selectedRun?.month).padStart(2, '0')}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch((err) => setError(err.message));
  }

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <SectionSubNav
        items={[
          { key: 'employees', to: '/app/payroll/employees', label: isThai ? 'พนักงาน' : 'Employees', icon: Users },
          { key: 'runs', to: '/app/payroll/runs', label: isThai ? 'รอบเงินเดือน' : 'Payroll Runs', icon: Calculator },
        ]}
      />

      <section className="workspace-command">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.7fr)] lg:items-stretch">
          <div className="min-w-0">
            <p className="premium-eyebrow">{isThai ? 'Payroll Ledger' : 'Payroll Ledger'}</p>
            <div className="mt-3 flex items-center gap-3 sm:mt-4">
              <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800 ring-1 ring-primary-100 sm:inline-flex">
                <Landmark className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-slate-950 sm:text-3xl">{isThai ? 'รอบเงินเดือน' : 'Payroll Runs'}</h1>
                <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-slate-600 sm:block">
                  {isThai
                    ? 'ประมวลเงินเดือน ภงด.1 และประกันสังคม ให้เห็นยอดจ่ายสุทธิและงานที่ต้องปิดรอบ'
                    : 'Process payroll, WHT, and SSO while keeping net pay and closing work visible.'}
                </p>
              </div>
            </div>

            <div className="mt-4 sm:mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {isThai ? 'ยอดจ่ายสุทธิปีนี้' : 'Net payroll this year'}
              </p>
              <p className="mt-1 text-[2.15rem] font-bold leading-none text-primary-800 tabular-nums sm:text-[2.5rem]">
                {formatCurrency(yearlyNet)}
              </p>
              <div className="mt-3 h-px w-40 bg-slate-200" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:mt-5 sm:gap-3">
              <div className="border-t border-slate-200 px-1 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? 'Gross' : 'Gross'}</p>
                <p className="mt-1 font-bold text-slate-950 tabular-nums">{formatCurrency(yearlyGross)}</p>
              </div>
              <div className="border-t border-slate-200 px-1 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? 'รอบ' : 'Runs'}</p>
                <p className="mt-1 font-bold text-slate-950 tabular-nums">{runs.length}</p>
              </div>
            </div>
          </div>

          <div className="workspace-command-rail">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {isThai ? 'รอบเงินเดือนถัดไป' : 'Next payroll'}
            </p>
            <p className="mt-1.5 text-base font-bold text-slate-950 sm:mt-2 sm:text-lg">
              {latestRun
                ? `${(isThai ? TH_MONTHS : EN_MONTHS)[latestRun.month - 1]} ${latestRun.year}`
                : `${(isThai ? TH_MONTHS : EN_MONTHS)[month - 1]} ${year}`}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {latestRun
                ? `${isThai ? 'จ่ายสุทธิ' : 'Net'} ${formatCurrency(latestRun.totalNet)}`
                : isThai ? 'เลือกรอบแล้วประมวลเงินเดือนแรก' : 'Choose a period and run the first payroll.'}
            </p>
            <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <label className="col-span-2 min-w-0 text-xs font-semibold text-slate-600 sm:col-span-1">
                <span className="block">{isThai ? 'ปี' : 'Year'}</span>
                <input type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-field mt-1 w-full" />
              </label>
              <label className="min-w-0 text-xs font-semibold text-slate-600">
                <span className="block">{isThai ? 'เดือน' : 'Month'}</span>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input-field mt-1 w-full">
                  {(isThai ? TH_MONTHS : EN_MONTHS).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <label className="min-w-0 text-xs font-semibold text-slate-600">
                <span className="block">{isThai ? 'วันที่จ่าย' : 'Pay date'}</span>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="input-field mt-1 w-full" />
              </label>
            </div>
            <button type="button" onClick={runPayroll} disabled={running} className="btn-primary mt-3 w-full justify-center px-4 py-2.5 text-sm disabled:opacity-60">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isThai ? 'ประมวลผล' : 'Run payroll'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {workItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold leading-none text-slate-950 tabular-nums sm:text-lg">{item.value}</p>
                    <p className="mt-1 truncate text-sm font-medium text-slate-600">{item.label}</p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                  <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                  {item.status}
                </span>
              </div>
            </div>
          );
        })}
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-800 shadow-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800 shadow-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4" />
          <span>{success}</span>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-semibold">{isThai ? `รอบเงินเดือนปี ${year}` : `${year} Payroll runs`}</h2>
          <p className="text-xs text-slate-500">
            {isThai
              ? 'เลือกแถวเพื่อดู payslip หรือปิดรอบ/export ภงด.1 และ สปส.'
              : 'Select a run for payslips, finalize, or export WHT and SSO files.'}
          </p>
        </div>
        {runs.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            {isThai ? 'ยังไม่มีรอบเงินเดือน — กดประมวลผลรอบแรกด้านบน' : 'No payroll runs yet — process one above.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">{isThai ? 'เดือน' : 'Month'}</th>
                <th className="px-4 py-3 text-right">{isThai ? 'ยอดรวม' : 'Gross'}</th>
                <th className="px-4 py-3 text-right">{isThai ? 'จ่ายสุทธิ' : 'Net'}</th>
                <th className="px-4 py-3 text-right">{isThai ? 'ภงด.1' : 'WHT'}</th>
                <th className="px-4 py-3 text-right">{isThai ? 'สปส.' : 'SSO'}</th>
                <th className="px-4 py-3 text-center">{isThai ? 'สถานะ' : 'Status'}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((run) => (
                <tr key={run.id} className={selectedRun?.id === run.id ? 'bg-primary-50/40' : ''}>
                  <td className="px-4 py-3 font-medium">{(isThai ? TH_MONTHS : EN_MONTHS)[run.month - 1]}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(run.totalGross)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700 tabular-nums">{formatCurrency(run.totalNet)}</td>
                  <td className="px-4 py-3 text-right text-rose-600 tabular-nums">{formatCurrency(run.totalWht)}</td>
                  <td className="px-4 py-3 text-right text-amber-600 tabular-nums">{formatCurrency(run.totalSso)}</td>
                  <td className="px-4 py-3 text-center text-xs">
                    {run.status === 'draft' && <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-700">{isThai ? 'ร่าง' : 'Draft'}</span>}
                    {run.status === 'finalized' && <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-emerald-700">{isThai ? 'ปิดรอบ' : 'Finalized'}</span>}
                    {run.status === 'paid' && <span className="rounded-full border border-primary-200 bg-white px-2 py-0.5 text-primary-700">{isThai ? 'จ่ายแล้ว' : 'Paid'}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => loadPayslips(run)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">
                        {isThai ? 'ดูรายละเอียด' : 'View'}
                      </button>
                      {run.status === 'draft' && (
                        <button type="button" onClick={() => finalize(run)} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700">
                          <Lock className="h-3 w-3" />
                          {isThai ? 'ปิดรอบ' : 'Finalize'}
                        </button>
                      )}
                      {run.status !== 'draft' && (
                        <>
                          <button type="button" onClick={() => downloadCsv(run.id, 'pnd1')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                            <Download className="h-3 w-3" />ภงด.1
                          </button>
                          <button type="button" onClick={() => downloadCsv(run.id, 'sso')} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50">
                            <Download className="h-3 w-3" />สปส.
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      {selectedRun && payslips.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {isThai ? 'รายการ payslip' : 'Payslips'} — {(isThai ? TH_MONTHS : EN_MONTHS)[selectedRun.month - 1]} {selectedRun.year}
            </h2>
            <span className="text-xs text-slate-500">{payslips.length} {isThai ? 'รายการ' : 'rows'}</span>
          </div>
          <div className="overflow-x-auto">
          <table className="min-w-[780px] w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">{isThai ? 'พนักงาน' : 'Employee'}</th>
                <th className="px-4 py-3 text-right">{isThai ? 'ยอด' : 'Gross'}</th>
                <th className="px-4 py-3 text-right">{isThai ? 'WHT' : 'WHT'}</th>
                <th className="px-4 py-3 text-right">SSO</th>
                <th className="px-4 py-3 text-right">PVD</th>
                <th className="px-4 py-3 text-right">{isThai ? 'สุทธิ' : 'Net'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payslips.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.employeeName}</div>
                    <div className="text-xs text-slate-500">{p.employeeCode}{p.position ? ` · ${p.position}` : ''}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(p.gross)}</td>
                  <td className="px-4 py-3 text-right text-rose-600 tabular-nums">{formatCurrency(p.whtAmount)}</td>
                  <td className="px-4 py-3 text-right text-amber-600 tabular-nums">{formatCurrency(p.ssoEmployee)}</td>
                  <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{formatCurrency(p.pvdAmount)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700 tabular-nums">{formatCurrency(p.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}
    </div>
  );
}
