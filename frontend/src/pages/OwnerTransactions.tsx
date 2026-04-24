import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, Download, Loader2, QrCode, Search } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

type BillingSummary = {
  data?: {
    transactions: Array<{
      id: string;
      companyId?: string | null;
      plan: string;
      channel: string;
      status: string;
      totalAmount: number;
      createdAt?: string;
      externalReference?: string | null;
      couponCode?: string | null;
      pendingSignup?: {
        companyNameTh: string;
        adminEmail: string;
        paymentMethod: string;
        status: string;
      } | null;
    }>;
  };
};

export default function OwnerTransactions() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<NonNullable<BillingSummary['data']>['transactions']>([]);
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('all');
  const [status, setStatus] = useState('all');

  const load = useCallback(async () => {
    const res = await fetch('/api/billing/owner/summary', { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json() as BillingSummary;
    setTransactions(json.data?.transactions ?? []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markPaid(id: string) {
    await fetch(`/api/billing/owner/transactions/${id}/mark-paid`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    await load();
  }

  async function exportCsv() {
    const params = new URLSearchParams();
    if (channel !== 'all') params.set('channel', channel);
    if (status !== 'all') params.set('status', status);
    const res = await fetch(`/api/billing/owner/export/transactions.csv?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'owner-transactions.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const filteredTransactions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((transaction) => {
      if (channel !== 'all' && transaction.channel !== channel) return false;
      if (status !== 'all' && transaction.status !== status) return false;
      if (!q) return true;
      const haystack = [
        transaction.pendingSignup?.companyNameTh,
        transaction.pendingSignup?.adminEmail,
        transaction.externalReference,
        transaction.companyId,
        transaction.couponCode,
        transaction.channel,
        transaction.status,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [transactions, query, channel, status]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;

  return (
    <div className="space-y-4 text-slate-900">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Transactions</h1>
            <p className="text-sm text-slate-600">Review every commercial transaction across card, Stripe PromptPay, recurring billing, and manual PromptPay.</p>
          </div>
          <button onClick={exportCsv} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1.5fr,1fr,1fr]">
          <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company, email, reference, coupon" className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
          </label>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none">
            <option value="all">All channels</option>
            <option value="stripe">Stripe card</option>
            <option value="stripe_promptpay">Stripe PromptPay</option>
            <option value="promptpay_qr">Manual PromptPay</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none">
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="activated">Activated</option>
            <option value="awaiting_payment">Awaiting payment</option>
            <option value="payment_failed">Payment failed</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </section>
      <div className="grid gap-3">
        {filteredTransactions.map((transaction) => (
          <div key={transaction.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {transaction.channel.includes('promptpay') ? <QrCode className="h-4 w-4 text-emerald-700" /> : <CreditCard className="h-4 w-4 text-sky-700" />}
                  {transaction.pendingSignup?.companyNameTh ?? transaction.companyId ?? 'Renewal transaction'}
                </div>
                <div className="text-xs text-slate-500">{transaction.externalReference ?? 'No external reference'}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{formatCurrency(transaction.totalAmount)}</div>
                <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{transaction.channel} · {transaction.status}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>{transaction.plan}</span>
              {transaction.couponCode && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">{transaction.couponCode}</span>}
              {transaction.pendingSignup?.adminEmail && <span>{transaction.pendingSignup.adminEmail}</span>}
              {transaction.createdAt && <span>{new Date(transaction.createdAt).toLocaleString('th-TH')}</span>}
            </div>
            {transaction.channel === 'promptpay_qr' && transaction.status === 'awaiting_payment' && (
              <button onClick={() => markPaid(transaction.id)} className="mt-3 min-h-11 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                Mark paid and activate tenant
              </button>
            )}
          </div>
        ))}
        {filteredTransactions.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-500 shadow-sm">No transactions matched the current filters.</div>
        )}
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value);
}
