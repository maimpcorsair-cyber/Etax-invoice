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
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Inbox,
  Link2,
  Loader2,
  MessageCircle,
  Receipt,
  RefreshCw,
  Send,
  ShieldCheck,
  Upload,
  Users,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';

type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
type ProjectWorkspaceTab = 'overview' | 'action' | 'matching' | 'po' | 'files' | 'purchases' | 'sales' | 'expenses';
type TaxSafetyStatus = 'vat_claimable' | 'expense_only_no_vat' | 'needs_tax_invoice' | 'missing_required_fields' | 'unmatched_payment' | 'supporting_only' | 'needs_review';

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
  driveFolderId?: string | null;
  driveFolderUrl?: string | null;
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
  purchaseOrderCount?: number;
  purchaseOrderGapCount?: number;
  smartMatchCount?: number;
  taxSafetyRiskCount?: number;
  claimableVat?: number;
  taxSafetyByStatus?: Record<string, number>;
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
  driveFileId?: string | null;
  driveUrl?: string | null;
  driveFolderId?: string | null;
  driveFolderUrl?: string | null;
  driveSyncStatus?: 'not_synced' | 'syncing' | 'synced' | 'failed' | 'skipped' | string | null;
  driveSyncError?: string | null;
  driveSyncedAt?: string | null;
  driveUserDrive?: boolean | null;
  status: string;
  kind: string;
  targetType?: string | null;
  targetId?: string | null;
  purchaseInvoiceId?: string | null;
  taxSafety?: TaxSafety;
  ocrSummary?: {
    documentType?: string;
    documentTypeLabel?: string;
    supplierName?: string;
    supplierTaxId?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    total?: number | null;
    vatAmount?: number | null;
    confidence?: string;
    taxTreatment?: string;
    postingSuggestion?: string;
    reference?: string;
    payment?: {
      bankName?: string;
      fromName?: string;
      fromAccount?: string;
      toName?: string;
      toAccount?: string;
      direction?: string;
    } | null;
  } | null;
  commentCount?: number;
  comments?: DocumentComment[];
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DocumentComment {
  id: string;
  authorType: string;
  authorName?: string | null;
  kind: string;
  status: string;
  message: string;
  createdAt: string;
}

interface SmartMatchCandidate {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: number;
  isPaid: boolean;
  score: number;
  reasons: string[];
}

interface SmartMatchPoCandidate {
  id: string;
  poNumber: string;
  documentType: string;
  vendorName?: string | null;
  issueDate?: string | null;
  total?: number | null;
  status: string;
  score: number;
  reasons: string[];
}

interface SmartMatch {
  id: string;
  documentIntakeId: string;
  fileName?: string | null;
  status: string;
  documentRole?: 'payment_proof' | 'supporting_document' | 'tax_document';
  taxSafety: TaxSafety;
  amount?: number | null;
  supplierName?: string | null;
  referenceNumber?: string | null;
  documentDate: string;
  candidates: SmartMatchCandidate[];
  poCandidates?: SmartMatchPoCandidate[];
  threeWay?: {
    hasPo: boolean;
    hasTaxInvoice: boolean;
    hasPaymentProof: boolean;
  };
}

interface ProjectPurchaseOrder {
  id: string;
  poNumber: string;
  documentType: string;
  vendorName?: string | null;
  vendorTaxId?: string | null;
  issueDate?: string | null;
  expectedDate?: string | null;
  subtotal?: number | null;
  vatAmount?: number | null;
  total?: number | null;
  currency: string;
  status: string;
  source: string;
  documentIntakeId?: string | null;
  matchedPurchaseCount: number;
  matchedPaymentCount: number;
  purchaseMatches: Array<{ id: string; supplierName: string; invoiceNumber: string; total: number; isPaid: boolean }>;
  paymentMatches: Array<{ id: string; fileName?: string | null }>;
  missing: string[];
  threeWayStatus: 'complete' | 'incomplete';
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
  taxSafety?: TaxSafety;
  paidAt?: string | null;
  createdAt: string;
}

