import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  FolderOpen,
  Inbox,
  Loader2,
  Receipt,
  RefreshCw,
  Send,
  Upload,
  Users,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';

type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
type ProjectWorkspaceTab = 'overview' | 'action' | 'files' | 'purchases' | 'sales' | 'expenses';

interface ProjectUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Project {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  customerName?: string | null;
  budgetAmount: number;
  status: ProjectStatus;
  owner?: ProjectUser | null;
  approver?: ProjectUser | null;
  members: Array<{ id: string; role: string; user: ProjectUser }>;
  summary: {
    committedAmount: number;
    paidAmount: number;
    remainingAmount: number;
    budgetUsedPercent: number;
    isOverBudget: boolean;
    purchaseCount: number;
    expenseVoucherCount: number;
    documentIntakeCount: number;
  };
}

interface WorkspaceSummary {
  purchaseTotal: number;
  purchaseVat: number;
  revenueTotal: number;
  expenseTotal: number;
  estimatedMargin: number;
  actionNeededCount: number;
  filesCount: number;
  lineGroupCount: number;
}

interface ActionNeeded {
  id: string;
  severity: 'high' | 'medium' | 'low';
  type: string;
  title: string;
  message: string;
  documentIntakeId: string;
}

interface DocumentIntake {
  id: string;
  source: string;
  fileName?: string | null;
  mimeType: string;
  fileSize: number;
  fileUrl?: string | null;
  status: string;
  kind: string;
  targetType?: string | null;
  targetId?: string | null;
  purchaseInvoiceId?: string | null;
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PurchaseInvoice {
  id: string;
  supplierName: string;
  supplierTaxId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  subtotal: number;
  vatAmount: number;
  total: number;
  vatType: string;
  description?: string | null;
  category?: string | null;
  pdfUrl?: string | null;
  isPaid: boolean;
  paidAt?: string | null;
  createdAt: string;
}

interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  invoiceDate: string;
  dueDate?: string | null;
  subtotal: number;
  vatAmount: number;
  total: number;
  pdfUrl?: string | null;
  isPaid: boolean;
  paidAt?: string | null;
  buyer?: { id: string; nameTh?: string | null; nameEn?: string | null } | null;
}

interface ExpenseVoucher {
  id: string;
  voucherNumber: string;
  status: string;
  voucherDate: string;
  description?: string | null;
  totalAmount: number;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  createdAt: string;
}

interface LineGroup {
  id: string;
  groupName?: string | null;
  linkedAt: string;
}

interface ProjectWorkspace {
  project: Project;
  workspaceSummary: WorkspaceSummary;
  actionNeeded: ActionNeeded[];
  documentIntakes: DocumentIntake[];
  purchaseInvoices: PurchaseInvoice[];
  invoices: SalesInvoice[];
  expenseVouchers: ExpenseVoucher[];
  lineGroups: LineGroup[];
}

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  on_hold: 'border-amber-200 bg-amber-50 text-amber-700',
  completed: 'border-blue-200 bg-blue-50 text-blue-700',
  archived: 'border-slate-200 bg-slate-50 text-slate-500',
};

