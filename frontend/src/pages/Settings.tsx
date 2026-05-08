import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  FileCheck2,
  FileText,
  Globe2,
  Landmark,
  Languages,
  Link2,
  MessageCircle,
  ReceiptText,
  Save,
  ShieldCheck,
  Trash2,
  Unlink2,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../hooks/useLanguage';
import { useDocumentProfile } from '../hooks/useDocumentProfile';
import { useAuthStore } from '../store/authStore';
import type { BankAccountProfile, InvoiceType, Language } from '../types';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { MascotHelperCard, PageHeader } from '../components/ui/AppChrome';

type BankDraft = Omit<BankAccountProfile, 'id'> & { id?: string };

interface CompanyDraft {
  nameTh: string;
  nameEn: string;
  taxId: string;
  branchCode: string;
  branchNameTh: string;
  branchNameEn: string;
  addressTh: string;
  addressEn: string;
  phone: string;
  email: string;
  website: string;
}

interface AdminCompanyProfile extends CompanyDraft {
  id: string;
  logoUrl?: string | null;
  rdEnvironment?: string;
  lineNotifyEnabled?: boolean;
  overdueReminderDays?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface InvoicePreferences {
  defaultDocType: InvoiceType;
  defaultLanguage: Language;
  defaultDocumentMode: 'ordinary' | 'electronic';
  defaultPaymentMethod: string;
  defaultShowCompanyLogo: boolean;
  defaultWhtRate: string;
}

interface IntegrationStatus {
  lineAi?: { connected: boolean; displayName?: string | null; notificationsEnabled?: boolean };
  googleAccount?: { connected: boolean; email?: string | null };
  googleSheets?: { connected: boolean; mode?: string };
  googleDrive?: { connected: boolean; mode?: string };
}

interface DriveStatus {
  configured: boolean;
  connected: boolean;
  linkedAt?: string | null;
}

interface LineStatus {
  linked: boolean;
  displayName?: string;
  lineNotifyEnabled: boolean;
  overdueReminderDays: 1 | 3 | 7;
}

interface RdConfigStatus {
  environment?: string;
  clientId?: string | null;
  hasSecret?: boolean;
  certStatus?: {
    loaded?: boolean;
    isExpired?: boolean;
    isDev?: boolean;
    commonName?: string;
    validUntil?: string;
    error?: string;
  };
}

interface ExpenseSettings {
  expenseLimit: number | null;
}

const PREFERENCES_STORAGE_KEY = 'etax_invoice_preferences';

const emptyBankDraft: BankDraft = {
  label: '',
  bankName: '',
  accountName: '',
  accountNumber: '',
  branch: '',
  promptPayId: '',
  isDefault: false,
};

const emptyCompanyDraft: CompanyDraft = {
  nameTh: '',
  nameEn: '',
  taxId: '',
  branchCode: '00000',
  branchNameTh: '',
  branchNameEn: '',
  addressTh: '',
  addressEn: '',
  phone: '',
  email: '',
  website: '',
};

const defaultPreferences: InvoicePreferences = {
  defaultDocType: 'tax_invoice',
  defaultLanguage: 'th',
  defaultDocumentMode: 'electronic',
  defaultPaymentMethod: '',
  defaultShowCompanyLogo: true,
  defaultWhtRate: '',
};

function cleanCompanyPayload(draft: CompanyDraft) {
  return {
    nameTh: draft.nameTh.trim(),
    nameEn: draft.nameEn.trim() || undefined,
    taxId: draft.taxId.trim(),
    branchCode: draft.branchCode.trim() || '00000',
    branchNameTh: draft.branchNameTh.trim() || undefined,
    branchNameEn: draft.branchNameEn.trim() || undefined,
    addressTh: draft.addressTh.trim(),
    addressEn: draft.addressEn.trim() || undefined,
    phone: draft.phone.trim() || undefined,
    email: draft.email.trim() || undefined,
    website: draft.website.trim() || undefined,
  };
}

function readInvoicePreferences(): InvoicePreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    return raw ? { ...defaultPreferences, ...JSON.parse(raw) } : defaultPreferences;
  } catch {
    return defaultPreferences;
  }
}

function statusTone(ok?: boolean) {
  return ok
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-slate-200 bg-slate-50 text-slate-600';
}

