import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Plus,
  ArrowRight,
  CheckCircle2,
  Bot,
  Table2,
  UserCheck,
  Inbox,
  Send,
  Calculator,
  CreditCard,
  FileCheck2,
  Sparkles,
  ShieldCheck,
  FolderOpen,
  FileText,
  Link as LinkIcon,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { EmptyState, MascotHelperCard, mascotAssets } from '../components/ui/AppChrome';
import { MonthEndWorkspacePreview, type MonthEndWorkspace } from '../components/monthEnd/MonthEndWorkspacePreview';
import DashboardCharts from '../components/dashboard/DashboardCharts';
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
  serviceAccountConfigured?: boolean;
  sheetsConfigured?: boolean;
  linkedAt: string | null;
  companyDriveOwner: {
    id: string;
    email: string;
    name: string;
    linkedAt: string | null;
    connected: boolean;
  } | null;
  driveMode: 'company_owner' | 'current_user' | 'service_account' | 'oauth_ready' | 'not_configured';
  workspaceSheetUrl: string | null;
  workspaceSheetSyncedAt: string | null;
  projects: DriveSummaryProject[];
  recentFiles: DriveSummaryFile[];
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
        <div className={`h-full rounded-full transition-[width] duration-300 ${color}`} style={{ width: `${rate}%` }} />
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
  const [mpChannels, setMpChannels] = useState<Array<{ label: string; value: number }>>([]);
  const [driveSummaryError, setDriveSummaryError] = useState<string | null>(null);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveOpening, setDriveOpening] = useState(false);
  const [sheetOpening, setSheetOpening] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [resyncMsg, setResyncMsg] = useState<string | null>(null);
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
    const CHANNEL_LABEL: Record<string, string> = {
      shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok', facebook: 'Facebook',
      instagram: 'Instagram', line_shopping: 'LINE', shopify: 'Shopify', woocommerce: 'Woo', pos: 'POS', other: 'อื่นๆ',
    };
    fetch('/api/marketplace/settlements/summary', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const channels = j?.data?.channels ?? [];
        setMpChannels(channels.filter((c: { net: number }) => c.net > 0).map((c: { channel: string; net: number }) => ({ label: CHANNEL_LABEL[c.channel] ?? c.channel, value: c.net })));
      })
      .catch(() => { /* non-blocking: chart shows empty state */ });
  }, [token]);

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

  // Current month compliance (last item)
  const currentMonth = compliance[compliance.length - 1];
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

  const worklistItems = [
    {
      key: 'ai-inbox',
      icon: Inbox,
      href: '/app/purchase-invoices',
      value: documentStats ? aiReviewCount.toLocaleString() : '—',
      title: isThai ? 'เอกสารรอ AI ตรวจ' : 'AI documents to review',
      detail: isThai
        ? `รับเข้า ${documentStats?.totalLast30Days ?? 0} ไฟล์ใน 30 วันล่าสุด`
        : `${documentStats?.totalLast30Days ?? 0} files received in the last 30 days`,
      statusTone: aiReviewCount > 0 ? 'amber' : 'green',
      status: aiReviewCount > 0 ? (isThai ? 'รอตรวจ' : 'Review') : (isThai ? 'โล่ง' : 'Clear'),
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
      statusTone: pendingRdCount > 0 ? 'red' : 'green',
      status: pendingRdCount > 0 ? (isThai ? 'ต้องส่ง' : 'Pending') : (isThai ? 'พร้อม' : 'Ready'),
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
      statusTone: stats && stats.receivables.overdueOutstanding > 0 ? 'red' : 'green',
      status: stats && stats.receivables.overdueOutstanding > 0 ? (isThai ? 'เกินกำหนด' : 'Overdue') : (isThai ? 'ปกติ' : 'Clear'),
      action: isThai ? 'ดูใบค้างชำระ' : 'View invoices',
    },
    {
      key: 'tax',
      icon: Calculator,
      href: '/app/vat-summary',
      value: currentMonth ? `${currentMonth.complianceRate}%` : '—',
      title: isThai ? 'ความพร้อมยื่น VAT' : 'VAT filing readiness',
      detail: isThai ? 'รวมขาย ซื้อ และสถานะ RD ไว้ในมุมมองเดียว' : 'Sales, purchase VAT, and RD readiness in one view',
      statusTone: currentMonth && currentMonth.complianceRate < 100 ? 'amber' : 'green',
      status: currentMonth && currentMonth.complianceRate < 100 ? (isThai ? 'เช็คต่อ' : 'Check') : (isThai ? 'พร้อม' : 'Ready'),
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
      statusTone: (stats?.customerReadiness?.actionNeeded ?? 0) > 0 ? 'amber' : 'green',
      status: (stats?.customerReadiness?.actionNeeded ?? 0) > 0 ? (isThai ? 'ข้อมูลขาด' : 'Missing') : (isThai ? 'พร้อม' : 'Ready'),
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
  const latestRevenue = stats?.monthlyRevenue?.length
    ? stats.monthlyRevenue[stats.monthlyRevenue.length - 1].total
    : stats?.totalRevenue ?? 0;
  const netVat = monthEnd?.summary.vatPayable ?? 0;
  const agingBuckets = stats
    ? [
        { key: 'current', label: isThai ? 'ยังไม่เกิน' : 'Current', value: stats.receivables.aging.current, color: 'bg-emerald-500' },
        { key: '1-30', label: '1-30', value: stats.receivables.aging.days1To30, color: 'bg-lime-500' },
        { key: '31-60', label: '31-60', value: stats.receivables.aging.days31To60, color: 'bg-amber-500' },
        { key: '61-90', label: '61-90', value: stats.receivables.aging.days61To90, color: 'bg-orange-500' },
        { key: '90+', label: isThai ? '90+ วัน' : '90+', value: stats.receivables.aging.days90Plus, color: 'bg-red-500' },
      ]
    : [];
  const totalAging = agingBuckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const vatReadyLabel = currentMonth
    ? `${currentMonth.complianceRate}%`
    : monthEnd
      ? formatCurrency(netVat)
      : '—';
  const driveModeLabel = driveSummary?.driveMode === 'company_owner'
    ? (isThai ? 'Drive เจ้าของบริษัท' : 'Company owner Drive')
    : driveSummary?.driveMode === 'current_user'
      ? (isThai ? 'Drive ผู้ใช้นี้' : 'Current user Drive')
      : driveSummary?.driveMode === 'service_account'
        ? (isThai ? 'Drive กลางระบบ' : 'Service account Drive')
        : driveSummary?.driveMode === 'oauth_ready'
          ? (isThai ? 'รอเชื่อมเจ้าของ Drive' : 'Waiting for Drive owner')
          : (isThai ? 'ยังไม่ตั้งค่า Drive' : 'Drive not configured');
  const statusDotClass: Record<string, string> = {
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    green: 'bg-emerald-500',
  };
  const statusPillClass: Record<string, string> = {
    red: 'text-red-700 ring-red-200',
    amber: 'text-amber-700 ring-amber-200',
    green: 'text-emerald-700 ring-emerald-200',
  };

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
        const j = await syncRes.json().catch(() => ({})) as { error?: string; data?: { status?: string } };
        if (j.data?.status === 'needs_drive_owner') {
          throw new Error(isThai
            ? 'ต้องเชื่อม Google Drive เจ้าของบริษัทก่อนสร้างสมุดทะเบียนภาษี'
            : 'Connect the company Google Drive owner before creating the master tax register.');
        }
        if (j.data?.status === 'not_configured') {
          throw new Error(isThai
            ? 'ยังไม่ได้ตั้งค่า Google Sheets สำหรับระบบนี้'
            : 'Google Sheets is not configured for this environment.');
        }
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

  // Force a master-sheet rebuild even when the sheet already exists. The
  // "Open" button only opens the stored URL; without this there's no way to
  // pull in newly-added rows on demand or to let the worker re-home a sheet
  // that landed outside the Billboy folder.
  async function handleResyncMasterSheet() {
    if (!token || resyncing) return;
    setResyncing(true);
    setResyncMsg(null);
    setDriveSummaryError(null);
    try {
      const res = await fetch('/api/dashboard/workspace-sheet/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json().catch(() => ({})) as { error?: string; data?: { status?: string } };
      if (!res.ok) {
        if (j.data?.status === 'needs_drive_owner') {
          throw new Error(isThai ? 'ต้องเชื่อม Google Drive เจ้าของบริษัทก่อน' : 'Connect the company Google Drive owner first.');
        }
        if (j.data?.status === 'not_configured') {
          throw new Error(isThai ? 'ยังไม่ได้ตั้งค่า Google Sheets สำหรับระบบนี้' : 'Google Sheets is not configured for this environment.');
        }
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setResyncMsg(isThai
        ? 'กำลังรีเฟรชสมุดทะเบียน — ระบบจะอัปเดตข้อมูลและจัดไฟล์เข้าโฟลเดอร์ Billboy ภายใน 1-2 นาที'
        : 'Re-syncing the tax register — data refresh and refiling into the Billboy folder finish within 1-2 minutes.');
    } catch (err) {
      setDriveSummaryError((err as Error).message);
    } finally {
      setResyncing(false);
    }
  }

  return (
    <div className="workspace-page">
      <section className="workspace-command grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-center">
        <div className="relative z-10 min-w-0">
          <div className="premium-eyebrow">
            <Bot className="h-3.5 w-3.5" />
            {isThai ? 'ภาพรวมเงินที่ต้องจัดการวันนี้' : 'Billboy Ledger Banner'}
          </div>
          <p className="mt-5 text-sm font-semibold text-slate-600">
            {isThai ? `สวัสดี ${user?.name ?? ''} · วันนี้มี ${commandCount} เรื่องที่ควรจัดการ` : `Hi ${user?.name ?? ''} · ${commandCount} finance actions need attention`}
          </p>
          <h1 className="mt-2 text-[2rem] font-bold leading-tight text-slate-950 sm:text-[2.35rem]">
            {isThai ? 'ยอดต้องตามเก็บทั้งหมด' : 'Total receivables to collect'}
          </h1>
          <div className="mt-3 text-[2.1rem] font-bold leading-none text-primary-800 tabular-nums sm:text-[3.4rem]">
            {loading ? '—' : formatCurrency(stats?.receivables.totalOutstanding ?? 0)}
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500">
            {isThai ? 'ณ วันที่' : 'As of'} {formatDate(new Date().toISOString())}
          </p>

          <div className="mt-5 h-px w-full max-w-2xl bg-slate-200" />

          {/* Ledger strip — money state first: how much, how urgent, then context. */}
          <dl className="mt-4 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {[
              {
                key: 'overdue',
                label: isThai ? 'เกินกำหนด' : 'Overdue',
                value: stats ? formatCurrency(stats.receivables.overdueOutstanding) : '—',
                urgent: (stats?.receivables.overdueOutstanding ?? 0) > 0,
              },
              {
                key: 'current',
                label: isThai ? 'ยังไม่เกินกำหนด' : 'Not yet due',
                value: stats ? formatCurrency(stats.receivables.currentOutstanding) : '—',
                urgent: false,
              },
              {
                key: 'revenue',
                label: isThai ? 'รายได้เดือนนี้' : 'Revenue this month',
                value: loading ? '—' : formatCurrency(latestRevenue),
                urgent: false,
              },
              {
                key: 'vat',
                label: isThai ? 'ภาษีสุทธิ' : 'Net VAT',
                value: monthEnd ? formatCurrency(netVat) : '—',
                urgent: false,
              },
            ].map((cell) => (
              <div key={cell.key} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  {cell.urgent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-thai-gold" />}
                  {cell.label}
                </dt>
                <dd className={`mt-1 truncate text-sm font-bold tabular-nums sm:text-lg ${cell.urgent ? 'text-rose-700' : 'text-slate-950'}`}>
                  {cell.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="workspace-command-rail relative z-10 grid grid-cols-[88px_minmax(0,1fr)] gap-3 lg:flex lg:max-w-sm lg:flex-col lg:gap-4 lg:justify-self-end">
          <div className="overflow-hidden rounded-xl border border-white/80 bg-white/70 lg:w-full">
            <img src={mascotAssets.hero} alt="" className="h-full min-h-24 w-full object-cover object-center lg:h-44" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-950">
              {isThai ? 'เริ่มจากงานที่กระทบเงินก่อน' : 'Start with money-impacting work first'}
            </p>
            <p className="mt-1 hidden text-xs leading-5 text-slate-600 sm:block">
              {isThai ? 'เปิด AI Inbox หรือออกเอกสารขายใหม่ได้ทันทีโดยไม่ต้องไล่หาเมนู' : 'Open the AI Inbox or create a sales document without hunting through menus.'}
            </p>
          </div>
          <div className="col-span-2 flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Link to="/app/purchase-invoices" className="btn-primary justify-center">
              <Inbox className="h-4 w-4" />
              {isThai ? 'เปิด AI Inbox' : 'Open AI Inbox'}
            </Link>
            <Link to="/app/invoices/new" className="btn-secondary justify-center">
              <Plus className="h-4 w-4" />
              {isThai ? 'สร้างเอกสารขาย' : 'Create sales document'}
            </Link>
          </div>
        </div>
      </section>

      {shouldShowFirstInvoicePath && (
        <section className="workspace-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-700">
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
            <div className="flex flex-col items-stretch gap-2 sm:items-end sm:w-auto">
              <Link to="/app/invoices/new" className="btn-primary w-full justify-center sm:w-auto">
                <Plus className="h-4 w-4" />
                {isThai ? 'สร้างใบแรก' : 'Create first invoice'}
              </Link>
              {stats?.totalInvoices === 0 && (
                <button
                  type="button"
                  onClick={handleSeedDemoData}
                  disabled={seedingDemo}
                  className="text-xs text-primary-700 hover:text-primary-900 underline underline-offset-2 text-center sm:text-right"
                >
                  {seedingDemo
                    ? (isThai ? 'กำลังสร้าง…' : 'Creating…')
                    : (isThai ? 'หรือลองด้วยข้อมูลตัวอย่างก่อน' : 'or try with sample data first')}
                </button>
              )}
              {seedError && <p className="text-xs text-rose-600 text-center sm:text-right">{seedError}</p>}
            </div>
          </div>
          <div className="workspace-rail mt-4 md:grid-cols-3">
            {firstInvoiceSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <Link
                  key={step.key}
                  to={step.href}
                  className="workspace-rail-item group flex min-h-[108px] flex-col justify-between text-left transition-colors hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-inset"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-700 text-white">
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
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary-700">
                    {step.action}
                    <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {!shouldShowFirstInvoicePath && (
        <section className="workspace-panel">
          <div className="mb-3 flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-700">
                {isThai ? 'รายการงานประจำวัน' : 'Daily worklist'}
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">
                {isThai ? 'งานที่กระทบเงินและภาษี' : 'Money and tax actions'}
              </h2>
            </div>
            <p className="text-xs font-semibold text-slate-600">
              {isThai ? 'จัดเรียงตามสิ่งที่ควรเคลียร์ก่อน' : 'Prioritized by what should be cleared first'}
            </p>
          </div>
          <div className="workspace-rail mt-4 md:grid-cols-2 xl:grid-cols-5">
            {worklistItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={item.href}
                  className="workspace-rail-item group transition-colors hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-inset"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-700 text-white shadow-sm">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold ring-1 ${statusPillClass[item.statusTone]}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass[item.statusTone]}`} />
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-4 text-2xl font-bold leading-none text-slate-950 tabular-nums">{item.value}</div>
                  <p className="mt-2 text-sm font-bold text-slate-900">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.detail}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary-700">
                    {item.action}
                    <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-12">
        <main className="min-w-0 space-y-5 xl:col-span-8">
          <section className="workspace-panel">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-700">
                  {isThai ? 'บัญชีลูกหนี้' : 'Receivables ledger'}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">{t('dashboard.recentInvoices')}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {isThai ? 'รายการล่าสุดพร้อมอายุหนี้ เพื่อให้ตามเงินและออกใบเสร็จต่อได้เร็ว' : 'Recent documents with AR aging so collection and receipt work stays visible.'}
                </p>
              </div>
              <Link to="/app/invoices" className="inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:text-primary-900">
                {t('dashboard.viewAll')}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-4 border-y border-slate-200 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">{isThai ? 'อายุลูกหนี้' : 'AR Aging'}</p>
                  <p className="mt-1 text-2xl font-bold text-primary-800 tabular-nums">{loading ? '—' : formatCurrency(stats?.receivables.totalOutstanding ?? 0)}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />{isThai ? 'เกินกำหนด' : 'Overdue'} {stats ? formatCurrency(stats.receivables.overdueOutstanding) : '—'}</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />{isThai ? 'ยังไม่เกิน' : 'Current'} {stats ? formatCurrency(stats.receivables.currentOutstanding) : '—'}</span>
                </div>
              </div>
              <div className="mt-4 grid gap-0 overflow-hidden border-y border-slate-200 sm:grid-cols-5">
                {loading ? (
                  [1, 2, 3, 4, 5].map((i) => <div key={i} className="h-20 animate-pulse border-b border-slate-200 bg-slate-100 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0" />)
                ) : agingBuckets.map((bucket) => {
                  const width = totalAging > 0 ? Math.max((bucket.value / totalAging) * 100, bucket.value > 0 ? 8 : 0) : 0;
                  return (
                    <div key={bucket.key} className="border-b border-slate-200 p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${bucket.color}`} style={{ width: `${width}%` }} />
                      </div>
                      <p className="mt-2 text-xs font-bold text-slate-600">{bucket.label}</p>
                      <p className="mt-1 text-sm font-bold text-slate-950 tabular-nums">{formatCurrency(bucket.value)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
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
                      <td colSpan={6} className="table-cell py-10 text-center">
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
                          <td className="table-cell text-gray-600">{formatDate(inv.invoiceDate)}</td>
                          <td className="table-cell text-right font-bold tabular-nums text-slate-950">{formatCurrency(inv.total)}</td>
                          <td className="table-cell">
                            <span className={STATUS_COLORS[inv.status]}>
                              {t(`invoice.status.${inv.status}`)}
                            </span>
                          </td>
                          <td className="table-cell">
                            <Link to={`/app/invoices/${inv.id}/edit`} className="text-xs font-bold text-primary-700 hover:text-primary-900">
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
          </section>

          {stats && (
            <DashboardCharts
              isThai={isThai}
              formatCurrency={formatCurrency}
              monthlyRevenue={stats.monthlyRevenue ?? []}
              aging={stats.receivables?.aging ?? { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, days90Plus: 0 }}
              marketplace={mpChannels}
            />
          )}

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
                  ? 'ระบบโหลดข้อมูลหลักได้แล้ว แต่โหลดตารางสรุปรายเดือนไม่ได้ ลองรีเฟรชหน้านี้อีกครั้ง'
                  : 'The main dashboard loaded, but the month-end summary did not. Refresh this page and check permissions if it remains hidden.'}
              </p>
              {monthEndError && (
                <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 font-mono text-xs text-amber-900">
                  {monthEndError}
                </p>
              )}
            </section>
          )}
        </main>

        <aside className="min-w-0 space-y-5 xl:col-span-4">
          <section className="workspace-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">
                  {isThai ? 'Workflow อัตโนมัติ' : 'Automation workflow'}
                </p>
                <h2 className="mt-1 text-lg font-bold text-gray-950">
                  {isThai ? 'จากเอกสารเข้า ไปจนถึงภาษีพร้อมยื่น' : 'From document intake to tax-ready filing'}
                </h2>
              </div>
              <Link to="/app/admin" className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:text-primary-900">
                {isThai ? 'ตั้งค่า' : 'Configure'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-5 border-y border-slate-200">
              {autopilotLanes.map((lane, index) => {
                const Icon = lane.icon;
                return (
                  <div key={lane.key} className="border-b border-slate-200 px-1 py-4 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary-700 ring-1 ring-slate-200">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700">{lane.label}</p>
                          <span className="text-[11px] font-bold text-slate-500">0{index + 1}</span>
                        </div>
                        <p className="mt-0.5 text-sm font-bold text-gray-950">{lane.title}</p>
                        <p className="mt-1 inline-flex rounded-full bg-white px-2 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                          {lane.status}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <MascotHelperCard
            title={isThai ? 'Billoy พร้อมช่วยปิดงานเอกสารวันนี้' : 'Billoy is ready to help close today’s paperwork'}
            description={isThai ? 'เลือก workflow ที่ใช้บ่อยได้จากที่นี่ ระบบจะพาไปหน้าที่ถูกต้องโดยไม่ต้องจำเมนู' : 'Jump into the common workflows without remembering where each menu lives.'}
          >
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: isThai ? 'เอกสารขาย' : 'Sales document', href: '/app/invoices/new' },
                { label: isThai ? 'ใบเสร็จ' : 'Receipt', href: '/app/invoices/new?type=receipt' },
                { label: isThai ? 'ลดหนี้' : 'Credit Note', href: '/app/invoices/new?type=credit_note' },
                { label: isThai ? 'การเงิน' : 'Finance', href: '/app/reports/finance-overview' },
                { label: isThai ? 'Marketplace' : 'Marketplace', href: '/app/marketplace-orders' },
                { label: isThai ? 'ส่งออก' : 'Export', href: '/app/invoices' },
              ].map((action) => (
                <Link
                  key={action.label}
                  to={action.href}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/90 p-2.5 text-xs font-bold text-slate-700 transition hover:border-primary-200 hover:text-primary-800"
                >
                  <span className="truncate">{action.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </Link>
              ))}
            </div>
          </MascotHelperCard>

          <section className="workspace-panel">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-700">{isThai ? 'ความพร้อม VAT' : 'VAT Readiness'}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-bold text-slate-950 tabular-nums">{vatReadyLabel}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {monthEnd
                    ? (netVat >= 0 ? (isThai ? 'ภาษีต้องชำระโดยประมาณ' : 'Estimated VAT payable') : (isThai ? 'ภาษีขอคืนโดยประมาณ' : 'Estimated VAT refund'))
                    : (isThai ? 'รอข้อมูลรอบเดือน' : 'Waiting for period data')}
                </p>
              </div>
              <Link to="/app/vat-summary" className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 ring-1 ring-primary-100 hover:bg-primary-100">
                {isThai ? 'เปิด VAT' : 'Open VAT'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          <details id="drive-tax-register" className="workspace-panel group scroll-mt-24" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {isThai ? 'คลังหลักฐาน Drive + สมุดทะเบียนภาษี' : 'Drive Evidence Vault + Master Tax Register'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  {driveSummary?.projects?.length ?? 0} {isThai ? 'โปรเจคพร้อมแฟ้มหลักฐาน' : 'project evidence folders'} · {driveModeLabel}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-4 space-y-4">
              {driveSummaryError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                  <p className="font-bold">{isThai ? 'ยังเปิดคลังหลักฐานหรือสมุดทะเบียนไม่ได้' : 'Evidence vault or master register is not ready yet'}</p>
                  <p className="mt-1 font-mono text-xs">{driveSummaryError}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {driveSummary?.driveConnected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {isThai ? 'Drive ผู้ใช้นี้พร้อม' : 'Current user Drive ready'}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectDrive}
                    disabled={driveConnecting || driveSummary?.oauthConfigured === false}
                    className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <UserCheck className="h-4 w-4" />
                    {driveConnecting ? (isThai ? 'กำลังเชื่อม...' : 'Connecting...') : (isThai ? 'เชื่อม Drive เจ้าของ' : 'Connect owner Drive')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOpenCompanyDrive}
                  disabled={driveOpening || driveSummary?.driveConfigured === false}
                  className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FolderOpen className="h-4 w-4" />
                  {driveOpening ? (isThai ? 'กำลังเปิด...' : 'Opening...') : (isThai ? 'เปิดคลังหลักฐาน' : 'Open Evidence Vault')}
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
                      ? (isThai ? 'เปิดสมุดทะเบียนภาษี' : 'Open Tax Register')
                      : (isThai ? 'สร้างสมุดทะเบียนภาษี' : 'Create Tax Register')}
                </button>
                {driveSummary?.workspaceSheetUrl && (
                  <button
                    type="button"
                    onClick={handleResyncMasterSheet}
                    disabled={resyncing || driveSummary?.driveConfigured === false}
                    className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${resyncing ? 'animate-spin' : ''}`} />
                    {resyncing ? (isThai ? 'กำลังรีเฟรช...' : 'Re-syncing...') : (isThai ? 'รีเฟรช/sync ใหม่' : 'Re-sync')}
                  </button>
                )}
              </div>
              {resyncMsg && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-800">
                  {resyncMsg}
                </div>
              )}
              {driveSummary?.projects?.length ? (
                <div className="space-y-2">
                  {driveSummary.projects.slice(0, 4).map((project) => (
                    <div key={project.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="truncate text-sm font-bold text-slate-950">{project.code} · {project.name}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {isThai ? `${project.fileCount} ไฟล์หลักฐานใน Drive` : `${project.fileCount} evidence files in Drive`} · {project.status}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                  {isThai ? 'ยังไม่มีแฟ้มหลักฐานโปรเจคที่ sync เข้า Drive' : 'No project evidence folders have been synced yet.'}
                </div>
              )}
            </div>
          </details>

          <details className="workspace-panel group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {isThai ? 'สถานะส่งเอกสารให้ RD เมื่อเปิดใช้ e-Tax' : 'RD submission status when e-Tax is enabled'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  {compliance.length === 0
                    ? (isThai ? 'ยังไม่มีข้อมูล' : 'No data')
                    : (isThai ? `${compliance.length} เดือน` : `${compliance.length} mo`)}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>

            <div className="mt-5">
              {complianceLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse space-y-2">
                      <div className="h-4 w-24 rounded bg-gray-200" />
                      <div className="h-2 rounded-full bg-gray-200" />
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
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{m.month}</span>
                          {m.isPast && m.complianceRate < 100 && (
                            <span className="text-xs font-medium text-red-600">
                              {isThai ? '(เกินกำหนด)' : '(past deadline)'}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-bold text-slate-600">{m.complianceRate}%</span>
                      </div>
                      {m.total > 0 && <ComplianceBar rate={m.complianceRate} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </aside>
      </div>

    </div>
  );
}
