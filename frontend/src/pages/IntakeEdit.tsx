import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, FileText, Loader2, Save } from 'lucide-react';

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
  const [form, setForm] = useState<FormState>(blankForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/intake-edit/${token}`);
        const json = await res.json() as { data?: IntakeData; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error ?? 'เปิดเอกสารไม่สำเร็จ');
        if (cancelled) return;
        setIntake(json.data);
        setForm(ocrToForm(json.data.ocrResult));
        if (json.data.status === 'saved') setConfirmed(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'เปิดเอกสารไม่สำเร็จ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

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
        <h1 className="text-xl font-semibold text-slate-800 mb-2">บันทึกแล้ว ✨</h1>
        <p className="text-sm text-slate-600 max-w-sm">เราจะส่งข้อความยืนยันกลับไปใน LINE ให้นะครับ ปิดหน้านี้ได้เลย</p>
      </div>
    );
  }

  const r = intake?.ocrResult;
  const isBankTransfer = r?.documentType === 'bank_transfer' || r?.documentType === 'payment_advice';

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <header className="bg-emerald-600 text-white px-4 py-5 shadow">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6" />
          <div>
            <h1 className="font-semibold">แก้ไขเอกสาร</h1>
            <p className="text-xs text-emerald-50">
              {r?.documentTypeLabel || intake?.fileName || 'เอกสารจาก LINE'}
            </p>
          </div>
        </div>
      </header>

      {r?.confidence && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
          🤖 AI อ่านมาแล้ว (ความมั่นใจ: {r.confidence}) — ตรวจให้ถูกแล้วกดบันทึก
        </div>
      )}

      {r?.validationWarnings?.length ? (
        <div className="px-4 py-3 bg-rose-50 border-b border-rose-200 text-sm text-rose-800 space-y-1">
          {r.validationWarnings.slice(0, 3).map((w, i) => (
            <div key={i}>⚠️ {w}</div>
          ))}
        </div>
      ) : null}

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
            <Field label="ชื่อผู้ขาย" value={form.supplierName} onChange={(v) => setForm({ ...form, supplierName: v })} />
            <Field label="เลขผู้เสียภาษี (13 หลัก)" value={form.supplierTaxId} onChange={(v) => setForm({ ...form, supplierTaxId: v.replace(/\D/g, '').slice(0, 13) })} inputMode="numeric" />
            <Field label="รหัสสาขา (5 หลัก)" value={form.supplierBranch} onChange={(v) => setForm({ ...form, supplierBranch: v.replace(/\D/g, '').slice(0, 5) })} inputMode="numeric" />
            <Field label="เลขที่ใบกำกับ" value={form.invoiceNumber} onChange={(v) => setForm({ ...form, invoiceNumber: v })} />
            <Field label="วันที่ใบกำกับ" type="date" value={form.invoiceDate} onChange={(v) => setForm({ ...form, invoiceDate: v })} />
            <Field label="ยอดก่อน VAT" type="number" value={form.subtotal} onChange={(v) => setForm({ ...form, subtotal: v })} />
            <Field label="ยอด VAT" type="number" value={form.vatAmount} onChange={(v) => setForm({ ...form, vatAmount: v })} />
            <Field label="ยอดรวมทั้งสิ้น" type="number" value={form.total} onChange={(v) => setForm({ ...form, total: v })} />
            <Field label="หมวดค่าใช้จ่าย" value={form.expenseCategory} onChange={(v) => setForm({ ...form, expenseCategory: v })} placeholder="เช่น ค่าสาธารณูปโภค" />
          </>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg p-3">
            {error}
          </div>
        )}
      </form>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-4 py-3 shadow-lg">
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
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: 'numeric' | 'text';
  placeholder?: string;
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
        className="w-full rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 px-3 py-2 text-slate-900 bg-white"
      />
    </label>
  );
}
