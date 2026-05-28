import { useState } from 'react';
import { Building2, CheckCircle2, Landmark, LockKeyhole, Plus, ShieldCheck, X } from 'lucide-react';
import type { BankAccountProfile, InvoiceType } from '../../types';
import { useLanguage } from '../../hooks/useLanguage';

interface Props {
  documentMode: 'ordinary' | 'electronic';
  onDocumentModeChange: (value: 'ordinary' | 'electronic') => void;
  canUseElectronicMode: boolean;
  onBankPaymentInfoChange: (value: string) => void;
  bankAccounts: BankAccountProfile[];
  selectedBankAccountId: string;
  onBankAccountSelect: (id: string) => void;
  onAddBankAccount: (account: Omit<BankAccountProfile, 'id'>) => Promise<void>;
  bankProfileSaving: boolean;
  bankProfileError: string | null;
  showCompanyLogo: boolean;
  hasCompanyLogo: boolean;
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
  canUseElectronicMode,
  onBankPaymentInfoChange,
  bankAccounts,
  selectedBankAccountId,
  onBankAccountSelect,
  onAddBankAccount,
  bankProfileSaving,
  bankProfileError,
  showCompanyLogo,
  hasCompanyLogo,
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
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankDraft, setBankDraft] = useState({
    label: '',
    bankName: '',
    accountName: '',
    accountNumber: '',
    branch: '',
    promptPayId: '',
  });

  const selectedBank = bankAccounts.find((account) => account.id === selectedBankAccountId) ?? null;

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

  const handleSaveBank = async () => {
    const label = bankDraft.label.trim() || bankDraft.bankName.trim();
    if (!label || !bankDraft.bankName.trim() || !bankDraft.accountName.trim() || !bankDraft.accountNumber.trim()) return;
    await onAddBankAccount({
      label,
      bankName: bankDraft.bankName.trim(),
      accountName: bankDraft.accountName.trim(),
      accountNumber: bankDraft.accountNumber.trim(),
      branch: bankDraft.branch.trim() || null,
      promptPayId: bankDraft.promptPayId.trim() || null,
      isDefault: bankAccounts.length === 0,
    });
    setBankDraft({ label: '', bankName: '', accountName: '', accountNumber: '', branch: '', promptPayId: '' });
    setShowBankModal(false);
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {isThai ? 'ตัวเลือกท้ายเอกสาร' : 'Document options'}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {isThai
              ? 'ส่วนนี้ดึงค่ามาตรฐานจาก Settings ไว้แล้ว แก้เฉพาะกรณีที่เอกสารฉบับนี้ต้องใช้รูปแบบ บัญชี หรือผู้ลงนามต่างจากปกติ'
              : 'Defaults are loaded from Settings. Adjust this only when this document needs a different mode, payment account, or signer.'}
          </p>
        </div>
      </div>

      <div className={canUseElectronicMode ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
        <button
          type="button"
          onClick={() => onDocumentModeChange('ordinary')}
          className={`rounded-xl border p-4 text-left transition ${
            documentMode === 'ordinary' || !canUseElectronicMode
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
        {canUseElectronicMode && (
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
        )}
      </div>

      {hasCompanyLogo && (
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
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-emerald-600" />
              <h4 className="text-sm font-semibold text-slate-900">
                {isThai ? 'บัญชีรับชำระบนเอกสาร' : 'Payment account'}
              </h4>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {isThai
                ? 'เลือกจากบัญชีที่บันทึกไว้ใน Settings เพื่อให้ข้อมูลท้าย PDF ตรงกันทุกฉบับ'
                : 'Select a saved account from Settings so every PDF uses consistent payment details.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowBankModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
          >
            <Plus className="h-3.5 w-3.5" />
            {isThai ? 'เพิ่มบัญชี' : 'Add account'}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <select
            value={selectedBankAccountId}
            onChange={(e) => {
              const id = e.target.value;
              onBankAccountSelect(id);
              if (!id) onBankPaymentInfoChange('');
            }}
            className="input-field"
          >
            <option value="">{isThai ? 'ไม่แสดงบัญชีธนาคารในเอกสารนี้' : 'Do not show a bank account on this document'}</option>
            {bankAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label} - {account.bankName} - {account.accountNumber}
              </option>
            ))}
          </select>
          {selectedBank && (
            <span className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isThai ? 'พร้อมใช้' : 'Ready'}
            </span>
          )}
        </div>

        {selectedBank ? (
          <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-xs leading-5 text-slate-700">
            <div className="font-semibold text-slate-900">{selectedBank.accountName}</div>
            <div>{selectedBank.bankName} - {selectedBank.accountNumber}</div>
            {selectedBank.branch && <div>{isThai ? 'สาขา' : 'Branch'}: {selectedBank.branch}</div>}
            {selectedBank.promptPayId && <div>PromptPay: {selectedBank.promptPayId}</div>}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
            {bankAccounts.length === 0
              ? (isThai ? 'ยังไม่มีบัญชีธนาคารที่บันทึกไว้ เพิ่มบัญชีแรกได้จากปุ่มด้านบนหรือหน้า Settings' : 'No saved bank accounts yet. Add the first one here or in Settings.')
              : (isThai ? 'เอกสารนี้จะไม่แสดงข้อมูลโอนเงินท้าย PDF' : 'This document will not show bank transfer details in the PDF.')}
          </div>
        )}
        {bankProfileError && <p className="mt-2 text-xs text-rose-600">{bankProfileError}</p>}
      </div>

      <div>
        <label className="label">
          {isThai ? 'โลโก้/ตราเฉพาะเอกสาร (ไม่บังคับ)' : 'Document mark or badge (optional)'}
        </label>
        <label className="flex items-center gap-4 cursor-pointer">
          <span className="flex-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 cursor-pointer">
            {isThai ? 'เลือกไฟล์ภาพ' : 'Choose image'}
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="sr-only"
          />
          {documentLogoUrl && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDocumentLogoChange(null); }}
              className="rounded px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 hover:text-red-700"
            >
              x
            </button>
          )}
        </label>
        {documentLogoUrl && (
          <img src={documentLogoUrl} alt="document mark preview" className="mt-3 h-16 object-contain" />
        )}
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-700" />
            <h4 className="text-sm font-semibold text-slate-900">
              {canUseElectronicMode
                ? (isThai ? 'ลายเซ็นผู้จัดทำที่ตรวจสอบได้' : 'Trusted issuer signature')
                : (isThai ? 'ผู้ลงนามบนเอกสาร' : 'Document signer')}
            </h4>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {canUseElectronicMode
              ? (isThai
                  ? 'ใช้แสดงผู้จัดทำบน PDF พร้อมโหมด e-Tax/QR ตรวจสอบเอกสาร ระบบยังคงใช้ certificate และ audit trail ฝั่ง backend ตอนออกเอกสารจริง'
                  : 'Shown on PDFs with e-Tax/QR verification. The backend still handles certificate signing and audit trails for issued documents.')
              : (isThai
                  ? 'ใส่ชื่อ ตำแหน่ง และภาพลายเซ็นสำหรับแสดงท้ายเอกสาร PDF'
                  : 'Add a name, title, and signature image for the PDF footer.')}
          </p>
        </div>
        {canUseElectronicMode && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {(isThai
              ? ['ล็อกกับบริษัทนี้', 'มี QR ตรวจสอบ', 'บันทึก audit trail']
              : ['Company scoped', 'QR verifiable', 'Audit logged']
            ).map((label) => (
              <div key={label} className="flex items-center gap-2 rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-xs font-medium text-slate-700">
                <LockKeyhole className="h-3.5 w-3.5 text-indigo-600" />
                {label}
              </div>
            ))}
          </div>
        )}
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
        <label className="flex items-center gap-4 cursor-pointer">
            <span className="flex-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 cursor-pointer">
              {isThai ? 'เลือกไฟล์ภาพลายเซ็น' : 'Choose signature image'}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={handleSignatureFileChange}
              className="sr-only"
            />
            {signatureImageUrl && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSignatureImageChange(null); }}
                className="rounded px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 hover:text-red-700"
              >
                x
              </button>
            )}
          </label>
        {signatureImageUrl && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 px-4 py-3">
            <img src={signatureImageUrl} alt="signature preview" className="h-16 object-contain" />
          </div>
        )}
      </div>

      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/70 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {isThai ? 'เพิ่มบัญชีธนาคาร' : 'Add bank account'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {isThai ? 'บันทึกไว้เป็นตัวเลือกสำหรับเอกสารครั้งต่อไป' : 'Save it as a reusable option for future documents.'}
                </p>
              </div>
              <button type="button" onClick={() => setShowBankModal(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">{isThai ? 'ชื่อเรียก' : 'Label'}</label>
                <input className="input-field" value={bankDraft.label} onChange={(e) => setBankDraft((prev) => ({ ...prev, label: e.target.value }))} placeholder={isThai ? 'บัญชีหลัก' : 'Main account'} />
              </div>
              <div>
                <label className="label">{isThai ? 'ธนาคาร' : 'Bank'}</label>
                <input className="input-field" value={bankDraft.bankName} onChange={(e) => setBankDraft((prev) => ({ ...prev, bankName: e.target.value }))} placeholder={isThai ? 'ธนาคารกสิกรไทย' : 'Kasikorn Bank'} />
              </div>
              <div>
                <label className="label">{isThai ? 'ชื่อบัญชี' : 'Account name'}</label>
                <input className="input-field" value={bankDraft.accountName} onChange={(e) => setBankDraft((prev) => ({ ...prev, accountName: e.target.value }))} />
              </div>
              <div>
                <label className="label">{isThai ? 'เลขที่บัญชี' : 'Account number'}</label>
                <input className="input-field" value={bankDraft.accountNumber} onChange={(e) => setBankDraft((prev) => ({ ...prev, accountNumber: e.target.value }))} />
              </div>
              <div>
                <label className="label">{isThai ? 'สาขา' : 'Branch'}</label>
                <input className="input-field" value={bankDraft.branch} onChange={(e) => setBankDraft((prev) => ({ ...prev, branch: e.target.value }))} />
              </div>
              <div>
                <label className="label">PromptPay</label>
                <input className="input-field" value={bankDraft.promptPayId} onChange={(e) => setBankDraft((prev) => ({ ...prev, promptPayId: e.target.value }))} />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowBankModal(false)} className="btn-secondary">
                {isThai ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button type="button" onClick={handleSaveBank} disabled={bankProfileSaving} className="btn-primary">
                {bankProfileSaving ? (isThai ? 'กำลังบันทึก...' : 'Saving...') : (isThai ? 'บันทึกบัญชี' : 'Save account')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