function SettingsCard({
  id,
  icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-24 space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function StatusPill({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(ok)}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const { isThai } = useLanguage();
  const { token, user } = useAuthStore();
  const documentProfile = useDocumentProfile({ token });
  const [bankDraft, setBankDraft] = useState<BankDraft>(emptyBankDraft);
  const [companyDraft, setCompanyDraft] = useState<CompanyDraft>(emptyCompanyDraft);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [signatureDraft, setSignatureDraft] = useState({
    signatureImageUrl: '',
    signerName: '',
    signerTitle: '',
    securityNote: '',
  });
  const [preferences, setPreferences] = useState<InvoicePreferences>(() => readInvoicePreferences());
  const [expenseSettings, setExpenseSettings] = useState<ExpenseSettings>({ expenseLimit: null });
  const [expenseLimitDraft, setExpenseLimitDraft] = useState('');
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [lineStatus, setLineStatus] = useState<LineStatus | null>(null);
  const [lineOtp, setLineOtp] = useState<string | null>(null);
  const [lineOtpCopied, setLineOtpCopied] = useState(false);
  const [rdStatus, setRdStatus] = useState<RdConfigStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
  }), [token]);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const loadSettings = useCallback(async () => {
    if (!token) return;
    setError(null);
    setCompanyLoading(true);
    try {
      const [companyRes, expenseRes, integrationRes, driveRes, lineRes] = await Promise.allSettled([
        fetch('/api/admin/company', { headers: authHeaders }),
        fetch('/api/expenses/settings', { headers: authHeaders }),
        fetch('/api/dashboard/integration-status', { headers: authHeaders }),
        fetch('/api/drive/status', { headers: authHeaders }),
        fetch('/api/line/status', { headers: authHeaders }),
      ]);

      if (companyRes.status === 'fulfilled' && companyRes.value.ok) {
        const json = await companyRes.value.json() as { data: AdminCompanyProfile };
        setCompanyDraft({
          nameTh: json.data.nameTh ?? '',
          nameEn: json.data.nameEn ?? '',
          taxId: json.data.taxId ?? '',
          branchCode: json.data.branchCode ?? '00000',
          branchNameTh: json.data.branchNameTh ?? '',
          branchNameEn: json.data.branchNameEn ?? '',
          addressTh: json.data.addressTh ?? '',
          addressEn: json.data.addressEn ?? '',
          phone: json.data.phone ?? '',
          email: json.data.email ?? '',
          website: json.data.website ?? '',
        });
      }

      if (expenseRes.status === 'fulfilled' && expenseRes.value.ok) {
        const json = await expenseRes.value.json() as { data: ExpenseSettings };
        setExpenseSettings(json.data);
        setExpenseLimitDraft(json.data.expenseLimit == null ? '' : String(json.data.expenseLimit));
      }

      if (integrationRes.status === 'fulfilled' && integrationRes.value.ok) {
        const json = await integrationRes.value.json() as { data: IntegrationStatus };
        setIntegrationStatus(json.data);
      }

      if (driveRes.status === 'fulfilled' && driveRes.value.ok) {
        const json = await driveRes.value.json() as { data: DriveStatus };
        setDriveStatus(json.data);
      }

      if (lineRes.status === 'fulfilled' && lineRes.value.ok) {
        const json = await lineRes.value.json() as { data: LineStatus };
        setLineStatus(json.data);
      }

      setRdStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setCompanyLoading(false);
    }
  }, [authHeaders, token]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const signature = documentProfile.profile.signatureProfile;
    setSignatureDraft({
      signatureImageUrl: signature?.signatureImageUrl ?? '',
      signerName: signature?.signerName ?? '',
      signerTitle: signature?.signerTitle ?? '',
      securityNote: signature?.securityNote ?? '',
    });
  }, [documentProfile.profile.signatureProfile]);

  const saveCompany = async () => {
    if (!token) return;
    setCompanySaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/company', {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanCompanyPayload(companyDraft)),
      });
      const json = await res.json() as { data?: AdminCompanyProfile; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to save company');
      setMessage(isThai ? 'บันทึกข้อมูลบริษัทเรียบร้อย' : 'Company profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save company');
    } finally {
      setCompanySaving(false);
    }
  };

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

  const handleSignatureFile = (e: ChangeEvent<HTMLInputElement>) => {
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

  const savePreferences = () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    setMessage(isThai ? 'บันทึกค่าเริ่มต้นการออกเอกสารแล้ว' : 'Invoice defaults saved.');
  };

  const saveExpenseSettings = async () => {
    if (!token) return;
    const expenseLimit = expenseLimitDraft.trim() ? Number(expenseLimitDraft) : null;
    const res = await fetch('/api/expenses/settings', {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expenseLimit }),
    });
    const json = await res.json() as { data?: ExpenseSettings; error?: string };
    if (!res.ok) {
      setError(json.error ?? 'Failed to save expense settings');
      return;
    }
    setExpenseSettings(json.data ?? { expenseLimit });
    setMessage(isThai ? 'บันทึกวงเงินเงินสดย่อยเรียบร้อย' : 'Expense limit saved.');
  };

  const saveLineSettings = async () => {
    if (!token || !lineStatus) return;
    const res = await fetch('/api/line/settings', {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineNotifyEnabled: lineStatus.lineNotifyEnabled,
        overdueReminderDays: lineStatus.overdueReminderDays,
      }),
    });
    const json = await res.json() as { error?: string };
    if (!res.ok) {
      setError(json.error ?? 'Failed to save LINE settings');
      return;
    }
    setMessage(isThai ? 'บันทึกการแจ้งเตือน LINE แล้ว' : 'LINE settings saved.');
  };

  const handleLineSelfLink = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/line/link-start', {
        method: 'POST',
        headers: authHeaders,
      });
      const json = await res.json() as { data?: { otp: string }; error?: string };
      if (!res.ok || !json.data?.otp) {
        setError(json.error ?? (isThai ? 'สร้างรหัสเชื่อมต่อไม่สำเร็จ' : 'Failed to generate link code'));
        return;
      }
      setLineOtp(json.data.otp);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleLineUnlink = async () => {
    if (!token) return;
    try {
      await fetch('/api/line/unlink', { method: 'DELETE', headers: authHeaders });
      setLineStatus(prev => prev ? { ...prev, linked: false, displayName: undefined } : prev);
      setLineOtp(null);
      setMessage(isThai ? 'ถอดการเชื่อมต่อ LINE แล้ว' : 'LINE account unlinked.');
    } catch {
      setError(isThai ? 'ถอดการเชื่อมต่อไม่สำเร็จ' : 'Failed to unlink');
    }
  };

  const copyLineOtp = () => {
    if (!lineOtp) return;
    navigator.clipboard.writeText(lineOtp).then(() => {
      setLineOtpCopied(true);
      setTimeout(() => setLineOtpCopied(false), 2000);
    });
  };

  const connectDrive = async () => {
    if (!token) return;
    const res = await fetch('/api/drive/connect', { headers: authHeaders });
    const json = await res.json() as { data?: { url: string }; error?: string };
    if (!res.ok || !json.data?.url) {
      setError(json.error ?? 'Google Drive is not configured');
      return;
    }
    window.location.href = json.data.url;
  };

  const sections = [
    ['company', isThai ? 'บริษัท' : 'Company'],
    ['documents', isThai ? 'เอกสาร' : 'Documents'],
    ['invoice-defaults', isThai ? 'ค่าเริ่มต้น' : 'Defaults'],
    ['tax', isThai ? 'e-Tax/RD' : 'e-Tax/RD'],
    ['integrations', isThai ? 'เชื่อมต่อ' : 'Integrations'],
    ['expense', isThai ? 'เงินสดย่อย' : 'Petty cash'],
    ['language', isThai ? 'ภาษา' : 'Language'],
  ];

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        eyebrow={isThai ? 'Workspace settings' : 'Workspace settings'}
        title={t('settings.title')}
        description={isThai ? 'ตั้งค่าบริษัท เอกสาร e-Tax การเชื่อมต่อ และค่าเริ่มต้นที่ใช้ซ้ำในงานประจำวัน' : 'Manage company, document, e-Tax, integration, and workflow defaults in one place.'}
        mascot="spot"
      />

      <MascotHelperCard
        title={isThai ? 'ตั้งค่าครั้งเดียว ใช้ซ้ำทุกเอกสาร' : 'Set once, reuse everywhere'}
        description={isThai ? 'ข้อมูลผู้ขาย บัญชีรับชำระ ลายเซ็น และค่าเริ่มต้นในหน้านี้จะช่วยลดการกรอกซ้ำตอนออกใบกำกับภาษี' : 'Seller details, payment accounts, signatures, and defaults here reduce repeated typing during invoice issuance.'}
      />

      {(message || error || documentProfile.error) && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
          error || documentProfile.error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}>
          {error || documentProfile.error || message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            {sections.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900">
                {label}
              </a>
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          <SettingsCard
            id="company"
            icon={<Building2 className="h-5 w-5" />}
            title={isThai ? 'ข้อมูลบริษัทและผู้ขาย' : 'Company and seller profile'}
            description={isThai ? 'ข้อมูลนี้ถูกใช้เป็นผู้ขายบนเอกสารและใช้ตรวจสอบความพร้อมด้านภาษี' : 'Used as the seller snapshot on tax documents and readiness checks.'}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">{isThai ? 'ชื่อบริษัทภาษาไทย *' : 'Thai company name *'}</label>
                <input className="input-field" value={companyDraft.nameTh} onChange={(e) => setCompanyDraft((prev) => ({ ...prev, nameTh: e.target.value }))} disabled={!isAdmin || companyLoading} />
              </div>
              <div>
                <label className="label">{isThai ? 'ชื่อบริษัทภาษาอังกฤษ' : 'English company name'}</label>
                <input className="input-field" value={companyDraft.nameEn} onChange={(e) => setCompanyDraft((prev) => ({ ...prev, nameEn: e.target.value }))} disabled={!isAdmin || companyLoading} />
              </div>
              <div>
                <label className="label">{isThai ? 'เลขประจำตัวผู้เสียภาษี *' : 'Tax ID *'}</label>
                <input className="input-field font-mono" maxLength={13} value={companyDraft.taxId} onChange={(e) => setCompanyDraft((prev) => ({ ...prev, taxId: e.target.value.replace(/\D/g, '') }))} disabled={!isAdmin || companyLoading} />
              </div>
              <div>
                <label className="label">{isThai ? 'รหัสสาขา' : 'Branch code'}</label>
                <input className="input-field font-mono" maxLength={5} value={companyDraft.branchCode} onChange={(e) => setCompanyDraft((prev) => ({ ...prev, branchCode: e.target.value.replace(/\D/g, '') }))} disabled={!isAdmin || companyLoading} />
              </div>
              <div>
                <label className="label">{isThai ? 'ชื่อสาขาภาษาไทย' : 'Thai branch name'}</label>
                <input className="input-field" value={companyDraft.branchNameTh} onChange={(e) => setCompanyDraft((prev) => ({ ...prev, branchNameTh: e.target.value }))} disabled={!isAdmin || companyLoading} />
              </div>
              <div>
                <label className="label">{isThai ? 'ชื่อสาขาภาษาอังกฤษ' : 'English branch name'}</label>
                <input className="input-field" value={companyDraft.branchNameEn} onChange={(e) => setCompanyDraft((prev) => ({ ...prev, branchNameEn: e.target.value }))} disabled={!isAdmin || companyLoading} />
              </div>
              <div>
                <label className="label">{isThai ? 'โทรศัพท์' : 'Phone'}</label>
                <input className="input-field" value={companyDraft.phone} onChange={(e) => setCompanyDraft((prev) => ({ ...prev, phone: e.target.value }))} disabled={!isAdmin || companyLoading} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input-field" value={companyDraft.email} onChange={(e) => setCompanyDraft((prev) => ({ ...prev, email: e.target.value }))} disabled={!isAdmin || companyLoading} />
              </div>
              <div className="md:col-span-2">
                <label className="label">{isThai ? 'เว็บไซต์' : 'Website'}</label>
                <input className="input-field" value={companyDraft.website} onChange={(e) => setCompanyDraft((prev) => ({ ...prev, website: e.target.value }))} disabled={!isAdmin || companyLoading} />
              </div>
              <div>
                <label className="label">{isThai ? 'ที่อยู่ภาษาไทย *' : 'Thai address *'}</label>
                <textarea className="input-field" rows={3} value={companyDraft.addressTh} onChange={(e) => setCompanyDraft((prev) => ({ ...prev, addressTh: e.target.value }))} disabled={!isAdmin || companyLoading} />
              </div>
              <div>
                <label className="label">{isThai ? 'ที่อยู่ภาษาอังกฤษ' : 'English address'}</label>
                <textarea className="input-field" rows={3} value={companyDraft.addressEn} onChange={(e) => setCompanyDraft((prev) => ({ ...prev, addressEn: e.target.value }))} disabled={!isAdmin || companyLoading} />
              </div>
            </div>
            <button type="button" onClick={() => void saveCompany()} disabled={!isAdmin || companySaving} className="btn-primary inline-flex items-center gap-2">
              <Save className="h-4 w-4" />
              {companySaving ? (isThai ? 'กำลังบันทึก...' : 'Saving...') : (isThai ? 'บันทึกข้อมูลบริษัท' : 'Save company profile')}
            </button>
          </SettingsCard>

          <SettingsCard
            id="documents"
            icon={<FileText className="h-5 w-5" />}
            title={isThai ? 'ข้อมูลบนเอกสาร PDF' : 'PDF document details'}
            description={isThai ? 'บัญชีรับชำระและลายเซ็นจะถูกดึงไปใช้ในหน้าออกเอกสารโดยอัตโนมัติ' : 'Payment accounts and signatures are reused automatically when issuing documents.'}
          >
            <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-emerald-600" />
                  <h3 className="font-semibold text-slate-900">{isThai ? 'บัญชีรับชำระ' : 'Payment accounts'}</h3>
                </div>
                {documentProfile.profile.bankAccounts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    {isThai ? 'ยังไม่มีบัญชีธนาคาร เพิ่มบัญชีแรกด้านล่างได้เลย' : 'No bank accounts yet. Add the first one below.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documentProfile.profile.bankAccounts.map((account) => (
                      <div key={account.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-semibold text-slate-900">{account.label}</h4>
                              {account.isDefault && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{isThai ? 'ค่าเริ่มต้น' : 'Default'}</span>}
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
                )}

                <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input className="input-field" value={bankDraft.label ?? ''} onChange={(e) => setBankDraft((prev) => ({ ...prev, label: e.target.value }))} placeholder={isThai ? 'ชื่อเรียก เช่น บัญชีหลัก' : 'Label, e.g. Main account'} />
                    <input className="input-field" value={bankDraft.bankName} onChange={(e) => setBankDraft((prev) => ({ ...prev, bankName: e.target.value }))} placeholder={isThai ? 'ธนาคาร' : 'Bank'} />
                    <input className="input-field" value={bankDraft.accountName} onChange={(e) => setBankDraft((prev) => ({ ...prev, accountName: e.target.value }))} placeholder={isThai ? 'ชื่อบัญชี' : 'Account name'} />
                    <input className="input-field" value={bankDraft.accountNumber} onChange={(e) => setBankDraft((prev) => ({ ...prev, accountNumber: e.target.value }))} placeholder={isThai ? 'เลขที่บัญชี' : 'Account number'} />
                    <input className="input-field" value={bankDraft.branch ?? ''} onChange={(e) => setBankDraft((prev) => ({ ...prev, branch: e.target.value }))} placeholder={isThai ? 'สาขา' : 'Branch'} />
                    <input className="input-field" value={bankDraft.promptPayId ?? ''} onChange={(e) => setBankDraft((prev) => ({ ...prev, promptPayId: e.target.value }))} placeholder="PromptPay" />
                  </div>
                  <button type="button" onClick={() => void addBankAccount()} disabled={documentProfile.saving} className="btn-primary mt-4 inline-flex items-center gap-2">
                    <Landmark className="h-4 w-4" />
                    {documentProfile.saving ? (isThai ? 'กำลังบันทึก...' : 'Saving...') : (isThai ? 'เพิ่มบัญชีธนาคาร' : 'Add bank account')}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-indigo-700" />
                  <h3 className="font-semibold text-slate-900">{isThai ? 'ลายเซ็นและข้อความความน่าเชื่อถือ' : 'Signature and trust note'}</h3>
                </div>
                <input className="input-field" value={signatureDraft.signerName} onChange={(e) => setSignatureDraft((prev) => ({ ...prev, signerName: e.target.value }))} placeholder={isThai ? 'ชื่อผู้ลงนาม' : 'Signer name'} />
                <input className="input-field" value={signatureDraft.signerTitle} onChange={(e) => setSignatureDraft((prev) => ({ ...prev, signerTitle: e.target.value }))} placeholder={isThai ? 'ตำแหน่ง' : 'Title'} />
                <textarea className="input-field" rows={3} value={signatureDraft.securityNote} onChange={(e) => setSignatureDraft((prev) => ({ ...prev, securityNote: e.target.value }))} placeholder={isThai ? 'ข้อความท้ายเอกสาร เช่น ตรวจสอบเอกสารผ่าน QR ได้' : 'Security note shown on documents'} />
                <input type="file" accept="image/*" onChange={handleSignatureFile} className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100" />
                {signatureDraft.signatureImageUrl && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <img src={signatureDraft.signatureImageUrl} alt="signature preview" className="h-20 object-contain" />
                  </div>
                )}
                <button type="button" onClick={() => void saveSignatureProfile()} disabled={documentProfile.saving} className="btn-primary inline-flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  {isThai ? 'บันทึกลายเซ็น' : 'Save signature'}
                </button>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard
            id="invoice-defaults"
            icon={<ReceiptText className="h-5 w-5" />}
            title={isThai ? 'ค่าเริ่มต้นการออกเอกสาร' : 'Invoice creation defaults'}
            description={isThai ? 'ค่าเหล่านี้จะถูกใช้เมื่อเปิดหน้าออกเอกสารใหม่ ลดการเลือกซ้ำในทุกใบ' : 'Used when opening a new invoice, reducing repeated selections.'}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="label">{isThai ? 'ประเภทเอกสารเริ่มต้น' : 'Default document type'}</label>
                <select className="input-field" value={preferences.defaultDocType} onChange={(e) => setPreferences((prev) => ({ ...prev, defaultDocType: e.target.value as InvoiceType }))}>
                  <option value="tax_invoice">{isThai ? 'ใบกำกับภาษี (T02)' : 'Tax invoice (T02)'}</option>
                  <option value="tax_invoice_receipt">{isThai ? 'ใบกำกับภาษี/ใบเสร็จ (T01)' : 'Tax invoice/receipt (T01)'}</option>
                  <option value="receipt">{isThai ? 'ใบเสร็จรับเงิน (T03)' : 'Receipt (T03)'}</option>
                  <option value="credit_note">{isThai ? 'ใบลดหนี้ (T04)' : 'Credit note (T04)'}</option>
                  <option value="debit_note">{isThai ? 'ใบเพิ่มหนี้ (T05)' : 'Debit note (T05)'}</option>
                </select>
              </div>
              <div>
                <label className="label">{isThai ? 'ภาษาเริ่มต้น' : 'Default language'}</label>
                <select className="input-field" value={preferences.defaultLanguage} onChange={(e) => setPreferences((prev) => ({ ...prev, defaultLanguage: e.target.value as Language }))}>
                  <option value="th">{isThai ? 'ภาษาไทย' : 'Thai'}</option>
                  <option value="en">{isThai ? 'ภาษาอังกฤษ' : 'English'}</option>
                  <option value="both">{isThai ? 'สองภาษา' : 'Bilingual'}</option>
                </select>
              </div>
              <div>
                <label className="label">{isThai ? 'โหมดเอกสาร' : 'Document mode'}</label>
                <select className="input-field" value={preferences.defaultDocumentMode} onChange={(e) => setPreferences((prev) => ({ ...prev, defaultDocumentMode: e.target.value as 'ordinary' | 'electronic' }))}>
                  <option value="electronic">Electronic / e-Tax</option>
                  <option value="ordinary">{isThai ? 'เอกสารธรรมดา' : 'Ordinary'}</option>
                </select>
              </div>
              <div>
                <label className="label">{isThai ? 'วิธีชำระเงิน' : 'Payment method'}</label>
                <select className="input-field" value={preferences.defaultPaymentMethod} onChange={(e) => setPreferences((prev) => ({ ...prev, defaultPaymentMethod: e.target.value }))}>
                  <option value="">{isThai ? 'ไม่ระบุ' : 'Not specified'}</option>
                  <option value="cash">{isThai ? 'เงินสด' : 'Cash'}</option>
                  <option value="transfer">{isThai ? 'โอนเงิน' : 'Bank transfer'}</option>
                  <option value="cheque">{isThai ? 'เช็ค' : 'Cheque'}</option>
                  <option value="credit_card">{isThai ? 'บัตรเครดิต' : 'Credit card'}</option>
                </select>
              </div>
              <div>
                <label className="label">{isThai ? 'ภาษีหัก ณ ที่จ่ายเริ่มต้น' : 'Default WHT'}</label>
                <select className="input-field" value={preferences.defaultWhtRate} onChange={(e) => setPreferences((prev) => ({ ...prev, defaultWhtRate: e.target.value }))}>
                  <option value="">{isThai ? 'ไม่มี' : 'None'}</option>
                  <option value="1">1%</option>
                  <option value="3">3%</option>
                  <option value="5">5%</option>
                </select>
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={preferences.defaultShowCompanyLogo} onChange={(e) => setPreferences((prev) => ({ ...prev, defaultShowCompanyLogo: e.target.checked }))} />
                <span>{isThai ? 'แสดงโลโก้บริษัทเป็นค่าเริ่มต้น' : 'Show company logo by default'}</span>
              </label>
            </div>
            <button type="button" onClick={savePreferences} className="btn-primary inline-flex items-center gap-2">
              <Save className="h-4 w-4" />
              {isThai ? 'บันทึกค่าเริ่มต้น' : 'Save defaults'}
            </button>
          </SettingsCard>

          <SettingsCard
            id="tax"
            icon={<FileCheck2 className="h-5 w-5" />}
            title={isThai ? 'e-Tax, RD และ Certificate' : 'e-Tax, RD, and certificate'}
            description={isThai ? 'ดูความพร้อมก่อนส่งเอกสารจริงไปกรมสรรพากร ค่าลับยังจัดการใน Admin Panel' : 'Check readiness before live RD submission. Sensitive values remain in Admin Panel.'}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">RD Environment</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{rdStatus?.environment ?? '-'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">RD Credentials</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusPill ok={!!rdStatus?.clientId} label="Client ID" />
                  <StatusPill ok={!!rdStatus?.hasSecret} label="Secret" />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Certificate</p>
                <div className="mt-2">
                  <StatusPill ok={!!rdStatus?.certStatus?.loaded && !rdStatus?.certStatus?.isExpired} label={rdStatus?.certStatus?.loaded ? (isThai ? 'พร้อมใช้' : 'Ready') : (isThai ? 'ยังไม่พร้อม' : 'Not ready')} />
                </div>
                {rdStatus?.certStatus?.commonName && <p className="mt-2 truncate text-xs text-slate-500">{rdStatus.certStatus.commonName}</p>}
              </div>
            </div>
            <Link to="/app/admin" className="btn-secondary inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              {isThai ? 'จัดการ RD / Certificate ใน Admin Panel' : 'Manage RD / certificate in Admin Panel'}
            </Link>
          </SettingsCard>

          <SettingsCard
            id="integrations"
            icon={<Link2 className="h-5 w-5" />}
            title={isThai ? 'การเชื่อมต่อและอัตโนมัติ' : 'Integrations and automation'}
            description={isThai ? 'ตรวจสถานะ LINE, Google, Drive และระบบ export ที่ใช้กับงานเอกสาร' : 'Check LINE, Google, Drive, and export automation status.'}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-semibold text-slate-900"><MessageCircle className="h-4 w-4 text-emerald-600" /> LINE Billboy</div>
                  <StatusPill ok={lineStatus?.linked ?? integrationStatus?.lineAi?.connected} label={(lineStatus?.linked ?? integrationStatus?.lineAi?.connected) ? (isThai ? 'เชื่อมแล้ว' : 'Connected') : (isThai ? 'ยังไม่เชื่อม' : 'Not linked')} />
                </div>

                {lineStatus?.linked ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-600">
                      {isThai ? 'บัญชี LINE: ' : 'LINE account: '}
                      <span className="font-medium text-slate-900">{lineStatus.displayName ?? '—'}</span>
                    </p>
                    <button type="button" onClick={() => void handleLineUnlink()} className="text-xs text-red-600 hover:text-red-700 font-medium inline-flex items-center gap-1">
                      <Unlink2 className="w-3.5 h-3.5" />
                      {isThai ? 'ถอด' : 'Unlink'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <a href="https://line.me/R/ti/p/@566fvjbg" target="_blank" rel="noreferrer" className="flex-shrink-0">
                        <img src="https://qr-official.line.me/g/M/566fvjbg.png" alt="QR Code Billboy" className="w-20 h-20 rounded-lg border border-slate-200" />
                      </a>
                      <div className="space-y-1.5">
                        <p className="text-xs text-slate-600">{isThai ? 'สแกน QR เพิ่มเพื่อน Billboy' : 'Scan to add Billboy'}</p>
                        <a href="https://line.me/R/ti/p/@566fvjbg" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#06C755] hover:underline">
                          <Link2 className="w-3 h-3" /> @566fvjbg
                        </a>
                      </div>
                    </div>
                    {lineOtp ? (
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-2xl font-bold tracking-[0.25em] text-indigo-700 select-all">{lineOtp}</span>
                          <button type="button" onClick={copyLineOtp} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 rounded px-2 py-1">
                            {lineOtpCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                            {lineOtpCopied ? (isThai ? 'คัดลอกแล้ว' : 'Copied') : (isThai ? 'คัดลอก' : 'Copy')}
                          </button>
                        </div>
                        <p className="text-xs text-indigo-800">{isThai ? 'ส่งรหัสนี้ให้ Billboy ใน LINE ภายใน 10 นาที' : 'Send this code to Billboy in LINE within 10 min.'}</p>
                      </div>
                    ) : (
                      <button type="button" onClick={() => void handleLineSelfLink()} className="btn-primary text-sm w-full">
                        <Link2 className="w-4 h-4" />
                        {isThai ? 'สร้างรหัสเชื่อมบัญชี LINE' : 'Generate LINE link code'}
                      </button>
                    )}
                  </div>
                )}

                {lineStatus?.linked && isAdmin && (
                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={lineStatus?.lineNotifyEnabled ?? false} onChange={(e) => setLineStatus((prev) => prev ? { ...prev, lineNotifyEnabled: e.target.checked } : prev)} disabled={!lineStatus} />
                        {isThai ? 'เปิดแจ้งเตือน LINE' : 'Enable LINE notifications'}
                      </label>
                      <select className="input-field" value={lineStatus?.overdueReminderDays ?? 3} onChange={(e) => setLineStatus((prev) => prev ? { ...prev, overdueReminderDays: Number(e.target.value) as 1 | 3 | 7 } : prev)} disabled={!lineStatus}>
                        <option value={1}>{isThai ? 'เตือนค้างชำระ 1 วัน' : 'Overdue reminder 1 day'}</option>
                        <option value={3}>{isThai ? 'เตือนค้างชำระ 3 วัน' : 'Overdue reminder 3 days'}</option>
                        <option value={7}>{isThai ? 'เตือนค้างชำระ 7 วัน' : 'Overdue reminder 7 days'}</option>
                      </select>
                    </div>
                    <button type="button" onClick={() => void saveLineSettings()} disabled={!lineStatus} className="btn-secondary text-sm">
                      {isThai ? 'บันทึก LINE' : 'Save LINE'}
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-semibold text-slate-900"><Cloud className="h-4 w-4 text-blue-600" /> Google Drive</div>
                  <StatusPill ok={driveStatus?.connected} label={driveStatus?.connected ? (isThai ? 'เชื่อมแล้ว' : 'Connected') : (isThai ? 'ยังไม่เชื่อม' : 'Not linked')} />
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {driveStatus?.configured
                    ? (isThai ? 'ระบบพร้อมเชื่อมบัญชี Google Drive ของผู้ใช้' : 'User Drive OAuth is configured.')
                    : (isThai ? 'ยังไม่ได้ตั้งค่า Google OAuth บน server' : 'Google OAuth is not configured on the server.')}
                </p>
                <button type="button" onClick={() => void connectDrive()} disabled={!driveStatus?.configured} className="btn-secondary mt-3 text-sm">
                  {driveStatus?.connected ? (isThai ? 'เชื่อมใหม่' : 'Reconnect') : (isThai ? 'เชื่อม Google Drive' : 'Connect Drive')}
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-semibold text-slate-900"><Globe2 className="h-4 w-4 text-slate-600" /> Google Account</div>
                  <StatusPill ok={integrationStatus?.googleAccount?.connected} label={integrationStatus?.googleAccount?.connected ? (isThai ? 'เชื่อมแล้ว' : 'Connected') : (isThai ? 'ยังไม่เชื่อม' : 'Not linked')} />
                </div>
                <p className="mt-2 text-xs text-slate-500">{integrationStatus?.googleAccount?.email ?? user?.email}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-semibold text-slate-900"><FileCheck2 className="h-4 w-4 text-slate-600" /> Google Sheets Export</div>
                  <StatusPill ok={integrationStatus?.googleSheets?.connected} label={integrationStatus?.googleSheets?.connected ? (isThai ? 'พร้อม' : 'Ready') : (isThai ? 'ยังไม่พร้อม' : 'Not ready')} />
                </div>
                <p className="mt-2 text-xs text-slate-500">{integrationStatus?.googleSheets?.mode ?? 'not_configured'}</p>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard
            id="expense"
            icon={<Landmark className="h-5 w-5" />}
            title={isThai ? 'เงินสดย่อยและรายจ่าย' : 'Petty cash and expenses'}
            description={isThai ? 'กำหนดวงเงินอนุมัติรายจ่าย เพื่อช่วยควบคุมเงินสดย่อยและ workflow ภายใน' : 'Set expense approval limits for petty cash and internal workflows.'}
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className="label">{isThai ? 'วงเงินรายจ่ายต่อรายการ' : 'Expense limit per voucher'}</label>
                <input className="input-field" type="number" min={0} value={expenseLimitDraft} onChange={(e) => setExpenseLimitDraft(e.target.value)} placeholder={isThai ? 'เว้นว่าง = ไม่จำกัด' : 'Blank = unlimited'} disabled={!isAdmin} />
                <p className="mt-1 text-xs text-slate-500">
                  {expenseSettings.expenseLimit == null
                    ? (isThai ? 'ปัจจุบัน: ไม่จำกัดวงเงิน' : 'Current: unlimited')
                    : `${isThai ? 'ปัจจุบัน' : 'Current'}: ${expenseSettings.expenseLimit.toLocaleString('th-TH')} THB`}
                </p>
              </div>
              <button type="button" onClick={() => void saveExpenseSettings()} disabled={!isAdmin} className="btn-primary inline-flex items-center gap-2">
                <Save className="h-4 w-4" />
                {isThai ? 'บันทึกวงเงิน' : 'Save limit'}
              </button>
            </div>
          </SettingsCard>

          <SettingsCard
            id="language"
            icon={<Languages className="h-5 w-5" />}
            title={t('settings.language')}
            description={t('settings.languageDesc')}
          >
            <div className="flex flex-wrap items-center gap-4">
              <LanguageSwitcher variant="toggle" />
              <span className="text-sm text-gray-500">
                {isThai ? 'ภาษาปัจจุบัน: ภาษาไทย' : 'Current language: English'}
              </span>
            </div>
          </SettingsCard>

          {!isAdmin && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{isThai ? 'บัญชีนี้ดูการตั้งค่าได้ แต่การแก้ไขบางส่วนต้องใช้สิทธิ์ admin' : 'This account can view settings, but some edits require admin access.'}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
