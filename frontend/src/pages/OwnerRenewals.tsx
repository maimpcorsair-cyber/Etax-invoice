import { useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, Mail } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

type OverviewResponse = {
  data?: {
    companies: Array<{ id: string; nameTh: string }>;
    expiringSubscriptions: Array<{
      id: string;
      companyId: string;
      plan: string;
      status: string;
      currentPeriodEnd?: string | null;
    }>;
  };
};

export default function OwnerRenewals() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OverviewResponse['data'] | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/system/overview', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json() as Promise<OverviewResponse>)
      .then((json) => {
        setData(json.data ?? null);
        setLoading(false);
      });
  }, [token]);

  const companyNames = useMemo(() => Object.fromEntries((data?.companies ?? []).map((company) => [company.id, company.nameTh])), [data]);

  async function createRenewalSession(companyId: string, paymentMethod: 'stripe' | 'stripe_promptpay') {
    const res = await fetch(`/api/billing/owner/renewals/${companyId}/create-session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentMethod }),
    });
    const json = await res.json() as { data?: { url?: string } };
    if (json.data?.url) {
      setLinks((prev) => ({ ...prev, [companyId]: json.data!.url! }));
      setMessages((prev) => ({ ...prev, [companyId]: 'Renewal checkout created and emailed to the tenant.' }));
    }
  }

  async function sendReminder(companyId: string, paymentMethod: 'stripe' | 'stripe_promptpay') {
    const res = await fetch(`/api/billing/owner/renewals/${companyId}/send-reminder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentMethod }),
    });
    const json = await res.json() as { data?: { renewalUrl?: string | null; email?: string }; error?: string };
    if (json.data?.renewalUrl) {
      setLinks((prev) => ({ ...prev, [companyId]: json.data!.renewalUrl! }));
    }
    setMessages((prev) => ({ ...prev, [companyId]: json.error ?? `Reminder sent to ${json.data?.email ?? 'tenant billing email'}.` }));
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  if (!data) return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">No renewal data available.</div>;

  return (
    <div className="space-y-4 text-slate-900">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Renewals</h1>
        <p className="text-sm text-slate-600">
          Generate renewal checkout links for expiring tenants and send reminders directly from owner control plane.
        </p>
      </section>
      <div className="grid gap-3">
        {data.expiringSubscriptions.map((subscription) => (
          <div key={subscription.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium">{companyNames[subscription.companyId] ?? subscription.companyId}</div>
                <div className="text-sm text-slate-600">{subscription.plan} · {subscription.status}</div>
                <div className="text-xs text-slate-500">{subscription.currentPeriodEnd ? `Ends ${new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB')}` : 'No period end'}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => createRenewalSession(subscription.companyId, 'stripe')} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Card checkout
                </button>
                <button onClick={() => createRenewalSession(subscription.companyId, 'stripe_promptpay')} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  PromptPay checkout
                </button>
                <button onClick={() => sendReminder(subscription.companyId, 'stripe')} className="min-h-11 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                  <Mail className="mr-2 inline h-4 w-4" />
                  Send reminder
                </button>
              </div>
            </div>
            {links[subscription.companyId] && (
              <a href={links[subscription.companyId]} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                <Link2 className="h-4 w-4" />
                Open renewal checkout
              </a>
            )}
            {messages[subscription.companyId] && (
              <p className="mt-3 text-sm text-slate-600">{messages[subscription.companyId]}</p>
            )}
          </div>
        ))}
        {data.expiringSubscriptions.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-500 shadow-sm">No expiring subscriptions found.</div>
        )}
      </div>
    </div>
  );
}
