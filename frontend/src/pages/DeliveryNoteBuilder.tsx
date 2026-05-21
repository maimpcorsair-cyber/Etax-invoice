import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Send, Plus, Trash2, CheckCircle,
  Loader2, AlertTriangle, ArrowRight, Clock, Receipt, Truck, Download, Printer,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import type { Customer, DeliveryNote, DeliveryNoteStatus } from '../types';

const STATUS_META: Record<DeliveryNoteStatus, { th: string; en: string; tone: string }> = {
  draft:     { th: 'แบบร่าง', en: 'Draft', tone: 'bg-slate-100 text-slate-700' },
  issued:    { th: 'ออกแล้ว', en: 'Issued', tone: 'bg-blue-100 text-blue-700' },
  delivered: { th: 'ส่งแล้ว', en: 'Delivered', tone: 'bg-emerald-100 text-emerald-700' },
  converted: { th: 'แปลงแล้ว', en: 'Converted', tone: 'bg-indigo-100 text-indigo-700' },
  cancelled: { th: 'ยกเลิก', en: 'Cancelled', tone: 'bg-slate-100 text-slate-500' },
};

interface ItemDraft {
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
  vehicleNo: string;
  trackingNo: string;
  notes: string;
  deliveryTerms: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function computeAmount(item: ItemDraft) {
  if (item.unitPrice === undefined || item.unitPrice === null) return null;
  return +(item.quantity * item.unitPrice).toFixed(2);
}

export default function DeliveryNoteBuilder() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { isThai, formatCurrency } = useLanguage();

  const [existing, setExisting] = useState<DeliveryNote | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<'open' | 'download' | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [form, setForm] = useState<FormState>({
    buyerId: '',
    deliveryDate: todayIso(),
    expectedDate: '',
    language: 'th',
    items: [blankItem],
    shippingAddress: '',
    contactName: '',
    contactPhone: '',
    vehicleNo: '',
    trackingNo: '',
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
            vehicleNo: note.vehicleNo ?? '',
            trackingNo: note.trackingNo ?? '',
            notes: note.notes ?? '',
            deliveryTerms: note.deliveryTerms ?? '',
          });
        }
        setLoading(false);
      }
    })();
  }, [token, id, isNew]);

  const editable = isNew || existing?.status === 'draft';
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

  async function save(action: 'draft' | 'issue') {
    if (!token) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        buyerId: form.buyerId,
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
        vehicleNo: form.vehicleNo || null,
        trackingNo: form.trackingNo || null,
        notes: form.notes || null,
        deliveryTerms: form.deliveryTerms || null,
      };

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
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/app/delivery-notes" className="text-gray-500 hover:text-gray-800"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? (isThai ? 'สร้างใบส่งของ' : 'New delivery note') : existing?.deliveryNoteNumber}
            </h1>
            {existing && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_META[existing.status].tone}`}>
                <Clock className="w-3 h-3" />
                {isThai ? STATUS_META[existing.status].th : STATUS_META[existing.status].en}
              </span>
            )}
          </div>
        </div>

        {editable ? (
          <div className="flex gap-2">
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
            <button onClick={() => openPdf('open')} disabled={pdfBusy !== null} className="btn-secondary">
              {pdfBusy === 'open' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {isThai ? 'เปิด/พิมพ์ PDF' : 'Open / print PDF'}
            </button>
            <button onClick={() => openPdf('download')} disabled={pdfBusy !== null} className="btn-secondary">
              {pdfBusy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isThai ? 'ดาวน์โหลด' : 'Download'}
            </button>
            {existing.status === 'issued' && (
              <button onClick={() => changeStatus('delivered')} disabled={acting} className="btn-secondary">
                <CheckCircle className="w-4 h-4 text-emerald-600" /> {isThai ? 'ส่งของครบแล้ว' : 'Mark delivered'}
              </button>
            )}
            {(existing.status === 'issued' || existing.status === 'delivered') && (
              <button onClick={convertToInvoice} disabled={acting} className="btn-primary">
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
          </div>
        )}
      </div>

      {msg && (
        <div className={`flex items-start gap-2 text-sm p-3 rounded-lg ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="card grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-3">
          <label className="label">{isThai ? 'ลูกค้า' : 'Customer'}</label>
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
        <div>
          <label className="label">Tracking</label>
          <input value={form.trackingNo} onChange={(e) => setForm({ ...form, trackingNo: e.target.value })} className="input-field" disabled={!editable} />
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
                    <input type="number" min="0" step="0.01" value={item.deliveredQty} onChange={(e) => setItem(idx, { deliveredQty: Number(e.target.value) })} className="input-field text-sm text-right" disabled={!editable} />
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
                      <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-gray-200 mt-4 pt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">{isThai ? 'จำนวนสั่งรวม' : 'Ordered qty'}</span><span>{totals.qty}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">{isThai ? 'จำนวนส่งรวม' : 'Delivered qty'}</span><span>{totals.deliveredQty}</span></div>
          <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
            <span>{isThai ? 'มูลค่ารวมโดยประมาณ' : 'Estimated amount'}</span>
            <span className="text-indigo-700">{formatCurrency(totals.amount)}</span>
          </div>
        </div>
      </div>

      <div className="card grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">{isThai ? 'ทะเบียนรถ / ผู้ขนส่ง' : 'Vehicle / carrier'}</label>
          <input value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} className="input-field" disabled={!editable} />
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
    </div>
  );
}
