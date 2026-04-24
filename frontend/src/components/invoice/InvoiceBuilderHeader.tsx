import { Save, Eye, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../hooks/useLanguage';

interface Props {
  isEdit: boolean;
  invoiceId?: string;
  saving: boolean;
  previewLoading: boolean;
  validationErrors: string[];
  onSaveDraft: () => void;
  onPreview: () => void;
  onSubmit: () => void;
}

export default function InvoiceBuilderHeader({
  isEdit,
  invoiceId,
  saving,
  previewLoading,
  validationErrors,
  onSaveDraft,
  onPreview,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const { isThai } = useLanguage();
  const hasValidationErrors = validationErrors.length > 0;

  return (
    <div className="card space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEdit ? t('invoice.edit') : t('invoice.create')}
            </h1>
            <p className="text-sm text-gray-500">
              {isEdit
                ? `#${invoiceId}`
                : isThai
                  ? 'กรอกข้อมูล → ดูตัวอย่าง → ค่อยบันทึกหรือส่งกรมสรรพากร'
                  : 'Fill in details, preview the document, then save or submit to RD.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              1. {isThai ? 'กรอกข้อมูลเอกสาร' : 'Fill document details'}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              2. {isThai ? 'ตรวจตัวอย่าง' : 'Preview'}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              3. {isThai ? 'บันทึกหรือส่ง RD' : 'Save or submit'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button className="btn-secondary" onClick={onPreview} disabled={previewLoading}>
            <Eye className="w-4 h-4" />
            {t('invoice.actions.preview')}
          </button>
          <button className="btn-secondary" onClick={onSaveDraft} disabled={saving}>
            <Save className="w-4 h-4" />
            {isThai ? 'บันทึกเอกสาร' : 'Save document'}
          </button>
          <button className="btn-primary" onClick={onSubmit} disabled={saving}>
            {saving ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('common.loading')}
              </span>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {t('invoice.actions.submitToRD')}
              </>
            )}
          </button>
        </div>
      </div>

      {hasValidationErrors ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            {isThai
              ? 'ยังมีข้อมูลที่ต้องกรอกก่อนดำเนินการต่อ'
              : 'A few details still need attention before you continue.'}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {validationErrors.map((error) => (
              <li key={error}>• {error}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {isThai
            ? 'ข้อมูลหลักครบแล้ว สามารถดูตัวอย่างเอกสารก่อนบันทึกหรือส่ง RD ได้'
            : 'Core details look good. You can preview the document before saving or submitting to RD.'}
        </div>
      )}
    </div>
  );
}
