import { Save, Eye, FileCheck, FileText } from 'lucide-react';
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
    <div className="card space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary-600" />
              {isEdit
                ? (isThai ? 'แก้ไขเอกสาร' : 'Edit Document')
                : (isThai ? 'สร้างเอกสารใหม่' : 'New Document')}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEdit && invoiceId
                ? `#${invoiceId}${isDraft ? (isThai ? ' · ร่าง (ยังไม่ออกเอกสาร)' : ' · Draft (not yet issued)') : ''}`
                : isThai
                  ? 'กรอกข้อมูล → ดูตัวอย่าง → บันทึกร่าง หรือ ออกเอกสารทันที'
                  : 'Fill details → Preview → Save as draft or issue immediately'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              1. {isThai ? 'กรอกข้อมูล' : 'Fill in details'}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              2. {isThai ? 'ตรวจตัวอย่าง' : 'Preview'}
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700 font-medium">
              3. {isThai ? 'บันทึกร่าง' : 'Save draft'}
            </span>
            <span className="rounded-full bg-green-100 px-3 py-1 text-green-700 font-medium">
              4. {isThai ? 'ออกเอกสาร' : 'Issue document'}
            </span>
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
            className="btn-primary bg-green-600 hover:bg-green-700 focus:ring-green-500"
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

      {/* Explanation banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <Save className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">{isThai ? 'บันทึกร่าง' : 'Save draft'}</p>
            <p className="text-amber-700 leading-relaxed">
              {isThai
                ? 'ยังแก้ไขได้ทุกอย่าง ไม่มีเลขเอกสาร ไม่สร้าง PDF ยังไม่ส่ง RD'
                : 'Fully editable. No document number. No PDF. Not submitted to RD.'}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
          <FileCheck className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-green-800">{isThai ? 'ออกเอกสาร' : 'Issue document'}</p>
            <p className="text-green-700 leading-relaxed">
              {isThai
                ? 'ล็อกเลขเอกสาร สร้าง PDF พร้อม QR Code และส่ง RD อัตโนมัติ (ถ้ามีสิทธิ์)'
                : 'Locks document number. Generates PDF + QR Code. Auto-submits to RD if enabled.'}
            </p>
          </div>
        </div>
      </div>

      {hasValidationErrors && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-semibold text-rose-900">
            {isThai ? 'กรุณาแก้ไขข้อมูลต่อไปนี้ก่อน' : 'Please fix these before continuing'}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-rose-800">
            {validationErrors.map((error) => (
              <li key={error}>• {error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
