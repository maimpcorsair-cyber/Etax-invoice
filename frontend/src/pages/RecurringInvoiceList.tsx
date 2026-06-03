import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle, FileText, Loader2, PauseCircle, PlayCircle, Plus, Receipt, Search, Truck, XCircle } from 'lucide-react';
import SectionSubNav from '../components/SectionSubNav';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import type { RecurringInvoice, RecurringInvoiceStatus } from '../types';

const STATUS_LABELS: Record<RecurringInvoiceStatus, { th: string; en: string; tone: string; icon: typeof CheckCircle }> = {
  active: { th: 'ทำงานอยู่', en: 'Active', tone: 'bg-emerald-100 text-emerald-700', icon: PlayCircle },
  paused: { th: 'พักไว้', en: 'Paused', tone: 'bg-amber-100 text-amber-700', icon: PauseCircle },
  ended: { th: 'จบแล้ว', en: 'Ended', tone: 'bg-slate-100 text-slate-600', icon: CheckCircle },
  cancelled: { th: 'ยกเลิก', en: 'Cancelled', tone: 'bg-slate-100 text-slate-500', icon: XCircle },
};

const FREQ_LABELS = {
  weekly: { th: 'รายสัปดาห์', en: 'Weekly' },
  monthly: { th: 'รายเดือน', en: 'Monthly' },
  quarterly: { th: 'รายไตรมาส', en: 'Quarterly' },
  yearly: { th: 'รายปี', en: 'Yearly' },
};

function estimateTotal(row: RecurringInvoice) {
  return row.items.reduce((sum, item) => {
    const gross = item.quantity * item.unitPrice;
    const discount = item.discountAmount > 0 ? (gross * item.discountAmount) / 100 : 0;
    const amount = gross - discount;
    return sum + amount + (item.vatType === 'vat7' ? amount * 0.07 : 0);
  }, 0) - row.discountAmount;
}

