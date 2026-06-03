import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, FileText, Building, Key, Server, CreditCard, Lock, ArrowRight, ScrollText, Zap, MessageCircle, Settings, Mail, ShieldCheck } from 'lucide-react';
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
  { key: 'company', icon: Building, labelKey: 'admin.company', group: 'workspace', summaryTh: 'ข้อมูลบริษัท โลโก้ ที่อยู่ และเลขประจำตัวผู้เสียภาษี', summaryEn: 'Company profile, logo, addresses, and tax identity' },
  { key: 'users', icon: Users, labelKey: 'admin.users', group: 'workspace', summaryTh: 'สิทธิ์ผู้ใช้และทีมที่ทำงานกับเอกสาร', summaryEn: 'Users, roles, and document team access' },
  { key: 'templates', icon: FileText, labelKey: 'admin.templates', group: 'documents', summaryTh: 'แม่แบบเอกสารและข้อความที่ลูกค้าจะเห็น', summaryEn: 'Document templates and customer-facing copy' },
  { key: 'certificate', icon: Key, labelKey: 'admin.certificate', group: 'compliance', summaryTh: 'ใบรับรองดิจิทัลสำหรับลงลายมือชื่อ e-Tax', summaryEn: 'Digital certificate used for e-Tax signing' },
  { key: 'rdConfig', icon: Server, labelKey: 'admin.rdConfig', group: 'compliance', summaryTh: 'การเชื่อมต่อกรมสรรพากรและค่า submit เอกสาร', summaryEn: 'Revenue Department connection and submission settings' },
  { key: 'emailDomain', icon: Mail, labelKey: 'admin.emailDomain', group: 'documents', summaryTh: 'โดเมนอีเมลสำหรับส่งเอกสารจากชื่อบริษัท', summaryEn: 'Email domain used to send documents under your brand' },
  { key: 'line', icon: MessageCircle, labelKey: 'admin.line', group: 'automation', summaryTh: 'LINE OCR ผู้ใช้ กลุ่มโปรเจค และการแจ้งเตือน', summaryEn: 'LINE OCR, users, project groups, and notifications' },
  { key: 'billing', icon: CreditCard, labelKey: 'admin.billing', group: 'account', summaryTh: 'แพ็กเกจ การใช้งาน และรายการเก็บเงิน', summaryEn: 'Plan, usage, billing portal, and overage charges' },
  { key: 'audit', icon: ScrollText, labelKey: 'admin.auditLog', group: 'compliance', summaryTh: 'ประวัติการเปลี่ยนแปลงที่ใช้ตรวจสอบย้อนหลัง', summaryEn: 'Change history for audit and traceability' },
  { key: 'plan', icon: Zap, labelKey: 'admin.plan', group: 'account', summaryTh: 'ดูแพ็กเกจและอัปเกรดความสามารถของบริษัท', summaryEn: 'Review plans and upgrade company capability' },
  { key: 'appSettings', icon: Settings, labelKey: 'admin.appSettings', group: 'workspace', summaryTh: 'ค่าระบบทั่วไปของ workspace', summaryEn: 'General workspace-level app settings' },
] as const;

