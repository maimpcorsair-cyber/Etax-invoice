import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, CalendarClock, FileText, Loader2, CheckCircle, XCircle, Clock, Receipt, Truck } from 'lucide-react';
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

export default function DeliveryNoteList() {
  const { token } = useAuthStore();
  const { isThai } = useLanguage();
  const navigate = useNavigate();
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeliveryNoteStatus | 'all'>('all');

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
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary-600" />
            {isThai ? 'ใบส่งของ' : 'Delivery Notes'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isThai
              ? 'ออกใบส่งของ ติดตามสถานะจัดส่ง แล้วแปลงเป็นใบกำกับภาษีเมื่อพร้อม'
              : 'Issue delivery notes, track delivery status, then convert into a tax invoice when ready'}
          </p>
        </div>
        <button onClick={() => navigate('/app/delivery-notes/new')} className="btn-primary">
          <Plus className="w-4 h-4" />
          {isThai ? 'สร้างใบส่งของ' : 'New delivery note'}
        </button>
      </header>

      <div className="card">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isThai ? 'ค้นหาเลขที่ / ลูกค้า / tracking...' : 'Search number, customer, tracking...'}
              className="input-field pl-9 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DeliveryNoteStatus | 'all')}
            className="input-field w-auto"
          >
            <option value="all">{isThai ? 'ทุกสถานะ' : 'All statuses'}</option>
            {(Object.keys(STATUS_LABELS) as DeliveryNoteStatus[]).map((s) => (
              <option key={s} value={s}>{isThai ? STATUS_LABELS[s].th : STATUS_LABELS[s].en}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
      ) : deliveryNotes.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">{isThai ? 'ยังไม่มีใบส่งของ' : 'No delivery notes yet'}</p>
          <p className="text-sm mt-1">{isThai ? 'เริ่มจากสร้างใบส่งของแรกของคุณ' : 'Get started by creating your first delivery note'}</p>
          <button onClick={() => navigate('/app/delivery-notes/new')} className="btn-primary mt-4 inline-flex">
            <Plus className="w-4 h-4" />
            {isThai ? 'สร้างใบส่งของ' : 'New delivery note'}
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{isThai ? 'เลขที่' : 'Number'}</th>
                <th className="table-header">{isThai ? 'ลูกค้า' : 'Customer'}</th>
                <th className="table-header">{isThai ? 'วันที่ส่ง' : 'Delivery date'}</th>
                <th className="table-header text-right">{isThai ? 'จำนวน' : 'Qty'}</th>
                <th className="table-header">{isThai ? 'Tracking' : 'Tracking'}</th>
                <th className="table-header text-center">{isThai ? 'สถานะ' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deliveryNotes.map((note) => {
                const meta = STATUS_LABELS[note.status];
                const Icon = meta.icon;
                return (
                  <tr key={note.id} onClick={() => navigate(`/app/delivery-notes/${note.id}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="table-cell font-mono text-sm font-semibold text-primary-700">{note.deliveryNoteNumber}</td>
                    <td className="table-cell">
                      <div className="font-medium text-gray-900">{note.buyer?.nameTh ?? '-'}</div>
                      <div className="text-xs text-gray-500">{note.buyer?.taxId ?? ''}</div>
                    </td>
                    <td className="table-cell text-sm text-gray-700">{note.deliveryDate.slice(0, 10)}</td>
                    <td className="table-cell text-right font-medium">{itemCount(note)}</td>
                    <td className="table-cell text-sm text-gray-500">{note.trackingNo || '—'}</td>
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
      )}

      <div className="text-xs text-gray-400 mt-2">
        <Link to="/app/quotations" className="text-primary-600 hover:underline">
          {isThai ? '→ ดูใบเสนอราคา' : '→ View quotations'}
        </Link>
      </div>
    </div>
  );
}
