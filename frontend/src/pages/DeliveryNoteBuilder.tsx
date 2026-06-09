import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Send, Plus, Trash2, CheckCircle,
  Loader2, AlertTriangle, ArrowRight, Clock, Receipt, Truck, Download, Printer,
  Copy, ExternalLink, Eye, Share2, X,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import DeleteButton from '../components/ui/DeleteButton';
import CustomerFormModal from '../components/customer/CustomerFormModal';
import type { Customer, DeliveryNote, DeliveryNoteStatus } from '../types';

const STATUS_META: Record<DeliveryNoteStatus, { th: string; en: string; tone: string }> = {
  draft:     { th: 'แบบร่าง', en: 'Draft', tone: 'bg-slate-100 text-slate-700' },
  issued:    { th: 'ออกแล้ว', en: 'Issued', tone: 'bg-blue-100 text-blue-700' },
  delivered: { th: 'ส่งแล้ว', en: 'Delivered', tone: 'bg-emerald-100 text-emerald-700' },
  converted: { th: 'แปลงแล้ว', en: 'Converted', tone: 'bg-primary-100 text-primary-700' },
  cancelled: { th: 'ยกเลิก', en: 'Cancelled', tone: 'bg-slate-100 text-slate-500' },
};

interface ItemDraft {
  id?: string;
  productId?: string | null;
  nameTh: string;
  nameEn?: string | null;
  quantity: number;
  deliveredQty: number;
  unit: string;
  unitPrice?: number | null;
  vatType: 'vat7' | 'vatExempt' | 'vatZero';
}

const blankItem: ItemDraft = {
  nameTh: '',
  quantity: 1,
  deliveredQty: 1,
  unit: 'รายการ',
  unitPrice: null,
  vatType: 'vat7',
};

interface FormState {
  buyerId: string;
  deliveryDate: string;
  expectedDate: string;
  language: 'th' | 'en' | 'both';
  items: ItemDraft[];
  shippingAddress: string;
  contactName: string;
  contactPhone: string;
  carrierName: string;
  vehicleNo: string;
  trackingNo: string;
  trackingUrl: string;
  notes: string;
  deliveryTerms: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function computeAmount(item: ItemDraft) {
  if (item.unitPrice === undefined || item.unitPrice === null) return null;
  return +(item.quantity * item.unitPrice).toFixed(2);
}

type DeliveryProgress = 'not-started' | 'partial' | 'complete';

function deliveryProgress(items: ItemDraft[]): DeliveryProgress {
  const delivered = items.reduce((sum, item) => sum + Number(item.deliveredQty || 0), 0);
  if (delivered <= 0) return 'not-started';
  if (items.every((item) => Number(item.deliveredQty) === Number(item.quantity))) return 'complete';
  return 'partial';
}

export default function DeliveryNoteBuilder() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { isThai, formatCurrency } = useLanguage();

  const [existing, setExisting] = useState<DeliveryNote | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<'open' | 'download' | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [dnPreviewHtml, setDnPreviewHtml] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [form, setForm] = useState<FormState>({
    buyerId: '',
    deliveryDate: todayIso(),
    expectedDate: '',
    language: 'th',
    items: [blankItem],
    shippingAddress: '',
    contactName: '',
    contactPhone: '',
    carrierName: '',
    vehicleNo: '',
    trackingNo: '',
    trackingUrl: '',
    notes: '',
    deliveryTerms: '',
  });

