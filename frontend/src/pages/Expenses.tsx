import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Edit2, X, Save, Loader2, Wallet,
  AlertTriangle, Send, ThumbsUp, ThumbsDown,
  Link as LinkIcon, Image as ImageIcon, FileText, PlusCircle,
  Eye, CheckCircle2, XCircle, Clock, ArrowRight,
  Upload, Sheet, HardDrive,
  BriefcaseBusiness,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DeleteButton from '../components/ui/DeleteButton';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import { useDriveStatus } from '../hooks/useDriveStatus';
import type { ExpenseVoucher, ExpenseVoucherStatus, AttachmentFileType, EvidenceType, PettyCash, ApprovalLog } from '../types';
import { EmptyState } from '../components/ui/AppChrome';
import SectionSubNav from '../components/SectionSubNav';
import { ShoppingCart } from 'lucide-react';
import { ConfirmDialog, ToastStack, type ConfirmDialogState, type FeedbackToast } from '../components/ui/AppFeedback';

const CATEGORY_KEYS = [
  'transportation', 'office_supplies', 'meals', 'postage',
  'printing', 'utilities', 'maintenance', 'other',
] as const;

const WHT_RATES = [1, 3, 5] as const;

interface AttachmentForm {
  fileName: string;
  fileType: AttachmentFileType;
  url: string;
  evidenceType: EvidenceType;
}

interface ItemForm {
  description: string;
  category: string;
  amount: string;
  date: string;
  notes: string;
  vendorName: string;
  vendorTaxId: string;
  whtApplicable: boolean;
  whtRate: string;
  attachments: AttachmentForm[];
}

interface ProjectOption {
  id: string;
  code: string;
  name: string;
  status: string;
}

const todayIso = () => new Date().toISOString().split('T')[0];

function startOfMonthIso() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
}

const emptyItem = (): ItemForm => ({
  description: '',
  category: '',
  amount: '',
  date: todayIso(),
  notes: '',
  vendorName: '',
  vendorTaxId: '',
  whtApplicable: false,
  whtRate: '3',
  attachments: [],
});

