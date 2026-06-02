import { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts';

// Brand-themed dashboard charts (Recharts). Navy authority + teal/gold warmth,
// matching DESIGN.md tokens. Money state visualised: revenue trend, AR aging,
// and marketplace net by channel.

const NAVY = '#1e3a8a';
const TEAL = '#2dd4bf';
const GOLD = '#c9a84c';
// AR aging ramp: fresh → overdue (green → amber → red).
const AGING_COLORS = ['#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];
const CHANNEL_COLORS = [NAVY, TEAL, GOLD, '#059669', '#335fd4', '#a51c30', '#8b5cf6', '#64748b'];

const prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Props {
  isThai: boolean;
  formatCurrency: (n: number) => string;
  monthlyRevenue: Array<{ month: string; total: number }>;
  aging: { current: number; days1To30: number; days31To60: number; days61To90: number; days90Plus: number };
  marketplace: Array<{ label: string; value: number }>;
}

function compactBaht(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `฿${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `฿${(n / 1_000).toFixed(0)}k`;
  return `฿${n}`;
}

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export default function DashboardCharts({ isThai, formatCurrency, monthlyRevenue, aging, marketplace }: Props) {
  const revenueData = useMemo(
    () => monthlyRevenue.map((m) => ({ month: m.month.length >= 7 ? m.month.slice(5) : m.month, total: m.total })),
    [monthlyRevenue],
  );
  const agingData = useMemo(() => ([
    { label: isThai ? 'ไม่เกินกำหนด' : 'Current', value: aging.current, color: AGING_COLORS[0] },
    { label: '1-30', value: aging.days1To30, color: AGING_COLORS[1] },
    { label: '31-60', value: aging.days31To60, color: AGING_COLORS[2] },
    { label: '61-90', value: aging.days61To90, color: AGING_COLORS[3] },
    { label: isThai ? '90+ วัน' : '90+', value: aging.days90Plus, color: AGING_COLORS[4] },
  ]), [aging, isThai]);
  const agingTotal = agingData.reduce((s, d) => s + d.value, 0);
  const marketplaceTotal = marketplace.reduce((s, d) => s + d.value, 0);

  const tooltipStyle = {
    contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 8px 24px rgba(15,23,42,0.08)' },
    labelStyle: { color: '#475569', fontWeight: 600 },
  };
  const fmt = (v: number | string) => formatCurrency(Number(v));
  const anim = !prefersReducedMotion;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* Revenue trend */}
      <ChartCard title={isThai ? 'รายได้รายเดือน' : 'Monthly revenue'} hint={isThai ? '6 เดือนล่าสุด' : 'last 6 months'}>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={revenueData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={NAVY} stopOpacity={0.28} />
                <stop offset="100%" stopColor={NAVY} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={compactBaht} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} />
            <Tooltip {...tooltipStyle} formatter={(v) => [fmt(v as number), isThai ? 'รายได้' : 'Revenue']} />
            <Area type="monotone" dataKey="total" stroke={NAVY} strokeWidth={2.5} fill="url(#revFill)" isAnimationActive={anim} dot={{ r: 2.5, fill: NAVY }} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* AR aging */}
      <ChartCard title={isThai ? 'ลูกหนี้ค้างชำระ (อายุหนี้)' : 'Receivables aging'} hint={formatCurrency(agingTotal)}>
        {agingTotal === 0 ? (
          <EmptyChart text={isThai ? 'ไม่มีลูกหนี้ค้าง' : 'No outstanding AR'} />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={agingData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={compactBaht} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} />
              <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(30,58,138,0.05)' }} formatter={(v) => [fmt(v as number), isThai ? 'ยอดค้าง' : 'Outstanding']} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={anim}>
                {agingData.map((d) => <Cell key={d.label} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Marketplace net by channel */}
      <ChartCard title={isThai ? 'เงินรับจากช่องทางขาย' : 'Marketplace net'} hint={marketplaceTotal > 0 ? formatCurrency(marketplaceTotal) : undefined}>
        {marketplaceTotal === 0 ? (
          <EmptyChart text={isThai ? 'ยังไม่มีข้อมูลช่องทางขาย' : 'No marketplace data yet'} />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Tooltip {...tooltipStyle} formatter={(v, n) => [fmt(v as number), n as string]} />
              <Pie data={marketplace} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2} isAnimationActive={anim}>
                {marketplace.map((d, i) => <Cell key={d.label} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}
        {marketplaceTotal > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {marketplace.map((d, i) => (
              <span key={d.label} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <span className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                {d.label}
              </span>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400">
      {text}
    </div>
  );
}
