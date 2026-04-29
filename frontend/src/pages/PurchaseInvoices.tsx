import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Edit2, Trash2, X, Save, Loader2, ShoppingCart,
  Receipt, CheckCircle, Clock, TrendingDown, AlertTriangle, FileCheck2,
} from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import type { DocumentIntake, PurchaseInvoice } from '../types';

type VatType = 'vat7' | 'vatExempt' | 'vatZero';

interface FormState {
  supplierName: string;
  supplierTaxId: string;
  supplierBranch: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  vatType: VatType;
  vatAmount: string;
  description: string;
  category: string;
  notes: string;
  pdfUrl: string;
}

const todayIso = () => new Date().toISOString().split('T')[0];

function startOfMonthIso() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
}

const EMPTY_FORM: FormState = {
  supplierName: '',
  supplierTaxId: '',
  supplierBranch: '00000',
  invoiceNumber: '',
  invoiceDate: todayIso(),
  dueDate: '',
  subtotal: '',
  vatType: 'vat7',
  vatAmount: '',
  description: '',
  category: '',
  notes: '',
  pdfUrl: '',
};

const VAT_TYPE_LABELS: Record<VatType, { th: string; en: string }> = {
  vat7: { th: 'VAT 7%', en: 'VAT 7%' },
  vatExempt: { th: 'ยกเว้น VAT', en: 'VAT Exempt' },
  vatZero: { th: 'VAT 0%', en: 'Zero-rated' },
};

