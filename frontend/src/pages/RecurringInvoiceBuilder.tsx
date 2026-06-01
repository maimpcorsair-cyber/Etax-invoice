import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Loader2, Plus, Receipt, Save, Trash2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import type { Customer, Language, RecurringInvoice, RecurringInvoiceFrequency, RecurringInvoiceItem } from '../types';

type ItemDraft = Omit<RecurringInvoiceItem, 'id'>;

interface FormState {
  name: string;
  customerId: string;
  frequency: RecurringInvoiceFrequency;
  interval: number;
  language: Language;
  invoiceType: 'tax_invoice' | 'tax_invoice_receipt' | 'receipt' | 'credit_note' | 'debit_note';
  startDate: string;
  nextRunDate: string;
  endDate: string;
  dueDays: number | '';
  maxRuns: number | '';
  discountAmount: number;
  paymentMethod: string;
  notes: string;
  items: ItemDraft[];
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const blankItem: ItemDraft = {
  productId: null,
  nameTh: '',
  nameEn: '',
  descriptionTh: '',
  descriptionEn: '',
  quantity: 1,
  unit: 'ชิ้น',
  unitPrice: 0,
  discountAmount: 0,
  vatType: 'vat7',
};

function computeLine(item: ItemDraft) {
  const gross = Number(item.quantity || 0) * Number(item.unitPrice || 0);
  const discount = Number(item.discountAmount || 0) > 0 ? (gross * Number(item.discountAmount || 0)) / 100 : 0;
  const amount = +(gross - discount).toFixed(2);
  const vatAmount = item.vatType === 'vat7' ? +(amount * 0.07).toFixed(2) : 0;
  return { amount, vatAmount, totalAmount: +(amount + vatAmount).toFixed(2) };
}

export default function RecurringInvoiceBuilder() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { isThai, formatCurrency } = useLanguage();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [existing, setExisting] = useState<RecurringInvoice | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState<FormState>({
    name: '',
    customerId: '',
    frequency: 'monthly',
    interval: 1,
    language: 'th',
    invoiceType: 'tax_invoice',
    startDate: todayIso(),
    nextRunDate: todayIso(),
    endDate: '',
    dueDays: 30,
    maxRuns: '',
    discountAmount: 0,
    paymentMethod: '',
    notes: '',
    items: [{ ...blankItem }],
  });

