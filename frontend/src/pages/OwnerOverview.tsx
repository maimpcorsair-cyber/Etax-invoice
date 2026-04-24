import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import {
  BadgePercent,
  Banknote,
  Building2,
  CreditCard,
  Loader2,
  QrCode,
  ShieldAlert,
  TicketPercent,
  Users,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

type OwnerOverviewData = {
  companyCount: number;
  userCount: number;
  customerCount: number;
  invoiceCount: number;
  activeSubscriptionCount: number;
  monthlyRecurringRevenue: number;
  annualRecurringRevenue: number;
  totalCollected: number;
  pendingSignupCount: number;
  pendingPromptPayCount: number;
  couponCount: number;
  activeCouponCount: number;
  planSummary: Record<string, number>;
  paymentChannels: Array<{ channel: string; count: number; amount: number }>;
  recentTransactions: Array<{
    id: string;
    channel: string;
    status: string;
    totalAmount: number;
    couponCode?: string | null;
    externalReference?: string | null;
    createdAt: string;
    pendingSignup?: {
      companyNameTh: string;
      adminEmail: string;
      paymentMethod: string;
    } | null;
  }>;
  recentSignups: Array<{
    id: string;
    companyNameTh: string;
    adminEmail: string;
    plan: string;
    status: string;
    paymentMethod: string;
    totalAmount?: number | null;
    createdAt: string;
  }>;
  coupons: Array<{
    id: string;
    code: string;
    name: string;
    discountType: string;
    discountValue: number;
    redeemedCount: number;
    maxRedemptions?: number | null;
    active: boolean;
  }>;
  companies: Array<{
    id: string;
    nameTh: string;
    taxId: string;
    customerCount: number;
    invoiceCount: number;
    productCount: number;
    userCount: number;
    adminCount: number;
    totalRevenue: number;
    latestInvoice?: {
      invoiceNumber: string;
      invoiceDate: string;
      total: number;
      status: string;
    } | null;
  }>;
};

type BillingSummary = {
  transactions: Array<{
    id: string;
    status: string;
    channel: string;
    totalAmount: number;
    couponCode?: string | null;
    externalReference?: string | null;
    pendingSignup?: {
      companyNameTh: string;
      adminEmail: string;
      paymentMethod: string;
      status: string;
    } | null;
  }>;
  coupons: Array<{
    id: string;
    code: string;
    name: string;
    discountType: string;
    discountValue: number;
    redeemedCount: number;
    active: boolean;
  }>;
  pendingSignups: Array<{
    id: string;
    companyNameTh: string;
    adminEmail: string;
    plan: string;
    status: string;
    paymentMethod: string;
    totalAmount?: number | null;
  }>;
};

const initialCouponForm = {
  code: '',
  name: '',
  description: '',
  discountType: 'percent',
  discountValue: '10',
  minSubtotalAmount: '',
  maxDiscountAmount: '',
  maxRedemptions: '',
  stripePromotionCodeId: '',
  active: true,
};

export default function OwnerOverview() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [savingCoupon, setSavingCoupon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<OwnerOverviewData | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [couponForm, setCouponForm] = useState(initialCouponForm);

  const loadOwnerData = useCallback(async () => {
    const [overviewRes, billingRes] = await Promise.all([
      fetch('/api/system/overview', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/billing/owner/summary', { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    const overviewJson = await overviewRes.json() as { data?: OwnerOverviewData; error?: string };
    const billingJson = await billingRes.json() as { data?: BillingSummary; error?: string };

    if (!overviewRes.ok) throw new Error(overviewJson.error ?? 'Failed to load owner overview');
    if (!billingRes.ok) throw new Error(billingJson.error ?? 'Failed to load billing summary');

    setOverview(overviewJson.data ?? null);
    setBillingSummary(billingJson.data ?? null);
  }, [token]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await loadOwnerData();
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [loadOwnerData]);

  const topMetrics = useMemo(() => {
    if (!overview) return [];
    return [
      { label: 'MRR', value: currency(overview.monthlyRecurringRevenue), icon: Banknote },
      { label: 'ARR', value: currency(overview.annualRecurringRevenue), icon: Banknote },
      { label: 'Collected', value: currency(overview.totalCollected), icon: CreditCard },
      { label: 'Active Subs', value: overview.activeSubscriptionCount.toString(), icon: Users },
      { label: 'Companies', value: overview.companyCount.toString(), icon: Building2 },
      { label: 'PromptPay Pending', value: overview.pendingPromptPayCount.toString(), icon: QrCode },
      { label: 'Coupons', value: `${overview.activeCouponCount}/${overview.couponCount}`, icon: TicketPercent },
      { label: 'Users', value: overview.userCount.toString(), icon: Users },
    ];
  }, [overview]);

  const paymentMix = useMemo(() => {
    if (!overview) return [];
    const total = overview.paymentChannels.reduce((sum, item) => sum + item.amount, 0);
    return overview.paymentChannels.map((item) => ({
      ...item,
      percent: total > 0 ? (item.amount / total) * 100 : 0,
    }));
  }, [overview]);

  const topTenants = useMemo(() => {
    if (!overview) return [];
    return [...overview.companies].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5);
  }, [overview]);

  async function createCoupon(e: FormEvent) {
    e.preventDefault();
    setSavingCoupon(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/owner/coupons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: couponForm.code,
          name: couponForm.name,
          description: couponForm.description,
          discountType: couponForm.discountType,
          discountValue: Number(couponForm.discountValue),
          minSubtotalAmount: couponForm.minSubtotalAmount ? Number(couponForm.minSubtotalAmount) : undefined,
          maxDiscountAmount: couponForm.maxDiscountAmount ? Number(couponForm.maxDiscountAmount) : undefined,
          maxRedemptions: couponForm.maxRedemptions ? Number(couponForm.maxRedemptions) : undefined,
          stripePromotionCodeId: couponForm.stripePromotionCodeId || undefined,
          active: couponForm.active,
        }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to create coupon');
      setCouponForm(initialCouponForm);
      await loadOwnerData();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingCoupon(false);
    }
  }

  async function markPromptPayPaid(id: string) {
    try {
      const res = await fetch(`/api/billing/owner/transactions/${id}/mark-paid`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to activate payment');
      await loadOwnerData();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 shadow-sm">{error}</div>;
  }

  if (!overview || !billingSummary) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">No owner data available.</div>;
  }

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Owner Control Plane</h1>
            <p className="mt-1 max-w-4xl text-sm text-slate-600">
              Built for operating the commercial side of the SaaS: revenue, tenants, subscriptions, payment channels,
              pending PromptPay approvals, and coupon operations. This stays separate from tenant workflows on purpose.
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {topMetrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} icon={metric.icon} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <Panel title="Commercial Snapshot" subtitle="Track growth, plan mix, and channel performance from one place.">
          <div className="grid gap-4 lg:grid-cols-3">
            <MiniStat label="Starter" value={(overview.planSummary.starter ?? 0).toString()} />
            <MiniStat label="Business" value={(overview.planSummary.business ?? 0).toString()} />
            <MiniStat label="Enterprise" value={(overview.planSummary.enterprise ?? 0).toString()} />
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Payment Mix</div>
              <div className="mt-4 space-y-3">
                {paymentMix.map((channel) => (
                  <div key={channel.channel}>
                    <div className="mb-1 flex items-center justify-between text-sm text-slate-700">
                      <span>{channel.channel}</span>
                      <span>{channel.percent.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.max(channel.percent, 4)}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{currency(channel.amount)} · {channel.count} transactions</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Top Revenue Tenants</div>
              <div className="mt-4 space-y-3">
                {topTenants.map((company, index) => (
                  <div key={company.id}>
                    <div className="mb-1 flex items-center justify-between text-sm text-slate-700">
                      <span>{index + 1}. {company.nameTh}</span>
                      <span>{currency(company.totalRevenue)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-sky-700"
                        style={{ width: `${Math.max((company.totalRevenue / Math.max(topTenants[0]?.totalRevenue ?? 1, 1)) * 100, 6)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Create Coupon" subtitle="Support Stripe promotion codes and PromptPay-only discounts from one form.">
          <form className="space-y-3" onSubmit={createCoupon}>
            <div className="grid gap-3 md:grid-cols-2">
              <input className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Code" value={couponForm.code} onChange={(e) => setCouponForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))} required />
              <input className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Campaign name" value={couponForm.name} onChange={(e) => setCouponForm((prev) => ({ ...prev, name: e.target.value }))} required />
              <select className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={couponForm.discountType} onChange={(e) => setCouponForm((prev) => ({ ...prev, discountType: e.target.value }))}>
                <option value="percent">Percent</option>
                <option value="fixed">Fixed amount</option>
              </select>
              <input className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" type="number" min="1" step="0.01" placeholder="Discount" value={couponForm.discountValue} onChange={(e) => setCouponForm((prev) => ({ ...prev, discountValue: e.target.value }))} required />
              <input className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Min subtotal" value={couponForm.minSubtotalAmount} onChange={(e) => setCouponForm((prev) => ({ ...prev, minSubtotalAmount: e.target.value }))} />
              <input className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Max discount" value={couponForm.maxDiscountAmount} onChange={(e) => setCouponForm((prev) => ({ ...prev, maxDiscountAmount: e.target.value }))} />
              <input className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" type="number" min="1" placeholder="Max redemptions" value={couponForm.maxRedemptions} onChange={(e) => setCouponForm((prev) => ({ ...prev, maxRedemptions: e.target.value }))} />
              <input className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Stripe promotion code id (optional)" value={couponForm.stripePromotionCodeId} onChange={(e) => setCouponForm((prev) => ({ ...prev, stripePromotionCodeId: e.target.value }))} />
            </div>
            <textarea className="min-h-[92px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Description" value={couponForm.description} onChange={(e) => setCouponForm((prev) => ({ ...prev, description: e.target.value }))} />
            <button type="submit" disabled={savingCoupon} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {savingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgePercent className="h-4 w-4" />}
              Create coupon
            </button>
          </form>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Pending Payments & Recent Transactions" subtitle="Approve PromptPay signups and monitor payment activity.">
          <div className="space-y-3">
            {billingSummary.transactions.map((transaction) => (
              <div key={transaction.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{transaction.pendingSignup?.companyNameTh ?? 'Pending signup'}</div>
                    <div className="text-xs text-slate-500">{transaction.pendingSignup?.adminEmail} · {transaction.externalReference ?? transaction.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{currency(transaction.totalAmount)}</div>
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{transaction.channel} · {transaction.status}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {transaction.couponCode && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">{transaction.couponCode}</span>}
                  {transaction.pendingSignup?.paymentMethod && <span>{transaction.pendingSignup.paymentMethod}</span>}
                </div>
                {transaction.channel === 'promptpay_qr' && transaction.status === 'awaiting_payment' && (
                  <button
                    onClick={() => markPromptPayPaid(transaction.id)}
                    className="mt-3 min-h-11 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Mark paid and activate tenant
                  </button>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Coupon Operations" subtitle="See active discounts and watch redemption health.">
          <div className="space-y-3">
            {overview.coupons.map((coupon) => (
              <div key={coupon.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{coupon.code}</div>
                    <div className="text-sm text-slate-600">{coupon.name}</div>
                  </div>
                  <div className={`rounded-full px-2.5 py-1 text-xs font-semibold ${coupon.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {coupon.active ? 'Active' : 'Inactive'}
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-600">
                  {coupon.discountType === 'percent' ? `${coupon.discountValue}% off` : `${currency(coupon.discountValue)} off`}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Redeemed {coupon.redeemedCount}{coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ''}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Recent Signups" subtitle="Track new demand regardless of payment method.">
          <SimpleTable
            headers={['Company', 'Plan', 'Payment', 'Status', 'Amount']}
            rows={overview.recentSignups.map((signup) => [
              `${signup.companyNameTh}\n${signup.adminEmail}`,
              signup.plan,
              signup.paymentMethod,
              signup.status,
              currency(signup.totalAmount ?? 0),
            ])}
          />
        </Panel>

        <Panel title="Tenant Revenue Snapshot" subtitle="Compare tenant footprint and invoice-side revenue.">
          <SimpleTable
            headers={['Company', 'Customers', 'Invoices', 'Users', 'Revenue']}
            rows={overview.companies.slice(0, 10).map((company) => [
              `${company.nameTh}\n${company.taxId}`,
              company.customerCount.toString(),
              company.invoiceCount.toString(),
              `${company.userCount} / ${company.adminCount} admin`,
              currency(company.totalRevenue),
            ])}
          />
        </Panel>
      </section>
    </div>
  );
}

function currency(value: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(value);
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div>
        <Icon className="h-4 w-4 text-slate-600" />
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-slate-600">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`} className="border-b border-slate-100 text-slate-900">
              {row.map((cell, cellIndex) => (
                <td key={`${cellIndex}-${cell}`} className="whitespace-pre-line px-3 py-3 text-sm text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
