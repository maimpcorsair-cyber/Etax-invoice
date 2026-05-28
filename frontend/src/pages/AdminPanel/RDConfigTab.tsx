import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function RDConfigTab({ isThai }: { isThai: boolean; t: (k: string) => string }) {
  const { token } = useAuthStore();
  const [config, setConfig] = useState({ clientId: '', clientSecret: '', environment: 'sandbox' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok'|'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/rd-config', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => {
        const d = (j as { data?: { environment?: string; clientId?: string } }).data;
        setConfig(c => ({ ...c, environment: d?.environment ?? 'sandbox', clientId: d?.clientId ?? '' }));
      }).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  async function handleSave() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/rd-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed');
      setMsg({ type: 'ok', text: isThai ? 'บันทึกสำเร็จ' : 'Saved successfully' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-6 h-6 text-gray-400"/></div>;

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-lg text-gray-900">{isThai ? 'ตั้งค่า RD API' : 'RD API Configuration'}</h2>
      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 flex gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5"/>
        {isThai ? 'กรอก Client ID / Secret ที่ได้รับจากสรรพากรหลังได้รับอนุมัติ ตอน sandbox ปล่อยว่างไว้ได้' : 'Enter Client ID / Secret received from RD after approval. Leave blank for sandbox mock mode.'}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">{isThai ? 'สภาพแวดล้อม' : 'Environment'}</label>
          <select className="input-field" value={config.environment}
            onChange={e => setConfig(c => ({ ...c, environment: e.target.value }))}>
            <option value="sandbox">{isThai ? 'ทดสอบ (Sandbox / Mock)' : 'Sandbox (Mock)'}</option>
            <option value="production">{isThai ? 'จริง (Production)' : 'Production'}</option>
          </select>
        </div>
        <div>
          <label className="label">RD Client ID</label>
          <input className="input-field font-mono text-xs" placeholder="rd_client_xxxxx"
            value={config.clientId} onChange={e => setConfig(c => ({ ...c, clientId: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">RD Client Secret</label>
          <input type="password" className="input-field font-mono text-xs" placeholder="••••••••••••"
            value={config.clientSecret} onChange={e => setConfig(c => ({ ...c, clientSecret: e.target.value }))} />
          <p className="text-xs text-gray-400 mt-1">{isThai ? 'ข้อมูลนี้เข้ารหัสก่อนบันทึก' : 'This value is encrypted before storing'}</p>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>}
          {msg.text}
        </div>
      )}

      <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : isThai ? 'บันทึก' : 'Save'}
      </button>
    </div>
  );
}
