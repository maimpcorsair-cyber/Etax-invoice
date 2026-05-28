import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, CreditCard, FileText, Loader2, Receipt, ShieldCheck, Users } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

/**
 * Per-tenant drill-down for the Owner Plane. Surfaces the information the
 * SaaS operator needs to answer "what's going on with this company?"
 * without having to switch into their account — users + last login,
 * subscription state, invoice/intake volume, billing history, cert.
 *
 * Read-only by design. Anything that mutates tenant data should still go
 * through the impersonation/switch flow (POST /api/system/tenants/:id/switch)
 * which preserves the audit trail.
 */

type Detail = {
  company: {
    id: string; nameTh: string; nameEn: string | null;
    taxId: string; branchCode: string | null;
    phone: string | null; email: string | null;
    createdAt: string;
  };
  users: Array<{
    id: string; email: string; name: string; role: string;
    lastLoginAt: string | null; isActive: boolean; createdAt: string;
  }>;
  subscription: {
    plan: string; status: string; billingInterval: string;
    currentPeriodEnd: string | null;
    stripeCustomerId: string | null; stripeSubscriptionId: string | null;
  } | null;
  invoices: {
    totalRevenue: number; totalCount: number;
    byStatus: Record<string, number>;
    latest: { invoiceNumber: string; invoiceDate: string; total: number; status: string } | null;
  };
  intakes30d: {
    byStatus: Record<string, number>;
    byDay: Array<{ day: string; count: number }>;
  };
  recentTransactions: Array<{
    id: string; channel: string; status: string; totalAmount: number;
    couponCode: string | null; externalReference: string | null; createdAt: string;
  }>;
  certificate: { configured: boolean; isDev: boolean };
};

function currency(n: number) {
  return n.toLocaleString('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });
}

function relativeTime(iso: string | null) {
  if (!iso) return 'ไม่เคย login';
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 1) return 'วันนี้';
  if (days === 1) return 'เมื่อวาน';
  if (days < 30) return `${days} วันที่แล้ว`;
  const months = Math.floor(days / 30);
  return `${months} เดือนที่แล้ว`;
}