  useEffect(() => {
    if (!token) return;
    (async () => {
      const custRes = await fetch('/api/customers?limit=200', { headers: { Authorization: `Bearer ${token}` } });
      const custJson = await custRes.json();
      setCustomers(custJson.data ?? []);
      if (!isNew && id) {
        const res = await fetch(`/api/delivery-notes/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const json = await res.json();
          const note: DeliveryNote = json.data;
          setExisting(note);
          setForm({
            buyerId: note.buyerId,
            deliveryDate: note.deliveryDate.slice(0, 10),
            expectedDate: note.expectedDate ? note.expectedDate.slice(0, 10) : '',
            language: note.language,
            items: note.items.map((it) => ({
              id: it.id,
              productId: it.productId ?? null,
              nameTh: it.nameTh,
              nameEn: it.nameEn ?? null,
              quantity: it.quantity,
              deliveredQty: it.deliveredQty,
              unit: it.unit,
              unitPrice: it.unitPrice ?? null,
              vatType: it.vatType,
            })),
            shippingAddress: note.shippingAddress ?? '',
            contactName: note.contactName ?? '',
            contactPhone: note.contactPhone ?? '',
            carrierName: note.carrierName ?? '',
            vehicleNo: note.vehicleNo ?? '',
            trackingNo: note.trackingNo ?? '',
            trackingUrl: note.trackingUrl ?? '',
            notes: note.notes ?? '',
            deliveryTerms: note.deliveryTerms ?? '',
          });
        }
        setLoading(false);
      }
    })();
  }, [token, id, isNew]);

  const editable = isNew || existing?.status === 'draft';
  const canEditProgress = editable || existing?.status === 'issued' || existing?.status === 'delivered';
  const progress = useMemo(() => deliveryProgress(form.items), [form.items]);
  const displayedStatus = existing?.status === 'issued' && progress === 'partial'
    ? { th: 'ส่งบางส่วน', en: 'Partially delivered', tone: 'bg-amber-100 text-amber-800' }
    : existing ? STATUS_META[existing.status] : null;
  const totals = useMemo(() => {
    const qty = +form.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0).toFixed(2);
    const deliveredQty = +form.items.reduce((sum, item) => sum + Number(item.deliveredQty || 0), 0).toFixed(2);
    const amount = +form.items.reduce((sum, item) => sum + (computeAmount(item) ?? 0), 0).toFixed(2);
    return { qty, deliveredQty, amount };
  }, [form.items]);

  function setItem(idx: number, patch: Partial<ItemDraft>) {
    setForm((prev) => ({ ...prev, items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, { ...blankItem }] }));
  }
  function removeItem(idx: number) {
    setForm((prev) => ({ ...prev, items: prev.items.length > 1 ? prev.items.filter((_, i) => i !== idx) : prev.items }));
  }

  const surfaceError = useCallback((errJson: { error?: string; details?: Array<{ path?: (string|number)[]; message?: string }> }) => {
    if (errJson.details && errJson.details.length > 0) {
      return errJson.details.map((d) => `${(d.path ?? []).join('.')}: ${d.message ?? ''}`).join(' · ');
    }
    return errJson.error ?? 'Save failed';
  }, []);

  // Live preview: re-render the delivery-note HTML from current form data
  // (debounced) whenever the form changes, like the invoice/quotation builder.
  useEffect(() => {
    if (!token) return;
    if (!form.items.some((it) => it.nameTh.trim())) { setDnPreviewHtml(null); return; }
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/delivery-notes/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(buildBody({ includeBuyer: true })),
        });
        if (res.ok) setDnPreviewHtml(await res.text());
      } catch { /* preview is best-effort, never blocks editing */ }
    }, 600);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, form]);

  // Preview resolves the selected buyer while save adds the required buyerId.
  function buildBody(options: { includeBuyer?: boolean } = {}) {
    return {
        ...(options.includeBuyer && form.buyerId ? { buyerId: form.buyerId } : {}),
        deliveryDate: form.deliveryDate,
        expectedDate: form.expectedDate || null,
        language: form.language,
        items: form.items.map((it) => ({
          productId: it.productId ?? null,
          nameTh: it.nameTh,
          nameEn: it.nameEn ?? null,
          quantity: Number(it.quantity),
          deliveredQty: Number(it.deliveredQty),
          unit: it.unit,
          unitPrice: it.unitPrice === null || it.unitPrice === undefined ? null : Number(it.unitPrice),
          vatType: it.vatType,
        })),
        shippingAddress: form.shippingAddress || null,
        contactName: form.contactName || null,
        contactPhone: form.contactPhone || null,
        carrierName: form.carrierName || null,
        vehicleNo: form.vehicleNo || null,
        trackingNo: form.trackingNo || null,
        trackingUrl: form.trackingUrl || null,
        notes: form.notes || null,
        deliveryTerms: form.deliveryTerms || null,
    };
  }

  async function save(action: 'draft' | 'issue') {
    if (!token) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = { buyerId: form.buyerId, ...buildBody() };

      const url = isNew ? '/api/delivery-notes' : `/api/delivery-notes/${id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(surfaceError(json));
      const savedId = (json.data as { id: string }).id;

      if (action === 'issue') {
        const issueRes = await fetch(`/api/delivery-notes/${savedId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'issued' }),
        });
        if (!issueRes.ok) {
          const issueJson = await issueRes.json();
          throw new Error(surfaceError(issueJson));
        }
      }

      setMsg({ type: 'ok', text: isThai ? 'บันทึกแล้ว' : 'Saved' });
      navigate(`/app/delivery-notes/${savedId}`);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(newStatus: DeliveryNoteStatus, reason?: string) {
    if (!token || !id) return;
    setActing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/delivery-notes/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(surfaceError(json));
      setExisting(json.data);
      setMsg({ type: 'ok', text: isThai ? 'อัปเดตสถานะแล้ว' : 'Status updated' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setActing(false);
    }
  }

  async function saveDeliveryProgress() {
    if (!token || !id) return;
    setActing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/delivery-notes/${id}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          carrierName: form.carrierName || null,
          vehicleNo: form.vehicleNo || null,
          trackingNo: form.trackingNo || null,
          trackingUrl: form.trackingUrl || null,
          items: form.items.flatMap((item) => item.id ? [{ id: item.id, deliveredQty: Number(item.deliveredQty) }] : []),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(surfaceError(json));
      setExisting(json.data);
      setMsg({ type: 'ok', text: isThai ? 'บันทึกข้อมูลจัดส่งแล้ว' : 'Delivery progress saved' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setActing(false);
    }
  }

  function trackingMessage() {
    return [
      isThai ? `แจ้งสถานะจัดส่ง ${existing?.deliveryNoteNumber ?? ''}` : `Delivery update ${existing?.deliveryNoteNumber ?? ''}`,
      form.carrierName ? `${isThai ? 'ผู้ให้บริการขนส่ง' : 'Carrier'}: ${form.carrierName}` : '',
      form.trackingNo ? `${isThai ? 'เลขติดตาม / เลขใบงาน' : 'Tracking no.'}: ${form.trackingNo}` : '',
      form.trackingUrl,
    ].filter(Boolean).join('\n');
  }

  async function copyTracking() {
    await navigator.clipboard.writeText(trackingMessage());
    setMsg({ type: 'ok', text: isThai ? 'คัดลอกข้อความติดตามแล้ว' : 'Tracking message copied' });
  }

  function shareTrackingViaLine() {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(trackingMessage())}`, '_blank', 'noopener,noreferrer');
  }

  async function convertToInvoice() {
    if (!token || !id) return;
    setActing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/delivery-notes/${id}/convert-to-invoice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(surfaceError(json));
      navigate(`/app/invoices/${json.data.invoice.id}/edit`);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setActing(false);
    }
  }

  async function openPdf(mode: 'open' | 'download') {
    if (!token || !id || !existing) return;
    setPdfBusy(mode);
    setMsg(null);
    try {
      const res = await fetch(`/api/delivery-notes/${id}/preview?format=pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'PDF failed' }));
        throw new Error(surfaceError(json));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (mode === 'open') {
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${existing.deliveryNoteNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setPdfBusy(null);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,460px)] lg:items-start">
    <div className="space-y-4 min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/app/delivery-notes" className="text-gray-500 hover:text-gray-800"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? (isThai ? 'สร้างใบส่งของ' : 'New delivery note') : existing?.deliveryNoteNumber}
            </h1>
            {existing && displayedStatus && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${displayedStatus.tone}`}>
                <Clock className="w-3 h-3" />
                {isThai ? displayedStatus.th : displayedStatus.en}
              </span>
            )}
          </div>
        </div>

        {editable ? (
          <div className="flex gap-2 flex-wrap">
            {dnPreviewHtml && (
              <button onClick={() => setPreviewOpen(true)} className="btn-secondary lg:hidden">
                <Eye className="w-4 h-4" />
                {isThai ? 'ดูตัวอย่าง' : 'Preview'}
              </button>
            )}
            <button onClick={() => save('draft')} disabled={saving} className="btn-secondary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isThai ? 'บันทึกแบบร่าง' : 'Save draft'}
            </button>
            <button onClick={() => save('issue')} disabled={saving} className="btn-primary">
              <Send className="w-4 h-4" />
              {isThai ? 'บันทึก + ออกเอกสาร' : 'Save + issue'}
            </button>
          </div>
        ) : existing && (
          <div className="flex gap-2 flex-wrap">
            {canEditProgress && (
              <button onClick={saveDeliveryProgress} disabled={acting} className="btn-secondary">
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isThai ? 'บันทึกการจัดส่ง' : 'Save delivery'}
              </button>
            )}
            <button onClick={() => openPdf('open')} disabled={pdfBusy !== null} className="btn-secondary">
              {pdfBusy === 'open' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {isThai ? 'เปิด/พิมพ์ PDF' : 'Open / print PDF'}
            </button>
            <button onClick={() => openPdf('download')} disabled={pdfBusy !== null} className="btn-secondary">
              {pdfBusy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isThai ? 'ดาวน์โหลด' : 'Download'}
            </button>
            {existing.status === 'issued' && (
              <button
                onClick={() => changeStatus('delivered')}
                disabled={acting || progress !== 'complete'}
                title={progress !== 'complete' ? (isThai ? 'กรอกจำนวนส่งให้ครบก่อน' : 'Complete delivered quantities first') : undefined}
                className="btn-secondary"
              >
                <CheckCircle className="w-4 h-4 text-emerald-600" /> {isThai ? 'ส่งของครบแล้ว' : 'Mark delivered'}
              </button>
            )}
            {(existing.status === 'issued' || existing.status === 'delivered') && (
              <button
                onClick={convertToInvoice}
                disabled={acting || progress !== 'complete'}
                title={progress !== 'complete' ? (isThai ? 'ส่งของให้ครบก่อนออกใบกำกับภาษี' : 'Complete delivery before converting') : undefined}
                className="btn-primary"
              >
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {isThai ? 'ออกใบกำกับภาษี' : 'Convert to tax invoice'}
              </button>
            )}
            {existing.status === 'converted' && existing.invoiceId && (
              <Link to={`/app/invoices/${existing.invoiceId}/edit`} className="btn-primary">
                <Receipt className="w-4 h-4" /> {isThai ? 'ดูใบกำกับภาษี' : 'View tax invoice'}
              </Link>
            )}
            {existing.status !== 'cancelled' && existing.status !== 'converted' && (
              <button onClick={() => changeStatus('cancelled')} disabled={acting} className="btn-secondary text-rose-600">
                <Trash2 className="w-4 h-4" /> {isThai ? 'ยกเลิก' : 'Cancel'}
              </button>
            )}
            {(form.trackingNo || form.trackingUrl) && (
              <>
                <button onClick={copyTracking} className="btn-secondary" title={isThai ? 'คัดลอกข้อความติดตาม' : 'Copy tracking message'}>
                  <Copy className="w-4 h-4" />
                </button>
                <button onClick={shareTrackingViaLine} className="btn-secondary">
                  <Share2 className="w-4 h-4" />
                  LINE
                </button>
                {form.trackingUrl && (
                  <a href={form.trackingUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary" title={isThai ? 'เปิดลิงก์ติดตาม' : 'Open tracking link'}>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {msg && (
        <div className={`flex items-start gap-2 text-sm p-3 rounded-lg ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}
      {existing?.status === 'issued' && progress === 'partial' && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Truck className="h-4 w-4" />
          </span>
          <span>{isThai ? 'กำลังส่งบางส่วน บันทึกจำนวนส่งจริงให้ครบก่อนออกใบกำกับภาษี' : 'Partially delivered. Save the completed quantities before converting to a tax invoice.'}</span>
        </div>
      )}

      <div className="card grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <label className="label">{isThai ? 'ลูกค้า' : 'Customer'}</label>
            {editable && (
              <button
                type="button"
                onClick={() => setShowAddCustomer(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800"
              >
                <Plus className="h-3.5 w-3.5" />
                {isThai ? 'เพิ่มลูกค้าใหม่' : 'Add new customer'}
              </button>
            )}
          </div>
          <select value={form.buyerId} onChange={(e) => setForm({ ...form, buyerId: e.target.value })} className="input-field" disabled={!editable}>
            <option value="">{isThai ? '— เลือกลูกค้า —' : '— Select customer —'}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.nameTh} ({c.taxId})</option>)}
          </select>
        </div>
        <div>
          <label className="label">{isThai ? 'วันที่ส่งของ' : 'Delivery date'}</label>
          <input type="date" value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} className="input-field" disabled={!editable} />
        </div>
        <div>
          <label className="label">{isThai ? 'กำหนดส่ง' : 'Expected date'}</label>
          <input type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} className="input-field" disabled={!editable} />
        </div>
        <div>
          <label className="label">{isThai ? 'ภาษาเอกสาร' : 'Document language'}</label>
          <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as FormState['language'] })} className="input-field" disabled={!editable}>
            <option value="th">ไทย</option>
            <option value="en">English</option>
            <option value="both">ไทย + English</option>
          </select>
        </div>
        <div className="sm:col-span-3">
          <label className="label">{isThai ? 'ที่อยู่จัดส่ง' : 'Shipping address'}</label>
          <textarea value={form.shippingAddress} onChange={(e) => setForm({ ...form, shippingAddress: e.target.value })} className="input-field" rows={2} disabled={!editable} />
        </div>
        <div>
          <label className="label">{isThai ? 'ผู้รับ' : 'Contact'}</label>
          <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="input-field" disabled={!editable} />
        </div>
        <div>
          <label className="label">{isThai ? 'โทรศัพท์' : 'Phone'}</label>
          <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className="input-field" disabled={!editable} />
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{isThai ? 'รายการส่งของ' : 'Delivery items'}</h3>
          {editable && (
            <button onClick={addItem} className="btn-secondary text-xs">
              <Plus className="w-3 h-3" /> {isThai ? 'เพิ่มรายการ' : 'Add item'}
            </button>
          )}
        </div>
        <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left pb-2">{isThai ? 'ชื่อ' : 'Name'}</th>
              <th className="text-right pb-2 w-20">{isThai ? 'สั่ง' : 'Ordered'}</th>
              <th className="text-right pb-2 w-20">{isThai ? 'ส่ง' : 'Delivered'}</th>
              <th className="text-left pb-2 w-24">{isThai ? 'หน่วย' : 'Unit'}</th>
              <th className="text-right pb-2 w-28">{isThai ? 'ราคา/หน่วย' : 'Unit price'}</th>
              <th className="text-right pb-2 w-28">{isThai ? 'มูลค่า' : 'Amount'}</th>
              {editable && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {form.items.map((item, idx) => {
              const amount = computeAmount(item);
              return (
                <tr key={idx} className="border-t border-gray-100">
                  <td className="py-2 pr-2">
                    <input value={item.nameTh} onChange={(e) => setItem(idx, { nameTh: e.target.value })} placeholder={isThai ? 'ชื่อรายการ' : 'Item name'} className="input-field text-sm" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => setItem(idx, { quantity: Number(e.target.value), deliveredQty: Number(e.target.value) })} className="input-field text-sm text-right" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" max={item.quantity} step="0.01" value={item.deliveredQty} onChange={(e) => setItem(idx, { deliveredQty: Number(e.target.value) })} className="input-field text-sm text-right" disabled={!canEditProgress} />
                  </td>
                  <td className="py-2 pr-2">
                    <input value={item.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} className="input-field text-sm" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" step="0.01" value={item.unitPrice ?? ''} onChange={(e) => setItem(idx, { unitPrice: e.target.value === '' ? null : Number(e.target.value) })} className="input-field text-sm text-right" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2 text-right font-medium">{amount === null ? '—' : formatCurrency(amount)}</td>
                  {editable && (
                    <td className="py-2 text-center">
                      <DeleteButton onClick={() => removeItem(idx)} label={isThai ? 'ลบรายการ' : 'Remove item'} size="sm" className="mx-auto" />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <div className="space-y-3 md:hidden">
          {form.items.map((item, idx) => {
            const amount = computeAmount(item);
            return (
              <div key={idx} className="border border-slate-200 p-3">
                <div className="mb-3 flex items-start gap-2">
                  <span className="mt-2 text-xs font-semibold text-slate-400">{idx + 1}</span>
                  <input value={item.nameTh} onChange={(e) => setItem(idx, { nameTh: e.target.value })} placeholder={isThai ? 'ชื่อรายการ' : 'Item name'} className="input-field text-sm" disabled={!editable} />
                  {editable && <DeleteButton onClick={() => removeItem(idx)} label={isThai ? 'ลบรายการ' : 'Remove item'} size="sm" />}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">{isThai ? 'จำนวนสั่ง' : 'Ordered'}</label>
                    <input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => setItem(idx, { quantity: Number(e.target.value), deliveredQty: Number(e.target.value) })} className="input-field text-right" disabled={!editable} />
                  </div>
                  <div>
                    <label className="label">{isThai ? 'จำนวนส่งจริง' : 'Delivered'}</label>
                    <input type="number" min="0" max={item.quantity} step="0.01" value={item.deliveredQty} onChange={(e) => setItem(idx, { deliveredQty: Number(e.target.value) })} className="input-field text-right" disabled={!canEditProgress} />
                  </div>
                  <div>
                    <label className="label">{isThai ? 'หน่วย' : 'Unit'}</label>
                    <input value={item.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} className="input-field" disabled={!editable} />
                  </div>
                  <div>
                    <label className="label">{isThai ? 'ราคา/หน่วย' : 'Unit price'}</label>
                    <input type="number" min="0" step="0.01" value={item.unitPrice ?? ''} onChange={(e) => setItem(idx, { unitPrice: e.target.value === '' ? null : Number(e.target.value) })} className="input-field text-right" disabled={!editable} />
                  </div>
                </div>
                <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-sm">
                  <span className="text-slate-500">{isThai ? 'มูลค่า' : 'Amount'}</span>
                  <span className="font-semibold">{amount === null ? '—' : formatCurrency(amount)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-gray-200 mt-4 pt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">{isThai ? 'จำนวนสั่งรวม' : 'Ordered qty'}</span><span>{totals.qty}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">{isThai ? 'จำนวนส่งรวม' : 'Delivered qty'}</span><span>{totals.deliveredQty}</span></div>
          <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
            <span>{isThai ? 'มูลค่ารวมโดยประมาณ' : 'Estimated amount'}</span>
            <span className="text-primary-700">{formatCurrency(totals.amount)}</span>
          </div>
        </div>
      </div>

      <div className="card grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <h3 className="font-semibold text-gray-900">{isThai ? 'ข้อมูลติดตามการจัดส่ง' : 'Delivery tracking'}</h3>
          <p className="mt-1 text-xs text-gray-500">
            {isThai ? 'เพิ่มภายหลังได้เมื่อบริษัทขนส่งแจ้งเลขติดตามหรือเลขใบงาน' : 'You can add these later when the carrier provides a tracking or job number.'}
          </p>
        </div>
        <div>
          <label className="label">{isThai ? 'ผู้ให้บริการขนส่ง' : 'Carrier'}</label>
          <input value={form.carrierName} onChange={(e) => setForm({ ...form, carrierName: e.target.value })} placeholder={isThai ? 'เช่น Flash, Kerry, รถบริษัท' : 'e.g. Flash, Kerry, company vehicle'} className="input-field" disabled={!canEditProgress} />
        </div>
        <div>
          <label className="label">{isThai ? 'ทะเบียนรถ' : 'Vehicle registration'}</label>
          <input value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} className="input-field" disabled={!canEditProgress} />
        </div>
        <div>
          <label className="label">{isThai ? 'เลขติดตาม / เลขใบงานขนส่ง' : 'Tracking / delivery job no.'}</label>
          <input value={form.trackingNo} onChange={(e) => setForm({ ...form, trackingNo: e.target.value })} placeholder={isThai ? 'เช่น TH123456789 หรือ JOB-001' : 'e.g. TH123456789 or JOB-001'} className="input-field" disabled={!canEditProgress} />
        </div>
        <div>
          <label className="label">{isThai ? 'ลิงก์ติดตาม' : 'Tracking link'}</label>
          <input type="url" value={form.trackingUrl} onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })} placeholder="https://..." className="input-field" disabled={!canEditProgress} />
        </div>
        <div>
          <label className="label">{isThai ? 'เงื่อนไขการส่งของ' : 'Delivery terms'}</label>
          <textarea value={form.deliveryTerms} onChange={(e) => setForm({ ...form, deliveryTerms: e.target.value })} className="input-field" rows={2} disabled={!editable} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{isThai ? 'หมายเหตุ' : 'Notes'}</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} disabled={!editable} />
        </div>
      </div>

      <div className="text-xs text-gray-400 flex items-center gap-2 px-1">
        <Truck className="w-3 h-3" />
        {isThai
          ? 'ใบส่งของเป็นเอกสารปฏิบัติการ ไม่ใช่เอกสารภาษี — ออกใบกำกับภาษีเมื่อปิดยอดขาย'
          : 'Delivery notes are operational documents, not tax documents — convert to a tax invoice when the sale is ready.'}
      </div>
    </div>{/* left column */}

      <aside className="hidden lg:block lg:sticky lg:top-4 self-start">
        <div className="card p-0 overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-slate-500 border-b border-slate-100">
            {isThai ? 'ตัวอย่างเอกสาร (สด)' : 'Live preview'}
          </div>
          {dnPreviewHtml ? (
            <iframe
              srcDoc={dnPreviewHtml}
              title={isThai ? 'ตัวอย่างใบส่งของ' : 'Delivery note preview'}
              sandbox="allow-same-origin allow-scripts"
              className="block w-full border-0 bg-white"
              style={{ height: 900 }}
            />
          ) : (
            <div className="p-6 text-sm text-slate-400">
              {isThai ? 'กรอกรายการอย่างน้อย 1 รายการเพื่อดูตัวอย่าง' : 'Add at least one item to see the preview.'}
            </div>
          )}
        </div>
      </aside>
    </div>{/* grid */}
    {previewOpen && dnPreviewHtml && (
      <div className="fixed inset-0 z-50 bg-slate-950/60 p-3 lg:hidden">
        <div className="mx-auto flex h-full max-w-2xl flex-col bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="font-semibold text-slate-900">{isThai ? 'ตัวอย่างใบส่งของ' : 'Delivery note preview'}</h2>
              <p className="text-xs text-slate-500">{isThai ? 'เลื่อนดูเอกสาร A4 ก่อนบันทึก' : 'Scroll through the A4 document before saving.'}</p>
            </div>
            <button onClick={() => setPreviewOpen(false)} className="p-2 text-slate-500 hover:text-slate-900" title={isThai ? 'ปิด' : 'Close'}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <iframe
            srcDoc={dnPreviewHtml}
            title={isThai ? 'ตัวอย่างใบส่งของบนมือถือ' : 'Mobile delivery note preview'}
            sandbox="allow-same-origin allow-scripts"
            className="block min-h-0 flex-1 w-full border-0 bg-white"
          />
        </div>
      </div>
    )}
    <CustomerFormModal
      open={showAddCustomer}
      onClose={() => setShowAddCustomer(false)}
      onSaved={(customer) => {
        setCustomers((prev) => [customer, ...prev]);
        setForm((prev) => ({ ...prev, buyerId: customer.id }));
      }}
      token={token}
      isThai={isThai}
      lockPartyRole="customer"
    />
    </div>
  );
}
