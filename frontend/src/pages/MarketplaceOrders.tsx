import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Banknote, CheckCircle2, Loader2, PackageX, ReceiptText, Store, TrendingUp, Upload } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import MarketplaceImportModal from '../components/marketplace/MarketplaceImportModal';
import MarketplaceSettlementImportModal from '../components/marketplace/MarketplaceSettlementImportModal';
import type { SalesChannel } from '../types';

const CHANNEL_LABEL: Record<string, string> = {
  shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok Shop',
  facebook: 'Facebook Shop', instagram: 'Instagram Shop',
  line_shopping: 'LINE SHOPPING', shopify: 'Shopify', woocommerce: 'WooCommerce', pos: 'POS', other: 'Other',
};

interface OrderRow {
  id: string;
  channel: SalesChannel;
  externalOrderId: string;
  status: string;
  buyerName: string | null;
  itemsJson: Array<{ externalSku: string; quantity: number }>;
  stockApplied: boolean;
  unmappedSkus: string[];
  importedAt: string;
}

interface Summary {
  channels: Array<{ channel: string; orders: number; stockApplied: number }>;
  totalOrders: number;
  ordersWithUnmapped: number;
  lowStock: Array<{ id: string; code: string; nameTh: string; nameEn: string | null; currentStock: number; reorderPoint: number }>;
}

interface SettlementRow {
  id: string;
  channel: SalesChannel;
  externalRef: string;
  settledAt: string | null;
  gross: number;
  fee: number;
  refund: number;
  adjustment: number;
  net: number;
  importedAt: string;
}

interface SettlementSummary {
  channels: Array<{ channel: string; count: number; gross: number; fee: number; refund: number; adjustment: number; net: number; gap: number; takeRate: number }>;
  total: { count: number; gross: number; fee: number; refund: number; adjustment: number; net: number; gap: number };
}

