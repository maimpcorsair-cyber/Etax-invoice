import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Edit2, Trash2, X, Save, Loader2, ShoppingCart,
  Receipt, CheckCircle, Clock, AlertTriangle, FileCheck2,
  Upload, Image as ImageIcon, FileText, ExternalLink,
} from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import type { DocumentIntake, PurchaseInvoice } from '../types';

type VatType = 'vat7' | 'vatExempt' | 'vatZero';
type DocumentStatusFilter = 'action' | 'all' | 'saved' | 'failed';

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

interface DocumentStats {
  windowDays: number;
  totalLast30Days: number;
  failedLast30Days: number;
  duplicateWarnings: number;
  storage: {
    configured: boolean;
    storageBacked: number;
    databaseBacked: number;
  };
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
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
  const [documentLibrary, setDocumentLibrary] = useState<DocumentIntake[]>([]);
  const [documentStats, setDocumentStats] = useState<DocumentStats | null>(null);
  const [documentTypeFilter, setDocumentTypeFilter] = useState<'all' | 'pdf' | 'image'>('all');
  const [documentStatusFilter, setDocumentStatusFilter] = useState<DocumentStatusFilter>('action');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [documentActionId, setDocumentActionId] = useState<string | null>(null);
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
      const [res, intakeRes, libraryRes, statsRes] = await Promise.all([
        fetch(`/api/purchase-invoices?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/purchase-invoices/document-intakes/review', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/purchase-invoices/document-intakes?type=${documentTypeFilter}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/purchase-invoices/document-intakes/stats/summary', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const json = await res.json();
      const intakeJson = await intakeRes.json();
      const libraryJson = await libraryRes.json();
      const statsJson = await statsRes.json();
      let data: PurchaseInvoice[] = json.data ?? [];
      if (vatTypeFilter !== 'all') data = data.filter((p) => p.vatType === vatTypeFilter);
      setItems(data);
      setReviewIntakes(intakeJson.data ?? []);
      setDocumentLibrary(libraryJson.data ?? []);
      setDocumentStats(statsJson.data ?? null);
    } catch {
      setItems([]);
      setReviewIntakes([]);
      setDocumentLibrary([]);
      setDocumentStats(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, search, vatTypeFilter, documentTypeFilter, token]);

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
  const actionStatuses = new Set(['received', 'processing', 'awaiting_input', 'awaiting_confirmation', 'needs_review', 'failed']);
  const actionDocuments = documentLibrary.filter((doc) => actionStatuses.has(doc.status));
  const awaitingDocuments = documentLibrary.filter((doc) => ['awaiting_input', 'awaiting_confirmation', 'needs_review'].includes(doc.status));
  const filteredDocumentLibrary = documentLibrary.filter((doc) => {
    if (documentStatusFilter === 'action') return actionStatuses.has(doc.status);
    if (documentStatusFilter === 'saved') return doc.status === 'saved';
    if (documentStatusFilter === 'failed') return doc.status === 'failed';
    return true;
  });

  function documentTitle(doc: DocumentIntake) {
    return doc.ocrResult?.supplierName
      || doc.ocrResult?.documentMetadata?.sellerName
      || doc.ocrResult?.invoiceNumber
      || doc.fileName
      || (doc.mimeType === 'application/pdf' ? 'PDF document' : 'Image document');
  }

  function documentStatusLabel(status: string) {
    const labels: Record<string, string> = {
      received: isThai ? 'รับไฟล์แล้ว' : 'Received',
      processing: isThai ? 'กำลังอ่าน' : 'Processing',
      awaiting_input: isThai ? 'รอข้อมูลเพิ่ม' : 'Needs info',
      awaiting_confirmation: isThai ? 'รอยืนยัน' : 'Awaiting confirm',
      needs_review: isThai ? 'ต้องตรวจ' : 'Needs review',
      failed: isThai ? 'อ่านไม่สำเร็จ' : 'Failed',
      saved: isThai ? 'บันทึกแล้ว' : 'Saved',
      rejected: isThai ? 'ไม่ใช้' : 'Rejected',
    };
    return labels[status] ?? status;
  }

  function documentStatusClass(status: string) {
    if (status === 'saved') return 'bg-green-50 text-green-700 border-green-100';
    if (status === 'failed') return 'bg-rose-50 text-rose-700 border-rose-100';
    if (status === 'processing') return 'bg-blue-50 text-blue-700 border-blue-100';
    if (status === 'rejected') return 'bg-gray-50 text-gray-500 border-gray-100';
    return 'bg-amber-50 text-amber-700 border-amber-100';
  }

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

  async function openDocumentFile(item: DocumentIntake) {
    setError('');
    try {
      if (item.fileUrl && /^https?:\/\//i.test(item.fileUrl)) {
        window.open(item.fileUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      const res = await fetch(`/api/purchase-invoices/document-intakes/${item.id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? (isThai ? 'เปิดไฟล์ไม่สำเร็จ' : 'Cannot open file'));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : (isThai ? 'เปิดไฟล์ไม่สำเร็จ' : 'Cannot open file'));
    }
  }

