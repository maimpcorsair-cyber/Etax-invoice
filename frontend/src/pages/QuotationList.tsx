import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, Loader2, ArrowRight, CalendarClock, CheckCircle, XCircle, Clock, Receipt, Truck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import SectionSubNav from '../components/SectionSubNav';
import type { Quotation, QuotationStatus } from '../types';

// ใบเสนอราคา — list page. Mirrors InvoiceList layout but simpler since
// quotations have no e-Tax submission flow.

const STATUS_LABELS: Record<QuotationStatus, { th: string; en: string; tone: string; icon: typeof Clock }> = {
  draft:     { th: 'แบบร่าง',     en: 'Draft',     tone: 'bg-slate-100 text-slate-700',   icon: FileText },
  sent:      { th: 'ส่งแล้ว',     en: 'Sent',      tone: 'bg-blue-100 text-blue-700',     icon: Clock },
  accepted:  { th: 'ยอมรับ',      en: 'Accepted',  tone: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  converted: { th: 'แปลงแล้ว',    en: 'Converted', tone: 'bg-indigo-100 text-indigo-700', icon: ArrowRight },
  rejected:  { th: 'ปฏิเสธ',      en: 'Rejected',  tone: 'bg-rose-100 text-rose-700',     icon: XCircle },
  expired:   { th: 'หมดอายุ',     en: 'Expired',   tone: 'bg-amber-100 text-amber-700',   icon: Clock },
  cancelled: { th: 'ยกเลิก',      en: 'Cancelled', tone: 'bg-slate-100 text-slate-500',   icon: XCircle },
};

export default function QuotationList() {
  const { token } = useAuthStore();
  const { isThai, formatCurrency } = useLanguage();
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | 'all'>('all');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/quotations?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setQuotations(json.data ?? []);
    } catch {
      setQuotations([]);
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
            <FileText className="w-6 h-6 text-indigo-600" />
            {isThai ? 'ใบเสนอราคา' : 'Quotations'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isThai
              ? 'ออกใบเสนอราคา ส่งให้ลูกค้า แล้วแปลงเป็นใบกำกับภาษีตอนปิดดีล'
              : 'Send price quotes to customers, then convert accepted quotes into tax invoices'}
          </p>
        </div>
        <button onClick={() => navigate('/app/quotations/new')} className="btn-primary">
          <Plus className="w-4 h-4" />
          {isThai ? 'สร้างใบเสนอราคา' : 'New quotation'}
        </button>
      </header>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isThai ? 'ค้นหาเลขที่ / ชื่อลูกค้า...' : 'Search number or customer...'}
              className="input-field pl-9 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as QuotationStatus | 'all')}
            className="input-field w-auto"
          >
            <option value="all">{isThai ? 'ทุกสถานะ' : 'All statuses'}</option>
            {(Object.keys(STATUS_LABELS) as QuotationStatus[]).map((s) => (
              <option key={s} value={s}>{isThai ? STATUS_LABELS[s].th : STATUS_LABELS[s].en}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      ) : quotations.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">{isThai ? 'ยังไม่มีใบเสนอราคา' : 'No quotations yet'}</p>
          <p className="text-sm mt-1">
            {isThai
              ? 'เริ่มจากสร้างใบเสนอราคาแรกของคุณ'
              : 'Get started by creating your first quotation'}
          </p>
          <button onClick={() => navigate('/app/quotations/new')} className="btn-primary mt-4 inline-flex">
            <Plus className="w-4 h-4" />
            {isThai ? 'สร้างใบเสนอราคา' : 'New quotation'}
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{isThai ? 'เลขที่' : 'Number'}</th>
                <th className="table-header">{isThai ? 'ลูกค้า' : 'Customer'}</th>
                <th className="table-header">{isThai ? 'วันที่' : 'Date'}</th>
                <th className="table-header">{isThai ? 'หมดอายุ' : 'Valid until'}</th>
                <th className="table-header text-right">{isThai ? 'ยอดรวม' : 'Total'}</th>
                <th className="table-header text-center">{isThai ? 'สถานะ' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotations.map((q) => {
                const meta = STATUS_LABELS[q.status];
                const Icon = meta.icon;
                return (
                  <tr
                    key={q.id}
                    onClick={() => navigate(`/app/quotations/${q.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="table-cell font-mono text-sm font-semibold text-indigo-700">{q.quotationNumber}</td>
                    <td className="table-cell">
                      <div className="font-medium text-gray-900">{q.buyer?.nameTh ?? '-'}</div>
                      <div className="text-xs text-gray-500">{q.buyer?.taxId ?? ''}</div>
                    </td>
                    <td className="table-cell text-sm text-gray-700">{q.quotationDate.slice(0, 10)}</td>
                    <td className="table-cell text-sm text-gray-500">{q.validUntil ? q.validUntil.slice(0, 10) : '—'}</td>
                    <td className="table-cell text-right font-medium">{formatCurrency(q.total)}</td>
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
        <Link to="/app/invoices" className="text-indigo-600 hover:underline">
          {isThai ? '→ ดูใบกำกับภาษีที่ออกแล้ว' : '→ View issued tax invoices'}
        </Link>
      </div>
    </div>
  );
}
