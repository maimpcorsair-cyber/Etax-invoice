import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, Loader2, ArrowRight, CalendarClock, CheckCircle, XCircle, Clock, Receipt, Truck, Download, Share2, Eye } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import SectionSubNav from '../components/SectionSubNav';
import type { Quotation, QuotationStatus } from '../types';
import DocumentPreviewSheet, { type DocumentPreviewArtifact, type DocumentPreviewStep } from '../components/DocumentPreviewSheet';

// ใบเสนอราคา — list page. Mirrors InvoiceList layout but simpler since
// quotations have no e-Tax submission flow.

const STATUS_LABELS: Record<QuotationStatus, { th: string; en: string; tone: string; icon: typeof Clock }> = {
  draft:     { th: 'แบบร่าง',     en: 'Draft',     tone: 'bg-slate-100 text-slate-700',   icon: FileText },
  sent:      { th: 'ส่งแล้ว',     en: 'Sent',      tone: 'bg-blue-100 text-blue-700',     icon: Clock },
  accepted:  { th: 'ยอมรับ',      en: 'Accepted',  tone: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  converted: { th: 'แปลงแล้ว',    en: 'Converted', tone: 'bg-primary-100 text-primary-700', icon: ArrowRight },
  rejected:  { th: 'ปฏิเสธ',      en: 'Rejected',  tone: 'bg-rose-100 text-rose-700',     icon: XCircle },
  expired:   { th: 'หมดอายุ',     en: 'Expired',   tone: 'bg-amber-100 text-amber-700',   icon: Clock },
  cancelled: { th: 'ยกเลิก',      en: 'Cancelled', tone: 'bg-slate-100 text-slate-500',   icon: XCircle },
};

function stageDate(value: string | null | undefined, isThai: boolean) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(isThai ? 'th-TH' : 'en-GB');
}

function quotationPreviewSteps(quotation: Quotation, isThai: boolean): DocumentPreviewStep[] {
  const status = quotation.status;
  const hasSent = ['sent', 'accepted', 'converted', 'rejected', 'expired'].includes(status);
  const isClosedProblem = ['rejected', 'expired', 'cancelled'].includes(status);
  const validUntil = stageDate(quotation.validUntil, isThai);

  return [
    {
      id: 'draft',
      label: isThai ? 'เตรียมใบเสนอราคา' : 'Prepare quote',
      description: isThai ? `เลขที่ ${quotation.quotationNumber}` : `No. ${quotation.quotationNumber}`,
      meta: stageDate(quotation.quotationDate, isThai) ?? (isThai ? 'วันที่เสนอราคา' : 'Quote date'),
      state: status === 'draft' ? 'current' : 'done',
    },
    {
      id: 'sent',
      label: isThai ? 'ส่งให้ลูกค้า' : 'Sent to customer',
      description: quotation.validUntil
        ? isThai ? `ใช้ได้ถึง ${new Date(quotation.validUntil).toLocaleDateString('th-TH')}` : `Valid until ${new Date(quotation.validUntil).toLocaleDateString('en-US')}`
        : isThai ? 'พร้อมส่งลิงก์หรือ PDF' : 'Ready for a link or PDF.',
      meta: quotation.validUntil ? validUntil ? `${isThai ? 'หมดอายุ' : 'Expires'} ${validUntil}` : (isThai ? 'มีวันหมดอายุ' : 'Expiry date set') : (isThai ? 'พร้อมส่ง' : 'Ready to send'),
      state: status === 'draft' ? 'pending' : hasSent ? 'done' : 'pending',
    },
    {
      id: 'accepted',
      label: isThai ? 'ลูกค้าตอบรับ' : 'Customer response',
      description: isClosedProblem
        ? isThai ? STATUS_LABELS[status].th : STATUS_LABELS[status].en
        : isThai ? 'รออนุมัติหรือยืนยันงาน' : 'Await acceptance or confirmation.',
      meta: isClosedProblem
        ? (isThai ? 'ปิดงานแล้ว' : 'Closed')
        : ['accepted', 'converted'].includes(status) ? (isThai ? 'ตอบรับแล้ว' : 'Accepted') : (isThai ? 'รอลูกค้า' : 'Awaiting customer'),
      state: isClosedProblem ? 'blocked' : status === 'sent' ? 'current' : ['accepted', 'converted'].includes(status) ? 'done' : 'pending',
    },
    {
      id: 'converted',
      label: isThai ? 'แปลงเป็นเอกสารขาย' : 'Convert to sales document',
      description: isThai ? 'เข้าสู่รอบใบกำกับภาษี / ใบเสร็จ' : 'Moves into invoice or receipt workflow.',
      meta: quotation.convertedAt ? stageDate(quotation.convertedAt, isThai) : (isThai ? 'รอแปลงเอกสาร' : 'Awaiting conversion'),
      state: status === 'converted' ? 'done' : status === 'accepted' ? 'current' : 'pending',
    },
  ];
}

