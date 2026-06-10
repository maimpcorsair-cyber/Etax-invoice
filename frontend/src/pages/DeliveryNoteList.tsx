import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, CalendarClock, FileText, Loader2, CheckCircle, XCircle, Clock, Receipt, Truck, ExternalLink, Eye, Download } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import SectionSubNav from '../components/SectionSubNav';
import type { DeliveryNote, DeliveryNoteStatus } from '../types';
import DocumentPreviewSheet, { type DocumentPreviewArtifact, type DocumentPreviewStep } from '../components/DocumentPreviewSheet';

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

function stageDate(value: string | null | undefined, isThai: boolean) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(isThai ? 'th-TH' : 'en-GB');
}

function deliveryPreviewSteps(note: DeliveryNote, isThai: boolean): DocumentPreviewStep[] {
  const ordered = itemCount(note);
  const delivered = deliveredCount(note);
  const partial = note.status === 'issued' && delivered > 0 && delivered < ordered;
  const cancelled = note.status === 'cancelled';
  const expectedDate = stageDate(note.expectedDate, isThai);

  return [
    {
      id: 'created',
      label: isThai ? 'สร้างใบส่งของ' : 'Delivery note created',
      description: isThai ? `เลขที่ ${note.deliveryNoteNumber}` : `No. ${note.deliveryNoteNumber}`,
      meta: stageDate(note.deliveryDate, isThai) ?? (isThai ? 'วันที่ส่งของ' : 'Delivery date'),
      state: note.status === 'draft' ? 'current' : 'done',
    },
    {
      id: 'issued',
      label: isThai ? 'ออกเอกสารให้คลัง/ทีมส่ง' : 'Issued to fulfillment',
      description: note.expectedDate
        ? isThai ? `กำหนดส่ง ${new Date(note.expectedDate).toLocaleDateString('th-TH')}` : `Expected ${new Date(note.expectedDate).toLocaleDateString('en-US')}`
        : isThai ? 'พร้อมนำไปจัดส่ง' : 'Ready for delivery handling.',
      meta: note.expectedDate ? expectedDate ? `${isThai ? 'กำหนดส่ง' : 'Expected'} ${expectedDate}` : (isThai ? 'มีวันกำหนดส่ง' : 'Expected date set') : (isThai ? 'พร้อมจัดส่ง' : 'Ready'),
      state: cancelled ? 'blocked' : ['issued', 'delivered', 'converted'].includes(note.status) ? 'done' : 'pending',
    },
    {
      id: 'delivered',
      label: isThai ? 'ยืนยันการส่งมอบ' : 'Delivery confirmed',
      description: partial
        ? isThai ? `ส่งแล้ว ${delivered}/${ordered} รายการ` : `${delivered}/${ordered} items delivered.`
        : isThai ? 'ใช้ตรวจว่าของถึงลูกค้าแล้วหรือยัง' : 'Tracks whether goods reached the customer.',
      meta: note.deliveredAt ? stageDate(note.deliveredAt, isThai) : `${delivered}/${ordered} ${isThai ? 'รายการ' : 'items'}`,
      state: cancelled ? 'blocked' : note.status === 'delivered' || note.status === 'converted' ? 'done' : partial || note.status === 'issued' ? 'current' : 'pending',
    },
    {
      id: 'invoice',
      label: isThai ? 'แปลงเป็นใบกำกับ' : 'Convert to invoice',
      description: isThai ? 'ส่งมอบครบแล้วจึงออกเอกสารขายต่อ' : 'Create the sales document after fulfillment.',
      meta: note.invoiceId ? (isThai ? 'เชื่อมใบกำกับแล้ว' : 'Invoice linked') : (isThai ? 'รอออกเอกสารขาย' : 'Awaiting invoice'),
      state: note.status === 'converted' ? 'done' : note.status === 'delivered' ? 'current' : 'pending',
    },
  ];
}

