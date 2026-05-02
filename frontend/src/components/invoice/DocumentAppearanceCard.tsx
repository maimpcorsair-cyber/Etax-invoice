import type { DocumentTemplateOption, InvoiceType, Language } from '../../types';
import { useLanguage } from '../../hooks/useLanguage';
import { builtinDocumentTemplates, supportsDocumentType } from '../../lib/documentTemplatePresets';

interface Props {
  templates: DocumentTemplateOption[];
  selectedTemplateId: string | null;
  onTemplateChange: (value: string | null) => void;
  documentMode: 'ordinary' | 'electronic';
  onDocumentModeChange: (value: 'ordinary' | 'electronic') => void;
  bankPaymentInfo: string;
  onBankPaymentInfoChange: (value: string) => void;
  showCompanyLogo: boolean;
  onShowCompanyLogoChange: (value: boolean) => void;
  documentLogoUrl: string | null;
  onDocumentLogoChange: (value: string | null) => void;
  signatureImageUrl: string | null;
  onSignatureImageChange: (value: string | null) => void;
  signerName: string;
  onSignerNameChange: (value: string) => void;
  signerTitle: string;
  onSignerTitleChange: (value: string) => void;
  docType: InvoiceType;
  docLanguage: Language;
}

export default function DocumentAppearanceCard({
  templates,
  selectedTemplateId,
  onTemplateChange,
  documentMode,
  onDocumentModeChange,
  bankPaymentInfo,
  onBankPaymentInfoChange,
  showCompanyLogo,
  onShowCompanyLogoChange,
  documentLogoUrl,
  onDocumentLogoChange,
  signatureImageUrl,
  onSignatureImageChange,
  signerName,
  onSignerNameChange,
  signerTitle,
  onSignerTitleChange,
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
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => onDocumentLogoChange(event.target?.result as string);
    reader.readAsDataURL(file);
  };
  const handleSignatureFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => onSignatureImageChange(event.target?.result as string);
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
            ? 'เลือกธีมสีและสไตล์ของเอกสาร โดยโครงสร้างข้อมูลภาษียังเหมือนเดิม'
            : 'Choose the document theme and color tone while keeping the same tax-document structure.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onDocumentModeChange('ordinary')}
          className={`rounded-xl border p-4 text-left transition ${
            documentMode === 'ordinary'
              ? 'border-slate-500 bg-slate-50 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="text-sm font-semibold text-slate-900">
            {isThai ? 'เอกสารธรรมดา' : 'Ordinary document'}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {isThai
              ? 'ใช้สำหรับพิมพ์หรือส่งเป็นเอกสารทั่วไป ไม่มี QR ตรวจสอบออนไลน์และไม่มีข้อความกำกับ e-Tax'
              : 'For regular printed/shared documents without online QR verification or e-Tax footer wording.'}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onDocumentModeChange('electronic')}
          className={`rounded-xl border p-4 text-left transition ${
            documentMode === 'electronic'
              ? 'border-blue-500 bg-blue-50 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="text-sm font-semibold text-slate-900">
            {isThai ? 'Electronic / e-Tax' : 'Electronic / e-Tax'}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {isThai
              ? 'มีข้อความกำกับเอกสารอิเล็กทรอนิกส์ด้านล่าง พร้อม QR สำหรับดู/ตรวจสอบเอกสารออนไลน์'
              : 'Adds electronic-document footer wording and a QR for online viewing or verification.'}
          </p>
        </button>
      </div>

      <div>
        <label className="label">{isThai ? 'ธีมที่ใช้กับเอกสารนี้' : 'Document theme'}</label>

        {hasUnsupportedSelection && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span>{isThai ? 'Template ที่เลือกไว้ไม่ตรงกับประเภทเอกสารนี้แล้ว' : 'The selected template no longer matches this document type.'}</span>
            <button type="button" onClick={() => onTemplateChange(null)} className="font-semibold text-amber-900 underline underline-offset-2">
              {isThai ? 'กลับไปใช้มาตรฐาน' : 'Use default'}
            </button>
          </div>
        )}

        {/* Visual grid picker */}
        <div className="grid grid-cols-3 gap-2">
          {/* Default / standard option */}
          <button
            type="button"
            onClick={() => onTemplateChange(null)}
            className={`relative flex flex-col overflow-hidden rounded-xl border-2 transition-all text-left ${
              !selectedTemplateId || hasUnsupportedSelection
                ? 'border-green-500 shadow-md ring-2 ring-green-200'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            {/* Mini doc mockup */}
            <div className="flex flex-col gap-1 bg-white p-2.5">
              <div className="h-2 w-full rounded-sm bg-slate-800" />
              <div className="h-1 w-4/5 rounded-sm bg-slate-300" />
              <div className="mt-1 h-px w-full bg-slate-200" />
              <div className="h-1 w-full rounded-sm bg-slate-200" />
              <div className="h-1 w-4/5 rounded-sm bg-slate-200" />
              <div className="h-1 w-3/5 rounded-sm bg-slate-200" />
              <div className="mt-1 h-1.5 w-full rounded-sm bg-slate-800" />
            </div>
            <div className="border-t border-slate-100 bg-slate-50 px-2.5 py-1.5">
              <div className="text-[11px] font-semibold text-slate-700 truncate">{isThai ? 'มาตรฐาน' : 'Standard'}</div>
              <div className="text-[10px] text-slate-400">{isThai ? 'ค่าเริ่มต้น' : 'Default'}</div>
            </div>
            {(!selectedTemplateId || hasUnsupportedSelection) && (
              <div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white text-[9px] font-bold">✓</div>
            )}
          </button>

          {matchingBuiltinTemplates.map((template) => {
            const isSelected = selectedTemplateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onTemplateChange(template.id)}
                className={`relative flex flex-col overflow-hidden rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? 'border-green-500 shadow-md ring-2 ring-green-200'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Mini doc mockup using swatch colors */}
                <div className="flex flex-col gap-1 bg-white p-2.5">
                  <div className={`h-1.5 w-full rounded-sm ${template.swatches[0]}`} />
                  <div className="h-1 w-4/5 rounded-sm bg-slate-300" />
                  <div className="mt-1 h-px w-full bg-slate-100" />
                  <div className="h-1 w-full rounded-sm bg-slate-100" />
                  <div className="h-1 w-4/5 rounded-sm bg-slate-100" />
                  <div className="h-1 w-3/5 rounded-sm bg-slate-100" />
                  <div className={`mt-1 h-1.5 w-full rounded-sm ${template.swatches[1]}`} />
                </div>
                {/* Swatch color bar */}
                <div className="flex h-1.5">
                  {template.swatches.map((cls, i) => (
                    <div key={i} className={`flex-1 ${cls}`} />
                  ))}
                </div>
                <div className="border-t border-slate-100 bg-slate-50 px-2.5 py-1.5">
                  <div className="text-[11px] font-semibold text-slate-700 truncate">{isThai ? template.nameTh : template.nameEn}</div>
                  <div className="text-[10px] text-slate-400">{isThai ? template.tagTh : template.tagEn}</div>
                </div>
                {isSelected && (
                  <div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white text-[9px] font-bold">✓</div>
                )}
              </button>
            );
          })}

          {filteredTemplates.map((template) => {
            const isSelected = selectedTemplateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onTemplateChange(template.id)}
                className={`relative flex flex-col overflow-hidden rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? 'border-green-500 shadow-md ring-2 ring-green-200'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col gap-1 bg-white p-2.5">
                  <div className="h-1.5 w-full rounded-sm bg-violet-500" />
                  <div className="h-1 w-4/5 rounded-sm bg-slate-300" />
                  <div className="mt-1 h-px w-full bg-slate-100" />
                  <div className="h-1 w-full rounded-sm bg-slate-100" />
                  <div className="h-1 w-4/5 rounded-sm bg-slate-100" />
                </div>
                <div className="border-t border-slate-100 bg-slate-50 px-2.5 py-1.5">
                  <div className="text-[11px] font-semibold text-slate-700 truncate">{template.name}</div>
                  <div className="text-[10px] text-slate-400">{isThai ? 'แม่แบบบริษัท' : 'Company'}</div>
                </div>
                {isSelected && (
                  <div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white text-[9px] font-bold">✓</div>
                )}
              </button>
            );
          })}
        </div>

        {selectedBuiltinTemplate && !hasUnsupportedSelection && (
          <p className="mt-2 text-xs text-slate-500">
            {isThai ? selectedBuiltinTemplate.descriptionTh : selectedBuiltinTemplate.descriptionEn}
          </p>
        )}
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
          {isThai ? 'บัญชีธนาคารผู้เรียกเก็บเงิน (แสดงท้ายเอกสาร)' : 'Collector bank account (shown at document bottom)'}
        </label>
        <textarea
          value={bankPaymentInfo}
          onChange={(e) => onBankPaymentInfoChange(e.target.value)}
          className="input-field min-h-[92px]"
          placeholder={isThai
            ? 'เช่น ธนาคารกสิกรไทย\nชื่อบัญชี บริษัท ตัวอย่าง จำกัด\nเลขที่บัญชี 123-4-56789-0'
            : 'e.g. Kasikorn Bank\nAccount name Example Co., Ltd.\nAccount no. 123-4-56789-0'}
        />
        <p className="mt-2 text-xs text-slate-500">
          {isThai
            ? 'ถ้าเว้นว่าง ระบบจะไม่แสดงกล่องข้อมูลโอนเงินใน PDF'
            : 'Leave blank to hide the bank transfer box in the PDF.'}
        </p>
      </div>

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

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            {isThai ? 'ลายเซ็นผู้มีอำนาจบนเอกสาร' : 'Authorized signature'}
          </h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {isThai
              ? 'รูปเซ็นและชื่อจะแสดงบน PDF ตอนออกเอกสาร ใช้สำหรับความน่าเชื่อถือของเอกสารที่ส่งให้ลูกค้า'
              : 'The signature image and signer details appear on issued PDFs to make customer-facing documents look official.'}
          </p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{isThai ? 'ชื่อผู้ลงนาม' : 'Signer name'}</label>
            <input
              value={signerName}
              onChange={(e) => onSignerNameChange(e.target.value)}
              className="input-field"
              placeholder={isThai ? 'เช่น นายสมชาย ใจดี' : 'e.g. John Smith'}
            />
          </div>
          <div>
            <label className="label">{isThai ? 'ตำแหน่ง' : 'Title'}</label>
            <input
              value={signerTitle}
              onChange={(e) => onSignerTitleChange(e.target.value)}
              className="input-field"
              placeholder={isThai ? 'เช่น กรรมการผู้จัดการ' : 'e.g. Managing Director'}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <input
            type="file"
            accept="image/*"
            onChange={handleSignatureFileChange}
            className="flex-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
          {signatureImageUrl && (
            <button
              type="button"
              onClick={() => onSignatureImageChange(null)}
              className="text-red-500 hover:text-red-700 font-semibold text-sm px-3 py-2 rounded hover:bg-red-50"
            >
              ✕
            </button>
          )}
        </div>
        {signatureImageUrl && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <img src={signatureImageUrl} alt="signature preview" className="h-16 object-contain" />
          </div>
        )}
      </div>
    </div>
  );
}
