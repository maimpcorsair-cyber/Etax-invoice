import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, FileText, Loader2, Paperclip, Receipt, Save, Upload, X } from 'lucide-react';

/**
 * Guest-mode page for editing a LINE document intake via magic-link.
 * The token comes from the URL (signed JWT, 24h TTL); no login is
 * required — by design, since this opens in the LINE in-app browser
 * which has no Google / app session.
 */

type OcrResult = {
  documentType?: string;
  documentTypeLabel?: string | null;
  supplierName?: string;
  supplierTaxId?: string;
  supplierBranch?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  subtotal?: number;
  vatAmount?: number;
  total?: number;
  expenseCategory?: string;
  expenseSubcategory?: string;
  taxTreatment?: string;
  confidence?: string;
  validationWarnings?: string[];
  payment?: {
    amount?: number;
    paidAt?: string;
    reference?: string;
    fromName?: string;
    toName?: string;
  };
};

type IntakeData = {
  id: string;
  status: string;
  fileName: string | null;
  mimeType: string;
  fileSize: number;
  ocrResult: OcrResult | null;
  warnings: string[] | null;
  error: string | null;
  createdAt: string;
};

type Supplier = { name: string; taxId: string; branchCode: string };
type Attachment = { id: string; fileName: string | null; mimeType: string; fileSize: number; createdAt: string };

type FormState = {
  supplierName: string;
  supplierTaxId: string;
  supplierBranch: string;
  invoiceNumber: string;
  invoiceDate: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  expenseCategory: string;
  paymentAmount: string;
  paymentPaidAt: string;
  paymentReference: string;
  paymentFromName: string;
  paymentToName: string;
};

function formatExpiry(iso: string | null): { text: string; urgent: boolean } | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return { text: 'ลิงก์หมดอายุแล้ว', urgent: true };
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return { text: `ลิงก์หมดอายุใน ${days} วัน ${hours % 24} ชม.`, urgent: false };
  if (hours >= 1) return { text: `ลิงก์หมดอายุใน ${hours} ชม. ${mins % 60} น.`, urgent: hours < 2 };
  return { text: `ลิงก์หมดอายุใน ${mins} นาที`, urgent: true };
}

function blankForm(): FormState {
  return {
    supplierName: '', supplierTaxId: '', supplierBranch: '00000',
    invoiceNumber: '', invoiceDate: '',
    subtotal: '', vatAmount: '', total: '',
    expenseCategory: '',
    paymentAmount: '', paymentPaidAt: '', paymentReference: '',
    paymentFromName: '', paymentToName: '',
  };
}

function ocrToForm(r: OcrResult | null): FormState {
  if (!r) return blankForm();
  return {
    supplierName: r.supplierName ?? '',
    supplierTaxId: r.supplierTaxId ?? '',
    supplierBranch: r.supplierBranch ?? '00000',
    invoiceNumber: r.invoiceNumber ?? '',
    invoiceDate: r.invoiceDate ?? '',
    subtotal: r.subtotal != null ? String(r.subtotal) : '',
    vatAmount: r.vatAmount != null ? String(r.vatAmount) : '',
    total: r.total != null ? String(r.total) : '',
    expenseCategory: r.expenseSubcategory ?? r.expenseCategory ?? '',
    paymentAmount: r.payment?.amount != null ? String(r.payment.amount) : '',
    paymentPaidAt: r.payment?.paidAt ?? '',
    paymentReference: r.payment?.reference ?? '',
    paymentFromName: r.payment?.fromName ?? '',
    paymentToName: r.payment?.toName ?? '',
  };
}

function buildPatchPayload(f: FormState) {
  const num = (v: string) => {
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    supplierName: f.supplierName.trim() || undefined,
    supplierTaxId: f.supplierTaxId.replace(/\D/g, '') || undefined,
    supplierBranch: f.supplierBranch.replace(/\D/g, '') || undefined,
    invoiceNumber: f.invoiceNumber.trim() || undefined,
    invoiceDate: f.invoiceDate || undefined,
    subtotal: num(f.subtotal),
    vatAmount: num(f.vatAmount),
    total: num(f.total),
    expenseCategory: f.expenseCategory.trim() || undefined,
    payment: {
      amount: num(f.paymentAmount),
      paidAt: f.paymentPaidAt || undefined,
      reference: f.paymentReference.trim() || undefined,
      fromName: f.paymentFromName.trim() || undefined,
      toName: f.paymentToName.trim() || undefined,
    },
  };
}