function deliveryPreviewArtifacts(note: DeliveryNote, isThai: boolean): DocumentPreviewArtifact[] {
  const ordered = itemCount(note);
  const delivered = deliveredCount(note);
  const cancelled = note.status === 'cancelled';
  const fulfilled = note.status === 'delivered' || note.status === 'converted';
  const converted = note.status === 'converted' || Boolean(note.invoiceId);
  const hasTracking = Boolean(note.trackingUrl || note.trackingNo);

  return [
    {
      id: 'delivery-workflow',
      label: note.deliveryNoteNumber,
      description: isThai ? 'แฟ้มใบส่งของและหลักฐานการจัดส่ง' : 'Delivery note workspace and fulfillment evidence.',
      kind: 'folder',
      state: cancelled ? 'blocked' : note.status === 'draft' ? 'pending' : 'ready',
      children: [
        {
          id: 'pdf',
          label: isThai ? 'PDF ใบส่งของ' : 'Delivery note PDF',
          description: isThai ? 'ใช้ให้คลัง/คนส่งของ/ลูกค้าตรวจรายการ' : 'Used by fulfillment, couriers, and customers to confirm items.',
          kind: 'pdf',
          state: cancelled ? 'blocked' : note.status === 'draft' ? 'pending' : 'ready',
          meta: `${delivered}/${ordered} ${isThai ? 'รายการ' : 'items'}`,
        },
        {
          id: 'tracking',
          label: isThai ? 'หลักฐานติดตามการส่ง' : 'Shipment tracking',
          description: hasTracking
            ? isThai ? 'มีเลขหรือ URL สำหรับติดตามการจัดส่ง' : 'Tracking number or URL is available.'
            : isThai ? 'ยังไม่มีเลขติดตามจากขนส่ง' : 'No tracking details from carrier yet.',
          href: note.trackingUrl,
          kind: 'link',
          state: hasTracking ? 'ready' : cancelled ? 'blocked' : 'pending',
          meta: note.trackingNo ?? note.carrierName ?? undefined,
        },
      ],
    },
    {
      id: 'sales-followup',
      label: isThai ? 'ต่อยอดหลังส่งมอบ' : 'After delivery',
      description: isThai ? 'จุดเชื่อมจากใบส่งของไปเอกสารขาย' : 'Bridge from fulfillment into sales documentation.',
      kind: 'folder',
      state: converted ? 'ready' : fulfilled ? 'pending' : cancelled ? 'blocked' : 'pending',
      children: [
        {
          id: 'delivered-proof',
          label: isThai ? 'ยืนยันส่งมอบ' : 'Delivery confirmation',
          description: fulfilled
            ? isThai ? 'ส่งมอบครบและพร้อมออกเอกสารขายต่อ' : 'Fulfillment is complete and ready for sales document creation.'
            : isThai ? 'รอข้อมูลส่งมอบจากทีมงาน' : 'Waiting for fulfillment confirmation.',
          kind: 'file',
          state: fulfilled ? 'ready' : cancelled ? 'blocked' : 'pending',
          meta: note.deliveredAt ? stageDate(note.deliveredAt, isThai) : undefined,
        },
        {
          id: 'invoice',
          label: isThai ? 'ใบกำกับ/ใบเสร็จที่เชื่อม' : 'Linked invoice or receipt',
          description: converted
            ? isThai ? 'มีเอกสารขายที่เกิดจากใบส่งของนี้แล้ว' : 'A sales document has been created from this delivery note.'
            : isThai ? 'สร้างหลังยืนยันส่งมอบ' : 'Created after delivery confirmation.',
          kind: 'file',
          state: converted ? 'ready' : fulfilled ? 'pending' : cancelled ? 'blocked' : 'pending',
          meta: note.invoiceId ? (isThai ? 'เชื่อมแล้ว' : 'Linked') : undefined,
        },
      ],
    },
  ];
}

