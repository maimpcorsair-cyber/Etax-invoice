import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, ArrowRight, CheckCircle2, XCircle, Clock, AlertTriangle, Bot, Table2, HardDrive, UserCheck } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { Invoice, InvoiceStatus } from '../types';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: 'badge-info',
  pending: 'badge-warning',
  approved: 'badge-success',
  submitted: 'badge-success',
  rejected: 'badge-error',
  cancelled: 'badge-error',
};

interface DashboardStats {
  totalInvoices: number;
  totalRevenue: number;
  pendingCount: number;
  rdSuccessCount: number;
  rdPendingCount: number;
  receivables: {
    totalOutstanding: number;
    overdueOutstanding: number;
    currentOutstanding: number;
    aging: {
      current: number;
      days1To30: number;
      days31To60: number;
      days61To90: number;
      days90Plus: number;
    };
  };
  monthlyRevenue: { month: string; total: number }[];
}

interface RdComplianceMonth {
  month: string;
  deadline: string;
  isPast: boolean;
  daysLeft: number;
  total: number;
  success: number;
  failed: number;
  pending: number;
  unsubmitted: number;
  complianceRate: number;
  byType: {
    type: string;
    code: string;
    total: number;
    success: number;
    failed: number;
    totalAmount: number;
  }[];
}

interface IntegrationStatus {
  lineAi: { connected: boolean; displayName?: string | null; notificationsEnabled: boolean };
  googleAccount: { connected: boolean; email?: string | null };
  googleSheets: { connected: boolean; mode: string };
  googleDrive: { connected: boolean; mode: string };
}

function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className="w-28 h-3 rounded bg-gray-200 mb-3" />
      <div className="w-20 h-7 rounded bg-gray-200" />
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[1, 2, 3, 4, 5].map((i) => (
        <td key={i} className="table-cell">
          <div className="h-4 rounded bg-gray-200 animate-pulse" style={{ width: `${50 + i * 10}%` }} />
        </td>
      ))}
      <td className="table-cell">
        <div className="h-4 w-8 rounded bg-gray-200 animate-pulse" />
      </td>
    </tr>
  );
}

