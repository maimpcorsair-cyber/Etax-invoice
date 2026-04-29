import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, FileText, Building, Key, Server, CreditCard, Upload, CheckCircle, XCircle, Loader2, AlertTriangle, Save, Sparkles, FlaskConical, Lock, ArrowRight, ScrollText, Zap, MessageCircle, Link2, Unlink2, Copy, Check, Bell, Settings } from 'lucide-react';
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
  const [subscription, setSubscription] = useState<null | {
    plan: string;
    status: string;
    billingInterval: string;
    docLimit?: number | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd: boolean;
    activatedAt?: string | null;
  }>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadBilling() {
      try {
        const res = await fetch('/api/billing/subscription', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json() as { data?: typeof subscription; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Failed to load billing');
        if (active) setSubscription(json.data ?? null);
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
  const [lineStatus, setLineStatus] = useState<{
    linked: boolean;
    displayName?: string;
    lineNotifyEnabled: boolean;
    overdueReminderDays: number;
  } | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localNotifyEnabled, setLocalNotifyEnabled] = useState(false);
  const [localReminderDays, setLocalReminderDays] = useState(3);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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

  const [richMenuLoading, setRichMenuLoading] = useState(false);
  const [richMenuMsg, setRichMenuMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function handleSetupRichMenu() {
    setRichMenuLoading(true);
    setRichMenuMsg(null);
    try {
      const res = await fetch('/api/line/admin/setup-richmenu', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json() as { data?: { richMenuId: string }; error?: string };
      if (!res.ok) {
        setRichMenuMsg({ type: 'err', text: j.error ?? 'เกิดข้อผิดพลาด' });
      } else {
        setRichMenuMsg({ type: 'ok', text: `✅ ติดตั้ง Rich Menu สำเร็จ (ID: ${j.data?.richMenuId ?? ''})` });
      }
    } catch {
      setRichMenuMsg({ type: 'err', text: 'ไม่สามารถเชื่อมต่อได้' });
    } finally {
      setRichMenuLoading(false);
    }
  }

  async function handleLinkStart() {
    setMsg(null);
    try {
      const res = await fetch('/api/line/link-start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json() as { data?: { otp: string }; error?: string };
      if (!res.ok) {
        setMsg({ type: 'err', text: j.error ?? 'เกิดข้อผิดพลาด' });
        return;
      }
      if (j.data?.otp) {
        setOtp(j.data.otp);
      } else {
        setMsg({ type: 'err', text: 'ไม่ได้รับรหัส OTP กรุณาลองใหม่' });
      }
    } catch (e) {
      setMsg({ type: 'err', text: isThai ? `เกิดข้อผิดพลาด: ${(e as Error).message}` : `Error: ${(e as Error).message}` });
    }
  }

  async function handleUnlink() {
    if (!confirm(isThai ? 'ยืนยันยกเลิกการเชื่อมต่อ Line?' : 'Confirm unlink from Line?')) return;
    try {
      await fetch('/api/line/unlink', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setLineStatus(null);
      setOtp(null);
    } catch {
      setMsg({ type: 'err', text: isThai ? 'ยกเลิกการเชื่อมต่อไม่สำเร็จ' : 'Failed to unlink' });
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

  function handleCopyOtp() {
    if (!otp) return;
    navigator.clipboard.writeText(otp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
              ? 'อัปเกรดแพ็กเกจเพื่อใช้งาน Line AI Assistant พี่นุช'
              : 'Upgrade your plan to use the Line AI Assistant (Pinuch).'}
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
        {isThai ? 'Line พี่นุช' : 'Line AI Assistant (Pinuch)'}
      </h2>

      {/* Features card — always shown */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 space-y-3">
        <p className="font-semibold text-indigo-900 text-sm">
          {isThai ? 'พี่นุชทำอะไรได้บ้าง?' : 'What can Pinuch do?'}
        </p>
        <ul className="space-y-2 text-sm text-indigo-800">
          <li>🤖 {isThai ? 'ถามตอบข้อมูลบัญชีและใบกำกับภาษีด้วย AI' : 'Ask accounting and tax invoice questions via AI'}</li>
          <li>📸 {isThai ? 'ส่งรูปใบแจ้งหนี้ supplier → บันทึกภาษีซื้ออัตโนมัติ (OCR)' : 'Send supplier invoice photo → Auto-record input VAT (OCR)'}</li>
          <li>⚠️ {isThai ? 'แจ้งเตือน Invoice เกินกำหนดชำระรายวัน' : 'Daily overdue invoice reminders'}</li>
          <li>📊 {isThai ? 'สรุปยอด VAT และข้อมูลบัญชีได้ทันที' : 'Instant VAT summary and accounting data'}</li>
          <li>💬 {isThai ? 'พิมพ์คำถามภาษาไทยได้เลย' : 'Ask questions in Thai naturally'}</li>
        </ul>
      </div>

      {/* Connection Status card */}
      <div className="border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-800">
            {isThai ? 'เชื่อมต่อ Line พี่นุช' : 'Connect Line Pinuch'}
          </h3>
          {lineStatus?.linked && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
              <CheckCircle className="w-3.5 h-3.5" />
              {isThai ? 'เชื่อมต่อแล้ว ✅' : 'Connected ✅'}
            </span>
          )}
        </div>

        {lineStatus?.linked ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {isThai ? 'บัญชี Line: ' : 'Line account: '}
              <span className="font-medium text-gray-900">{lineStatus.displayName ?? '—'}</span>
            </p>
            <button
              className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium"
              onClick={handleUnlink}
            >
              <Unlink2 className="w-4 h-4" />
              {isThai ? 'ยกเลิกการเชื่อมต่อ' : 'Unlink'}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Step 1 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">
                {isThai ? 'ขั้นตอนที่ 1 — เพิ่มเพื่อน Line Official Account พี่นุช' : 'Step 1 — Add Line Official Account Pinuch'}
              </p>
              <div className="flex items-start gap-4">
                <a href="https://line.me/R/ti/p/@566fvjbg" target="_blank" rel="noreferrer" className="flex-shrink-0">
                  <img
                    src="https://qr-official.line.me/g/M/566fvjbg.png"
                    alt="QR Code พี่นุช"
                    className="w-28 h-28 rounded-lg border border-gray-200 shadow-sm"
                  />
                </a>
                <div className="space-y-1">
                  <p className="text-sm text-gray-600">
                    {isThai ? 'สแกน QR หรือค้นหา' : 'Scan QR or search for'}
                  </p>
                  <a
                    href="https://line.me/R/ti/p/@566fvjbg"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-600 hover:text-green-700"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    {isThai ? 'เพิ่มเพื่อน @566fvjbg' : 'Add friend @566fvjbg'}
                  </a>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">
                {isThai ? 'ขั้นตอนที่ 2 — รับรหัส OTP เพื่อเชื่อมต่อบัญชี' : 'Step 2 — Generate OTP to link your account'}
              </p>
              {otp ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-3xl font-bold tracking-[0.3em] text-indigo-700 select-all">
                      {otp}
                    </span>
                    <button
                      onClick={handleCopyOtp}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? (isThai ? 'คัดลอกแล้ว' : 'Copied') : (isThai ? 'คัดลอก' : 'Copy')}
                    </button>
                  </div>
                  <p className="text-sm text-gray-500">
                    {isThai ? 'พิมพ์รหัส 6 หลักนี้ส่งให้พี่นุชใน Line: ' : 'Type this 6-digit code and send to Pinuch in Line: '}
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{otp}</code>
                  </p>
                </div>
              ) : (
                <button className="btn-primary" onClick={handleLinkStart}>
                  <Link2 className="w-4 h-4" />
                  {isThai ? 'สร้างรหัสเชื่อมต่อ' : 'Generate link code'}
                </button>
              )}
            </div>

            {/* Step 3 */}
            {otp && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  {isThai
                    ? 'ขั้นตอนที่ 3 — รอพี่นุชยืนยัน... รหัสนี้หมดอายุใน 10 นาที'
                    : 'Step 3 — Waiting for Pinuch to confirm... This code expires in 10 minutes'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rich Menu Setup card — admin only */}
      <div className="border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <h3 className="font-medium text-gray-800">Rich Menu (เมนูด้านล่าง Chat)</h3>
        </div>
        <p className="text-sm text-gray-500">
          ติดตั้งปุ่มเมนูถาวรในแชท LINE ให้ผู้ใช้กดได้โดยไม่ต้องจำคำสั่ง ทำครั้งเดียวก็พอครับ
        </p>
        {richMenuMsg && (
          <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${richMenuMsg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {richMenuMsg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {richMenuMsg.text}
          </div>
        )}
        <button className="btn-primary" onClick={handleSetupRichMenu} disabled={richMenuLoading}>
          {richMenuLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>🚀</span>}
          {richMenuLoading ? 'กำลังติดตั้ง...' : 'ติดตั้ง Rich Menu'}
        </button>
      </div>

      {/* Notification Settings card — show only when linked */}
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

          {msg && (
            <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {msg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {msg.text}
            </div>
          )}

          <button className="btn-primary" onClick={handleSaveSettings} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isThai ? 'บันทึกการตั้งค่า' : 'Save settings'}
          </button>
        </div>
      )}
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