const ACTION_CLASSES: Record<ActionNeeded['severity'], string> = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-blue-200 bg-blue-50 text-blue-700',
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const { token, clearAuth } = useAuthStore();
  const { isThai, formatCurrency, formatDate } = useLanguage();
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectWorkspaceTab>('overview');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const fetchWorkspace = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${id}/workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearAuth();
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to load project workspace');
      }
      const json = await res.json();
      setWorkspace(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project workspace');
    } finally {
      setLoading(false);
    }
  }, [clearAuth, id, token]);

  useEffect(() => {
    void fetchWorkspace();
  }, [fetchWorkspace]);

  const tabs = useMemo(() => {
    const summary = workspace?.workspaceSummary;
    return [
      { id: 'overview' as const, label: isThai ? 'ภาพรวม' : 'Overview', count: null },
      { id: 'action' as const, label: isThai ? 'ต้องตรวจ' : 'Action', count: summary?.actionNeededCount ?? 0 },
      { id: 'files' as const, label: isThai ? 'ไฟล์' : 'Files', count: summary?.filesCount ?? 0 },
      { id: 'purchases' as const, label: isThai ? 'ขาซื้อ' : 'Purchases', count: workspace?.purchaseInvoices.length ?? 0 },
      { id: 'sales' as const, label: isThai ? 'ขาขาย' : 'Sales', count: workspace?.invoices.length ?? 0 },
      { id: 'expenses' as const, label: isThai ? 'เบิกจ่าย' : 'Expenses', count: workspace?.expenseVouchers.length ?? 0 },
    ];
  }, [isThai, workspace]);

  function statusLabel(value: ProjectStatus) {
    const labels: Record<ProjectStatus, string> = {
      active: isThai ? 'กำลังทำงาน' : 'Active',
      on_hold: isThai ? 'พักงาน' : 'On hold',
      completed: isThai ? 'เสร็จแล้ว' : 'Completed',
      archived: isThai ? 'เก็บถาวร' : 'Archived',
    };
    return labels[value];
  }

  async function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleUpload(file?: File | null) {
    if (!token || !workspace || !file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setError(isThai ? 'รองรับเฉพาะ PDF, JPG, PNG, WebP' : 'Only PDF, JPG, PNG, and WebP are supported');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch('/api/purchase-invoices/document-intakes/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          fileBase64,
          projectId: workspace.project.id,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Upload failed');
      }
      setActiveTab('files');
      await fetchWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function openDocument(doc: DocumentIntake) {
    if (doc.fileUrl?.startsWith('http')) {
      window.open(doc.fileUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!token) return;
    const res = await fetch(`/api/purchase-invoices/document-intakes/${doc.id}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError(isThai ? 'เปิดไฟล์นี้ไม่ได้' : 'Unable to open this file');
      return;
    }
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
  }

  async function downloadProjectExport() {
    if (!token || !workspace) return;
    setExporting(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${workspace.project.id}/export/excel`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const safeCode = workspace.project.code.replace(/[^A-Z0-9-_]/gi, '_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-${safeCode}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/app/projects" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700">
          <ArrowLeft className="h-4 w-4" />
          {isThai ? 'กลับไปหน้าโปรเจค' : 'Back to projects'}
        </Link>
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          {error || (isThai ? 'ไม่พบโปรเจคนี้' : 'Project not found')}
        </div>
      </div>
    );
  }

  const { project, workspaceSummary } = workspace;
  const usedPercent = Math.min(project.summary.budgetUsedPercent || 0, 100);
  const teamNames = [project.owner?.name, project.approver?.name, ...project.members.map((m) => m.user.name)]
    .filter(Boolean)
    .filter((name, index, arr) => arr.indexOf(name) === index);

  const statCards = [
    { label: isThai ? 'งบตั้งต้น' : 'Budget', value: formatCurrency(project.budgetAmount), icon: WalletCards },
    { label: isThai ? 'ใช้/จองงบ' : 'Committed', value: formatCurrency(project.summary.committedAmount), icon: Receipt },
    { label: isThai ? 'รายรับออกบิล' : 'Sales invoiced', value: formatCurrency(workspaceSummary.revenueTotal), icon: Send },
    { label: isThai ? 'กำไรประมาณการ' : 'Estimated margin', value: formatCurrency(workspaceSummary.estimatedMargin), icon: CheckCircle2 },
  ];

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link to="/app/projects" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700">
            <ArrowLeft className="h-4 w-4" />
            {isThai ? 'โปรเจคทั้งหมด' : 'All projects'}
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{project.code}</span>
            <span className={clsx('rounded-full border px-2 py-0.5 text-[11px] font-semibold', STATUS_CLASSES[project.status])}>
              {statusLabel(project.status)}
            </span>
            {project.summary.isOverBudget && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                {isThai ? 'เกินงบ' : 'Over budget'}
              </span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">{project.name}</h1>
          <p className="mt-1 max-w-4xl text-sm text-slate-500">
            {project.customerName || project.description || (isThai ? 'Workspace นี้รวมเอกสาร รูป สลิป ใบซื้อ ใบขาย และเบิกจ่ายของโปรเจคเดียวกัน' : 'This workspace collects files, slips, purchases, sales invoices, and expenses for this project.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchWorkspace()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            {isThai ? 'รีเฟรช' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => void downloadProjectExport()}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isThai ? 'Export Excel' : 'Export Excel'}
          </button>
          <Link
            to={`/app/invoices/new?projectId=${project.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Send className="h-4 w-4" />
            {isThai ? 'ออกใบขาย' : 'New sales invoice'}
          </Link>
          <Link
            to={`/app/expenses?projectId=${project.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Inbox className="h-4 w-4" />
            {isThai ? 'ทำใบเบิก' : 'New voucher'}
          </Link>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isThai ? 'อัปโหลดเข้าโปรเจค' : 'Upload to project'}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void handleUpload(file);
              }}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-slate-500">{card.label}</p>
                <Icon className="h-4 w-4 text-primary-500" />
              </div>
              <p className={clsx('mt-2 text-xl font-bold', card.label.includes('กำไร') || card.label.includes('margin') ? (workspaceSummary.estimatedMargin < 0 ? 'text-rose-600' : 'text-emerald-700') : 'text-slate-950')}>
                {card.value}
              </p>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{isThai ? 'ใช้งบไปแล้ว' : 'Budget used'}</span>
              <span>{project.summary.budgetUsedPercent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={clsx('h-full rounded-full', project.summary.isOverBudget ? 'bg-rose-500' : 'bg-primary-500')} style={{ width: `${usedPercent}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
              <Users className="h-3.5 w-3.5" />
              {teamNames.length > 0 ? teamNames.join(', ') : (isThai ? 'ยังไม่มีทีม' : 'No team')}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
              <Bot className="h-3.5 w-3.5" />
              LINE {workspaceSummary.lineGroupCount}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold',
              activeTab === tab.id
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-500 hover:text-slate-900',
            )}
          >
            {tab.label}
            {tab.count !== null && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{tab.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <WorkspacePanel title={isThai ? 'งานที่ต้องตรวจ' : 'Needs attention'} icon={AlertTriangle}>
            <ActionList actions={workspace.actionNeeded.slice(0, 5)} isThai={isThai} />
          </WorkspacePanel>
          <WorkspacePanel title={isThai ? 'ไฟล์ล่าสุด' : 'Latest files'} icon={FolderOpen}>
            <DocumentList docs={workspace.documentIntakes.slice(0, 5)} token={token ?? ''} isThai={isThai} formatDate={formatDate} onOpen={openDocument} />
          </WorkspacePanel>
          <WorkspacePanel title={isThai ? 'LINE / ทีม' : 'LINE / team'} icon={Users}>
            <div className="space-y-3">
              {workspace.lineGroups.length === 0 ? (
                <EmptyBlock text={isThai ? 'ยังไม่ได้ผูกกลุ่ม LINE กับโปรเจคนี้' : 'No LINE group linked to this project yet'} />
              ) : (
                workspace.lineGroups.map((group) => (
                  <div key={group.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-semibold text-slate-900">{group.groupName || (isThai ? 'กลุ่ม LINE' : 'LINE group')}</p>
                    <p className="text-xs text-slate-500">{formatDate(group.linkedAt)}</p>
                  </div>
                ))
              )}
            </div>
          </WorkspacePanel>
        </div>
      )}

      {activeTab === 'action' && (
        <WorkspacePanel title={isThai ? 'เอกสารที่ต้องจัดการ' : 'Documents needing action'} icon={AlertTriangle}>
          <ActionList actions={workspace.actionNeeded} isThai={isThai} />
        </WorkspacePanel>
      )}

      {activeTab === 'files' && (
        <WorkspacePanel title={isThai ? 'ไฟล์ทั้งหมดของโปรเจค' : 'Project file library'} icon={FolderOpen}>
          <DocumentList docs={workspace.documentIntakes} token={token ?? ''} isThai={isThai} formatDate={formatDate} onOpen={openDocument} />
        </WorkspacePanel>
      )}

      {activeTab === 'purchases' && (
        <WorkspacePanel title={isThai ? 'เอกสารขาซื้อ / Input VAT' : 'Purchase documents / Input VAT'} icon={Receipt}>
          <DataTable
            emptyText={isThai ? 'ยังไม่มีเอกสารขาซื้อในโปรเจคนี้' : 'No purchase documents in this project yet'}
            rows={workspace.purchaseInvoices.map((item) => ({
              id: item.id,
              title: item.supplierName,
              subtitle: `${item.invoiceNumber} · ${formatDate(item.invoiceDate)}`,
              amount: formatCurrency(item.total),
              meta: item.isPaid ? (isThai ? 'จ่ายแล้ว' : 'Paid') : (isThai ? 'ยังไม่จ่าย' : 'Unpaid'),
              href: `/app/purchase-invoices?projectId=${project.id}`,
            }))}
          />
        </WorkspacePanel>
      )}

      {activeTab === 'sales' && (
        <WorkspacePanel title={isThai ? 'ใบแจ้งหนี้ / รายรับของโปรเจค' : 'Sales invoices / revenue'} icon={Send}>
          <DataTable
            emptyText={isThai ? 'ยังไม่มีใบขายในโปรเจคนี้' : 'No sales invoices in this project yet'}
            rows={workspace.invoices.map((item) => ({
              id: item.id,
              title: item.buyer?.nameTh || item.buyer?.nameEn || item.invoiceNumber,
              subtitle: `${item.invoiceNumber} · ${formatDate(item.invoiceDate)}`,
              amount: formatCurrency(item.total),
              meta: item.status,
              href: `/app/invoices/${item.id}/edit`,
            }))}
          />
        </WorkspacePanel>
      )}

      {activeTab === 'expenses' && (
        <WorkspacePanel title={isThai ? 'Payment Voucher / ค่าใช้จ่ายไม่มีใบกำกับ' : 'Payment vouchers / non-tax expenses'} icon={Inbox}>
          <DataTable
            emptyText={isThai ? 'ยังไม่มี payment voucher ในโปรเจคนี้' : 'No payment vouchers in this project yet'}
            rows={workspace.expenseVouchers.map((item) => ({
              id: item.id,
              title: item.voucherNumber,
              subtitle: `${item.description || (isThai ? 'ไม่มีรายละเอียด' : 'No description')} · ${formatDate(item.voucherDate)}`,
              amount: formatCurrency(item.totalAmount),
              meta: item.status,
              href: `/app/expenses?projectId=${project.id}`,
            }))}
          />
        </WorkspacePanel>
      )}
    </div>
  );
}

function WorkspacePanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <Icon className="h-4 w-4 text-primary-600" />
        <h2 className="text-sm font-bold text-slate-950">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function ActionList({ actions, isThai }: { actions: ActionNeeded[]; isThai: boolean }) {
  if (actions.length === 0) {
    return <EmptyBlock text={isThai ? 'ไม่มีงานค้าง เอกสารในโปรเจคนี้เรียบร้อยดี' : 'No pending actions. This project is clean.'} />;
  }
  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <div key={action.id} className={clsx('rounded-lg border p-3', ACTION_CLASSES[action.severity])}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{action.title}</p>
              <p className="mt-1 text-xs opacity-80">{action.message}</p>
            </div>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold">{action.type}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DocumentList({
  docs,
  isThai,
  token,
  formatDate,
  onOpen,
}: {
  docs: DocumentIntake[];
  isThai: boolean;
  token: string;
  formatDate: (value: string) => string;
  onOpen: (doc: DocumentIntake) => void | Promise<void>;
}) {
  if (docs.length === 0) {
    return <EmptyBlock text={isThai ? 'ยังไม่มีไฟล์ในโปรเจคนี้' : 'No files in this project yet'} />;
  }
  return (
    <div className="divide-y divide-slate-100">
      {docs.map((doc) => {
        return (
          <div key={doc.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <FilePreview doc={doc} token={token} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-950">{doc.fileName || (isThai ? 'ไฟล์ไม่มีชื่อ' : 'Untitled file')}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {doc.kind} · {doc.status} · {formatBytes(doc.fileSize)} · {formatDate(doc.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onOpen(doc)}
              disabled={!token}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
              aria-label={isThai ? 'เปิดไฟล์' : 'Open file'}
            >
              {doc.fileUrl?.startsWith('http') ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FilePreview({ doc, token }: { doc: DocumentIntake; token: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const Icon = doc.mimeType.includes('image') ? FileImage : FileText;

  useEffect(() => {
    let cancelled = false;
    let localUrl: string | null = null;

    async function loadPreview() {
      setFailed(false);
      if (doc.mimeType.includes('image') && doc.fileUrl?.startsWith('http')) {
        setBlobUrl(doc.fileUrl);
        return;
      }
      if (!token) return;
      try {
        const res = await fetch(`/api/purchase-invoices/document-intakes/${doc.id}/file`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('preview failed');
        const blob = await res.blob();
        if (cancelled) return;
        localUrl = URL.createObjectURL(blob);
        setBlobUrl(localUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [doc.fileUrl, doc.id, doc.mimeType, token]);

  if (failed || !blobUrl) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="h-5 w-5" />
      </div>
    );
  }

  if (doc.mimeType.includes('image')) {
    return (
      <img
        src={blobUrl}
        alt=""
        className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-slate-50 object-contain"
      />
    );
  }

  return (
    <iframe
      src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1`}
      title={doc.fileName || doc.id}
      scrolling="no"
      className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-slate-50"
    />
  );
}

function DataTable({
  rows,
  emptyText,
}: {
  rows: Array<{ id: string; title: string; subtitle: string; amount: string; meta: string; href: string }>;
  emptyText: string;
}) {
  if (rows.length === 0) return <EmptyBlock text={emptyText} />;
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row) => (
        <Link key={row.id} to={row.href} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-slate-50">
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-semibold text-slate-950">{row.title}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{row.subtitle}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-950">{row.amount}</p>
            <p className="text-xs text-slate-500">{row.meta}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </Link>
      ))}
    </div>
  );
}
