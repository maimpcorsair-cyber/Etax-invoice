import type { InvoiceType } from '../../types';
import { useLanguage } from '../../hooks/useLanguage';

interface Props {
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
}

export default function DocumentAppearanceCard({
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
}: Props) {
  const { isThai } = useLanguage();

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
          {isThai ? 'ตั้งค่าเอกสาร' : 'Document Settings'}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {isThai
            ? 'กำหนดรูปแบบเอกสาร โลโก้ ลายเซ็น และข้อมูลธนาคาร'
            : 'Configure document mode, logo, signature, and bank info.'}
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