export default function DeliveryNoteList() {
  const { token } = useAuthStore();
  const { isThai } = useLanguage();
  const navigate = useNavigate();
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeliveryNoteStatus | 'all'>('all');
  const [previewNote, setPreviewNote] = useState<DeliveryNote | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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

  async function openPreview(note: DeliveryNote) {
    if (!token) return;
    setPreviewNote(note);
    setPreviewHtml(null);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/delivery-notes/${note.id}/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setPreviewHtml(await res.text());
    } catch (err) {
      setPreviewError((err as Error).message);
    }
  }

  function closePreview() {
    setPreviewNote(null);
    setPreviewHtml(null);
    setPreviewError(null);
  }

  async function downloadPdf(note: DeliveryNote) {
    if (!token) return;
    setDownloadingId(note.id);
    try {
      const res = await fetch(`/api/delivery-notes/${note.id}/preview?format=pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${note.deliveryNoteNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
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

      <section className="workspace-command">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.7fr)] lg:items-stretch">
          <div className="min-w-0">
            <p className="premium-eyebrow">{isThai ? 'Delivery Ledger' : 'Delivery Ledger'}</p>
            <div className="mt-3 flex items-center gap-3 sm:mt-4">
              <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800 ring-1 ring-primary-100 sm:inline-flex">
                <Truck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-slate-950 sm:text-3xl">
                  {isThai ? 'ใบส่งของ' : 'Delivery Notes'}
                </h1>
                <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-slate-600 sm:block">
                  {isThai
                    ? 'ติดตามของที่ส่งแล้ว ของที่ค้าง และแปลงเป็นใบกำกับภาษีเมื่อส่งครบ'
                    : 'Track delivered goods, partial shipments, and the handoff into tax invoices.'}
                </p>
              </div>
            </div>
            <div className="mt-4 sm:mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {isThai ? 'พร้อมแปลงเป็นใบกำกับภาษี' : 'Ready to invoice'}
              </p>
              <p className="mt-1 text-[2.15rem] font-bold leading-none text-primary-800 tabular-nums sm:text-[2.5rem]">
                {readyToInvoice.length}
              </p>
              <div className="mt-3 h-px w-40 bg-slate-200" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:mt-5 sm:gap-3">
              <div className="border-t border-slate-200 px-1 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? 'ส่งแล้ว / สั่ง' : 'Delivered / ordered'}</p>
                <p className="mt-1 font-bold text-slate-950 tabular-nums">{totalDeliveredItems} / {totalOrderedItems}</p>
              </div>
              <div className="border-t border-slate-200 px-1 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? 'มี tracking' : 'Tracking'}</p>
                <p className="mt-1 font-bold text-slate-950 tabular-nums">{trackingReady.length}</p>
              </div>
            </div>
          </div>

          <div className="workspace-command-rail">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
              <Truck className="h-4 w-4 text-primary-700" />
              {isThai ? 'งานส่งของถัดไป' : 'Next delivery action'}
            </div>
            <div className="mt-3 border-y border-slate-200 py-3">
              <p className="text-sm font-bold text-slate-950">
                {latestNote
                  ? latestNote.buyer?.nameTh ?? latestNote.deliveryNoteNumber
                  : isThai ? 'เริ่มจากใบส่งของแรก' : 'Start with the first delivery note'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {latestNote
                  ? `${latestNote.deliveryNoteNumber} · ${deliveredCount(latestNote)} / ${itemCount(latestNote)} ${isThai ? 'รายการ' : 'items'}`
                  : isThai ? 'สร้างใบส่งของ ติดตามของ แล้วออก invoice เมื่อส่งครบ' : 'Create, track, then invoice after delivery.'}
              </p>
            </div>
            <div className="mt-3">
              <button onClick={() => navigate('/app/delivery-notes/new')} className="btn-primary w-full px-3 py-2 text-sm sm:px-4 sm:py-2.5">
                <Plus className="h-4 w-4" />
                <span>{isThai ? 'สร้างใบส่งของ' : 'New delivery note'}</span>
              </button>
            </div>
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
                <th className="table-header text-right">{isThai ? 'ไฟล์' : 'File'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deliveryNotes.map((note) => {
                const meta = statusMeta(note);
                const Icon = meta.icon;
                return (
                  <tr key={note.id} onClick={() => void openPreview(note)} className="hover:bg-gray-50 cursor-pointer">
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
                    <td className="table-cell text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openPreview(note);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {isThai ? 'ดู' : 'View'}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void downloadPdf(note);
                          }}
                          disabled={downloadingId === note.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {downloadingId === note.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          PDF
                        </button>
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

      <DocumentPreviewSheet
        open={Boolean(previewNote)}
        title={isThai ? 'ใบส่งของ' : 'Delivery note'}
        description={previewNote?.buyer?.nameTh ?? previewNote?.buyer?.nameEn ?? undefined}
        documentNumber={previewNote?.deliveryNoteNumber ?? ''}
        previewHtml={previewHtml}
        loading={Boolean(previewNote) && !previewHtml && !previewError}
        error={previewError}
        downloading={previewNote ? downloadingId === previewNote.id : false}
        editHref={previewNote ? `/app/delivery-notes/${previewNote.id}` : undefined}
        statusSteps={previewNote ? deliveryPreviewSteps(previewNote, isThai) : undefined}
        artifacts={previewNote ? deliveryPreviewArtifacts(previewNote, isThai) : undefined}
        onDownload={() => {
          if (previewNote) void downloadPdf(previewNote);
        }}
        onClose={closePreview}
      />
    </div>
  );
}
