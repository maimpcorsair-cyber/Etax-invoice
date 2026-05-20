import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle, Copy, Loader2, Trash2, XCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function EmailDomainTab({ isThai }: { isThai: boolean }) {
  const { token } = useAuthStore();
  type DnsRecord = { record?: string; name: string; type: string; value: string; status?: string };
  type DomainState = {
    configured: boolean;
    domain?: string;
    status?: 'pending' | 'verified' | 'failed' | string;
    verifiedAt?: string | null;
    dnsRecords?: DnsRecord[];
    message?: string;
  };
  const [state, setState] = useState<DomainState | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok'|'err'|'info'; text: string } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  async function reload() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/email-domain', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json() as { data?: DomainState; error?: string; code?: string };
      if (!res.ok) {
        if (json.code === 'RESEND_NOT_CONFIGURED') {
          setMsg({ type: 'info', text: isThai ? 'ยังไม่ได้ตั้ง Resend API key — admin ของระบบต้องตั้ง RESEND_API_KEY บน server ก่อน' : 'Resend API key not configured on the server — ask the platform admin to set RESEND_API_KEY before using this feature.' });
          setState({ configured: false });
          return;
        }
        throw new Error(json.error ?? 'Failed to load');
      }
      setState(json.data ?? { configured: false });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally { setLoading(false); }
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  async function handleAdd() {
    const domain = input.trim().toLowerCase();
    if (!domain) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/email-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ domain }),
      });
      const json = await res.json() as { data?: DomainState; error?: string; code?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setState(json.data ?? null);
      setInput('');
      setMsg({ type: 'ok', text: isThai ? '✅ เพิ่ม domain แล้ว — ก๊อป DNS records ไปตั้งที่ DNS provider ของคุณ' : '✅ Domain added — copy the DNS records below into your DNS provider.' });
    } catch (e) { setMsg({ type: 'err', text: (e as Error).message }); }
    finally { setSaving(false); }
  }

  async function handleVerify() {
    setVerifying(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/email-domain/verify', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { data?: { status?: string; verifiedAt?: string; dnsRecords?: DnsRecord[] }; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setState((prev) => prev ? ({ ...prev, status: json.data?.status, verifiedAt: json.data?.verifiedAt ?? null, dnsRecords: json.data?.dnsRecords ?? prev.dnsRecords }) : prev);
      const verified = json.data?.status === 'verified';
      setMsg({
        type: verified ? 'ok' : 'info',
        text: verified
          ? (isThai ? '🎉 verify สำเร็จ — ตั้งแต่นี้อีเมลใบกำกับจะส่งจาก noreply@' + (state?.domain ?? '') : '🎉 Verified — invoice emails will now send from noreply@' + (state?.domain ?? ''))
          : (isThai ? 'ยังไม่ verify — DNS อาจยัง propagate ไม่เสร็จ ลองรอ 5-15 นาทีแล้วกดอีกครั้ง' : 'Not verified yet — DNS may still be propagating. Wait 5–15 min and try again.'),
      });
    } catch (e) { setMsg({ type: 'err', text: (e as Error).message }); }
    finally { setVerifying(false); }
  }

  async function handleDisconnect() {
    if (!window.confirm(isThai ? 'ยกเลิก custom domain? อีเมลจะกลับไปส่งจาก domain ของ Billboy' : 'Disconnect custom domain? Emails will revert to the Billboy default.')) return;
    setDisconnecting(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/email-domain', {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed');
      setState({ configured: false });
      setMsg({ type: 'ok', text: isThai ? 'ยกเลิกแล้ว — กลับไปใช้ domain default' : 'Disconnected — back to platform default.' });
    } catch (e) { setMsg({ type: 'err', text: (e as Error).message }); }
    finally { setDisconnecting(false); }
  }

  const copyValue = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-semibold text-lg text-gray-900">
          {isThai ? '📧 ส่งอีเมลจาก domain ของคุณ' : '📧 Send email from your domain'}
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          {isThai
            ? 'ลูกค้าจะเห็นอีเมลใบกำกับมาจาก noreply@yourdomain.com แทน noreply@billboy.com — ดูน่าเชื่อถือ + เป็นมืออาชีพมากขึ้น'
            : 'Recipients will see invoice emails coming from noreply@yourdomain.com instead of noreply@billboy.com — looks more credible and on-brand.'}
        </p>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 text-sm p-3 rounded-lg ${
          msg.type === 'ok' ? 'bg-green-50 text-green-700' :
          msg.type === 'err' ? 'bg-red-50 text-red-700' :
          'bg-amber-50 text-amber-700'
        }`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> :
           msg.type === 'err' ? <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> :
           <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : !state?.configured ? (
        <div className="space-y-3">
          <label className="label">{isThai ? 'Domain ที่ต้องการใช้ส่งอีเมล' : 'Domain to send from'}</label>
          <div className="flex gap-2">
            <input
              className="input-field flex-1"
              placeholder="yourcompany.com"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
            />
            <button className="btn-primary" onClick={() => void handleAdd()} disabled={saving || !input.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isThai ? 'เพิ่ม' : 'Add')}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {isThai
              ? 'ใส่ domain ของบริษัทคุณเอง เช่น "siamtech.co.th" — คุณต้องเป็นเจ้าของ + เข้าถึง DNS ของ domain นี้ได้'
              : 'Enter a domain you own and can edit DNS records for, e.g. "siamtech.co.th".'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50">
            <div>
              <div className="font-semibold text-gray-900 flex items-center gap-2">
                {state.domain}
                {state.status === 'verified' ? <span className="badge-success">{isThai ? 'พร้อมใช้' : 'Verified'}</span>
                  : state.status === 'failed' ? <span className="badge-warn">Failed</span>
                  : <span className="badge-info">{isThai ? 'รอ verify' : 'Pending'}</span>}
              </div>
              {state.verifiedAt && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {isThai ? 'verify เมื่อ ' : 'Verified at '}{new Date(state.verifiedAt).toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {state.status !== 'verified' && (
                <button className="btn-primary" onClick={() => void handleVerify()} disabled={verifying}>
                  {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : (isThai ? 'ตรวจสอบ DNS' : 'Verify')}
                </button>
              )}
              <button className="btn-secondary text-red-600" onClick={() => void handleDisconnect()} disabled={disconnecting}>
                {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {state.dnsRecords && state.dnsRecords.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">
                {isThai
                  ? 'ตั้ง DNS records เหล่านี้ที่ DNS provider ของ domain (Cloudflare / Route53 / DNS ของผู้ให้บริการ domain)'
                  : 'Add these DNS records at your domain registrar (Cloudflare / Route53 / your DNS host):'}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="text-left px-2 py-1.5">Type</th>
                      <th className="text-left px-2 py-1.5">Name</th>
                      <th className="text-left px-2 py-1.5">Value</th>
                      <th className="text-left px-2 py-1.5">{isThai ? 'สถานะ' : 'Status'}</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.dnsRecords.map((rec, idx) => (
                      <tr key={idx} className="border-t border-gray-200">
                        <td className="px-2 py-1.5 font-mono">{rec.type}</td>
                        <td className="px-2 py-1.5 font-mono break-all">{rec.name}</td>
                        <td className="px-2 py-1.5 font-mono break-all max-w-md">{rec.value}</td>
                        <td className="px-2 py-1.5">
                          {rec.status === 'verified'
                            ? <span className="badge-success">OK</span>
                            : <span className="badge-info">{rec.status ?? '—'}</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          <button onClick={() => void copyValue(rec.value, idx)} className="text-primary-600 hover:text-primary-800">
                            {copied === idx ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500">
                {isThai
                  ? 'DNS propagate มัก 5-15 นาที (บาง provider ถึง 24 ชม.) หลังตั้งแล้วกด "ตรวจสอบ DNS"'
                  : 'DNS propagation usually takes 5–15 minutes (up to 24 hours on some providers). Click Verify after adding the records.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