export default function IntakeEdit() {
  const { token } = useParams();
  const [intake, setIntake] = useState<IntakeData | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slipUploading, setSlipUploading] = useState(false);
  const [slipSummary, setSlipSummary] = useState<{ amount?: number; paidAt?: string; reference?: string; fromName?: string; toName?: string; confidence?: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const slipInputRef = useRef<HTMLInputElement | null>(null);

  const fileUrl = useMemo(() => (token ? `/api/intake-edit/${token}/file` : ''), [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/intake-edit/${token}`);
        const json = await res.json() as { data?: IntakeData; suppliers?: Supplier[]; expiresAt?: string | null; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error ?? 'เปิดเอกสารไม่สำเร็จ');
        if (cancelled) return;
        setIntake(json.data);
        setSuppliers(json.suppliers ?? []);
        setExpiresAt(json.expiresAt ?? null);
        setForm(ocrToForm(json.data.ocrResult));
        if (json.data.status === 'saved') setConfirmed(true);

        const ar = await fetch(`/api/intake-edit/${token}/attachments`);
        const aj = await ar.json() as { data?: Attachment[] };
        if (!cancelled && aj.data) setAttachments(aj.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'เปิดเอกสารไม่สำเร็จ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Auto-fill supplier name + branch when user types/pastes a complete taxId
  // that matches a known contact in the company.
  useEffect(() => {
    const tid = form.supplierTaxId.replace(/\D/g, '');
    if (tid.length !== 13) return;
    const match = suppliers.find((s) => s.taxId === tid);
    if (!match) return;
    setForm((prev) => {
      if (prev.supplierName === match.name && prev.supplierBranch === match.branchCode) return prev;
      return { ...prev, supplierName: match.name, supplierBranch: match.branchCode };
    });
  }, [form.supplierTaxId, suppliers]);

  // Auto-fill taxId + branch when user picks a supplier name from the datalist
  useEffect(() => {
    if (!form.supplierName) return;
    const match = suppliers.find((s) => s.name === form.supplierName);
    if (!match) return;
    setForm((prev) => {
      if (prev.supplierTaxId === match.taxId) return prev;
      return { ...prev, supplierTaxId: match.taxId, supplierBranch: match.branchCode };
    });
  }, [form.supplierName, suppliers]);

  async function handleConfirm() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/intake-edit/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPatchPayload(form)),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'บันทึกไม่สำเร็จ');
      setConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function handleAttachUpload(file: File | null) {
    if (!file || !token) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setError('แนบได้เฉพาะ PDF, JPG, PNG, WebP');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('ไฟล์ใหญ่เกิน 10MB');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error ?? new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/intake-edit/${token}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileBase64 }),
      });
      const json = await res.json() as { data?: Attachment; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'อัปโหลดไม่สำเร็จ');
      setAttachments((prev) => [json.data!, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSlipUpload(file: File | null) {
    if (!file || !token) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setError('แนบได้เฉพาะ PDF, JPG, PNG, WebP');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('ไฟล์ใหญ่เกิน 10MB');
      return;
    }
    setSlipUploading(true);
    setError(null);
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error ?? new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/intake-edit/${token}/slip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileBase64 }),
      });
      const json = await res.json() as {
        data?: {
          attachment: Attachment;
          ocrResult: OcrResult;
          slipOcr: { amount?: number; paidAt?: string; reference?: string; fromName?: string; toName?: string; confidence?: string };
        };
        error?: string;
      };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'อ่านสลิปไม่สำเร็จ');
      setAttachments((prev) => [json.data!.attachment, ...prev]);
      setSlipSummary(json.data.slipOcr);
      // Auto-fill payment fields from slip OCR — only overwrite empty
      // values so the user's manual edits (if any) aren't clobbered.
      const s = json.data.slipOcr;
      setForm((prev) => ({
        ...prev,
        paymentAmount: prev.paymentAmount || (s.amount != null ? String(s.amount) : ''),
        paymentPaidAt: prev.paymentPaidAt || (s.paidAt ?? ''),
        paymentReference: prev.paymentReference || (s.reference ?? ''),
        paymentFromName: prev.paymentFromName || (s.fromName ?? ''),
        paymentToName: prev.paymentToName || (s.toName ?? ''),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อ่านสลิปไม่สำเร็จ');
    } finally {
      setSlipUploading(false);
      if (slipInputRef.current) slipInputRef.current.value = '';
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error && !intake) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
        <p className="text-slate-700 max-w-sm">{error}</p>
        <p className="text-sm text-slate-500 mt-2">กลับไปที่ LINE แล้วอัปโหลดเอกสารใหม่ได้</p>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4" />
        <h1 className="text-xl font-semibold text-slate-800 mb-2">บันทึกแล้ว</h1>
        <p className="text-sm text-slate-600 max-w-sm">เราจะส่งข้อความยืนยันกลับไปใน LINE ให้นะครับ ปิดหน้านี้ได้เลย</p>
      </div>
    );
  }

  const r = intake?.ocrResult;
  const isBankTransfer = r?.documentType === 'bank_transfer' || r?.documentType === 'payment_advice';
  const isImage = intake?.mimeType?.startsWith('image/');
  const isPdf = intake?.mimeType === 'application/pdf';

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <header className="bg-emerald-600 text-white px-4 py-4 shadow sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold truncate">แก้ไขเอกสาร</h1>
            <p className="text-xs text-emerald-50 truncate">
              {r?.documentTypeLabel || intake?.fileName || 'เอกสารจาก LINE'}
            </p>
          </div>
          {(() => {
            const exp = formatExpiry(expiresAt);
            if (!exp) return null;
            return (
              <span
                className={`text-xs px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 ${
                  exp.urgent ? 'bg-rose-500 text-white' : 'bg-emerald-700/60 text-emerald-50'
                }`}
              >
                <Clock className="w-3 h-3" />
                {exp.text}
              </span>
            );
          })()}
        </div>
      </header>

      <div className="md:grid md:grid-cols-2 md:gap-4 md:p-4 md:max-w-6xl md:mx-auto">
        {/* File preview pane */}
        <section className="bg-slate-900 md:rounded-lg md:shadow overflow-hidden">
          <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-2 text-xs text-slate-300">
            <FileText className="h-3.5 w-3.5" />
            ไฟล์ต้นฉบับ
          </div>
          <div className="bg-slate-100 md:h-[70vh] h-64 flex items-center justify-center">
            {isImage ? (
              <img src={fileUrl} alt="document" className="max-w-full max-h-full object-contain" />
            ) : isPdf ? (
              <iframe
                src={fileUrl}
                title="document"
                className="w-full h-full border-0 bg-white"
              />
            ) : (
              <div className="text-slate-500 text-sm text-center px-4">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                ไม่สามารถแสดงตัวอย่างไฟล์นี้ได้<br />
                <a href={fileUrl} target="_blank" rel="noreferrer" className="text-emerald-600 underline mt-2 inline-block">
                  เปิดไฟล์ในแท็บใหม่
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Form pane */}
        <section className="md:bg-white md:rounded-lg md:shadow md:overflow-hidden">
          {r?.confidence && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
              AI อ่านมาแล้ว (ความมั่นใจ: {r.confidence}) — ตรวจให้ถูกแล้วกดบันทึก
            </div>
          )}

          {r?.validationWarnings?.length ? (
            <div className="px-4 py-3 bg-rose-50 border-b border-rose-200 text-sm text-rose-800 space-y-1">
              {r.validationWarnings.slice(0, 3).map((w, i) => (
                <div key={i} className="flex gap-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          ) : null}

          <datalist id="supplier-names">
            {suppliers.map((s) => (
              <option key={`${s.taxId}-${s.branchCode}`} value={s.name}>
                {s.taxId} ({s.branchCode})
              </option>
            ))}
          </datalist>

          <form
            className="px-4 py-5 space-y-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              void handleConfirm();
            }}
          >
            {isBankTransfer ? (
              <>
                <Field label="ยอดโอน" value={form.paymentAmount} onChange={(v) => setForm({ ...form, paymentAmount: v })} type="number" />
                <Field label="วันที่/เวลาโอน" value={form.paymentPaidAt} onChange={(v) => setForm({ ...form, paymentPaidAt: v })} />
                <Field label="เลขอ้างอิง" value={form.paymentReference} onChange={(v) => setForm({ ...form, paymentReference: v })} />
                <Field label="จาก (ผู้โอน)" value={form.paymentFromName} onChange={(v) => setForm({ ...form, paymentFromName: v })} />
                <Field label="ถึง (ผู้รับ)" value={form.paymentToName} onChange={(v) => setForm({ ...form, paymentToName: v })} />
              </>
            ) : (
              <>
                <Field
                  label="ชื่อผู้ขาย"
                  value={form.supplierName}
                  onChange={(v) => setForm({ ...form, supplierName: v })}
                  list="supplier-names"
                  hint={suppliers.length ? `มี ${suppliers.length} รายชื่อในระบบ — เริ่มพิมพ์เพื่อค้นหา` : undefined}
                />
                <Field
                  label="เลขผู้เสียภาษี (13 หลัก)"
                  value={form.supplierTaxId}
                  onChange={(v) => setForm({ ...form, supplierTaxId: v.replace(/\D/g, '').slice(0, 13) })}
                  inputMode="numeric"
                  hint="พิมพ์ครบ 13 หลัก จะ auto-fill ชื่อจากรายชื่อในระบบ"
                />
                <Field label="รหัสสาขา (5 หลัก)" value={form.supplierBranch} onChange={(v) => setForm({ ...form, supplierBranch: v.replace(/\D/g, '').slice(0, 5) })} inputMode="numeric" />
                <Field label="เลขที่ใบกำกับ" value={form.invoiceNumber} onChange={(v) => setForm({ ...form, invoiceNumber: v })} />
                <Field label="วันที่ใบกำกับ" type="date" value={form.invoiceDate} onChange={(v) => setForm({ ...form, invoiceDate: v })} />
                <Field label="ยอดก่อน VAT" type="number" value={form.subtotal} onChange={(v) => setForm({ ...form, subtotal: v })} />
                <Field label="ยอด VAT" type="number" value={form.vatAmount} onChange={(v) => setForm({ ...form, vatAmount: v })} />
                <Field label="ยอดรวมทั้งสิ้น" type="number" value={form.total} onChange={(v) => setForm({ ...form, total: v })} />
                <Field label="หมวดค่าใช้จ่าย" value={form.expenseCategory} onChange={(v) => setForm({ ...form, expenseCategory: v })} placeholder="เช่น ค่าสาธารณูปโภค" />
              </>
            )}

            {/* Slip upload (only if main doc is a bill — not a slip itself) */}
            {!isBankTransfer && (
              <div className="pt-3 border-t border-slate-200">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-emerald-800 flex items-center gap-1.5">
                      <Receipt className="w-4 h-4" /> หลักฐานการชำระเงิน
                    </span>
                    {slipSummary && (
                      <span className="text-xs text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> อ่านสลิปแล้ว
                      </span>
                    )}
                  </div>
                  {slipSummary ? (
                    <div className="text-xs text-slate-700 space-y-0.5 mb-2">
                      {slipSummary.amount != null && <div>ยอด: <strong>{slipSummary.amount.toLocaleString()}</strong> บาท</div>}
                      {slipSummary.paidAt && <div>วันที่: {slipSummary.paidAt}</div>}
                      {slipSummary.fromName && <div>จาก: {slipSummary.fromName}</div>}
                      {slipSummary.toName && <div>ถึง: {slipSummary.toName}</div>}
                      {slipSummary.reference && <div>อ้างอิง: {slipSummary.reference}</div>}
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-700 mb-2">แนบสลิปโอนเงิน — AI จะอ่านยอด/วันที่/ผู้โอน ให้อัตโนมัติ</p>
                  )}
                  <button
                    type="button"
                    disabled={slipUploading}
                    onClick={() => slipInputRef.current?.click()}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-md py-2 flex items-center justify-center gap-1.5"
                  >
                    {slipUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {slipUploading ? 'กำลังอ่านสลิป...' : slipSummary ? 'แทนที่สลิป' : 'แนบสลิปโอนเงิน'}
                  </button>
                  <input
                    ref={slipInputRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(ev) => void handleSlipUpload(ev.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            )}

            {/* Attachments */}
            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  <Paperclip className="w-4 h-4" /> ไฟล์แนบเพิ่มเติม ({attachments.length})
                </span>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-emerald-600 hover:text-emerald-700 disabled:text-slate-400 flex items-center gap-1"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  เพิ่มไฟล์
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(ev) => void handleAttachUpload(ev.target.files?.[0] ?? null)}
                />
              </div>
              {attachments.length > 0 ? (
                <ul className="space-y-1.5">
                  {attachments.map((a) => (
                    <li key={a.id} className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm text-slate-700 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="truncate flex-1">{a.fileName || 'ไม่มีชื่อ'}</span>
                      <span className="text-xs text-slate-400 shrink-0">{Math.round(a.fileSize / 1024)} KB</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">เช่น แนบบิลคู่กับสลิป หรือ ใบเสร็จคู่กับ Invoice</p>
              )}
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg p-3 flex items-start gap-2">
                <X className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>
        </section>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-4 py-3 shadow-lg">
        <div className="md:max-w-6xl md:mx-auto">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleConfirm()}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium rounded-lg py-3 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'กำลังบันทึก...' : 'บันทึกเอกสาร'}
          </button>
          <p className="text-xs text-slate-500 text-center mt-2">หลังบันทึก ระบบจะส่งยืนยันกลับไปใน LINE</p>
        </div>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: 'numeric' | 'text';
  placeholder?: string;
  hint?: string;
  list?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-slate-600 mb-1">{props.label}</span>
      <input
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        value={props.value}
        onChange={(ev) => props.onChange(ev.target.value)}
        placeholder={props.placeholder}
        list={props.list}
        className="w-full rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 px-3 py-2 text-slate-900 bg-white"
      />
      {props.hint && <span className="block text-xs text-slate-400 mt-1">{props.hint}</span>}
    </label>
  );
}