export default function RecurringInvoiceList() {
  const { token } = useAuthStore();
  const { isThai, formatCurrency } = useLanguage();
  const navigate = useNavigate();
  const [rows, setRows] = useState<RecurringInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RecurringInvoiceStatus | 'all'>('all');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const activeRows = rows.filter((row) => row.status === 'active');
  const pausedRows = rows.filter((row) => row.status === 'paused');
  const endedRows = rows.filter((row) => row.status === 'ended');
  const cancelledRows = rows.filter((row) => row.status === 'cancelled');
  const today = new Date();
  const dueSoonRows = rows.filter((row) => {
    if (row.status !== 'active') return false;
    const nextRun = new Date(row.nextRunDate);
    const diffDays = (nextRun.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 7;
  });
  const activeValue = activeRows.reduce((sum, row) => sum + estimateTotal(row), 0);
  const latestRow = rows[0];
  const workItems = [
    {
      label: isThai ? 'รอบที่ทำงานอยู่' : 'Active schedules',
      value: activeRows.length,
      status: activeRows.length > 0 ? (isThai ? 'Running' : 'Running') : (isThai ? 'None' : 'None'),
      dot: activeRows.length > 0 ? 'bg-emerald-500' : 'bg-slate-300',
      icon: PlayCircle,
    },
    {
      label: isThai ? 'ถึงรอบใน 7 วัน' : 'Due in 7 days',
      value: dueSoonRows.length,
      status: dueSoonRows.length > 0 ? (isThai ? 'Generate' : 'Generate') : (isThai ? 'Clear' : 'Clear'),
      dot: dueSoonRows.length > 0 ? 'bg-amber-500' : 'bg-emerald-500',
      icon: CalendarClock,
    },
    {
      label: isThai ? 'พักไว้' : 'Paused',
      value: pausedRows.length,
      status: pausedRows.length > 0 ? (isThai ? 'Review' : 'Review') : (isThai ? 'None' : 'None'),
      dot: pausedRows.length > 0 ? 'bg-amber-500' : 'bg-slate-300',
      icon: PauseCircle,
    },
    {
      label: isThai ? 'จบแล้ว / ยกเลิก' : 'Ended / cancelled',
      value: endedRows.length + cancelledRows.length,
      status: isThai ? 'Archive' : 'Archive',
      dot: endedRows.length + cancelledRows.length > 0 ? 'bg-primary-500' : 'bg-slate-300',
      icon: CheckCircle,
    },
  ];

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/recurring-invoices?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setRows(json.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, search, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  async function generate(row: RecurringInvoice) {
    if (!token) return;
    setActingId(row.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/recurring-invoices/${row.id}/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledFor: new Date().toISOString().slice(0, 10) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Generate failed');
      setMsg({ type: 'ok', text: isThai ? `สร้าง draft invoice ${json.data.invoice.invoiceNumber} แล้ว` : `Draft invoice ${json.data.invoice.invoiceNumber} created` });
      await load();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Generate failed' });
    } finally {
      setActingId(null);
    }
  }

  async function setStatus(row: RecurringInvoice, status: RecurringInvoiceStatus) {
    if (!token) return;
    setActingId(row.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/recurring-invoices/${row.id}/status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Update failed');
      await load();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <SectionSubNav
        items={[
          { key: 'quotations', to: '/app/quotations', label: isThai ? 'ใบเสนอราคา' : 'Quotations', icon: FileText },
          { key: 'delivery-notes', to: '/app/delivery-notes', label: isThai ? 'ใบส่งของ' : 'Delivery Notes', icon: Truck },
          { key: 'recurring', to: '/app/recurring-invoices', label: isThai ? 'วางบิลซ้ำ' : 'Recurring', icon: CalendarClock },
          { key: 'invoices', to: '/app/invoices', label: isThai ? 'ใบกำกับภาษี/ใบเสร็จ' : 'Tax Invoices', icon: Receipt },
        ]}
      />

      <section className="premium-hero premium-hero-dark overflow-hidden p-4 sm:p-6 lg:p-7">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
          <div className="min-w-0">
            <div className="premium-eyebrow bg-white/10 text-white ring-1 ring-white/20">
              {isThai ? 'Recurring Billing Ledger' : 'Recurring Billing Ledger'}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 sm:mt-4">
              <div className="hidden h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:flex">
                <CalendarClock className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white sm:text-3xl">
                  {isThai ? 'Recurring invoice' : 'Recurring invoices'}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-white/70">
                  {isThai
                    ? 'คุมรอบวางบิลประจำ มูลค่าที่จะสร้างซ้ำ และงานที่ถึงรอบในสัปดาห์นี้'
                    : 'Control recurring billing schedules, repeat value, and drafts due this week.'}
                </p>
              </div>
            </div>

            <div className="mt-5 sm:mt-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">
                {isThai ? 'มูลค่ารอบที่ทำงานอยู่' : 'Active recurring value'}
              </p>
              <div className="mt-2 max-w-2xl border-b border-[rgba(201,168,76,0.7)] pb-2 sm:pb-3">
                <p className="font-sarabun text-[2rem] font-bold leading-none text-white tabular-nums sm:text-[clamp(2rem,4vw,2.5rem)]">
                  {formatCurrency(activeValue)}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/75 sm:mt-4 sm:gap-3">
                <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                  {isThai ? 'Active' : 'Active'} <strong className="text-white tabular-nums">{activeRows.length}</strong>
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                  {isThai ? 'ถึงรอบ 7 วัน' : 'Due 7 days'} <strong className="text-white tabular-nums">{dueSoonRows.length}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 p-3 text-white ring-1 ring-white/15 backdrop-blur-sm sm:p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">
              {isThai ? 'Next action' : 'Next action'}
            </p>
            <p className="mt-1.5 text-base font-semibold sm:mt-2 sm:text-lg">
              {latestRow
                ? latestRow.customer?.nameTh ?? latestRow.name
                : isThai ? 'เริ่มจากรอบวางบิลแรก' : 'Start with the first schedule'}
            </p>
            <p className="mt-1 text-sm text-white/65">
              {latestRow
                ? `${latestRow.name} · ${latestRow.nextRunDate.slice(0, 10)}`
                : isThai ? 'สร้าง schedule แล้วปล่อยให้ Billboy เตือนรอบ draft invoice' : 'Create a schedule and let Billboy prepare recurring drafts.'}
            </p>
            <button onClick={() => navigate('/app/recurring-invoices/new')} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-primary-800 shadow-sm hover:bg-primary-50 sm:mt-4">
              <Plus className="h-4 w-4" />
              {isThai ? 'สร้างรอบวางบิล' : 'New schedule'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {workItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold leading-none text-slate-950 tabular-nums">{item.value}</p>
                    <p className="mt-1 truncate text-sm font-medium text-slate-600">{item.label}</p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                  <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                  {item.status}
                </span>
              </div>
            </div>
          );
        })}
      </section>

      {msg && (
        <div className={`rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm ${msg.type === 'ok' ? 'border-emerald-200 text-emerald-700' : 'border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={isThai ? 'ค้นหาชื่อรอบ / ลูกค้า...' : 'Search schedule or customer...'}
              className="input-field w-full pl-9"
            />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as RecurringInvoiceStatus | 'all')} className="input-field min-w-[180px]">
            <option value="all">{isThai ? 'ทุกสถานะ' : 'All statuses'}</option>
            {(Object.keys(STATUS_LABELS) as RecurringInvoiceStatus[]).map((status) => (
              <option key={status} value={status}>{isThai ? STATUS_LABELS[status].th : STATUS_LABELS[status].en}</option>
            ))}
          </select>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary-500" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-500 shadow-sm">
          <CalendarClock className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p className="text-lg font-medium">{isThai ? 'ยังไม่มีรอบวางบิล' : 'No recurring schedules yet'}</p>
          <button onClick={() => navigate('/app/recurring-invoices/new')} className="btn-primary mt-4 inline-flex">
            <Plus className="h-4 w-4" />
            {isThai ? 'สร้างรอบแรก' : 'Create first schedule'}
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">{isThai ? 'รอบวางบิลทั้งหมด' : 'Recurring billing ledger'}</p>
              <p className="text-xs text-slate-500">{isThai ? 'สร้าง draft, พักรอบ, หรือเปิดใช้งานต่อจากตารางนี้' : 'Generate drafts, pause, or resume schedules from this table'}</p>
            </div>
            <Link to="/app/invoices" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
              {isThai ? 'ดูใบกำกับภาษีที่สร้างแล้ว' : 'View generated invoices'}
            </Link>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="table-header">{isThai ? 'รอบวางบิล' : 'Schedule'}</th>
                <th className="table-header">{isThai ? 'ลูกค้า' : 'Customer'}</th>
                <th className="table-header">{isThai ? 'ความถี่' : 'Frequency'}</th>
                <th className="table-header">{isThai ? 'รอบถัดไป' : 'Next run'}</th>
                <th className="table-header text-right">{isThai ? 'ยอดประมาณ' : 'Est. total'}</th>
                <th className="table-header text-center">{isThai ? 'สถานะ' : 'Status'}</th>
                <th className="table-header text-right">{isThai ? 'จัดการ' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const meta = STATUS_LABELS[row.status];
                const Icon = meta.icon;
                const total = estimateTotal(row);
                return (
                  <tr
                    key={row.id}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a,button,input,select,label,[role="button"]')) return;
                      navigate(`/app/recurring-invoices/${row.id}`);
                    }}
                    className="cursor-pointer hover:bg-gray-50"
                  >
                    <td className="table-cell">
                      <button onClick={() => navigate(`/app/recurring-invoices/${row.id}`)} className="text-left font-semibold text-primary-700 hover:underline">
                        {row.name}
                      </button>
                      <div className="text-xs text-gray-500">{row.runCount} {isThai ? 'ครั้งที่สร้างแล้ว' : 'drafts generated'}</div>
                    </td>
                    <td className="table-cell">
                      <div className="font-medium text-gray-900">{row.customer?.nameTh ?? '-'}</div>
                      <div className="text-xs text-gray-500">{row.customer?.taxId ?? ''}</div>
                    </td>
                    <td className="table-cell text-sm text-gray-700">
                      {row.interval > 1 ? `${row.interval}x ` : ''}{isThai ? FREQ_LABELS[row.frequency].th : FREQ_LABELS[row.frequency].en}
                    </td>
                    <td className="table-cell text-sm text-gray-700 tabular-nums">{row.nextRunDate.slice(0, 10)}</td>
                    <td className="table-cell text-right font-semibold tabular-nums">{formatCurrency(total)}</td>
                    <td className="table-cell text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.tone}`}>
                        <Icon className="h-3 w-3" />
                        {isThai ? meta.th : meta.en}
                      </span>
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex justify-end gap-2">
                        <button disabled={actingId === row.id || row.status !== 'active'} onClick={() => generate(row)} className="btn-secondary px-3 py-1 text-xs disabled:opacity-50">
                          {actingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {isThai ? 'สร้าง draft' : 'Generate'}
                        </button>
                        {row.status === 'active' ? (
                          <button disabled={actingId === row.id} onClick={() => setStatus(row, 'paused')} className="btn-secondary px-3 py-1 text-xs">{isThai ? 'พัก' : 'Pause'}</button>
                        ) : row.status === 'paused' ? (
                          <button disabled={actingId === row.id} onClick={() => setStatus(row, 'active')} className="btn-secondary px-3 py-1 text-xs">{isThai ? 'เปิดต่อ' : 'Resume'}</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
