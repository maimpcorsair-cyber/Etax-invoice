import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, Users, Play, Lock, Loader2, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
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
    <div className="space-y-6">
      <SectionSubNav
        items={[
          { key: 'employees', to: '/app/payroll/employees', label: isThai ? 'พนักงาน' : 'Employees', icon: Users },
          { key: 'runs', to: '/app/payroll/runs', label: isThai ? 'รอบเงินเดือน' : 'Payroll Runs', icon: Calculator },
        ]}
      />

      <header>
        <h1 className="text-2xl font-bold text-slate-900">{isThai ? 'รอบเงินเดือน' : 'Payroll Runs'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isThai
            ? 'ประมวลเงินเดือนรายเดือน — ระบบคิดภาษีหัก ณ ที่จ่าย (ภงด.1) + ประกันสังคม (สปส.) อัตโนมัติ'
            : 'Process monthly payroll — ภงด.1 + สปส. calculated automatically.'}
        </p>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4" />
          <span>{success}</span>
        </div>
      )}

      {/* Run form */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold mb-3">{isThai ? 'ประมวลผลรอบใหม่' : 'Run new payroll'}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="block text-slate-600 mb-1">{isThai ? 'ปี' : 'Year'}</span>
            <input type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} className="input w-28" />
          </label>
          <label className="text-xs">
            <span className="block text-slate-600 mb-1">{isThai ? 'เดือน' : 'Month'}</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input w-32">
              {(isThai ? TH_MONTHS : EN_MONTHS).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-slate-600 mb-1">{isThai ? 'วันที่จ่าย' : 'Pay date'}</span>
            <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="input" />
          </label>
          <button type="button" onClick={runPayroll} disabled={running} className="btn-primary text-sm disabled:opacity-60">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isThai ? 'ประมวลผล' : 'Run payroll'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {isThai
            ? 'การประมวลผลซ้ำเดือนเดิมจะแทนที่ payslip ทั้งหมดในรอบนั้น (จนกว่าจะปิดรอบ)'
            : 'Re-running the same month replaces existing payslips (until the run is finalized).'}
        </p>
      </section>

      {/* Runs list */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-semibold">{isThai ? `รอบเงินเดือนปี ${year}` : `${year} Payroll runs`}</h2>
        </div>
        {runs.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            {isThai ? 'ยังไม่มีรอบเงินเดือน — กดประมวลผลรอบแรกด้านบน' : 'No payroll runs yet — process one above.'}
          </div>
        ) : (
          <table className="min-w-full text-sm">
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
                <tr key={run.id} className={selectedRun?.id === run.id ? 'bg-emerald-50/30' : ''}>
                  <td className="px-4 py-3 font-medium">{(isThai ? TH_MONTHS : EN_MONTHS)[run.month - 1]}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(run.totalGross)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(run.totalNet)}</td>
                  <td className="px-4 py-3 text-right text-rose-600">{formatCurrency(run.totalWht)}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(run.totalSso)}</td>
                  <td className="px-4 py-3 text-center text-xs">
                    {run.status === 'draft' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{isThai ? 'ร่าง' : 'Draft'}</span>}
                    {run.status === 'finalized' && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{isThai ? 'ปิดรอบ' : 'Finalized'}</span>}
                    {run.status === 'paid' && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">{isThai ? 'จ่ายแล้ว' : 'Paid'}</span>}
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
                          <button type="button" onClick={() => downloadCsv(run.id, 'pnd1')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                            <Download className="h-3 w-3" />ภงด.1
                          </button>
                          <button type="button" onClick={() => downloadCsv(run.id, 'sso')} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100">
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
        )}
      </section>

      {/* Selected run payslips */}
      {selectedRun && payslips.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {isThai ? 'รายการ payslip' : 'Payslips'} — {(isThai ? TH_MONTHS : EN_MONTHS)[selectedRun.month - 1]} {selectedRun.year}
            </h2>
            <span className="text-xs text-slate-500">{payslips.length} {isThai ? 'รายการ' : 'rows'}</span>
          </div>
          <table className="min-w-full text-sm">
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
                  <td className="px-4 py-3 text-right">{formatCurrency(p.gross)}</td>
                  <td className="px-4 py-3 text-right text-rose-600">{formatCurrency(p.whtAmount)}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(p.ssoEmployee)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(p.pvdAmount)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(p.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