export default function Expenses() {
  const { t } = useTranslation();
  const { isThai, formatCurrency, formatDate } = useLanguage();
  const { token, user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const { policy } = useCompanyAccessPolicy();
  const { status: driveStatus, connecting: driveConnecting, error: driveError, connect: connectDrive, disconnect: disconnectDrive } = useDriveStatus();

  const [vouchers, setVouchers] = useState<ExpenseVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(startOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState<ExpenseVoucherStatus | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState(searchParams.get('projectId') ?? '');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [expenseLimit, setExpenseLimit] = useState<number | null>(null);
  const [pettyCash, setPettyCash] = useState<PettyCash | null>(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ExpenseVoucher | null>(null);
  const [voucherDate, setVoucherDate] = useState(todayIso());
  const [voucherProjectId, setVoucherProjectId] = useState(searchParams.get('projectId') ?? '');
  const [voucherDesc, setVoucherDesc] = useState('');
  const [voucherNotes, setVoucherNotes] = useState('');
  const [items, setItems] = useState<ItemForm[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState('');
  const [rejectionNote, setRejectionNote] = useState('');

  const [detailVoucher, setDetailVoucher] = useState<ExpenseVoucher | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [driveUploading, setDriveUploading] = useState(false);
  const [sheetsExporting, setSheetsExporting] = useState(false);
  const [toasts, setToasts] = useState<FeedbackToast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const isFreePlan = policy?.plan === 'free';
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const showToast = useCallback((toast: Omit<FeedbackToast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, toast.tone === 'error' ? 7000 : 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('dateFrom', from);
      if (to) params.set('dateTo', to);
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (projectFilter) params.set('projectId', projectFilter);

      const [vRes, sRes, pcRes, projectsRes] = await Promise.all([
        fetch(`/api/expenses?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/expenses/settings', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/expenses/petty-cash', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/projects?status=all', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const vJson = await vRes.json();
      const sJson = await sRes.json();
      const pcJson = await pcRes.json();
      const projectsJson = await projectsRes.json().catch(() => ({ data: [] }));
      setVouchers(vJson.data ?? []);
      setExpenseLimit(sJson.data?.expenseLimit ?? null);
      setPettyCash(pcJson.data ?? null);
      setProjects(projectsJson.data ?? []);
    } catch {
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, search, statusFilter, projectFilter, token]);

  useEffect(() => {
    const timer = setTimeout(fetchVouchers, 300);
    return () => clearTimeout(timer);
  }, [fetchVouchers]);

  const totalAmount = vouchers.reduce((s, v) => s + Number(v.totalAmount), 0);
  const draftCount = vouchers.filter((v) => v.status === 'draft').length;
  const submittedCount = vouchers.filter((v) => v.status === 'submitted').length;
  const approvedCount = vouchers.filter((v) => v.status === 'approved').length;
  const rejectedCount = vouchers.filter((v) => v.status === 'rejected').length;
  const pendingAmount = vouchers
    .filter((v) => v.status === 'draft' || v.status === 'submitted')
    .reduce((s, v) => s + Number(v.totalAmount), 0);
  const approvedAmount = vouchers
    .filter((v) => v.status === 'approved')
    .reduce((s, v) => s + Number(v.totalAmount), 0);
  const pettyCashBalance = pettyCash?.balance ?? 0;
  const workItems = [
    {
      label: t('expenses.status.draft'),
      value: draftCount,
      detail: isThai ? 'ยังไม่ส่งอนุมัติ' : 'Not submitted',
      icon: Clock,
      tone: draftCount > 0 ? 'idle' : 'clear',
    },
    {
      label: t('expenses.status.submitted'),
      value: submittedCount,
      detail: isThai ? 'รอผู้อนุมัติ' : 'Awaiting approval',
      icon: Send,
      tone: submittedCount > 0 ? 'needs' : 'clear',
    },
    {
      label: t('expenses.status.approved'),
      value: approvedCount,
      detail: formatCurrency(approvedAmount),
      icon: ThumbsUp,
      tone: approvedCount > 0 ? 'clear' : 'idle',
    },
    {
      label: t('expenses.status.rejected'),
      value: rejectedCount,
      detail: isThai ? 'ต้องแก้ไข' : 'Needs correction',
      icon: ThumbsDown,
      tone: rejectedCount > 0 ? 'overdue' : 'clear',
    },
  ];
  const statusDotClass = (tone: string) => {
    if (tone === 'overdue') return 'bg-rose-500';
    if (tone === 'needs') return 'bg-amber-500';
    if (tone === 'clear') return 'bg-emerald-500';
    return 'bg-slate-300';
  };

  function statusBadgeClass(status: ExpenseVoucherStatus) {
    if (status === 'draft') return 'badge-info';
    if (status === 'submitted') return 'badge-warning';
    if (status === 'approved') return 'badge-success';
    return 'badge-danger';
  }

  function canApproveVoucher(v: ExpenseVoucher | null) {
    return Boolean(v && v.status === 'submitted' && (isAdmin || v.canApprove));
  }

  function openCreate() {
    if (isFreePlan) {
      setError(t('expenses.limitExceeded', { limit: 0 }));
      return;
    }
    setEditing(null);
    setVoucherDate(todayIso());
    setVoucherProjectId(projectFilter);
    setVoucherDesc('');
    setVoucherNotes('');
    setItems([emptyItem()]);
    setError('');
    setShowModal(true);
  }

  async function openEdit(v: ExpenseVoucher) {
    if (v.status !== 'draft') {
      setError(t('expenses.onlyDraftEdit'));
      return;
    }
    try {
      const res = await fetch(`/api/expenses/${v.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      const full = json.data as ExpenseVoucher;
      setEditing(full);
      setVoucherDate(full.voucherDate.split('T')[0]);
      setVoucherProjectId(full.projectId ?? '');
      setVoucherDesc(full.description ?? '');
      setVoucherNotes(full.notes ?? '');
      setItems(
        (full.items ?? []).map((item) => ({
          description: item.description,
          category: item.category ?? '',
          amount: String(item.amount),
          date: item.date.split('T')[0],
          notes: item.notes ?? '',
          vendorName: item.vendorName ?? '',
          vendorTaxId: item.vendorTaxId ?? '',
          whtApplicable: item.whtApplicable ?? false,
          whtRate: item.whtRate != null ? String(item.whtRate) : '3',
          attachments: [],
        })),
      );
      setError('');
      setShowModal(true);
    } catch {
      setError('Failed to load voucher');
    }
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  }

  function updateItem(index: number, field: keyof ItemForm, value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentFileName, setAttachmentFileName] = useState('');
  const [attachmentFileType, setAttachmentFileType] = useState<AttachmentFileType>('image');
  const [attachmentEvidenceType, setAttachmentEvidenceType] = useState<EvidenceType>('receipt');
  const [addingAttachmentForItem, setAddingAttachmentForItem] = useState<number | null>(null);

  function openAddAttachment(idx: number) {
    setAddingAttachmentForItem(idx);
    setAttachmentUrl('');
    setAttachmentFileName('');
    setAttachmentFileType('image');
    setAttachmentEvidenceType('receipt');
  }

  function confirmAddAttachment() {
    if (!attachmentUrl.trim() || addingAttachmentForItem === null) return;
    setItems((prev) =>
      prev.map((item, i) =>
        i === addingAttachmentForItem
          ? {
              ...item,
              attachments: [
                ...item.attachments,
                { fileName: attachmentFileName.trim() || undefined as unknown as string, fileType: attachmentFileType, url: attachmentUrl.trim(), evidenceType: attachmentEvidenceType },
              ],
            }
          : item,
      ),
    );
    setAddingAttachmentForItem(null);
  }

  function removeAttachment(itemIndex: number, attIndex: number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === itemIndex ? { ...item, attachments: item.attachments.filter((_, j) => j !== attIndex) } : item,
      ),
    );
  }

  const computedTotal = items.reduce((s, item) => {
    const amt = parseFloat(item.amount);
    return s + (isNaN(amt) ? 0 : amt);
  }, 0);

  async function handleSave() {
    for (const item of items) {
      if (!item.description.trim()) {
        setError(t('errors.required'));
        return;
      }
      const amt = parseFloat(item.amount);
      if (isNaN(amt) || amt <= 0) {
        setError(t('errors.required'));
        return;
      }
      if (expenseLimit !== null && amt > expenseLimit) {
        setError(t('expenses.limitExceeded', { limit: expenseLimit }));
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        projectId: voucherProjectId || null,
        voucherDate,
        description: voucherDesc.trim() || undefined,
        notes: voucherNotes.trim() || undefined,
        items: items.map((item) => {
          const amt = parseFloat(item.amount);
          const whtRate = item.whtApplicable ? parseFloat(item.whtRate) : undefined;
          return {
            description: item.description.trim(),
            category: item.category || undefined,
            amount: amt,
            date: item.date,
            notes: item.notes.trim() || undefined,
            vendorName: item.vendorName.trim() || undefined,
            vendorTaxId: item.vendorTaxId.trim() || undefined,
            whtApplicable: item.whtApplicable,
            whtRate: item.whtApplicable && whtRate ? whtRate : undefined,
            attachments: item.attachments.length > 0 ? item.attachments : undefined,
          };
        }),
      };
      const url = editing ? `/api/expenses/${editing.id}` : '/api/expenses';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Save failed');
      }
      setShowModal(false);
      fetchVouchers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDialog({
      tone: 'error',
      title: isThai ? 'ลบใบเบิก/ค่าใช้จ่ายนี้?' : 'Delete this expense voucher?',
      description: isThai ? 'รายการนี้จะถูกเอาออกจากรายงานค่าใช้จ่ายและหลักฐานที่แนบไว้' : 'This removes the voucher from expense reporting and its attached evidence list.',
      confirmLabel: isThai ? 'ลบรายการ' : 'Delete',
      cancelLabel: t('common.cancel'),
      onCancel: () => setConfirmDialog(null),
      onConfirm: () => {
        setConfirmDialog(null);
        void deleteConfirmed(id);
      },
    });
  }

  async function deleteConfirmed(id: string) {
    await fetch(`/api/expenses/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    showToast({ tone: 'success', title: isThai ? 'ลบรายการแล้ว' : 'Expense voucher deleted' });
    fetchVouchers();
  }

  async function handleSubmit(id: string) {
    setError('');
    try {
      const res = await fetch(`/api/expenses/${id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Submit failed');
      }
      fetchVouchers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  async function handleApprove(id: string, forceOverBudget = false) {
    setError('');
    try {
      const res = await fetch(`/api/expenses/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ forceOverBudget }),
      });
      if (!res.ok) {
        const json = await res.json();
        if (res.status === 409 && json.code === 'PROJECT_OVER_BUDGET' && json.budgetGuard && !forceOverBudget) {
          const guard = json.budgetGuard as NonNullable<ExpenseVoucher['budgetGuard']>;
          setConfirmDialog({
            tone: 'warning',
            title: isThai ? `โปรเจค ${guard.project.code} เกินงบ` : `Project ${guard.project.code} is over budget`,
            description: isThai
              ? `หลังอนุมัติจะเกินงบ ${formatCurrency(guard.overBudgetAmount)}`
              : `Approving this voucher will exceed budget by ${formatCurrency(guard.overBudgetAmount)}.`,
            detail: (
              <div className="space-y-1">
                <div className="flex justify-between gap-3"><span>{isThai ? 'งบ' : 'Budget'}</span><strong>{formatCurrency(guard.budgetAmount)}</strong></div>
                <div className="flex justify-between gap-3"><span>{isThai ? 'ต้นทุนผูกพัน' : 'Committed'}</span><strong>{formatCurrency(guard.committedAmount)}</strong></div>
              </div>
            ),
            confirmLabel: isThai ? 'อนุมัติต่อ' : 'Approve anyway',
            cancelLabel: t('common.cancel'),
            onCancel: () => setConfirmDialog(null),
            onConfirm: () => {
              setConfirmDialog(null);
              void handleApprove(id, true);
            },
          });
          return;
        }
        throw new Error(json.error ?? 'Approve failed');
      }
      fetchVouchers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  function openReject(id: string) {
    setRejectTargetId(id);
    setRejectionNote('');
    setShowRejectModal(true);
  }

  async function handleTopUp() {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0) return;
    try {
      const res = await fetch('/api/expenses/petty-cash/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Top up failed');
      setShowTopUpModal(false);
      setTopUpAmount('');
      fetchVouchers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  async function uploadFileToDrive(file: File) {
    setDriveUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/expenses/drive/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      // Auto-fill the attachment URL field with the Drive URL
      setAttachmentUrl(json.data.url);
      setAttachmentFileName(json.data.fileName ?? file.name);
      setAttachmentFileType(file.type.startsWith('image/') ? 'image' : 'pdf');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Drive upload failed');
    } finally {
      setDriveUploading(false);
    }
  }

  async function handleSheetsExport() {
    setSheetsExporting(true);
    setError('');
    try {
      const res = await fetch('/api/expenses/export/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dateFrom: from, dateTo: to, status: statusFilter !== 'all' ? statusFilter : undefined, projectId: projectFilter || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Export failed');
      window.open(json.data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sheets export failed');
    } finally {
      setSheetsExporting(false);
    }
  }

  async function openDetail(v: ExpenseVoucher) {
    setDetailLoading(true);
    setDetailVoucher(v);
    try {
      const res = await fetch(`/api/expenses/${v.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setDetailVoucher(json.data as ExpenseVoucher);
    } catch {
      // keep showing partial data
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleReject() {
    if (!rejectionNote.trim()) return;
    setError('');
    try {
      const res = await fetch(`/api/expenses/${rejectTargetId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rejectionNote: rejectionNote.trim() }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Reject failed');
      }
      setShowRejectModal(false);
      fetchVouchers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog dialog={confirmDialog} />
      <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <SectionSubNav
        items={[
          { key: 'bills', to: '/app/purchase-invoices', label: isThai ? 'บันทึกซื้อ' : 'Bills', icon: ShoppingCart },
          { key: 'pettyCash', to: '/app/expenses', label: isThai ? 'เงินสดย่อย' : 'Petty Cash', icon: Wallet },
        ]}
      />
      <section className="workspace-command">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.7fr)] lg:items-stretch">
          <div className="min-w-0">
            <p className="premium-eyebrow">{isThai ? 'Expense Approval Ledger' : 'Expense Approval Ledger'}</p>
            <div className="mt-3 flex items-center gap-3 sm:mt-4">
              <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800 ring-1 ring-primary-100 sm:inline-flex">
                <Wallet className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-slate-950 sm:text-3xl">
                  {t('expenses.title')}
                </h1>
                <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-slate-600 sm:block">
                  {expenseLimit !== null
                    ? `${t('expenses.expenseLimit')}: ${formatCurrency(expenseLimit)}`
                    : t('expenses.noLimit')}
                </p>
              </div>
            </div>
            <div className="mt-4 sm:mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {isThai ? 'ยอด voucher ในช่วงที่เลือก' : 'Voucher value in selected range'}
              </p>
              <p className="mt-1 text-[2.15rem] font-bold leading-none text-primary-800 tabular-nums sm:text-[2.5rem]">
                {formatCurrency(totalAmount)}
              </p>
              <div className="mt-3 h-px w-40 bg-slate-200" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:mt-5 sm:gap-3">
              <div className="border-t border-slate-200 px-1 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? 'รอจ่าย/รออนุมัติ' : 'Pending'}</p>
                <p className="mt-1 font-bold text-slate-950 tabular-nums">{formatCurrency(pendingAmount)}</p>
              </div>
              <div className="border-t border-slate-200 px-1 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? 'เงินสดย่อยคงเหลือ' : 'Petty cash'}</p>
                <p className="mt-1 font-bold text-slate-950 tabular-nums">{formatCurrency(pettyCashBalance)}</p>
              </div>
            </div>
          </div>

          <div className="workspace-command-rail">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
              <Wallet className="h-4 w-4 text-primary-700" />
              {isThai ? 'จัดการ voucher' : 'Voucher actions'}
            </div>
            <div className="mt-3 border-y border-slate-200 py-3">
              <p className="text-xs font-semibold text-slate-500">{isThai ? 'งวดที่กำลังดู' : 'Current period'}</p>
              <p className="mt-1 text-sm font-bold text-slate-950">{formatDate(from)} - {formatDate(to)}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <button onClick={openCreate} className="btn-primary px-3 py-2 text-sm disabled:opacity-60 sm:px-4 sm:py-2.5" disabled={isFreePlan}>
                <Plus className="h-4 w-4" />
                {t('expenses.newVoucher')}
              </button>
              <button
                onClick={handleSheetsExport}
                disabled={sheetsExporting || vouchers.length === 0}
                className="btn-secondary px-3 py-2 text-sm disabled:opacity-60 sm:px-4 sm:py-2.5"
                title={t('expenses.exportSheets', 'Export to Google Sheets')}
              >
                {sheetsExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sheet className="h-4 w-4" />}
                {t('expenses.exportSheets', 'Export')}
              </button>
              {isAdmin && (
                <button
                  onClick={() => { setTopUpAmount(''); setShowTopUpModal(true); }}
                  className="btn-secondary col-span-2 px-3 py-2 text-sm sm:col-span-1 sm:px-4 sm:py-2.5"
                >
                  <Wallet className="h-4 w-4" />
                  {t('expenses.topUp', 'Top Up')}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {workItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                  <Icon className="h-4 w-4" />
                </span>
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(item.tone)}`} />
              </div>
              <p className="mt-3 text-xl font-bold leading-none text-slate-950 tabular-nums">{item.value}</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{item.label}</p>
              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {driveError && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-amber-800 shadow-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {driveError}
        </div>
      )}

      {/* Google Drive connect banner */}
      {driveStatus?.oauthConfigured && !driveStatus.connected && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <HardDrive className="w-5 h-5 text-primary-700 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">{t('expenses.driveConnectTitle', 'Connect your Google Drive')}</p>
            <p className="text-xs text-slate-500 mt-0.5">{t('expenses.driveConnectDesc', 'Upload attachments directly to your Drive — files stay in your account')}</p>
          </div>
          <button
            onClick={() => void connectDrive()}
            disabled={driveConnecting}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {driveConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
            {t('expenses.driveConnect', 'Connect')}
          </button>
        </div>
      )}

      {driveStatus?.connected && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-sm text-slate-700 flex-1">
            <span className="font-semibold">{t('expenses.driveConnected', 'Google Drive connected')}</span>
            {driveStatus.linkedAt && (
              <span className="text-xs text-slate-500 ml-2">— {formatDate(driveStatus.linkedAt)}</span>
            )}
          </p>
          <button onClick={disconnectDrive} className="text-xs text-primary-700 hover:text-primary-900 underline shrink-0">
            {t('expenses.driveDisconnect', 'Disconnect')}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">{t('common.date')}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-field" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">→</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-field" />
          </div>
          <div className="flex flex-col flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-500 mb-1">{t('common.search')}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('expenses.voucherNumber')}
                className="input-field pl-9"
              />
            </div>
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">{t('common.status')}</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ExpenseVoucherStatus | 'all')}
              className="input-field w-auto"
            >
              <option value="all">{t('common.filter')}</option>
              <option value="draft">{t('expenses.status.draft')}</option>
              <option value="submitted">{t('expenses.status.submitted')}</option>
              <option value="approved">{t('expenses.status.approved')}</option>
              <option value="rejected">{t('expenses.status.rejected')}</option>
            </select>
          </div>
          {projects.length > 0 && (
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-500 mb-1">{isThai ? 'โปรเจค' : 'Project'}</label>
              <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="input-field w-auto">
                <option value="">{isThai ? 'ทุกโปรเจค' : 'All projects'}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
        ) : vouchers.length === 0 ? (
          <EmptyState
            title={t('expenses.noItems')}
            description={isThai ? 'สร้าง voucher แรกเพื่อเริ่ม workflow ส่งอนุมัติและแนบหลักฐานค่าใช้จ่าย' : 'Create the first voucher to start approval and evidence tracking.'}
            actionLabel={t('expenses.newVoucher')}
            actionHref=""
            action={<button onClick={openCreate} className="mt-4 text-sm font-bold text-primary-700">{t('expenses.newVoucher')}</button>}
          />
        ) : (
          vouchers.map((v) => (
            <div key={v.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900 font-mono text-sm">{v.voucherNumber}</p>
                  {v.description && <p className="text-xs text-gray-500 mt-0.5">{v.description}</p>}
                </div>
                <span className={statusBadgeClass(v.status)}>{t(`expenses.status.${v.status}`)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{formatDate(v.voucherDate)}</span>
                <span>{v.itemCount ?? 0} {t('expenses.expenseItem')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">{t('expenses.total')}</span>
                <span className="font-bold text-primary-700 tabular-nums">{formatCurrency(v.totalAmount)}</span>
              </div>
              {v.rejectionNote && (
                <p className="rounded-lg border border-rose-100 bg-white px-2 py-1 text-xs font-semibold text-rose-600">{v.rejectionNote}</p>
              )}
              {v.project && (
                <p className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                  <BriefcaseBusiness className="h-3 w-3" />
                  {v.project.code} · {v.project.name}
                </p>
              )}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <button onClick={() => openDetail(v)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  <Eye className="w-3.5 h-3.5" /> {t('common.view', 'View')}
                </button>
                {v.status === 'draft' && (
                  <>
                    <button onClick={() => openEdit(v)} className="inline-flex items-center gap-1 rounded-lg border border-primary-100 bg-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50">
                      <Edit2 className="w-3.5 h-3.5" /> {t('common.edit')}
                    </button>
                    <button onClick={() => handleSubmit(v.id)} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50">
                      <Send className="w-3.5 h-3.5" /> {t('expenses.submit')}
                    </button>
                    <DeleteButton onClick={() => handleDelete(v.id)} label={t('common.delete')} size="sm" className="ml-auto" />
                  </>
                )}
                {canApproveVoucher(v) && (
                  <>
                    <button onClick={() => handleApprove(v.id)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                      <ThumbsUp className="w-3.5 h-3.5" /> {t('expenses.approve')}
                    </button>
                    <button onClick={() => openReject(v.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50">
                      <ThumbsDown className="w-3.5 h-3.5" /> {t('expenses.reject')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-950">{isThai ? 'รายการเงินสดย่อย' : 'Petty cash vouchers'}</h2>
          <p className="mt-1 text-xs text-slate-500">{isThai ? 'ตรวจสถานะ อนุมัติ และหลักฐานของ voucher ในช่วงที่เลือก' : 'Review voucher status, approvals, and evidence in the selected range.'}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{t('expenses.voucherNumber')}</th>
                <th className="table-header">{t('expenses.voucherDate')}</th>
                <th className="table-header">{t('expenses.description')}</th>
                <th className="table-header hidden lg:table-cell">{isThai ? 'โปรเจค' : 'Project'}</th>
                <th className="table-header text-center">{t('expenses.expenseItem')}</th>
                <th className="table-header text-right">{t('expenses.total')}</th>
                <th className="table-header">{t('common.status')}</th>
                <th className="table-header">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-500" /></td></tr>
              ) : vouchers.length === 0 ? (
                <tr><td colSpan={8} className="py-12">
                  <EmptyState
                    title={t('expenses.noItems')}
                    description={isThai ? 'สร้าง voucher แรกเพื่อเริ่ม workflow ส่งอนุมัติและแนบหลักฐานค่าใช้จ่าย' : 'Create the first voucher to start approval and evidence tracking.'}
                    action={<button onClick={openCreate} className="mt-4 text-sm font-bold text-primary-700">{t('expenses.newVoucher')}</button>}
                  />
                </td></tr>
              ) : (
                vouchers.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="table-cell font-mono text-xs font-medium">{v.voucherNumber}</td>
                    <td className="table-cell text-gray-600 whitespace-nowrap">{formatDate(v.voucherDate)}</td>
                    <td className="table-cell text-gray-500 text-sm max-w-[200px] truncate">{v.description ?? '—'}</td>
                    <td className="table-cell hidden lg:table-cell">
                      {v.project ? (
                        <a href={`/app/projects/${v.project.id}`} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200">
                          <BriefcaseBusiness className="h-3 w-3" />
                          {v.project.code}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="table-cell text-center tabular-nums">{v.itemCount ?? 0}</td>
                    <td className="table-cell text-right font-semibold tabular-nums">{formatCurrency(v.totalAmount)}</td>
                    <td className="table-cell">
                      <span className={statusBadgeClass(v.status)}>{t(`expenses.status.${v.status}`)}</span>
                      {v.rejectionNote && (
                        <p className="text-[11px] text-red-500 mt-1 max-w-[150px] truncate" title={v.rejectionNote}>{v.rejectionNote}</p>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openDetail(v)} className="p-1 text-slate-500 hover:text-gray-600" title={t('common.view', 'View')}>
                          <Eye className="w-4 h-4" />
                        </button>
                        {v.status === 'draft' && (
                          <>
                            <button onClick={() => openEdit(v)} className="p-1 text-primary-600 hover:text-primary-800" title={t('common.edit')}>
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleSubmit(v.id)} className="p-1 text-amber-600 hover:text-amber-800" title={t('expenses.submit')}>
                              <Send className="w-4 h-4" />
                            </button>
                            <DeleteButton onClick={() => handleDelete(v.id)} label={t('common.delete')} size="sm" />
                          </>
                        )}
                        {canApproveVoucher(v) && (
                          <>
                            <button onClick={() => handleApprove(v.id)} className="p-1 text-green-600 hover:text-green-800" title={t('expenses.approve')}>
                              <ThumbsUp className="w-4 h-4" />
                            </button>
                            <button onClick={() => openReject(v.id)} className="p-1 text-red-500 hover:text-red-700" title={t('expenses.reject')}>
                              <ThumbsDown className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && vouchers.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">{t('expenses.total')}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(totalAmount)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? t('expenses.editVoucher') : t('expenses.newVoucher')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('expenses.voucherDate')} *</label>
                  <input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} className="input-field" />
                </div>
                {projects.length > 0 && (
                  <div>
                    <label className="label">{isThai ? 'โปรเจค / งาน' : 'Project / job'}</label>
                    <select value={voucherProjectId} onChange={(e) => setVoucherProjectId(e.target.value)} className="input-field">
                      <option value="">{isThai ? 'ไม่ผูกโปรเจค' : 'No project'}</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="label">{t('expenses.description')}</label>
                  <input value={voucherDesc} onChange={(e) => setVoucherDesc(e.target.value)} className="input-field" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{t('expenses.notes')}</label>
                  <textarea value={voucherNotes} onChange={(e) => setVoucherNotes(e.target.value)} rows={2} className="input-field" />
                </div>
              </div>

              {/* Expense items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">{t('expenses.expenseItem')}</h3>
                  <button onClick={addItem} className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-900">
                    <PlusCircle className="w-4 h-4" /> {t('expenses.addItem')}
                  </button>
                </div>

                {items.map((item, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-200 p-4 space-y-3 relative">
                    {items.length > 1 && (
                      <DeleteButton
                        onClick={() => removeItem(idx)}
                        label={t('expenses.removeItem')}
                        size="sm"
                        className="absolute top-2 right-2"
                      />
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t('expenses.description')} *</label>
                        <input
                          value={item.description}
                          onChange={(e) => updateItem(idx, 'description', e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t('expenses.amount')} *</label>
                        <input
                          type="number" min="0" step="0.01"
                          value={item.amount}
                          onChange={(e) => updateItem(idx, 'amount', e.target.value)}
                          className="input-field text-right"
                          placeholder="0.00"
                        />
                        {expenseLimit !== null && parseFloat(item.amount) > expenseLimit && (
                          <p className="text-[11px] text-red-600 mt-1">{t('expenses.limitExceeded', { limit: expenseLimit })}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t('expenses.category')}</label>
                        <select value={item.category} onChange={(e) => updateItem(idx, 'category', e.target.value)} className="input-field">
                          <option value="">—</option>
                          {CATEGORY_KEYS.map((cat) => (
                            <option key={cat} value={cat}>{t(`expenses.categories.${cat}`)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t('common.date')}</label>
                        <input type="date" value={item.date} onChange={(e) => updateItem(idx, 'date', e.target.value)} className="input-field" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t('expenses.notes')}</label>
                        <input value={item.notes} onChange={(e) => updateItem(idx, 'notes', e.target.value)} className="input-field" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t('expenses.vendorName', 'Vendor Name')}</label>
                        <input value={item.vendorName} onChange={(e) => updateItem(idx, 'vendorName', e.target.value)} className="input-field" placeholder={t('common.optional', 'Optional')} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t('expenses.vendorTaxId', 'Vendor Tax ID')}</label>
                        <input value={item.vendorTaxId} onChange={(e) => updateItem(idx, 'vendorTaxId', e.target.value)} className="input-field" placeholder="0000000000000" />
                      </div>
                    </div>

                    {/* WHT */}
                    <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={item.whtApplicable}
                          onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, whtApplicable: e.target.checked } : it))}
                          className="w-4 h-4 rounded accent-amber-600"
                        />
                        <span className="text-xs font-semibold text-amber-800">{t('expenses.whtApplicable', 'Withholding Tax (ภาษีหัก ณ ที่จ่าย)')}</span>
                      </label>
                      {item.whtApplicable && (
                        <div className="grid grid-cols-3 gap-2 mt-1">
                          <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">{t('expenses.whtRate', 'WHT Rate')}</label>
                            <select value={item.whtRate} onChange={(e) => updateItem(idx, 'whtRate', e.target.value)} className="input-field">
                              {WHT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">{t('expenses.whtAmount', 'WHT Amount')}</label>
                            <div className="input-field bg-gray-50 text-right text-gray-600">
                              {(() => {
                                const amt = parseFloat(item.amount) || 0;
                                const rate = parseFloat(item.whtRate) || 0;
                                return formatCurrency(Math.round(amt * rate) / 100);
                              })()}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">{t('expenses.netAmount', 'Net Amount')}</label>
                            <div className="input-field bg-gray-50 text-right font-semibold text-gray-800">
                              {(() => {
                                const amt = parseFloat(item.amount) || 0;
                                const rate = parseFloat(item.whtRate) || 0;
                                const wht = Math.round(amt * rate) / 100;
                                return formatCurrency(Math.round((amt - wht) * 100) / 100);
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Attachments */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-medium text-gray-500">{t('expenses.attachments')}</p>
                        <button
                          type="button"
                          onClick={() => openAddAttachment(idx)}
                          className="inline-flex items-center gap-1 text-xs text-primary-700 hover:text-primary-900"
                        >
                          <LinkIcon className="w-3.5 h-3.5" />
                          {t('expenses.addAttachment', 'Add URL')}
                        </button>
                      </div>
                      {item.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {item.attachments.map((att, attIdx) => (
                            <span key={attIdx} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                              {att.fileType === 'image' ? <ImageIcon className="w-3 h-3" /> : att.fileType === 'pdf' ? <FileText className="w-3 h-3" /> : <LinkIcon className="w-3 h-3" />}
                              <a href={att.url} target="_blank" rel="noopener noreferrer" className="hover:underline max-w-[120px] truncate">
                                {att.fileName || att.url}
                              </a>
                              <span className="text-slate-500">·</span>
                              <span className="text-slate-500">{t(`expenses.evidenceType.${att.evidenceType}`, att.evidenceType)}</span>
                              <button onClick={() => removeAttachment(idx, attIdx)} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between rounded-lg bg-primary-50 px-4 py-3">
                <span className="text-sm font-semibold text-gray-700">{t('expenses.total')}</span>
                <span className="text-lg font-bold text-primary-700">{formatCurrency(computedTotal)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="btn-secondary">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / Approval Timeline Drawer */}
      {detailVoucher && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setDetailVoucher(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="font-mono text-xs text-slate-500">{detailVoucher.voucherNumber}</p>
                <h2 className="text-base font-bold text-gray-900">{detailVoucher.description || t('expenses.voucher')}</h2>
              </div>
              <button onClick={() => setDetailVoucher(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {detailLoading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary-500" /></div>}

              {/* Approval Timeline */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('expenses.approvalTimeline', 'Approval Timeline')}</h3>
                {(() => {
                  const logs: ApprovalLog[] = detailVoucher.approvalLogs ?? [];
                  // Always show "Created" as first node
                  const nodes: { action: string; timestamp: string; note?: string | null; isFirst?: boolean }[] = [
                    { action: 'draft', timestamp: detailVoucher.createdAt ?? '', isFirst: true },
                    ...logs.map((l) => ({ action: l.action, timestamp: l.timestamp, note: l.note })),
                  ];
                  return (
                    <div className="relative pl-6">
                      {/* Vertical line */}
                      <div className="absolute left-2.5 top-2 bottom-2 w-px bg-gray-200" />
                      <div className="space-y-5">
                        {nodes.map((node, i) => {
                          const isLast = i === nodes.length - 1;
                          const Icon = node.action === 'approved' ? CheckCircle2
                            : node.action === 'rejected' ? XCircle
                            : node.action === 'submitted' ? ArrowRight
                            : Clock;
                          const iconColor = node.action === 'approved' ? 'text-green-500'
                            : node.action === 'rejected' ? 'text-red-500'
                            : node.action === 'submitted' ? 'text-amber-500'
                            : 'text-slate-500';
                          const bgColor = node.action === 'approved' ? 'bg-green-50'
                            : node.action === 'rejected' ? 'bg-red-50'
                            : node.action === 'submitted' ? 'bg-amber-50'
                            : 'bg-gray-50';
                          return (
                            <div key={i} className="relative flex gap-3">
                              <div className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center ${bgColor} border-2 ${isLast ? 'border-current' : 'border-gray-200'}`}>
                                <Icon className={`w-3 h-3 ${iconColor}`} strokeWidth={2.5} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-800 capitalize">
                                  {t(`expenses.status.${node.action}`, node.action)}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {node.timestamp ? formatDate(node.timestamp) : '—'}
                                </p>
                                {node.note && (
                                  <p className="mt-1 text-xs text-red-600 bg-red-50 rounded px-2 py-1">{node.note}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Items summary */}
              {detailVoucher.items && detailVoucher.items.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('expenses.expenseItem')}</h3>
                  <div className="space-y-2">
                    {detailVoucher.items.map((item) => (
                      <div key={item.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{item.description}</p>
                            {item.vendorName && <p className="text-xs text-slate-500">{item.vendorName}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-gray-900">{formatCurrency(item.amount)}</p>
                            {item.whtApplicable && item.netAmount != null && (
                              <p className="text-xs text-amber-600">Net {formatCurrency(item.netAmount)}</p>
                            )}
                          </div>
                        </div>
                        {item.whtApplicable && item.whtRate != null && (
                          <p className="text-[11px] text-slate-500 mt-1">WHT {item.whtRate}% = {formatCurrency(item.whtAmount ?? 0)}</p>
                        )}
                        {item.attachments?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {item.attachments.map((att) => (
                              <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-primary-600 hover:underline">
                                <LinkIcon className="w-3 h-3" />
                                {att.fileName || t(`expenses.evidenceType.${att.evidenceType}`, att.evidenceType)}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-2 px-1">
                    <span className="text-xs text-gray-500">{t('expenses.total')}</span>
                    <span className="text-sm font-bold text-primary-700">{formatCurrency(detailVoucher.totalAmount)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            {canApproveVoucher(detailVoucher) && (
              <div className="border-t border-gray-100 px-5 py-4 flex gap-2">
                <button
                  onClick={() => { setDetailVoucher(null); handleApprove(detailVoucher.id); }}
                  className="flex-1 btn-primary bg-green-600 hover:bg-green-700 border-green-600"
                >
                  <ThumbsUp className="w-4 h-4" /> {t('expenses.approve')}
                </button>
                <button
                  onClick={() => { setDetailVoucher(null); openReject(detailVoucher.id); }}
                  className="flex-1 btn-secondary text-red-600 border-red-200 hover:bg-red-50"
                >
                  <ThumbsDown className="w-4 h-4" /> {t('expenses.reject')}
                </button>
              </div>
            )}
            {detailVoucher.status === 'draft' && (
              <div className="border-t border-gray-100 px-5 py-4 flex gap-2">
                <button
                  onClick={() => { setDetailVoucher(null); openEdit(detailVoucher); }}
                  className="flex-1 btn-secondary"
                >
                  <Edit2 className="w-4 h-4" /> {t('common.edit')}
                </button>
                <button
                  onClick={() => { setDetailVoucher(null); handleSubmit(detailVoucher.id); }}
                  className="flex-1 btn-primary"
                >
                  <Send className="w-4 h-4" /> {t('expenses.submit')}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Top Up Modal */}
      {showTopUpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">{t('expenses.topUp', 'Top Up Petty Cash')}</h2>
              <button onClick={() => setShowTopUpModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-3">
                  {t('expenses.currentBalance', 'Current Balance')}: <span className="font-bold text-emerald-700">{formatCurrency(pettyCash?.balance ?? 0)}</span>
                </p>
                <label className="label">{t('expenses.topUpAmount', 'Amount to Add')} *</label>
                <input
                  type="number" min="1" step="0.01"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="input-field text-right"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowTopUpModal(false)} className="btn-secondary">{t('common.cancel')}</button>
                <button onClick={handleTopUp} disabled={!topUpAmount || parseFloat(topUpAmount) <= 0} className="btn-primary">
                  <Plus className="w-4 h-4" /> {t('expenses.topUp', 'Top Up')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Attachment Modal */}
      {addingAttachmentForItem !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">{t('expenses.addAttachment', 'Add Attachment')}</h2>
              <button onClick={() => setAddingAttachmentForItem(null)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {/* Drive upload strip */}
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <HardDrive className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-xs text-blue-700 flex-1">{t('expenses.uploadToDrive', 'Upload file → auto-fill URL')}</span>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors">
                  {driveUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {t('expenses.chooseFile', 'Choose File')}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    disabled={driveUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.currentTarget.value = '';
                      if (file) void uploadFileToDrive(file);
                    }}
                  />
                </label>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <div className="flex-1 h-px bg-gray-200" />
                {t('common.or', 'or paste URL manually')}
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">URL *</label>
                <input
                  type="url"
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  placeholder="https://..."
                  className="input-field"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">{t('expenses.fileName', 'File Name')}</label>
                <input
                  type="text"
                  value={attachmentFileName}
                  onChange={(e) => setAttachmentFileName(e.target.value)}
                  placeholder={t('common.optional', 'Optional')}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">{t('expenses.fileType', 'File Type')}</label>
                  <select value={attachmentFileType} onChange={(e) => setAttachmentFileType(e.target.value as AttachmentFileType)} className="input-field">
                    <option value="image">{t('expenses.fileTypes.image', 'Image')}</option>
                    <option value="pdf">{t('expenses.fileTypes.pdf', 'PDF')}</option>
                    <option value="link">{t('expenses.fileTypes.link', 'Link')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">{t('expenses.evidenceTypeLabel', 'Evidence Type')}</label>
                  <select value={attachmentEvidenceType} onChange={(e) => setAttachmentEvidenceType(e.target.value as EvidenceType)} className="input-field">
                    <option value="receipt">{t('expenses.evidenceType.receipt', 'Receipt')}</option>
                    <option value="chat">{t('expenses.evidenceType.chat', 'Chat')}</option>
                    <option value="map">{t('expenses.evidenceType.map', 'Map')}</option>
                    <option value="other">{t('expenses.evidenceType.other', 'Other')}</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setAddingAttachmentForItem(null)} className="btn-secondary">{t('common.cancel')}</button>
                <button onClick={confirmAddAttachment} disabled={!attachmentUrl.trim()} className="btn-primary">
                  <Plus className="w-4 h-4" /> {t('common.add', 'Add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{t('expenses.reject')}</h2>
              <button onClick={() => setShowRejectModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">{t('expenses.rejectionNote')} *</label>
                <textarea
                  value={rejectionNote}
                  onChange={(e) => setRejectionNote(e.target.value)}
                  rows={3}
                  className="input-field"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowRejectModal(false)} className="btn-secondary">{t('common.cancel')}</button>
                <button onClick={handleReject} disabled={!rejectionNote.trim()} className="btn-danger">
                  <ThumbsDown className="w-4 h-4" /> {t('expenses.reject')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
