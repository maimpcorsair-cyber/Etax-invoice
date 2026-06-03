import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, CalendarClock, FileText, Loader2, CheckCircle, XCircle, Clock, Receipt, Truck, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import SectionSubNav from '../components/SectionSubNav';
import type { DeliveryNote, DeliveryNoteStatus } from '../types';

const STATUS_LABELS: Record<DeliveryNoteStatus, { th: string; en: string; tone: string; icon: typeof Clock }> = {
  draft:     { th: 'แบบร่าง', en: 'Draft', tone: 'bg-slate-100 text-slate-700', icon: FileText },
  issued:    { th: 'ออกแล้ว', en: 'Issued', tone: 'bg-blue-100 text-blue-700', icon: Clock },
  delivered: { th: 'ส่งแล้ว', en: 'Delivered', tone: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  converted: { th: 'แปลงแล้ว', en: 'Converted', tone: 'bg-primary-100 text-primary-700', icon: Receipt },
  cancelled: { th: 'ยกเลิก', en: 'Cancelled', tone: 'bg-slate-100 text-slate-500', icon: XCircle },
};

function itemCount(note: DeliveryNote) {
  return note.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
}

function deliveredCount(note: DeliveryNote) {
  return note.items?.reduce((sum, item) => sum + item.deliveredQty, 0) ?? 0;
}

function statusMeta(note: DeliveryNote) {
  const ordered = itemCount(note);
  const delivered = deliveredCount(note);
  if (note.status === 'issued' && delivered > 0 && delivered < ordered) {
    return { th: 'ส่งบางส่วน', en: 'Partial', tone: 'bg-amber-100 text-amber-800', icon: Truck };
  }
  return STATUS_LABELS[note.status];
}

export default function DeliveryNoteList() {
  const { token } = useAuthStore();
  const { isThai } = useLanguage();
  const navigate = useNavigate();
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeliveryNoteStatus | 'all'>('all');

  const readyToInvoice = deliveryNotes.filter((note) => note.status === 'delivered');
  const inTransit = deliveryNotes.filter((note) => note.status === 'issued');
  const partialNotes = deliveryNotes.filter((note) => {
    const ordered = itemCount(note);
    const delivered = deliveredCount(note);
    return note.status === 'issued' && delivered > 0 && delivered < ordered;
  });
  const convertedNotes = deliveryNotes.filter((note) => note.status === 'converted');
  const trackingReady = deliveryNotes.filter((note) => Boolean(note.trackingNo || note.trackingUrl));
  const totalOrderedItems = deliveryNotes.reduce((sum, note) => sum + itemCount(note), 0);
  const totalDeliveredItems = deliveryNotes.reduce((sum, note) => sum + deliveredCount(note), 0);
  const latestNote = deliveryNotes[0];
  const workItems = [
    {
      label: isThai ? 'พร้อมออกใบกำกับ' : 'Ready to invoice',
      value: readyToInvoice.length,
      status: readyToInvoice.length > 0 ? (isThai ? 'Next' : 'Next') : (isThai ? 'Clear' : 'Clear'),
      dot: readyToInvoice.length > 0 ? 'bg-emerald-500' : 'bg-slate-300',
      icon: Receipt,
    },
    {
      label: isThai ? 'กำลังจัดส่ง' : 'In transit',
      value: inTransit.length,
      status: inTransit.length > 0 ? (isThai ? 'Track' : 'Track') : (isThai ? 'None' : 'None'),
      dot: inTransit.length > 0 ? 'bg-amber-500' : 'bg-slate-300',
      icon: Truck,
    },
    {
      label: isThai ? 'ส่งบางส่วน' : 'Partial delivery',
      value: partialNotes.length,
      status: partialNotes.length > 0 ? (isThai ? 'Review' : 'Review') : (isThai ? 'Safe' : 'Safe'),
      dot: partialNotes.length > 0 ? 'bg-rose-500' : 'bg-emerald-500',
      icon: Clock,
    },
    {
      label: isThai ? 'แปลงแล้ว' : 'Converted',
      value: convertedNotes.length,
      status: isThai ? 'Tax flow' : 'Tax flow',
      dot: convertedNotes.length > 0 ? 'bg-primary-500' : 'bg-slate-300',
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
      const res = await fetch(`/api/delivery-notes?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setDeliveryNotes(json.data ?? []);
    } catch {
      setDeliveryNotes([]);
    } finally {
      setLoading(false);
    }
  }, [token, search, statusFilter]);

  useEffect(() => { void load(); }, [load]);

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
              {isThai ? 'Delivery Ledger' : 'Delivery Ledger'}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 sm:mt-4">
              <div className="hidden h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:flex">
                <Truck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white sm:text-3xl">
                  {isThai ? 'ใบส่งของ' : 'Delivery Notes'}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-white/70">
                  {isThai
                    ? 'ติดตามของที่ส่งแล้ว ของที่ค้าง และแปลงเป็นใบกำกับภาษีเมื่อส่งครบ'
                    : 'Track delivered goods, partial shipments, and the handoff into tax invoices.'}
                </p>
              </div>
            </div>

            <div className="mt-5 sm:mt-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">
                {isThai ? 'พร้อมแปลงเป็นใบกำกับภาษี' : 'Ready to invoice'}
              </p>
              <div className="mt-2 max-w-2xl border-b border-[rgba(201,168,76,0.7)] pb-2 sm:pb-3">
                <p className="font-sarabun text-[2rem] font-bold leading-none text-white tabular-nums sm:text-[clamp(2rem,4vw,2.5rem)]">
                  {readyToInvoice.length}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/75 sm:mt-4 sm:gap-3">
                <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                  {isThai ? 'ส่งแล้ว / สั่ง' : 'Delivered / ordered'} <strong className="text-white tabular-nums">{totalDeliveredItems} / {totalOrderedItems}</strong>
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                  {isThai ? 'มี tracking' : 'Tracking'} <strong className="text-white tabular-nums">{trackingReady.length}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 p-3 text-white ring-1 ring-white/15 backdrop-blur-sm sm:p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">
              {isThai ? 'Next action' : 'Next action'}
            </p>
            <p className="mt-1.5 text-base font-semibold sm:mt-2 sm:text-lg">
              {latestNote
                ? latestNote.buyer?.nameTh ?? latestNote.deliveryNoteNumber
                : isThai ? 'เริ่มจากใบส่งของแรก' : 'Start with the first delivery note'}
            </p>
            <p className="mt-1 text-sm text-white/65">
              {latestNote
                ? `${latestNote.deliveryNoteNumber} · ${deliveredCount(latestNote)} / ${itemCount(latestNote)} ${isThai ? 'รายการ' : 'items'}`
                : isThai ? 'สร้างใบส่งของ ติดตามของ แล้วออก invoice เมื่อส่งครบ' : 'Create, track, then invoice after delivery.'}
            </p>
            <button onClick={() => navigate('/app/delivery-notes/new')} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-primary-800 shadow-sm hover:bg-primary-50 sm:mt-4">
              <Plus className="h-4 w-4" />
              {isThai ? 'สร้างใบส่งของ' : 'New delivery note'}
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

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isThai ? 'ค้นหาเลขที่ / ลูกค้า / tracking...' : 'Search number, customer, tracking...'}
              className="input-field w-full pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DeliveryNoteStatus | 'all')}
            className="input-field min-w-[180px]"
          >
            <option value="all">{isThai ? 'ทุกสถานะ' : 'All statuses'}</option>
            {(Object.keys(STATUS_LABELS) as DeliveryNoteStatus[]).map((s) => (
              <option key={s} value={s}>{isThai ? STATUS_LABELS[s].th : STATUS_LABELS[s].en}</option>
            ))}
          </select>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
      ) : deliveryNotes.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-500 shadow-sm">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">{isThai ? 'ยังไม่มีใบส่งของ' : 'No delivery notes yet'}</p>
          <p className="text-sm mt-1">{isThai ? 'เริ่มจากสร้างใบส่งของแรกของคุณ' : 'Get started by creating your first delivery note'}</p>
          <button onClick={() => navigate('/app/delivery-notes/new')} className="btn-primary mt-4 inline-flex">
            <Plus className="w-4 h-4" />
            {isThai ? 'สร้างใบส่งของ' : 'New delivery note'}
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">{isThai ? 'รายการใบส่งของ' : 'Delivery note ledger'}</p>
              <p className="text-xs text-slate-500">{isThai ? 'คลิกแถวเพื่อดูรายละเอียด อัปเดต tracking หรือแปลงเอกสาร' : 'Click a row to update tracking, progress, or conversion'}</p>
            </div>
            <Link to="/app/quotations" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
              {isThai ? 'ดูใบเสนอราคา' : 'View quotations'}
            </Link>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{isThai ? 'เลขที่' : 'Number'}</th>
                <th className="table-header">{isThai ? 'ลูกค้า' : 'Customer'}</th>
                <th className="table-header">{isThai ? 'วันที่ส่ง' : 'Delivery date'}</th>
                <th className="table-header text-right">{isThai ? 'ส่ง / สั่ง' : 'Delivered / ordered'}</th>
                <th className="table-header">{isThai ? 'การจัดส่ง' : 'Delivery'}</th>
                <th className="table-header text-center">{isThai ? 'สถานะ' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deliveryNotes.map((note) => {
                const meta = statusMeta(note);
                const Icon = meta.icon;
                return (
                  <tr key={note.id} onClick={() => navigate(`/app/delivery-notes/${note.id}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="table-cell text-sm font-semibold text-primary-700 tabular-nums">{note.deliveryNoteNumber}</td>
                    <td className="table-cell">
                      <div className="font-medium text-gray-900">{note.buyer?.nameTh ?? '-'}</div>
                      <div className="text-xs text-gray-500">{note.buyer?.taxId ?? ''}</div>
                    </td>
                    <td className="table-cell text-sm text-gray-700 tabular-nums">{note.deliveryDate.slice(0, 10)}</td>
                    <td className="table-cell text-right font-semibold tabular-nums">{deliveredCount(note)} / {itemCount(note)}</td>
                    <td className="table-cell text-sm text-gray-500">
                      {note.carrierName && <div>{note.carrierName}</div>}
                      {note.trackingUrl ? (
                        <a
                          href={note.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center gap-1 text-primary-700 hover:underline"
                        >
                          {note.trackingNo || (isThai ? 'เปิดลิงก์ติดตาม' : 'Open tracking')}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (note.trackingNo || '—')}
                    </td>
                    <td className="table-cell text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${meta.tone}`}>
                        <Icon className="w-3 h-3" />
                        {isThai ? meta.th : meta.en}
                      </span>
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