  useEffect(() => {
    if (!token) return;
    (async () => {
      const custRes = await fetch('/api/customers?limit=200', { headers: { Authorization: `Bearer ${token}` } });
      const custJson = await custRes.json();
      setCustomers(custJson.data ?? []);
      if (!isNew && id) {
        const res = await fetch(`/api/recurring-invoices/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const json = await res.json();
          const row: RecurringInvoice = json.data;
          setExisting(row);
          setForm({
            name: row.name,
            customerId: row.customerId,
            frequency: row.frequency,
            interval: row.interval,
            language: row.language,
            invoiceType: row.invoiceType,
            startDate: row.startDate.slice(0, 10),
            nextRunDate: row.nextRunDate.slice(0, 10),
            endDate: row.endDate ? row.endDate.slice(0, 10) : '',
            dueDays: row.dueDays ?? '',
            maxRuns: row.maxRuns ?? '',
            discountAmount: row.discountAmount,
            paymentMethod: row.paymentMethod ?? '',
            notes: row.notes ?? '',
            items: row.items.map((item) => ({
              productId: item.productId ?? null,
              nameTh: item.nameTh,
              nameEn: item.nameEn ?? '',
              descriptionTh: item.descriptionTh ?? '',
              descriptionEn: item.descriptionEn ?? '',
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              vatType: item.vatType,
            })),
          });
        }
        setLoading(false);
      }
    })();
  }, [token, id, isNew]);

  const totals = useMemo(() => {
    const lines = form.items.map(computeLine);
    const subtotal = +lines.reduce((sum, line) => sum + line.amount, 0).toFixed(2);
    const vatAmount = +lines.reduce((sum, line) => sum + line.vatAmount, 0).toFixed(2);
    return { lines, subtotal, vatAmount, total: +(subtotal + vatAmount - Number(form.discountAmount || 0)).toFixed(2) };
  }, [form.items, form.discountAmount]);

  const setItem = useCallback((idx: number, patch: Partial<ItemDraft>) => {
    setForm((prev) => ({ ...prev, items: prev.items.map((item, itemIdx) => (itemIdx === idx ? { ...item, ...patch } : item)) }));
  }, []);

  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, { ...blankItem }] }));
  }

  function removeItem(idx: number) {
    setForm((prev) => ({ ...prev, items: prev.items.length > 1 ? prev.items.filter((_, itemIdx) => itemIdx !== idx) : prev.items }));
  }

  function surfaceError(json: { error?: string; details?: Array<{ path?: (string | number)[]; message?: string }> }) {
    if (json.details?.length) return json.details.map((detail) => `${(detail.path ?? []).join('.')}: ${detail.message ?? ''}`).join(' · ');
    return json.error ?? 'Save failed';
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        name: form.name,
        customerId: form.customerId,
        frequency: form.frequency,
        interval: Number(form.interval || 1),
        language: form.language,
        invoiceType: form.invoiceType,
        startDate: form.startDate,
        nextRunDate: form.nextRunDate,
        endDate: form.endDate || null,
        dueDays: form.dueDays === '' ? null : Number(form.dueDays),
        maxRuns: form.maxRuns === '' ? null : Number(form.maxRuns),
        discountAmount: Number(form.discountAmount || 0),
        paymentMethod: form.paymentMethod || null,
        notes: form.notes || null,
        items: form.items.map((item) => ({
          productId: item.productId ?? null,
          nameTh: item.nameTh,
          nameEn: item.nameEn || null,
          descriptionTh: item.descriptionTh || null,
          descriptionEn: item.descriptionEn || null,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
          discountAmount: Number(item.discountAmount || 0),
          vatType: item.vatType,
        })),
      };
      const res = await fetch(isNew ? '/api/recurring-invoices' : `/api/recurring-invoices/${id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(surfaceError(json));
      setMsg({ type: 'ok', text: isThai ? 'บันทึกรอบวางบิลแล้ว' : 'Recurring schedule saved' });
      navigate(`/app/recurring-invoices/${json.data.id}`);
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  async function generateNow() {
    if (!token || !id) return;
    setGenerating(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/recurring-invoices/${id}/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledFor: todayIso() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Generate failed');
      setMsg({ type: 'ok', text: isThai ? `สร้าง ${json.data.invoice.invoiceNumber} แล้ว` : `Created ${json.data.invoice.invoiceNumber}` });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Generate failed' });
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary-500" /></div>;

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/app/recurring-invoices" className="text-gray-500 hover:text-gray-800"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <CalendarClock className="h-6 w-6 text-primary-600" />
              {isNew ? (isThai ? 'สร้างรอบวางบิล' : 'New recurring schedule') : existing?.name}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{isThai ? 'ระบบจะสร้าง draft invoice ตามรอบ ยังไม่ส่ง RD จนกว่าจะกดออกเอกสาร' : 'The system creates draft invoices on schedule. RD submission still requires issuing the document.'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isNew && existing?.status === 'active' && (
            <button onClick={generateNow} disabled={generating} className="btn-secondary">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
              {isThai ? 'สร้าง draft ตอนนี้' : 'Generate now'}
            </button>
          )}
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isThai ? 'บันทึก' : 'Save'}
          </button>
        </div>
      </header>

      {msg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${msg.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="card space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">{isThai ? 'ชื่อรอบวางบิล' : 'Schedule name'}</span>
                <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="input-field mt-1 w-full" placeholder={isThai ? 'เช่น ค่าบริการรายเดือน' : 'e.g. Monthly service fee'} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">{isThai ? 'ลูกค้า' : 'Customer'}</span>
                <select value={form.customerId} onChange={(e) => setForm((prev) => ({ ...prev, customerId: e.target.value }))} className="input-field mt-1 w-full">
                  <option value="">{isThai ? 'เลือกลูกค้า' : 'Select customer'}</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.nameTh}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">{isThai ? 'ความถี่' : 'Frequency'}</span>
                <select value={form.frequency} onChange={(e) => setForm((prev) => ({ ...prev, frequency: e.target.value as RecurringInvoiceFrequency }))} className="input-field mt-1 w-full">
                  <option value="weekly">{isThai ? 'รายสัปดาห์' : 'Weekly'}</option>
                  <option value="monthly">{isThai ? 'รายเดือน' : 'Monthly'}</option>
                  <option value="quarterly">{isThai ? 'รายไตรมาส' : 'Quarterly'}</option>
                  <option value="yearly">{isThai ? 'รายปี' : 'Yearly'}</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">{isThai ? 'ทุกกี่รอบ' : 'Every'}</span>
                <input type="number" min={1} max={36} value={form.interval} onChange={(e) => setForm((prev) => ({ ...prev, interval: Number(e.target.value) }))} className="input-field mt-1 w-full" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">{isThai ? 'วันที่เริ่ม' : 'Start date'}</span>
                <input type="date" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} className="input-field mt-1 w-full" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">{isThai ? 'สร้างครั้งถัดไป' : 'Next run date'}</span>
                <input type="date" value={form.nextRunDate} onChange={(e) => setForm((prev) => ({ ...prev, nextRunDate: e.target.value }))} className="input-field mt-1 w-full" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">{isThai ? 'กำหนดชำระหลังออกเอกสาร (วัน)' : 'Due after issue (days)'}</span>
                <input type="number" min={0} max={365} value={form.dueDays} onChange={(e) => setForm((prev) => ({ ...prev, dueDays: e.target.value === '' ? '' : Number(e.target.value) }))} className="input-field mt-1 w-full" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">{isThai ? 'จำนวนครั้งสูงสุด' : 'Max runs'}</span>
                <input type="number" min={1} max={240} value={form.maxRuns} onChange={(e) => setForm((prev) => ({ ...prev, maxRuns: e.target.value === '' ? '' : Number(e.target.value) }))} className="input-field mt-1 w-full" placeholder={isThai ? 'ไม่จำกัด' : 'Unlimited'} />
              </label>
            </div>
          </section>

          <section className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{isThai ? 'รายการสินค้า/บริการ' : 'Line items'}</h2>
              <button onClick={addItem} className="btn-secondary px-3 py-1 text-sm"><Plus className="h-4 w-4" />{isThai ? 'เพิ่มรายการ' : 'Add item'}</button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, idx) => {
                const line = totals.lines[idx];
                return (
                  <div key={idx} className="grid gap-2 rounded-lg border border-gray-200 p-3 md:grid-cols-[minmax(0,2fr)_80px_90px_120px_120px_40px]">
                    <input value={item.nameTh} onChange={(e) => setItem(idx, { nameTh: e.target.value })} className="input-field" placeholder={isThai ? 'ชื่อรายการ' : 'Item name'} />
                    <input type="number" min={0} value={item.quantity} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} className="input-field" />
                    <input value={item.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} className="input-field" />
                    <input type="number" min={0} value={item.unitPrice} onChange={(e) => setItem(idx, { unitPrice: Number(e.target.value) })} className="input-field" />
                    <select value={item.vatType} onChange={(e) => setItem(idx, { vatType: e.target.value as ItemDraft['vatType'] })} className="input-field">
                      <option value="vat7">VAT 7%</option>
                      <option value="vatZero">VAT 0%</option>
                      <option value="vatExempt">{isThai ? 'ยกเว้น VAT' : 'Exempt'}</option>
                    </select>
                    <button onClick={() => removeItem(idx)} className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove item"><Trash2 className="h-4 w-4" /></button>
                    <div className="md:col-span-6 text-right text-xs text-gray-500">{formatCurrency(line.totalAmount)}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">{isThai ? 'หมายเหตุ' : 'Notes'}</span>
              <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="input-field mt-1 min-h-[100px] w-full" />
            </label>
          </section>
        </div>

        <aside className="card h-fit space-y-3 xl:sticky xl:top-20">
          <h2 className="font-semibold text-gray-900">{isThai ? 'สรุปยอด' : 'Summary'}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>{isThai ? 'ก่อน VAT' : 'Subtotal'}</span><span>{formatCurrency(totals.subtotal)}</span></div>
            <div className="flex justify-between"><span>VAT</span><span>{formatCurrency(totals.vatAmount)}</span></div>
            <label className="flex items-center justify-between gap-3">
              <span>{isThai ? 'ส่วนลดท้ายบิล' : 'Bill discount'}</span>
              <input type="number" min={0} value={form.discountAmount} onChange={(e) => setForm((prev) => ({ ...prev, discountAmount: Number(e.target.value) }))} className="input-field w-28 text-right" />
            </label>
            <div className="border-t pt-2 flex justify-between text-base font-bold"><span>{isThai ? 'รวม' : 'Total'}</span><span>{formatCurrency(totals.total)}</span></div>
          </div>
          {existing?.runs?.length ? (
            <div className="border-t pt-3">
              <div className="mb-2 text-xs font-semibold uppercase text-gray-500">{isThai ? 'สร้างล่าสุด' : 'Recent drafts'}</div>
              <div className="space-y-2">
                {existing.runs.map((run) => (
                  <Link key={run.id} to={run.invoice ? `/app/invoices/${run.invoice.id}/edit` : '#'} className="block rounded-md border border-gray-100 px-3 py-2 text-xs hover:bg-gray-50">
                    <div className="font-semibold text-primary-700">{run.invoice?.invoiceNumber ?? run.status}</div>
                    <div className="text-gray-500">{run.scheduledFor.slice(0, 10)}</div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
