import type { DocumentTemplateOption, InvoiceType, Language } from '../../types';
import { useLanguage } from '../../hooks/useLanguage';
import { builtinDocumentTemplates, supportsDocumentType } from '../../lib/documentTemplatePresets';

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
  const matchingBuiltinTemplates = builtinDocumentTemplates.filter((template) => supportsDocumentType(template, docType));
  const selectedBuiltinTemplate = builtinDocumentTemplates.find((template) => template.id === selectedTemplateId);
  const selectedCustomTemplate = filteredTemplates.find((template) => template.id === selectedTemplateId);
  const hasUnsupportedSelection = Boolean(
    selectedTemplateId
      && !selectedBuiltinTemplate
      && !selectedCustomTemplate,
  ) || Boolean(selectedBuiltinTemplate && !supportsDocumentType(selectedBuiltinTemplate, docType));
  const featuredTemplates = matchingBuiltinTemplates.slice(0, 4);

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
          <optgroup label={isThai ? 'แม่แบบสำเร็จรูปของระบบ' : 'Built-in system templates'}>
            {matchingBuiltinTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {isThai ? template.nameTh : template.nameEn} - {isThai ? template.tagTh : template.tagEn}
              </option>
            ))}
          </optgroup>
          {filteredTemplates.length > 0 && (
            <optgroup label={isThai ? 'แม่แบบของบริษัท' : 'Company templates'}>
              {filteredTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}{template.isActive ? ` ${isThai ? '(ค่าเริ่มต้น)' : '(default)'}` : ''}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {hasUnsupportedSelection ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span>
              {isThai
                ? 'Template ที่เลือกไว้ไม่ตรงกับประเภทเอกสารนี้แล้ว'
                : 'The selected template no longer matches this document type.'}
            </span>
            <button
              type="button"
              onClick={() => onTemplateChange(null)}
              className="font-semibold text-amber-900 underline underline-offset-2"
            >
              {isThai ? 'กลับไปใช้มาตรฐาน' : 'Use default'}
            </button>
          </div>
        ) : selectedBuiltinTemplate ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedBuiltinTemplate.accentClass}`}>
                {isThai ? selectedBuiltinTemplate.tagTh : selectedBuiltinTemplate.tagEn}
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {isThai ? selectedBuiltinTemplate.nameTh : selectedBuiltinTemplate.nameEn}
              </span>
              <span className="text-xs text-slate-400">{isThai ? 'แม่แบบระบบ' : 'System template'}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {isThai ? selectedBuiltinTemplate.descriptionTh : selectedBuiltinTemplate.descriptionEn}
            </p>
          </div>
        ) : selectedCustomTemplate ? (
          <p className="mt-2 text-xs text-slate-500">
            {isThai ? 'ใช้แม่แบบของบริษัทที่สร้างไว้ใน Admin Console' : 'Using a company template created in the Admin Console.'}
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            {isThai
              ? 'ค่าเริ่มต้นใช้แบบมาตรฐานที่รองรับ e-Tax ทุกประเภท หรือเลือกแม่แบบสำเร็จรูปด้านล่างเพื่อให้เอกสารเด่นขึ้น'
              : 'The default supports every e-Tax document type, or choose a built-in style below for a more distinctive document.'}
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {featuredTemplates.map((template) => {
          const isSelected = selectedTemplateId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onTemplateChange(isSelected ? null : template.id)}
              className={`rounded-xl border p-3 text-left transition ${
                isSelected
                  ? 'border-blue-400 bg-blue-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">
                  {isThai ? template.nameTh : template.nameEn}
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${template.accentClass}`}>
                  {isThai ? template.tagTh : template.tagEn}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                {isThai ? template.descriptionTh : template.descriptionEn}
              </p>
            </button>
          );
        })}
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
