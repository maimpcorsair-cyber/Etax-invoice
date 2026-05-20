import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Edit2, Save, X, Loader2, AlertTriangle, CheckCircle2, Banknote, Calculator } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import SectionSubNav from '../components/SectionSubNav';

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  ssoNumber: string | null;
  baseSalary: number;
  bankAccount: string | null;
  bankName: string | null;
  startDate: string;
  endDate: string | null;
  hasSpouse: boolean;
  numChildren: number;
  numParents: number;
  pvdPercent: number;
  ssoMember: boolean;
  isActive: boolean;
}

type FormState = Omit<Employee, 'id'> & { id?: string };

const blankForm: FormState = {
  employeeCode: '',
  fullName: '',
  position: '',
  email: '',
  phone: '',
  nationalId: '',
  ssoNumber: '',
  baseSalary: 0,
  bankAccount: '',
  bankName: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: null,
  hasSpouse: false,
  numChildren: 0,
  numParents: 0,
  pvdPercent: 0,
  ssoMember: true,
  isActive: true,
};

export default function Employees() {
  const { i18n } = useTranslation();
  const { formatCurrency } = useLanguage();
  const token = useAuthStore((s) => s.token);
  const isThai = i18n.language === 'th';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/payroll/employees', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setEmployees(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const isEdit = !!form.id;
      const url = isEdit ? `/api/payroll/employees/${form.id}` : '/api/payroll/employees';
      const method = isEdit ? 'PATCH' : 'POST';
      // Backend Zod requires exactly 13 digits for nationalId/ssoNumber, so
      // strip dashes/spaces that Thai users naturally type (e.g.
      // "1-2345-67890-12-3"). Empty strings pass through unchanged.
      const digits = (v: string | null) => (v ? v.replace(/\D/g, '') : '');
      const payload = {
        employeeCode: form.employeeCode,
        fullName: form.fullName,
        position: form.position || '',
        email: form.email || '',
        phone: form.phone || '',
        nationalId: digits(form.nationalId),
        ssoNumber: digits(form.ssoNumber),
        baseSalary: Number(form.baseSalary),
        bankAccount: form.bankAccount || '',
        bankName: form.bankName || '',
        startDate: form.startDate,
        endDate: form.endDate || '',
        hasSpouse: form.hasSpouse,
        numChildren: Number(form.numChildren),
        numParents: Number(form.numParents),
        pvdPercent: Number(form.pvdPercent),
        ssoMember: form.ssoMember,
        isActive: form.isActive,
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        // Surface the failing field with a Thai-friendly message so the
        // user doesn't have to translate a raw Zod error.
        const details = (json as { details?: Array<{ path?: (string | number)[]; message?: string }> }).details;
        if (details && details.length > 0) {
          const fieldLabels: Record<string, { th: string; hint: string }> = {
            employeeCode: { th: 'รหัสพนักงาน', hint: 'ต้องไม่ว่าง' },
            fullName: { th: 'ชื่อ-นามสกุล', hint: 'ต้องไม่ว่าง' },
            nationalId: { th: 'เลขบัตรประชาชน', hint: 'ต้องเป็นตัวเลข 13 หลัก' },
            ssoNumber: { th: 'เลขประกันสังคม', hint: 'ต้องเป็นตัวเลข 13 หลัก' },
            email: { th: 'อีเมล', hint: 'รูปแบบอีเมลไม่ถูกต้อง' },
            baseSalary: { th: 'เงินเดือน', hint: 'ต้องเป็นตัวเลข ≥ 0' },
            startDate: { th: 'วันที่เริ่มงาน', hint: 'ต้องเป็นรูปแบบ YYYY-MM-DD' },
          };
          const fields = details
            .map((d) => {
              const key = String(d.path?.[0] ?? '');
              const lbl = fieldLabels[key];
              if (!lbl) return `${key}: ${d.message ?? ''}`;
              return isThai ? `${lbl.th} — ${lbl.hint}` : `${key}: ${d.message ?? ''}`;
            })
            .join(' · ');
          throw new Error(fields);
        }
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setSuccess(isEdit ? (isThai ? 'อัปเดตแล้ว' : 'Updated') : (isThai ? 'เพิ่มพนักงานเรียบร้อย' : 'Employee added'));
      setShowForm(false);
      setForm(blankForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionSubNav
        items={[
          { key: 'employees', to: '/app/payroll/employees', label: isThai ? 'พนักงาน' : 'Employees', icon: Users },
          { key: 'runs', to: '/app/payroll/runs', label: isThai ? 'รอบเงินเดือน' : 'Payroll Runs', icon: Calculator },
        ]}
      />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isThai ? 'พนักงาน' : 'Employees'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isThai
              ? 'ข้อมูลพนักงานใช้คำนวณภาษีหัก ณ ที่จ่าย (ภงด.1) และประกันสังคม (สปส.) ทุกเดือน'
              : 'Employee data drives the monthly Thai income-tax (ภงด.1) and social security (สปส.) calculations.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setForm(blankForm); setShowForm(true); }}
          className="btn-primary text-sm"
        >
          <Plus className="h-4 w-4" />
          {isThai ? 'เพิ่มพนักงาน' : 'Add employee'}
        </button>
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

      {showForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{form.id ? (isThai ? 'แก้ไขพนักงาน' : 'Edit employee') : (isThai ? 'เพิ่มพนักงานใหม่' : 'New employee')}</h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-900">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={isThai ? 'รหัสพนักงาน' : 'Employee code'}>
              <input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} className="input" />
            </Field>
            <Field label={isThai ? 'ชื่อ-นามสกุล' : 'Full name'}>
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" />
            </Field>
            <Field label={isThai ? 'ตำแหน่ง' : 'Position'}>
              <input value={form.position ?? ''} onChange={(e) => setForm({ ...form, position: e.target.value })} className="input" />
            </Field>
            <Field label={isThai ? 'เลขบัตรประชาชน 13 หลัก' : 'National ID (13 digits)'}>
              <input value={form.nationalId ?? ''} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} className="input font-mono" />
            </Field>
            <Field label={isThai ? 'เลขประกันสังคม' : 'SSO number'}>
              <input value={form.ssoNumber ?? ''} onChange={(e) => setForm({ ...form, ssoNumber: e.target.value })} className="input font-mono" />
            </Field>
            <Field label={isThai ? 'เงินเดือน (บาท)' : 'Base salary (THB)'}>
              <input type="number" min="0" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: Number(e.target.value) })} className="input" />
            </Field>
            <Field label={isThai ? 'ธนาคาร' : 'Bank'}>
              <input value={form.bankName ?? ''} onChange={(e) => setForm({ ...form, bankName: e.target.value })} className="input" />
            </Field>
            <Field label={isThai ? 'เลขบัญชี' : 'Account number'}>
              <input value={form.bankAccount ?? ''} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} className="input" />
            </Field>
            <Field label={isThai ? 'เริ่มงาน' : 'Start date'}>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input" />
            </Field>
            <Field label={isThai ? 'จำนวนบุตร (ลดหย่อนได้สูงสุด 3)' : 'Children (max 3 for tax)'}>
              <input type="number" min="0" max="20" value={form.numChildren} onChange={(e) => setForm({ ...form, numChildren: Number(e.target.value) })} className="input" />
            </Field>
            <Field label={isThai ? 'จำนวนบิดามารดา (ลดหย่อนได้สูงสุด 2)' : 'Parents (max 2)'}>
              <input type="number" min="0" max="2" value={form.numParents} onChange={(e) => setForm({ ...form, numParents: Number(e.target.value) })} className="input" />
            </Field>
            <Field label={isThai ? 'PVD %' : 'Provident fund %'}>
              <input type="number" min="0" max="15" step="0.5" value={form.pvdPercent} onChange={(e) => setForm({ ...form, pvdPercent: Number(e.target.value) })} className="input" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.hasSpouse} onChange={(e) => setForm({ ...form, hasSpouse: e.target.checked })} />
              {isThai ? 'มีคู่สมรส (ไม่มีรายได้)' : 'Has non-working spouse'}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ssoMember} onChange={(e) => setForm({ ...form, ssoMember: e.target.checked })} />
              {isThai ? 'อยู่ในประกันสังคม' : 'SSO member'}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              {isThai ? 'ยังทำงานอยู่' : 'Active'}
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">{isThai ? 'ยกเลิก' : 'Cancel'}</button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isThai ? 'บันทึก' : 'Save'}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
        ) : employees.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            {isThai ? 'ยังไม่มีพนักงานในระบบ — กดเพิ่มพนักงานด้านบน' : 'No employees yet — click "Add employee" above.'}
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">{isThai ? 'รหัส' : 'Code'}</th>
                <th className="px-4 py-3 text-left">{isThai ? 'ชื่อ' : 'Name'}</th>
                <th className="px-4 py-3 text-left">{isThai ? 'ตำแหน่ง' : 'Position'}</th>
                <th className="px-4 py-3 text-right">{isThai ? 'เงินเดือน' : 'Salary'}</th>
                <th className="px-4 py-3 text-center">SSO</th>
                <th className="px-4 py-3 text-center">{isThai ? 'สถานะ' : 'Status'}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => (
                <tr key={emp.id} className={!emp.isActive ? 'opacity-50' : ''}>
                  <td className="px-4 py-3 font-mono text-xs">{emp.employeeCode}</td>
                  <td className="px-4 py-3 font-medium">{emp.fullName}</td>
                  <td className="px-4 py-3 text-slate-600">{emp.position ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(emp.baseSalary)}</td>
                  <td className="px-4 py-3 text-center text-xs">
                    {emp.ssoMember ? <Banknote className="mx-auto h-4 w-4 text-emerald-600" /> : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-xs">
                    {emp.isActive
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{isThai ? 'ทำงาน' : 'Active'}</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{isThai ? 'ลาออก' : 'Inactive'}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => { setForm({ ...emp, position: emp.position ?? '', email: emp.email ?? '', phone: emp.phone ?? '', nationalId: emp.nationalId ?? '', ssoNumber: emp.ssoNumber ?? '', bankAccount: emp.bankAccount ?? '', bankName: emp.bankName ?? '', startDate: emp.startDate.slice(0, 10), endDate: emp.endDate?.slice(0, 10) ?? null }); setShowForm(true); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
                    >
                      <Edit2 className="h-3 w-3" />
                      {isThai ? 'แก้ไข' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