export default function PurchaseInvoices() {
  const { isThai, formatCurrency, formatDate } = useLanguage();
  const { token } = useAuthStore();
  const { policy } = useCompanyAccessPolicy();

  const [items, setItems] = useState<PurchaseInvoice[]>([]);
  const [reviewIntakes, setReviewIntakes] = useState<DocumentIntake[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(startOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [vatTypeFilter, setVatTypeFilter] = useState<VatType | 'all'>('all');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PurchaseInvoice | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isFreePlan = policy?.plan === 'free';

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (search) params.set('search', search);
      const [res, intakeRes] = await Promise.all([
        fetch(`/api/purchase-invoices?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/purchase-invoices/document-intakes/review', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const json = await res.json();
      const intakeJson = await intakeRes.json();
      let data: PurchaseInvoice[] = json.data ?? [];
      if (vatTypeFilter !== 'all') data = data.filter((p) => p.vatType === vatTypeFilter);
      setItems(data);
      setReviewIntakes(intakeJson.data ?? []);
    } catch {
      setItems([]);
      setReviewIntakes([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, search, vatTypeFilter, token]);

  useEffect(() => {
    const t = setTimeout(fetchItems, 300);
    return () => clearTimeout(t);
  }, [fetchItems]);

  // Auto-calc VAT when subtotal or vatType changes (only if vat7)
  useEffect(() => {
    if (form.vatType === 'vat7') {
      const sub = parseFloat(form.subtotal);
      if (!isNaN(sub)) {
        const computed = (sub * 0.07).toFixed(2);
        setForm((prev) =>
          prev.vatAmount === '' || parseFloat(prev.vatAmount) === parseFloat((sub * 0.07).toFixed(2))
            ? prev
            : { ...prev, vatAmount: computed },
        );
        // initial fill if empty
        if (form.vatAmount === '') {
          setForm((prev) => ({ ...prev, vatAmount: computed }));
        }
      }
    } else if (form.vatType === 'vatExempt' || form.vatType === 'vatZero') {
      if (form.vatAmount !== '0' && form.vatAmount !== '') {
        setForm((prev) => ({ ...prev, vatAmount: '0' }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.subtotal, form.vatType]);

  // Stats
  const totalSubtotal = items.reduce((s, p) => s + Number(p.subtotal || 0), 0);
  const totalVat = items.reduce((s, p) => s + Number(p.vatAmount || 0), 0);
  const totalAmount = items.reduce((s, p) => s + Number(p.total || 0), 0);
  const aiReviewItems = items.filter((p) =>
    (p.description ?? '').includes('LINE OCR') && !(p.notes ?? '').includes('AI reviewed'),
  );

  function openCreate() {
    if (isFreePlan) {
      setError(isThai ? 'อัปเกรดเพื่อบันทึก Input VAT' : 'Upgrade plan to record Input VAT');
      return;
    }
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  }

  function openEdit(p: PurchaseInvoice) {
    setEditing(p);
    setForm({
      supplierName: p.supplierName,
      supplierTaxId: p.supplierTaxId,
      supplierBranch: p.supplierBranch ?? '00000',
      invoiceNumber: p.invoiceNumber,
      invoiceDate: p.invoiceDate.split('T')[0],
      dueDate: p.dueDate ? p.dueDate.split('T')[0] : '',
      subtotal: String(p.subtotal),
      vatType: p.vatType,
      vatAmount: String(p.vatAmount),
      description: p.description ?? '',
      category: p.category ?? '',
      notes: p.notes ?? '',
      pdfUrl: p.pdfUrl ?? '',
    });
    setError('');
    setShowModal(true);
  }

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function digitsOnly(v: string, max: number) {
    return v.replace(/\D/g, '').slice(0, max);
  }

  async function handleSave() {
    if (!form.supplierName.trim()) {
      setError(isThai ? 'กรุณากรอกชื่อผู้ขาย' : 'Please enter supplier name');
      return;
    }
    if (form.supplierTaxId.length !== 13) {
      setError(isThai ? 'เลขผู้เสียภาษีต้องมี 13 หลัก' : 'Tax ID must be 13 digits');
      return;
    }
    if (!form.invoiceNumber.trim()) {
      setError(isThai ? 'กรุณากรอกเลขที่ใบกำกับภาษี' : 'Please enter invoice number');
      return;
    }
    const sub = parseFloat(form.subtotal);
    if (isNaN(sub) || sub < 0) {
      setError(isThai ? 'กรุณากรอกยอดก่อน VAT ที่ถูกต้อง' : 'Please enter a valid subtotal');
      return;
    }
    const vat = parseFloat(form.vatAmount || '0');
    if (isNaN(vat) || vat < 0) {
      setError(isThai ? 'จำนวน VAT ไม่ถูกต้อง' : 'Invalid VAT amount');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        supplierName: form.supplierName.trim(),
        supplierTaxId: form.supplierTaxId,
        supplierBranch: form.supplierBranch || undefined,
        invoiceNumber: form.invoiceNumber.trim(),
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate || undefined,
        subtotal: sub,
        vatAmount: vat,
        vatType: form.vatType,
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        notes: form.notes.trim() || undefined,
        pdfUrl: form.pdfUrl.trim() || undefined,
      };
      const url = editing ? `/api/purchase-invoices/${editing.id}` : '/api/purchase-invoices';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Save failed');
      }
      setShowModal(false);
      fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(isThai ? 'ยืนยันการลบรายการนี้?' : 'Delete this purchase invoice?')) return;
    await fetch(`/api/purchase-invoices/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchItems();
  }

  async function handleMarkPaid(id: string) {
    await fetch(`/api/purchase-invoices/${id}/mark-paid`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchItems();
  }

  async function handleMarkReviewed(p: PurchaseInvoice) {
    const payload = {
      supplierName: p.supplierName,
      supplierTaxId: p.supplierTaxId,
      supplierBranch: p.supplierBranch ?? '00000',
      invoiceNumber: p.invoiceNumber,
      invoiceDate: p.invoiceDate.split('T')[0],
      dueDate: p.dueDate ? p.dueDate.split('T')[0] : undefined,
      subtotal: Number(p.subtotal),
      vatAmount: Number(p.vatAmount),
      vatType: p.vatType,
      description: p.description ?? undefined,
      category: p.category ?? undefined,
      notes: `${p.notes ? `${p.notes}\n` : ''}AI reviewed: ${new Date().toISOString()}`,
      pdfUrl: p.pdfUrl ?? undefined,
    };
    await fetch(`/api/purchase-invoices/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    fetchItems();
  }

  const computedTotal = (() => {
    const s = parseFloat(form.subtotal);
    const v = parseFloat(form.vatAmount || '0');
    if (isNaN(s)) return 0;
    return s + (isNaN(v) ? 0 : v);
  })();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary-600" />
            {isThai ? 'บันทึกซื้อ / Input VAT' : 'Purchase Invoices / Input VAT'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isThai
              ? 'บันทึกใบกำกับภาษีซื้อจากผู้ขายเพื่อใช้ในการยื่น ภ.พ.30'
              : 'Record supplier tax invoices for monthly PP.30 filing'}
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary" disabled={isFreePlan}>
          <Plus className="w-4 h-4" />
          {isThai ? 'เพิ่มรายการซื้อ' : 'Add Purchase'}
        </button>
      </div>

      {isFreePlan && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {isThai
            ? 'อัปเกรดเพื่อบันทึก Input VAT และคำนวณภาษีที่ต้องชำระอัตโนมัติ'
            : 'Upgrade to record Input VAT and auto-calculate VAT payable'}
        </div>
      )}

      {aiReviewItems.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center border border-amber-100">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-amber-950">
                  {isThai ? 'รายการจาก LINE OCR รอตรวจ' : 'LINE OCR items need review'}
                </h2>
                <p className="text-xs text-amber-800 mt-1">
                  {isThai
                    ? 'ตรวจเลขผู้เสียภาษี วันที่ และยอด VAT ก่อนนำไปยื่น ภ.พ.30'
                    : 'Review tax ID, dates, and VAT totals before PP.30 filing.'}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-amber-800 bg-white border border-amber-200 rounded-full px-2 py-1">
              {aiReviewItems.length}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
            {aiReviewItems.slice(0, 4).map((p) => (
              <div key={p.id} className="bg-white border border-amber-100 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.supplierName}</p>
                  <p className="text-xs text-gray-500 font-mono truncate">{p.invoiceNumber} · {formatCurrency(p.total)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(p)} className="p-2 text-primary-700 hover:bg-primary-50 rounded-lg" title={isThai ? 'ตรวจ/แก้ไข' : 'Review/Edit'}>
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleMarkReviewed(p)} className="p-2 text-green-700 hover:bg-green-50 rounded-lg" title={isThai ? 'ตรวจแล้ว' : 'Mark reviewed'}>
                    <FileCheck2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviewIntakes.length > 0 && (
        <div className="border border-rose-200 bg-rose-50 rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center border border-rose-100">
                <Receipt className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-rose-950">
                  {isThai ? 'เอกสาร LINE ที่ต้องดูเอง' : 'LINE documents needing attention'}
                </h2>
                <p className="text-xs text-rose-800 mt-1">
                  {isThai
                    ? 'ระบบรับไฟล์แล้ว แต่ OCR ยังไม่ครบหรือประมวลผลไม่สำเร็จ'
                    : 'Files were received, but OCR was incomplete or failed.'}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-rose-800 bg-white border border-rose-200 rounded-full px-2 py-1">
              {reviewIntakes.length}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
            {reviewIntakes.slice(0, 4).map((item) => (
              <div key={item.id} className="bg-white border border-rose-100 rounded-lg px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.ocrResult?.supplierName
                        || item.ocrResult?.documentMetadata?.sellerName
                        || item.ocrResult?.documentMetadata?.buyerName
                        || item.ocrResult?.invoiceNumber
                        || item.mimeType}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {(item.ocrResult?.documentTypeLabel || item.ocrResult?.documentType || item.status)} · {formatDate(item.createdAt)}
                      {item.ocrResult?.total ? ` · ${formatCurrency(item.ocrResult.total)}` : ''}
                    </p>
                  </div>
                  <button onClick={openCreate} className="text-xs font-medium text-primary-700 hover:text-primary-900">
                    {isThai ? 'กรอกเอง' : 'Manual'}
                  </button>
                </div>
                {(item.error || item.warnings?.length) && (
                  <p className="mt-1 text-xs text-rose-700 line-clamp-2">
                    {item.error || item.warnings?.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">{isThai ? 'จำนวนรายการ' : 'Records'}</p>
            <p className="text-lg font-bold text-gray-900">{items.length}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">{isThai ? 'ยอดซื้อรวม (ก่อน VAT)' : 'Total Excl VAT'}</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalSubtotal)}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
            <TrendingDown className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">{isThai ? 'ภาษีซื้อ (Input VAT)' : 'Input VAT'}</p>
            <p className="text-lg font-bold text-indigo-700">{formatCurrency(totalVat)}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">{isThai ? 'จาก' : 'From'}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-field" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">{isThai ? 'ถึง' : 'To'}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-field" />
          </div>
          <div className="flex flex-col flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-500 mb-1">{isThai ? 'ค้นหา' : 'Search'}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={isThai ? 'ชื่อผู้ขาย / เลขใบกำกับ / เลขผู้เสียภาษี' : 'Supplier / invoice no. / Tax ID'}
                className="input-field pl-9"
              />
            </div>
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">{isThai ? 'ประเภท VAT' : 'VAT Type'}</label>
            <select
              value={vatTypeFilter}
              onChange={(e) => setVatTypeFilter(e.target.value as VatType | 'all')}
              className="input-field w-auto"
            >
              <option value="all">{isThai ? 'ทุกประเภท' : 'All Types'}</option>
              <option value="vat7">VAT 7%</option>
              <option value="vatExempt">{isThai ? 'ยกเว้น VAT' : 'VAT Exempt'}</option>
              <option value="vatZero">VAT 0%</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-500">
            <ShoppingCart className="w-10 h-10 mb-2 text-gray-300" />
            {isThai ? 'ยังไม่มีรายการซื้อในช่วงนี้' : 'No purchase invoices in this period'}
          </div>
        ) : (
          items.map((p) => (
            <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">{p.supplierName}</p>
                  <p className="text-xs text-gray-400 font-mono">{p.supplierTaxId}</p>
                  {(p.description ?? '').includes('LINE OCR') && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                      <AlertTriangle className="w-3 h-3" />
                      {isThai ? 'จาก LINE OCR' : 'LINE OCR'}
                    </p>
                  )}
                </div>
                <span className={p.isPaid ? 'badge-success' : 'badge-warning'}>
                  {p.isPaid ? (isThai ? 'ชำระแล้ว' : 'Paid') : (isThai ? 'ค้างชำระ' : 'Unpaid')}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 pt-1">
                <span>{formatDate(p.invoiceDate)}</span>
                <span className="font-mono">{p.invoiceNumber}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-gray-400">VAT {formatCurrency(p.vatAmount)}</span>
                <span className="font-bold text-primary-700">{formatCurrency(p.total)}</span>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100">
                  <Edit2 className="w-3.5 h-3.5" />
                  {isThai ? 'แก้ไข' : 'Edit'}
                </button>
                {!p.isPaid && (
                  <button onClick={() => handleMarkPaid(p.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {isThai ? 'ทำเครื่องหมายชำระ' : 'Mark Paid'}
                  </button>
                )}
                <button onClick={() => handleDelete(p.id)} className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="card p-0 overflow-hidden hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{isThai ? 'วันที่' : 'Date'}</th>
                <th className="table-header">{isThai ? 'ผู้ขาย' : 'Supplier'}</th>
                <th className="table-header">{isThai ? 'เลขผู้เสียภาษี' : 'Tax ID'}</th>
                <th className="table-header">{isThai ? 'เลขที่' : 'Invoice #'}</th>
                <th className="table-header">{isThai ? 'รายละเอียด' : 'Description'}</th>
                <th className="table-header text-right">{isThai ? 'ยอดก่อน VAT' : 'Subtotal'}</th>
                <th className="table-header text-right">VAT</th>
                <th className="table-header text-right">{isThai ? 'รวม' : 'Total'}</th>
                <th className="table-header">{isThai ? 'สถานะ' : 'Status'}</th>
                <th className="table-header">{isThai ? 'จัดการ' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={10} className="text-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-500" />
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-500">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  {isThai ? 'ยังไม่มีรายการซื้อในช่วงนี้' : 'No purchase invoices in this period'}
                </td></tr>
              ) : (
                items.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="table-cell text-gray-600 whitespace-nowrap">{formatDate(p.invoiceDate)}</td>
                    <td className="table-cell">
                      <p className="font-medium text-gray-900">{p.supplierName}</p>
                      {p.category && <p className="text-xs text-gray-400">{p.category}</p>}
                      {(p.description ?? '').includes('LINE OCR') && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                          <AlertTriangle className="w-3 h-3" />
                          {isThai ? 'จาก LINE OCR' : 'LINE OCR'}
                        </p>
                      )}
                    </td>
                    <td className="table-cell font-mono text-xs">{p.supplierTaxId}</td>
                    <td className="table-cell font-mono text-xs">{p.invoiceNumber}</td>
                    <td className="table-cell text-gray-500 text-sm max-w-[200px] truncate">{p.description ?? '—'}</td>
                    <td className="table-cell text-right">{formatCurrency(p.subtotal)}</td>
                    <td className="table-cell text-right text-indigo-700">{formatCurrency(p.vatAmount)}</td>
                    <td className="table-cell text-right font-semibold">{formatCurrency(p.total)}</td>
                    <td className="table-cell">
                      {p.isPaid ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {isThai ? 'ชำระแล้ว' : 'Paid'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                          <Clock className="w-3.5 h-3.5" />
                          {isThai ? 'ค้างชำระ' : 'Unpaid'}
                        </span>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        {!p.isPaid && (
                          <button onClick={() => handleMarkPaid(p.id)} className="p-1 text-green-600 hover:text-green-800" title={isThai ? 'ทำเครื่องหมายชำระ' : 'Mark Paid'}>
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => openEdit(p)} className="p-1 text-primary-600 hover:text-primary-800" title={isThai ? 'แก้ไข' : 'Edit'}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {(p.description ?? '').includes('LINE OCR') && !(p.notes ?? '').includes('AI reviewed') && (
                          <button onClick={() => handleMarkReviewed(p)} className="p-1 text-green-600 hover:text-green-800" title={isThai ? 'ตรวจแล้ว' : 'Mark reviewed'}>
                            <FileCheck2 className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => handleDelete(p.id)} className="p-1 text-red-400 hover:text-red-600" title={isThai ? 'ลบ' : 'Delete'}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && items.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                    {isThai ? 'รวม' : 'Total'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatCurrency(totalSubtotal)}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-indigo-700">{formatCurrency(totalVat)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{formatCurrency(totalAmount)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editing
                  ? (isThai ? 'แก้ไขรายการซื้อ' : 'Edit Purchase Invoice')
                  : (isThai ? 'เพิ่มรายการซื้อ' : 'Add Purchase Invoice')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">
                    {isThai ? 'ชื่อผู้ขาย' : 'Supplier Name'} *
                  </label>
                  <input
                    value={form.supplierName}
                    onChange={(e) => field('supplierName', e.target.value)}
                    className="input-field"
                    placeholder={isThai ? 'บริษัท ผู้ขาย จำกัด' : 'Supplier Co., Ltd.'}
                  />
                </div>
                <div>
                  <label className="label">
                    {isThai ? 'เลขผู้เสียภาษี' : 'Supplier Tax ID'} * (13 {isThai ? 'หลัก' : 'digits'})
                  </label>
                  <input
                    value={form.supplierTaxId}
                    onChange={(e) => field('supplierTaxId', digitsOnly(e.target.value, 13))}
                    className="input-field font-mono"
                    placeholder="0000000000000"
                    inputMode="numeric"
                    maxLength={13}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {isThai ? `${form.supplierTaxId.length}/13 หลัก เช่น 0-1055-67123-45-6` : `${form.supplierTaxId.length}/13 digits`}
                  </p>
                </div>
                <div>
                  <label className="label">{isThai ? 'รหัสสาขา' : 'Branch Code'}</label>
                  <input
                    value={form.supplierBranch}
                    onChange={(e) => field('supplierBranch', digitsOnly(e.target.value, 5))}
                    className="input-field font-mono"
                    placeholder="00000"
                    inputMode="numeric"
                    maxLength={5}
                  />
                </div>
                <div>
                  <label className="label">{isThai ? 'เลขที่ใบกำกับ' : 'Invoice Number'} *</label>
                  <input
                    value={form.invoiceNumber}
                    onChange={(e) => field('invoiceNumber', e.target.value)}
                    className="input-field font-mono"
                    placeholder="INV-2026-001"
                  />
                </div>
                <div>
                  <label className="label">{isThai ? 'วันที่ใบกำกับ' : 'Invoice Date'} *</label>
                  <input
                    type="date"
                    value={form.invoiceDate}
                    onChange={(e) => field('invoiceDate', e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label">{isThai ? 'ครบกำหนดชำระ' : 'Due Date'}</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => field('dueDate', e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label">{isThai ? 'ประเภท VAT' : 'VAT Type'}</label>
                  <select
                    value={form.vatType}
                    onChange={(e) => field('vatType', e.target.value as VatType)}
                    className="input-field"
                  >
                    <option value="vat7">{isThai ? VAT_TYPE_LABELS.vat7.th : VAT_TYPE_LABELS.vat7.en}</option>
                    <option value="vatExempt">{isThai ? VAT_TYPE_LABELS.vatExempt.th : VAT_TYPE_LABELS.vatExempt.en}</option>
                    <option value="vatZero">{isThai ? VAT_TYPE_LABELS.vatZero.th : VAT_TYPE_LABELS.vatZero.en}</option>
                  </select>
                </div>
                <div>
                  <label className="label">{isThai ? 'ยอดก่อน VAT' : 'Subtotal (excl. VAT)'} *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.subtotal}
                    onChange={(e) => field('subtotal', e.target.value)}
                    className="input-field text-right"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="label">{isThai ? 'จำนวน VAT' : 'VAT Amount'}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.vatAmount}
                    onChange={(e) => field('vatAmount', e.target.value)}
                    className="input-field text-right"
                    placeholder="0.00"
                    disabled={form.vatType !== 'vat7'}
                  />
                  {form.vatType === 'vat7' && (
                    <p className="text-xs text-gray-400 mt-1">
                      {isThai ? 'คำนวณอัตโนมัติ 7% (แก้ไขได้)' : 'Auto-calculated 7% (editable)'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">{isThai ? 'ยอดรวมทั้งสิ้น' : 'Grand Total'}</label>
                  <div className="input-field bg-gray-50 text-right font-semibold text-primary-700">
                    {formatCurrency(computedTotal)}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{isThai ? 'รายละเอียด' : 'Description'}</label>
                  <input
                    value={form.description}
                    onChange={(e) => field('description', e.target.value)}
                    className="input-field"
                    placeholder={isThai ? 'เช่น ค่าวัตถุดิบ, ค่าบริการ' : 'e.g. raw materials, services'}
                  />
                </div>
                <div>
                  <label className="label">{isThai ? 'หมวดหมู่' : 'Category'}</label>
                  <input
                    value={form.category}
                    onChange={(e) => field('category', e.target.value)}
                    className="input-field"
                    placeholder={isThai ? 'เช่น วัตถุดิบ, ค่าใช้จ่ายสำนักงาน' : 'e.g. inventory, office expense'}
                  />
                </div>
                <div>
                  <label className="label">{isThai ? 'URL ไฟล์ PDF' : 'PDF URL'}</label>
                  <input
                    value={form.pdfUrl}
                    onChange={(e) => field('pdfUrl', e.target.value)}
                    className="input-field"
                    placeholder="https://..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{isThai ? 'หมายเหตุ' : 'Notes'}</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => field('notes', e.target.value)}
                    rows={2}
                    className="input-field"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="btn-secondary">
                {isThai ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isThai ? 'บันทึก' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
