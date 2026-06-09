import { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

// Company info tab — loads from GET /api/admin/company on mount and PUTs
// the dirty fields back on save. The earlier placeholder version (static
// defaultValue inputs with a non-wired Save button) shipped accidentally
// when the page was scaffolded.

interface CompanyData {
  nameTh?: string;
  nameEn?: string;
  taxId?: string;
  branchCode?: string;
  branchNameTh?: string;
  branchNameEn?: string;
  addressTh?: string;
  addressEn?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export default function CompanyTab({ isThai, t }: { isThai: boolean; t: (k: string) => string }) {
  const { token } = useAuthStore();
  const [data, setData] = useState<CompanyData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/company', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => {
        const d = (j as { data?: CompanyData }).data ?? {};
        setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  function field<K extends keyof CompanyData>(key: K, value: string) {
    setData(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      setMsg({ type: 'ok', text: isThai ? 'บันทึกข้อมูลบริษัทแล้ว' : 'Company info saved' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400 motion-reduce:animate-none" aria-hidden="true" />
        <span className="sr-only">{isThai ? 'กำลังโหลดข้อมูลบริษัท' : 'Loading company information'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-lg text-gray-900">{t('admin.company')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="company-name-th">{t('customer.nameTh')}</label>
          <input id="company-name-th" className="input-field" value={data.nameTh ?? ''} onChange={e => field('nameTh', e.target.value)} autoComplete="organization" />
        </div>
        <div>
          <label className="label" htmlFor="company-name-en">{t('customer.nameEn')}</label>
          <input id="company-name-en" className="input-field" value={data.nameEn ?? ''} onChange={e => field('nameEn', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="company-tax-id">{t('customer.taxId')}</label>
          <input id="company-tax-id" className="input-field font-mono" value={data.taxId ?? ''} onChange={e => field('taxId', e.target.value)} maxLength={13} inputMode="numeric" />
        </div>
        <div>
          <label className="label" htmlFor="company-branch-code">{isThai ? 'รหัสสาขา' : 'Branch code'}</label>
          <input id="company-branch-code" className="input-field font-mono" value={data.branchCode ?? '00000'} onChange={e => field('branchCode', e.target.value)} maxLength={5} inputMode="numeric" />
        </div>
        <div>
          <label className="label" htmlFor="company-branch-name-th">{isThai ? 'ชื่อสาขา (ไทย)' : 'Branch name (TH)'}</label>
          <input id="company-branch-name-th" className="input-field" value={data.branchNameTh ?? ''} onChange={e => field('branchNameTh', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="company-branch-name-en">{isThai ? 'ชื่อสาขา (อังกฤษ)' : 'Branch name (EN)'}</label>
          <input id="company-branch-name-en" className="input-field" value={data.branchNameEn ?? ''} onChange={e => field('branchNameEn', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="company-address-th">{t('customer.addressTh')}</label>
          <textarea id="company-address-th" className="input-field" rows={2} value={data.addressTh ?? ''} onChange={e => field('addressTh', e.target.value)} autoComplete="street-address" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="company-address-en">{t('customer.addressEn')}</label>
          <textarea id="company-address-en" className="input-field" rows={2} value={data.addressEn ?? ''} onChange={e => field('addressEn', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="company-phone">{isThai ? 'โทรศัพท์' : 'Phone'}</label>
          <input id="company-phone" className="input-field" type="tel" value={data.phone ?? ''} onChange={e => field('phone', e.target.value)} autoComplete="tel" />
        </div>
        <div>
          <label className="label" htmlFor="company-email">{isThai ? 'อีเมล' : 'Email'}</label>
          <input id="company-email" className="input-field" type="email" value={data.email ?? ''} onChange={e => field('email', e.target.value)} autoComplete="email" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="company-website">{isThai ? 'เว็บไซต์' : 'Website'}</label>
          <input id="company-website" className="input-field" type="url" value={data.website ?? ''} onChange={e => field('website', e.target.value)} autoComplete="url" />
        </div>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-lg p-2 text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
          role={msg.type === 'ok' ? 'status' : 'alert'}
        >
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : t('settings.save')}
      </button>
    </div>
  );
}