function ComplianceBar({ rate }: { rate: number }) {
  const color = rate === 100 ? 'bg-green-500' : rate >= 80 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-10 text-right">{rate}%</span>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user, token } = useAuthStore();
  const { isThai, formatCurrency, formatDate } = useLanguage();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [compliance, setCompliance] = useState<RdComplianceMonth[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [complianceLoading, setComplianceLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, invRes, integrationRes] = await Promise.all([
          fetch('/api/dashboard/stats', { headers }),
          fetch('/api/invoices?limit=5', { headers }),
          fetch('/api/dashboard/integration-status', { headers }),
        ]);

        if (!statsRes.ok) throw new Error(isThai ? 'โหลดสถิติไม่สำเร็จ' : 'Failed to load stats');
        if (!invRes.ok) throw new Error(isThai ? 'โหลดใบกำกับล่าสุดไม่สำเร็จ' : 'Failed to load recent invoices');

        const statsJson = await statsRes.json() as { data: DashboardStats };
        const invJson = await invRes.json() as { data: Invoice[] };
        const integrationJson = integrationRes.ok
          ? await integrationRes.json() as { data: IntegrationStatus }
          : { data: null };

        setStats(statsJson.data);
        setRecentInvoices(invJson.data ?? []);
        setIntegrations(integrationJson.data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }

    async function loadCompliance() {
      setComplianceLoading(true);
      try {
        const res = await fetch('/api/dashboard/rd-compliance', { headers });
        if (res.ok) {
          const json = await res.json() as { data: RdComplianceMonth[] };
          setCompliance(json.data ?? []);
        }
      } catch {
        // non-critical — compliance panel silently fails
      } finally {
        setComplianceLoading(false);
      }
    }

    load();
    loadCompliance();
  }, [isThai, token]);

  const statCards = stats
    ? [
        { key: 'totalInvoices',  value: stats.totalInvoices.toLocaleString() },
        { key: 'totalRevenue',   value: formatCurrency(stats.totalRevenue) },
        { key: 'pendingApproval', value: stats.pendingCount.toLocaleString() },
        { key: 'submittedToRD',  value: stats.rdSuccessCount.toLocaleString() },
      ]
    : [];

  // Current month compliance (last item)
  const currentMonth = compliance[compliance.length - 1];
  const hasComplianceIssue = currentMonth && (currentMonth.failed > 0 || currentMonth.unsubmitted > 0);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-2xl p-6 text-white flex items-center justify-between" style={{background: 'linear-gradient(135deg,#2563eb 0%,#1e40af 100%)'}}>
        <div>
          <p className="text-blue-200 text-sm font-medium mb-1">{t('dashboard.welcome')}</p>
          <h1 className="text-xl sm:text-2xl font-bold">{user?.name}</h1>
          <p className="text-blue-100 text-sm mt-1">{t('dashboard.title')}</p>
        </div>
        <Link to="/app/invoices/new" className="hidden lg:inline-flex items-center gap-2 px-5 py-2.5 bg-white text-primary-700 font-bold rounded-xl hover:bg-blue-50 transition-all duration-200 hover:-translate-y-0.5 shadow-lg text-sm">
          <Plus className="w-4 h-4" />
          {t('dashboard.createNew')}
        </Link>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* RD Compliance Alert (if there are issues) */}
      {!complianceLoading && hasComplianceIssue && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">
              {isThai ? `มีเอกสารยังไม่ส่ง RD เดือน ${currentMonth.month}` : `Pending RD submissions for ${currentMonth.month}`}
            </p>
            <p className="text-amber-700 mt-0.5">
              {isThai
                ? `ยังไม่ส่ง ${currentMonth.failed + currentMonth.unsubmitted} ใบ · กำหนดส่งวันที่ 15 (เหลือ ${currentMonth.daysLeft} วัน)`
                : `${currentMonth.failed + currentMonth.unsubmitted} documents pending · Deadline: 15th (${currentMonth.daysLeft} days left)`}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? [1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)
          : statCards.map((stat) => (
              <div key={stat.key} className="card p-4 sm:p-6 text-center card-hover">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  {t(`dashboard.summary.${stat.key}`)}
                </p>
                <p className="text-2xl sm:text-3xl font-bold text-primary-600">{stat.value}</p>
              </div>
            ))}
      </div>

      {integrations && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">
                {isThai ? 'สถานะการเชื่อมต่อของระบบ' : 'Connection Status'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {isThai ? 'ดูว่าบัญชีนี้เชื่อม LINE AI, Google Sheets และ Drive พร้อมใช้งานหรือยัง' : 'Check whether this account is connected to LINE AI, Google Sheets, and Drive.'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              {
                key: 'line',
                icon: Bot,
                title: isThai ? 'LINE AI' : 'LINE AI',
                ok: integrations.lineAi.connected,
                detail: integrations.lineAi.connected
                  ? (integrations.lineAi.displayName || (isThai ? 'ผูกบัญชีแล้ว' : 'Connected'))
                  : (isThai ? 'ยังไม่ได้ผูก' : 'Not connected'),
              },
              {
                key: 'google',
                icon: UserCheck,
                title: isThai ? 'บัญชี Google' : 'Google Account',
                ok: integrations.googleAccount.connected,
                detail: integrations.googleAccount.connected
                  ? (integrations.googleAccount.email || (isThai ? 'เชื่อมแล้ว' : 'Connected'))
                  : (isThai ? 'ยังไม่ได้เชื่อม Google OAuth' : 'Google OAuth not connected'),
              },
              {
                key: 'sheets',
                icon: Table2,
                title: 'Google Sheets',
                ok: integrations.googleSheets.connected,
                detail: integrations.googleSheets.connected
                  ? (isThai ? 'พร้อม export' : 'Export ready')
                  : (isThai ? 'ยังไม่ตั้งค่า export' : 'Export not configured'),
              },
              {
                key: 'drive',
                icon: HardDrive,
                title: 'Google Drive',
                ok: integrations.googleDrive.connected,
                detail: integrations.googleDrive.connected
                  ? (isThai ? 'พร้อม sync ไฟล์' : 'File sync ready')
                  : (isThai ? 'ยังไม่เชื่อม Drive' : 'Drive not connected'),
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <Icon className="w-4 h-4 text-primary-600" />
                      {item.title}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {item.ok ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {item.ok ? (isThai ? 'พร้อม' : 'Ready') : (isThai ? 'รอตั้งค่า' : 'Pending')}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 truncate">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && stats && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">
                {isThai ? 'ภาพรวมลูกหนี้คงค้าง (AR)' : 'Accounts Receivable Overview'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {isThai ? 'สรุปยอดค้างชำระรวมและช่วงอายุหนี้ของทั้งบริษัท' : 'Company-wide outstanding balances and aging buckets.'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
              <p className="text-sm font-medium text-rose-700">{isThai ? 'ยอดค้างรวม' : 'Total outstanding'}</p>
              <p className="mt-2 text-2xl font-bold text-rose-900">{formatCurrency(stats.receivables.totalOutstanding)}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-sm font-medium text-amber-700">{isThai ? 'ยอดเกินกำหนด' : 'Overdue outstanding'}</p>
              <p className="mt-2 text-2xl font-bold text-amber-900">{formatCurrency(stats.receivables.overdueOutstanding)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="text-sm font-medium text-emerald-700">{isThai ? 'ยอดยังไม่เกินกำหนด' : 'Current outstanding'}</p>
              <p className="mt-2 text-2xl font-bold text-emerald-900">{formatCurrency(stats.receivables.currentOutstanding)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Current', value: stats.receivables.aging.current },
              { label: '1-30', value: stats.receivables.aging.days1To30 },
              { label: '31-60', value: stats.receivables.aging.days31To60 },
              { label: '61-90', value: stats.receivables.aging.days61To90 },
              { label: '90+', value: stats.receivables.aging.days90Plus },
            ].map((bucket) => (
              <div key={bucket.label} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{bucket.label}</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{formatCurrency(bucket.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">{t('dashboard.quickActions')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: isThai ? 'ใบกำกับภาษี' : 'Tax Invoice', href: '/app/invoices/new', color: 'bg-blue-500' },
            { label: isThai ? 'ใบเสร็จรับเงิน' : 'Receipt', href: '/app/invoices/new?type=receipt', color: 'bg-green-500' },
            { label: isThai ? 'ใบลดหนี้' : 'Credit Note', href: '/app/invoices/new?type=credit_note', color: 'bg-orange-500' },
            { label: isThai ? 'รายการ/ส่งออก' : 'List / Export', href: '/app/invoices', color: 'bg-purple-500' },
          ].map((action) => (
            <Link
              key={action.label}
              to={action.href}
              className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className={`w-2 h-2 rounded-full ${action.color}`} />
              <span className="text-sm font-medium text-gray-700 truncate">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* RD Compliance Panel */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-gray-900">
              {isThai ? 'สถานะการส่ง e-Tax ไปยัง RD' : 'RD e-Tax Submission Status'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isThai ? 'ครบถ้วนตาม ประมวลรัษฎากร ม. 86/6 · กำหนดส่งทุกวันที่ 15 ของเดือนถัดไป' : 'Per Revenue Code §86/6 · Deadline: 15th of following month'}
            </p>
          </div>
        </div>

        {complianceLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-4 w-24 bg-gray-200 rounded" />
                <div className="h-2 bg-gray-200 rounded-full" />
              </div>
            ))}
          </div>
        ) : compliance.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            {isThai ? 'ยังไม่มีข้อมูล' : 'No data yet'}
          </p>
        ) : (
          <div className="space-y-5">
            {compliance.map((m) => (
              <div key={m.month}>
                {/* Month header */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{m.month}</span>
                    {m.isPast && m.complianceRate < 100 && (
                      <span className="text-xs text-red-600 font-medium">
                        {isThai ? '(เกินกำหนด)' : '(past deadline)'}
                      </span>
                    )}
                    {!m.isPast && m.total > 0 && (
                      <span className="text-xs text-gray-400">
                        {isThai ? `เหลือ ${m.daysLeft} วัน` : `${m.daysLeft}d left`}
                      </span>
                    )}
                  </div>
                  {m.total === 0 ? (
                    <span className="text-xs text-gray-400">{isThai ? 'ไม่มีเอกสาร' : 'No documents'}</span>
                  ) : (
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <span className="flex items-center gap-1 text-green-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {m.success}
                      </span>
                      {m.pending > 0 && (
                        <span className="flex items-center gap-1 text-yellow-700">
                          <Clock className="w-3.5 h-3.5" />
                          {m.pending}
                        </span>
                      )}
                      {m.failed > 0 && (
                        <span className="flex items-center gap-1 text-red-700">
                          <XCircle className="w-3.5 h-3.5" />
                          {m.failed}
                        </span>
                      )}
                      {m.unsubmitted > 0 && (
                        <span className="flex items-center gap-1 text-gray-500">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {m.unsubmitted}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {m.total > 0 && <ComplianceBar rate={m.complianceRate} />}

                {/* By document type */}
                {m.byType.length > 0 && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-1.5">
                    {m.byType.map((t) => (
                      <div
                        key={t.type}
                        className="text-xs px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-100"
                      >
                        <span className="font-mono font-semibold text-gray-700">{t.code}</span>
                        <span className="text-gray-400 mx-1">·</span>
                        <span className={t.failed > 0 ? 'text-red-600 font-medium' : t.success === t.total ? 'text-green-700' : 'text-gray-600'}>
                          {t.success}/{t.total}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Legend */}
            <div className="pt-3 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-600" />{isThai ? 'ส่งสำเร็จ' : 'Submitted'}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-yellow-600" />{isThai ? 'อยู่ระหว่างส่ง' : 'In progress'}</span>
              <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-600" />{isThai ? 'ส่งไม่สำเร็จ' : 'Failed'}</span>
              <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-gray-500" />{isThai ? 'ยังไม่ได้ส่ง' : 'Not submitted'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Recent Invoices */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t('dashboard.recentInvoices')}</h2>
          <Link to="/app/invoices" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
            {t('dashboard.viewAll')}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header" scope="col">{isThai ? 'เลขที่' : 'Number'}</th>
                <th className="table-header hidden sm:table-cell" scope="col">{t('customer.title')}</th>
                <th className="table-header" scope="col">{t('common.date')}</th>
                <th className="table-header text-right" scope="col">{t('common.amount')}</th>
                <th className="table-header" scope="col">{t('common.status')}</th>
                <th className="table-header" scope="col" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)
              ) : recentInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-cell text-center py-10">
                    <p className="text-gray-400 mb-2">{isThai ? 'ยังไม่มีใบกำกับภาษี' : 'No invoices yet'}</p>
                    <Link to="/app/invoices/new" className="text-sm text-primary-600 hover:underline font-medium">
                      {isThai ? 'กด "สร้างใบใหม่" เพื่อเริ่มต้น →' : 'Create your first invoice →'}
                    </Link>
                  </td>
                </tr>
              ) : (
                recentInvoices.map((inv) => {
                  const buyerName = isThai
                    ? (inv.buyer as { nameTh?: string })?.nameTh ?? '—'
                    : (inv.buyer as { nameEn?: string; nameTh?: string })?.nameEn ??
                      (inv.buyer as { nameTh?: string })?.nameTh ?? '—';
                  return (
                    <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="table-cell font-mono text-xs">{inv.invoiceNumber}</td>
                      <td className="table-cell hidden sm:table-cell">{buyerName}</td>
                      <td className="table-cell text-gray-500">{formatDate(inv.invoiceDate)}</td>
                      <td className="table-cell text-right font-medium">{formatCurrency(inv.total)}</td>
                      <td className="table-cell">
                        <span className={STATUS_COLORS[inv.status]}>
                          {t(`invoice.status.${inv.status}`)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <Link
                          to={`/app/invoices/${inv.id}/edit`}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          {t('common.view')}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
