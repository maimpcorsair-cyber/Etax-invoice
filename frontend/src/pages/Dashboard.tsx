import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Plus,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Bot,
  Table2,
  HardDrive,
  UserCheck,
  Inbox,
  Send,
  Calculator,
  CreditCard,
  FileCheck2,
  Sparkles,
  ShieldCheck,
  ExternalLink,
  FolderOpen,
  FileText,
  Link as LinkIcon,
} from 'lucide-react';
import { EmptyState, MetricCard, PageHeader, MascotHelperCard } from '../components/ui/AppChrome';
import { MonthEndWorkspacePreview, type MonthEndWorkspace } from '../components/monthEnd/MonthEndWorkspacePreview';
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
  customerReadiness?: {
    actionNeeded: number;
    vatEvidenceMissing: number;
  };
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

interface DocumentIntakeStats {
  windowDays: number;
  totalLast30Days: number;
  failedLast30Days: number;
  duplicateWarnings: number;
  storage: {
    configured: boolean;
    storageBacked: number;
    databaseBacked: number;
  };
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
}

interface DriveSummaryProject {
  id: string;
  code: string;
  name: string;
  status: string;
  driveFolderUrl: string | null;
  googleSheetUrl: string | null;
  fileCount: number;
}

interface DriveSummaryFile {
  id: string;
  fileName: string;
  driveUrl: string | null;
  driveFolderUrl: string | null;
  projectName: string | null;
  projectCode: string | null;
  source: string;
  driveSyncedAt: string | null;
}

interface DriveSummary {
  companyName: string | null;
  driveConnected: boolean;
  driveConfigured: boolean;
  oauthConfigured: boolean;
  linkedAt: string | null;
  companyDriveOwner: {
    id: string;
    email: string;
    name: string;
    linkedAt: string | null;
  } | null;
  driveMode: 'company_owner' | 'current_user' | 'service_account' | 'not_configured';
  workspaceSheetUrl: string | null;
  workspaceSheetSyncedAt: string | null;
  projects: DriveSummaryProject[];
  recentFiles: DriveSummaryFile[];
}