interface TaxSafety {
  status: TaxSafetyStatus;
  severity: 'ok' | 'info' | 'warning' | 'danger';
  label: string;
  message: string;
  missingFields: string[];
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
  smartMatches?: SmartMatch[];
  purchaseOrders?: ProjectPurchaseOrder[];
  documentIntakes: DocumentIntake[];
  purchaseInvoices: PurchaseInvoice[];
  invoices: SalesInvoice[];
  expenseVouchers: ExpenseVoucher[];
  lineGroups: LineGroup[];
  driveFolder?: { id: string; url: string } | null;
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

const TAX_SAFETY_CLASSES: Record<TaxSafetyStatus, string> = {
  vat_claimable: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  expense_only_no_vat: 'border-slate-200 bg-slate-50 text-slate-600',
  needs_tax_invoice: 'border-amber-200 bg-amber-50 text-amber-700',
  missing_required_fields: 'border-rose-200 bg-rose-50 text-rose-700',
  unmatched_payment: 'border-amber-200 bg-amber-50 text-amber-700',
  supporting_only: 'border-blue-200 bg-blue-50 text-blue-700',
  needs_review: 'border-rose-200 bg-rose-50 text-rose-700',
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
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [driveOpening, setDriveOpening] = useState(false);
  const [driveRetryingId, setDriveRetryingId] = useState<string | null>(null);
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [voucherCreatingId, setVoucherCreatingId] = useState<string | null>(null);
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
      { id: 'matching' as const, label: isThai ? 'จับคู่' : 'Matching', count: summary?.smartMatchCount ?? workspace?.smartMatches?.length ?? 0 },
      { id: 'po' as const, label: isThai ? 'PO' : 'PO', count: summary?.purchaseOrderCount ?? workspace?.purchaseOrders?.length ?? 0 },
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

  async function syncProjectSheet() {
    if (!token || !workspace) return;
    setSheetSyncing(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${workspace.project.id}/export/sheets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Google Sheets export failed');
      const url = json.data?.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sheets export failed');
    } finally {
      setSheetSyncing(false);
    }
  }

  async function openProjectDriveFolder() {
    if (!token || !workspace) return;
    setDriveOpening(true);
    setError('');
    try {
      const currentUrl = workspace.driveFolder?.url || workspace.project.driveFolderUrl;
      if (currentUrl) {
        window.open(currentUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      const res = await fetch(`/api/projects/${workspace.project.id}/drive/folder`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Google Drive folder failed');
      const url = json.data?.folderUrl;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      await fetchWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Drive folder failed');
    } finally {
      setDriveOpening(false);
    }
  }

  async function retryDriveSync(doc: DocumentIntake) {
    if (!token || !workspace) return;
    setDriveRetryingId(doc.id);
    setError('');
    try {
      const res = await fetch(`/api/projects/${workspace.project.id}/documents/${doc.id}/drive/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Drive sync failed');
      await fetchWorkspace();
      setActiveTab('files');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Drive sync failed');
    } finally {
      setDriveRetryingId(null);
    }
  }

  async function downloadAttachmentZip() {
    if (!token || !workspace) return;
    setZipDownloading(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${workspace.project.id}/export/zip`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'ZIP export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const safeCode = workspace.project.code.replace(/[^A-Z0-9-_]/gi, '_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-${safeCode}-attachments.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ZIP export failed');
    } finally {
      setZipDownloading(false);
    }
  }

  async function attachPurchaseToIntake(match: SmartMatch, candidate: SmartMatchCandidate) {
    if (!token) return;
    setMatchingId(`${match.documentIntakeId}:${candidate.id}`);
    setError('');
    try {
      const res = await fetch(`/api/purchase-invoices/document-intakes/${match.documentIntakeId}/attach-purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ purchaseInvoiceId: candidate.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to match document');
      await fetchWorkspace();
      setActiveTab('matching');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to match document');
    } finally {
      setMatchingId(null);
    }
  }

  async function requestDocumentComment(doc: DocumentIntake) {
    if (!token || !workspace) return;
    const message = window.prompt(isThai ? 'พิมพ์คำขอหรือคอมเมนต์สำหรับไฟล์นี้' : 'Write a request or comment for this file');
    if (!message?.trim()) return;

    setCommentingId(doc.id);
    setError('');
    try {
      const res = await fetch(`/api/projects/${workspace.project.id}/documents/${doc.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind: 'request', message: message.trim() }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to create document request');
      await fetchWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document request');
    } finally {
      setCommentingId(null);
    }
  }

  async function createExpenseVoucherFromDoc(doc: DocumentIntake) {
    if (!token) return;
    setVoucherCreatingId(doc.id);
    setError('');
    try {
      const res = await fetch(`/api/purchase-invoices/document-intakes/${doc.id}/create-expense-voucher`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to create expense voucher');
      await fetchWorkspace();
      setActiveTab('expenses');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create expense voucher');
    } finally {
      setVoucherCreatingId(null);
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
          <button
            type="button"
            onClick={() => void syncProjectSheet()}
            disabled={sheetSyncing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {sheetSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            {isThai ? 'Sync Sheet' : 'Sync Sheet'}
          </button>
          <button
            type="button"
            onClick={() => void openProjectDriveFolder()}
            disabled={driveOpening}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {driveOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
            {isThai ? 'Drive' : 'Drive'}
          </button>
          <button
            type="button"
            onClick={() => void downloadAttachmentZip()}
            disabled={zipDownloading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {zipDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
            ZIP
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
        <div className="grid gap-4 xl:grid-cols-4">
          <WorkspacePanel title={isThai ? 'งานที่ต้องตรวจ' : 'Needs attention'} icon={AlertTriangle}>
            <ActionList actions={workspace.actionNeeded.slice(0, 5)} isThai={isThai} />
          </WorkspacePanel>
          <WorkspacePanel title={isThai ? 'จับคู่เอกสาร' : 'Smart matching'} icon={Link2}>
            <SmartMatchList
              matches={(workspace.smartMatches ?? []).slice(0, 3)}
              isThai={isThai}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              onAttach={attachPurchaseToIntake}
              matchingId={matchingId}
            />
          </WorkspacePanel>
          <WorkspacePanel title={isThai ? 'Tax Safety' : 'Tax safety'} icon={ShieldCheck}>
            <TaxSafetyPanel summary={workspaceSummary} isThai={isThai} formatCurrency={formatCurrency} />
          </WorkspacePanel>
          <WorkspacePanel title={isThai ? 'PO / 3-way' : 'PO / 3-way'} icon={FileText}>
            <PurchaseOrderList
              purchaseOrders={(workspace.purchaseOrders ?? []).slice(0, 4)}
              isThai={isThai}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
            />
          </WorkspacePanel>
          <WorkspacePanel title={isThai ? 'ไฟล์ล่าสุด' : 'Latest files'} icon={FolderOpen}>
            <DocumentList docs={workspace.documentIntakes.slice(0, 5)} token={token ?? ''} isThai={isThai} formatDate={formatDate} formatCurrency={formatCurrency} onOpen={openDocument} onComment={requestDocumentComment} onCreateVoucher={createExpenseVoucherFromDoc} onDriveRetry={retryDriveSync} commentingId={commentingId} voucherCreatingId={voucherCreatingId} driveRetryingId={driveRetryingId} />
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

      {activeTab === 'matching' && (
        <WorkspacePanel title={isThai ? 'Smart Matching / จับคู่สลิปกับเอกสารซื้อ' : 'Smart matching / match slips to purchases'} icon={Link2}>
          <SmartMatchList
            matches={workspace.smartMatches ?? []}
            isThai={isThai}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            onAttach={attachPurchaseToIntake}
            matchingId={matchingId}
          />
        </WorkspacePanel>
      )}

      {activeTab === 'po' && (
        <WorkspacePanel title={isThai ? 'PO model / จับคู่ 3 ทาง' : 'PO model / 3-way matching'} icon={FileText}>
          <PurchaseOrderList
            purchaseOrders={workspace.purchaseOrders ?? []}
            isThai={isThai}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        </WorkspacePanel>
      )}

      {activeTab === 'files' && (
        <WorkspacePanel title={isThai ? 'ไฟล์ทั้งหมดของโปรเจค' : 'Project file library'} icon={FolderOpen}>
          <DocumentList docs={workspace.documentIntakes} token={token ?? ''} isThai={isThai} formatDate={formatDate} formatCurrency={formatCurrency} onOpen={openDocument} onComment={requestDocumentComment} onCreateVoucher={createExpenseVoucherFromDoc} onDriveRetry={retryDriveSync} commentingId={commentingId} voucherCreatingId={voucherCreatingId} driveRetryingId={driveRetryingId} />
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
              taxSafety: item.taxSafety,
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

function SmartMatchList({
  matches,
  isThai,
  formatCurrency,
  formatDate,
  onAttach,
  matchingId,
}: {
  matches: SmartMatch[];
  isThai: boolean;
  formatCurrency: (value: number) => string;
  formatDate: (value: string) => string;
  onAttach: (match: SmartMatch, candidate: SmartMatchCandidate) => void | Promise<void>;
  matchingId: string | null;
}) {
  if (matches.length === 0) {
    return <EmptyBlock text={isThai ? 'ไม่มีสลิปหรือเอกสารที่ต้องจับคู่ตอนนี้' : 'No unmatched slips or supporting documents right now'} />;
  }
  return (
    <div className="space-y-3">
      {matches.map((match) => (
        <div key={match.id} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">{match.fileName || (isThai ? 'ไฟล์ไม่มีชื่อ' : 'Untitled file')}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {match.documentRole === 'payment_proof'
                  ? (isThai ? 'สลิป/หลักฐานจ่าย' : 'Payment proof')
                  : match.documentRole === 'supporting_document'
                    ? (isThai ? 'PO/ใบเสนอราคา/เอกสารแนบ' : 'PO/quotation/supporting')
                    : (isThai ? 'เอกสารภาษี' : 'Tax document')}
                {' · '}
                {formatDate(match.documentDate)} · {match.amount ? formatCurrency(match.amount) : (isThai ? 'ไม่พบยอด' : 'No amount')} · {match.supplierName || (isThai ? 'ไม่พบคู่ค้า' : 'No vendor')}
                {match.referenceNumber ? ` · Ref ${match.referenceNumber}` : ''}
              </p>
            </div>
            <TaxSafetyBadge taxSafety={match.taxSafety} />
          </div>
          <div className="mt-3 space-y-2">
            {match.poCandidates && match.poCandidates.length > 0 && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px] font-semibold text-blue-800">
                  <span>{isThai ? 'PO ที่เกี่ยวข้อง' : 'Related PO'}</span>
                  {match.threeWay && (
                    <span className="rounded-full bg-white/80 px-2 py-0.5">
                      {[
                        match.threeWay.hasPo ? 'PO' : null,
                        match.threeWay.hasTaxInvoice ? (isThai ? 'ใบซื้อ' : 'tax invoice') : null,
                        match.threeWay.hasPaymentProof ? (isThai ? 'สลิป' : 'payment') : null,
                      ].filter(Boolean).join(' + ')}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {match.poCandidates.map((po) => (
                    <div key={po.id} className="flex items-center justify-between gap-2 text-xs text-blue-900">
                      <span className="min-w-0 truncate">{po.poNumber} · {po.vendorName || (isThai ? 'ไม่พบคู่ค้า' : 'No vendor')}</span>
                      <span className="shrink-0 font-semibold">{po.total ? formatCurrency(po.total) : (isThai ? 'ไม่พบยอด' : 'No amount')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {match.candidates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {isThai ? 'ยังไม่เจอใบซื้อที่น่าจะตรงกัน ให้เปิด Input VAT เพื่อเลือกจับคู่เอง' : 'No likely purchase match yet. Open Input VAT to attach manually.'}
              </div>
            ) : (
              match.candidates.map((candidate) => {
                const actionId = `${match.documentIntakeId}:${candidate.id}`;
                return (
                  <div key={candidate.id} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">{candidate.supplierName} · {candidate.invoiceNumber}</p>
                      <p className="text-[11px] text-slate-500">
                        {formatDate(candidate.invoiceDate)} · {formatCurrency(candidate.total)} · {isThai ? 'คะแนน' : 'score'} {candidate.score} · {candidate.reasons.join(', ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onAttach(match, candidate)}
                      disabled={matchingId === actionId}
                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                    >
                      {matchingId === actionId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      {isThai ? 'จับคู่' : 'Match'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaxSafetyPanel({
  summary,
  isThai,
  formatCurrency,
}: {
  summary: WorkspaceSummary;
  isThai: boolean;
  formatCurrency: (value: number) => string;
}) {
  const riskCount = summary.taxSafetyRiskCount ?? 0;
  const claimableVat = summary.claimableVat ?? 0;
  const byStatus = summary.taxSafetyByStatus ?? {};
  const rows = [
    { status: 'vat_claimable' as const, label: isThai ? 'พร้อมเคลม VAT' : 'VAT claim ready', count: byStatus.vat_claimable ?? 0 },
    { status: 'missing_required_fields' as const, label: isThai ? 'ข้อมูลภาษีไม่ครบ' : 'Missing tax fields', count: byStatus.missing_required_fields ?? 0 },
    { status: 'unmatched_payment' as const, label: isThai ? 'สลิปยังไม่จับคู่' : 'Unmatched payments', count: byStatus.unmatched_payment ?? 0 },
    { status: 'supporting_only' as const, label: isThai ? 'เอกสารประกอบ' : 'Supporting only', count: byStatus.supporting_only ?? 0 },
  ];
  return (
    <div className="space-y-3">
      <div className={clsx('rounded-lg border p-3', riskCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50')}>
        <p className="text-xs font-semibold text-slate-600">{isThai ? 'Input VAT ที่พร้อมตรวจ' : 'Claimable input VAT'}</p>
        <p className={clsx('mt-1 text-lg font-bold', riskCount > 0 ? 'text-amber-700' : 'text-emerald-700')}>{formatCurrency(claimableVat)}</p>
        <p className="mt-1 text-xs text-slate-600">
          {riskCount > 0
            ? (isThai ? `มี ${riskCount} รายการที่ควรตรวจภาษีก่อนปิดงาน` : `${riskCount} items need tax review before close-out`)
            : (isThai ? 'ยังไม่เจอความเสี่ยงภาษีในโปรเจคนี้' : 'No tax safety risk detected for this project')}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {rows.map((row) => (
          <div key={row.status} className={clsx('rounded-lg border px-2 py-2', TAX_SAFETY_CLASSES[row.status])}>
            <p className="text-[11px] font-semibold">{row.label}</p>
            <p className="text-base font-bold">{row.count}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaxSafetyBadge({ taxSafety }: { taxSafety?: TaxSafety }) {
  if (!taxSafety) return null;
  return (
    <span
      className={clsx('inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', TAX_SAFETY_CLASSES[taxSafety.status])}
      title={taxSafety.message}
    >
      <ShieldCheck className="h-3 w-3" />
      {taxSafety.label}
    </span>
  );
}

function PurchaseOrderList({
  purchaseOrders,
  isThai,
  formatCurrency,
  formatDate,
}: {
  purchaseOrders: ProjectPurchaseOrder[];
  isThai: boolean;
  formatCurrency: (value: number) => string;
  formatDate: (value: string) => string;
}) {
  if (purchaseOrders.length === 0) {
    return <EmptyBlock text={isThai ? 'ยังไม่พบ PO/ใบเสนอราคา/ใบส่งของในโปรเจคนี้' : 'No PO, quotation, or delivery document found in this project yet'} />;
  }
  return (
    <div className="divide-y divide-slate-100">
      {purchaseOrders.map((po) => {
        const complete = po.threeWayStatus === 'complete';
        return (
          <div key={po.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-bold text-slate-950">{po.poNumber}</p>
                  <span className={clsx(
                    'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                    complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700',
                  )}>
                    {complete ? (isThai ? 'ครบ 3-way' : '3-way complete') : (isThai ? 'ยังขาดเอกสาร' : 'Missing docs')}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {po.documentType} · {po.vendorName || (isThai ? 'ไม่พบคู่ค้า' : 'No vendor')} · {po.issueDate ? formatDate(po.issueDate) : (isThai ? 'ไม่พบวันที่' : 'No date')}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-sm font-bold text-slate-950">{po.total ? formatCurrency(po.total) : '-'}</p>
                <p className="text-xs text-slate-500">{po.currency}</p>
              </div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <ThreeWayChip label="PO" ok />
              <ThreeWayChip label={isThai ? 'ใบซื้อ/ภาษี' : 'Tax invoice'} ok={po.matchedPurchaseCount > 0} count={po.matchedPurchaseCount} />
              <ThreeWayChip label={isThai ? 'สลิปจ่าย' : 'Payment'} ok={po.matchedPaymentCount > 0} count={po.matchedPaymentCount} />
            </div>
            {po.missing.length > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                {isThai ? 'ควรตามเพิ่ม: ' : 'Request next: '}
                {po.missing.map((item) => item === 'tax_invoice' ? (isThai ? 'ใบกำกับ/ใบซื้อ' : 'tax invoice') : (isThai ? 'สลิป/หลักฐานจ่าย' : 'payment proof')).join(', ')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ThreeWayChip({ label, ok, count }: { label: string; ok: boolean; count?: number }) {
  return (
    <div className={clsx(
      'flex items-center justify-between rounded-lg border px-2 py-1.5 text-xs font-semibold',
      ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500',
    )}>
      <span>{label}</span>
      <span>{ok ? (count ?? 1) : 0}</span>
    </div>
  );
}

function DocumentOcrSummaryLine({
  doc,
  isThai,
  formatCurrency,
  formatDate,
}: {
  doc: DocumentIntake;
  isThai: boolean;
  formatCurrency: (value: number) => string;
  formatDate: (value: string) => string;
}) {
  const summary = doc.ocrSummary;
  if (!summary) {
    return (
      <p className="mt-1 text-xs text-slate-400">
        {doc.status === 'processing'
          ? (isThai ? 'กำลังอ่านเอกสาร' : 'Reading document')
          : (isThai ? 'ยังไม่มีผล OCR' : 'No OCR result yet')}
      </p>
    );
  }

  const partyLine = summary.payment?.fromName || summary.payment?.toName
    ? `${isThai ? 'จาก' : 'From'}: ${summary.payment?.fromName || '-'} · ${isThai ? 'ถึง' : 'To'}: ${summary.payment?.toName || '-'}`
    : summary.supplierName
      ? `${isThai ? 'คู่ค้า' : 'Party'}: ${summary.supplierName}`
      : '';
  const moneyLine = summary.total ? formatCurrency(summary.total) : '';
  const dateLine = summary.invoiceDate ? formatDate(summary.invoiceDate) : '';
  const refLine = summary.reference || summary.invoiceNumber || '';
  const typeLine = summary.documentTypeLabel || summary.documentType || doc.kind;

  return (
    <div className="mt-1 space-y-1 text-xs text-slate-500">
      <p className="truncate">
        <span className="font-semibold text-slate-700">{typeLine}</span>
        {moneyLine ? ` · ${moneyLine}` : ''}
        {dateLine ? ` · ${dateLine}` : ''}
        {summary.confidence ? ` · ${summary.confidence}` : ''}
      </p>
      {partyLine ? <p className="truncate">{partyLine}</p> : null}
      <div className="flex flex-wrap gap-1">
        {refLine ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">ref: {refLine}</span> : null}
        {summary.postingSuggestion ? <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">{summary.postingSuggestion}</span> : null}
        {summary.taxTreatment ? <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">{summary.taxTreatment}</span> : null}
      </div>
    </div>
  );
}

function DocumentList({
  docs,
  isThai,
  token,
  formatDate,
  formatCurrency,
  onOpen,
  onComment,
  onCreateVoucher,
  onDriveRetry,
  commentingId,
  voucherCreatingId,
  driveRetryingId,
}: {
  docs: DocumentIntake[];
  isThai: boolean;
  token: string;
  formatDate: (value: string) => string;
  formatCurrency: (value: number) => string;
  onOpen: (doc: DocumentIntake) => void | Promise<void>;
  onComment: (doc: DocumentIntake) => void | Promise<void>;
  onCreateVoucher: (doc: DocumentIntake) => void | Promise<void>;
  onDriveRetry: (doc: DocumentIntake) => void | Promise<void>;
  commentingId?: string | null;
  voucherCreatingId?: string | null;
  driveRetryingId?: string | null;
}) {
  if (docs.length === 0) {
    return <EmptyBlock text={isThai ? 'ยังไม่มีไฟล์ในโปรเจคนี้' : 'No files in this project yet'} />;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {docs.map((doc) => {
        const canCreateVoucher = !doc.targetId
          && doc.status !== 'failed'
          && (
            doc.taxSafety?.status === 'expense_only_no_vat'
            || doc.ocrSummary?.documentType === 'expense_receipt'
            || doc.ocrSummary?.taxTreatment === 'vat_exempt'
            || doc.ocrSummary?.taxTreatment === 'non_deductible'
          );
        const driveStatus = doc.driveSyncStatus ?? 'not_synced';
        const driveOk = driveStatus === 'synced' && !!doc.driveUrl;
        const driveBusy = driveStatus === 'syncing' || driveRetryingId === doc.id;
        return (
          <div key={doc.id} className="group flex min-h-[360px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-primary-200 hover:shadow-md">
            <button
              type="button"
              onClick={() => void onOpen(doc)}
              disabled={!token}
              className="relative flex h-40 items-center justify-center border-b border-slate-100 bg-slate-50"
              aria-label={isThai ? 'เปิดไฟล์' : 'Open file'}
            >
              <FilePreview doc={doc} token={token} variant="card" />
              <span className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
                {doc.mimeType.includes('pdf') ? 'PDF' : doc.mimeType.includes('image') ? 'IMG' : 'FILE'}
              </span>
            </button>
            <div className="flex flex-1 flex-col p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950" title={doc.fileName || undefined}>{doc.fileName || (isThai ? 'ไฟล์ไม่มีชื่อ' : 'Untitled file')}</p>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {doc.kind} · {doc.status} · {formatBytes(doc.fileSize)}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={clsx(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                  driveOk ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : driveStatus === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : driveStatus === 'skipped' ? 'border-slate-200 bg-slate-50 text-slate-500'
                        : 'border-amber-200 bg-amber-50 text-amber-700',
                )}>
                  {driveBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderOpen className="h-3 w-3" />}
                  {driveOk ? (isThai ? 'อยู่ใน Drive' : 'In Drive')
                    : driveStatus === 'failed' ? (isThai ? 'Drive ล้มเหลว' : 'Drive failed')
                      : driveStatus === 'skipped' ? (isThai ? 'ยังไม่ตั้ง Drive' : 'Drive skipped')
                        : driveStatus === 'syncing' ? (isThai ? 'กำลัง sync' : 'Syncing')
                          : (isThai ? 'รอ Drive' : 'Drive pending')}
                </span>
                <TaxSafetyBadge taxSafety={doc.taxSafety} />
              </div>
              <div className="mt-2 min-h-[48px]">
                <DocumentOcrSummaryLine doc={doc} isThai={isThai} formatCurrency={formatCurrency} formatDate={formatDate} />
              </div>
              {doc.comments && doc.comments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {doc.comments.slice(-2).map((comment) => (
                    <div key={comment.id} className="rounded-md border border-amber-100 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                      <span className="font-semibold">
                        {comment.kind === 'request' ? (isThai ? 'ขอเพิ่ม' : 'Request') : comment.authorType === 'guest' ? 'Guest' : (isThai ? 'คอมเมนต์' : 'Comment')}
                      </span>
                      {' · '}
                      {comment.message}
                    </div>
                  ))}
                </div>
              )}
              {doc.driveSyncError && (
                <p className="mt-2 line-clamp-2 text-xs text-rose-600" title={doc.driveSyncError}>{doc.driveSyncError}</p>
              )}
              <p className="mt-auto pt-3 text-xs text-slate-400">{formatDate(doc.createdAt)}</p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => void onOpen(doc)}
                  disabled={!token}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  aria-label={isThai ? 'เปิดไฟล์' : 'Open file'}
                  title={isThai ? 'เปิดไฟล์' : 'Open file'}
                >
                  {doc.fileUrl?.startsWith('http') ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => driveOk ? window.open(doc.driveUrl!, '_blank', 'noopener,noreferrer') : void onDriveRetry(doc)}
                  disabled={!token || driveBusy}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  aria-label={driveOk ? (isThai ? 'เปิดใน Google Drive' : 'Open in Google Drive') : (isThai ? 'Sync Drive ใหม่' : 'Retry Drive sync')}
                  title={driveOk ? (isThai ? 'เปิดใน Google Drive' : 'Open in Google Drive') : (isThai ? 'Sync Drive ใหม่' : 'Retry Drive sync')}
                >
                  {driveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => void onComment(doc)}
                  disabled={!token || commentingId === doc.id}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                  aria-label={isThai ? 'ขอเอกสารเพิ่ม' : 'Request more info'}
                  title={isThai ? 'ขอเอกสาร/คอมเมนต์' : 'Request/comment'}
                >
                  {commentingId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => void onCreateVoucher(doc)}
                  disabled={!canCreateVoucher || !token || voucherCreatingId === doc.id}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-30"
                  aria-label={isThai ? 'สร้างใบเบิกจากไฟล์นี้' : 'Create expense voucher'}
                  title={isThai ? 'สร้างใบเบิก/Payment Voucher' : 'Create expense voucher'}
                >
                  {voucherCreatingId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FilePreview({ doc, token, variant = 'thumb' }: { doc: DocumentIntake; token: string; variant?: 'thumb' | 'card' }) {
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
      <div className={clsx('flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600', variant === 'card' ? 'h-full w-full' : 'h-14 w-14')}>
        <Icon className={variant === 'card' ? 'h-12 w-12' : 'h-5 w-5'} />
      </div>
    );
  }

  if (doc.mimeType.includes('image')) {
    return (
      <img
        src={blobUrl}
        alt=""
        className={clsx('shrink-0 bg-slate-50 object-contain', variant === 'card' ? 'h-full w-full' : 'h-14 w-14 rounded-lg border border-slate-200')}
      />
    );
  }

  return (
    <iframe
      src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1`}
      title={doc.fileName || doc.id}
      scrolling="no"
      className={clsx('shrink-0 bg-slate-50', variant === 'card' ? 'h-full w-full' : 'h-14 w-14 rounded-lg border border-slate-200')}
    />
  );
}

function DataTable({
  rows,
  emptyText,
}: {
  rows: Array<{ id: string; title: string; subtitle: string; amount: string; meta: string; href: string; taxSafety?: TaxSafety }>;
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
            <div className="mt-1">
              <TaxSafetyBadge taxSafety={row.taxSafety} />
            </div>
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
