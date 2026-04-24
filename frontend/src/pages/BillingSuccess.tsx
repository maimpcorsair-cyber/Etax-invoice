import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type CheckoutStatus = {
  status: 'pending' | 'paid' | 'activated' | 'expired' | 'failed';
  plan: string;
  companyNameTh: string;
  adminEmail: string;
  activatedAt?: string | null;
  nextStep: string;
};

export default function BillingSuccess() {
  const { i18n } = useTranslation();
  const isThai = i18n.language === 'th';
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const sessionId = params.get('session_id');

  useEffect(() => {
    let timer: number | undefined;

    async function loadStatus() {
      if (!sessionId) {
        setError('Missing checkout session');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/billing/checkout-status?session_id=${encodeURIComponent(sessionId)}`);
        const json = await res.json() as { data?: CheckoutStatus; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed to verify payment');
        setStatus(json.data);

        if (json.data.status !== 'activated') {
          timer = window.setTimeout(loadStatus, 2500);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    void loadStatus();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)] flex items-center justify-center px-4">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isThai ? 'ชำระเงินสำเร็จ' : 'Payment successful'}
          </h1>
          <p className="mt-2 text-gray-600">
            {isThai
              ? 'เรากำลังเปิดสิทธิ์ระบบและสร้างบัญชีผู้ดูแลของคุณ'
              : 'We are provisioning your subscription and admin account.'}
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-slate-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            {isThai ? 'กำลังยืนยันการชำระเงิน...' : 'Verifying your payment...'}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && status && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 mb-1">{isThai ? 'บริษัท' : 'Company'}</p>
                  <p className="font-semibold text-gray-900">{status.companyNameTh}</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-1">{isThai ? 'แพ็กเกจ' : 'Plan'}</p>
                  <p className="font-semibold text-gray-900 capitalize">{status.plan}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-gray-500 mb-1">{isThai ? 'อีเมลผู้ดูแล' : 'Admin email'}</p>
                  <p className="font-semibold text-gray-900">{status.adminEmail}</p>
                </div>
              </div>
            </div>

            <div className={`rounded-2xl px-5 py-4 text-sm ${
              status.status === 'activated'
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              {status.status === 'activated'
                ? (isThai
                  ? 'บริษัทและบัญชีผู้ดูแลถูกเปิดใช้งานแล้ว ใช้อีเมล Google เดียวกับที่ชำระเงินเพื่อล็อกอินได้ทันที'
                  : 'Your company and admin account are now active. Use the same Google email from checkout to sign in immediately.')
                : (isThai
                  ? 'ระบบได้รับการชำระเงินแล้วและกำลังเปิดสิทธิ์ให้อัตโนมัติ หน้านี้จะอัปเดตเอง'
                  : 'Your payment is recorded and provisioning is in progress. This page refreshes automatically.')}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/login" className="btn-primary lg justify-center flex-1">
                {isThai ? 'ไปหน้าเข้าสู่ระบบ' : 'Go to login'}
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link to="/" className="btn-secondary lg justify-center flex-1">
                {isThai ? 'กลับหน้าแรก' : 'Back to home'}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
