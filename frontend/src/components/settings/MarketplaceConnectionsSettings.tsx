import { useCallback, useEffect, useState } from 'react';
import { Loader2, Store, CheckCircle2, Clock } from 'lucide-react';
import type { MarketplaceConnectionInfo } from '../../types';

// Marketplace connection status board. Scaffold only — live "Connect" (OAuth)
// is enabled per platform once partner credentials are configured on the server.
// Until then channels show their readiness so the owner knows what's coming.

interface Props {
  token: string | null;
  isThai: boolean;
}

export default function MarketplaceConnectionsSettings({ token, isThai }: Props) {
  const [rows, setRows] = useState<MarketplaceConnectionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/marketplace/connections', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json() as { data?: MarketplaceConnectionInfo[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setRows(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  function readinessChip(r: MarketplaceConnectionInfo) {
    if (r.status === 'connected') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isThai ? 'เชื่อมแล้ว' : 'Connected'}{r.shopName ? ` · ${r.shopName}` : ''}
        </span>
      );
    }
    if (r.readiness === 'available') {
      return <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">{isThai ? 'พร้อมเชื่อม' : 'Ready to connect'}</span>;
    }
    if (r.readiness === 'coming_soon') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
          <Clock className="h-3.5 w-3.5" />
          {isThai ? 'เร็ว ๆ นี้ (รอ App Key)' : 'Coming soon (needs App Key)'}
        </span>
      );
    }
    return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{isThai ? 'วางแผนไว้' : 'Planned'}</span>;
  }

  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {isThai
          ? 'เชื่อมร้านจาก Shopee/Lazada/TikTok เพื่อดึงออเดอร์มาตัดสต็อกอัตโนมัติ (ใช้ร่วมกับ SKU ช่องทางขายในหน้าสินค้า) — การเชื่อมจริงเปิดทีละช่องทางเมื่อใส่ App Key ของแพลตฟอร์มนั้นแล้ว'
          : 'Connect Shopee/Lazada/TikTok shops to pull orders and auto-decrement stock (uses the channel SKUs set on products). Live connect opens per platform once that platform’s App Key is configured.'}
      </p>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {rows.map((r) => (
            <div key={r.channel} className="flex items-center gap-3 px-3 py-3">
              <Store className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="flex-1 text-sm font-medium text-slate-900">{r.label}</span>
              {readinessChip(r)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
