import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, FileText, Building, Key, Server, CreditCard, Upload, CheckCircle, XCircle, Loader2, AlertTriangle, Save, Sparkles, FlaskConical, Lock, ArrowRight, ScrollText, Zap, MessageCircle, Link2, Unlink2, Copy, Check, Bell, Settings, BriefcaseBusiness } from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import type { CompanyAccessPolicy } from '../types';

const baseTabs = [
  { key: 'company', icon: Building, labelKey: 'admin.company' },
  { key: 'users', icon: Users, labelKey: 'admin.users' },
  { key: 'templates', icon: FileText, labelKey: 'admin.templates' },
  { key: 'certificate', icon: Key, labelKey: 'admin.certificate' },
  { key: 'rdConfig', icon: Server, labelKey: 'admin.rdConfig' },
  { key: 'line', icon: MessageCircle, labelKey: 'admin.line' },
  { key: 'billing', icon: CreditCard, labelKey: 'admin.billing' },
  { key: 'audit', icon: ScrollText, labelKey: 'admin.auditLog' },
  { key: 'plan', icon: Zap, labelKey: 'admin.plan' },
  { key: 'appSettings', icon: Settings, labelKey: 'admin.appSettings' },
];

export default function AdminPanel() {
  const { t } = useTranslation();
  const { isThai } = useLanguage();
  const { policy } = useCompanyAccessPolicy();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('company');
  const tabs = baseTabs.filter((tab) => {
    if (tab.key === 'templates') return policy?.canUseCustomTemplates !== false;
    if (tab.key === 'certificate') return policy?.canManageCertificate !== false;
    if (tab.key === 'rdConfig') return policy?.canManageRDConfig !== false;
    // users, audit, plan, company, billing always shown
    return true;
  });

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(tabs[0]?.key ?? 'company');
    }
  }, [activeTab, tabs]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t('admin.title')}</h1>
      {policy && <PlanAccessSummary isThai={isThai} />}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Sidebar */}
        <nav className="lg:w-56 flex-shrink-0">
          <div className="card p-2 space-y-0.5">
            {tabs.map(({ key, icon: Icon, labelKey }) => (
              <button
                key={key}
                onClick={() => {
                  if (key === 'plan') { navigate('/app/plan'); return; }
                  setActiveTab(key);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg text-left transition-colors ${
                  activeTab === key
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {t(labelKey, { defaultValue: key === 'audit' ? 'Audit Log' : key === 'plan' ? 'แผน / Plan' : key })}
                {key === 'audit' && !policy?.canViewAuditLogs && (
                  <Lock className="w-3.5 h-3.5 ml-auto text-gray-400 flex-shrink-0" />
                )}
                {key === 'users' && !policy?.canInviteUsers && (
                  <Lock className="w-3.5 h-3.5 ml-auto text-gray-400 flex-shrink-0" />
                )}
                {key === 'line' && !policy?.canUseLineOa && (
                  <Lock className="w-3.5 h-3.5 ml-auto text-gray-400 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 card relative">
          {activeTab === 'company' && <CompanyTab isThai={isThai} t={t} />}
          {activeTab === 'users' && (
            policy?.canInviteUsers === false
              ? <UpgradePrompt isThai={isThai} messageKey="users" />
              : <UsersTab isThai={isThai} t={t} />
          )}
          {activeTab === 'templates' && <TemplatesTab isThai={isThai} t={t} />}
          {activeTab === 'rdConfig' && <RDConfigTab isThai={isThai} t={t} />}
          {activeTab === 'line' && <LineTab policy={policy} isThai={isThai} />}
          {activeTab === 'billing' && <BillingTab isThai={isThai} />}
          {activeTab === 'certificate' && <CertificateTab isThai={isThai} t={t} />}
          {activeTab === 'audit' && (
            policy?.canViewAuditLogs === false
              ? <UpgradePrompt isThai={isThai} messageKey="audit" />
              : <AuditLogTab isThai={isThai} />
          )}
          {activeTab === 'appSettings' && <AppSettingsTab isThai={isThai} />}
        </div>
      </div>
    </div>
  );
}

function UpgradePrompt({ isThai, messageKey }: { isThai: boolean; messageKey: 'users' | 'audit' }) {
  const messages: Record<'users' | 'audit', { th: string; en: string }> = {
    users: {
      th: 'อัปเกรดแพ็กเกจเพื่อเพิ่มผู้ใช้งานในบริษัทของคุณ',
      en: 'Upgrade your plan to invite team members to your company.',
    },
    audit: {
      th: 'อัปเกรดแพ็กเกจ Business ขึ้นไปเพื่อดู Audit Log การเปลี่ยนแปลงในระบบ',
      en: 'Upgrade to Business or higher to access audit logs.',
    },
  };
  const msg = messages[messageKey];
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
        <Lock className="w-7 h-7 text-amber-500" />
      </div>
      <div>
        <p className="font-semibold text-gray-800 mb-1">
          {isThai ? 'ฟีเจอร์นี้ต้องการแพ็กเกจสูงกว่า' : 'Feature requires a higher plan'}
        </p>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">{isThai ? msg.th : msg.en}</p>
      </div>
      <Link
        to="/app/plan"
        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        <Zap className="w-4 h-4" />
        {isThai ? 'ดูแพ็กเกจทั้งหมด' : 'View plans'}
      </Link>
    </div>
  );
}

function AuditLogTab({ isThai }: { isThai: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-gray-400">
      <ScrollText className="w-10 h-10" />
      <p className="text-sm">
        {isThai ? 'Audit Log จะแสดงที่นี่' : 'Audit log will be displayed here.'}
      </p>
      <Link
        to="/app/audit"
        className="text-sm text-indigo-600 hover:underline"
      >
        {isThai ? 'ไปยังหน้า Audit Log เต็ม' : 'Go to full Audit Log page'}
      </Link>
    </div>
  );
}

function PlanAccessSummary({ isThai }: { isThai: boolean }) {
  const { policy } = useCompanyAccessPolicy();

  if (!policy) return null;

  const lockedFeatures = [
    !policy.canSubmitToRD ? (isThai ? 'ส่งข้อมูลไป RD' : 'RD submission') : null,
    !policy.canInviteUsers ? (isThai ? 'เพิ่มผู้ใช้ในบริษัท' : 'Invite more users') : null,
    !policy.canUseCustomTemplates ? (isThai ? 'Document templates แบบกำหนดเอง' : 'Custom document templates') : null,
    !policy.canViewAuditLogs ? (isThai ? 'Audit logs' : 'Audit logs') : null,
    !policy.canExportGoogleSheets ? (isThai ? 'Google Sheets export' : 'Google Sheets export') : null,
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
              {isThai ? 'แพ็กเกจปัจจุบัน' : 'Current plan'}
            </span>
            <span className="text-lg font-bold text-gray-900 capitalize">{policy.planLabel}</span>
            {!policy.isPaidPlan && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                {isThai ? 'เหมาะสำหรับทดลองระบบ' : 'Trial-oriented access'}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">
            {isThai
              ? `ใช้งานเอกสารเดือนนี้ ${policy.usage.documentsThisMonth}${policy.maxDocumentsPerMonth ? ` / ${policy.maxDocumentsPerMonth}` : ''} • ผู้ใช้ ${policy.usage.users}${policy.maxUsers ? ` / ${policy.maxUsers}` : ''} • ลูกค้า ${policy.usage.customers}${policy.maxCustomers ? ` / ${policy.maxCustomers}` : ''}`
              : `Documents this month ${policy.usage.documentsThisMonth}${policy.maxDocumentsPerMonth ? ` / ${policy.maxDocumentsPerMonth}` : ''} • Users ${policy.usage.users}${policy.maxUsers ? ` / ${policy.maxUsers}` : ''} • Customers ${policy.usage.customers}${policy.maxCustomers ? ` / ${policy.maxCustomers}` : ''}`}
          </p>
          {lockedFeatures.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {lockedFeatures.map((feature) => (
                <span key={feature} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                  <Lock className="w-3.5 h-3.5" />
                  {feature}
                </span>
              ))}
            </div>
          )}
        </div>

        <Link to="/#pricing-checkout" className="btn-secondary sm w-full justify-center lg:w-auto">
          {isThai ? 'ดูแพ็กเกจและอัปเกรด' : 'View plans and upgrade'}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

const templatePreviewSamples = {
  th: {
    documentTitle: 'ใบกำกับภาษี / ใบเสร็จรับเงิน',
    invoiceNumber: 'IV-2026-000128',
    invoiceDate: '24 เมษายน 2569',
    dueDate: '30 เมษายน 2569',
    sellerName: 'บริษัท สยาม เทคโนโลยี จำกัด',
    buyerName: 'บริษัท เมฆา คอมเมิร์ซ จำกัด',
    subtotal: '45,000.00',
    vatAmount: '3,150.00',
    total: '48,150.00',
    amountInWords: 'สี่หมื่นแปดพันหนึ่งร้อยห้าสิบบาทถ้วน',
    paymentMethod: 'โอนเงินผ่านธนาคาร',
    notes: 'กรุณาชำระเงินภายในกำหนดเพื่อรักษาวงเงินเครดิต',
  },
  en: {
    documentTitle: 'Tax Invoice / Receipt',
    invoiceNumber: 'IV-2026-000128',
    invoiceDate: '24 April 2026',
    dueDate: '30 April 2026',
    sellerName: 'Siam Technology Co., Ltd.',
    buyerName: 'Mekha Commerce Co., Ltd.',
    subtotal: '45,000.00',
    vatAmount: '3,150.00',
    total: '48,150.00',
    amountInWords: 'Forty-eight thousand one hundred fifty baht only',
    paymentMethod: 'Bank transfer',
    notes: 'Please settle payment within the stated terms.',
  },
} as const;

const templatePresets = {
  taxInvoice: {
    type: 'tax_invoice',
    label: 'T02',
    nameTh: 'Tax Invoice - Executive Blue',
    nameEn: 'Tax Invoice - Executive Blue',
    descriptionTh: 'ใบกำกับภาษีสำหรับขายเชื่อ เน้นยอดค้างชำระ วันครบกำหนด และความน่าเชื่อถือ',
    descriptionEn: 'A polished tax invoice layout for credit sales, due dates, and outstanding balance.',
    th: `<div style="display:grid;grid-template-columns:1.15fr .85fr;gap:14px;align-items:stretch">
  <div style="border:1px solid #dbeafe;border-radius:8px;padding:14px;background:#f8fbff">
    <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#1d4ed8;font-weight:700">Tax Invoice T02</div>
    <div style="margin-top:8px;font-size:18px;font-weight:800;color:#0f172a">{{buyerName}}</div>
    <div style="margin-top:6px;color:#475569">เลขที่ {{invoiceNumber}} · วันที่ {{invoiceDate}}</div>
    <div style="margin-top:10px;color:#334155">ครบกำหนดชำระ {{dueDate}} · วิธีชำระ {{paymentMethod}}</div>
  </div>
  <div style="border-radius:8px;padding:14px;background:#0f2f6b;color:#fff">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#bfdbfe">Amount Due</div>
    <div style="margin-top:8px;font-size:28px;font-weight:800">{{total}}</div>
    <div style="margin-top:8px;color:#dbeafe;font-size:12px">VAT {{vatAmount}} · Subtotal {{subtotal}}</div>
  </div>
</div>`,
    en: `<div style="display:grid;grid-template-columns:1.15fr .85fr;gap:14px;align-items:stretch">
  <div style="border:1px solid #dbeafe;border-radius:8px;padding:14px;background:#f8fbff">
    <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#1d4ed8;font-weight:700">Tax Invoice T02</div>
    <div style="margin-top:8px;font-size:18px;font-weight:800;color:#0f172a">{{buyerName}}</div>
    <div style="margin-top:6px;color:#475569">No. {{invoiceNumber}} · Date {{invoiceDate}}</div>
    <div style="margin-top:10px;color:#334155">Due {{dueDate}} · Payment {{paymentMethod}}</div>
  </div>
  <div style="border-radius:8px;padding:14px;background:#0f2f6b;color:#fff">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#bfdbfe">Amount Due</div>
    <div style="margin-top:8px;font-size:28px;font-weight:800">{{total}}</div>
    <div style="margin-top:8px;color:#dbeafe;font-size:12px">VAT {{vatAmount}} · Subtotal {{subtotal}}</div>
  </div>
</div>`,
  },
  taxInvoiceReceipt: {
    type: 'tax_invoice_receipt',
    label: 'T01',
    nameTh: 'Tax Invoice Receipt - Paid Stamp',
    nameEn: 'Tax Invoice Receipt - Paid Stamp',
    descriptionTh: 'ใบกำกับภาษี/ใบเสร็จรวม เน้นสถานะรับชำระแล้วและยอดสุทธิ',
    descriptionEn: 'A combined tax invoice and receipt layout with a clear paid confirmation.',
    th: `<div style="border:1px solid #bbf7d0;border-radius:8px;padding:14px;background:#f0fdf4">
  <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
    <div>
      <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#15803d;font-weight:800">Paid Receipt T01</div>
      <div style="margin-top:8px;font-size:18px;font-weight:800;color:#052e16">{{documentTitle}}</div>
      <div style="margin-top:6px;color:#166534">รับเงินจาก {{buyerName}} เรียบร้อยแล้ว</div>
    </div>
    <div style="border:1px solid #86efac;border-radius:999px;padding:8px 14px;background:#fff;color:#15803d;font-weight:800">PAID</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px">
    <div><div style="font-size:11px;color:#166534">Subtotal</div><strong>{{subtotal}}</strong></div>
    <div><div style="font-size:11px;color:#166534">VAT</div><strong>{{vatAmount}}</strong></div>
    <div><div style="font-size:11px;color:#166534">Net Paid</div><strong>{{total}}</strong></div>
  </div>
</div>`,
    en: `<div style="border:1px solid #bbf7d0;border-radius:8px;padding:14px;background:#f0fdf4">
  <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
    <div>
      <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#15803d;font-weight:800">Paid Receipt T01</div>
      <div style="margin-top:8px;font-size:18px;font-weight:800;color:#052e16">{{documentTitle}}</div>
      <div style="margin-top:6px;color:#166534">Payment from {{buyerName}} has been received.</div>
    </div>
    <div style="border:1px solid #86efac;border-radius:999px;padding:8px 14px;background:#fff;color:#15803d;font-weight:800">PAID</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px">
    <div><div style="font-size:11px;color:#166534">Subtotal</div><strong>{{subtotal}}</strong></div>
    <div><div style="font-size:11px;color:#166534">VAT</div><strong>{{vatAmount}}</strong></div>
    <div><div style="font-size:11px;color:#166534">Net Paid</div><strong>{{total}}</strong></div>
  </div>
</div>`,
  },
  receipt: {
    type: 'receipt',
    label: 'T03',
    nameTh: 'Receipt - Settlement Record',
    nameEn: 'Receipt - Settlement Record',
    descriptionTh: 'ใบเสร็จรับเงินสำหรับอ้างอิงใบกำกับภาษีเดิม ดูเป็นหลักฐานรับชำระ',
    descriptionEn: 'A receipt layout for settlement against a prior tax invoice.',
    th: `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px;background:#fff">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#64748b;font-weight:800">Receipt T03</div>
  <div style="margin-top:10px;display:grid;grid-template-columns:1fr auto;gap:14px;align-items:end">
    <div>
      <div style="font-size:16px;font-weight:800;color:#0f172a">บันทึกรับชำระจาก {{buyerName}}</div>
      <div style="margin-top:6px;color:#475569">เอกสารเลขที่ {{invoiceNumber}} · วันที่รับชำระ {{invoiceDate}}</div>
      <div style="margin-top:6px;color:#475569">ชำระโดย {{paymentMethod}}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#64748b">Received Amount</div>
      <div style="font-size:24px;font-weight:800;color:#0f766e">{{total}}</div>
    </div>
  </div>
</div>`,
    en: `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px;background:#fff">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#64748b;font-weight:800">Receipt T03</div>
  <div style="margin-top:10px;display:grid;grid-template-columns:1fr auto;gap:14px;align-items:end">
    <div>
      <div style="font-size:16px;font-weight:800;color:#0f172a">Payment received from {{buyerName}}</div>
      <div style="margin-top:6px;color:#475569">Document {{invoiceNumber}} · Receipt date {{invoiceDate}}</div>
      <div style="margin-top:6px;color:#475569">Paid by {{paymentMethod}}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#64748b">Received Amount</div>
      <div style="font-size:24px;font-weight:800;color:#0f766e">{{total}}</div>
    </div>
  </div>
</div>`,
  },
  creditNote: {
    type: 'credit_note',
    label: 'T04',
    nameTh: 'Credit Note - Adjustment',
    nameEn: 'Credit Note - Adjustment',
    descriptionTh: 'ใบลดหนี้ เน้นมูลค่าปรับลดและเหตุผลประกอบการแก้ไข',
    descriptionEn: 'A credit note layout focused on reduction amount and adjustment context.',
    th: `<div style="border:1px solid #fed7aa;border-radius:8px;padding:14px;background:#fff7ed">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#c2410c;font-weight:800">Credit Note T04</div>
  <div style="margin-top:8px;font-size:18px;font-weight:800;color:#7c2d12">เอกสารลดหนี้สำหรับ {{buyerName}}</div>
  <div style="margin-top:6px;color:#9a3412">อ้างอิง {{invoiceNumber}} ลงวันที่ {{invoiceDate}}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
    <div style="border:1px solid #fdba74;border-radius:8px;background:#fff;padding:10px"><div style="font-size:11px;color:#9a3412">ยอดลดหนี้</div><strong>{{total}}</strong></div>
    <div style="border:1px solid #fdba74;border-radius:8px;background:#fff;padding:10px"><div style="font-size:11px;color:#9a3412">หมายเหตุ</div><strong>{{notes}}</strong></div>
  </div>
</div>`,
    en: `<div style="border:1px solid #fed7aa;border-radius:8px;padding:14px;background:#fff7ed">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#c2410c;font-weight:800">Credit Note T04</div>
  <div style="margin-top:8px;font-size:18px;font-weight:800;color:#7c2d12">Credit adjustment for {{buyerName}}</div>
  <div style="margin-top:6px;color:#9a3412">Reference {{invoiceNumber}} dated {{invoiceDate}}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
    <div style="border:1px solid #fdba74;border-radius:8px;background:#fff;padding:10px"><div style="font-size:11px;color:#9a3412">Credit Amount</div><strong>{{total}}</strong></div>
    <div style="border:1px solid #fdba74;border-radius:8px;background:#fff;padding:10px"><div style="font-size:11px;color:#9a3412">Notes</div><strong>{{notes}}</strong></div>
  </div>
</div>`,
  },
  debitNote: {
    type: 'debit_note',
    label: 'T05',
    nameTh: 'Debit Note - Additional Charge',
    nameEn: 'Debit Note - Additional Charge',
    descriptionTh: 'ใบเพิ่มหนี้ เน้นยอดเรียกเก็บเพิ่มและข้อมูลอ้างอิงเอกสารเดิม',
    descriptionEn: 'A debit note layout for additional charge and reference context.',
    th: `<div style="border:1px solid #fecdd3;border-radius:8px;padding:14px;background:#fff1f2">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#be123c;font-weight:800">Debit Note T05</div>
  <div style="display:grid;grid-template-columns:1fr auto;gap:14px;margin-top:10px;align-items:center">
    <div>
      <div style="font-size:18px;font-weight:800;color:#881337">เรียกเก็บเพิ่มเติมจาก {{buyerName}}</div>
      <div style="margin-top:6px;color:#9f1239">อ้างอิงเอกสาร {{invoiceNumber}} · {{invoiceDate}}</div>
      <div style="margin-top:6px;color:#9f1239">{{notes}}</div>
    </div>
    <div style="border-radius:8px;background:#be123c;color:#fff;padding:12px 16px;text-align:right">
      <div style="font-size:11px;color:#ffe4e6">Additional Due</div>
      <div style="font-size:24px;font-weight:800">{{total}}</div>
    </div>
  </div>
</div>`,
    en: `<div style="border:1px solid #fecdd3;border-radius:8px;padding:14px;background:#fff1f2">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#be123c;font-weight:800">Debit Note T05</div>
  <div style="display:grid;grid-template-columns:1fr auto;gap:14px;margin-top:10px;align-items:center">
    <div>
      <div style="font-size:18px;font-weight:800;color:#881337">Additional charge to {{buyerName}}</div>
      <div style="margin-top:6px;color:#9f1239">Reference {{invoiceNumber}} · {{invoiceDate}}</div>
      <div style="margin-top:6px;color:#9f1239">{{notes}}</div>
    </div>
    <div style="border-radius:8px;background:#be123c;color:#fff;padding:12px 16px;text-align:right">
      <div style="font-size:11px;color:#ffe4e6">Additional Due</div>
      <div style="font-size:24px;font-weight:800">{{total}}</div>
    </div>
  </div>
</div>`,
  },
} as const;

function compileTemplatePreview(html: string, sample: Record<string, string>) {
  return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => sample[key] ?? '');
}

type TemplatePresetKey = keyof typeof templatePresets;
type TemplateDocType = 'tax_invoice' | 'tax_invoice_receipt' | 'receipt' | 'credit_note' | 'debit_note';
type TemplateLanguage = 'th' | 'en' | 'both';
type TemplateFormState = {
  name: string;
  type: TemplateDocType;
  language: TemplateLanguage;
  htmlTh: string;
  htmlEn: string;
  isActive: boolean;
};

function CompanyTab({ isThai, t }: { isThai: boolean; t: (k: string) => string }) {
  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-lg text-gray-900">{t('admin.company')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">{t('customer.nameTh')}</label>
          <input className="input-field" defaultValue="บริษัท สยาม เทคโนโลยี จำกัด" />
        </div>
        <div>
          <label className="label">{t('customer.nameEn')}</label>
          <input className="input-field" defaultValue="Siam Technology Co., Ltd." />
        </div>
        <div>
          <label className="label">{t('customer.taxId')}</label>
          <input className="input-field" defaultValue="0105560123456" />
        </div>
        <div>
          <label className="label">{isThai ? 'รหัส/ชื่อสาขา' : 'Branch Code/Name'}</label>
          <input className="input-field" defaultValue="00000 / สำนักงานใหญ่" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t('customer.addressTh')}</label>
          <textarea className="input-field" rows={2} defaultValue="123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t('customer.addressEn')}</label>
          <textarea className="input-field" rows={2} defaultValue="123 Sukhumvit Road, Khlong Toei, Bangkok 10110" />
        </div>
      </div>
      <button className="btn-primary">{t('settings.save')}</button>
    </div>
  );
}

function UsersTab({ isThai, t }: { isThai: boolean; t: (k: string) => string }) {
  const { token, user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<Array<{
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'accountant' | 'viewer' | 'super_admin';
    isActive: boolean;
    createdAt: string;
    lastLoginAt?: string | null;
    auth?: {
      hasPassword: boolean;
      hasGoogle: boolean;
    };
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'viewer',
    password: '',
  });

  useEffect(() => {
    let active = true;

    async function loadUsers() {
      try {
        const res = await fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json() as { data?: typeof users; error?: string };
        if (!res.ok) {
          throw new Error(json.error ?? 'Failed to fetch users');
        }
        if (active) {
          setUsers(json.data ?? []);
        }
      } catch (e) {
        if (active) {
          setMsg({ type: 'err', text: (e as Error).message });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadUsers();

    return () => {
      active = false;
    };
  }, [token]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMsg(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name.trim() || undefined,
          email: form.email.trim(),
          role: form.role,
          password: form.password.trim() || undefined,
        }),
      });

      const json = await res.json() as { data?: typeof users[number]; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to create user');
      }

      if (json.data) {
        const createdUser = json.data;
        setUsers((prev) => [...prev, createdUser]);
      }
      setForm({ name: '', email: '', role: 'viewer', password: '' });
      setMsg({
        type: 'ok',
        text: isThai ? 'เพิ่มผู้ใช้สำเร็จ และบัญชีนี้สามารถเข้า Google ได้ทันที' : 'User added. This account can now sign in with Google.',
      });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateUser(targetUser: typeof users[number], updates: Partial<typeof users[number]> & { password?: string }) {
    setSavingId(targetUser.id);
    setMsg(null);

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      const json = await res.json() as { data?: typeof users[number]; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to update user');
      }

      if (json.data) {
        setUsers((prev) => prev.map((item) => item.id === json.data!.id ? json.data! : item));
      }
      setMsg({ type: 'ok', text: isThai ? 'อัปเดตผู้ใช้แล้ว' : 'User updated' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg text-gray-900">{t('admin.users')}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {isThai
              ? 'เพิ่มอีเมลเพื่ออนุญาตให้ผู้ใช้เข้าสู่ระบบด้วย Google และกำหนดบทบาทได้จากหน้านี้'
              : 'Add user emails here to authorize Google sign-in and manage roles in one place.'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50/70">
        <form className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3" onSubmit={handleCreateUser}>
          <div>
            <label className="label">{t('common.name')}</label>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={isThai ? 'ชื่อที่แสดงผล' : 'Display name'}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input-field"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="user@company.com"
              required
            />
          </div>
          <div>
            <label className="label">{isThai ? 'บทบาท' : 'Role'}</label>
            <select
              className="input-field"
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
            >
              <option value="viewer">{isThai ? 'ผู้ดู' : 'Viewer'}</option>
              <option value="accountant">{isThai ? 'บัญชี' : 'Accountant'}</option>
              <option value="admin">{isThai ? 'ผู้ดูแล' : 'Admin'}</option>
            </select>
          </div>
          <div>
            <label className="label">{isThai ? 'รหัสผ่านเริ่มต้น (ไม่บังคับ)' : 'Initial password (optional)'}</label>
            <input
              type="password"
              className="input-field"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder={isThai ? 'ปล่อยว่างเพื่อใช้ Google อย่างเดียว' : 'Leave blank for Google-only access'}
            />
          </div>
          <div className="md:col-span-2 xl:col-span-4 flex justify-end">
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : (isThai ? '+ เพิ่มผู้ใช้' : '+ Add user')}
            </button>
          </div>
        </form>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="table-header">{t('common.name')}</th>
              <th className="table-header">Email</th>
              <th className="table-header">{isThai ? 'สิทธิ์' : 'Access'}</th>
              <th className="table-header">{isThai ? 'วิธีเข้าใช้' : 'Sign-in methods'}</th>
              <th className="table-header">{isThai ? 'เข้าใช้ล่าสุด' : 'Last login'}</th>
              <th className="table-header">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((managedUser) => {
              const isSelf = managedUser.id === currentUser?.id;
              const canToggleActive = !isSelf;
              return (
                <tr key={managedUser.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <div className="font-medium text-gray-900">{managedUser.name}</div>
                    <div className="text-xs text-gray-400">
                      {managedUser.isActive ? t('common.active') : t('common.inactive')}
                    </div>
                  </td>
                  <td className="table-cell text-gray-600 font-mono text-xs">{managedUser.email}</td>
                  <td className="table-cell">
                    <select
                      className="input-field min-w-[140px] py-2"
                      value={managedUser.role}
                      onChange={(e) => {
                        const role = e.target.value as typeof managedUser.role;
                        setUsers((prev) => prev.map((item) => item.id === managedUser.id ? { ...item, role } : item));
                      }}
                    >
                      {managedUser.role === 'super_admin' && <option value="super_admin">Super Admin</option>}
                      <option value="viewer">{isThai ? 'ผู้ดู' : 'Viewer'}</option>
                      <option value="accountant">{isThai ? 'บัญชี' : 'Accountant'}</option>
                      <option value="admin">{isThai ? 'ผู้ดูแล' : 'Admin'}</option>
                    </select>
                  </td>
                  <td className="table-cell">
                    <div className="flex flex-wrap gap-2">
                      <span className={managedUser.auth?.hasGoogle ? 'badge-success' : 'badge-info'}>
                        Google
                      </span>
                      <span className={managedUser.auth?.hasPassword ? 'badge-success' : 'badge-info'}>
                        Password
                      </span>
                    </div>
                  </td>
                  <td className="table-cell text-gray-500">
                    {managedUser.lastLoginAt
                      ? new Date(managedUser.lastLoginAt).toLocaleString(isThai ? 'th-TH' : 'en-GB')
                      : (isThai ? 'ยังไม่เคยเข้าใช้' : 'Never logged in')}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <label className={`flex items-center gap-2 text-xs ${canToggleActive ? 'text-gray-700' : 'text-gray-400'}`}>
                        <input
                          type="checkbox"
                          checked={managedUser.isActive}
                          disabled={!canToggleActive}
                          onChange={(e) => {
                            const isActive = e.target.checked;
                            setUsers((prev) => prev.map((item) => item.id === managedUser.id ? { ...item, isActive } : item));
                          }}
                        />
                        {isThai ? 'เปิดใช้งาน' : 'Active'}
                      </label>
                      <button
                        className="text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:text-gray-400"
                        disabled={savingId === managedUser.id || managedUser.role === 'super_admin'}
                        onClick={() => handleUpdateUser(managedUser, {
                          role: managedUser.role,
                          isActive: managedUser.isActive,
                        })}
                      >
                        {savingId === managedUser.id ? (isThai ? 'กำลังบันทึก...' : 'Saving...') : t('common.save')}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TemplatesTab({ isThai, t }: { isThai: boolean; t: (k: string) => string }) {
  const { token } = useAuthStore();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const emptyTemplateForm: TemplateFormState = {
    name: '',
    type: 'tax_invoice' as TemplateDocType,
    language: 'both' as TemplateLanguage,
    htmlTh: templatePresets.taxInvoice.th,
    htmlEn: templatePresets.taxInvoice.en,
    isActive: false,
  };
  const [templates, setTemplates] = useState<Array<{
    id: string;
    name: string;
    type: TemplateDocType;
    language: TemplateLanguage;
    htmlTh: string;
    htmlEn: string;
    isActive: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState(emptyTemplateForm);
  const previewLanguage = form.language === 'en' ? 'en' : 'th';
  const previewHtml = compileTemplatePreview(
    previewLanguage === 'en' ? form.htmlEn : form.htmlTh,
    templatePreviewSamples[previewLanguage],
  );
  const typeOptions = [
    {
      value: 'tax_invoice',
      label: 'T02',
      th: 'ใบกำกับภาษีสำหรับขายเชื่อหรือยังไม่รับชำระ',
      en: 'Tax invoice for credit sales or unpaid transactions',
    },
    {
      value: 'tax_invoice_receipt',
      label: 'T01',
      th: 'ใบกำกับภาษีพร้อมใบเสร็จสำหรับขายสด',
      en: 'Combined tax invoice and receipt for immediate payment',
    },
    {
      value: 'receipt',
      label: 'T03',
      th: 'ใบเสร็จรับเงินจากใบกำกับภาษีเดิม',
      en: 'Receipt issued against an earlier tax invoice',
    },
    {
      value: 'credit_note',
      label: 'T04',
      th: 'ใบลดหนี้เพื่อปรับลดมูลค่าเอกสารเดิม',
      en: 'Credit note used to reduce an earlier document value',
    },
    {
      value: 'debit_note',
      label: 'T05',
      th: 'ใบเพิ่มหนี้เพื่อเพิ่มยอดจากเอกสารเดิม',
      en: 'Debit note used to add charges to an earlier document',
    },
  ] as const;
  const presetOptions = [
    {
      key: 'taxInvoice' as const,
      name: templatePresets.taxInvoice.nameTh,
      description: isThai ? templatePresets.taxInvoice.descriptionTh : templatePresets.taxInvoice.descriptionEn,
    },
    {
      key: 'taxInvoiceReceipt' as const,
      name: templatePresets.taxInvoiceReceipt.nameTh,
      description: isThai ? templatePresets.taxInvoiceReceipt.descriptionTh : templatePresets.taxInvoiceReceipt.descriptionEn,
    },
    {
      key: 'receipt' as const,
      name: templatePresets.receipt.nameTh,
      description: isThai ? templatePresets.receipt.descriptionTh : templatePresets.receipt.descriptionEn,
    },
    {
      key: 'creditNote' as const,
      name: templatePresets.creditNote.nameTh,
      description: isThai ? templatePresets.creditNote.descriptionTh : templatePresets.creditNote.descriptionEn,
    },
    {
      key: 'debitNote' as const,
      name: templatePresets.debitNote.nameTh,
      description: isThai ? templatePresets.debitNote.descriptionTh : templatePresets.debitNote.descriptionEn,
    },
  ];

  useEffect(() => {
    let active = true;
    async function loadTemplates() {
      try {
        const res = await fetch('/api/admin/templates', { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json() as { data?: typeof templates; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Failed to fetch templates');
        if (active) setTemplates(json.data ?? []);
      } catch (e) {
        if (active) setMsg({ type: 'err', text: (e as Error).message });
      } finally {
        if (active) setLoading(false);
      }
    }
    loadTemplates();
    return () => { active = false; };
  }, [token]);

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const url = editingId ? `/api/admin/templates/${editingId}` : '/api/admin/templates';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const json = await res.json() as { data?: typeof templates[number]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      if (json.data) {
        setTemplates((prev) => editingId ? prev.map((item) => item.id === json.data!.id ? json.data! : item) : [...prev, json.data!]);
      }
      setMsg({ type: 'ok', text: isThai ? 'บันทึกแม่แบบแล้ว' : 'Template saved' });
      setEditingId(null);
      setForm(emptyTemplateForm);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(template: typeof templates[number]) {
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !template.isActive }),
      });
      const json = await res.json() as { data?: typeof templates[number]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      if (json.data) {
        setTemplates((prev) => prev.map((item) => item.id === json.data!.id ? json.data! : { ...item, isActive: item.id === json.data!.id ? json.data!.isActive : false }));
      }
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm(isThai ? 'ลบแม่แบบนี้ใช่ไหม' : 'Delete this template?')) return;
    try {
      const res = await fetch(`/api/admin/templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed');
      setTemplates((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  function exportTemplate(template: typeof templates[number]) {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      template: {
        name: template.name,
        type: template.type,
        language: template.language,
        htmlTh: template.htmlTh,
        htmlEn: template.htmlEn,
        isActive: false,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${template.name.replace(/\s+/g, '-').toLowerCase() || 'template'}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg({
      type: 'ok',
      text: isThai ? 'ส่งออก template เป็น JSON แล้ว' : 'Template exported as JSON.',
    });
  }

  async function importTemplateFile(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        template?: {
          name?: string;
          type?: typeof emptyTemplateForm.type;
          language?: typeof emptyTemplateForm.language;
          htmlTh?: string;
          htmlEn?: string;
          isActive?: boolean;
        };
      };
      const imported = parsed.template;
      if (!imported?.name || !imported.type || !imported.language || !imported.htmlTh || !imported.htmlEn) {
        throw new Error(isThai ? 'ไฟล์ template JSON ไม่ครบหรือรูปแบบไม่ถูกต้อง' : 'Template JSON is incomplete or invalid.');
      }
      setEditingId(null);
      setForm({
        name: imported.name,
        type: imported.type,
        language: imported.language,
        htmlTh: imported.htmlTh,
        htmlEn: imported.htmlEn,
        isActive: imported.isActive ?? false,
      });
      setMsg({
        type: 'ok',
        text: isThai ? 'นำเข้า template แล้ว ตรวจสอบและกดบันทึกได้เลย' : 'Template imported. Review it and save when ready.',
      });
    } catch (error) {
      setMsg({
        type: 'err',
        text: error instanceof Error ? error.message : (isThai ? 'นำเข้า template ไม่สำเร็จ' : 'Template import failed.'),
      });
    }
  }

  function applyPreset(presetKey: TemplatePresetKey) {
    const preset = templatePresets[presetKey];
    setForm((prev) => ({
      ...prev,
      type: preset.type as TemplateDocType,
      language: 'both',
      htmlTh: preset.th,
      htmlEn: preset.en,
      name: prev.name || preset.nameTh,
    }));
    setMsg({
      type: 'ok',
      text: isThai ? 'เติม preset ให้แล้ว คุณแก้ข้อความต่อได้ทันที' : 'Preset applied. You can keep editing the copy and layout.',
    });
  }

  async function createStandardTemplateSet() {
    setSaving(true);
    setMsg(null);
    try {
      const createdTemplates: typeof templates = [];
      for (const preset of Object.values(templatePresets)) {
        const res = await fetch('/api/admin/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: preset.nameTh,
            type: preset.type,
            language: 'both',
            htmlTh: preset.th,
            htmlEn: preset.en,
            isActive: false,
          }),
        });
        const json = await res.json() as { data?: typeof templates[number]; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed to create template set');
        createdTemplates.push(json.data);
      }
      setTemplates((prev) => [...prev, ...createdTemplates]);
      setMsg({
        type: 'ok',
        text: isThai ? 'สร้างชุด template มาตรฐานครบ T01-T05 แล้ว' : 'Created the full T01-T05 standard template set.',
      });
    } catch (error) {
      setMsg({
        type: 'err',
        text: error instanceof Error ? error.message : (isThai ? 'สร้างชุด template ไม่สำเร็จ' : 'Failed to create template set.'),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-6 h-6 text-gray-400"/></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg text-gray-900">{t('admin.templates')}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {isThai ? 'จัดการแม่แบบเอกสารที่ระบบใช้ตอน Preview / PDF' : 'Manage document templates used by preview and PDF rendering.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void importTemplateFile(file);
              }
              e.currentTarget.value = '';
            }}
          />
          <button type="button" className="btn-secondary text-sm" onClick={() => importInputRef.current?.click()}>
            {isThai ? 'นำเข้า JSON' : 'Import JSON'}
          </button>
          <button type="button" className="btn-primary text-sm" onClick={createStandardTemplateSet} disabled={saving}>
            <Sparkles className="h-4 w-4" />
            {isThai ? 'สร้างชุด T01-T05' : 'Create T01-T05 set'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        <p className="font-semibold">
          {isThai ? 'หน้านี้ไม่ใช่หน้าสร้าง invoice' : 'This is not the invoice creation screen'}
        </p>
        <p className="mt-1">
          {isThai
            ? 'ใช้สำหรับปรับ HTML แม่แบบของ preview/PDF เท่านั้น ส่วนการออกเอกสารจริงให้ไปที่เมนูสร้างใบกำกับภาษี'
            : 'Use this page only to customize the HTML template used in preview and PDF output. To create actual documents, go to the invoice builder.'}
        </p>
      </div>

      <form onSubmit={saveTemplate} className="rounded-2xl border border-gray-200 p-4 space-y-4 bg-gray-50/60">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="label">{isThai ? 'ชื่อแม่แบบ' : 'Template name'}</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">{isThai ? 'ประเภทเอกสาร' : 'Document type'}</label>
            <select className="input-field" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as typeof form.type }))}>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {isThai ? option.th : option.en}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{isThai ? 'ภาษา' : 'Language'}</label>
            <select className="input-field" value={form.language} onChange={(e) => setForm((p) => ({ ...p, language: e.target.value as typeof form.language }))}>
              <option value="th">TH</option>
              <option value="en">EN</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
              {isThai ? 'เปิดใช้งานทันที' : 'Activate now'}
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-2xl bg-white px-4 py-3 text-xs text-gray-600">
          <div>
            <p className="font-semibold text-gray-900">{isThai ? 'Template ทำอะไร' : 'What a template changes'}</p>
            <p className="mt-1">{isThai ? 'มีผลกับรูปแบบ preview และ PDF เช่น header, footer, block ข้อความ' : 'It changes preview and PDF layout such as headers, footers, and text blocks.'}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900">{isThai ? 'Template ไม่ได้ทำอะไร' : 'What a template does not change'}</p>
            <p className="mt-1">{isThai ? 'ไม่ได้สร้าง invoice ใหม่ และไม่ได้เปลี่ยนข้อมูลลูกค้า/ยอดเงินในเอกสารเดิม' : 'It does not create invoices and does not change customer or amount data in existing documents.'}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900">{isThai ? 'ก่อนเปิดใช้งาน' : 'Before activating'}</p>
            <p className="mt-1">{isThai ? 'ควรทดสอบด้วย preview จากหน้าออกเอกสารก่อนเสมอ' : 'Always test with document preview in the invoice builder first.'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-xs text-sky-900">
          <p className="font-semibold">{isThai ? 'ตัวแปรที่ใช้ใน template ได้' : 'Template variables you can use'}</p>
          <p className="mt-1">
            {isThai
              ? 'รองรับตัวแปรเช่น {{documentTitle}}, {{invoiceNumber}}, {{invoiceDate}}, {{dueDate}}, {{sellerName}}, {{buyerName}}, {{subtotal}}, {{vatAmount}}, {{total}}, {{amountInWords}}, {{paymentMethod}}, {{notes}}'
              : 'Supported placeholders include {{documentTitle}}, {{invoiceNumber}}, {{invoiceDate}}, {{dueDate}}, {{sellerName}}, {{buyerName}}, {{subtotal}}, {{vatAmount}}, {{total}}, {{amountInWords}}, {{paymentMethod}}, and {{notes}}.'}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <FlaskConical className="h-4 w-4 text-sky-600" />
            {isThai ? 'Preset เริ่มต้น' : 'Starter presets'}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {isThai ? 'เลือก template ตามประเภทเอกสาร หรือกดสร้างชุด T01-T05 เพื่อเพิ่มครบทุกแบบให้เลือกใช้' : 'Pick a document-specific template, or create the full T01-T05 set for selection in the invoice builder.'}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {presetOptions.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset.key)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-sky-300 hover:bg-sky-50"
              >
                <div className="text-xs font-bold text-sky-700">{templatePresets[preset.key].label}</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{preset.name}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{preset.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr,1.1fr,0.95fr]">
          <div>
            <label className="label">HTML TH</label>
            <textarea className="input-field font-mono text-xs min-h-36" value={form.htmlTh} onChange={(e) => setForm((p) => ({ ...p, htmlTh: e.target.value }))} />
          </div>
          <div>
            <label className="label">HTML EN</label>
            <textarea className="input-field font-mono text-xs min-h-36" value={form.htmlEn} onChange={(e) => setForm((p) => ({ ...p, htmlEn: e.target.value }))} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{isThai ? 'Live Preview' : 'Live Preview'}</p>
                <p className="text-xs text-slate-500">
                  {previewLanguage === 'en'
                    ? (isThai ? 'กำลังดูตัวอย่างภาษาอังกฤษ' : 'Showing the English sample')
                    : (isThai ? 'กำลังดูตัวอย่างภาษาไทย' : 'Showing the Thai sample')}
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {previewLanguage}
              </span>
            </div>
            <div className="mt-3 h-[22rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <iframe
                title="Template live preview"
                srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>body{margin:0;padding:18px;font-family:Sarabun,system-ui,sans-serif;background:#f8fafc;color:#0f172a} .stage{border:1px solid #dbe2ea;border-radius:18px;background:#fff;padding:18px;box-shadow:0 10px 30px rgba(15,23,42,.06)} .eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin-bottom:10px} .title{font-size:20px;font-weight:700;color:#1e3a8a;margin-bottom:14px} .meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px} .meta-card{border:1px solid #e2e8f0;border-radius:14px;padding:10px 12px;background:#f8fafc;font-size:12px;color:#475569} .slot{border:1px dashed #cbd5e1;border-radius:16px;padding:14px;background:#fff}</style></head><body><div class="stage"><div class="eyebrow">Live Template Preview</div><div class="title">${templatePreviewSamples[previewLanguage].documentTitle}</div><div class="meta"><div class="meta-card">No. ${templatePreviewSamples[previewLanguage].invoiceNumber}</div><div class="meta-card">Date ${templatePreviewSamples[previewLanguage].invoiceDate}</div></div><div class="slot">${previewHtml || '<div style="color:#94a3b8">Empty template</div>'}</div></div></body></html>`}
                className="h-full w-full bg-white"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editingId ? (isThai ? 'บันทึกการแก้ไข' : 'Save changes') : (isThai ? 'สร้างแม่แบบ' : 'Create template')}
          </button>
          {editingId && (
            <button type="button" className="btn-secondary" onClick={() => {
              setEditingId(null);
              setForm(emptyTemplateForm);
            }}>
              {isThai ? 'ยกเลิก' : 'Cancel'}
            </button>
          )}
        </div>
      </form>

      {msg && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>}
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {templates.map((tpl) => (
          <div key={tpl.id} className={`border rounded-xl p-4 ${tpl.isActive ? 'border-primary-300 bg-primary-50/40' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900">{tpl.name}</span>
                  {tpl.isActive && <span className="badge-success text-xs">{isThai ? 'ใช้งานอยู่' : 'Active'}</span>}
                </div>
                <p className="text-xs text-gray-500 uppercase">{tpl.type} · {tpl.language}</p>
              </div>
              <Sparkles className="w-4 h-4 text-primary-500 flex-shrink-0" />
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button className="btn-secondary text-xs" onClick={() => {
                setEditingId(tpl.id);
                setForm({
                  name: tpl.name,
                  type: tpl.type,
                  language: tpl.language,
                  htmlTh: tpl.htmlTh,
                  htmlEn: tpl.htmlEn,
                  isActive: tpl.isActive,
                });
              }}>
                {t('common.edit')}
              </button>
              <button className="btn-primary text-xs" onClick={() => toggleActive(tpl)}>
                {tpl.isActive ? (isThai ? 'ปิดใช้งาน' : 'Disable') : (isThai ? 'ตั้งเป็นใช้งาน' : 'Set active')}
              </button>
            </div>
            <button className="mt-2 text-xs text-sky-700 hover:underline" onClick={() => exportTemplate(tpl)}>
              {isThai ? 'ส่งออก JSON' : 'Export JSON'}
            </button>
            <button className="mt-2 text-xs text-red-600 hover:underline" onClick={() => deleteTemplate(tpl.id)}>
              {t('common.delete')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingTab({ isThai }: { isThai: boolean }) {
  const { token } = useAuthStore();
  const { policy } = useCompanyAccessPolicy();
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [overageCharging, setOverageCharging] = useState(false);
  const [subscription, setSubscription] = useState<null | {
    plan: string;
    status: string;
    billingInterval: string;
    docLimit?: number | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd: boolean;
    activatedAt?: string | null;
  }>(null);
  const [overage, setOverage] = useState<null | {
    plan: string;
    planLabel: string;
    periodStart: string;
    periodEnd: string;
    includedDocuments?: number | null;
    usedDocuments: number;
    remainingDocuments?: number | null;
    overageDocuments: number;
    unitPriceThb: number;
    estimatedOverageThb: number;
    billable: boolean;
    status: 'unlimited' | 'overage' | 'near_limit' | 'ok';
    autoChargeEnabled: boolean;
    existingCharge?: {
      id: string;
      status: string;
      totalAmount: number;
      externalReference?: string | null;
      createdAt: string;
    } | null;
  }>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadBilling() {
      try {
        const [subscriptionRes, overageRes] = await Promise.all([
          fetch('/api/billing/subscription', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/billing/usage-overage', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const subscriptionJson = await subscriptionRes.json() as { data?: typeof subscription; error?: string };
        const overageJson = await overageRes.json() as { data?: typeof overage; error?: string };
        if (!subscriptionRes.ok) throw new Error(subscriptionJson.error ?? 'Failed to load billing');
        if (!overageRes.ok) throw new Error(overageJson.error ?? 'Failed to load overage usage');
        if (active) {
          setSubscription(subscriptionJson.data ?? null);
          setOverage(overageJson.data ?? null);
        }
      } catch (err) {
        if (active) setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBilling();
    return () => { active = false; };
  }, [token]);

  async function openPortal() {
    setPortalLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/portal-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { data?: { url?: string }; error?: string };
      if (!res.ok || !json.data?.url) throw new Error(json.error ?? 'Unable to open billing portal');
      window.location.href = json.data.url;
    } catch (err) {
      setError((err as Error).message);
      setPortalLoading(false);
    }
  }

  async function chargeOverage() {
    if (!window.confirm(isThai ? 'ยืนยันสร้างรายการเก็บเงินเอกสารเกินแพ็กเกจ?' : 'Confirm charging this month’s document overage?')) return;
    setOverageCharging(true);
    setError('');
    try {
      const res = await fetch('/api/billing/usage-overage/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirm: 'CHARGE_OVERAGE' }),
      });
      const json = await res.json() as { data?: unknown; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Unable to charge overage');
      const refreshed = await fetch('/api/billing/usage-overage', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const refreshedJson = await refreshed.json() as { data?: typeof overage; error?: string };
      if (!refreshed.ok) throw new Error(refreshedJson.error ?? 'Failed to refresh overage usage');
      setOverage(refreshedJson.data ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOverageCharging(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-semibold text-lg text-gray-900">{isThai ? 'แพ็กเกจและการชำระเงิน' : 'Billing & Plan'}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {isThai ? 'ดูสถานะแพ็กเกจปัจจุบันและเปิด Stripe customer portal เพื่อจัดการการชำระเงิน' : 'Review your active plan and open the Stripe customer portal to manage billing.'}
        </p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!subscription ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
          {policy?.plan === 'free'
            ? (isThai ? 'บริษัทนี้ใช้แพ็กเกจ Free อยู่ สามารถอัปเกรดเป็น Starter หรือ Business เพื่อปลดล็อกฟีเจอร์เพิ่มได้' : 'This company is on the Free plan. Upgrade to Starter or Business to unlock more features.')
            : (isThai ? 'บริษัทยังไม่มีข้อมูลสมาชิกแบบชำระเงิน' : 'This company does not have an active paid subscription yet.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-2">{isThai ? 'แพ็กเกจปัจจุบัน' : 'Current plan'}</p>
            <p className="text-3xl font-bold text-gray-900 capitalize">{subscription.plan}</p>
            <p className="mt-2 text-sm text-gray-600">
              {subscription.docLimit
                ? (isThai ? `รองรับสูงสุด ${subscription.docLimit.toLocaleString()} เอกสาร/เดือน` : `Up to ${subscription.docLimit.toLocaleString()} documents per month`)
                : (isThai ? 'ไม่จำกัดจำนวนเอกสาร' : 'Unlimited documents')}
            </p>
          </div>

          <div className="card">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-2">{isThai ? 'สถานะสมาชิก' : 'Subscription status'}</p>
            <p className="text-3xl font-bold text-gray-900">{subscription.status}</p>
            <p className="mt-2 text-sm text-gray-600">
              {subscription.currentPeriodEnd
                ? (isThai
                  ? `รอบบิลปัจจุบันสิ้นสุด ${new Date(subscription.currentPeriodEnd).toLocaleDateString('th-TH')}`
                  : `Current billing period ends ${new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB')}`)
                : (isThai ? 'ยังไม่มีวันสิ้นสุดรอบบิล' : 'No billing period end date yet')}
            </p>
          </div>
        </div>
      )}

      {overage && (
        <div className="card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-2">{isThai ? 'เอกสารเกินแพ็กเกจ' : 'Document overage'}</p>
              <p className="text-2xl font-bold text-gray-900">
                {overage.overageDocuments.toLocaleString()} {isThai ? 'เอกสาร' : 'docs'}
                <span className="ml-2 text-base font-semibold text-gray-500">/ ฿{overage.estimatedOverageThb.toLocaleString()}</span>
              </p>
              <p className="mt-2 text-sm text-gray-600">
                {isThai
                  ? `ใช้ ${overage.usedDocuments.toLocaleString()} จาก ${overage.includedDocuments?.toLocaleString() ?? 'ไม่จำกัด'} เอกสารในรอบนี้`
                  : `Used ${overage.usedDocuments.toLocaleString()} of ${overage.includedDocuments?.toLocaleString() ?? 'unlimited'} documents this period`}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {isThai ? 'ราคาเอกสารเกิน' : 'Overage unit price'} ฿{overage.unitPriceThb.toLocaleString()} / {isThai ? 'เอกสาร' : 'doc'}
                {' · '}
                {new Date(overage.periodStart).toLocaleDateString(isThai ? 'th-TH' : 'en-GB')} - {new Date(overage.periodEnd).toLocaleDateString(isThai ? 'th-TH' : 'en-GB')}
              </p>
              {overage.existingCharge && (
                <p className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                  {isThai ? 'มีรายการเก็บเงินแล้ว' : 'Charge created'}: {overage.existingCharge.status}
                </p>
              )}
              {!overage.autoChargeEnabled && (
                <p className="mt-2 text-xs text-amber-700">
                  {isThai
                    ? 'ยังปิดโหมดตัดเงินจริงอยู่ ต้องเปิด OVERAGE_BILLING_AUTO_CHARGE_ENABLED=true ก่อนใช้งานจริง'
                    : 'Real auto charge is disabled until OVERAGE_BILLING_AUTO_CHARGE_ENABLED=true is set.'}
                </p>
              )}
            </div>
            <button
              className="btn-primary"
              onClick={chargeOverage}
              disabled={!overage.billable || overageCharging || !!overage.existingCharge}
            >
              {overageCharging ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {isThai ? 'สร้างรายการเก็บเงินเกินแพ็กเกจ' : 'Charge overage'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button className="btn-primary" onClick={openPortal} disabled={portalLoading || !subscription}>
          {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {isThai ? 'จัดการบัตรและใบเสร็จใน Stripe' : 'Manage cards and invoices in Stripe'}
        </button>
      </div>
    </div>
  );
}

function RDConfigTab({ isThai }: { isThai: boolean; t: (k: string) => string }) {
  const { token } = useAuthStore();
  const [config, setConfig] = useState({ clientId: '', clientSecret: '', environment: 'sandbox' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok'|'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/rd-config', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => {
        const d = (j as { data?: { environment?: string; clientId?: string } }).data;
        setConfig(c => ({ ...c, environment: d?.environment ?? 'sandbox', clientId: d?.clientId ?? '' }));
      }).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  async function handleSave() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/rd-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed');
      setMsg({ type: 'ok', text: isThai ? 'บันทึกสำเร็จ' : 'Saved successfully' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-6 h-6 text-gray-400"/></div>;

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-lg text-gray-900">{isThai ? 'ตั้งค่า RD API' : 'RD API Configuration'}</h2>
      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 flex gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5"/>
        {isThai ? 'กรอก Client ID / Secret ที่ได้รับจากสรรพากรหลังได้รับอนุมัติ ตอน sandbox ปล่อยว่างไว้ได้' : 'Enter Client ID / Secret received from RD after approval. Leave blank for sandbox mock mode.'}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">{isThai ? 'สภาพแวดล้อม' : 'Environment'}</label>
          <select className="input-field" value={config.environment}
            onChange={e => setConfig(c => ({ ...c, environment: e.target.value }))}>
            <option value="sandbox">{isThai ? '🧪 ทดสอบ (Sandbox / Mock)' : '🧪 Sandbox (Mock)'}</option>
            <option value="production">{isThai ? '🚀 จริง (Production)' : '🚀 Production'}</option>
          </select>
        </div>
        <div>
          <label className="label">RD Client ID</label>
          <input className="input-field font-mono text-xs" placeholder="rd_client_xxxxx"
            value={config.clientId} onChange={e => setConfig(c => ({ ...c, clientId: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">RD Client Secret</label>
          <input type="password" className="input-field font-mono text-xs" placeholder="••••••••••••"
            value={config.clientSecret} onChange={e => setConfig(c => ({ ...c, clientSecret: e.target.value }))} />
          <p className="text-xs text-gray-400 mt-1">{isThai ? 'ข้อมูลนี้เข้ารหัสก่อนบันทึก' : 'This value is encrypted before storing'}</p>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>}
          {msg.text}
        </div>
      )}

      <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : isThai ? 'บันทึก' : 'Save'}
      </button>
    </div>
  );
}

function CertificateTab({ isThai }: { isThai: boolean; t: (k: string) => string }) {
  const { token } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [certInfo, setCertInfo] = useState<Record<string, unknown> | null>(null);
  const [password, setPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok'|'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/certificate', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => setCertInfo((j as { data?: Record<string, unknown> }).data ?? null))
      .catch(() => {});
  }, [token]);

  async function handleUpload() {
    if (!selectedFile || !password) {
      setMsg({ type: 'err', text: isThai ? 'กรุณาเลือกไฟล์และใส่รหัสผ่าน' : 'Please select a file and enter password' });
      return;
    }
    setUploading(true); setMsg(null);
    try {
      const arrayBuf = await selectedFile.arrayBuffer();
      const p12Base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
      const res = await fetch('/api/admin/certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ p12Base64, password }),
      });
      const json = await res.json() as { data?: Record<string, unknown>; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      setCertInfo(json.data ?? null);
      setMsg({ type: 'ok', text: isThai ? '✅ อัพโหลด Certificate สำเร็จ' : '✅ Certificate uploaded successfully' });
      setSelectedFile(null);
      setPassword('');
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally { setUploading(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/admin/signing-test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setTestResult(await res.json() as Record<string, unknown>);
    } catch (e) {
      setTestResult({ success: false, error: (e as Error).message });
    } finally { setTesting(false); }
  }

  const loaded = certInfo?.loaded as boolean | undefined;
  const isDev   = certInfo?.isDev as boolean | undefined;
  const isExpired = certInfo?.isExpired as boolean | undefined;

  return (
    <div className="space-y-5">
      <h2 className="font-semibold text-lg text-gray-900">
        {isThai ? '🔐 ใบรับรองดิจิทัล (Digital Certificate)' : '🔐 Digital Certificate'}
      </h2>

      {/* Current cert status */}
      <div className={`p-4 rounded-xl border ${loaded ? (isExpired ? 'bg-red-50 border-red-200' : isDev ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200') : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-start gap-3">
          {loaded
            ? isExpired ? <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"/>
            : <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0"/>
            : <AlertTriangle className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0"/>
          }
          <div className="space-y-1 text-sm">
            {loaded ? (
              <>
                <p className="font-semibold">{certInfo?.commonName as string}</p>
                {isDev && <span className="inline-block px-2 py-0.5 bg-amber-200 text-amber-800 text-xs rounded font-medium">DEV Self-Signed</span>}
                {isExpired && <span className="inline-block px-2 py-0.5 bg-red-200 text-red-800 text-xs rounded font-medium">EXPIRED</span>}
                <p className="text-gray-500">{isThai ? 'หมดอายุ:' : 'Valid until:'} {new Date(certInfo?.validUntil as string).toLocaleDateString('th-TH')}</p>
                <p className="text-gray-400 font-mono text-xs break-all">SHA-256: {(certInfo?.thumbprint as string)?.slice(0, 32)}...</p>
              </>
            ) : (
              <p className="text-gray-500">{certInfo?.error as string ?? (isThai ? 'ยังไม่ได้ตั้งค่า Certificate' : 'No certificate configured')}</p>
            )}
          </div>
        </div>
      </div>

      {isDev && loaded && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 space-y-1">
          <p className="font-semibold">⚠️ {isThai ? 'ใช้ Self-Signed Certificate (Dev Mode)' : 'Using Self-Signed Certificate (Dev Mode)'}</p>
          <p>{isThai ? 'Certificate นี้สร้างขึ้นเพื่อทดสอบเท่านั้น สรรพากรจะ reject ถ้าส่งจริง ต้องใช้ Certificate จาก TDID/INET/TOT' : 'This certificate is for testing only. RD will reject it in production. Replace with a TDID/INET/TOT issued certificate.'}</p>
        </div>
      )}

      {/* Upload new cert */}
      <div className="space-y-3">
        <h3 className="font-medium text-gray-800">{isThai ? 'อัพโหลด Certificate ใหม่' : 'Upload New Certificate'}</h3>
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-primary-400 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2"/>
          {selectedFile ? (
            <p className="text-sm font-medium text-primary-600">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</p>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700">{isThai ? 'คลิกเพื่อเลือกไฟล์ .p12 / .pfx' : 'Click to select .p12 / .pfx file'}</p>
              <p className="text-xs text-gray-400 mt-1">PKCS#12 format</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".p12,.pfx" className="hidden"
            onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} />
        </div>

        <div>
          <label className="label">{isThai ? 'รหัสผ่าน Certificate' : 'Certificate Password'}</label>
          <input type="password" className="input-field" placeholder="••••••••"
            value={password} onChange={e => setPassword(e.target.value)} />
        </div>

        {msg && (
          <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {msg.type === 'ok' ? <CheckCircle className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>}
            {msg.text}
          </div>
        )}

        <button className="btn-primary" onClick={handleUpload} disabled={uploading || !selectedFile}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
          {isThai ? 'อัพโหลดและตรวจสอบ' : 'Upload & Validate'}
        </button>
      </div>

      {/* Signing test */}
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-800">{isThai ? '🧪 ทดสอบระบบ Signing' : '🧪 Signing System Test'}</h3>
          <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={handleTest} disabled={testing || !loaded}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin"/> : <FlaskConical className="w-4 h-4"/>}
            {isThai ? 'ทดสอบเลย' : 'Run Test'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {isThai ? 'ทดสอบ: โหลด cert → Sign XML (XAdES-BES) → ขอ Timestamp (TSA) — ตรวจสอบว่า pipeline ทำงานได้ก่อนส่งจริง' : 'Tests: load cert → Sign XML (XAdES-BES) → Request TSA timestamp — verify pipeline works before live submission'}
        </p>

        {testResult && (
          <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-sm">
            <div className={`flex items-center gap-2 font-semibold ${(testResult.success as boolean) ? 'text-green-700' : 'text-red-600'}`}>
              {(testResult.success as boolean) ? <CheckCircle className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>}
              {(testResult.success as boolean)
                ? (isThai ? 'ทุกขั้นตอนผ่าน ✅' : 'All steps passed ✅')
                : (isThai ? 'มีขั้นตอนที่ล้มเหลว ❌' : 'Some steps failed ❌')}
            </div>
            {((testResult.steps ?? []) as { step: string; status: string; detail?: string; ms?: number }[]).map((s, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs ${s.status === 'ok' ? 'text-gray-600' : 'text-red-600'}`}>
                {s.status === 'ok' ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 text-green-500 flex-shrink-0"/> : <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/>}
                <div>
                  <span className="font-medium">{s.step}</span>
                  {s.ms !== undefined && <span className="text-gray-400 ml-1">({s.ms}ms)</span>}
                  {s.detail && <p className="text-gray-500 font-mono break-all">{s.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LineTab({ policy, isThai }: { policy: CompanyAccessPolicy | null; isThai: boolean }) {
  const { token } = useAuthStore();
  type LineManagedUser = {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    line: {
      linked: boolean;
      displayName?: string | null;
      linkedAt?: string | null;
      lineUserIdMasked?: string | null;
    };
  };
  type LineManagedGroup = {
    id: string;
    groupName?: string | null;
    projectId?: string | null;
    project?: { id: string; code: string; name: string; status: string } | null;
    isActive: boolean;
    linkedAt?: string | null;
    lineGroupIdMasked?: string | null;
    linkedBy?: { id: string; name: string; email: string } | null;
  };
  type ProjectOption = { id: string; code: string; name: string; status: string };
  const [lineStatus, setLineStatus] = useState<{
    linked: boolean;
    displayName?: string;
    lineNotifyEnabled: boolean;
    overdueReminderDays: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localNotifyEnabled, setLocalNotifyEnabled] = useState(false);
  const [localReminderDays, setLocalReminderDays] = useState(3);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState<{
    checkedAt: string;
    webhook?: { lastWebhookAt?: string; lastEventCount?: number; lastUnhandledError?: { at: string; eventType?: string; message: string } };
    lineMessaging?: {
      configured: boolean;
      lastPushOkAt?: string;
      lastReplyOkAt?: string;
      lastPushFailure?: { at: string; status?: number; body?: string; error?: string };
      lastReplyFailure?: { at: string; status?: number; body?: string; error?: string };
    };
    redis?: { ok: boolean; error?: string };
    documentIntakesSchema?: { ok: boolean; missingColumns: string[]; error?: string };
    recentDocumentIntakes?: {
      ok: boolean;
      items: Array<{
        id: string;
        source: string;
        sourceMessageId?: string | null;
        fileName?: string | null;
        status: string;
        mimeType: string;
        fileSize?: number;
        projectId?: string | null;
        project?: { id: string; code: string; name: string } | null;
        targetType?: string | null;
        targetId?: string | null;
        purchaseInvoiceId?: string | null;
        error?: string | null;
        driveSyncStatus?: string | null;
        driveUrl?: string | null;
        driveSyncError?: string | null;
        processedAt?: string | null;
        createdAt: string;
        updatedAt: string;
        ocrSummary?: {
          documentType?: string | null;
          documentTypeLabel?: string | null;
          counterparty?: string | null;
          invoiceNumber?: string | null;
          total?: number | null;
          vatAmount?: number | null;
          confidence?: string | null;
          stages?: string[];
          warningCount?: number;
          firstWarning?: string | null;
        };
      }>;
    };
    linkedUsers?: { ok: boolean; count: number };
    linkedGroups?: { ok: boolean; count: number };
    documentOps?: {
      windowDays: number;
      byStatus: Record<string, number>;
      bySource?: Record<string, number>;
      byMimeType?: Record<string, number>;
      usageTelemetry?: { salesInvoices: number; purchaseInvoices: number; documentIntakes: number; billableDocuments: number; estimatedOcrCostThb: number };
      storage: { configured: boolean; storageBacked: number; databaseBacked: number; duplicateWarnings: number };
    };
    ocrReadiness?: { productionReady: boolean; tier: string; warnings?: string[]; models?: { fastTextOrPdf?: string; scanImageOrPdf?: string; proEscalation?: string | null } };
  } | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [managedUsers, setManagedUsers] = useState<LineManagedUser[]>([]);
  const [managedUsersLoading, setManagedUsersLoading] = useState(false);
  const [userOtp, setUserOtp] = useState<null | { userId: string; userName: string; otp: string }>(null);
  const [managedGroups, setManagedGroups] = useState<LineManagedGroup[]>([]);
  const [managedGroupsLoading, setManagedGroupsLoading] = useState(false);
  const [groupOtp, setGroupOtp] = useState<null | { otp: string }>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [groupProjectSavingId, setGroupProjectSavingId] = useState<string | null>(null);
  const [groupPortalSavingId, setGroupPortalSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!policy?.canUseLineOa) { setLoading(false); return; }
    fetch('/api/line/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => {
        const d = (j as { data?: { linked: boolean; displayName?: string; lineNotifyEnabled: boolean; overdueReminderDays: number } }).data ?? null;
        setLineStatus(d);
        if (d) {
          setLocalNotifyEnabled(d.lineNotifyEnabled);
          setLocalReminderDays(d.overdueReminderDays);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, policy?.canUseLineOa]);

  async function loadManagedUsers() {
    setManagedUsersLoading(true);
    try {
      const res = await fetch('/api/line/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json() as { data?: LineManagedUser[] };
      setManagedUsers(json.data ?? []);
    } catch {
      setManagedUsers([]);
    } finally {
      setManagedUsersLoading(false);
    }
  }

  async function loadManagedGroups() {
    setManagedGroupsLoading(true);
    try {
      const res = await fetch('/api/line/admin/groups', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json() as { data?: LineManagedGroup[] };
      setManagedGroups(json.data ?? []);
    } catch {
      setManagedGroups([]);
    } finally {
      setManagedGroupsLoading(false);
    }
  }

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects?status=all', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json() as { data?: ProjectOption[] };
      setProjects(json.data ?? []);
    } catch {
      setProjects([]);
    }
  }

  useEffect(() => {
    if (!policy?.canUseLineOa) return;
    void loadManagedUsers();
    void loadManagedGroups();
    void loadProjects();
  }, [token, policy?.canUseLineOa]);

  useEffect(() => {
    if (!policy?.canUseLineOa) return;
    let cancelled = false;
    async function loadLiveStatus() {
      setLiveLoading(true);
      try {
        const res = await fetch('/api/line/admin/live-status', { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json() as { data?: typeof liveStatus };
        if (!cancelled) setLiveStatus(json.data ?? null);
      } catch {
        if (!cancelled) setLiveStatus(null);
      } finally {
        if (!cancelled) setLiveLoading(false);
      }
    }
    void loadLiveStatus();
    const timer = window.setInterval(loadLiveStatus, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, policy?.canUseLineOa]);

  async function handleUserLinkStart(user: LineManagedUser) {
    setMsg(null);
    setUserOtp(null);
    try {
      const res = await fetch(`/api/line/admin/users/${user.id}/link-start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { data?: { otp: string }; error?: string };
      if (!res.ok || !json.data?.otp) {
        setMsg({ type: 'err', text: json.error ?? (isThai ? 'สร้างรหัสเชื่อมต่อไม่สำเร็จ' : 'Failed to create link code') });
        return;
      }
      setUserOtp({ userId: user.id, userName: user.name, otp: json.data.otp });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  async function handleUserUnlink(user: LineManagedUser) {
    if (!confirm(isThai ? `ยืนยันถอด LINE จาก ${user.name}?` : `Unlink LINE from ${user.name}?`)) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/line/admin/users/${user.id}/unlink`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed');
      setUserOtp(null);
      await loadManagedUsers();
      setMsg({ type: 'ok', text: isThai ? 'ถอดการเชื่อมต่อ LINE แล้ว' : 'LINE account unlinked.' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  async function handleGroupLinkStart() {
    setMsg(null);
    setGroupOtp(null);
    try {
      const res = await fetch('/api/line/admin/groups/link-start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { data?: { otp: string }; error?: string };
      if (!res.ok || !json.data?.otp) {
        setMsg({ type: 'err', text: json.error ?? (isThai ? 'สร้างรหัสเชื่อมกลุ่มไม่สำเร็จ' : 'Failed to create group link code') });
        return;
      }
      setGroupOtp({ otp: json.data.otp });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  async function handleGroupUnlink(group: LineManagedGroup) {
    if (!confirm(isThai ? `ยืนยันถอด LINE group ${group.groupName ?? group.lineGroupIdMasked ?? ''}?` : `Unlink LINE group ${group.groupName ?? group.lineGroupIdMasked ?? ''}?`)) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/line/admin/groups/${group.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed');
      setGroupOtp(null);
      await loadManagedGroups();
      setMsg({ type: 'ok', text: isThai ? 'ถอดการเชื่อมต่อกลุ่ม LINE แล้ว' : 'LINE group unlinked.' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  async function handleGroupProjectChange(group: LineManagedGroup, projectId: string) {
    setMsg(null);
    setGroupProjectSavingId(group.id);
    try {
      const res = await fetch(`/api/line/admin/groups/${group.id}/project`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId: projectId || null }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      await loadManagedGroups();
      setMsg({ type: 'ok', text: isThai ? 'อัปเดตโปรเจคของกลุ่ม LINE แล้ว' : 'LINE group project updated.' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setGroupProjectSavingId(null);
    }
  }

  async function handleCreateGroupPortalLink(group: LineManagedGroup) {
    setMsg(null);
    setGroupPortalSavingId(group.id);
    try {
      const res = await fetch(`/api/line/admin/groups/${group.id}/portal-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { data?: { url: string; expiresIn: string }; error?: string };
      if (!res.ok || !json.data?.url) throw new Error(json.error ?? 'Failed');
      await navigator.clipboard.writeText(json.data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setMsg({
        type: 'ok',
        text: isThai
          ? `คัดลอกลิงก์ Project Portal แล้ว ใช้ได้ ${json.data.expiresIn}`
          : `Project portal link copied. Valid for ${json.data.expiresIn}.`,
      });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setGroupPortalSavingId(null);
    }
  }

  async function handleSaveSettings() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/line/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lineNotifyEnabled: localNotifyEnabled, overdueReminderDays: localReminderDays }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed');
      setMsg({ type: 'ok', text: isThai ? 'บันทึกการตั้งค่าสำเร็จ' : 'Settings saved successfully' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally { setSaving(false); }
  }

  function copyUserOtp() {
    if (!userOtp) return;
    navigator.clipboard.writeText(userOtp.otp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyGroupOtp() {
    if (!groupOtp) return;
    navigator.clipboard.writeText(groupOtp.otp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function healthPill(ok?: boolean, label?: string) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        {ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {label ?? (ok ? 'OK' : 'Issue')}
      </span>
    );
  }

  function statusPill(status: string) {
    const tone =
      status === 'saved' ? 'bg-green-50 text-green-700 border-green-100'
      : status === 'failed' || status === 'rejected' ? 'bg-red-50 text-red-700 border-red-100'
      : status === 'needs_review' || status === 'awaiting_input' || status === 'awaiting_confirmation' ? 'bg-amber-50 text-amber-700 border-amber-100'
      : 'bg-gray-50 text-gray-700 border-gray-100';
    return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{status}</span>;
  }

  function drivePill(status?: string | null) {
    const ok = status === 'synced';
    const warn = status === 'failed';
    const tone = ok ? 'bg-blue-50 text-blue-700 border-blue-100' : warn ? 'bg-red-50 text-red-700 border-red-100' : 'bg-gray-50 text-gray-600 border-gray-100';
    return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>Drive: {status || 'not_synced'}</span>;
  }

  function formatMoney(value?: number | null) {
    if (typeof value !== 'number') return '-';
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value);
  }

  function formatFileSize(value?: number) {
    if (!value) return '-';
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${Math.round((value / (1024 * 1024)) * 10) / 10} MB`;
  }

  if (!policy?.canUseLineOa) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
          <Lock className="w-7 h-7 text-amber-500" />
        </div>
        <div>
          <p className="font-semibold text-gray-800 mb-1">
            {isThai ? 'ฟีเจอร์นี้ต้องการแพ็กเกจสูงกว่า' : 'Feature requires a higher plan'}
          </p>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            {isThai
              ? 'อัปเกรดแพ็กเกจเพื่อใช้งาน LINE AI Assistant Billboy'
              : 'Upgrade your plan to use the LINE AI Assistant (Billboy).'}
          </p>
        </div>
        <Link to="/app/plan" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
          <Zap className="w-4 h-4" />
          {isThai ? 'ดูแพ็กเกจทั้งหมด' : 'View plans'}
        </Link>
      </div>
    );
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="font-semibold text-lg text-gray-900">
        {isThai ? 'LINE Billboy' : 'LINE AI Assistant (Billboy)'}
      </h2>

      {/* Section 1: Features — 4 document groups */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 space-y-4">
        <p className="font-semibold text-indigo-900 text-sm">
          {isThai ? 'Billboy รองรับเอกสาร 16+ ประเภท ครอบคลุม 4 กลุ่มงาน' : 'Billboy supports 16+ document types across 4 categories'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-white/70 border border-indigo-100 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-indigo-700">{isThai ? 'ภาษีซื้อ (Input VAT)' : 'Input VAT Documents'}</p>
            <p className="text-xs text-indigo-800">{isThai ? 'ใบกำกับภาษี, ใบเสร็จ, ใบแจ้งหนี้, ใบวางบิล, ใบลดหนี้, ใบเพิ่มหนี้' : 'Tax invoice, receipt, invoice, billing note, credit note, debit note'}</p>
          </div>
          <div className="rounded-lg bg-white/70 border border-indigo-100 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-emerald-700">{isThai ? 'หลักฐานชำระเงิน' : 'Payment Proofs'}</p>
            <p className="text-xs text-indigo-800">{isThai ? 'สลิปโอนเงินทุกธนาคาร, รายการเดินบัญชี, Payment Advice' : 'Bank transfer slips, bank statements, payment advice'}</p>
          </div>
          <div className="rounded-lg bg-white/70 border border-indigo-100 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-purple-700">{isThai ? 'เอกสารประกอบ' : 'Supporting Documents'}</p>
            <p className="text-xs text-indigo-800">{isThai ? 'ใบเสนอราคา, Purchase Order (PO), ใบส่งของ, สัญญา, หนังสือหัก ณ ที่จ่าย' : 'Quotation, PO, delivery note, contract, withholding tax cert'}</p>
          </div>
          <div className="rounded-lg bg-white/70 border border-indigo-100 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-amber-700">{isThai ? 'AI อัจฉริยะ' : 'Smart AI'}</p>
            <p className="text-xs text-indigo-800">{isThai ? 'ถามตอบบัญชี, สรุป VAT, แจ้งเตือนเกินกำหนด, พิมพ์ไทยได้เลย' : 'Accounting Q&A, VAT summary, overdue alerts, natural Thai input'}</p>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Section 2: Add friend Billboy — QR code prominent */}
      <div className="border border-green-200 rounded-xl bg-green-50 p-5 space-y-4">
        <h3 className="font-medium text-green-900">
          {isThai ? 'เพิ่มเพื่อน LINE Billboy' : 'Add Billboy on LINE'}
        </h3>
        <div className="flex items-start gap-5">
          <a href="https://line.me/R/ti/p/@566fvjbg" target="_blank" rel="noreferrer" className="flex-shrink-0">
            <img
              src="https://qr-official.line.me/g/M/566fvjbg.png"
              alt="QR Code Billboy"
              className="w-32 h-32 rounded-lg border border-green-200 shadow-sm"
            />
          </a>
          <div className="space-y-2">
            <p className="text-sm text-green-800">
              {isThai ? 'สแกน QR หรือกดลิงก์ด้านล่างเพื่อเพิ่มเพื่อน Billboy ทุกคนในบริษัทต้องเพิ่มเพื่อนก่อนเชื่อมบัญชี' : 'Scan the QR code or click the link below. Every user must add Billboy before linking their account.'}
            </p>
            <a
              href="https://line.me/R/ti/p/@566fvjbg"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#06C755] px-4 py-2 text-sm font-semibold text-white hover:bg-[#05b34d] transition-colors"
            >
              <Link2 className="w-4 h-4" />
              {isThai ? 'เพิ่มเพื่อน @566fvjbg' : 'Add friend @566fvjbg'}
            </a>
          </div>
        </div>
      </div>

      {/* Section 3: Connection — admin-managed users */}
      <div className="border border-gray-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-medium text-gray-800">
              {isThai ? 'เชื่อมบัญชี LINE กับผู้ใช้' : 'Link LINE to user accounts'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {isThai
                ? 'กดปุ่ม "สร้างรหัส" ข้างชื่อผู้ใช้ → ได้รหัส 6 หลัก → ให้ผู้ใช้ส่งรหัสนั้นในแชท Billboy บน LINE (หมดอายุ 10 นาที)'
                : 'Click "Generate code" next to a user → get a 6-digit code → have the user send it to Billboy in LINE (expires in 10 min).'}
            </p>
          </div>
          <button className="btn-secondary text-sm" onClick={() => void loadManagedUsers()} disabled={managedUsersLoading}>
            {managedUsersLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            {isThai ? 'รีเฟรช' : 'Refresh'}
          </button>
        </div>

        {userOtp && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">
              {isThai ? `รหัสเชื่อมต่อสำหรับ ${userOtp.userName}` : `Link code for ${userOtp.userName}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="font-mono text-3xl font-bold tracking-[0.3em] text-amber-900 select-all">{userOtp.otp}</span>
              <button className="btn-secondary text-xs" onClick={copyUserOtp}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? (isThai ? 'คัดลอกแล้ว' : 'Copied') : (isThai ? 'คัดลอก' : 'Copy')}
              </button>
            </div>
            <p className="mt-2 text-xs text-amber-800">
              {isThai ? 'ส่งรหัสนี้ให้ผู้ใช้พิมพ์ใน LINE ภายใน 10 นาที' : 'Ask this user to send the code in LINE within 10 minutes.'}
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-100">
          <div className="grid grid-cols-[1.4fr_.7fr_.9fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 md:grid-cols-[1.6fr_.7fr_.9fr_.9fr]">
            <span>{isThai ? 'ผู้ใช้' : 'User'}</span>
            <span>Role</span>
            <span>LINE</span>
            <span className="hidden md:block">{isThai ? 'จัดการ' : 'Action'}</span>
          </div>
          <div className="divide-y divide-gray-100 bg-white">
            {managedUsers.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-gray-500">
                {managedUsersLoading ? (isThai ? 'กำลังโหลด...' : 'Loading...') : (isThai ? 'ยังไม่มีผู้ใช้ให้แสดง' : 'No users to show.')}
              </div>
            )}
            {managedUsers.map((managedUser) => (
              <div key={managedUser.id} className="grid grid-cols-[1.4fr_.7fr_.9fr] gap-3 px-3 py-3 text-sm md:grid-cols-[1.6fr_.7fr_.9fr_.9fr] md:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{managedUser.name}</p>
                  <p className="truncate text-xs text-gray-500">{managedUser.email}</p>
                </div>
                <span className="text-xs capitalize text-gray-600">{managedUser.role}</span>
                <div className="min-w-0">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${managedUser.line.linked ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {managedUser.line.linked ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {managedUser.line.linked ? (isThai ? 'เชื่อมแล้ว' : 'Linked') : (isThai ? 'ยังไม่เชื่อม' : 'Unlinked')}
                  </span>
                  {managedUser.line.lineUserIdMasked && (
                    <p className="mt-1 truncate text-[11px] text-gray-400">{managedUser.line.lineUserIdMasked}</p>
                  )}
                </div>
                <div className="col-span-3 flex flex-wrap gap-2 md:col-span-1">
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => void handleUserLinkStart(managedUser)}
                    disabled={!managedUser.isActive}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    {managedUser.line.linked ? (isThai ? 'เชื่อมใหม่' : 'Relink') : (isThai ? 'สร้างรหัส' : 'Generate code')}
                  </button>
                  {managedUser.line.linked && (
                    <button className="btn-secondary text-xs text-red-600 hover:text-red-700" onClick={() => void handleUserUnlink(managedUser)}>
                      <Unlink2 className="w-3.5 h-3.5" />
                      {isThai ? 'ถอด' : 'Unlink'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 4: Group linking */}
      <div className="border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-medium text-gray-800">
              {isThai ? 'เชื่อมกลุ่ม LINE กับบริษัท' : 'Link LINE group to company'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {isThai
                ? 'สร้างรหัสเชื่อมกลุ่ม แล้วส่งรหัสในกลุ่ม LINE ที่มี Billboy อยู่ ทุกคนในกลุ่มจะส่งเอกสารเข้าบริษัทได้'
                : 'Generate a group code, then send it in the LINE group with Billboy. Everyone in the group can submit documents.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-sm" onClick={() => void loadManagedGroups()} disabled={managedGroupsLoading}>
              {managedGroupsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {isThai ? 'รีเฟรช' : 'Refresh'}
            </button>
            <button className="btn-primary text-sm" onClick={() => void handleGroupLinkStart()}>
              <Link2 className="w-4 h-4" />
              {isThai ? 'สร้างรหัสเชื่อมกลุ่ม' : 'Generate group code'}
            </button>
          </div>
        </div>

        {groupOtp && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-900">
              {isThai ? 'รหัสเชื่อมต่อกลุ่ม LINE' : 'LINE group link code'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="font-mono text-3xl font-bold tracking-[0.3em] text-emerald-900 select-all">{groupOtp.otp}</span>
              <button className="btn-secondary text-xs" onClick={copyGroupOtp}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? (isThai ? 'คัดลอกแล้ว' : 'Copied') : (isThai ? 'คัดลอก' : 'Copy')}
              </button>
            </div>
            <p className="mt-2 text-xs text-emerald-800">
              {isThai ? 'ส่งรหัสนี้ในกลุ่ม LINE ภายใน 10 นาที เช่น 123456 หรือ /link-group 123456' : 'Send this code in the LINE group within 10 minutes, for example 123456 or /link-group 123456.'}
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-100">
          <div className="grid grid-cols-[1.3fr_.8fr_.9fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 md:grid-cols-[1.25fr_.7fr_1.15fr_.8fr_.7fr]">
            <span>{isThai ? 'กลุ่ม' : 'Group'}</span>
            <span>{isThai ? 'สถานะ' : 'Status'}</span>
            <span className="hidden md:block">{isThai ? 'โปรเจค' : 'Project'}</span>
            <span>{isThai ? 'ผู้เชื่อม' : 'Linked by'}</span>
            <span className="hidden md:block">{isThai ? 'จัดการ' : 'Action'}</span>
          </div>
          <div className="divide-y divide-gray-100 bg-white">
            {managedGroups.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-gray-500">
                {managedGroupsLoading ? (isThai ? 'กำลังโหลด...' : 'Loading...') : (isThai ? 'ยังไม่มีกลุ่มที่เชื่อม' : 'No linked groups yet.')}
              </div>
            )}
            {managedGroups.map((group) => (
              <div key={group.id} className="grid grid-cols-[1.3fr_.8fr_.9fr] gap-3 px-3 py-3 text-sm md:grid-cols-[1.25fr_.7fr_1.15fr_.8fr_.7fr] md:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{group.groupName ?? (isThai ? 'LINE Group' : 'LINE Group')}</p>
                  {group.lineGroupIdMasked && <p className="mt-1 truncate text-[11px] text-gray-400">{group.lineGroupIdMasked}</p>}
                </div>
                <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${group.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {group.isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {group.isActive ? (isThai ? 'เชื่อมแล้ว' : 'Linked') : (isThai ? 'ปิดอยู่' : 'Inactive')}
                </span>
                <div className="col-span-3 md:col-span-1">
                  <select
                    value={group.projectId ?? ''}
                    onChange={(event) => void handleGroupProjectChange(group, event.target.value)}
                    disabled={groupProjectSavingId === group.id}
                    className="input-field w-full text-xs"
                  >
                    <option value="">{isThai ? 'ไม่ผูกโปรเจค' : 'No project'}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                    ))}
                  </select>
                  {group.project && (
                    <Link to={`/app/projects/${group.project.id}`} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 hover:underline">
                      <BriefcaseBusiness className="h-3 w-3" />
                      {group.project.code}
                    </Link>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-gray-600">{group.linkedBy?.name ?? '-'}</p>
                  {group.linkedAt && <p className="truncate text-[11px] text-gray-400">{new Date(group.linkedAt).toLocaleString()}</p>}
                </div>
                <div className="col-span-3 flex flex-wrap gap-2 md:col-span-1">
                  {group.projectId && (
                    <button className="btn-secondary text-xs" onClick={() => void handleCreateGroupPortalLink(group)} disabled={groupPortalSavingId === group.id}>
                      {groupPortalSavingId === group.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                      {isThai ? 'ลิงก์ดูโปรเจค' : 'Portal link'}
                    </button>
                  )}
                  <button className="btn-secondary text-xs text-red-600 hover:text-red-700" onClick={() => void handleGroupUnlink(group)}>
                    <Unlink2 className="w-3.5 h-3.5" />
                    {isThai ? 'ถอด' : 'Unlink'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 5: Notification Settings — show only when linked */}
      {lineStatus?.linked && (
        <div className="border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-600" />
            <h3 className="font-medium text-gray-800">
              {isThai ? 'การตั้งค่าการแจ้งเตือน' : 'Notification Settings'}
            </h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-indigo-600"
                checked={localNotifyEnabled}
                onChange={e => setLocalNotifyEnabled(e.target.checked)}
              />
              <span className="text-sm text-gray-700">
                {isThai ? 'เปิดการแจ้งเตือน Invoice เกินกำหนด' : 'Enable overdue invoice notifications'}
              </span>
            </label>

            <div>
              <label className="label">
                {isThai ? 'แจ้งเตือนล่วงหน้า / Reminder before due' : 'Reminder before due date'}
              </label>
              <select
                className="input-field w-48"
                value={localReminderDays}
                onChange={e => setLocalReminderDays(Number(e.target.value))}
                disabled={!localNotifyEnabled}
              >
                <option value={1}>{isThai ? '1 วัน' : '1 day'}</option>
                <option value={3}>{isThai ? '3 วัน' : '3 days'}</option>
                <option value={7}>{isThai ? '7 วัน' : '7 days'}</option>
              </select>
            </div>
          </div>

          <button className="btn-primary" onClick={handleSaveSettings} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isThai ? 'บันทึกการตั้งค่า' : 'Save settings'}
          </button>
        </div>
      )}

      {/* Section 6: Live status — collapsible */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-gray-50 transition-colors"
          onClick={() => setStatusOpen(v => !v)}
        >
          <div>
            <h3 className="font-medium text-gray-800">
              {isThai ? 'สถานะระบบ LINE/OCR' : 'LINE/OCR System Status'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {liveStatus?.checkedAt
                ? `${isThai ? 'ตรวจล่าสุด' : 'Last checked'} ${new Date(liveStatus.checkedAt).toLocaleString()}`
                : (isThai ? 'กำลังโหลดสถานะ...' : 'Loading status...')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {liveLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            <ArrowRight className={`w-4 h-4 text-gray-400 transition-transform ${statusOpen ? 'rotate-90' : ''}`} />
          </div>
        </button>

        {statusOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 pt-4">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500 mb-2">Webhook</div>
                {healthPill(!!liveStatus?.webhook?.lastWebhookAt, liveStatus?.webhook?.lastWebhookAt ? 'Active' : 'No event')}
                <p className="mt-2 text-xs text-gray-600">
                  {liveStatus?.webhook?.lastWebhookAt ? new Date(liveStatus.webhook.lastWebhookAt).toLocaleString() : '-'}
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500 mb-2">Redis</div>
                {healthPill(liveStatus?.redis?.ok)}
                {liveStatus?.redis?.error && <p className="mt-2 text-xs text-red-600 line-clamp-2">{liveStatus.redis.error}</p>}
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500 mb-2">Database</div>
                {healthPill(liveStatus?.documentIntakesSchema?.ok, liveStatus?.documentIntakesSchema?.ok ? 'Migrated' : 'Needs migration')}
                {!!liveStatus?.documentIntakesSchema?.missingColumns?.length && (
                  <p className="mt-2 text-xs text-red-600">Missing: {liveStatus.documentIntakesSchema.missingColumns.join(', ')}</p>
                )}
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500 mb-2">OCR</div>
                {healthPill(liveStatus?.ocrReadiness?.productionReady, liveStatus?.ocrReadiness?.productionReady ? 'Production' : 'Check env')}
                <p className="mt-2 text-xs text-gray-600">{liveStatus?.ocrReadiness?.models?.fastTextOrPdf ?? '-'}</p>
              </div>
            </div>

            {liveStatus?.documentOps && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
                {[
                  { label: isThai ? 'ผู้ใช้ LINE' : 'LINE users', value: liveStatus.linkedUsers?.count ?? 0 },
                  { label: isThai ? 'กลุ่ม LINE' : 'LINE groups', value: liveStatus.linkedGroups?.count ?? 0 },
                  { label: isThai ? 'รอยืนยัน' : 'Awaiting', value: (liveStatus.documentOps.byStatus.awaiting_confirmation ?? 0) + (liveStatus.documentOps.byStatus.awaiting_input ?? 0) },
                  { label: isThai ? 'บันทึกแล้ว' : 'Saved', value: liveStatus.documentOps.byStatus.saved ?? 0 },
                  { label: isThai ? 'ล้มเหลว' : 'Failed', value: liveStatus.documentOps.byStatus.failed ?? 0 },
                  { label: isThai ? 'ไฟล์บน Storage' : 'Storage files', value: liveStatus.documentOps.storage.storageBacked },
                  { label: isThai ? 'กันเอกสารซ้ำ' : 'Duplicates blocked', value: liveStatus.documentOps.storage.duplicateWarnings },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
                    <p className="text-[11px] text-gray-500">{item.label}</p>
                    <p className="text-lg font-bold text-gray-900">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {liveStatus?.documentOps?.usageTelemetry && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: isThai ? 'เอกสารคิดแพ็กเกจ' : 'Billable docs', value: liveStatus.documentOps.usageTelemetry.billableDocuments },
                  { label: isThai ? 'OCR intake' : 'OCR intakes', value: liveStatus.documentOps.usageTelemetry.documentIntakes },
                  { label: isThai ? 'จาก LINE' : 'From LINE', value: liveStatus.documentOps.bySource?.line ?? 0 },
                  { label: isThai ? 'จากเว็บ' : 'From web', value: liveStatus.documentOps.bySource?.web ?? 0 },
                  { label: isThai ? 'ต้นทุน OCR ประมาณ' : 'Est. OCR cost', value: `฿${liveStatus.documentOps.usageTelemetry.estimatedOcrCostThb}` },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                    <p className="text-[11px] text-emerald-700">{item.label}</p>
                    <p className="text-lg font-bold text-emerald-950">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {liveStatus?.documentOps && !liveStatus.documentOps.storage.configured && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {isThai
                  ? 'Storage ยังไม่พร้อมสำหรับ production: เอกสารใหม่อาจถูกเก็บใน database ชั่วคราว ให้ตั้งค่า S3/R2 env ก่อนขายจริง'
                  : 'Production storage is not ready: new documents may be stored in the database temporarily. Configure S3/R2 env before launch.'}
              </div>
            )}

            {(liveStatus?.lineMessaging?.lastPushFailure || liveStatus?.lineMessaging?.lastReplyFailure || liveStatus?.webhook?.lastUnhandledError) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                {liveStatus.webhook?.lastUnhandledError && (
                  <p><strong>Webhook error:</strong> {liveStatus.webhook.lastUnhandledError.message}</p>
                )}
                {liveStatus.lineMessaging?.lastPushFailure && (
                  <p><strong>Push failed:</strong> {liveStatus.lineMessaging.lastPushFailure.status ?? '-'} {liveStatus.lineMessaging.lastPushFailure.body ?? liveStatus.lineMessaging.lastPushFailure.error}</p>
                )}
                {liveStatus.lineMessaging?.lastReplyFailure && (
                  <p><strong>Reply failed:</strong> {liveStatus.lineMessaging.lastReplyFailure.status ?? '-'} {liveStatus.lineMessaging.lastReplyFailure.body ?? liveStatus.lineMessaging.lastReplyFailure.error}</p>
                )}
              </div>
            )}

            {!!liveStatus?.recentDocumentIntakes?.items?.length && (
              <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
                <div className="flex flex-col gap-1 bg-gray-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">
                      {isThai ? 'เอกสาร LINE/OCR ล่าสุด' : 'Recent LINE/OCR documents'}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {isThai ? 'ใช้เช็คว่าไฟล์เข้า DB, OCR, Drive และโปรเจคครบไหม' : 'Shows DB, OCR, Drive, and project linkage state.'}
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    {isThai ? 'ล่าสุด 10 รายการ' : 'Latest 10'}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {liveStatus.recentDocumentIntakes.items.map((item) => (
                    <div key={item.id} className="grid gap-3 px-3 py-3 text-xs lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {statusPill(item.status)}
                          {drivePill(item.driveSyncStatus)}
                          {item.ocrSummary?.confidence && (
                            <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                              OCR: {item.ocrSummary.confidence}
                            </span>
                          )}
                        </div>
                        <p className="truncate font-semibold text-gray-800">{item.fileName || item.mimeType}</p>
                        <p className="truncate text-gray-400">
                          {item.source} · {item.mimeType} · {formatFileSize(item.fileSize)} · {new Date(item.createdAt).toLocaleString()}
                        </p>
                        {item.sourceMessageId && (
                          <p className="truncate font-mono text-[11px] text-gray-400">LINE msg: {item.sourceMessageId}</p>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium text-gray-700">
                          {item.ocrSummary?.documentTypeLabel || item.ocrSummary?.documentType || (isThai ? 'ยังไม่แยกประเภท' : 'No type yet')}
                        </p>
                        <p className="truncate text-gray-500">
                          {item.ocrSummary?.counterparty || (isThai ? 'ยังไม่พบคู่ค้า' : 'No counterparty')}
                        </p>
                        <p className="text-gray-700">
                          {formatMoney(item.ocrSummary?.total)}
                          {item.ocrSummary?.invoiceNumber ? <span className="text-gray-400"> · {item.ocrSummary.invoiceNumber}</span> : null}
                        </p>
                      </div>

                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-gray-600">
                          {item.project ? `${item.project.code} · ${item.project.name}` : (isThai ? 'ไม่ผูกโปรเจค' : 'No project')}
                        </p>
                        {!!item.ocrSummary?.stages?.length && (
                          <p className="line-clamp-2 text-[11px] text-gray-400">
                            OCR stages: {item.ocrSummary.stages.slice(-4).join(' → ')}
                          </p>
                        )}
                        {(item.error || item.driveSyncError || item.ocrSummary?.firstWarning) && (
                          <p className="line-clamp-2 text-[11px] text-red-600">
                            {item.error || item.driveSyncError || item.ocrSummary?.firstWarning}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {item.projectId && (
                          <Link to={`/app/projects/${item.projectId}`} className="rounded-md border border-gray-200 px-2 py-1 font-semibold text-gray-600 hover:bg-gray-50">
                            {isThai ? 'โปรเจค' : 'Project'}
                          </Link>
                        )}
                        {(item.purchaseInvoiceId || item.targetType === 'purchase_invoice') && (
                          <Link to="/app/purchase-invoices" className="rounded-md border border-gray-200 px-2 py-1 font-semibold text-gray-600 hover:bg-gray-50">
                            Input VAT
                          </Link>
                        )}
                        {item.driveUrl && (
                          <a href={item.driveUrl} target="_blank" rel="noreferrer" className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 font-semibold text-blue-700 hover:bg-blue-100">
                            Drive
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App Settings Tab (formerly /settings page) ───────────────────────────────

function AppSettingsTab({ isThai }: { isThai: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-lg text-gray-900">
          {isThai ? 'การตั้งค่าแอปพลิเคชัน' : 'Application Settings'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isThai ? 'ตั้งค่าภาษา การแจ้งเตือน และ API Key ของบัญชีนี้' : 'Configure language, notifications, and API access for this account.'}
        </p>
      </div>

      {/* Language */}
      <div className="card space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900">{t('settings.language')}</h3>
          <p className="mt-0.5 text-sm text-gray-500">{t('settings.languageDesc')}</p>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher variant="toggle" />
          <span className="text-sm text-gray-500">
            {isThai ? 'ภาษาปัจจุบัน: ภาษาไทย' : 'Current language: English'}
          </span>
        </div>
      </div>

      {/* Notifications */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-900">{t('settings.notifications')}</h3>
        <div className="space-y-3">
          {[
            { key: 'rd_success',        th: 'เมื่อส่ง RD สำเร็จ',              en: 'When RD submission succeeds' },
            { key: 'rd_failed',         th: 'เมื่อส่ง RD ล้มเหลว',             en: 'When RD submission fails' },
            { key: 'invoice_approved',  th: 'เมื่อใบกำกับภาษีได้รับการอนุมัติ', en: 'When invoice is approved' },
            { key: 'daily_summary',     th: 'สรุปรายวัน',                       en: 'Daily summary' },
          ].map((n) => (
            <div key={n.key} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{isThai ? n.th : n.en}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600" />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-900">{t('settings.api')}</h3>
        <div className="space-y-3">
          <div>
            <label className="label">{isThai ? 'API Key (อ่านอย่างเดียว)' : 'API Key (Read-only)'}</label>
            <div className="flex gap-2">
              <input className="input-field font-mono text-xs" defaultValue="etax_sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" readOnly />
              <button className="btn-secondary text-xs px-3">
                {isThai ? 'คัดลอก' : 'Copy'}
              </button>
            </div>
          </div>
          <button className="btn-danger text-xs py-1.5">
            {isThai ? 'สร้าง API Key ใหม่' : 'Regenerate API Key'}
          </button>
        </div>
      </div>

      <button className="btn-primary">{t('settings.save')}</button>
    </div>
  );
}