const adminGroups = [
  { key: 'workspace', th: 'Workspace', en: 'Workspace' },
  { key: 'documents', th: 'เอกสารและลูกค้า', en: 'Documents & customers' },
  { key: 'automation', th: 'Automation', en: 'Automation' },
  { key: 'compliance', th: 'ภาษีและความปลอดภัย', en: 'Tax & security' },
  { key: 'account', th: 'แพ็กเกจและบัญชี', en: 'Plan & account' },
] as const;

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

  const activeTabInfo = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];
  const ActiveIcon = activeTabInfo?.icon ?? Settings;
  const lockedFeatureCount = policy ? [
    !policy.canSubmitToRD,
    !policy.canInviteUsers,
    !policy.canUseCustomTemplates,
    !policy.canViewAuditLogs,
    !policy.canExportGoogleSheets,
  ].filter(Boolean).length : 0;

  return (
    <div className="space-y-5">
      <section className="premium-hero premium-hero-dark">
        <div className="relative z-10 min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">{isThai ? 'ตั้งค่าระบบ' : 'Workspace settings'}</p>
          <h1 className="mt-3 text-2xl font-bold leading-tight text-white sm:text-3xl">{t('admin.title')}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">
            {isThai
              ? 'จัดการข้อมูลบริษัท เอกสาร ภาษี ช่องทางส่ง และแพ็กเกจจากที่เดียว'
              : 'Manage company profile, documents, tax submission, channels, and plan from one place.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-white/75">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
              <ShieldCheck className="h-4 w-4 text-emerald-200" />
              {policy?.planLabel ?? (isThai ? 'กำลังโหลดแพ็กเกจ' : 'Loading plan')}
            </span>
            {policy && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
                <FileText className="h-4 w-4 text-white/70" />
                {policy.usage.documentsThisMonth}{policy.maxDocumentsPerMonth ? ` / ${policy.maxDocumentsPerMonth}` : ''} {isThai ? 'เอกสารเดือนนี้' : 'docs this month'}
              </span>
            )}
          </div>
        </div>
        <div className="relative z-10 rounded-2xl border border-white/15 bg-white/10 p-4 text-white shadow-2xl shadow-slate-950/15 backdrop-blur">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/60">{isThai ? 'สิ่งที่ต้องรู้' : 'Plan readiness'}</p>
          <p className="mt-3 text-3xl font-bold tabular-nums">{lockedFeatureCount}</p>
          <p className="mt-1 text-sm text-white/70">
            {isThai ? 'ฟีเจอร์ที่ยังล็อกตามแพ็กเกจ' : 'features gated by current plan'}
          </p>
          <Link to="/#pricing-checkout" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-primary-800 transition hover:bg-primary-50">
            {isThai ? 'ดูแพ็กเกจ' : 'View plans'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {policy && <PlanAccessSummary isThai={isThai} compact />}

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/* Sidebar */}
        <nav className="min-w-0 lg:hidden" aria-label={isThai ? 'หมวดตั้งค่า' : 'Settings sections'}>
          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            {tabs.map(({ key, icon: Icon, labelKey }) => (
              <button
                key={key}
                onClick={() => {
                  if (key === 'plan') { navigate('/app/plan'); return; }
                  setActiveTab(key);
                }}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
                  activeTab === key
                    ? 'bg-primary-700 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(labelKey, { defaultValue: key === 'audit' ? 'Audit Log' : key === 'plan' ? 'แผน / Plan' : key })}
                {((key === 'audit' && !policy?.canViewAuditLogs) || (key === 'users' && !policy?.canInviteUsers) || (key === 'line' && !policy?.canUseLineOa)) && (
                  <Lock className="h-3.5 w-3.5" />
                )}
              </button>
            ))}
          </div>
        </nav>

        <nav className="hidden min-w-0 lg:block" aria-label={isThai ? 'หมวดตั้งค่า' : 'Settings sections'}>
          <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            {adminGroups.map((group) => {
              const groupTabs = tabs.filter((tab) => tab.group === group.key);
              if (groupTabs.length === 0) return null;
              return (
                <div key={group.key} className="py-2 first:pt-0 last:pb-0">
                  <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    {isThai ? group.th : group.en}
                  </p>
                  <div className="space-y-1">
                    {groupTabs.map(({ key, icon: Icon, labelKey }) => (
                      <button
                        key={key}
                        onClick={() => {
                          if (key === 'plan') { navigate('/app/plan'); return; }
                          setActiveTab(key);
                        }}
                        className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                          activeTab === key
                            ? 'bg-primary-50 text-primary-800 ring-1 ring-primary-100'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{t(labelKey, { defaultValue: key === 'audit' ? 'Audit Log' : key === 'plan' ? 'แผน / Plan' : key })}</span>
                          {key === 'audit' && !policy?.canViewAuditLogs && (
                            <Lock className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                          )}
                          {key === 'users' && !policy?.canInviteUsers && (
                            <Lock className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                          )}
                          {key === 'line' && !policy?.canUseLineOa && (
                            <Lock className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {activeTabInfo && (
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                  <ActiveIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-950">
                    {t(activeTabInfo.labelKey, { defaultValue: activeTabInfo.key })}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {isThai ? activeTabInfo.summaryTh : activeTabInfo.summaryEn}
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="p-5">
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
        className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        <Zap className="w-4 h-4" />
        {isThai ? 'ดูแพ็กเกจทั้งหมด' : 'View plans'}
      </Link>
    </div>
  );
}

function PlanAccessSummary({ isThai, compact = false }: { isThai: boolean; compact?: boolean }) {
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
          {!compact && (
            <p className="text-sm text-gray-600">
              {isThai
                ? `ใช้งานเอกสารเดือนนี้ ${policy.usage.documentsThisMonth}${policy.maxDocumentsPerMonth ? ` / ${policy.maxDocumentsPerMonth}` : ''} • ผู้ใช้ ${policy.usage.users}${policy.maxUsers ? ` / ${policy.maxUsers}` : ''} • ลูกค้า ${policy.usage.customers}${policy.maxCustomers ? ` / ${policy.maxCustomers}` : ''}`
                : `Documents this month ${policy.usage.documentsThisMonth}${policy.maxDocumentsPerMonth ? ` / ${policy.maxDocumentsPerMonth}` : ''} • Users ${policy.usage.users}${policy.maxUsers ? ` / ${policy.maxUsers}` : ''} • Customers ${policy.usage.customers}${policy.maxCustomers ? ` / ${policy.maxCustomers}` : ''}`}
            </p>
          )}
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
