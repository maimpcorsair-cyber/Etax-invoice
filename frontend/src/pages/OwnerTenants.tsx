import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Search } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { buildPlaneUrl } from '../lib/platform';

type OverviewResponse = {
  data?: {
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
    expiringSubscriptions: Array<{
      id: string;
      companyId: string;
      plan: string;
      status: string;
      billingInterval: string;
      currentPeriodEnd?: string | null;
      stripeCustomerId?: string | null;
    }>;
  };
};

export default function OwnerTenants() {
  const { token } = useAuthStore();
  const [data, setData] = useState<OverviewResponse['data'] | null>(null);
  const [query, setQuery] = useState('');
  const [switchingCompanyId, setSwitchingCompanyId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/system/overview', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json() as Promise<OverviewResponse>)
      .then((json) => {
        if (active) setData(json.data ?? null);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const expiringByCompany = useMemo(
    () => new Map((data?.expiringSubscriptions ?? []).map((subscription) => [subscription.companyId, subscription])),
    [data],
  );

  const filteredCompanies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.companies ?? []).filter((company) => {
      if (!q) return true;
      return `${company.nameTh} ${company.taxId}`.toLowerCase().includes(q);
    });
  }, [data, query]);

  async function switchToTenant(companyId: string) {
    if (!token) return;

    setSwitchingCompanyId(companyId);
    setSwitchError('');

    try {
      const res = await fetch(`/api/system/tenants/${companyId}/switch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as {
        data?: {
          token: string;
          user: {
            id: string;
            email: string;
            name: string;
            role: 'admin' | 'accountant' | 'viewer' | 'super_admin';
            companyId: string;
            auth?: { hasPassword: boolean; hasGoogle: boolean };
            company?: { nameTh: string; nameEn?: string | null; taxId: string };
          };
        };
        error?: string;
      };

      if (!res.ok || !json.data) {
        setSwitchError(json.error ?? 'Unable to switch to this tenant.');
        return;
      }

      window.location.href = buildPlaneUrl('/app/dashboard', 'app', {
        token: json.data.token,
        user: json.data.user,
      });
    } catch {
      setSwitchError('Unable to switch to this tenant.');
    } finally {
      setSwitchingCompanyId(null);
    }
  }

  if (!data) return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">Loading tenants...</div>;

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Tenants</h1>
        <p className="text-sm text-slate-600">Monitor company footprint, invoice activity, revenue, and renewal risk side-by-side.</p>
        {switchError && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {switchError}
          </div>
        )}
        <label className="mt-4 flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company name or tax ID" className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
        </label>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Customers</th>
                <th className="px-3 py-2">Invoices</th>
                <th className="px-3 py-2">Products</th>
                <th className="px-3 py-2">Users</th>
                <th className="px-3 py-2">Revenue</th>
                <th className="px-3 py-2">Renewal</th>
                <th className="px-3 py-2">Latest</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((company) => {
                const expiring = expiringByCompany.get(company.id);
                return (
                  <tr key={company.id} className="border-b border-slate-100">
                    <td className="px-3 py-3">
                      <div className="font-medium">{company.nameTh}</div>
                      <div className="text-xs text-slate-500">{company.taxId}</div>
                    </td>
                    <td className="px-3 py-3">{company.customerCount}</td>
                    <td className="px-3 py-3">{company.invoiceCount}</td>
                    <td className="px-3 py-3">{company.productCount}</td>
                    <td className="px-3 py-3">{company.userCount} / {company.adminCount} admin</td>
                    <td className="px-3 py-3">{formatCurrency(company.totalRevenue)}</td>
                    <td className="px-3 py-3">
                      {expiring ? (
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">{expiring.plan}</div>
                          <div className="text-xs text-slate-500">{expiring.currentPeriodEnd ? `Ends ${new Date(expiring.currentPeriodEnd).toLocaleDateString('en-GB')}` : 'No date'}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Stable</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{company.latestInvoice ? `${company.latestInvoice.invoiceNumber} · ${new Date(company.latestInvoice.invoiceDate).toLocaleDateString('en-GB')}` : 'No invoices'}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => switchToTenant(company.id)}
                        disabled={switchingCompanyId === company.id}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                        {switchingCompanyId === company.id ? 'Opening...' : 'Open App'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Expiring Subscriptions</h2>
        <p className="text-sm text-slate-600">Prioritize renewals before access lapses.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {data.expiringSubscriptions.map((subscription) => (
            <div key={subscription.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-medium">{data.companies.find((company) => company.id === subscription.companyId)?.nameTh ?? subscription.companyId}</div>
              <div className="text-sm text-slate-600">{subscription.plan} · {subscription.status}</div>
              <div className="mt-2 text-sm">{subscription.currentPeriodEnd ? `Ends ${new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB')}` : 'No renewal date'}</div>
            </div>
          ))}
          {data.expiringSubscriptions.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-500">No expiring subscriptions yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value);
}
