import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Send, Plus, Trash2, CheckCircle, XCircle,
  Loader2, AlertTriangle, FileText, ArrowRight, Clock, Receipt,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import type { Customer, Quotation, QuotationStatus } from '../types';

// ใบเสนอราคา — Build (new/edit draft) + view (non-draft) + status actions
// in one page. Routed as:
//   /app/quotations/new       → new draft form
//   /app/quotations/:id       → view (or edit if status = 'draft')

const STATUS_META: Record<QuotationStatus, { th: string; en: string; tone: string }> = {
  draft:     { th: 'แบบร่าง',  en: 'Draft',     tone: 'bg-slate-100 text-slate-700' },
  sent:      { th: 'ส่งแล้ว',  en: 'Sent',      tone: 'bg-blue-100 text-blue-700' },
  accepted:  { th: 'ยอมรับ',   en: 'Accepted',  tone: 'bg-emerald-100 text-emerald-700' },
  converted: { th: 'แปลงแล้ว', en: 'Converted', tone: 'bg-indigo-100 text-indigo-700' },
  rejected:  { th: 'ปฏิเสธ',   en: 'Rejected',  tone: 'bg-rose-100 text-rose-700' },
  expired:   { th: 'หมดอายุ',  en: 'Expired',   tone: 'bg-amber-100 text-amber-700' },
  cancelled: { th: 'ยกเลิก',   en: 'Cancelled', tone: 'bg-slate-100 text-slate-500' },
};

interface ItemDraft {
  productId?: string | null;
  nameTh: string;
  nameEn?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountAmount: number;
  vatType: 'vat7' | 'vatExempt' | 'vatZero';
}

const blankItem: ItemDraft = {
  nameTh: '',
  quantity: 1,
  unit: 'รายการ',
  unitPrice: 0,
  discountAmount: 0,
  vatType: 'vat7',
};

interface FormState {
  buyerId: string;
  quotationDate: string; // YYYY-MM-DD
  validUntil: string;    // YYYY-MM-DD or ''
  language: 'th' | 'en' | 'both';
  items: ItemDraft[];
  discountAmount: number;
  notes: string;
  paymentTerms: string;
  deliveryTerms: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDaysIso = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

function computeLine(item: ItemDraft) {
  const gross = item.quantity * item.unitPrice;
  const amount = Math.max(0, gross - item.discountAmount);
  const vatRate = item.vatType === 'vat7' ? 0.07 : 0;
  const vatAmount = +(amount * vatRate).toFixed(2);
  const totalAmount = +(amount + vatAmount).toFixed(2);
  return { amount: +amount.toFixed(2), vatAmount, totalAmount };
}

export default function QuotationBuilder() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { isThai, formatCurrency } = useLanguage();

  const [existing, setExisting] = useState<Quotation | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [form, setForm] = useState<FormState>({
    buyerId: '',
    quotationDate: todayIso(),
    validUntil: plusDaysIso(30),
    language: 'th',
    items: [blankItem],
    discountAmount: 0,
    notes: '',
    paymentTerms: 'ชำระภายใน 30 วันหลังได้รับใบกำกับภาษี',
    deliveryTerms: '',
  });

