import { useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useCompanyAccessPolicy } from '../../hooks/useCompanyAccessPolicy';
import { ConfirmDialog, type ConfirmDialogState } from '../../components/ui/AppFeedback';

export default function BillingTab({ isThai }: { isThai: boolean }) {
  const { token } = useAuthStore();
  const { policy } = useCompanyAccessPolicy();
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [overageCharging, setOverageCharging] = useState(false);
  const [subscription, setSubscription] = useState<null | {
    plan: string;
    status: string;
    billingInterval: string;
    docLimit?: number | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd: boolean;
    activatedAt?: string | null;
  }>(null);
  const [overage, setOverage] = useState<null | {
    plan: string;
    planLabel: string;
    periodStart: string;
    periodEnd: string;
    includedDocuments?: number | null;
    usedDocuments: number;
    remainingDocuments?: number | null;
    overageDocuments: number;
    unitPriceThb: number;
    estimatedOverageThb: number;
    billable: boolean;
    status: 'unlimited' | 'overage' | 'near_limit' | 'ok';
    autoChargeEnabled: boolean;
    existingCharge?: {
      id: string;
      status: string;
      totalAmount: number;
      externalReference?: string | null;
      createdAt: string;
    } | null;
  }>(null);
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  useEffect(() => {
    let active = true;

    async function loadBilling() {
      try {
        const [subscriptionRes, overageRes] = await Promise.all([
          fetch('/api/billing/subscription', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/billing/usage-overage', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const subscriptionJson = await subscriptionRes.json() as { data?: typeof subscription; error?: string };
        const overageJson = await overageRes.json() as { data?: typeof overage; error?: string };
        if (!subscriptionRes.ok) throw new Error(subscriptionJson.error ?? 'Failed to load billing');
        if (!overageRes.ok) throw new Error(overageJson.error ?? 'Failed to load overage usage');
        if (active) {
          setSubscription(subscriptionJson.data ?? null);
          setOverage(overageJson.data ?? null);
        }
      } catch (err) {
        if (active) setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBilling();
    return () => { active = false; };
  }, [token]);

  async function openPortal() {
    setPortalLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/portal-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { data?: { url?: string }; error?: string };
      if (!res.ok || !json.data?.url) throw new Error(json.error ?? 'Unable to open billing portal');
      window.location.href = json.data.url;
    } catch (err) {
      setError((err as Error).message);
      setPortalLoading(false);
    }
  }

  async function chargeOverage() {
    setConfirmDialog(null);
    setOverageCharging(true);
    setError('');
    try {
      const res = await fetch('/api/billing/usage-overage/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirm: 'CHARGE_OVERAGE' }),
      });
      const json = await res.json() as { data?: unknown; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Unable to charge overage');
      const refreshed = await fetch('/api/billing/usage-overage', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const refreshedJson = await refreshed.json() as { data?: typeof overage; error?: string };
      if (!refreshed.ok) throw new Error(refreshedJson.error ?? 'Failed to refresh overage usage');
      setOverage(refreshedJson.data ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOverageCharging(false);
    }
  }

  function requestChargeOverage() {
    setConfirmDialog({
      tone: 'warning',
      title: isThai ? 'สร้างรายการเก็บเงินเอกสารเกินแพ็กเกจ?' : 'Charge document overage?',
      description: isThai
        ? 'ระบบจะสร้างรายการเก็บเงินสำหรับจำนวนเอกสารที่เกินแพ็กเกจในรอบนี้'
        : 'This creates a billing charge for documents above the package limit in this period.',
      confirmLabel: isThai ? 'ยืนยันเก็บเงิน' : 'Confirm charge',
      cancelLabel: isThai ? 'ยกเลิก' : 'Cancel',
      detail: overage ? (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-500">{isThai ? 'เอกสารเกิน' : 'Overage documents'}</p>
            <p className="mt-1 font-bold text-slate-900">{overage.overageDocuments.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-slate-500">{isThai ? 'ยอดประมาณการ' : 'Estimated charge'}</p>
            <p className="mt-1 font-bold text-slate-900">฿{overage.estimatedOverageThb.toLocaleString()}</p>
          </div>
        </div>
      ) : undefined,
      onConfirm: () => void chargeOverage(),
      onCancel: () => setConfirmDialog(null),
    });
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-5">
      <ConfirmDialog dialog={confirmDialog} />
      <div>
        <h2 className="font-semibold text-lg text-gray-900">{isThai ? 'แพ็กเกจและการชำระเงิน' : 'Billing & Plan'}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {isThai ? 'ดูสถานะแพ็กเกจปัจจุบันและเปิด Stripe customer portal เพื่อจัดการการชำระเงิน' : 'Review your active plan and open the Stripe customer portal to manage billing.'}
        </p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!subscription ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
          {policy?.plan === 'free'
            ? (isThai ? 'บริษัทนี้ใช้แพ็กเกจ Free อยู่ สามารถอัปเกรดเป็น Starter หรือ Business เพื่อปลดล็อกฟีเจอร์เพิ่มได้' : 'This company is on the Free plan. Upgrade to Starter or Business to unlock more features.')
            : (isThai ? 'บริษัทยังไม่มีข้อมูลสมาชิกแบบชำระเงิน' : 'This company does not have an active paid subscription yet.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-2">{isThai ? 'แพ็กเกจปัจจุบัน' : 'Current plan'}</p>
            <p className="text-3xl font-bold text-gray-900 capitalize">{subscription.plan}</p>
            <p className="mt-2 text-sm text-gray-600">
              {subscription.docLimit
                ? (isThai ? `รองรับสูงสุด ${subscription.docLimit.toLocaleString()} เอกสาร/เดือน` : `Up to ${subscription.docLimit.toLocaleString()} documents per month`)
                : (isThai ? 'ไม่จำกัดจำนวนเอกสาร' : 'Unlimited documents')}
            </p>
          </div>

          <div className="card">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-2">{isThai ? 'สถานะสมาชิก' : 'Subscription status'}</p>
            <p className="text-3xl font-bold text-gray-900">{subscription.status}</p>
            <p className="mt-2 text-sm text-gray-600">
              {subscription.currentPeriodEnd
                ? (isThai
                  ? `รอบบิลปัจจุบันสิ้นสุด ${new Date(subscription.currentPeriodEnd).toLocaleDateString('th-TH')}`
                  : `Current billing period ends ${new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB')}`)
                : (isThai ? 'ยังไม่มีวันสิ้นสุดรอบบิล' : 'No billing period end date yet')}
            </p>
          </div>
        </div>
      )}

      {overage && (
        <div className="card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-2">{isThai ? 'เอกสารเกินแพ็กเกจ' : 'Document overage'}</p>
              <p className="text-2xl font-bold text-gray-900">
                {overage.overageDocuments.toLocaleString()} {isThai ? 'เอกสาร' : 'docs'}
                <span className="ml-2 text-base font-semibold text-gray-500">/ ฿{overage.estimatedOverageThb.toLocaleString()}</span>
              </p>
              <p className="mt-2 text-sm text-gray-600">
                {isThai
                  ? `ใช้ ${overage.usedDocuments.toLocaleString()} จาก ${overage.includedDocuments?.toLocaleString() ?? 'ไม่จำกัด'} เอกสารในรอบนี้`
                  : `Used ${overage.usedDocuments.toLocaleString()} of ${overage.includedDocuments?.toLocaleString() ?? 'unlimited'} documents this period`}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {isThai ? 'ราคาเอกสารเกิน' : 'Overage unit price'} ฿{overage.unitPriceThb.toLocaleString()} / {isThai ? 'เอกสาร' : 'doc'}
                {' · '}
                {new Date(overage.periodStart).toLocaleDateString(isThai ? 'th-TH' : 'en-GB')} - {new Date(overage.periodEnd).toLocaleDateString(isThai ? 'th-TH' : 'en-GB')}
              </p>
              {overage.existingCharge && (
                <p className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                  {isThai ? 'มีรายการเก็บเงินแล้ว' : 'Charge created'}: {overage.existingCharge.status}
                </p>
              )}
              {!overage.autoChargeEnabled && (
                <p className="mt-2 text-xs text-amber-700">
                  {isThai
                    ? 'ยังปิดโหมดตัดเงินจริงอยู่ ต้องเปิด OVERAGE_BILLING_AUTO_CHARGE_ENABLED=true ก่อนใช้งานจริง'
                    : 'Real auto charge is disabled until OVERAGE_BILLING_AUTO_CHARGE_ENABLED=true is set.'}
                </p>
              )}
            </div>
            <button
              className="btn-primary"
              onClick={requestChargeOverage}
              disabled={!overage.billable || overageCharging || !!overage.existingCharge}
            >
              {overageCharging ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {isThai ? 'สร้างรายการเก็บเงินเกินแพ็กเกจ' : 'Charge overage'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button className="btn-primary" onClick={openPortal} disabled={portalLoading || !subscription}>
          {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {isThai ? 'จัดการบัตรและใบเสร็จใน Stripe' : 'Manage cards and invoices in Stripe'}
        </button>
      </div>
    </div>
  );
}
