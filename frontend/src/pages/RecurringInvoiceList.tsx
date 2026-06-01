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
    <div className="space-y-4">
      <SectionSubNav
        items={[
          { key: 'quotations', to: '/app/quotations', label: isThai ? 'ใบเสนอราคา' : 'Quotations', icon: FileText },
          { key: 'delivery-notes', to: '/app/delivery-notes', label: isThai ? 'ใบส่งของ' : 'Delivery Notes', icon: Truck },
          { key: 'recurring', to: '/app/recurring-invoices', label: isThai ? 'วางบิลซ้ำ' : 'Recurring', icon: CalendarClock },
          { key: 'invoices', to: '/app/invoices', label: isThai ? 'ใบกำกับภาษี/ใบเสร็จ' : 'Tax Invoices', icon: Receipt },
        ]}
      />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <CalendarClock className="h-6 w-6 text-primary-600" />
            {isThai ? 'Recurring invoice' : 'Recurring invoices'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isThai ? 'ตั้งรอบสร้าง draft invoice อัตโนมัติสำหรับงานรายเดือน รายปี หรือสัญญาประจำ' : 'Schedule automatic draft invoices for monthly, yearly, or contract billing.'}
          </p>
        </div>
        <button onClick={() => navigate('/app/recurring-invoices/new')} className="btn-primary">
          <Plus className="h-4 w-4" />
          {isThai ? 'สร้างรอบวางบิล' : 'New schedule'}
        </button>
      </header>

      {msg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${msg.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="card">
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
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as RecurringInvoiceStatus | 'all')} className="input-field w-auto">
            <option value="all">{isThai ? 'ทุกสถานะ' : 'All statuses'}</option>
            {(Object.keys(STATUS_LABELS) as RecurringInvoiceStatus[]).map((status) => (
              <option key={status} value={status}>{isThai ? STATUS_LABELS[status].th : STATUS_LABELS[status].en}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary-500" /></div>
      ) : rows.length === 0 ? (
        <div className="card py-12 text-center text-gray-400">
          <CalendarClock className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p className="text-lg font-medium">{isThai ? 'ยังไม่มีรอบวางบิล' : 'No recurring schedules yet'}</p>
          <button onClick={() => navigate('/app/recurring-invoices/new')} className="btn-primary mt-4 inline-flex">
            <Plus className="h-4 w-4" />
            {isThai ? 'สร้างรอบแรก' : 'Create first schedule'}
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
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
                const total = row.items.reduce((sum, item) => {
                  const gross = item.quantity * item.unitPrice;
                  const discount = item.discountAmount > 0 ? (gross * item.discountAmount) / 100 : 0;
                  const amount = gross - discount;
                  return sum + amount + (item.vatType === 'vat7' ? amount * 0.07 : 0);
                }, 0) - row.discountAmount;
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
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
                    <td className="table-cell text-sm text-gray-700">{row.nextRunDate.slice(0, 10)}</td>
                    <td className="table-cell text-right font-medium">{formatCurrency(total)}</td>
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
      )}

      <div className="mt-2 text-xs text-gray-400">
        <Link to="/app/invoices" className="text-primary-600 hover:underline">
          {isThai ? '→ ดูใบกำกับภาษีที่สร้างแล้ว' : '→ View generated invoices'}
        </Link>
      </div>
    </div>
  );
}
