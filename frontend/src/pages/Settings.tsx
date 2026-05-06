import { useEffect, useState } from 'react';
import { Landmark, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../hooks/useLanguage';
import { useDocumentProfile } from '../hooks/useDocumentProfile';
import { useAuthStore } from '../store/authStore';
import type { BankAccountProfile } from '../types';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { MascotHelperCard, PageHeader } from '../components/ui/AppChrome';

type BankDraft = Omit<BankAccountProfile, 'id'> & { id?: string };

const emptyBankDraft: BankDraft = {
  label: '',
  bankName: '',
  accountName: '',
  accountNumber: '',
  branch: '',
  promptPayId: '',
  isDefault: false,
};

export default function Settings() {
  const { t } = useTranslation();
  const { isThai } = useLanguage();
  const { token } = useAuthStore();
  const documentProfile = useDocumentProfile({ token });
  const [bankDraft, setBankDraft] = useState<BankDraft>(emptyBankDraft);
  const [signatureDraft, setSignatureDraft] = useState({
    signatureImageUrl: '',
    signerName: '',
    signerTitle: '',
    securityNote: '',
  });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const signature = documentProfile.profile.signatureProfile;
    setSignatureDraft({
      signatureImageUrl: signature?.signatureImageUrl ?? '',
      signerName: signature?.signerName ?? '',
      signerTitle: signature?.signerTitle ?? '',
      securityNote: signature?.securityNote ?? '',
    });
  }, [documentProfile.profile.signatureProfile]);

  const saveBankAccounts = async (accounts: BankDraft[]) => {
    const saved = await documentProfile.saveProfile({ bankAccounts: accounts });
    if (saved) {
      setMessage(isThai ? 'บันทึกบัญชีธนาคารเรียบร้อย' : 'Bank accounts saved.');
      setBankDraft(emptyBankDraft);
    }
  };

  const addBankAccount = async () => {
    const label = bankDraft.label?.trim() || bankDraft.bankName?.trim();
    if (!label || !bankDraft.bankName || !bankDraft.accountName || !bankDraft.accountNumber) return;
    await saveBankAccounts([
      ...documentProfile.profile.bankAccounts,
      {
        ...bankDraft,
        label,
        bankName: bankDraft.bankName.trim(),
        accountName: bankDraft.accountName.trim(),
        accountNumber: bankDraft.accountNumber.trim(),
        branch: bankDraft.branch?.trim() || null,
        promptPayId: bankDraft.promptPayId?.trim() || null,
        isDefault: documentProfile.profile.bankAccounts.length === 0,
      },
    ]);
  };

  const removeBankAccount = async (id: string) => {
    await saveBankAccounts(documentProfile.profile.bankAccounts.filter((account) => account.id !== id));
  };

  const setDefaultBankAccount = async (id: string) => {
    await saveBankAccounts(documentProfile.profile.bankAccounts.map((account) => ({
      ...account,
      isDefault: account.id === id,
    })));
  };

  const handleSignatureFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setSignatureDraft((prev) => ({ ...prev, signatureImageUrl: event.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const saveSignatureProfile = async () => {
    const saved = await documentProfile.saveProfile({
      signatureProfile: {
        signatureImageUrl: signatureDraft.signatureImageUrl || null,
        signerName: signatureDraft.signerName || null,
        signerTitle: signatureDraft.signerTitle || null,
        securityNote: signatureDraft.securityNote || null,
      },
    });
    if (saved) setMessage(isThai ? 'บันทึกโปรไฟล์ลายเซ็นเรียบร้อย' : 'Signature profile saved.');
  };

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow={isThai ? 'Workspace settings' : 'Workspace settings'}
        title={t('settings.title')}
        description={isThai ? 'ตั้งค่าภาษา การแจ้งเตือน บัญชีรับชำระ และลายเซ็นสำหรับเอกสารของบริษัท' : 'Tune language, notifications, payment accounts, and issuer signatures for company documents.'}
        mascot="spot"
      />

      <MascotHelperCard
        title={isThai ? 'Billoy แนะนำ' : 'Billoy tip'}
        description={isThai ? 'บันทึกบัญชีรับชำระและลายเซ็นไว้ที่นี่ แล้วหน้าออกใบกำกับจะให้เลือกใช้อัตโนมัติ ลดความผิดพลาดจากการพิมพ์ซ้ำ' : 'Save payment accounts and signatures here, then invoice creation can reuse them automatically.'}
      />

      {message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {message}
        </div>
      )}
      {documentProfile.error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {documentProfile.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <div className="card space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-emerald-600" />
                <h2 className="font-semibold text-gray-900">{isThai ? 'บัญชีธนาคารสำหรับเอกสาร' : 'Document bank accounts'}</h2>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {isThai ? 'เก็บบัญชีรับชำระไว้เป็นตัวเลือก ไม่ต้องกรอกใหม่บนหน้าออกใบกำกับทุกครั้ง' : 'Store reusable payment accounts instead of typing them on every invoice.'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {documentProfile.profile.bankAccounts.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                {isThai ? 'ยังไม่มีบัญชีธนาคาร เพิ่มบัญชีแรกด้านล่างได้เลย' : 'No bank accounts yet. Add the first one below.'}
              </div>
            )}
            {documentProfile.profile.bankAccounts.map((account) => (
              <div key={account.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{account.label}</h3>
                      {account.isDefault && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          {isThai ? 'ค่าเริ่มต้น' : 'Default'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{account.bankName} - {account.accountNumber}</p>
                    <p className="text-xs text-slate-500">{account.accountName}</p>
                    {(account.branch || account.promptPayId) && (
                      <p className="mt-1 text-xs text-slate-400">
                        {[account.branch ? `${isThai ? 'สาขา' : 'Branch'} ${account.branch}` : null, account.promptPayId ? `PromptPay ${account.promptPayId}` : null].filter(Boolean).join(' / ')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!account.isDefault && (
                      <button type="button" onClick={() => void setDefaultBankAccount(account.id)} className="btn-secondary text-xs">
                        {isThai ? 'ตั้งเป็นหลัก' : 'Make default'}
                      </button>
                    )}
                    <button type="button" onClick={() => void removeBankAccount(account.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-600 hover:bg-rose-100">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">{isThai ? 'ชื่อเรียก' : 'Label'}</label>
                <input className="input-field" value={bankDraft.label ?? ''} onChange={(e) => setBankDraft((prev) => ({ ...prev, label: e.target.value }))} placeholder={isThai ? 'บัญชีหลัก' : 'Main account'} />
              </div>
              <div>
                <label className="label">{isThai ? 'ธนาคาร' : 'Bank'}</label>
                <input className="input-field" value={bankDraft.bankName} onChange={(e) => setBankDraft((prev) => ({ ...prev, bankName: e.target.value }))} placeholder={isThai ? 'ธนาคารไทยพาณิชย์' : 'SCB'} />
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
                <input className="input-field" value={bankDraft.branch ?? ''} onChange={(e) => setBankDraft((prev) => ({ ...prev, branch: e.target.value }))} />
              </div>
              <div>
                <label className="label">PromptPay</label>
                <input className="input-field" value={bankDraft.promptPayId ?? ''} onChange={(e) => setBankDraft((prev) => ({ ...prev, promptPayId: e.target.value }))} />
              </div>
            </div>
            <button type="button" onClick={() => void addBankAccount()} disabled={documentProfile.saving} className="btn-primary mt-4 inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {documentProfile.saving ? (isThai ? 'กำลังบันทึก...' : 'Saving...') : (isThai ? 'เพิ่มบัญชีธนาคาร' : 'Add bank account')}
            </button>
          </div>
        </div>

        <div className="card space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-700" />
              <h2 className="font-semibold text-gray-900">{isThai ? 'โปรไฟล์ลายเซ็นเอกสาร' : 'Document signature profile'}</h2>
            </div>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              {isThai ? 'ใช้เป็นค่าเริ่มต้นบน PDF พร้อมข้อความสร้างความเชื่อมั่นเรื่อง QR, certificate และ audit trail' : 'Used as the default on PDFs with QR, certificate, and audit trail confidence cues.'}
            </p>
          </div>

          <div className="grid gap-3">
            <div>
              <label className="label">{isThai ? 'ชื่อผู้ลงนาม' : 'Signer name'}</label>
              <input className="input-field" value={signatureDraft.signerName} onChange={(e) => setSignatureDraft((prev) => ({ ...prev, signerName: e.target.value }))} />
            </div>
            <div>
              <label className="label">{isThai ? 'ตำแหน่ง' : 'Title'}</label>
              <input className="input-field" value={signatureDraft.signerTitle} onChange={(e) => setSignatureDraft((prev) => ({ ...prev, signerTitle: e.target.value }))} />
            </div>
            <div>
              <label className="label">{isThai ? 'ข้อความความปลอดภัย' : 'Security note'}</label>
              <textarea className="input-field" rows={3} value={signatureDraft.securityNote} onChange={(e) => setSignatureDraft((prev) => ({ ...prev, securityNote: e.target.value }))} placeholder={isThai ? 'เช่น เอกสารนี้ออกผ่านระบบ e-Tax พร้อม QR สำหรับตรวจสอบ' : 'e.g. Issued through e-Tax with QR verification.'} />
            </div>
            <div>
              <label className="label">{isThai ? 'ไฟล์ลายเซ็น' : 'Signature image'}</label>
              <input type="file" accept="image/*" onChange={handleSignatureFile} className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100" />
              {signatureDraft.signatureImageUrl && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <img src={signatureDraft.signatureImageUrl} alt="signature preview" className="h-20 object-contain" />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs leading-5 text-indigo-900">
            {isThai ? 'หมายเหตุ: ลายเซ็นภาพใช้แสดงตัวตนผู้จัดทำบนเอกสาร ส่วนการลงนามดิจิทัล/XAdES และ RD audit trail อยู่ในขั้นตอน backend ตอนออกเอกสารจริง' : 'Note: the image signature identifies the issuer on the document. Digital signing/XAdES and RD audit trails are handled by the backend when issuing.'}
          </div>

          <button type="button" onClick={() => void saveSignatureProfile()} disabled={documentProfile.saving} className="btn-primary inline-flex items-center gap-2">
            <Save className="h-4 w-4" />
            {documentProfile.saving ? (isThai ? 'กำลังบันทึก...' : 'Saving...') : (isThai ? 'บันทึกโปรไฟล์ลายเซ็น' : 'Save signature profile')}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold text-gray-900">{t('settings.language')}</h2>
        <p className="mb-4 text-sm text-gray-500">{t('settings.languageDesc')}</p>
        <div className="flex items-center gap-4">
          <LanguageSwitcher variant="toggle" />
          <span className="text-sm text-gray-500">
            {isThai ? 'ภาษาปัจจุบัน: ภาษาไทย' : 'Current language: English'}
          </span>
        </div>
      </div>
    </div>
  );
}
