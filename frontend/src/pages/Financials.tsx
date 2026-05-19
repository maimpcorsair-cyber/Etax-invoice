import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, Wallet, Receipt, Calculator, FileText, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import SectionSubNav from '../components/SectionSubNav';

interface PAndLData {
  period: { from: string; to: string };
  projectId: string | null;
  revenue: { gross: number; byType: Record<string, number>; invoiceCount: number };
  cogs: { total: number; byCategory: Record<string, number>; purchaseCount: number };
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: { total: number; byCategory: Record<string, number>; voucherCount: number };
  operatingProfit: number;
  operatingMargin: number;
  vat: { collected: number; paid: number; netPayable: number };
}

interface BalanceSheetData {
  asOf: string;
  assets: {
    accountsReceivable: number;
    accountsReceivableAging: {
      current: number;
      days1_30: number;
      days31_60: number;
      days61_90: number;
      days90plus: number;
    };
    cash: number;
    total: number;
  };
  liabilities: {
    accountsPayable: number;
    vatPayable: number;
    total: number;
  };
  equity: number;
  notes: string[];
}

function firstOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Financials() {
  const { i18n } = useTranslation();
  const { formatCurrency } = useLanguage();
  const token = useAuthStore((s) => s.token);
  const isThai = i18n.language === 'th';

  const [from, setFrom] = useState(firstOfThisMonth());
  const [to, setTo] = useState(todayStr());
  const [pnl, setPnl] = useState<PAndLData | null>(null);
  const [balance, setBalance] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [pnlRes, bsRes] = await Promise.all([
        fetch(`/api/reports/p-and-l?from=${from}&to=${to}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/reports/balance-sheet?asOf=${to}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (!pnlRes.ok) throw new Error(`P&L HTTP ${pnlRes.status}`);
      if (!bsRes.ok) throw new Error(`Balance Sheet HTTP ${bsRes.status}`);
      const pnlJson = await pnlRes.json();
      const bsJson = await bsRes.json();
      setPnl(pnlJson.data);
      setBalance(bsJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const profitTone = useMemo(() => {
    if (!pnl) return 'text-slate-500';
    return pnl.operatingProfit >= 0 ? 'text-emerald-600' : 'text-rose-600';
  }, [pnl]);

  return (
    <div className="space-y-6">
      <SectionSubNav
        items={[
          { key: 'financials', to: '/app/reports/financials', label: isThai ? 'งบการเงิน' : 'Financials', icon: TrendingUp },
          { key: 'vat', to: '/app/vat-summary', label: isThai ? 'สรุปภาษีมูลค่าเพิ่ม' : 'VAT Summary', icon: Calculator },
          { key: 'pp30', to: '/app/pp30', label: isThai ? 'ภพ.30' : 'PP30 Filing', icon: FileText },
          { key: 'wht', to: '/app/wht-certificates', label: isThai ? 'ภงด.3/53' : 'WHT', icon: Receipt },
        ]}
      />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isThai ? 'งบกำไรขาดทุน + งบดุล' : 'Profit & Loss + Balance Sheet'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isThai
              ? 'รวมยอดอัตโนมัติจากใบกำกับขาย ใบกำกับซื้อ และเงินสดย่อยในช่วงที่เลือก'
              : 'Auto-aggregated from sales invoices, purchase invoices, and petty cash for the chosen period.'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">
            <span className="block">{isThai ? 'ตั้งแต่' : 'From'}</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            <span className="block">{isThai ? 'ถึง' : 'To'}</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="btn-primary text-sm disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            {isThai ? 'อัปเดต' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Profit & Loss ── */}
      {pnl && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {isThai ? 'งบกำไรขาดทุน (P&L)' : 'Profit & Loss'}
            </h2>
            <span className="text-xs text-slate-500">
              {pnl.revenue.invoiceCount} {isThai ? 'ใบกำกับขาย' : 'invoices'} ·
              {' '}{pnl.cogs.purchaseCount} {isThai ? 'ใบกำกับซื้อ' : 'purchases'} ·
              {' '}{pnl.operatingExpenses.voucherCount} {isThai ? 'รายการเงินสดย่อย' : 'vouchers'}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label={isThai ? 'รายได้' : 'Revenue'}
              value={formatCurrency(pnl.revenue.gross)}
              icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
            />
            <Tile
              label={isThai ? 'ต้นทุนขาย' : 'COGS'}
              value={formatCurrency(pnl.cogs.total)}
              icon={<TrendingDown className="h-4 w-4 text-rose-500" />}
            />
            <Tile
              label={isThai ? 'ค่าใช้จ่ายดำเนินงาน' : 'Operating Expenses'}
              value={formatCurrency(pnl.operatingExpenses.total)}
              icon={<Wallet className="h-4 w-4 text-amber-600" />}
            />
            <Tile
              label={isThai ? 'กำไร/ขาดทุนจากดำเนินงาน' : 'Operating Profit'}
              value={formatCurrency(pnl.operatingProfit)}
              icon={<TrendingUp className={`h-4 w-4 ${profitTone}`} />}
              valueClassName={profitTone}
              detail={`${(pnl.operatingMargin * 100).toFixed(1)}% ${isThai ? 'ของรายได้' : 'margin'}`}
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Breakdown
              title={isThai ? 'รายได้แยกประเภทเอกสาร' : 'Revenue by document type'}
              rows={Object.entries(pnl.revenue.byType)}
              format={formatCurrency}
            />
            <Breakdown
              title={isThai ? 'ค่าใช้จ่ายดำเนินงานแยกหมวด' : 'Operating expenses by category'}
              rows={Object.entries(pnl.operatingExpenses.byCategory)}
              format={formatCurrency}
            />
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {isThai ? 'VAT ขาย' : 'Output VAT'}: <span className="font-semibold">{formatCurrency(pnl.vat.collected)}</span>
              </span>
              <span>
                {isThai ? 'VAT ซื้อ' : 'Input VAT'}: <span className="font-semibold">{formatCurrency(pnl.vat.paid)}</span>
              </span>
              <span>
                {isThai ? 'VAT ที่ต้องชำระ (สุทธิ)' : 'Net VAT payable'}:{' '}
                <span className={`font-semibold ${pnl.vat.netPayable > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {formatCurrency(pnl.vat.netPayable)}
                </span>
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ── Balance Sheet ── */}
      {balance && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {isThai ? 'งบดุล (Balance Sheet)' : 'Balance Sheet'}
            </h2>
            <span className="text-xs text-slate-500">
              {isThai ? 'ณ วันที่' : 'as of'} {balance.asOf.slice(0, 10)}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Pillar
              title={isThai ? 'สินทรัพย์' : 'Assets'}
              total={balance.assets.total}
              formatter={formatCurrency}
              rows={[
                [isThai ? 'ลูกหนี้การค้า (AR)' : 'Accounts Receivable', balance.assets.accountsReceivable],
                [isThai ? 'เงินสด/ธนาคาร' : 'Cash / Bank', balance.assets.cash],
              ]}
              tone="emerald"
            />
            <Pillar
              title={isThai ? 'หนี้สิน' : 'Liabilities'}
              total={balance.liabilities.total}
              formatter={formatCurrency}
              rows={[
                [isThai ? 'เจ้าหนี้การค้า (AP)' : 'Accounts Payable', balance.liabilities.accountsPayable],
                [isThai ? 'VAT ค้างชำระ' : 'VAT Payable', balance.liabilities.vatPayable],
              ]}
              tone="rose"
            />
            <Pillar
              title={isThai ? 'ส่วนของผู้ถือหุ้น' : 'Equity'}
              total={balance.equity}
              formatter={formatCurrency}
              rows={[
                [isThai ? 'สินทรัพย์ − หนี้สิน' : 'Assets − Liabilities', balance.equity],
              ]}
              tone={balance.equity >= 0 ? 'sky' : 'rose'}
            />
          </div>

          {balance.assets.accountsReceivable > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-700">
                {isThai ? 'อายุลูกหนี้ (AR Aging)' : 'AR Aging'}
              </h3>
              <div className="mt-2 grid grid-cols-5 gap-2 text-xs">
                {([
                  ['Current', balance.assets.accountsReceivableAging.current],
                  ['1-30d', balance.assets.accountsReceivableAging.days1_30],
                  ['31-60d', balance.assets.accountsReceivableAging.days31_60],
                  ['61-90d', balance.assets.accountsReceivableAging.days61_90],
                  ['90+d', balance.assets.accountsReceivableAging.days90plus],
                ] as Array<[string, number]>).map(([label, val]) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-slate-500">{label}</div>
                    <div className="mt-1 font-semibold text-slate-900">{formatCurrency(val)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {balance.notes.length > 0 && (
            <ul className="mt-5 list-disc space-y-1 pl-5 text-xs text-slate-500">
              {balance.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
        </section>
      )}

      {!pnl && !balance && !loading && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          {isThai ? 'ยังไม่มีข้อมูล — สร้างใบกำกับ/ใบเสร็จก่อน แล้วกลับมาดูที่หน้านี้' : 'No data yet — issue an invoice/receipt first, then come back.'}
        </div>
      )}
    </div>
  );
}

interface TileProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClassName?: string;
  detail?: string;
}
function Tile({ label, value, icon, valueClassName, detail }: TileProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-lg font-bold text-slate-900 ${valueClassName ?? ''}`}>{value}</div>
      {detail && <div className="mt-0.5 text-xs text-slate-500">{detail}</div>}
    </div>
  );
}

interface BreakdownProps {
  title: string;
  rows: Array<[string, number]>;
  format: (v: number) => string;
}
function Breakdown({ title, rows, format }: BreakdownProps) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <table className="mt-2 w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows
            .sort(([, a], [, b]) => b - a)
            .map(([k, v]) => (
              <tr key={k}>
                <td className="py-1.5 text-slate-600">{k}</td>
                <td className="py-1.5 text-right font-medium text-slate-900">{format(v)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

interface PillarProps {
  title: string;
  total: number;
  rows: Array<[string, number]>;
  formatter: (v: number) => string;
  tone: 'emerald' | 'rose' | 'sky';
}
function Pillar({ title, total, rows, formatter, tone }: PillarProps) {
  const toneClasses = {
    emerald: 'border-emerald-200 bg-emerald-50',
    rose: 'border-rose-200 bg-rose-50',
    sky: 'border-sky-200 bg-sky-50',
  };
  return (
    <div className={`rounded-xl border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="text-base font-bold text-slate-900">{formatter(total)}</span>
      </div>
      <table className="mt-3 w-full text-sm">
        <tbody className="divide-y divide-white/60">
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="py-1 text-slate-700">{k}</td>
              <td className="py-1 text-right font-medium text-slate-900">{formatter(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
