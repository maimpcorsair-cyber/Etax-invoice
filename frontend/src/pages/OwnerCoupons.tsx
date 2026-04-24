import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, ToggleLeft, ToggleRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

type BillingSummary = {
  data?: {
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
  };
};

export default function OwnerCoupons() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [coupons, setCoupons] = useState<NonNullable<BillingSummary['data']>['coupons']>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const load = useCallback(async () => {
    const res = await fetch('/api/billing/owner/summary', { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json() as BillingSummary;
    setCoupons(json.data?.coupons ?? []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleCoupon(couponId: string, active: boolean) {
    await fetch(`/api/billing/owner/coupons/${couponId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ active: !active }),
    });
    await load();
  }

  const filteredCoupons = useMemo(() => {
    const q = query.trim().toLowerCase();
    return coupons.filter((coupon) => {
      if (status === 'active' && !coupon.active) return false;
      if (status === 'inactive' && coupon.active) return false;
      if (!q) return true;
      return `${coupon.code} ${coupon.name}`.toLowerCase().includes(q);
    });
  }, [coupons, query, status]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;

  return (
    <div className="space-y-4 text-slate-900">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Coupons</h1>
        <p className="text-sm text-slate-600">Manage launch campaigns, payment-channel offers, and redemption health.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1.5fr,1fr]">
          <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search coupon code or name" className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none">
            <option value="all">All coupons</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredCoupons.map((coupon) => (
          <div key={coupon.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{coupon.code}</div>
                <div className="text-sm text-slate-600">{coupon.name}</div>
              </div>
              <button onClick={() => toggleCoupon(coupon.id, coupon.active)} className={`inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${coupon.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {coupon.active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                {coupon.active ? 'Active' : 'Inactive'}
              </button>
            </div>
            <div className="mt-3 text-sm text-slate-600">
              {coupon.discountType === 'percent' ? `${coupon.discountValue}% off` : formatCurrency(coupon.discountValue)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Redeemed {coupon.redeemedCount} times{coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ''}
            </div>
          </div>
        ))}
        {filteredCoupons.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-500 shadow-sm">No coupons matched the current filters.</div>
        )}
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value);
}