export default function MarketplaceOrders() {
  const { token } = useAuthStore();
  const { isThai, formatCurrency } = useLanguage();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settlementSummary, setSettlementSummary] = useState<SettlementSummary | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showSettlementImport, setShowSettlementImport] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [sRes, oRes, ssRes, stRes] = await Promise.all([
        fetch('/api/marketplace/summary', { headers }),
        fetch('/api/marketplace/orders?limit=100', { headers }),
        fetch('/api/marketplace/settlements/summary', { headers }),
        fetch('/api/marketplace/settlements?limit=50', { headers }),
      ]);
      const [sJson, oJson, ssJson, stJson] = await Promise.all([sRes.json(), oRes.json(), ssRes.json(), stRes.json()]);
      setSummary(sJson.data ?? null);
      setOrders(oJson.data ?? []);
      setSettlementSummary(ssJson.data ?? null);
      setSettlements(stJson.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  function statusChip(s: string) {
    const map: Record<string, string> = {
      paid: 'bg-emerald-50 text-emerald-700',
      shipped: 'bg-emerald-50 text-emerald-700',
      completed: 'bg-emerald-50 text-emerald-700',
      cancelled: 'bg-rose-50 text-rose-700',
      returned: 'bg-rose-50 text-rose-700',
      unpaid: 'bg-amber-50 text-amber-700',
      unknown: 'bg-slate-100 text-slate-700',
    };
    const tone = map[s] ?? 'bg-slate-100 text-slate-700';
    return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{s}</span>;
  }

  const totalOrders = summary?.totalOrders ?? orders.length;
  const unmappedOrders = summary?.ordersWithUnmapped ?? 0;
  const lowStockCount = summary?.lowStock.length ?? 0;
  const channelCount = summary?.channels.length || settlementSummary?.channels.length || 0;
  const payoutLines = settlementSummary?.total.count ?? 0;
  const netPayout = settlementSummary?.total.net ?? 0;
  const grossPayout = settlementSummary?.total.gross ?? 0;
  const totalFees = settlementSummary?.total.fee ?? 0;
  const workItems = [
    {
      label: isThai ? 'ออเดอร์นำเข้า' : 'Imported orders',
      value: String(totalOrders),
      icon: Store,
      dot: totalOrders > 0 ? 'bg-emerald-500' : 'bg-slate-300',
      status: isThai ? 'พร้อมตรวจ' : 'Ready',
    },
    {
      label: isThai ? 'SKU ยังไม่ผูก' : 'Unmapped SKU orders',
      value: String(unmappedOrders),
      icon: AlertTriangle,
      dot: unmappedOrders > 0 ? 'bg-amber-500' : 'bg-emerald-500',
      status: unmappedOrders > 0 ? (isThai ? 'ต้องผูกสินค้า' : 'Map products') : (isThai ? 'ปกติ' : 'Clear'),
    },
    {
      label: isThai ? 'สินค้าใกล้หมด' : 'Low stock items',
      value: String(lowStockCount),
      icon: PackageX,
      dot: lowStockCount > 0 ? 'bg-rose-500' : 'bg-emerald-500',
      status: lowStockCount > 0 ? (isThai ? 'ต้องเติม' : 'Restock') : (isThai ? 'ปกติ' : 'Clear'),
    },
    {
      label: isThai ? 'ช่องทางที่มีข้อมูล' : 'Channels with data',
      value: String(channelCount),
      icon: ReceiptText,
      dot: channelCount > 0 ? 'bg-primary-500' : 'bg-slate-300',
      status: payoutLines > 0 ? `${payoutLines} ${isThai ? 'บรรทัดเงินเข้า' : 'payout lines'}` : (isThai ? 'รอนำเข้า' : 'Awaiting import'),
    },
  ];

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="premium-hero premium-hero-dark overflow-hidden">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div className="min-w-0">
            <p className="premium-eyebrow">{isThai ? 'Marketplace Payout Ledger' : 'Marketplace Payout Ledger'}</p>
            <h1 className="mt-3 max-w-3xl text-2xl font-bold text-white sm:text-3xl">
              {isThai ? 'ออเดอร์จากช่องทางขาย' : 'Marketplace orders'}
            </h1>
            <p className="mt-3 hidden max-w-3xl text-sm leading-6 text-primary-50/80 sm:block">
              {isThai
                ? 'ตรวจออเดอร์ สต็อก SKU และเงินรับจริงจาก Shopee/Lazada/TikTok/Facebook/Instagram ในหน้าเดียว'
                : 'Reconcile imported orders, SKU stock impact, and real payouts across every sales channel.'}
            </p>
            <div className="mt-5">
              <p className="text-xs font-bold uppercase text-primary-100/70">{isThai ? 'เงินเข้าจริงสุทธิ' : 'Net payout received'}</p>
              <p className="mt-2 font-sarabun text-[clamp(2rem,5vw,3.6rem)] font-bold leading-none tabular-nums text-white">
                {loading ? '—' : formatCurrency(netPayout)}
              </p>
              <div className="mt-4 h-1 w-44 rounded-full bg-gradient-to-r from-thai-gold via-thai-gold/70 to-transparent" />
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-primary-50/80">
                <div>
                  <span className="block text-xs font-bold uppercase text-primary-100/60">Gross</span>
                  <span className="mt-1 block font-bold tabular-nums text-white">{loading ? '—' : formatCurrency(grossPayout)}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold uppercase text-primary-100/60">Fees</span>
                  <span className="mt-1 block font-bold tabular-nums text-rose-100">{loading ? '—' : `- ${formatCurrency(totalFees)}`}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-primary-100/70">{isThai ? 'ช่องทางในมุมมองนี้' : 'Channels in view'}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-white">{loading ? '—' : channelCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-thai-gold">
                <Banknote className="h-6 w-6" />
              </div>
            </div>
            <p className="mt-4 hidden text-sm leading-6 text-primary-50/75 sm:block">
              {isThai
                ? 'นำเข้าไฟล์ออเดอร์เพื่อตัดสต็อก และนำเข้าไฟล์เงินเข้าเพื่อเห็นยอดสุทธิหลังค่าธรรมเนียม'
                : 'Import order CSVs for stock impact, then payout CSVs to see net deposits after marketplace fees.'}
            </p>
            <div className="mt-4 grid gap-2 sm:mt-5">
              <button onClick={() => setShowSettlementImport(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-primary-900 shadow-sm hover:bg-primary-50 sm:py-2.5">
                <Banknote className="h-4 w-4" />
                {isThai ? 'นำเข้าเงินเข้า (CSV)' : 'Import payout'}
              </button>
              <button onClick={() => setShowImport(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 sm:py-2.5">
                <Upload className="h-4 w-4" />
                {isThai ? 'นำเข้าออเดอร์ (CSV)' : 'Import orders'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {workItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 sm:h-10 sm:w-10">
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.dot}`} />
              </div>
              <p className="mt-3 text-xl font-bold leading-none tabular-nums text-slate-950 sm:mt-4 sm:text-2xl">{item.value}</p>
              <div className="mt-2 min-w-0">
                <p className="truncate text-sm font-semibold text-slate-700">{item.label}</p>
                <p className="mt-1 truncate text-xs font-medium text-slate-500">{item.status}</p>
              </div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-300" /></div>
      ) : (
        <>
          {/* Payout reconciliation */}
          {settlementSummary && settlementSummary.total.count > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Banknote className="h-4 w-4 text-emerald-600" />
                    {isThai ? 'ยอดขาย vs เงินเข้าจริง' : 'Sales vs net payout'}
                  </div>
                  <span className="text-xs font-medium text-slate-400">{settlementSummary.total.count} {isThai ? 'รายการ' : 'lines'}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Gross" value={formatCurrency(settlementSummary.total.gross)} />
                  <Metric label="Fee" value={`- ${formatCurrency(settlementSummary.total.fee)}`} tone="text-rose-700" />
                  <Metric label={isThai ? 'Refund' : 'Refund'} value={`- ${formatCurrency(settlementSummary.total.refund)}`} tone="text-rose-700" />
                  <Metric label="Net" value={formatCurrency(settlementSummary.total.net)} tone="text-emerald-700" />
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ReceiptText className="h-4 w-4 text-primary-600" />
                  {isThai ? 'แยกตามช่องทาง' : 'By channel'}
                </div>
                <div className="space-y-2">
                  {settlementSummary.channels.map((c) => (
                    <div key={c.channel} className="grid grid-cols-[1fr_auto] gap-3 border-t border-slate-100 py-2 text-sm first:border-t-0">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">{CHANNEL_LABEL[c.channel] ?? c.channel}</div>
                        <div className="text-xs text-slate-500">{c.count} {isThai ? 'รายการ' : 'lines'} · fee {(c.takeRate * 100).toFixed(1)}%</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-700">{formatCurrency(c.net)}</div>
                        <div className="text-xs text-slate-400">gross {formatCurrency(c.gross)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* Per-channel summary */}
          {summary && summary.channels.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Store className="h-4 w-4 text-primary-600" />
                {isThai ? 'ออเดอร์แยกตามช่องทาง' : 'Orders by channel'}
              </div>
              <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-xl border border-slate-200 sm:grid-cols-3 lg:grid-cols-4">
              {summary.channels.map((c) => (
                <div key={c.channel} className="min-w-0 border-b border-r border-slate-200 px-3 py-3 last:border-r-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{CHANNEL_LABEL[c.channel] ?? c.channel}</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{c.orders}</p>
                  <p className="mt-1 text-xs text-slate-500">{c.stockApplied} {isThai ? 'ตัดสต็อก' : 'stock-applied'}</p>
                </div>
              ))}
              </div>
            </section>
          )}

          {/* Unmapped warning */}
          {summary && summary.ordersWithUnmapped > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {isThai
                  ? `มี ${summary.ordersWithUnmapped} ออเดอร์ที่มี SKU ยังไม่ได้ผูก (ไม่ถูกตัดสต็อก) ไปผูกที่หน้าสินค้า แล้วนำเข้าไฟล์เดิมอีกครั้ง`
                  : `${summary.ordersWithUnmapped} orders have unmapped SKUs (stock not changed). Map them on Products, then re-import.`}
              </span>
            </div>
          )}

          {/* Low stock */}
          {summary && summary.lowStock.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <PackageX className="h-4 w-4 text-rose-600" />
                {isThai ? 'สต็อกต่ำกว่าจุดสั่งซื้อ' : 'Low stock'}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {summary.lowStock.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate"><span className="font-mono text-xs text-slate-400">{p.code}</span> {isThai ? p.nameTh : (p.nameEn ?? p.nameTh)}</span>
                    <span className="shrink-0 font-semibold text-rose-700">{p.currentStock} / {p.reorderPoint}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Orders table */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">{isThai ? 'ออเดอร์ล่าสุด' : 'Recent imported orders'}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">{isThai ? 'ช่องทาง' : 'Channel'}</th>
                    <th className="table-header">{isThai ? 'เลขออเดอร์' : 'Order ID'}</th>
                    <th className="table-header text-center">{isThai ? 'รายการ' : 'Items'}</th>
                    <th className="table-header text-center">{isThai ? 'สถานะ' : 'Status'}</th>
                    <th className="table-header text-center">{isThai ? 'ตัดสต็อก' : 'Stock'}</th>
                    <th className="table-header">{isThai ? 'นำเข้าเมื่อ' : 'Imported'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.length === 0 ? (
                    <tr><td colSpan={6} className="py-12 text-center text-sm text-gray-400">
                      <TrendingUp className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                      {isThai ? 'ยังไม่มีออเดอร์ที่นำเข้า กด "นำเข้าออเดอร์ (CSV)"' : 'No imported orders yet. Use "Import orders".'}
                    </td></tr>
                  ) : orders.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">{CHANNEL_LABEL[o.channel] ?? o.channel}</td>
                      <td className="table-cell font-mono text-xs">{o.externalOrderId}{o.buyerName ? <span className="block text-slate-400">{o.buyerName}</span> : null}</td>
                      <td className="table-cell text-center">{Array.isArray(o.itemsJson) ? o.itemsJson.length : 0}</td>
                      <td className="table-cell text-center">{statusChip(o.status)}</td>
                      <td className="table-cell text-center">
                        {o.stockApplied
                          ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-label={isThai ? 'ตัดสต็อกแล้ว' : 'Stock applied'} />
                          : o.unmappedSkus.length > 0
                            ? (
                              <span title={o.unmappedSkus.join(', ')}>
                                <AlertTriangle className="mx-auto h-4 w-4 text-amber-600" aria-label={isThai ? 'ยังไม่ได้ผูก SKU' : 'Unmapped SKU'} />
                              </span>
                            )
                            : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="table-cell text-xs text-gray-500">{new Date(o.importedAt).toLocaleString(isThai ? 'th-TH' : 'en-US')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Settlement table */}
          {settlements.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">{isThai ? 'รายการเงินรับ / ค่าธรรมเนียมล่าสุด' : 'Recent settlement lines'}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="table-header">{isThai ? 'ช่องทาง' : 'Channel'}</th>
                      <th className="table-header">{isThai ? 'อ้างอิง' : 'Reference'}</th>
                      <th className="table-header text-right">Gross</th>
                      <th className="table-header text-right">Fee</th>
                      <th className="table-header text-right">Refund</th>
                      <th className="table-header text-right">Net</th>
                      <th className="table-header">{isThai ? 'วันที่' : 'Date'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {settlements.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="table-cell font-medium">{CHANNEL_LABEL[row.channel] ?? row.channel}</td>
                        <td className="table-cell font-mono text-xs">{row.externalRef}</td>
                        <td className="table-cell text-right font-medium">{formatCurrency(row.gross)}</td>
                        <td className="table-cell text-right text-rose-700">- {formatCurrency(row.fee)}</td>
                        <td className="table-cell text-right text-rose-700">- {formatCurrency(row.refund)}</td>
                        <td className="table-cell text-right font-bold text-emerald-700">{formatCurrency(row.net)}</td>
                        <td className="table-cell text-xs text-slate-500">{new Date(row.settledAt ?? row.importedAt).toLocaleDateString(isThai ? 'th-TH' : 'en-US')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {showImport && (
        <MarketplaceImportModal token={token} isThai={isThai} onClose={() => { setShowImport(false); void load(); }} />
      )}
      {showSettlementImport && (
        <MarketplaceSettlementImportModal token={token} isThai={isThai} formatCurrency={formatCurrency} onClose={() => { setShowSettlementImport(false); void load(); }} />
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-bold ${tone ?? 'text-slate-900'}`}>{value}</div>
    </div>
  );
}