function SkeletonCard() {
  return (
    <div className="metric-card animate-pulse">
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
  const [documentStats, setDocumentStats] = useState<DocumentIntakeStats | null>(null);
  const [monthEnd, setMonthEnd] = useState<MonthEndWorkspace | null>(null);
  const [monthEndError, setMonthEndError] = useState<string | null>(null);
  const [monthEndTab, setMonthEndTab] = useState('inputVat');
  const [driveSummary, setDriveSummary] = useState<DriveSummary | null>(null);
  const [driveSummaryError, setDriveSummaryError] = useState<string | null>(null);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveOpening, setDriveOpening] = useState(false);
  const [sheetOpening, setSheetOpening] = useState(false);
  const [loading, setLoading] = useState(true);
  const [complianceLoading, setComplianceLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  async function handleSeedDemoData() {
    if (!token || seedingDemo) return;
    setSeedingDemo(true);
    setSeedError(null);
    try {
      const res = await fetch('/api/admin/seed-demo-data', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Reload dashboard so the seeded data is visible immediately. Full
      // reload is the simplest way to refresh every panel (stats, recent
      // invoices, integrations) without rewiring each fetch.
      window.location.reload();
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : 'Failed to seed demo data');
      setSeedingDemo(false);
    }
  }

  useEffect(() => {
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, invRes, integrationRes, docStatsRes, monthEndRes, driveSummaryRes] = await Promise.all([
          fetch('/api/dashboard/stats', { headers }),
          fetch('/api/invoices?limit=5', { headers }),
          fetch('/api/dashboard/integration-status', { headers }),
          fetch('/api/purchase-invoices/document-intakes/stats/summary', { headers }),
          fetch('/api/dashboard/month-end-workspace', { headers }),
          fetch('/api/dashboard/drive-summary', { headers }),
        ]);

        if (!statsRes.ok) throw new Error(isThai ? 'โหลดสถิติไม่สำเร็จ' : 'Failed to load stats');

        const statsJson = await statsRes.json() as { data: DashboardStats };
        const invJson = invRes.ok
          ? await invRes.json() as { data: Invoice[] }
          : { data: [] };
        const integrationJson = integrationRes.ok
          ? await integrationRes.json() as { data: IntegrationStatus }
          : { data: null };
        const docStatsJson = docStatsRes.ok
          ? await docStatsRes.json() as { data: DocumentIntakeStats }
          : { data: null };
        let monthEndJson: { data: MonthEndWorkspace | null } = { data: null };
        if (monthEndRes.ok) {
          monthEndJson = await monthEndRes.json() as { data: MonthEndWorkspace };
          setMonthEndError(null);
        } else {
          const json = await monthEndRes.json().catch(() => ({})) as { error?: string; message?: string };
          setMonthEndError(json.error || json.message || `HTTP ${monthEndRes.status}`);
        }

        let driveSummaryJson: { data: DriveSummary | null } = { data: null };
        if (driveSummaryRes.ok) {
          driveSummaryJson = await driveSummaryRes.json() as { data: DriveSummary };
          setDriveSummaryError(null);
        } else {
          const json = await driveSummaryRes.json().catch(() => ({})) as { error?: string; message?: string };
          setDriveSummaryError(json.error || json.message || `HTTP ${driveSummaryRes.status}`);
        }

        setStats(statsJson.data);
        setRecentInvoices(invJson.data ?? []);
        setIntegrations(integrationJson.data);
        setDocumentStats(docStatsJson.data);
        setMonthEnd(monthEndJson.data);
        setDriveSummary(driveSummaryJson.data);
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
  const pendingRdCount = currentMonth ? currentMonth.failed + currentMonth.unsubmitted : stats?.rdPendingCount ?? 0;
  const aiReviewCount = documentStats
    ? ['received', 'processing', 'awaiting_input', 'awaiting_confirmation', 'needs_review', 'failed']
        .reduce((sum, status) => sum + (documentStats.byStatus[status] ?? 0), 0)
    : 0;
  const readyIntegrations = integrations
    ? [
        integrations.lineAi.connected,
        integrations.googleAccount.connected,
        integrations.googleSheets.connected,
        integrations.googleDrive.connected,
      ].filter(Boolean).length
    : 0;
  const commandCount = [
    aiReviewCount > 0,
    pendingRdCount > 0,
    (stats?.receivables.overdueOutstanding ?? 0) > 0,
    (stats?.customerReadiness?.actionNeeded ?? 0) > 0,
    integrations ? readyIntegrations < 4 : false,
  ].filter(Boolean).length;

  const commandItems = [
    {
      key: 'ai-inbox',
      icon: Inbox,
      href: '/app/purchase-invoices',
      value: documentStats ? aiReviewCount.toLocaleString() : '—',
      title: isThai ? 'เอกสารรอ AI ตรวจ' : 'AI documents to review',
      detail: isThai
        ? `รับเข้า ${documentStats?.totalLast30Days ?? 0} ไฟล์ใน 30 วันล่าสุด`
        : `${documentStats?.totalLast30Days ?? 0} files received in the last 30 days`,
      tone: aiReviewCount > 0 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900',
      action: isThai ? 'เปิด AI Inbox' : 'Open AI Inbox',
    },
    {
      key: 'rd',
      icon: Send,
      href: '/app/invoices',
      value: complianceLoading ? '—' : pendingRdCount.toLocaleString(),
      title: isThai ? 'เอกสารยังไม่ส่ง RD' : 'RD submissions pending',
      detail: currentMonth
        ? (isThai ? `${currentMonth.month} · เหลือ ${currentMonth.daysLeft} วัน` : `${currentMonth.month} · ${currentMonth.daysLeft} days left`)
        : (isThai ? 'ยังไม่มีรอบเดือนที่ต้องจัดการ' : 'No active filing month yet'),
      tone: pendingRdCount > 0 ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900',
      action: isThai ? 'ตรวจรายการส่ง' : 'Review queue',
    },
    {
      key: 'ar',
      icon: CreditCard,
      href: '/app/invoices',
      value: stats ? formatCurrency(stats.receivables.overdueOutstanding) : '—',
      title: isThai ? 'ลูกหนี้เกินกำหนด' : 'Overdue receivables',
      detail: stats && stats.receivables.overdueOutstanding > 0
        ? (isThai ? 'ควรตามชำระหรือออกใบเสร็จเมื่อจ่ายแล้ว' : 'Needs collection follow-up or receipt after payment')
        : (isThai ? 'ไม่มีลูกหนี้เกินกำหนด' : 'No overdue balance'),
      tone: stats && stats.receivables.overdueOutstanding > 0 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-900',
      action: isThai ? 'ดูใบค้างชำระ' : 'View invoices',
    },
    {
      key: 'tax',
      icon: Calculator,
      href: '/app/vat-summary',
      value: currentMonth ? `${currentMonth.complianceRate}%` : '—',
      title: isThai ? 'ความพร้อมยื่น VAT' : 'VAT filing readiness',
      detail: isThai ? 'รวมขาย ซื้อ และสถานะ RD ไว้ในมุมมองเดียว' : 'Sales, purchase VAT, and RD readiness in one view',
      tone: currentMonth && currentMonth.complianceRate < 100 ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900',
      action: isThai ? 'เปิดสรุป VAT' : 'Open VAT summary',
    },
    {
      key: 'customers',
      icon: UserCheck,
      href: '/app/customers',
      value: stats ? `${stats.customerReadiness?.actionNeeded ?? 0}` : '—',
      title: isThai ? 'คู่ค้าข้อมูลยังไม่พร้อม' : 'Counterparty data to review',
      detail: stats?.customerReadiness?.vatEvidenceMissing
        ? (isThai ? `รอ ภ.พ.20 / VAT ${stats.customerReadiness.vatEvidenceMissing} ราย` : `${stats.customerReadiness.vatEvidenceMissing} VAT evidence items missing`)
        : (isThai ? 'เช็คลูกค้า/ซัพพลายเออร์ตามเคสก่อนเปิดเครดิต/สัญญา' : 'Review customer and supplier evidence by use case'),
      tone: (stats?.customerReadiness?.actionNeeded ?? 0) > 0 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-900',
      action: isThai ? 'เปิดคู่ค้า' : 'Open counterparties',
    },
  ];

  const autopilotLanes = [
    {
      key: 'capture',
      icon: Sparkles,
      label: isThai ? 'รับเอกสาร' : 'Capture',
      title: isThai ? 'LINE / เว็บ / ไฟล์ PDF' : 'LINE, web, and PDF intake',
      status: documentStats && documentStats.totalLast30Days > 0
        ? (isThai ? `${documentStats.totalLast30Days} ไฟล์` : `${documentStats.totalLast30Days} files`)
        : (isThai ? 'พร้อมรับไฟล์' : 'Ready'),
    },
    {
      key: 'review',
      icon: Bot,
      label: isThai ? 'AI อ่านและตรวจ' : 'AI extraction',
      title: isThai ? 'แยก VAT, ผู้ขาย, เลขเอกสาร' : 'VAT, vendor, and document fields',
      status: aiReviewCount > 0
        ? (isThai ? `${aiReviewCount} รอยืนยัน` : `${aiReviewCount} to confirm`)
        : (isThai ? 'ไม่มีงานค้าง' : 'Clear'),
    },
    {
      key: 'issue',
      icon: FileCheck2,
      label: isThai ? 'ออกเอกสารขาย' : 'Issue documents',
      title: isThai ? 'สร้างใบขาย PDF พร้อมตรวจ' : 'Generate sales PDFs with preview',
      status: stats ? `${stats.pendingCount}` : '—',
    },
    {
      key: 'comply',
      icon: ShieldCheck,
      label: isThai ? 'ส่ง RD / ภาษี' : 'RD and filing',
      title: isThai ? 'ติดตามกำหนดวันที่ 15' : 'Track the 15th deadline',
      status: pendingRdCount > 0
        ? (isThai ? `${pendingRdCount} ต้องจัดการ` : `${pendingRdCount} pending`)
        : (isThai ? 'พร้อม' : 'Ready'),
    },
  ];

  const shouldShowFirstInvoicePath = Boolean(stats && stats.totalInvoices <= 2);
  const firstInvoiceSteps = [
    {
      key: 'create',
      icon: FileText,
      href: '/app/invoices/new',
      done: (stats?.totalInvoices ?? 0) > 0,
      title: isThai ? 'สร้างใบขายแรก' : 'Create first invoice',
      detail: isThai ? 'ลูกค้า รายการสินค้า ยอดเงิน' : 'Customer, line item, amount',
      action: isThai ? 'สร้างเลย' : 'Create',
    },
    {
      key: 'share',
      icon: LinkIcon,
      href: '/app/invoices',
      done: false,
      title: isThai ? 'ส่งลิงก์ให้ลูกค้า' : 'Send customer link',
      detail: isThai ? 'LINE, คัดลอกลิงก์, PDF' : 'LINE, copy link, PDF',
      action: isThai ? 'เปิดรายการ' : 'Open list',
    },
    {
      key: 'collect',
      icon: CreditCard,
      href: '/app/invoices',
      done: (stats?.receivables.currentOutstanding ?? 0) === 0 && (stats?.totalInvoices ?? 0) > 0,
      title: isThai ? 'ตามยอดและบันทึกรับเงิน' : 'Track and record payment',
      detail: isThai ? 'เห็นยอดค้างและใบเกินกำหนด' : 'Outstanding and overdue status',
      action: isThai ? 'ดูยอดค้าง' : 'View status',
    },
  ];

  async function handleConnectDrive() {
    if (!token) return;
    setDriveConnecting(true);
    try {
      const res = await fetch('/api/drive/connect?returnPath=/app/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as { data: { url: string } };
        window.location.href = json.data.url;
      }
    } catch {
      setDriveConnecting(false);
    }
  }

  async function handleOpenCompanyDrive() {
    if (!token) return;
    // Opening the popup synchronously inside the click handler is required
    // to bypass the browser's popup blocker. We can't pass `noopener` here
    // because that flag makes window.open() return null — without the
    // reference we can't update the popup's URL after the async fetch.
    const popup = window.open('about:blank', '_blank');
    setDriveOpening(true);
    try {
      const res = await fetch('/api/dashboard/drive/folder', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(json.error || json.message || `HTTP ${res.status}`);
      }
      const json = await res.json() as { data: { folderUrl: string } };
      if (popup && !popup.closed) {
        popup.location.href = json.data.folderUrl;
      } else {
        // Popup blocked — fall back to opening on top of the user's gesture
        // via a new tab triggered from a programmatic click. This still
        // opens a new tab in most browsers if the popup blocker permitted
        // it, otherwise the browser surfaces its blocked-popup indicator.
        window.open(json.data.folderUrl, '_blank');
      }
      setDriveSummary((current) => current
        ? {
            ...current,
            driveConfigured: true,
          }
        : current);
      setDriveSummaryError(null);
    } catch (err) {
      popup?.close();
      setDriveSummaryError((err as Error).message);
    } finally {
      setDriveOpening(false);
    }
  }

  async function handleOpenMasterSheet() {
    if (!token || sheetOpening) return;
    // Same popup-then-navigate pattern as the Drive folder button — open a
    // blank tab synchronously so the popup blocker is satisfied, then point
    // it at the sheet URL (or trigger a sync first when it doesn't exist).
    const popup = window.open('about:blank', '_blank');
    setSheetOpening(true);
    setDriveSummaryError(null);
    try {
      const existing = driveSummary?.workspaceSheetUrl ?? null;
      if (existing) {
        if (popup && !popup.closed) popup.location.href = existing;
        else window.open(existing, '_blank');
        return;
      }
      // No sheet yet — kick off a sync, poll briefly, then open.
      const syncRes = await fetch('/api/dashboard/workspace-sheet/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!syncRes.ok) {
        const j = await syncRes.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `HTTP ${syncRes.status}`);
      }
      const json = await syncRes.json() as { data: { url: string | null; status: 'queued' | 'ready' } };
      if (json.data.url) {
        if (popup && !popup.closed) popup.location.href = json.data.url;
        else window.open(json.data.url, '_blank');
        setDriveSummary((current) => current
          ? { ...current, workspaceSheetUrl: json.data.url }
          : current);
      } else {
        // Queued but not yet generated. Close the blank popup and tell the
        // user; they can press the button again in ~1 min.
        popup?.close();
        setDriveSummaryError(isThai
          ? 'กำลังสร้าง Master Sheet ครั้งแรก — กรุณากดปุ่มอีกครั้งใน 1-2 นาที'
          : 'Master Sheet is being generated — try again in 1-2 minutes.');
      }
    } catch (err) {
      popup?.close();
      setDriveSummaryError((err as Error).message);
    } finally {
      setSheetOpening(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Command Center */}
      <PageHeader
        eyebrow={isThai ? 'Billboy Command Center' : 'Billboy Command Center'}
        title={isThai ? `วันนี้มี ${commandCount} เรื่องที่ควรจัดการ` : `${commandCount} finance actions need attention`}
        description={isThai
          ? `สวัสดี ${user?.name ?? ''} ระบบรวมงานเอกสารเข้า เอกสารขาย VAT ลูกหนี้ และไฟล์บริษัทไว้ในหน้าเดียว เพื่อให้ปิดงานรายวันได้เร็วขึ้น`
          : `Hi ${user?.name ?? ''}. This workspace brings document intake, sales documents, VAT, receivables, and company files into one daily operating view.`}
        icon={<Bot className="h-3.5 w-3.5" />}
        mascot="hero"
        actions={(
          <>
            <Link to="/app/purchase-invoices" className="btn-primary">
              <Inbox className="h-4 w-4" />
              {isThai ? 'เปิด AI Inbox' : 'Open AI Inbox'}
            </Link>
            <Link to="/app/invoices/new" className="btn-secondary">
              <Plus className="h-4 w-4" />
              {isThai ? 'สร้างเอกสารขาย' : 'Create sales document'}
            </Link>
          </>
        )}
      />

      {shouldShowFirstInvoicePath && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                {isThai ? 'เส้นทางใบแรก' : 'First invoice path'}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">
                {isThai ? 'ออกใบแรกแล้วส่งให้ลูกค้าในรอบเดียว' : 'Create and send the first invoice in one pass'}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-700">
                {isThai
                  ? 'เริ่มจากใบขายหนึ่งใบ จากนั้นส่งลิงก์ให้ลูกค้าดู PDF และชำระเงินได้ทันที'
                  : 'Start with one sales document, then share a customer link with PDF and payment details.'}
              </p>
            </div>
            <Link to="/app/invoices/new" className="btn-primary w-full justify-center sm:w-auto">
              <Plus className="h-4 w-4" />
              {isThai ? 'สร้างใบแรก' : 'Create first invoice'}
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {firstInvoiceSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <Link
                  key={step.key}
                  to={step.href}
                  className="group flex min-h-[108px] flex-col justify-between rounded-xl border border-white/70 bg-white/85 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{step.title}</p>
                        <p className="mt-0.5 text-xs text-slate-600">{step.detail}</p>
                      </div>
                    </div>
                    {step.done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                        {index + 1}
                      </span>
                    )}
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                    {step.action}
                    <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {stats?.totalInvoices === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm leading-6 text-emerald-900">
              <p className="font-semibold">
                {isThai ? 'ยังไม่มีเอกสาร — อยากทดลองด้วยข้อมูลตัวอย่างไหม?' : 'No documents yet — want to explore with sample data?'}
              </p>
              <p className="mt-0.5 text-emerald-800">
                {isThai
                  ? 'ระบบจะสร้างลูกค้า สินค้า และใบกำกับตัวอย่าง 2 ใบ ให้ดู (ลบทิ้งภายหลังได้)'
                  : 'We will create demo customers, products, and 2 sample invoices you can delete later.'}
              </p>
              {seedError && <p className="mt-1 text-rose-600">{seedError}</p>}
            </div>
            <button
              type="button"
              onClick={handleSeedDemoData}
              disabled={seedingDemo}
              className="btn-secondary whitespace-nowrap"
            >
              {seedingDemo
                ? (isThai ? 'กำลังสร้าง…' : 'Creating…')
                : (isThai ? 'ลองด้วยข้อมูลตัวอย่าง' : 'Try with sample data')}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {commandItems.map((item) => {
          const Icon = item.icon;
          const tone = item.key === 'rd' && pendingRdCount > 0
            ? 'danger'
            : item.key === 'ar' && (stats?.receivables.overdueOutstanding ?? 0) > 0
              ? 'warning'
              : item.key === 'customers' && (stats?.customerReadiness?.actionNeeded ?? 0) > 0
                ? 'warning'
              : item.key === 'tax'
                ? 'success'
                : 'primary';
          return (
            <Link key={item.key} to={item.href} className="group block">
              <MetricCard
                label={item.title}
                value={item.value}
                detail={(
                  <span className="inline-flex items-center gap-1">
                    {item.detail}
                    <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                )}
                icon={<Icon className="h-5 w-5" />}
                tone={tone}
              />
            </Link>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-950">
                {isThai ? 'e-Tax เปิดใช้ได้เมื่อบริษัทพร้อม' : 'e-Tax is available when the company is ready'}
              </p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                {isThai
                  ? 'เริ่มจากสร้างเอกสารขายและจัดการภาษีได้เลย ส่วนการส่ง e-Tax ไป RD ต้องกรอกข้อมูลบริษัทและลงทะเบียนกับกรมสรรพากรให้เรียบร้อย ระบบจะช่วยพาไปทีละขั้น'
                  : 'You can start creating sales documents and tracking VAT right away. RD e-Tax submission only kicks in once your company details and RD registration are complete — the system will walk you through each step.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/settings" className="btn-secondary text-sm">
              {isThai ? 'ไปที่การตั้งค่า' : 'Open Settings'}
            </Link>
            <Link to="/app/admin" className="btn-primary text-sm">
              {isThai ? 'ดูขั้นตอน e-Tax' : 'View e-Tax setup'}
            </Link>
          </div>
        </div>
      </section>

      {/* Company month-end sheet preview */}
      {monthEnd ? (
        <MonthEndWorkspacePreview
          workspace={monthEnd}
          title={isThai ? 'ตารางสรุปรายเดือนของบริษัท' : 'Company Month-End Workspace'}
          description={isThai
            ? 'ตารางรวมภาษีซื้อ ภาษีขาย ค่าใช้จ่าย เอกสารที่ต้องตรวจ และสรุปทุกโปรเจค เหมือน preview ของ Google Sheet ก่อน export'
            : 'Spreadsheet preview for company-wide input VAT, output VAT, expenses, missing documents, and project summary before export.'}
          activeTab={monthEndTab}
          onTabChange={setMonthEndTab}
          formatCurrency={formatCurrency}
          isThai={isThai}
        />
      ) : !loading && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          <p className="font-bold">{isThai ? 'ตารางสรุปรายเดือนยังไม่แสดง' : 'Month-end workspace is not showing yet'}</p>
          <p className="mt-1">
            {isThai
              ? 'ระบบโหลดข้อมูลหลักได้แล้ว แต่โหลดตารางสรุปรายเดือนไม่ได้ ลองรีเฟรชหน้านี้อีกครั้ง — ถ้ายังไม่ขึ้น อาจไม่มีสิทธิ์ดูข้อมูลส่วนนี้ ติดต่อผู้ดูแลของบริษัท'
              : 'The main dashboard loaded but the month-end summary did not. Refresh this page — if it still does not show, you may not have permission to view this section; please contact your admin.'}
          </p>
          {monthEndError && (
            <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 font-mono text-xs text-amber-900">
              {monthEndError}
            </p>
          )}
        </section>
      )}

      {/* Company Drive workspace */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <HardDrive className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-950">
                  {isThai ? 'คลัง Google Drive ของบริษัท' : 'Company Google Drive Workspace'}
                </h2>
                <p className="text-sm text-slate-500">
                  {isThai
                    ? 'เปิดโฟลเดอร์ Billboy ของบริษัท ดูไฟล์รวม ภาษีซื้อ ภาษีขาย ค่าใช้จ่าย และโฟลเดอร์โปรเจคย่อยจากหน้า Dashboard'
                    : 'Open the company Billboy folder with all files, tax evidence, expenses, and nested project folders from the Dashboard.'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {driveSummary?.driveConnected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isThai ? 'Drive user พร้อม' : 'User Drive ready'}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleConnectDrive}
                disabled={driveConnecting || driveSummary?.oauthConfigured === false}
                className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UserCheck className="h-4 w-4" />
                {driveConnecting ? (isThai ? 'กำลังเชื่อม...' : 'Connecting...') : (isThai ? 'เชื่อม Drive ของเจ้าของ' : 'Connect owner Drive')}
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenCompanyDrive}
              disabled={driveOpening || driveSummary?.driveConfigured === false}
              className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FolderOpen className="h-4 w-4" />
              {driveOpening ? (isThai ? 'กำลังเปิด...' : 'Opening...') : (isThai ? 'เปิด/สร้าง Drive บริษัท' : 'Open company Drive')}
            </button>
            <button
              type="button"
              onClick={handleOpenMasterSheet}
              disabled={sheetOpening || driveSummary?.driveConfigured === false}
              className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Table2 className="h-4 w-4" />
              {sheetOpening
                ? (isThai ? 'กำลังเปิด...' : 'Opening...')
                : driveSummary?.workspaceSheetUrl
                  ? (isThai ? 'เปิด Master Sheet' : 'Open Master Sheet')
                  : (isThai ? 'สร้าง Master Sheet' : 'Create Master Sheet')}
            </button>
          </div>
        </div>

        {driveSummaryError && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-bold">{isThai ? 'ยังโหลด/เปิด Drive workspace ไม่สำเร็จ' : 'Drive workspace is not ready yet'}</p>
            <p className="mt-1 font-mono text-xs">{driveSummaryError}</p>
          </div>
        )}

        <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  {isThai ? 'โฟลเดอร์โปรเจคในบริษัท' : 'Project folders'}
                </p>
                <p className="text-sm text-slate-500">
                  {driveSummary?.companyName ?? user?.company?.nameTh ?? user?.company?.nameEn ?? 'Billboy'}
                  {driveSummary?.driveMode && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {driveSummary.driveMode === 'company_owner'
                        ? (isThai ? 'ใช้ Drive เจ้าของบริษัท' : 'Company owner Drive')
                        : driveSummary.driveMode === 'current_user'
                          ? (isThai ? 'ใช้ Drive ผู้ใช้นี้' : 'Current user Drive')
                          : driveSummary.driveMode === 'service_account'
                            ? (isThai ? 'ใช้ Drive กลางระบบ' : 'Service account Drive')
                            : (isThai ? 'ยังไม่ตั้งค่า Drive' : 'Drive not configured')}
                    </span>
                  )}
                </p>
              </div>
              <Link to="/app/projects" className="inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:text-primary-800">
                {isThai ? 'ดูโปรเจคทั้งหมด' : 'All projects'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {driveSummary?.projects?.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {driveSummary.projects.slice(0, 6).map((project) => (
                  <div key={project.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">{project.code} · {project.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {isThai ? `${project.fileCount} ไฟล์ใน Drive` : `${project.fileCount} Drive files`} · {project.status}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                        {project.fileCount}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link to={`/app/projects/${project.id}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
                        {isThai ? 'เปิดในระบบ' : 'Open workspace'}
                      </Link>
                      {project.driveFolderUrl && (
                        <a href={project.driveFolderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100">
                          Drive
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {project.googleSheetUrl && (
                        <a href={project.googleSheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
                          Sheet
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                {isThai ? 'ยังไม่มีโฟลเดอร์โปรเจคที่ sync เข้า Drive' : 'No project Drive folders have been synced yet.'}
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  {isThai ? 'ไฟล์ล่าสุดที่ sync แล้ว' : 'Recent synced files'}
                </p>
                <p className="text-sm text-slate-500">
                  {isThai ? 'กดเปิดไฟล์จริงใน Drive หรือกลับไปดูโปรเจคต้นทาง' : 'Open the real Drive file or jump back to its project.'}
                </p>
              </div>
            </div>

            {driveSummary?.recentFiles?.length ? (
              <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                {driveSummary.recentFiles.map((file) => (
                  <div key={file.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{file.fileName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {file.projectCode ? `${file.projectCode} · ${file.projectName ?? ''}` : (isThai ? 'ไฟล์ระดับบริษัท' : 'Company file')}
                          {file.driveSyncedAt ? ` · ${formatDate(file.driveSyncedAt)}` : ''}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {file.driveUrl && (
                            <a href={file.driveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-2 py-1 text-xs font-bold text-primary-700 hover:bg-primary-100">
                              <LinkIcon className="h-3.5 w-3.5" />
                              {isThai ? 'เปิดไฟล์' : 'Open file'}
                            </a>
                          )}
                          {file.driveFolderUrl && (
                            <a href={file.driveFolderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100">
                              <FolderOpen className="h-3.5 w-3.5" />
                              {isThai ? 'โฟลเดอร์' : 'Folder'}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                {isThai ? 'ยังไม่มีไฟล์ที่ sync เข้า Drive จาก LINE/เว็บ/โปรเจค' : 'No files have been synced from LINE, web upload, or projects yet.'}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* RD Compliance Alert (if there are issues) */}
      {!complianceLoading && hasComplianceIssue && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 shadow-sm">
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

      {/* Autopilot lanes */}
      <section className="card">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">
              {isThai ? 'Workflow อัตโนมัติ' : 'Automation workflow'}
            </p>
            <h2 className="mt-1 text-lg font-bold text-gray-950">
              {isThai ? 'จากเอกสารเข้า ไปจนถึงภาษีพร้อมยื่น' : 'From document intake to tax-ready filing'}
            </h2>
          </div>
          <Link to="/app/admin" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800">
            {isThai ? 'ตั้งค่าการเชื่อมต่อ' : 'Configure integrations'}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          {autopilotLanes.map((lane, index) => {
            const Icon = lane.icon;
            return (
              <div key={lane.key} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary-700 ring-1 ring-slate-200">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-bold text-gray-400">0{index + 1}</span>
                </div>
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">{lane.label}</p>
                <p className="mt-1 text-sm font-bold text-gray-950">{lane.title}</p>
                <p className="mt-3 inline-flex rounded-full bg-white px-2 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                  {lane.status}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading
          ? [1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)
          : statCards.map((stat, index) => (
              <MetricCard
                key={stat.key}
                label={t(`dashboard.summary.${stat.key}`)}
                value={stat.value}
                tone={index === 3 ? 'success' : index === 2 ? 'warning' : 'primary'}
              />
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
                <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3">
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
            <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-4">
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
              <div key={bucket.label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{bucket.label}</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{formatCurrency(bucket.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <MascotHelperCard
        title={isThai ? 'Billoy พร้อมช่วยปิดงานเอกสารวันนี้' : 'Billoy is ready to help close today’s paperwork'}
        description={isThai ? 'เลือก workflow ที่ใช้บ่อยได้จากที่นี่ ระบบจะพาไปหน้าที่ถูกต้องโดยไม่ต้องจำเมนู' : 'Jump into the common workflows without remembering where each menu lives.'}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: isThai ? 'เอกสารขาย' : 'Sales document', href: '/app/invoices/new' },
            { label: isThai ? 'ใบเสร็จรับเงิน' : 'Receipt', href: '/app/invoices/new?type=receipt' },
            { label: isThai ? 'ใบลดหนี้' : 'Credit Note', href: '/app/invoices/new?type=credit_note' },
            { label: isThai ? 'รายการ/ส่งออก' : 'List / Export', href: '/app/invoices' },
          ].map((action) => (
            <Link
              key={action.label}
              to={action.href}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/80 p-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-primary-200 hover:text-primary-800 hover:shadow-sm"
            >
              <span className="truncate">{action.label}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
            </Link>
          ))}
        </div>
      </MascotHelperCard>

      {/* RD Compliance Panel */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-gray-900">
              {isThai ? 'สถานะส่งเอกสารให้ RD เมื่อเปิดใช้ e-Tax' : 'RD submission status when e-Tax is enabled'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isThai ? 'สำหรับบริษัทที่ตั้งค่า e-Tax/RD แล้ว · กำหนดส่งทุกวันที่ 15 ของเดือนถัดไป' : 'For companies with e-Tax/RD settings enabled · Deadline: 15th of following month'}
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
          <EmptyState
            title={isThai ? 'ยังไม่มีข้อมูล RD' : 'No RD data yet'}
            description={isThai ? 'เมื่อเริ่มออกเอกสารและส่ง RD ระบบจะแสดงสถานะรายเดือนที่นี่' : 'Monthly RD submission readiness will appear here after documents are issued.'}
            variant="waiting"
          />
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
                    <EmptyState
                      title={isThai ? 'ยังไม่มีเอกสารขาย' : 'No sales documents yet'}
                      description={isThai ? 'สร้างเอกสารใบแรกก่อน แล้วค่อยเปิด workflow e-Tax/RD เมื่อบริษัทลงทะเบียนและตั้งค่าพร้อม' : 'Create the first document now, then enable the e-Tax/RD workflow after registration and setup are ready.'}
                      actionLabel={isThai ? 'สร้างเอกสารขาย' : 'Create sales document'}
                      actionHref="/app/invoices/new"
                    />
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
