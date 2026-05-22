import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, CheckCircle, Building2, AlertCircle } from 'lucide-react';

// /portal — entry page. Customer types their email, gets a magic-link
// in their inbox, then clicks through to /portal/verify?token=...
// This is the BUYER's view of documents the seller issued to them — NOT
// the Billboy admin login (that lives at /login).

export default function CustomerPortalLanding() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/customer-portal/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ส่งลิงก์ไม่สำเร็จ');
      setSent(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white mb-4">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Portal</h1>
          <p className="text-sm text-slate-500 mt-1">
            สำหรับ <strong>ลูกค้า</strong> ที่ต้องการดูเอกสารที่ผู้ขายออกให้
          </p>
          <p className="text-xs text-slate-400 mt-2">
            ใบเสนอราคา · ใบกำกับภาษี · ใบเสร็จ · ใบส่งของ
          </p>
        </div>

        {/* Helper note — disambiguates the page from the admin login */}
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-amber-900">
            <strong>ไม่ใช่หน้าเข้าระบบของผู้ขาย</strong> — ถ้าคุณเป็นเจ้าของบัญชี Billboy (ออกใบกำกับ) ให้ใช้ <Link to="/login" className="underline font-semibold">หน้าเข้าระบบหลัก</Link> แทน
          </div>
        </div>

        <div className="card">
          {sent ? (
            <div className="py-6 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h2 className="font-semibold text-slate-900">ตรวจอีเมลของคุณ</h2>
              <p className="text-sm text-slate-500">
                ถ้าอีเมลนี้มีอยู่ในระบบของผู้ขายรายใด เราจะส่งลิงก์เปิดพอร์ทัลไปให้ ลิงก์จะหมดอายุภายใน 14 วัน
              </p>
              <button
                onClick={() => { setSent(false); setEmail(''); }}
                className="text-sm text-indigo-600 hover:underline mt-2"
              >
                ส่งลิงก์ใหม่
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">อีเมลของคุณ</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="input-field pl-9 w-full"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  ใส่อีเมลที่คุณให้ผู้ขายไว้สำหรับออกใบกำกับภาษี
                </p>
              </div>
              {err && (
                <div className="text-sm text-rose-600 bg-rose-50 p-2 rounded">{err}</div>
              )}
              <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                ส่งลิงก์เปิดพอร์ทัล
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by <span className="font-semibold">Billboy</span> — ไม่ต้องสมัครสมาชิก ไม่มีรหัสผ่าน
        </p>
      </div>
    </div>
  );
}
