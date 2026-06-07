import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, TrendingUp, TrendingDown, Wallet, ArrowDownLeft, ArrowUpRight, Receipt, FileText, ExternalLink, Calculator, Link2, Store } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import SectionSubNav from '../components/SectionSubNav';

interface Aging { current: number; days1_30: number; days31_60: number; days61_90: number; days90plus: number }
interface Overview {
  period: { from: string; to: string };
  cashflow: { in: number; out: number; net: number; paymentsIn: number; expensesOut: number; purchasesOut: number };
  pnl: { revenue: number; cogs: number; opex: number; operatingProfit: number; margin: number; invoiceCount: number };
  ar: { total: number; aging: Aging };
  ap: { total: number; aging: Aging };
  vat: { output: number; input: number; payable: number };
  marketplace?: {
    total: { count: number; gross: number; fee: number; refund: number; adjustment: number; net: number; gap: number };
    channels: Array<{ channel: string; count: number; gross: number; fee: number; refund: number; adjustment: number; net: number; gap: number }>;
  };
  trend: Array<{ month: string; revenue: number }>;
}

function thisMonthRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return { from, to };
}

export default function FinanceOverview() {
  const { token } = useAuthStore();
  const { isThai, formatCurrency, formatDate } = useLanguage();
  const [range, setRange] = useState(thisMonthRange());
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/finance-overview?from=${range.from}&to=${range.to}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setData(json.data ?? null);
    } finally {
      setLoading(false);
    }
  }, [token, range.from, range.to]);

  useEffect(() => { void load(); }, [load]);

  const agingRows = (a: Aging): Array<[string, number]> => [
    [isThai ? 'ยังไม่ครบกำหนด' : 'Current', a.current],
    ['1-30', a.days1_30],
    ['31-60', a.days31_60],
    ['61-90', a.days61_90],
    [isThai ? '90+ วัน' : '90+', a.days90plus],
  ];

  const maxTrend = data ? Math.max(1, ...data.trend.map((t) => t.revenue)) : 1;

  return (
    <div className="space-y-4">
      <SectionSubNav
        items={[
          { key: 'overview', to: '/app/reports/finance-overview', label: isThai ? 'ภาพรวมการเงิน' : 'Finance Overview', icon: Wallet },
          { key: 'financials', to: '/app/reports/financials', label: isThai ? 'งบการเงิน' : 'Financials', icon: TrendingUp },
          { key: 'vat', to: '/app/vat-summary', label: isThai ? 'สรุปภาษีมูลค่าเพิ่ม' : 'VAT Summary', icon: Calculator },
          { key: 'pp30', to: '/app/pp30', label: isThai ? 'ภพ.30' : 'PP30 Filing', icon: FileText },
          { key: 'wht', to: '/app/wht-certificates', label: isThai ? 'ภงด.3/53' : 'WHT', icon: Receipt },
          { key: 'reconciliation', to: '/app/reports/reconciliation', label: isThai ? 'กระทบยอดธนาคาร' : 'Bank Reconciliation', icon: Link2 },
        ]}
      />
      {loading || !data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-300" /></div>
      ) : (
        <>
          <section className="workspace-command">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.7fr)] lg:items-stretch">
            <div className="min-w-0">
              <p className="premium-eyebrow"><Wallet className="h-3.5 w-3.5" />{isThai ? 'ภาพรวมเงินบริษัท' : 'Company Money Overview'}</p>
              <p className="mt-4 text-sm font-semibold text-slate-500">{formatDate(range.from)} - {formatDate(range.to)}</p>
              <h1 className="mt-1 text-xl font-bold leading-tight text-slate-950 sm:text-3xl">
                {isThai ? 'กระแสเงินสดสุทธิช่วงนี้' : 'Net cashflow this period'}
              </h1>
              <div className={`mt-2 text-[2.15rem] font-bold leading-none tabular-nums sm:text-[2.5rem] ${data.cashflow.net >= 0 ? 'text-primary-800' : 'text-rose-600'}`}>
                {formatCurrency(data.cashflow.net)}
              </div>
              <div className="mt-3 h-px w-40 bg-slate-200" />
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:mt-5 sm:gap-3">
                <div className="border-t border-slate-200 px-1 py-3">
                  <p className="text-xs font-semibold text-slate-500">{isThai ? 'กำไรดำเนินงาน' : 'Operating profit'}</p>
                  <p className="mt-1 font-bold text-slate-950 tabular-nums">{formatCurrency(data.pnl.operatingProfit)}</p>
                </div>
                <div className="border-t border-slate-200 px-1 py-3">
                  <p className="text-xs font-semibold text-slate-500">{isThai ? 'VAT โดยประมาณ' : 'VAT estimate'}</p>
                  <p className="mt-1 font-bold text-slate-950 tabular-nums">{formatCurrency(data.vat.payable)}</p>
                </div>
              </div>
            </div>
            <div className="workspace-command-rail">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isThai ? 'ช่วงเวลาที่ดู' : 'Date range'}</p>
              <div className="mt-3 grid gap-2">
                <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="input-field text-sm" />
                <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="input-field text-sm" />
              </div>
              <Link to="/app/reports/reconciliation" className="btn-primary mt-4 w-full justify-center px-4 py-2.5 text-sm">
                {isThai ? 'กระทบยอดธนาคาร' : 'Bank reconciliation'}
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
            </div>
          </section>

          <div className="rounded-[20px] border border-slate-200 bg-white/90 p-3 shadow-sm">
            <div className="mb-3 flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-700">{isThai ? 'บัญชีงานการเงิน' : 'Finance ledger strip'}</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">{isThai ? 'เงินเข้า เงินออก กำไร และ VAT' : 'Cash in, cash out, profit, and VAT'}</h2>
              </div>
              <p className="text-xs font-semibold text-slate-600">{isThai ? 'อ่านเร็วสำหรับเจ้าของและทีมบัญชี' : 'Fast scan for owners and accountants'}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi icon={<ArrowDownLeft className="h-4 w-4" />} label={isThai ? 'เงินเข้า' : 'Cash in'} value={formatCurrency(data.cashflow.in)} tone="text-emerald-700" />
              <Kpi icon={<ArrowUpRight className="h-4 w-4" />} label={isThai ? 'เงินออก' : 'Cash out'} value={formatCurrency(data.cashflow.out)} tone="text-rose-700" />
              <Kpi icon={<Wallet className="h-4 w-4" />} label={isThai ? 'กระแสเงินสดสุทธิ' : 'Net cashflow'} value={formatCurrency(data.cashflow.net)} tone={data.cashflow.net >= 0 ? 'text-emerald-700' : 'text-rose-700'} />
              <Kpi
                icon={data.pnl.operatingProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                label={isThai ? 'กำไรจากดำเนินงาน' : 'Operating profit'}
                value={formatCurrency(data.pnl.operatingProfit)}
                tone={data.pnl.operatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}
                detail={`${(data.pnl.margin * 100).toFixed(1)}% ${isThai ? 'margin' : 'margin'}`}
              />
            </div>
          </div>

          {/* P&L + cashflow breakdown */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">{isThai ? 'กำไรขาดทุน (ช่วงนี้)' : 'Profit & Loss (period)'}</h2>
              <Row label={isThai ? 'รายได้' : 'Revenue'} value={formatCurrency(data.pnl.revenue)} sub={`${data.pnl.invoiceCount} ${isThai ? 'ใบกำกับ' : 'invoices'}`} />
              <Row label={isThai ? 'ต้นทุน (ซื้อ)' : 'COGS (purchases)'} value={`- ${formatCurrency(data.pnl.cogs)}`} />
              <Row label={isThai ? 'ค่าใช้จ่ายดำเนินงาน' : 'Operating expenses'} value={`- ${formatCurrency(data.pnl.opex)}`} />
              <div className="mt-2 border-t border-slate-100 pt-2">
                <Row label={isThai ? 'กำไรจากดำเนินงาน' : 'Operating profit'} value={formatCurrency(data.pnl.operatingProfit)} bold tone={data.pnl.operatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'} />
              </div>
              <Link to="/app/reports/financials" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800">
                {isThai ? 'ดูงบกำไรขาดทุน + งบดุลเต็ม' : 'Full P&L + Balance Sheet'} <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div className="card">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">{isThai ? 'กระแสเงินสด (ช่วงนี้)' : 'Cashflow (period)'}</h2>
              <Row label={isThai ? 'รับชำระจากลูกค้า' : 'Customer payments'} value={`+ ${formatCurrency(data.cashflow.paymentsIn)}`} tone="text-emerald-700" />
              <Row label={isThai ? 'จ่ายซื้อ' : 'Purchase payments'} value={`- ${formatCurrency(data.cashflow.purchasesOut)}`} />
              <Row label={isThai ? 'ค่าใช้จ่าย' : 'Expenses'} value={`- ${formatCurrency(data.cashflow.expensesOut)}`} />
              <div className="mt-2 border-t border-slate-100 pt-2">
                <Row label={isThai ? 'สุทธิ' : 'Net'} value={formatCurrency(data.cashflow.net)} bold tone={data.cashflow.net >= 0 ? 'text-emerald-700' : 'text-rose-700'} />
              </div>
              <Link to="/app/reports/reconciliation" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800">
                {isThai ? 'กระทบยอดธนาคาร' : 'Bank reconciliation'} <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {data.marketplace && data.marketplace.total.count > 0 && (
            <div className="card">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Store className="h-4 w-4 text-primary-600" />
                  {isThai ? 'Marketplace: ยอดขายเทียบเงินเข้าจริง' : 'Marketplace: sales vs net payout'}
                </h2>
                <Link to="/app/marketplace-orders" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800">
                  {isThai ? 'ดูรายการ settlement' : 'Settlement details'} <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniMetric label="Gross" value={formatCurrency(data.marketplace.total.gross)} />
                <MiniMetric label="Fee" value={`- ${formatCurrency(data.marketplace.total.fee)}`} tone="text-rose-700" />
                <MiniMetric label="Refund" value={`- ${formatCurrency(data.marketplace.total.refund)}`} tone="text-rose-700" />
                <MiniMetric label="Net payout" value={formatCurrency(data.marketplace.total.net)} tone="text-emerald-700" />
              </div>
              {data.marketplace.channels.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.marketplace.channels.slice(0, 6).map((channel) => (
                    <div key={channel.channel} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-semibold text-slate-800">{channel.channel}</span>
                      <span className="font-bold text-emerald-700">{formatCurrency(channel.net)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AR / AP aging */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <AgingCard title={isThai ? 'ลูกหนี้ (AR) ค้างรับ' : 'Receivables (AR)'} total={data.ar.total} rows={agingRows(data.ar.aging)} fmt={formatCurrency} icon={<FileText className="h-4 w-4 text-primary-600" />} />
            <AgingCard title={isThai ? 'เจ้าหนี้ (AP) ค้างจ่าย' : 'Payables (AP)'} total={data.ap.total} rows={agingRows(data.ap.aging)} fmt={formatCurrency} icon={<Receipt className="h-4 w-4 text-amber-600" />} />
          </div>

          {/* VAT + trend */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">{isThai ? 'ภาษีมูลค่าเพิ่ม (สะสมถึงสิ้นช่วง)' : 'VAT position (cumulative)'}</h2>
              <Row label={isThai ? 'ภาษีขาย (output)' : 'Output VAT'} value={formatCurrency(data.vat.output)} />
              <Row label={isThai ? 'ภาษีซื้อ (input)' : 'Input VAT'} value={`- ${formatCurrency(data.vat.input)}`} />
              <div className="mt-2 border-t border-slate-100 pt-2">
                <Row label={isThai ? 'ต้องนำส่ง (โดยประมาณ)' : 'VAT payable (est.)'} value={formatCurrency(data.vat.payable)} bold tone={data.vat.payable > 0 ? 'text-rose-700' : 'text-emerald-700'} />
              </div>
              <Link to="/app/pp30" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800">
                {isThai ? 'ยื่น ภ.พ.30' : 'PP30 filing'} <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div className="card">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">{isThai ? 'รายได้ 6 เดือนล่าสุด' : 'Revenue — last 6 months'}</h2>
              <div className="flex items-end justify-between gap-2 pt-2" style={{ height: 140 }}>
                {data.trend.map((t) => (
                  <div key={t.month} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <div className="w-full rounded-t bg-primary-500/80" style={{ height: `${Math.round((t.revenue / maxTrend) * 110)}px` }} title={formatCurrency(t.revenue)} />
                    <span className="text-[10px] text-slate-400">{t.month.slice(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, tone, detail }: { icon: React.ReactNode; label: string; value: string; tone?: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary-700 text-white shadow-sm">{icon}</span>
        {label}
      </div>
      <div className={`mt-2 text-xl font-bold ${tone ?? 'text-slate-900'}`}>{value}</div>
      {detail && <div className="text-xs font-semibold text-slate-500">{detail}</div>}
    </div>
  );
}

function Row({ label, value, sub, bold, tone }: { label: string; value: string; sub?: string; bold?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-600">{label}{sub && <span className="ml-1 text-xs text-slate-400">· {sub}</span>}</span>
      <span className={`${bold ? 'font-bold' : 'font-medium'} ${tone ?? 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-bold ${tone ?? 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

function AgingCard({ title, total, rows, fmt, icon }: { title: string; total: number; rows: Array<[string, number]>; fmt: (n: number) => string; icon: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">{icon}{title}</h2>
        <span className="text-lg font-bold text-slate-900">{fmt(total)}</span>
      </div>
      <div className="grid grid-cols-5 gap-1 text-center">
        {rows.map(([label, val]) => (
          <div key={label} className="rounded-lg bg-slate-50 px-1 py-2">
            <div className="text-xs font-semibold text-slate-800">{fmt(val)}</div>
            <div className="mt-0.5 text-[10px] text-slate-400">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
