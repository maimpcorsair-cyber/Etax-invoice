import { Save, Eye, FileCheck, FileText, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';

interface Props {
  isEdit: boolean;
  isDraft: boolean;
  invoiceId?: string;
  saving: boolean;
  previewLoading: boolean;
  validationErrors: string[];
  onSaveDraft: () => void;
  onPreview: () => void;
  onIssue: () => void;
}

export default function InvoiceBuilderHeader({
  isEdit,
  isDraft,
  invoiceId,
  saving,
  previewLoading,
  validationErrors,
  onSaveDraft,
  onPreview,
  onIssue,
}: Props) {
  const { isThai } = useLanguage();
  const hasValidationErrors = validationErrors.length > 0;

  return (
    <div className="card space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2.5">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
              <FileText className="h-5 w-5 text-primary-700 sm:h-6 sm:w-6" />
              {isEdit
                ? (isThai ? 'แก้ไขเอกสาร' : 'Edit Document')
                : (isThai ? 'สร้างเอกสารใหม่' : 'New Document')}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {isEdit && invoiceId
                ? `#${invoiceId}${isDraft ? (isThai ? ' · ร่าง (ยังไม่ออกเอกสาร)' : ' · Draft (not yet issued)') : ''}`
                : isThai
                  ? 'กรอกข้อมูล → ดูตัวอย่าง → บันทึกร่าง หรือ ออกเอกสารทันที'
                  : 'Fill details → Preview → Save as draft or issue immediately'}
            </p>
          </div>

          <div className="hidden items-center gap-0 sm:flex">
            {[
              { label: isThai ? 'กรอกข้อมูล' : 'Fill details', active: true, done: false },
              { label: isThai ? 'ตรวจตัวอย่าง' : 'Preview', active: false, done: false },
              { label: isThai ? 'บันทึกร่าง' : 'Save draft', active: false, done: false },
              { label: isThai ? 'ออกเอกสาร' : 'Issue', active: false, done: false },
            ].map((step, i) => (
              <div key={i} className="flex items-center">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      step.active
                        ? 'bg-primary-700 text-white'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className={`hidden text-xs font-medium sm:block ${step.active ? 'text-primary-700' : 'text-slate-400'}`}>
                    {step.label}
                  </span>
                </div>
                {i < 3 && <div className="mx-1 h-px w-6 bg-slate-200" />}
              </div>
            ))}
          </div>
        </div>

        <div className="hidden sm:flex flex-wrap items-center gap-2 lg:justify-end">
          <button className="btn-secondary" onClick={onPreview} disabled={previewLoading || saving}>
            <Eye className="w-4 h-4" />
            {isThai ? 'ดูตัวอย่าง' : 'Preview'}
          </button>
          <button
            className="btn-secondary"
            onClick={onSaveDraft}
            disabled={saving || hasValidationErrors}
            title={isThai ? 'บันทึกเป็นร่าง ยังแก้ไขได้ ยังไม่ออกเลขเอกสารจริง' : 'Save as draft — editable, no real document number yet'}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isThai ? 'บันทึกร่าง' : 'Save draft'}
          </button>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onIssue}
            disabled={saving || hasValidationErrors}
            title={isThai ? 'ออกเอกสารจริง — ล็อกเลขเอกสาร สร้าง PDF + QR Code' : 'Issue document — lock number, generate PDF & QR Code'}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileCheck className="w-4 h-4" />
            )}
            {isEdit && isDraft
              ? (isThai ? 'ออกเอกสาร' : 'Issue')
              : (isThai ? 'ออกเอกสารทันที' : 'Issue now')}
          </button>
        </div>
      </div>

      <div className="fixed inset-x-3 bottom-[calc(56px+env(safe-area-inset-bottom,0px)+10px)] z-40 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur sm:hidden">
        <div className="grid grid-cols-[44px_1fr_1fr] gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-50"
            onClick={onPreview}
            disabled={previewLoading || saving}
            aria-label={isThai ? 'ดูตัวอย่าง' : 'Preview'}
          >
            <Eye className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
            onClick={onSaveDraft}
            disabled={saving || hasValidationErrors}
          >
            {saving ? (
              <div className="h-4 w-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isThai ? 'บันทึก' : 'Save'}
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
            onClick={onIssue}
            disabled={saving || hasValidationErrors}
          >
            {saving ? (
              <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <FileCheck className="h-4 w-4" />
            )}
            {isThai ? 'ออกเอกสาร' : 'Issue'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Save className="h-3.5 w-3.5 text-slate-400" />
          {isThai ? 'ร่างยังแก้ไขได้และยังไม่ออกเลขเอกสาร' : 'Draft stays editable and has no document number.'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileCheck className="h-3.5 w-3.5 text-slate-400" />
          {isThai ? 'ออกเอกสารจะล็อกเลข สร้าง PDF/QR และส่ง RD เมื่อเปิดใช้' : 'Issue locks the number, creates PDF/QR, and submits to RD when enabled.'}
        </span>
      </div>

      {hasValidationErrors && (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:flex-row sm:items-start">
          <div className="flex shrink-0 items-center gap-2 font-semibold text-slate-800">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <span>
              {isThai
                ? `ยังขาดข้อมูล ${validationErrors.length} รายการ`
                : `${validationErrors.length} item${validationErrors.length > 1 ? 's' : ''} need attention`}
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap gap-1.5 sm:ml-auto sm:justify-end">
            {validationErrors.map((error, i) => (
              <span key={error} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                  {i + 1}
                </span>
                <span className="truncate">{error}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