  // Load customers + (if editing) the existing quotation
  useEffect(() => {
    if (!token) return;
    (async () => {
      const custRes = await fetch('/api/customers?limit=200', { headers: { Authorization: `Bearer ${token}` } });
      const custJson = await custRes.json();
      setCustomers(custJson.data ?? []);
      if (!isNew && id) {
        const res = await fetch(`/api/quotations/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const json = await res.json();
          const q: Quotation = json.data;
          setExisting(q);
          setForm({
            buyerId: q.buyerId,
            quotationDate: q.quotationDate.slice(0, 10),
            validUntil: q.validUntil ? q.validUntil.slice(0, 10) : '',
            language: q.language,
            items: q.items.map((it) => ({
              productId: it.productId ?? null,
              nameTh: it.nameTh,
              nameEn: it.nameEn ?? null,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: it.unitPrice,
              discountAmount: it.discountAmount,
              vatType: it.vatType,
            })),
            discountAmount: q.discountAmount,
            notes: q.notes ?? '',
            paymentTerms: q.paymentTerms ?? '',
            deliveryTerms: q.deliveryTerms ?? '',
          });
        }
        setLoading(false);
      }
    })();
  }, [token, id, isNew]);

  const editable = isNew || existing?.status === 'draft';
  const totals = useMemo(() => {
    const lines = form.items.map(computeLine);
    const subtotal = +lines.reduce((s, l) => s + l.amount, 0).toFixed(2);
    const vatAmount = +lines.reduce((s, l) => s + l.vatAmount, 0).toFixed(2);
    const total = +(subtotal + vatAmount - form.discountAmount).toFixed(2);
    return { lines, subtotal, vatAmount, total };
  }, [form.items, form.discountAmount]);

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
      const fields = errJson.details.map((d) => `${(d.path ?? []).join('.')}: ${d.message ?? ''}`).join(' · ');
      return fields;
    }
    return errJson.error ?? 'Save failed';
  }, []);

  async function save(action: 'draft' | 'send') {
    if (!token) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        buyerId: form.buyerId,
        quotationDate: form.quotationDate,
        validUntil: form.validUntil || null,
        language: form.language,
        items: form.items.map((it) => ({
          productId: it.productId ?? null,
          nameTh: it.nameTh,
          nameEn: it.nameEn ?? null,
          quantity: Number(it.quantity),
          unit: it.unit,
          unitPrice: Number(it.unitPrice),
          discountAmount: Number(it.discountAmount),
          vatType: it.vatType,
        })),
        discountAmount: Number(form.discountAmount),
        notes: form.notes || null,
        paymentTerms: form.paymentTerms || null,
        deliveryTerms: form.deliveryTerms || null,
      };

      const url = isNew ? '/api/quotations' : `/api/quotations/${id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(surfaceError(json));
      const savedId = (json.data as { id: string }).id;

      if (action === 'send') {
        const sendRes = await fetch(`/api/quotations/${savedId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'sent' }),
        });
        if (!sendRes.ok) {
          const sendJson = await sendRes.json();
          throw new Error(surfaceError(sendJson));
        }
      }

      setMsg({ type: 'ok', text: isThai ? 'บันทึกแล้ว' : 'Saved' });
      navigate(`/app/quotations/${savedId}`);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(newStatus: QuotationStatus, reason?: string) {
    if (!token || !id) return;
    setActing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/quotations/${id}/status`, {
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
      const res = await fetch(`/api/quotations/${id}/convert-to-invoice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(surfaceError(json));
      const invoiceId = json.data.invoice.id;
      setMsg({ type: 'ok', text: isThai ? 'แปลงเป็นใบกำกับภาษีแล้ว' : 'Converted to invoice' });
      navigate(`/app/invoices/${invoiceId}`);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/app/quotations" className="text-gray-500 hover:text-gray-800"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? (isThai ? 'สร้างใบเสนอราคา' : 'New quotation') : existing?.quotationNumber}
            </h1>
            {existing && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_META[existing.status].tone}`}>
                <Clock className="w-3 h-3" />
                {isThai ? STATUS_META[existing.status].th : STATUS_META[existing.status].en}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {editable ? (
          <div className="flex gap-2">
            <button onClick={() => save('draft')} disabled={saving} className="btn-secondary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isThai ? 'บันทึกแบบร่าง' : 'Save draft'}
            </button>
            <button onClick={() => save('send')} disabled={saving} className="btn-primary">
              <Send className="w-4 h-4" />
              {isThai ? 'บันทึก + ส่ง' : 'Save + send'}
            </button>
          </div>
        ) : existing && (
          <div className="flex gap-2 flex-wrap">
            {existing.status === 'sent' && (
              <>
                <button onClick={() => changeStatus('accepted')} disabled={acting} className="btn-secondary">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> {isThai ? 'ลูกค้ายอมรับ' : 'Mark accepted'}
                </button>
                <button onClick={() => changeStatus('rejected')} disabled={acting} className="btn-secondary">
                  <XCircle className="w-4 h-4 text-rose-600" /> {isThai ? 'ปฏิเสธ' : 'Mark rejected'}
                </button>
              </>
            )}
            {existing.status === 'accepted' && (
              <button onClick={convertToInvoice} disabled={acting} className="btn-primary">
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {isThai ? 'ออกใบกำกับภาษี' : 'Convert to tax invoice'}
              </button>
            )}
            {existing.status === 'converted' && existing.convertedToInvoiceId && (
              <Link to={`/app/invoices/${existing.convertedToInvoiceId}`} className="btn-primary">
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

      {/* Customer + dates */}
      <div className="card grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-3">
          <label className="label">{isThai ? 'ลูกค้า' : 'Customer'}</label>
          <select
            value={form.buyerId}
            onChange={(e) => setForm({ ...form, buyerId: e.target.value })}
            className="input-field"
            disabled={!editable}
          >
            <option value="">{isThai ? '— เลือกลูกค้า —' : '— Select customer —'}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.nameTh} ({c.taxId})</option>
            ))}
          </select>
          {!form.buyerId && (
            <p className="text-xs text-gray-500 mt-1">
              {isThai ? 'ยังไม่มีลูกค้า? ' : 'No customers yet? '}
              <Link to="/app/customers/new" className="text-indigo-600 underline">{isThai ? 'เพิ่มลูกค้าใหม่' : 'Add a new customer'}</Link>
            </p>
          )}
        </div>
        <div>
          <label className="label">{isThai ? 'วันที่' : 'Date'}</label>
          <input type="date" value={form.quotationDate} onChange={(e) => setForm({ ...form, quotationDate: e.target.value })} className="input-field" disabled={!editable} />
        </div>
        <div>
          <label className="label">{isThai ? 'หมดอายุ' : 'Valid until'}</label>
          <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className="input-field" disabled={!editable} />
        </div>
        <div>
          <label className="label">{isThai ? 'ภาษาเอกสาร' : 'Document language'}</label>
          <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as FormState['language'] })} className="input-field" disabled={!editable}>
            <option value="th">ไทย</option>
            <option value="en">English</option>
            <option value="both">ไทย + English</option>
          </select>
        </div>
      </div>

      {/* Items */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{isThai ? 'รายการ' : 'Items'}</h3>
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
              <th className="text-right pb-2 w-20">{isThai ? 'จำนวน' : 'Qty'}</th>
              <th className="text-left pb-2 w-24">{isThai ? 'หน่วย' : 'Unit'}</th>
              <th className="text-right pb-2 w-28">{isThai ? 'ราคา/หน่วย' : 'Unit price'}</th>
              <th className="text-right pb-2 w-24">{isThai ? 'ส่วนลด' : 'Discount'}</th>
              <th className="text-left pb-2 w-24">VAT</th>
              <th className="text-right pb-2 w-28">{isThai ? 'รวม' : 'Total'}</th>
              {editable && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {form.items.map((item, idx) => {
              const line = computeLine(item);
              return (
                <tr key={idx} className="border-t border-gray-100">
                  <td className="py-2 pr-2">
                    <input value={item.nameTh} onChange={(e) => setItem(idx, { nameTh: e.target.value })} placeholder={isThai ? 'ชื่อรายการ' : 'Item name'} className="input-field text-sm" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} className="input-field text-sm text-right" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2">
                    <input value={item.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} className="input-field text-sm" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setItem(idx, { unitPrice: Number(e.target.value) })} className="input-field text-sm text-right" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" step="0.01" value={item.discountAmount} onChange={(e) => setItem(idx, { discountAmount: Number(e.target.value) })} className="input-field text-sm text-right" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2">
                    <select value={item.vatType} onChange={(e) => setItem(idx, { vatType: e.target.value as ItemDraft['vatType'] })} className="input-field text-sm" disabled={!editable}>
                      <option value="vat7">7%</option>
                      <option value="vatZero">0%</option>
                      <option value="vatExempt">{isThai ? 'ยกเว้น' : 'Exempt'}</option>
                    </select>
                  </td>
                  <td className="py-2 pr-2 text-right font-medium">{formatCurrency(line.totalAmount)}</td>
                  {editable && (
                    <td className="py-2 text-center">
                      <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-rose-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="border-t border-gray-200 mt-4 pt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">{isThai ? 'ยอดรวมก่อน VAT' : 'Subtotal'}</span><span>{formatCurrency(totals.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">VAT</span><span>{formatCurrency(totals.vatAmount)}</span></div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">{isThai ? 'ส่วนลดรวม' : 'Discount'}</span>
            <input
              type="number" min="0" step="0.01"
              value={form.discountAmount}
              onChange={(e) => setForm({ ...form, discountAmount: Number(e.target.value) })}
              className="input-field text-sm text-right w-28"
              disabled={!editable}
            />
          </div>
          <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
            <span>{isThai ? 'ยอดสุทธิ' : 'Total'}</span>
            <span className="text-indigo-700">{formatCurrency(totals.total)}</span>
          </div>
        </div>
      </div>

      {/* Notes + terms */}
      <div className="card grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">{isThai ? 'เงื่อนไขการชำระเงิน' : 'Payment terms'}</label>
          <textarea value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} className="input-field" rows={2} disabled={!editable} />
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

      {/* Footer hint */}
      <div className="text-xs text-gray-400 flex items-center gap-2 px-1">
        <FileText className="w-3 h-3" />
        {isThai
          ? 'ใบเสนอราคาไม่มีผลทางภาษี — จะออก ใบกำกับภาษี เมื่อกดแปลงตอนปิดดีล'
          : 'Quotations carry no tax obligation — a tax invoice is created when you mark the quotation accepted and convert it.'}
      </div>
    </div>
  );
}
