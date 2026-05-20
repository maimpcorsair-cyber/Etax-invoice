import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, FileText, Building, Key, Server, CreditCard, Lock, ArrowRight, ScrollText, Zap, MessageCircle, Settings, Mail } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import AppSettingsTab from './AdminPanel/AppSettingsTab';
import AuditLogTab from './AdminPanel/AuditLogTab';
import CompanyTab from './AdminPanel/CompanyTab';
import RDConfigTab from './AdminPanel/RDConfigTab';
import BillingTab from './AdminPanel/BillingTab';
import CertificateTab from './AdminPanel/CertificateTab';
import EmailDomainTab from './AdminPanel/EmailDomainTab';
import UsersTab from './AdminPanel/UsersTab';
import TemplatesTab from './AdminPanel/TemplatesTab';
import LineTab from './AdminPanel/LineTab';

const baseTabs = [
  { key: 'company', icon: Building, labelKey: 'admin.company' },
  { key: 'users', icon: Users, labelKey: 'admin.users' },
  { key: 'templates', icon: FileText, labelKey: 'admin.templates' },
  { key: 'certificate', icon: Key, labelKey: 'admin.certificate' },
  { key: 'rdConfig', icon: Server, labelKey: 'admin.rdConfig' },
  { key: 'emailDomain', icon: Mail, labelKey: 'admin.emailDomain' },
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
          {activeTab === 'emailDomain' && <EmailDomainTab isThai={isThai} />}
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


