import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, AlertTriangle, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';

// Public landing page for the magic-link cancel flow. The user clicks the
// "Cancel deletion request" button in their email, which carries an
// HMAC-signed token. This page POSTs the token to the public
// /api/account/delete/confirm-cancel endpoint and shows the result.
// No login is required — the token itself is the credential.

type Phase = 'confirming' | 'idle' | 'success' | 'error';

export default function CancelDelete() {
  const { i18n } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const isThai = i18n.language === 'th';
  const txt = (th: string, en: string) => (isThai ? th : en);

  const [phase, setPhase] = useState<Phase>(token ? 'idle' : 'error');
  const [error, setError] = useState<string | null>(token ? null : 'Missing token');
  const [companyNameTh, setCompanyNameTh] = useState<string | null>(null);

  // Guard: never auto-submit. Spec is explicit click-to-confirm so
  // accidental browser prefetch / link preview bots don't undo a real
  // deletion request without the human's intent.
  useEffect(() => {
    if (!token) {
      setError(isThai ? 'ลิงก์ไม่ถูกต้อง — ไม่มี token' : 'Invalid link — token missing');
      setPhase('error');
    }
  }, [token, isThai]);

  async function handleConfirm() {
    if (!token || phase === 'confirming') return;
    setPhase('confirming');
    setError(null);
    try {
      const res = await fetch('/api/account/delete/confirm-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCompanyNameTh(json.data?.companyNameTh ?? null);
      setPhase('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
      setPhase('error');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-2 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-sm font-semibold uppercase tracking-wide">
            {txt('PDPA · ยกเลิกคำขอลบ', 'PDPA · Cancel deletion')}
          </span>
        </div>

        {phase === 'idle' && (
          <>
            <h1 className="mt-4 text-xl font-bold text-slate-900">
              {txt('ยืนยันการยกเลิกคำขอลบบัญชี', 'Confirm cancel deletion request')}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {txt(
                'การกดยืนยันด้านล่างจะ ยกเลิก คำขอลบบัญชีที่กำลังรออยู่ และเปิดใช้งานบัญชีของคุณกลับมาทันที',
                'Clicking confirm below will cancel the pending deletion request and reactivate your account immediately.',
              )}
            </p>
            <button
              type="button"
              onClick={handleConfirm}
              className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              {txt('ยืนยันยกเลิก', 'Confirm cancel')}
            </button>
            <p className="mt-3 text-xs text-slate-500">
              {txt(
                'ไม่ต้องเข้าสู่ระบบ — ลิงก์นี้มี token ที่ลงนามไว้แล้ว',
                'No login required — this link carries a signed token.',
              )}
            </p>
          </>
        )}

        {phase === 'confirming' && (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            {txt('กำลังยกเลิก…', 'Cancelling…')}
          </div>
        )}

        {phase === 'success' && (
          <>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">
                  {txt('ยกเลิกเรียบร้อย', 'Cancelled successfully')}
                </div>
                {companyNameTh && (
                  <div className="mt-1 text-xs">
                    {txt('บัญชี', 'Workspace')}: {companyNameTh}
                  </div>
                )}
                <div className="mt-1 text-xs">
                  {txt(
                    'บัญชีของคุณถูกเปิดใช้งานกลับมาแล้ว สามารถเข้าสู่ระบบได้ตามปกติ',
                    'Your account has been reactivated. You can sign in normally.',
                  )}
                </div>
              </div>
            </div>
            <Link
              to="/login"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {txt('เข้าสู่ระบบ', 'Sign in')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">
                  {txt('ยกเลิกไม่สำเร็จ', 'Cancel failed')}
                </div>
                <div className="mt-1 text-xs">{error}</div>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              {txt(
                'หากลิงก์หมดอายุหรือถูกใช้ไปแล้ว ติดต่อ DPO ที่ ',
                'If the link is expired or already used, contact our DPO at ',
              )}
              <a href="mailto:dpo@maidomdom.com" className="text-emerald-700 underline">
                dpo@maidomdom.com
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
