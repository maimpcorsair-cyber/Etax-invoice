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

          <div className="flex items-center gap-0">
            {[
              { label: isThai ? 'กรอกข้อมูล' : 'Fill details', active: true, done: false },
              { label: isThai ? 'ตรวจตัวอย่าง' : 'Preview', active: false, done: false },
              { label: isThai ? 'บันทึกร่าง' : 'Save draft', active: false, done: false },
              { label: isThai ? 'ออกเอกสาร' : 'Issue', active: false, done: false },
            ].map((step, i) => (
              <div key={i} className="flex items-center">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      step.active
                        ? 'text-white shadow-button'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                    style={step.active ? {background:'linear-gradient(135deg,#2563eb,#1e40af)'} : {}}
                  >
                    {i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${step.active ? 'text-primary-700' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
                {i < 3 && <div className="w-6 h-px bg-gray-200 mx-1" />}
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
            className="btn-primary"
            style={{background:'linear-gradient(135deg,#10b981,#059669)'}}
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
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-3 h-3 text-white" />
            </div>
            <p className="text-sm font-semibold text-amber-900">
              {isThai
                ? `ยังขาดข้อมูล ${validationErrors.length} รายการ`
                : `${validationErrors.length} item${validationErrors.length > 1 ? 's' : ''} need attention`}
            </p>
          </div>
          <div className="space-y-1.5 pl-7">
            {validationErrors.map((error, i) => (
              <div key={error} className="flex items-center gap-2 text-sm text-amber-800">
                <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                {error}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