function quotationPreviewArtifacts(quotation: Quotation, isThai: boolean): DocumentPreviewArtifact[] {
  const closedProblem = ['rejected', 'expired', 'cancelled'].includes(quotation.status);
  const sent = ['sent', 'accepted', 'converted'].includes(quotation.status);
  const converted = quotation.status === 'converted' || Boolean(quotation.convertedToInvoiceId);

  return [
    {
      id: 'quotation-workflow',
      label: quotation.quotationNumber,
      description: isThai ? 'แฟ้มใบเสนอราคาและไฟล์ที่ใช้คุยกับลูกค้า' : 'Quotation workspace and customer-facing artifacts.',
      kind: 'folder',
      state: closedProblem ? 'blocked' : sent ? 'ready' : 'pending',
      children: [
        {
          id: 'pdf',
          label: isThai ? 'PDF ใบเสนอราคา' : 'Quotation PDF',
          description: isThai ? 'สร้างจากตัวอย่างเพื่อส่งให้ลูกค้า' : 'Generated from preview for customer sharing.',
          kind: 'pdf',
          state: closedProblem ? 'blocked' : 'pending',
          meta: isThai ? 'สร้างเมื่อดาวน์โหลด' : 'Generated on download',
        },
        {
          id: 'customer-share',
          label: isThai ? 'ลิงก์ส่งลูกค้า' : 'Customer share link',
          description: sent
            ? isThai ? 'ใบเสนอราคาถูกส่งหรือพร้อม follow-up แล้ว' : 'Quote has been sent or is ready for follow-up.'
            : isThai ? 'ส่งได้หลังออกจากแบบร่าง' : 'Available after leaving draft.',
          kind: 'link',
          state: sent ? 'ready' : closedProblem ? 'blocked' : 'pending',
          meta: STATUS_LABELS[quotation.status][isThai ? 'th' : 'en'],
        },
      ],
    },
    {
      id: 'conversion-workflow',
      label: isThai ? 'ต่อยอดเป็นเอกสารขาย' : 'Sales conversion',
      description: isThai ? 'จุดเชื่อมจากใบเสนอราคาไปใบกำกับ/ใบเสร็จ' : 'Bridge from quote into invoice or receipt workflow.',
      kind: 'folder',
      state: converted ? 'ready' : quotation.status === 'accepted' ? 'pending' : closedProblem ? 'blocked' : 'pending',
      children: [
        {
          id: 'accepted',
          label: isThai ? 'หลักฐานลูกค้าตอบรับ' : 'Customer acceptance',
          description: isThai ? 'ใช้ยืนยันก่อนสร้างเอกสารขายจริง' : 'Confirmation before creating the real sales document.',
          kind: 'file',
          state: ['accepted', 'converted'].includes(quotation.status) ? 'ready' : closedProblem ? 'blocked' : 'pending',
        },
        {
          id: 'invoice',
          label: isThai ? 'เอกสารขายที่แปลงแล้ว' : 'Converted sales document',
          description: converted
            ? isThai ? 'เชื่อมไป workflow ใบกำกับ/ใบเสร็จแล้ว' : 'Connected to the invoice or receipt workflow.'
            : isThai ? 'รอแปลงเมื่อชนะงาน' : 'Waiting for conversion after acceptance.',
          kind: 'file',
          state: converted ? 'ready' : quotation.status === 'accepted' ? 'pending' : closedProblem ? 'blocked' : 'pending',
          meta: quotation.convertedToInvoiceId ? (isThai ? 'มี invoice id' : 'Invoice linked') : undefined,
        },
      ],
    },
  ];
}