  function canConfirmDocument(doc: DocumentIntake) {
    const type = doc.ocrResult?.documentType;
    return !!doc.ocrResult && ['tax_invoice', 'receipt', 'invoice', 'billing_note', 'expense_receipt', 'credit_note', 'debit_note'].includes(type || '');
  }

  async function runDocumentAction(path: string, errorFallback: string) {
    setError('');
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? errorFallback);
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : errorFallback);
    }
  }

  async function attachDocument(doc: DocumentIntake) {
    const keyword = prompt(isThai ? 'พิมพ์เลขใบซื้อหรือชื่อผู้ขายที่ต้องการแนบไฟล์นี้' : 'Enter purchase invoice number or supplier name to attach this file');
    if (!keyword?.trim()) return;
    const normalized = keyword.trim().toLowerCase();
    const match = items.find((item) =>
      item.invoiceNumber.toLowerCase() === normalized
      || item.invoiceNumber.toLowerCase().includes(normalized)
      || item.supplierName.toLowerCase().includes(normalized),
    );
    if (!match) {
      setError(isThai ? 'ไม่พบรายการซื้อที่ตรงกับคำค้นนี้ในช่วงวันที่ที่เปิดอยู่' : 'No matching purchase invoice in the current date range');
      return;
    }
    setDocumentActionId(doc.id);
    setError('');
    try {
      const res = await fetch(`/api/purchase-invoices/document-intakes/${doc.id}/attach-purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ purchaseInvoiceId: match.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Attach failed');
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isThai ? 'แนบเอกสารไม่สำเร็จ' : 'Attach failed'));
    } finally {
      setDocumentActionId(null);
    }
  }

  async function confirmDocument(doc: DocumentIntake) {
    if (!confirm(isThai ? 'ยืนยันบันทึกเอกสารนี้เป็นรายการซื้อ?' : 'Confirm this document as a purchase invoice?')) return;
    setDocumentActionId(doc.id);
    await runDocumentAction(
      `/api/purchase-invoices/document-intakes/${doc.id}/confirm-purchase`,
      isThai ? 'บันทึกเอกสารไม่สำเร็จ' : 'Confirm document failed',
    );
    setDocumentActionId(null);
  }

  async function rejectDocument(doc: DocumentIntake) {
    if (!confirm(isThai ? 'ย้ายเอกสารนี้ไปสถานะไม่ใช้?' : 'Reject this document?')) return;
    setDocumentActionId(doc.id);
    await runDocumentAction(
      `/api/purchase-invoices/document-intakes/${doc.id}/reject`,
      isThai ? 'ปฏิเสธเอกสารไม่สำเร็จ' : 'Reject document failed',
    );
    setDocumentActionId(null);
  }

  async function uploadDocument(file: File) {
    if (isFreePlan) {
      setError(isThai ? 'อัปเกรดเพื่ออัปโหลดเอกสารซื้อ' : 'Upgrade plan to upload purchase documents');
      return;
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setError(isThai ? 'รองรับเฉพาะ PDF, JPG, PNG, WebP' : 'Only PDF, JPG, PNG, and WebP are supported');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/purchase-invoices/document-intakes/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileBase64 }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Upload failed');
      }
      const json = await res.json().catch(() => ({}));
      await fetchItems();
      const status = json.data?.status as string | undefined;
      if (status === 'failed' || status === 'needs_review') {
        setError(isThai ? 'อัปโหลดแล้ว แต่ระบบต้องให้ตรวจเอกสารนี้เอง' : 'Uploaded, but this document needs manual review');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
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

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] gap-4">
        <div className="card space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary-600" />
                {isThai ? 'งานเอกสารเข้า' : 'Document Inbox'}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {isThai ? `${actionDocuments.length} รายการต้องจัดการ` : `${actionDocuments.length} items need action`}
              </p>
            </div>
            <label className={`btn-primary cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {isThai ? 'อัปโหลด' : 'Upload'}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploading || isFreePlan}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (file) void uploadDocument(file);
                }}
              />
            </label>
          </div>

          {documentStats && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              {[
                { label: isThai ? 'เอกสาร 30 วัน' : '30-day docs', value: documentStats.totalLast30Days, tone: 'bg-gray-50 text-gray-700' },
                { label: isThai ? 'รอยืนยัน' : 'Awaiting', value: awaitingDocuments.length, tone: 'bg-amber-50 text-amber-700' },
                { label: isThai ? 'บันทึกแล้ว' : 'Saved', value: documentStats.byStatus.saved ?? 0, tone: 'bg-green-50 text-green-700' },
                { label: isThai ? 'อ่านไม่สำเร็จ' : 'Failed', value: documentStats.failedLast30Days, tone: 'bg-rose-50 text-rose-700' },
                { label: isThai ? 'ซ้ำที่กันไว้' : 'Duplicates', value: documentStats.duplicateWarnings, tone: 'bg-blue-50 text-blue-700' },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-lg px-3 py-2 ${stat.tone}`}>
                  <p className="text-[11px] font-medium opacity-80">{stat.label}</p>
                  <p className="text-lg font-bold">{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          {documentStats && !documentStats.storage.configured && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {isThai
                ? 'Storage ยังไม่พร้อม: ไฟล์ใหม่จะถูกเก็บใน database ชั่วคราว ควรตั้ง S3/R2 ก่อนขายจริง'
                : 'Storage is not configured: new files are temporarily stored in the database. Configure S3/R2 before production.'}
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between">
            <div className="inline-flex w-full lg:w-auto rounded-lg border border-gray-200 bg-gray-50 p-1">
              {[
                { key: 'action', label: isThai ? 'ต้องจัดการ' : 'Action' },
                { key: 'all', label: isThai ? 'ทั้งหมด' : 'All' },
                { key: 'saved', label: isThai ? 'บันทึกแล้ว' : 'Saved' },
                { key: 'failed', label: isThai ? 'ล้มเหลว' : 'Failed' },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setDocumentStatusFilter(item.key as DocumentStatusFilter)}
                  className={`flex-1 lg:flex-none rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    documentStatusFilter === item.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <select
              value={documentTypeFilter}
              onChange={(e) => setDocumentTypeFilter(e.target.value as 'all' | 'pdf' | 'image')}
              className="input-field w-full lg:w-auto"
            >
              <option value="all">{isThai ? 'ทุกไฟล์' : 'All files'}</option>
              <option value="pdf">PDF</option>
              <option value="image">{isThai ? 'รูปภาพ' : 'Images'}</option>
            </select>
          </div>

          {filteredDocumentLibrary.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">
              {isThai ? 'ไม่มีเอกสารในมุมมองนี้' : 'No documents in this view'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDocumentLibrary.slice(0, 12).map((doc) => {
                const isPdf = doc.mimeType === 'application/pdf';
                const busy = documentActionId === doc.id || doc.status === 'processing';
                return (
                  <div key={doc.id} className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="min-w-0 flex flex-1 items-start gap-3">
                        <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isPdf ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                          {isPdf ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900 truncate">{documentTitle(doc)}</p>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${documentStatusClass(doc.status)}`}>
                              {documentStatusLabel(doc.status)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500 truncate">
                            {doc.source} · {doc.ocrResult?.documentTypeLabel || doc.ocrResult?.documentType || doc.mimeType} · {formatDate(doc.createdAt)}
                            {doc.ocrResult?.total ? ` · ${formatCurrency(doc.ocrResult.total)}` : ''}
                          </p>
                          {(doc.error || doc.warnings?.length) && (
                            <p className="mt-1 text-xs text-rose-600 line-clamp-1">
                              {doc.error || doc.warnings?.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <button
                          type="button"
                          onClick={() => void openDocumentFile(doc)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {isThai ? 'ไฟล์' : 'File'}
                        </button>
                        {doc.status !== 'saved' && (
                          <>
                            {busy && (
                              <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-medium text-blue-700">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {isThai ? 'กำลังอ่าน' : 'Reading'}
                              </span>
                            )}
                            {canConfirmDocument(doc) && (
                              <button
                                onClick={() => void confirmDocument(doc)}
                                disabled={busy}
                                className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                              >
                                <FileCheck2 className="w-3.5 h-3.5" />
                                {isThai ? 'บันทึก' : 'Save'}
                              </button>
                            )}
                            <button
                              onClick={() => void attachDocument(doc)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {isThai ? 'แนบ' : 'Attach'}
                            </button>
                            <button
                              onClick={() => void rejectDocument(doc)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                            >
                              <X className="w-3.5 h-3.5" />
                              {isThai ? 'ไม่ใช้' : 'Reject'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                {isThai ? 'รายการรอตรวจ' : 'Review Queue'}
              </h2>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                {aiReviewItems.length + reviewIntakes.length}
              </span>
            </div>
            {aiReviewItems.length === 0 && reviewIntakes.length === 0 ? (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                {isThai ? 'ไม่มีงานค้างตรวจ' : 'No pending review items'}
              </p>
            ) : (
              <div className="space-y-2">
                {aiReviewItems.slice(0, 3).map((p) => (
                  <div key={p.id} className="rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.supplierName}</p>
                    <p className="text-xs text-gray-600 truncate">{p.invoiceNumber} · {formatCurrency(p.total)}</p>
                    <div className="mt-2 flex items-center gap-1">
                      <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50">
                        <Edit2 className="w-3.5 h-3.5" />
                        {isThai ? 'ตรวจ' : 'Review'}
                      </button>
                      <button onClick={() => handleMarkReviewed(p)} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50">
                        <FileCheck2 className="w-3.5 h-3.5" />
                        {isThai ? 'ผ่าน' : 'Done'}
                      </button>
                    </div>
                  </div>
                ))}
                {reviewIntakes.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-lg border border-rose-100 bg-rose-50/70 px-3 py-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{documentTitle(item)}</p>
                    <p className="text-xs text-gray-600 truncate">
                      {documentStatusLabel(item.status)} · {formatDate(item.createdAt)}
                      {item.ocrResult?.total ? ` · ${formatCurrency(item.ocrResult.total)}` : ''}
                    </p>
                    {(item.error || item.warnings?.length) && (
                      <p className="mt-1 text-xs text-rose-700 line-clamp-2">{item.error || item.warnings?.join(', ')}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-600" />
              {isThai ? 'สรุปภาษีซื้อ' : 'Input VAT Summary'}
            </h2>
            <div className="grid grid-cols-1 gap-2">
              <div className="rounded-lg bg-blue-50 px-3 py-2">
                <p className="text-xs font-medium text-blue-700">{isThai ? 'จำนวนรายการ' : 'Records'}</p>
                <p className="text-lg font-bold text-blue-950">{items.length}</p>
              </div>
              <div className="rounded-lg bg-green-50 px-3 py-2">
                <p className="text-xs font-medium text-green-700">{isThai ? 'ยอดซื้อก่อน VAT' : 'Total excl. VAT'}</p>
                <p className="text-lg font-bold text-green-950">{formatCurrency(totalSubtotal)}</p>
              </div>
              <div className="rounded-lg bg-indigo-50 px-3 py-2">
                <p className="text-xs font-medium text-indigo-700">{isThai ? 'ภาษีซื้อ' : 'Input VAT'}</p>
                <p className="text-lg font-bold text-indigo-950">{formatCurrency(totalVat)}</p>
              </div>
            </div>
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
