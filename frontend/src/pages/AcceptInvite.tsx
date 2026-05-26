import { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

// Public landing for a team invite link. Receiver lands here from the
// invite email, picks a name + password, and joins the workspace via
// POST /api/account/accept-invite. No login required — the signed
// invite token in the URL is the credential.

type Phase = 'idle' | 'submitting' | 'success' | 'error';

export default function AcceptInvite() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const isThai = i18n.language === 'th';
  const txt = (th: string, en: string) => (isThai ? th : en);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>(token ? 'idle' : 'error');
  const [error, setError] = useState<string | null>(token ? null : 'Missing token');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || phase === 'submitting') return;
    if (name.trim().length < 1 || password.length < 8) {
      setError(txt('กรอกชื่อและรหัสผ่านอย่างน้อย 8 ตัวอักษร', 'Enter your name and a password (8+ chars)'));
      return;
    }
    setPhase('submitting');
    setError(null);
    try {
      const res = await fetch('/api/account/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPhase('success');
      // After 1.5s redirect to login
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accept failed');
      setPhase('error');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-2 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-sm font-semibold uppercase tracking-wide">
            {txt('Billboy · ยอมรับคำเชิญ', 'Billboy · Accept invite')}
          </span>
        </div>

        {phase === 'success' ? (
          <>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">{txt('เพิ่มเข้าระบบเรียบร้อย', 'Joined the workspace')}</div>
                <div className="mt-1 text-xs">{txt('กำลังพาไปหน้าเข้าสู่ระบบ...', 'Redirecting to sign-in…')}</div>
              </div>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <h1 className="text-xl font-bold text-slate-900">
              {txt('ตั้งชื่อและรหัสผ่านเพื่อเริ่มใช้งาน', 'Set your name + password to join')}
            </h1>
            <div>
              <label className="block text-sm font-medium text-slate-700">{txt('ชื่อ', 'Your name')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">{txt('ตั้งรหัสผ่าน (8 ตัวอักษรขึ้นไป)', 'Set password (8+ chars)')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={phase === 'submitting' || !token}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {phase === 'submitting'
                ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{txt('กำลังบันทึก...', 'Saving…')}</span>
                : txt('เข้าร่วมและสร้างบัญชี', 'Join workspace')}
            </button>
            <p className="text-xs text-slate-500 text-center">
              {txt('มีบัญชีอยู่แล้ว?', 'Already have an account?')}{' '}
              <Link to="/login" className="text-emerald-700 underline">{txt('เข้าสู่ระบบ', 'Sign in')}</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