export default function QuotationList() {
  const { token } = useAuthStore();
  const { isThai, formatCurrency } = useLanguage();
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [listMsg, setListMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | 'all'>('all');

  const today = new Date();
  const acceptedQuotes = quotations.filter((q) => q.status === 'accepted');
  const sentQuotes = quotations.filter((q) => q.status === 'sent');
  const draftQuotes = quotations.filter((q) => q.status === 'draft');
  const convertedQuotes = quotations.filter((q) => q.status === 'converted');
  const expiringQuotes = quotations.filter((q) => {
    if (!q.validUntil || q.status === 'converted' || q.status === 'cancelled' || q.status === 'rejected') return false;
    const validUntil = new Date(q.validUntil);
    const diffDays = (validUntil.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 7;
  });
  const acceptedValue = acceptedQuotes.reduce((sum, q) => sum + Number(q.total ?? 0), 0);
  const openValue = quotations
    .filter((q) => q.status === 'sent' || q.status === 'accepted' || q.status === 'draft')
    .reduce((sum, q) => sum + Number(q.total ?? 0), 0);
  const latestQuote = quotations[0];
  const workItems = [
    {
      label: isThai ? 'รอลูกค้าตอบรับ' : 'Awaiting customer',
      value: sentQuotes.length,
      status: sentQuotes.length > 0 ? (isThai ? 'Follow up' : 'Follow up') : (isThai ? 'Clear' : 'Clear'),
      dot: sentQuotes.length > 0 ? 'bg-amber-500' : 'bg-emerald-500',
      icon: Clock,
    },
    {
      label: isThai ? 'ใกล้หมดอายุ' : 'Expiring soon',
      value: expiringQuotes.length,
      status: expiringQuotes.length > 0 ? (isThai ? 'Review' : 'Review') : (isThai ? 'Safe' : 'Safe'),
      dot: expiringQuotes.length > 0 ? 'bg-rose-500' : 'bg-emerald-500',
      icon: CalendarClock,
    },
    {
      label: isThai ? 'แบบร่าง' : 'Draft quotes',
      value: draftQuotes.length,
      status: draftQuotes.length > 0 ? (isThai ? 'Finish' : 'Finish') : (isThai ? 'None' : 'None'),
      dot: draftQuotes.length > 0 ? 'bg-amber-500' : 'bg-slate-300',
      icon: FileText,
    },
    {
      label: isThai ? 'แปลงเป็นใบกำกับแล้ว' : 'Converted',
      value: convertedQuotes.length,
      status: isThai ? 'Tax flow' : 'Tax flow',
      dot: convertedQuotes.length > 0 ? 'bg-primary-500' : 'bg-slate-300',
      icon: ArrowRight,
    },
  ];

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

  async function downloadPdf(quotation: Quotation) {
    if (!token) return;
    setDownloadId(quotation.id);
    try {
      const res = await fetch(`/api/quotations/${quotation.id}/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('PDF failed');
      const blob = new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${quotation.quotationNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadId(null);
    }
  }

  async function openPreview(quotation: Quotation) {
    if (!token) return;
    setPreviewQuotation(quotation);
    setPreviewHtml(null);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/quotations/${quotation.id}/preview?format=html`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setPreviewHtml(await res.text());
    } catch (err) {
      setPreviewError((err as Error).message);
    }
  }

  function closePreview() {
    setPreviewQuotation(null);
    setPreviewHtml(null);
    setPreviewError(null);
  }

  async function shareQuotation(quotation: Quotation) {
    if (!token || quotation.status === 'draft' || quotation.status === 'cancelled' || quotation.status === 'converted') return;
    setShareId(quotation.id);
    setListMsg(null);
    try {
      const res = await fetch(`/api/quotations/${quotation.id}/share-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json() as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? 'Failed');
      await navigator.clipboard.writeText(body.url);
      setListMsg({ type: 'ok', text: isThai ? 'คัดลอกลิงก์ใบเสนอราคาแล้ว ส่งให้ลูกค้าได้เลย' : 'Quotation link copied' });
    } catch (err) {
      setListMsg({ type: 'err', text: isThai ? `สร้างลิงก์ไม่สำเร็จ: ${(err as Error).message}` : `Could not create link: ${(err as Error).message}` });
    } finally {
      setShareId(null);
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
            <p className="premium-eyebrow">{isThai ? 'Quote Pipeline Ledger' : 'Quote Pipeline Ledger'}</p>
            <div className="mt-3 flex items-center gap-3 sm:mt-4">
              <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800 ring-1 ring-primary-100 sm:inline-flex">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-slate-950 sm:text-3xl">
                  {isThai ? 'ใบเสนอราคา' : 'Quotations'}
                </h1>
                <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-slate-600 sm:block">
                  {isThai
                    ? 'ดูมูลค่าดีลที่ลูกค้ารับแล้ว งานที่ต้องตาม และแปลงเป็นใบกำกับภาษีเมื่อปิดดีล'
                    : 'Track accepted quote value, follow-up work, and the path into tax invoices.'}
                </p>
              </div>
            </div>
            <div className="mt-4 sm:mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {isThai ? 'มูลค่าใบเสนอราคาที่ตอบรับแล้ว' : 'Accepted quote value'}
              </p>
              <p className="mt-1 text-[2.15rem] font-bold leading-none text-primary-800 tabular-nums sm:text-[2.5rem]">
                {formatCurrency(acceptedValue)}
              </p>
              <div className="mt-3 h-px w-40 bg-slate-200" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:mt-5 sm:gap-3">
              <div className="border-t border-slate-200 px-1 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? 'มูลค่าเปิดอยู่' : 'Open value'}</p>
                <p className="mt-1 font-bold text-slate-950 tabular-nums">{formatCurrency(openValue)}</p>
              </div>
              <div className="border-t border-slate-200 px-1 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? 'ทั้งหมด' : 'Total'}</p>
                <p className="mt-1 font-bold text-slate-950 tabular-nums">{quotations.length}</p>
              </div>
            </div>
          </div>

          <div className="workspace-command-rail">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
              <FileText className="h-4 w-4 text-primary-700" />
              {isThai ? 'งานเสนอราคาถัดไป' : 'Next quote action'}
            </div>
            <div className="mt-3 border-y border-slate-200 py-3">
              <p className="text-sm font-bold text-slate-950">
                {latestQuote
                  ? latestQuote.buyer?.nameTh ?? latestQuote.quotationNumber
                  : isThai ? 'เริ่มจากใบเสนอราคาแรก' : 'Start with the first quote'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {latestQuote
                  ? `${latestQuote.quotationNumber} · ${formatCurrency(latestQuote.total)}`
                  : isThai ? 'สร้าง ส่งลิงก์ให้ลูกค้า แล้วแปลงเป็นเอกสารขายเมื่อยอมรับ' : 'Create, share, then convert once accepted.'}
              </p>
            </div>
            <div className="mt-3">
              <button onClick={() => navigate('/app/quotations/new')} className="btn-primary w-full px-3 py-2 text-sm sm:px-4 sm:py-2.5">
                <Plus className="h-4 w-4" />
                <span>{isThai ? 'สร้างใบเสนอราคา' : 'New quotation'}</span>
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
              placeholder={isThai ? 'ค้นหาเลขที่ / ชื่อลูกค้า...' : 'Search number or customer...'}
              className="input-field w-full pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as QuotationStatus | 'all')}
            className="input-field min-w-[180px]"
          >
            <option value="all">{isThai ? 'ทุกสถานะ' : 'All statuses'}</option>
            {(Object.keys(STATUS_LABELS) as QuotationStatus[]).map((s) => (
              <option key={s} value={s}>{isThai ? STATUS_LABELS[s].th : STATUS_LABELS[s].en}</option>
            ))}
          </select>
        </div>
      </section>

      {listMsg && (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
          listMsg.type === 'ok'
            ? 'border-primary-100 bg-white text-primary-800'
            : 'border-rose-200 bg-white text-rose-800'
        }`}>
          {listMsg.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
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
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">{isThai ? 'รายการใบเสนอราคา' : 'Quotation ledger'}</p>
              <p className="text-xs text-slate-500">{isThai ? 'คลิกแถวเพื่อดูรายละเอียดหรือแก้ไข' : 'Click a row to view details or edit'}</p>
            </div>
            <Link to="/app/invoices" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
              {isThai ? 'ดูใบกำกับภาษีที่ออกแล้ว' : 'View issued tax invoices'}
            </Link>
          </div>
          <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{isThai ? 'เลขที่' : 'Number'}</th>
                <th className="table-header">{isThai ? 'ลูกค้า' : 'Customer'}</th>
                <th className="table-header">{isThai ? 'วันที่' : 'Date'}</th>
                <th className="table-header">{isThai ? 'หมดอายุ' : 'Valid until'}</th>
                <th className="table-header text-right">{isThai ? 'ยอดรวม' : 'Total'}</th>
                <th className="table-header text-center">{isThai ? 'สถานะ' : 'Status'}</th>
                <th className="table-header text-right">{isThai ? 'ส่ง / ไฟล์' : 'Send / File'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotations.map((q) => {
                const meta = STATUS_LABELS[q.status];
                const Icon = meta.icon;
                return (
                  <tr
                    key={q.id}
                    onClick={() => void openPreview(q)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="table-cell">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-primary-700 tabular-nums">{q.quotationNumber}</span>
                        {(q.revisionNo ?? 0) > 0 && (
                          <span className="rounded-full border border-primary-100 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-primary-700">
                            R{q.revisionNo}
                          </span>
                        )}
                      </div>
                      {(q.revisionCount ?? 1) > 1 && (
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {isThai ? `มีประวัติ ${q.revisionCount} ฉบับ` : `${q.revisionCount} revisions`}
                        </div>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="font-medium text-gray-900">{q.buyer?.nameTh ?? '-'}</div>
                      <div className="text-xs text-gray-500">{q.buyer?.taxId ?? ''}</div>
                    </td>
                    <td className="table-cell text-sm text-gray-700 tabular-nums">{q.quotationDate.slice(0, 10)}</td>
                    <td className="table-cell text-sm text-gray-500 tabular-nums">{q.validUntil ? q.validUntil.slice(0, 10) : '—'}</td>
                    <td className="table-cell text-right font-semibold tabular-nums">{formatCurrency(q.total)}</td>
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
                            void openPreview(q);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {isThai ? 'ดู' : 'View'}
                        </button>
                        {q.status !== 'draft' && q.status !== 'cancelled' && q.status !== 'converted' && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void shareQuotation(q);
                            }}
                            disabled={shareId === q.id}
                            className="inline-flex items-center gap-1 border border-primary-100 bg-white px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-60"
                          >
                            {shareId === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                            {isThai ? 'ลิงก์' : 'Link'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void downloadPdf(q);
                          }}
                          disabled={downloadId === q.id}
                          className="inline-flex items-center gap-1 border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {downloadId === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
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
        open={Boolean(previewQuotation)}
        title={isThai ? 'ใบเสนอราคา' : 'Quotation'}
        description={previewQuotation?.buyer?.nameTh ?? previewQuotation?.buyer?.nameEn ?? undefined}
        documentNumber={previewQuotation?.quotationNumber ?? ''}
        previewHtml={previewHtml}
        loading={Boolean(previewQuotation) && !previewHtml && !previewError}
        error={previewError}
        downloading={previewQuotation ? downloadId === previewQuotation.id : false}
        editHref={previewQuotation ? `/app/quotations/${previewQuotation.id}` : undefined}
        statusSteps={previewQuotation ? quotationPreviewSteps(previewQuotation, isThai) : undefined}
        artifacts={previewQuotation ? quotationPreviewArtifacts(previewQuotation, isThai) : undefined}
        onDownload={() => {
          if (previewQuotation) void downloadPdf(previewQuotation);
        }}
        onClose={closePreview}
      />
    </div>
  );
}