export default function OpsCompanyDetail() {
  const { id } = useParams();
  const { token } = useAuthStore();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/system/companies/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json() as { data?: Detail; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed to load company');
        if (!cancelled) setDetail(json.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, token]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>;
  }
  if (error || !detail) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 shadow-sm">
        {error ?? 'Company not found'}
      </div>
    );
  }

  const { company, users, subscription, invoices, intakes30d, recentTransactions, certificate } = detail;
  const totalIntakes30d = Object.values(intakes30d.byStatus).reduce((a, b) => a + b, 0);
  const maxDayCount = Math.max(1, ...intakes30d.byDay.map((d) => d.count));

  return (
    <div className="space-y-6 text-slate-900">
      <Link to="/ops/overview" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to overview
      </Link>

      {/* Hero */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{company.nameTh}</h1>
              {company.nameEn && <p className="text-sm text-slate-500">{company.nameEn}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>Tax ID: {company.taxId}{company.branchCode ? ` (${company.branchCode})` : ''}</span>
                {company.email && <span>{company.email}</span>}
                {company.phone && <span>{company.phone}</span>}
                <span>Created: {new Date(company.createdAt).toLocaleDateString('th-TH')}</span>
              </div>
            </div>
          </div>
          {subscription && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <div className="text-xs uppercase tracking-wider text-slate-500">Subscription</div>
              <div className="font-semibold uppercase mt-1">{subscription.plan}</div>
              <div className="text-xs text-slate-600">
                {subscription.status} · {subscription.billingInterval}
              </div>
              {subscription.currentPeriodEnd && (
                <div className="text-xs text-slate-500 mt-1">
                  Renews: {new Date(subscription.currentPeriodEnd).toLocaleDateString('th-TH')}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Top metrics */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard icon={Users} label="Users" value={users.length.toString()} />
        <MetricCard icon={FileText} label="Invoices issued" value={invoices.totalCount.toString()} />
        <MetricCard icon={Receipt} label="Total revenue" value={currency(invoices.totalRevenue)} />
        <MetricCard icon={CreditCard} label="Intakes (30d)" value={totalIntakes30d.toString()} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {/* Users */}
        <Panel title="Users" subtitle={`${users.length} total · ordered by last login`}>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {users.length === 0 ? (
              <p className="text-sm text-slate-500">No users.</p>
            ) : users.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.name || u.email}</div>
                  <div className="text-xs text-slate-500 truncate">{u.email} · {u.role}</div>
                </div>
                <div className="text-xs text-slate-500 shrink-0 text-right">
                  <div>{relativeTime(u.lastLoginAt)}</div>
                  {!u.isActive && <span className="text-rose-600">inactive</span>}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Cert + Invoice status */}
        <Panel title="Compliance" subtitle="Certificate + invoice status">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className={`w-4 h-4 ${certificate.configured && !certificate.isDev ? 'text-emerald-600' : certificate.isDev ? 'text-amber-600' : 'text-slate-400'}`} />
                <span>Digital Certificate</span>
              </div>
              <span className="text-xs">
                {!certificate.configured && <span className="text-slate-500">not configured</span>}
                {certificate.configured && certificate.isDev && <span className="text-amber-700">dev self-signed</span>}
                {certificate.configured && !certificate.isDev && <span className="text-emerald-700">production cert</span>}
              </span>
            </div>
            {Object.entries(invoices.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="capitalize text-slate-700">{status}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
            {invoices.latest && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                Latest: <span className="font-medium text-slate-800">{invoices.latest.invoiceNumber}</span> · {currency(invoices.latest.total)} · {new Date(invoices.latest.invoiceDate).toLocaleDateString('th-TH')}
              </div>
            )}
          </div>
        </Panel>
      </section>

      {/* Intake activity chart */}
      <Panel title="LINE / OCR Activity (30 days)" subtitle="Daily intake count + status breakdown">
        {totalIntakes30d === 0 ? (
          <p className="text-sm text-slate-500">No intake activity in the last 30 days.</p>
        ) : (
          <>
            <div className="flex items-end gap-1 h-32 mb-3">
              {intakes30d.byDay.map((d) => (
                <div
                  key={d.day}
                  className="flex-1 bg-slate-700 rounded-t min-h-[2px] relative group"
                  style={{ height: `${(d.count / maxDayCount) * 100}%` }}
                  title={`${d.day}: ${d.count}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {Object.entries(intakes30d.byStatus).map(([s, n]) => (
                <span key={s}><span className="font-medium capitalize">{s}</span>: {n}</span>
              ))}
            </div>
          </>
        )}
      </Panel>

      {/* Recent transactions */}
      {recentTransactions.length > 0 && (
        <Panel title="Recent Billing Transactions" subtitle={`Last ${recentTransactions.length}`}>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left pb-2">Date</th>
                <th className="text-left pb-2">Channel</th>
                <th className="text-left pb-2">Status</th>
                <th className="text-right pb-2">Amount</th>
                <th className="text-left pb-2 pl-3">Coupon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentTransactions.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 text-slate-700">{new Date(t.createdAt).toLocaleDateString('th-TH')}</td>
                  <td className="py-2 text-slate-700">{t.channel}</td>
                  <td className="py-2"><StatusBadge status={t.status} /></td>
                  <td className="py-2 text-right font-medium">{currency(t.totalAmount)}</td>
                  <td className="py-2 pl-3 text-slate-500 text-xs">{t.couponCode ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
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

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
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

function StatusBadge({ status }: { status: string }) {
  const cls = ['paid', 'activated'].includes(status)
    ? 'bg-emerald-100 text-emerald-800'
    : status === 'awaiting_payment'
      ? 'bg-amber-100 text-amber-800'
      : ['failed', 'cancelled'].includes(status)
        ? 'bg-rose-100 text-rose-800'
        : 'bg-slate-100 text-slate-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>;
}
