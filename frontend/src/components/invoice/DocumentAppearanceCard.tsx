import type { DocumentTemplateOption, InvoiceType, Language } from '../../types';
import { useLanguage } from '../../hooks/useLanguage';

interface Props {
  templates: DocumentTemplateOption[];
  selectedTemplateId: string | null;
  onTemplateChange: (value: string | null) => void;
  showCompanyLogo: boolean;
  onShowCompanyLogoChange: (value: boolean) => void;
  documentLogoUrl: string | null;
  onDocumentLogoChange: (value: string | null) => void;
  docType: InvoiceType;
  docLanguage: Language;
}

export default function DocumentAppearanceCard({
  templates,
  selectedTemplateId,
  onTemplateChange,
  showCompanyLogo,
  onShowCompanyLogoChange,
  documentLogoUrl,
  onDocumentLogoChange,
  docType,
  docLanguage,
}: Props) {
  const { isThai } = useLanguage();

  const filteredTemplates = templates.filter((template) => (
    template.type === docType && (template.language === docLanguage || template.language === 'both' || docLanguage === 'both')
  ));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => onDocumentLogoChange(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">
          {isThai ? 'หน้าตาเอกสาร' : 'Document Appearance'}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {isThai
            ? 'เลือก template ของ invoice/receipt และกำหนดว่าจะใช้โลโก้บริษัทหรือโลโก้เฉพาะเอกสาร'
            : 'Choose the invoice/receipt template and decide whether to show the company logo or a document-specific mark.'}
        </p>
      </div>

      <div>
        <label className="label">{isThai ? 'Template ที่ใช้กับเอกสารนี้' : 'Template for this document'}</label>
        <select
          className="input-field"
          value={selectedTemplateId ?? ''}
          onChange={(e) => onTemplateChange(e.target.value || null)}
        >
          <option value="">
            {isThai ? 'ใช้แบบมาตรฐานของระบบ' : 'Use the polished default template'}
          </option>
          {filteredTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}{template.isActive ? ` ${isThai ? '(ค่าเริ่มต้น)' : '(default)'}` : ''}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-slate-500">
          {filteredTemplates.length > 0
            ? (isThai ? 'Template ที่ตรงกับประเภทเอกสารและภาษาจะขึ้นให้เลือกที่นี่' : 'Templates matching this document type and language are available here.')
            : (isThai ? 'ยังไม่มี template สำหรับเอกสารประเภท/ภาษานี้ ระบบจะใช้แบบมาตรฐานแทน' : 'No matching template exists for this document type/language yet, so the default design will be used.')}
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={showCompanyLogo}
          onChange={(e) => onShowCompanyLogoChange(e.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="block font-medium text-slate-900">
            {isThai ? 'แสดงโลโก้บริษัทในหัวเอกสาร' : 'Show company logo in document header'}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            {isThai
              ? 'ถ้าปิดไว้ เอกสารจะยังแสดงชื่อบริษัทและข้อมูลภาษีตามปกติ แต่จะไม่มีภาพโลโก้บริษัท'
              : 'If disabled, the company name and tax identity still show as usual, but the visual company logo will be hidden.'}
          </span>
        </span>
      </label>

      <div>
        <label className="label">
          {isThai ? 'โลโก้/ตราเฉพาะเอกสาร (ไม่บังคับ)' : 'Document mark or badge (optional)'}
        </label>
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="flex-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {documentLogoUrl && (
            <button
              type="button"
              onClick={() => onDocumentLogoChange(null)}
              className="text-red-500 hover:text-red-700 font-semibold text-sm px-3 py-2 rounded hover:bg-red-50"
            >
              ✕
            </button>
          )}
        </div>
        {documentLogoUrl && (
          <img src={documentLogoUrl} alt="document mark preview" className="mt-3 h-16 object-contain" />
        )}
        <p className="mt-2 text-xs text-slate-500">
          {isThai
            ? 'ใช้สำหรับตราแบรนด์ย่อย, โลโก้แคมเปญ, หรือเครื่องหมายเฉพาะบนใบ invoice/receipt โดยไม่กระทบข้อมูลบริษัทหลัก'
            : 'Useful for a sub-brand seal, campaign mark, or a document-specific badge without changing the main company identity.'}
        </p>
      </div>
    </div>
  );
}
