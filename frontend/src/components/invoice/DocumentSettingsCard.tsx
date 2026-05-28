import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../hooks/useLanguage';
import type { InvoiceType, Language } from '../../types';
import { addCalendarDays } from '../../lib/dateMath';

interface Props {
  docType: InvoiceType;
  onDocTypeChange: (v: InvoiceType) => void;
  docLanguage: Language;
  onDocLanguageChange: (v: Language) => void;
  invoiceDate: string;
  onInvoiceDateChange: (v: string) => void;
  dueDate: string;
  onDueDateChange: (v: string) => void;
  referenceDocNumber: string;
  onReferenceDocNumberChange: (v: string) => void;
}

export default function DocumentSettingsCard({
  docType,
  onDocTypeChange,
  docLanguage,
  onDocLanguageChange,
  invoiceDate,
  onInvoiceDateChange,
  dueDate,
  onDueDateChange,
  referenceDocNumber,
  onReferenceDocNumberChange,
}: Props) {
  const { t } = useTranslation();
  const { isThai } = useLanguage();
  const needsRefDoc =
    docType === 'receipt' || docType === 'credit_note' || docType === 'debit_note';
  const dueDatePresets = [7, 15, 30, 45];
  const docTypeDescriptions: Record<InvoiceType, { title: string; description: string }> = {
    tax_invoice: {
      title: isThai ? 'ใบกำกับภาษี (T02)' : 'Tax Invoice (T02)',
      description: isThai
        ? 'ใช้กับการขายเชื่อหรือกรณีที่ยังไม่ได้รับชำระเงินจริงในทันที'
        : 'Use for credit sales or when payment has not been received yet.',
    },
    tax_invoice_receipt: {
      title: isThai ? 'ใบกำกับภาษี/ใบเสร็จ (T01)' : 'Tax Invoice / Receipt (T01)',
      description: isThai
        ? 'ใช้เมื่อขายสดและรับเงินทันทีในเอกสารฉบับเดียว'
        : 'Use when the customer pays immediately and both documents are issued together.',
    },
    receipt: {
      title: isThai ? 'ใบเสร็จรับเงิน (T03)' : 'Receipt (T03)',
      description: isThai
        ? 'ใช้รับชำระเงินจากใบกำกับภาษีเดิม จึงต้องระบุเลขที่เอกสารอ้างอิง'
        : 'Use when recording payment against an earlier tax invoice, so a reference document is required.',
    },
    credit_note: {
      title: isThai ? 'ใบลดหนี้ (T04)' : 'Credit Note (T04)',
      description: isThai
        ? 'ใช้ลดมูลหนี้หรือคืนเงิน โดยต้องอ้างอิงเอกสารเดิมที่ต้องการปรับลด'
        : 'Use to reduce value or issue a refund, with a reference to the original document.',
    },
    debit_note: {
      title: isThai ? 'ใบเพิ่มหนี้ (T05)' : 'Debit Note (T05)',
      description: isThai
        ? 'ใช้เพิ่มมูลหนี้จากเอกสารเดิม และต้องอ้างอิงเลขที่เอกสารต้นทาง'
        : 'Use to add charges to an earlier document and include the original document number.',
    },
  };
  const currentDocType = docTypeDescriptions[docType];

  return (
    <div className="card space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {isThai ? 'ตั้งค่าเอกสาร' : 'Document setup'}
        </p>
        <h2 className="mt-1 text-base font-semibold text-slate-900">
          {currentDocType.title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{currentDocType.description}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="label">
            {isThai ? 'ประเภทเอกสาร' : 'Document Type'}
          </label>
          <select
            value={docType}
            onChange={(e) => onDocTypeChange(e.target.value as InvoiceType)}
            className="input-field"
          >
            <option value="tax_invoice_receipt">
              {isThai ? 'T01 ใบกำกับภาษี/ใบเสร็จ' : 'T01 Tax invoice / receipt'}
            </option>
            <option value="tax_invoice">{isThai ? 'T02 ใบกำกับภาษี' : 'T02 Tax invoice'}</option>
            <option value="receipt">{isThai ? 'T03 ใบเสร็จรับเงิน' : 'T03 Receipt'}</option>
            <option value="credit_note">{isThai ? 'T04 ใบลดหนี้' : 'T04 Credit note'}</option>
            <option value="debit_note">{isThai ? 'T05 ใบเพิ่มหนี้' : 'T05 Debit note'}</option>
          </select>
        </div>
        <div>
          <label className="label">{t('invoice.language.label')}</label>
          <select
            value={docLanguage}
            onChange={(e) => onDocLanguageChange(e.target.value as Language)}
            className="input-field"
          >
            <option value="th">{t('invoice.language.th')}</option>
            <option value="en">{t('invoice.language.en')}</option>
            <option value="both">{t('invoice.language.both')}</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {isThai
              ? 'เลือกภาษาที่ต้องการให้แสดงบน preview/PDF'
              : 'Choose the language that should appear in the preview and PDF.'}
          </p>
        </div>
        <div>
          <label className="label">{t('invoice.date')}</label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => onInvoiceDateChange(e.target.value)}
            className="input-field"
          />
          <p className="mt-1 text-xs text-gray-500">
            {isThai
              ? 'วันที่ออกเอกสารที่จะใช้บนใบกำกับภาษี'
              : 'The issue date printed on the tax document.'}
          </p>
        </div>
        <div>
          <label className="label">{t('invoice.dueDate')}</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
            className="input-field"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {dueDatePresets.map((days) => (
              <button
                key={days}
                type="button"
                disabled={!invoiceDate}
                onClick={() => {
                  const nextDueDate = addCalendarDays(invoiceDate, days);
                  if (nextDueDate) onDueDateChange(nextDueDate);
                }}
                className="min-h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isThai ? `${days} วัน` : `${days} days`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            {isThai
              ? 'นับจากวันที่ออกเอกสารตามจำนวนวันจริงในปฏิทิน หากไม่มีกำหนดชำระให้เว้นว่างได้'
              : 'Counts real calendar days from the issue date. Leave blank if there is no payment due date.'}
          </p>
        </div>
      </div>

      {needsRefDoc && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <label className="label text-amber-800">
            {isThai
              ? '📎 เลขที่เอกสารอ้างอิง (บังคับสำหรับการส่ง RD)'
              : '📎 Reference Document Number (required for RD)'}
          </label>
          <input
            type="text"
            value={referenceDocNumber}
            onChange={(e) => onReferenceDocNumberChange(e.target.value)}
            className="input-field border-amber-300 focus:ring-amber-500"
            placeholder={isThai ? 'เช่น INV-2026XX-000001' : 'e.g. INV-2026XX-000001'}
          />
          <p className="text-xs text-amber-600 mt-1">
            {isThai
              ? 'ระบุเลขที่เอกสารต้นทางที่ต้องการอ้างอิง เช่น ใบกำกับภาษีเดิมที่รับชำระ/ปรับลด/เพิ่มหนี้'
              : 'Enter the original document number this one refers to, such as the earlier tax invoice being paid or adjusted.'}
          </p>
        </div>
      )}
    </div>
  );
}
