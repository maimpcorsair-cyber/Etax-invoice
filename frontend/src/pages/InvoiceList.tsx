import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus, Search, Download, FileText, FileSpreadsheet,
  ExternalLink, ChevronDown, Loader2, Receipt, CheckCircle, Clock, CreditCard, Send, Eye, X, Ban, XCircle, Mail,
  BriefcaseBusiness, CalendarClock, Truck, MessageCircle,
} from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { Invoice, InvoiceStatus, InvoiceType, Payment } from '../types';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import { EmptyState, MetricCard, PageHeader } from '../components/ui/AppChrome';
import SectionSubNav from '../components/SectionSubNav';

const STATUS_OPTIONS: InvoiceStatus[] = ['draft', 'pending', 'approved', 'submitted', 'rejected', 'cancelled'];
const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: 'badge-info',
  pending: 'badge-warning',
  approved: 'badge-success',
  submitted: 'badge-success',
  rejected: 'badge-error',
  cancelled: 'badge-error',
};

const TYPE_LABELS: Record<InvoiceType, { th: string; en: string; color: string }> = {
  tax_invoice:         { th: 'ใบกำกับภาษี',              en: 'Tax Invoice',          color: 'bg-blue-100 text-blue-700' },
  tax_invoice_receipt: { th: 'ใบกำกับภาษี/ใบเสร็จ',      en: 'Tax Inv/Receipt',      color: 'bg-purple-100 text-purple-700' },
  receipt:             { th: 'ใบเสร็จรับเงิน',            en: 'Receipt',              color: 'bg-green-100 text-green-700' },
  credit_note:         { th: 'ใบลดหนี้',                  en: 'Credit Note',          color: 'bg-orange-100 text-orange-700' },
  debit_note:          { th: 'ใบเพิ่มหนี้',               en: 'Debit Note',           color: 'bg-red-100 text-red-700' },
};

const PAYMENT_METHODS: Record<string, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  cheque: 'เช็ค',
  credit_card: 'บัตรเครดิต',
  other: 'อื่นๆ',
};

interface ProjectOption {
  id: string;
  code: string;
  name: string;
  status: string;
}

type RecurringSeedForm = {
  name: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  interval: number;
  nextRunDate: string;
  dueDays: number | '';
  maxRuns: number | '';
  endDate: string;
};

function dateInput(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function addMonthsIso(value: string, months: number) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function daysBetweenIso(start?: string, end?: string) {
  if (!start || !end) return '';
  const startDate = new Date(`${start.slice(0, 10)}T00:00:00.000Z`);
  const endDate = new Date(`${end.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '';
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
}

export default function InvoiceList() {
  const { t } = useTranslation();
  const { isThai, formatCurrency, formatDate } = useLanguage();
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { policy } = useCompanyAccessPolicy();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<InvoiceType | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState(searchParams.get('projectId') ?? '');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'sheets' | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Issue Receipt modal
  const [receiptModal, setReceiptModal] = useState<{ invoice: Invoice } | null>(null);
  const [receiptForm, setReceiptForm] = useState({ paymentMethod: 'transfer', note: '', paidAt: new Date().toISOString().split('T')[0] });
  const [issuingReceipt, setIssuingReceipt] = useState(false);

  // Preview modal
  const [previewModal, setPreviewModal] = useState<{ id: string; invoiceNumber: string } | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Payment modal
  const [paymentModal, setPaymentModal] = useState<{ invoice: Invoice } | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentForm, setPaymentForm] = useState({ amount: 0, method: 'transfer', reference: '', paidAt: new Date().toISOString().split('T')[0], note: '' });
  const [savingPayment, setSavingPayment] = useState(false);
  const [submittingRD, setSubmittingRD] = useState<string | null>(null);
  // Track which invoice's email is in flight + which were just successfully
  // sent (for the temporary "Sent" badge that flashes for a few seconds).
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [emailJustSent, setEmailJustSent] = useState<Record<string, true>>({});
  // LINE share — busy state while creating the magic link, then a modal
  // that lets the seller copy the link or hand off to LINE. We stopped
  // auto-opening line.me's share sheet because users couldn't tell whether
  // the message actually sent (LINE shows a "shared!" confirm even when
  // the receiving chat scrolls past or the link preview fails).
  const [sharingLine, setSharingLine] = useState<string | null>(null);
  const [shareModal, setShareModal] = useState<{ invoiceNumber: string; url: string } | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  // Cancel modal
  const [cancelModal, setCancelModal] = useState<{ invoice: Invoice } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Recurring invoice seed modal
  const [recurringModal, setRecurringModal] = useState<{ invoice: Invoice } | null>(null);
  const [recurringForm, setRecurringForm] = useState<RecurringSeedForm>({
    name: '',
    frequency: 'monthly',
    interval: 1,
    nextRunDate: addMonthsIso(new Date().toISOString(), 1),
    dueDays: '',
    maxRuns: '',
    endDate: '',
  });
  const [creatingRecurring, setCreatingRecurring] = useState(false);

  const fetchInvoices = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (projectFilter) params.set('projectId', projectFilter);

      const res = await fetch(`/api/invoices?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      let data: Invoice[] = json.data ?? [];

      // client-side type filter (API doesn't support type filter yet)
      if (typeFilter !== 'all') data = data.filter((inv) => inv.type === typeFilter);

      setInvoices(data);
      setPagination({
        page: json.pagination?.page ?? 1,
        total: json.pagination?.total ?? data.length,
        totalPages: json.pagination?.totalPages ?? 1,
      });
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, projectFilter, token]);

  useEffect(() => {
    const t = setTimeout(() => fetchInvoices(1), 300);
    return () => clearTimeout(t);
  }, [fetchInvoices]);

  useEffect(() => {
    if (!token) return;
    void fetch('/api/projects?status=all', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.ok ? res.json() : { data: [] })
      .then((json) => setProjects(json.data ?? []))
      .catch(() => setProjects([]));
  }, [token]);

  /* ── Export ── */
  async function handleExcelExport() {
    if (!policy?.canExportExcel) {
      alert(isThai ? 'แพ็กเกจนี้ยังไม่รองรับการส่งออกข้อมูล' : 'This plan does not support data export');
      return;
    }
    setExporting('excel'); setExportOpen(false);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (projectFilter) params.set('projectId', projectFilter);
      const res = await fetch(`/api/invoices/export/excel?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `invoices-${new Date().toISOString().split('T')[0]}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert(isThai ? 'ส่งออกไม่สำเร็จ' : 'Export failed'); }
    finally { setExporting(null); }
  }

  async function handleSheetsExport() {
    if (!policy?.canExportGoogleSheets) {
      alert(isThai ? 'อัปเกรดเป็น Business เพื่อส่งออก Google Sheets' : 'Upgrade to Business to export to Google Sheets');
      return;
    }
    setExporting('sheets'); setExportOpen(false);
    try {
      const res = await fetch('/api/invoices/export/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ search, status: statusFilter !== 'all' ? statusFilter : undefined, projectId: projectFilter || undefined }),
      });
      if (!res.ok) throw new Error();
      const { url } = await res.json() as { url: string };
      window.location.assign(url);
    } catch { alert(isThai ? 'ส่งออก Google Sheets ไม่สำเร็จ' : 'Google Sheets export failed'); }
    finally { setExporting(null); }
  }

  /* ── Preview ── */
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function openPreview(inv: { id: string; invoiceNumber: string }) {
    setPreviewModal(inv);
    setPreviewBlobUrl(null);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      setPreviewBlobUrl(URL.createObjectURL(blob));
    } catch (e) {
      setPreviewError((e as Error).message);
    }
  }

  function closePreview() {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    setPreviewBlobUrl(null);
    setPreviewModal(null);
    setPreviewError(null);
  }

  async function handleDownloadPdf() {
    if (!previewModal) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/invoices/${previewModal.id}/preview?format=pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const filename = `${previewModal.invoiceNumber}.pdf`;

      // Standard browser download — native iOS/Android shells removed.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(isThai ? `ดาวน์โหลดไม่สำเร็จ: ${(e as Error).message}` : `Download failed: ${(e as Error).message}`);
    } finally {
      setPdfLoading(false);
    }
  }

  /* ── Issue Receipt ── */
  async function handleIssueReceipt() {
    if (!receiptModal) return;
    setIssuingReceipt(true);
    try {
      const res = await fetch(`/api/invoices/${receiptModal.invoice.id}/issue-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(receiptForm),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed');
      }
      const receipt = (await res.json() as { data: Invoice }).data;
      setReceiptModal(null);
      fetchInvoices(pagination.page);
      openPreview({ id: receipt.id, invoiceNumber: receipt.invoiceNumber });
    } catch (e) {
      alert(isThai ? `เกิดข้อผิดพลาด: ${(e as Error).message}` : `Error: ${(e as Error).message}`);
    } finally { setIssuingReceipt(false); }
  }

  /* ── Record Payment ── */
  async function openPaymentModal(invoice: Invoice) {
    setPaymentModal({ invoice });
    setPaymentForm({ amount: invoice.total, method: 'transfer', reference: '', paidAt: new Date().toISOString().split('T')[0], note: '' });
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/payments`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setPayments(json.data ?? []);
    } catch { setPayments([]); }
  }

  async function handleSavePayment() {
    if (!paymentModal) return;
    setSavingPayment(true);
    try {
      const res = await fetch(`/api/invoices/${paymentModal.invoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(paymentForm),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed');
      setPaymentModal(null);
      fetchInvoices(pagination.page);
    } catch (e) {
      alert(isThai ? `เกิดข้อผิดพลาด: ${(e as Error).message}` : `Error: ${(e as Error).message}`);
    } finally { setSavingPayment(false); }
  }

  const canIssueReceipt = (inv: Invoice) =>
    inv.type === 'tax_invoice' &&
    !inv.isPaid &&
    inv.status !== 'cancelled' &&
    (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant');

  const canRecordPayment = (inv: Invoice) =>
    !inv.isPaid && inv.status !== 'cancelled' &&
    (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant');

  const canSubmitRD = (inv: Invoice) =>
    inv.status === 'approved' &&
    (inv.rdSubmissionStatus == null || inv.rdSubmissionStatus === 'failed') &&
    !!policy?.canSubmitToRD &&
    (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant');

  const canCancelInvoice = (inv: Invoice) =>
    inv.status !== 'cancelled' &&
    inv.status !== 'draft' &&
    (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant');

  const canCreateRecurringFromInvoice = (inv: Invoice) =>
    inv.status !== 'cancelled' &&
    inv.type !== 'receipt' &&
    (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant');

  function openRecurringModal(inv: Invoice) {
    const customerName = isThai
      ? inv.buyer?.nameTh ?? inv.buyer?.nameEn ?? ''
      : inv.buyer?.nameEn ?? inv.buyer?.nameTh ?? '';
    const invoiceDate = dateInput(inv.invoiceDate);
    setRecurringModal({ invoice: inv });
    setRecurringForm({
      name: `${customerName || (isThai ? 'ลูกค้า' : 'Customer')} / ${inv.invoiceNumber}`,
      frequency: 'monthly',
      interval: 1,
      nextRunDate: addMonthsIso(invoiceDate, 1),
      dueDays: daysBetweenIso(inv.invoiceDate, inv.dueDate),
      maxRuns: '',
      endDate: '',
    });
  }

  async function handleCreateRecurringFromInvoice() {
    if (!recurringModal) return;
    setCreatingRecurring(true);
    try {
      const payload = {
        name: recurringForm.name.trim() || undefined,
        frequency: recurringForm.frequency,
        interval: Number(recurringForm.interval || 1),
        nextRunDate: recurringForm.nextRunDate || undefined,
        dueDays: recurringForm.dueDays === '' ? null : Number(recurringForm.dueDays),
        maxRuns: recurringForm.maxRuns === '' ? null : Number(recurringForm.maxRuns),
        endDate: recurringForm.endDate || null,
      };
      const res = await fetch(`/api/recurring-invoices/from-invoice/${recurringModal.invoice.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json() as { data?: { id: string }; error?: string; details?: Array<{ path?: (string | number)[]; message?: string }> };
      if (!res.ok || !json.data?.id) {
        const detail = json.details?.map((d) => `${(d.path ?? []).join('.')}: ${d.message ?? ''}`).join(' · ');
        throw new Error(detail || json.error || 'Failed');
      }
      setRecurringModal(null);
      navigate(`/app/recurring-invoices/${json.data.id}`);
    } catch (e) {
      alert(isThai ? `สร้าง recurring ไม่สำเร็จ: ${(e as Error).message}` : `Failed to create recurring schedule: ${(e as Error).message}`);
    } finally {
      setCreatingRecurring(false);
    }
  }

  // Email the invoice PDF to the buyer. Backend already validates plan
   // access + buyer email presence; the UI just disables the button when
   // we can predict the 400 (no email on buyer) so the user gets a clear
   // affordance instead of a thrown alert.
  async function handleSendEmail(inv: Invoice) {
    if (!inv.buyer?.email) return;
    const msg = isThai
      ? `ส่งใบกำกับ ${inv.invoiceNumber} ทางอีเมลไปยัง ${inv.buyer.email}?`
      : `Email invoice ${inv.invoiceNumber} to ${inv.buyer.email}?`;
    if (!window.confirm(msg)) return;

    setSendingEmail(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/send-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed');
      }
      setEmailJustSent((prev) => ({ ...prev, [inv.id]: true }));
      // Brief "sent" badge then fade back to the normal button so the
      // user can re-send if needed.
      setTimeout(() => setEmailJustSent((prev) => {
        const next = { ...prev };
        delete next[inv.id];
        return next;
      }), 4000);
    } catch (e) {
      alert(isThai ? `ส่งอีเมลไม่สำเร็จ: ${(e as Error).message}` : `Failed to send email: ${(e as Error).message}`);
    } finally {
      setSendingEmail(null);
    }
  }

  // Generate a magic link for the invoice and open a modal showing the
  // link + Copy + Open-in-LINE buttons. The seller can verify the link
  // is correct before sending, and can fall back to any channel (email,
  // SMS, manual paste) if LINE doesn't behave on their device.
  async function handleShareLine(inv: Invoice) {
    if (inv.status === 'cancelled') return;
    setSharingLine(inv.id);
    setShareCopied(false);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/share-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json() as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? 'Failed');
      setShareModal({ invoiceNumber: inv.invoiceNumber, url: body.url });
    } catch (e) {
      alert(isThai ? `สร้างลิงก์ไม่สำเร็จ: ${(e as Error).message}` : `Failed: ${(e as Error).message}`);
    } finally {
      setSharingLine(null);
    }
  }

  async function copyShareLink() {
    if (!shareModal) return;
    try {
      await navigator.clipboard.writeText(shareModal.url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      // Some browsers (older Safari, embedded webviews) block clipboard
      // writes silently. Fall back to selecting the input so the user can
      // Cmd/Ctrl-C.
      const input = document.getElementById('share-url-input') as HTMLInputElement | null;
      input?.select();
    }
  }

  function openShareInLine() {
    if (!shareModal) return;
    const message = isThai
      ? `${shareModal.invoiceNumber}\nดูใบกำกับและชำระเงินได้ที่นี่:\n${shareModal.url}`
      : `${shareModal.invoiceNumber}\nView invoice and pay here:\n${shareModal.url}`;
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  async function handleSubmitRD(inv: Invoice) {
    const msg = isThai
      ? `ยืนยันส่งใบกำกับ ${inv.invoiceNumber} ให้กรมสรรพากร?`
      : `Submit invoice ${inv.invoiceNumber} to Revenue Department?`;
    if (!window.confirm(msg)) return;

    setSubmittingRD(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/submit-rd`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed');
      }
      fetchInvoices(pagination.page);
    } catch (e) {
      alert(isThai ? `เกิดข้อผิดพลาด: ${(e as Error).message}` : `Error: ${(e as Error).message}`);
    } finally {
      setSubmittingRD(null);
    }
  }

  async function handleCancelInvoice() {
    if (!cancelModal || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/invoices/${cancelModal.invoice.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const json = await res.json() as { message?: string; rdError?: string };
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Failed');

      setCancelModal(null);
      setCancelReason('');
      fetchInvoices(pagination.page);

      // Show toast-style success message
      const rdWarning = json.rdError ? `\n\n${isThai ? 'หมายเหตุ: ' : 'Note: '}${json.rdError}` : '';
      alert(`${json.message ?? (isThai ? 'ยกเลิกสำเร็จ' : 'Cancelled successfully')}${rdWarning}`);
    } catch (e) {
      alert(isThai ? `เกิดข้อผิดพลาด: ${(e as Error).message}` : `Error: ${(e as Error).message}`);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionSubNav
        items={[
          { key: 'quotations', to: '/app/quotations', label: isThai ? 'ใบเสนอราคา' : 'Quotations', icon: FileText },
          { key: 'delivery-notes', to: '/app/delivery-notes', label: isThai ? 'ใบส่งของ' : 'Delivery Notes', icon: Truck },
          { key: 'recurring', to: '/app/recurring-invoices', label: isThai ? 'วางบิลซ้ำ' : 'Recurring', icon: CalendarClock },
          { key: 'invoices', to: '/app/invoices', label: isThai ? 'ใบกำกับภาษี/ใบเสร็จ' : 'Tax Invoices', icon: Receipt },
        ]}
      />
      {/* Header */}
      <PageHeader
        eyebrow={isThai ? 'Revenue document workspace' : 'Revenue document workspace'}
        title={t('invoice.list')}
        description={isThai ? 'ออกเอกสาร T01-T05, ตรวจสถานะชำระเงิน และส่ง RD จากมุมมองเดียวที่อ่านง่าย' : 'Issue T01-T05 documents, track payment state, and submit to RD from one readable workspace.'}
        icon={<FileText className="h-3.5 w-3.5" />}
        mascot="spot"
        actions={(
          <Link to="/app/invoices/new" className={`btn-primary shrink-0 ${policy?.canCreateInvoice === false ? 'pointer-events-none opacity-50' : ''}`}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('invoice.create')}</span>
            <span className="sm:hidden">{isThai ? 'สร้าง' : 'New'}</span>
          </Link>
        )}
      />

      {policy && (
        <MetricCard
          label={isThai ? `แพ็กเกจ ${policy.planLabel}` : `${policy.planLabel} plan`}
          value={`${policy.usage.documentsThisMonth}${policy.maxDocumentsPerMonth ? ` / ${policy.maxDocumentsPerMonth}` : ''}`}
          detail={isThai ? 'เอกสารที่ใช้ในเดือนนี้' : 'Documents used this month'}
          tone="primary"
        />
      )}

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 w-full sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t('invoice.search')} className="input-field pl-9"
            />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as InvoiceType | 'all')} className="input-field w-auto">
            <option value="all">{isThai ? 'ทุกประเภท' : 'All Types'}</option>
            {(Object.keys(TYPE_LABELS) as InvoiceType[]).map((t) => (
              <option key={t} value={t}>{isThai ? TYPE_LABELS[t].th : TYPE_LABELS[t].en}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | 'all')} className="input-field w-auto">
            <option value="all">{t('invoice.filter.all')}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{t(`invoice.status.${s}`)}</option>
            ))}
          </select>
          {projects.length > 0 && (
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="input-field w-auto">
              <option value="">{isThai ? 'ทุกโปรเจค' : 'All projects'}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
              ))}
            </select>
          )}
          <div className="relative" ref={exportRef}>
            <button onClick={() => setExportOpen(!exportOpen)} className="btn-secondary gap-2" disabled={exporting !== null || !policy?.canExportExcel}>
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {t('common.export')}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20">
                <button onClick={handleExcelExport} disabled={!policy?.canExportExcel} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  {isThai ? 'ส่งออก Excel (.xlsx)' : 'Export Excel (.xlsx)'}
                </button>
                <button onClick={handleSheetsExport} disabled={!policy?.canExportGoogleSheets} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  <ExternalLink className="w-4 h-4 text-blue-600" />
                  {isThai ? 'ส่งออก Google Sheets' : 'Export to Google Sheets'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile card list — shown only below sm breakpoint */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
          </div>
        ) : invoices.length === 0 ? (
          <EmptyState
            title={isThai ? 'ยังไม่มีเอกสารขาย' : 'No sales documents yet'}
            description={isThai ? 'เริ่มจากสร้างใบกำกับภาษีใบแรก แล้วใช้หน้านี้ติดตามสถานะชำระเงินและ RD' : 'Create your first invoice, then use this page to track payment and RD state.'}
            actionLabel={t('invoice.create')}
            actionHref="/app/invoices/new"
          />
        ) : (
          invoices.map((inv) => {
            const typeInfo = TYPE_LABELS[inv.type];
            const typeCode: Record<InvoiceType, string> = {
              tax_invoice_receipt: 'T01',
              tax_invoice: 'T02',
              receipt: 'T03',
              credit_note: 'T04',
              debit_note: 'T05',
            };
            const customerName = isThai
              ? (inv.buyer as { nameTh?: string })?.nameTh ?? '—'
              : (inv.buyer as { nameEn?: string; nameTh?: string })?.nameEn
                ?? (inv.buyer as { nameTh?: string })?.nameTh
                ?? '—';

            return (
              <div
                key={inv.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
              >
                {/* Row 1: type badge + invoice number + status */}
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${typeInfo.color}`}>
                    {typeCode[inv.type]}
                  </span>
                  <span className="font-semibold text-gray-900 font-mono text-sm flex-1 truncate">
                    {inv.invoiceNumber}
                  </span>
                  <span className={`${STATUS_COLORS[inv.status]} shrink-0`}>
                    {t(`invoice.status.${inv.status}`)}
                  </span>
                </div>

                {/* Row 2: customer name */}
                <p className="text-gray-600 text-sm mb-2 truncate">{customerName}</p>

                {/* Row 3: date + amount */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-400 text-xs">{formatDate(inv.invoiceDate)}</span>
                  <span className="font-bold text-primary-700 text-sm">{formatCurrency(inv.total)}</span>
                </div>
                {inv.project && (
                  <p className="mb-2 inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                    <BriefcaseBusiness className="h-3 w-3" />
                    {inv.project.code} · {inv.project.name}
                  </p>
                )}

                {/* Row 4: actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
                  {inv.pdfUrl ? (
                    <a
                      href={inv.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg px-3 py-1.5 font-medium"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </a>
                  ) : null}
                  <button
                    onClick={() => openPreview(inv)}
                    className="inline-flex items-center gap-1.5 text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg px-3 py-1.5 font-medium"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {isThai ? 'ดู/View' : 'View'}
                  </button>
                  {canCreateRecurringFromInvoice(inv) && (
                    <button
                      onClick={() => openRecurringModal(inv)}
                      className="inline-flex items-center gap-1.5 text-xs border border-indigo-100 text-indigo-600 hover:bg-indigo-50 rounded-lg px-3 py-1.5 font-medium"
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      {isThai ? 'ทำซ้ำ' : 'Repeat'}
                    </button>
                  )}
                  {inv.status !== 'cancelled' && (
                    <button
                      onClick={() => handleShareLine(inv)}
                      disabled={sharingLine === inv.id}
                      className="inline-flex items-center gap-1.5 text-xs border border-green-200 text-green-700 hover:bg-green-50 rounded-lg px-3 py-1.5 font-medium disabled:opacity-50"
                    >
                      {sharingLine === inv.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <MessageCircle className="w-3.5 h-3.5" />}
                      {isThai ? 'ส่ง LINE' : 'LINE'}
                    </button>
                  )}
                  <Link
                    to={`/app/invoices/${inv.id}/edit`}
                    className="ml-auto inline-flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 font-medium"
                  >
                    {t('common.edit')}
                  </Link>
                </div>
              </div>
            );
          })
        )}

        {/* Mobile pagination */}
        {!loading && invoices.length > 0 && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-gray-400">
              {invoices.length} / {pagination.total} {isThai ? 'รายการ' : 'items'}
            </span>
            <div className="flex gap-1">
              <button
                className="btn-secondary px-2 py-1 text-xs"
                disabled={pagination.page <= 1}
                onClick={() => fetchInvoices(pagination.page - 1)}
              >
                {t('common.previous')}
              </button>
              <button className="px-2 py-1 text-xs font-medium bg-primary-600 text-white rounded">
                {pagination.page}
              </button>
              <button
                className="btn-secondary px-2 py-1 text-xs"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchInvoices(pagination.page + 1)}
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table — hidden on mobile */}
      <div className="hidden sm:block card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header" scope="col">{isThai ? 'เลขที่' : 'Number'}</th>
                <th className="table-header hidden sm:table-cell" scope="col">{isThai ? 'ประเภท' : 'Type'}</th>
                <th className="table-header" scope="col">{t('customer.title')}</th>
                <th className="table-header hidden sm:table-cell" scope="col">{t('invoice.date')}</th>
                <th className="table-header hidden lg:table-cell" scope="col">{isThai ? 'โปรเจค' : 'Project'}</th>
                <th className="table-header text-right" scope="col">{t('common.amount')}</th>
                <th className="table-header hidden sm:table-cell" scope="col">{isThai ? 'ชำระแล้ว' : 'Payment'}</th>
                <th className="table-header" scope="col">{t('common.status')}</th>
                <th className="table-header hidden sm:table-cell" scope="col">{isThai ? 'ส่ง RD' : 'RD Submit'}</th>
                <th className="table-header" scope="col">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={10} className="text-center py-12">
                  <Loader2 className="w-8 h-8 mx-auto animate-spin text-gray-300" />
                </td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={10} className="py-12">
                  <EmptyState
                    title={isThai ? 'ยังไม่มีเอกสารขาย' : 'No sales documents yet'}
                    description={isThai ? 'สร้างเอกสารแรกเพื่อเริ่ม tracking การชำระเงินและการส่ง RD' : 'Create the first document to start tracking payment and RD submissions.'}
                    actionLabel={t('invoice.create')}
                    actionHref="/app/invoices/new"
                  />
                </td></tr>
              ) : (
                invoices.map((inv) => {
                  const typeInfo = TYPE_LABELS[inv.type];
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <div className="font-mono text-xs font-medium">{inv.invoiceNumber}</div>
                        {inv.referenceDocNumber && (
                          <div className="text-xs text-gray-400">อ้างอิง: {inv.referenceDocNumber}</div>
                        )}
                      </td>
                      <td className="table-cell hidden sm:table-cell">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeInfo.color}`}>
                          {isThai ? typeInfo.th : typeInfo.en}
                        </span>
                      </td>
                      <td className="table-cell">
                        {isThai
                          ? (inv.buyer as { nameTh?: string })?.nameTh ?? '—'
                          : (inv.buyer as { nameEn?: string; nameTh?: string })?.nameEn ?? (inv.buyer as { nameTh?: string })?.nameTh ?? '—'}
                      </td>
                      <td className="table-cell text-gray-500 hidden sm:table-cell">{formatDate(inv.invoiceDate)}</td>
                      <td className="table-cell hidden lg:table-cell">
                        {inv.project ? (
                          <Link to={`/app/projects/${inv.project.id}`} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200">
                            <BriefcaseBusiness className="h-3 w-3" />
                            {inv.project.code}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="table-cell text-right font-semibold">{formatCurrency(inv.total)}</td>
                      <td className="table-cell hidden sm:table-cell">
                        {inv.isPaid ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle className="w-3.5 h-3.5" />
                            {isThai ? 'ชำระแล้ว' : 'Paid'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                            <Clock className="w-3.5 h-3.5" />
                            {isThai ? 'ค้างชำระ' : 'Unpaid'}
                          </span>
                        )}
                      </td>
                      <td className="table-cell">
                        <span className={STATUS_COLORS[inv.status]}>
                          {t(`invoice.status.${inv.status}`)}
                        </span>
                      </td>
                      <td className="table-cell hidden sm:table-cell">
                        <div className="flex flex-col gap-1">
                          {inv.rdSubmissionStatus ? (() => {
                            const s = inv.rdSubmissionStatus;
                            const color = s === 'success' ? 'success' : s === 'pending' ? 'warning' : s === 'failed' ? 'error' : 'info';
                            const label = s === 'success' ? (isThai ? 'ส่งสำเร็จ' : 'Accepted') :
                                          s === 'pending' ? (isThai ? 'รอส่ง' : 'Pending') :
                                          s === 'failed' ? (isThai ? 'ส่งไม่สำเร็จ' : 'Failed') :
                                          s === 'in_progress' ? (isThai ? 'กำลังส่ง' : 'In Progress') :
                                          s === 'retrying' ? (isThai ? 'กำลังลองใหม่' : 'Retrying') :
                                          s;
                            return <span className={`badge-${color}`}>{label}</span>;
                          })() : (
                            <span className="text-gray-400 text-xs">{isThai ? 'ยังไม่ส่ง' : 'Not sent'}</span>
                          )}
                          {canSubmitRD(inv) && (
                            <button
                              onClick={() => handleSubmitRD(inv)}
                              disabled={submittingRD === inv.id}
                              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
                              title="ส่งให้กรมสรรพากร"
                            >
                              {submittingRD === inv.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Send className="w-3.5 h-3.5" />}
                              {isThai ? 'ส่ง RD' : 'Submit RD'}
                            </button>
                          )}
                          {!policy?.canSubmitToRD && (
                            <span className="text-[11px] text-amber-600">
                              {isThai ? 'อัปเกรดเพื่อส่ง RD' : 'Upgrade for RD'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link to={`/app/invoices/${inv.id}/edit`} className="text-xs text-primary-600 hover:underline">
                            {t('common.edit')}
                          </Link>
                          <button
                            onClick={() => openPreview(inv)}
                            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
                            title={isThai ? 'ดูตัวอย่าง' : 'Preview'}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{isThai ? 'ดู' : 'View'}</span>
                          </button>
                          {canCreateRecurringFromInvoice(inv) && (
                            <button
                              onClick={() => openRecurringModal(inv)}
                              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                              title={isThai ? 'สร้าง recurring invoice จากเอกสารนี้' : 'Create recurring invoice from this document'}
                            >
                              <CalendarClock className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{isThai ? 'ทำซ้ำ' : 'Repeat'}</span>
                            </button>
                          )}
                          {canIssueReceipt(inv) && (
                            <button
                              onClick={() => { setReceiptModal({ invoice: inv }); setReceiptForm({ paymentMethod: 'transfer', note: '', paidAt: new Date().toISOString().split('T')[0] }); }}
                              className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium"
                              title={isThai ? 'ออกใบเสร็จรับเงิน' : 'Issue Receipt'}
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{isThai ? 'ออกใบเสร็จ' : 'Receipt'}</span>
                            </button>
                          )}
                          {canRecordPayment(inv) && inv.type !== 'tax_invoice_receipt' && (
                            <button
                              onClick={() => openPaymentModal(inv)}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                              title={isThai ? 'บันทึกการรับชำระ' : 'Record Payment'}
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{isThai ? 'รับชำระ' : 'Pay'}</span>
                            </button>
                          )}
                          {policy?.canSendInvoiceEmail && inv.buyer?.email && (
                            <button
                              onClick={() => handleSendEmail(inv)}
                              disabled={sendingEmail === inv.id}
                              className={`inline-flex items-center gap-1 text-xs font-medium disabled:opacity-50 ${
                                emailJustSent[inv.id]
                                  ? 'text-emerald-600'
                                  : 'text-sky-600 hover:text-sky-800'
                              }`}
                              title={emailJustSent[inv.id]
                                ? (isThai ? `ส่งแล้วไปยัง ${inv.buyer.email}` : `Sent to ${inv.buyer.email}`)
                                : (isThai ? `ส่งอีเมลไปยัง ${inv.buyer.email}` : `Email to ${inv.buyer.email}`)}
                            >
                              {sendingEmail === inv.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : emailJustSent[inv.id]
                                  ? <CheckCircle className="w-3.5 h-3.5" />
                                  : <Mail className="w-3.5 h-3.5" />}
                              <span className="hidden sm:inline">
                                {emailJustSent[inv.id]
                                  ? (isThai ? 'ส่งแล้ว' : 'Sent')
                                  : (isThai ? 'ส่งอีเมล' : 'Email')}
                              </span>
                            </button>
                          )}
                          {inv.status !== 'cancelled' && (
                            <button
                              onClick={() => handleShareLine(inv)}
                              disabled={sharingLine === inv.id}
                              className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-800 disabled:opacity-50"
                              title={isThai ? 'สร้างลิงก์แล้วเปิด LINE เพื่อส่งให้ลูกค้า' : 'Create a link and open LINE to send to customer'}
                            >
                              {sharingLine === inv.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <MessageCircle className="w-3.5 h-3.5" />}
                              <span className="hidden sm:inline">{isThai ? 'ส่ง LINE' : 'LINE'}</span>
                            </button>
                          )}
                          {canCancelInvoice(inv) && (
                            <button
                              onClick={() => { setCancelModal({ invoice: inv }); setCancelReason(''); }}
                              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium"
                              title={isThai ? 'ยกเลิกเอกสาร' : 'Cancel Invoice'}
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{isThai ? 'ยกเลิก' : 'Cancel'}</span>
                            </button>
                          )}
                          {inv.pdfUrl && (
                            <a
                              href={inv.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">PDF</span>
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {t('pagination.showing')} {invoices.length} {t('pagination.of')} {pagination.total} {t('pagination.entries')}
          </span>
          <div className="flex gap-1">
            <button className="btn-secondary px-2 py-1 text-xs" disabled={pagination.page <= 1} onClick={() => fetchInvoices(pagination.page - 1)}>
              {t('common.previous')}
            </button>
            <button className="px-2 py-1 text-xs font-medium bg-primary-600 text-white rounded">{pagination.page}</button>
            <button className="btn-secondary px-2 py-1 text-xs" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchInvoices(pagination.page + 1)}>
              {t('common.next')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Create Recurring Schedule Modal ── */}
      {recurringModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-indigo-600" />
                  {isThai ? 'สร้าง recurring จาก invoice เดิม' : 'Create recurring schedule'}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {isThai ? 'คัดลอกลูกค้า รายการสินค้า ยอดเงิน และเงื่อนไขจากเอกสารนี้' : 'Copies customer, line items, totals, and payment settings from this invoice.'}
                </p>
              </div>
              <button onClick={() => setRecurringModal(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" disabled={creatingRecurring}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl bg-gray-50 p-3 text-sm space-y-1">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">{isThai ? 'ต้นฉบับ' : 'Source'}</span>
                <span className="font-mono font-medium text-gray-900">{recurringModal.invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">{isThai ? 'ลูกค้า' : 'Customer'}</span>
                <span className="font-medium text-gray-900 text-right">
                  {isThai
                    ? recurringModal.invoice.buyer?.nameTh ?? recurringModal.invoice.buyer?.nameEn ?? '—'
                    : recurringModal.invoice.buyer?.nameEn ?? recurringModal.invoice.buyer?.nameTh ?? '—'}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-base font-semibold">
                <span>{isThai ? 'ยอดต่อรอบ' : 'Per run'}</span>
                <span className="text-primary-600">{formatCurrency(recurringModal.invoice.total)}</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="block text-sm font-medium text-gray-700 mb-1">{isThai ? 'ชื่อรอบวางบิล' : 'Schedule name'}</span>
                <input
                  value={recurringForm.name}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field w-full"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{isThai ? 'ความถี่' : 'Frequency'}</span>
                <select
                  value={recurringForm.frequency}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, frequency: e.target.value as RecurringSeedForm['frequency'] }))}
                  className="input-field w-full"
                >
                  <option value="weekly">{isThai ? 'รายสัปดาห์' : 'Weekly'}</option>
                  <option value="monthly">{isThai ? 'รายเดือน' : 'Monthly'}</option>
                  <option value="quarterly">{isThai ? 'รายไตรมาส' : 'Quarterly'}</option>
                  <option value="yearly">{isThai ? 'รายปี' : 'Yearly'}</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{isThai ? 'ทุกกี่รอบ' : 'Every'}</span>
                <input
                  type="number"
                  min={1}
                  max={36}
                  value={recurringForm.interval}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, interval: Number(e.target.value) }))}
                  className="input-field w-full"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{isThai ? 'สร้างครั้งถัดไป' : 'Next run date'}</span>
                <input
                  type="date"
                  value={recurringForm.nextRunDate}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, nextRunDate: e.target.value }))}
                  className="input-field w-full"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{isThai ? 'กำหนดชำระ (วัน)' : 'Due days'}</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={recurringForm.dueDays}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, dueDays: e.target.value === '' ? '' : Number(e.target.value) }))}
                  placeholder={isThai ? 'ไม่กำหนด' : 'No due date'}
                  className="input-field w-full"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{isThai ? 'จำนวนครั้งสูงสุด' : 'Max runs'}</span>
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={recurringForm.maxRuns}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, maxRuns: e.target.value === '' ? '' : Number(e.target.value) }))}
                  placeholder={isThai ? 'ไม่จำกัด' : 'Unlimited'}
                  className="input-field w-full"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{isThai ? 'สิ้นสุดวันที่' : 'End date'}</span>
                <input
                  type="date"
                  value={recurringForm.endDate}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="input-field w-full"
                />
              </label>
            </div>

            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {isThai
                ? 'ระบบจะสร้างเป็น draft invoice เท่านั้น ยังไม่ออกเลขจริงและยังไม่ส่ง RD จนกว่าจะกดออกเอกสาร'
                : 'This creates draft invoices only. It will not issue a final number or submit to RD until you issue the document.'}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setRecurringModal(null)} className="btn-secondary flex-1" disabled={creatingRecurring}>
                {t('common.cancel')}
              </button>
              <button onClick={handleCreateRecurringFromInvoice} className="btn-primary flex-1" disabled={creatingRecurring || !recurringForm.nextRunDate}>
                {creatingRecurring ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                {isThai ? 'สร้างรอบวางบิล' : 'Create schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Issue Receipt Modal ── */}
      {receiptModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-green-600" />
              {isThai ? 'ออกใบเสร็จรับเงิน' : 'Issue Receipt'}
            </h2>

            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">{isThai ? 'ใบกำกับภาษีเดิม' : 'Tax Invoice'}</span>
                <span className="font-mono font-medium">{receiptModal.invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{isThai ? 'ลูกค้า' : 'Customer'}</span>
                <span className="font-medium">
                  {isThai
                    ? (receiptModal.invoice.buyer as { nameTh?: string })?.nameTh
                    : (receiptModal.invoice.buyer as { nameEn?: string; nameTh?: string })?.nameEn ?? (receiptModal.invoice.buyer as { nameTh?: string })?.nameTh}
                </span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>{isThai ? 'ยอดรวม' : 'Total'}</span>
                <span className="text-primary-600">{formatCurrency(receiptModal.invoice.total)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isThai ? 'วันที่รับชำระ' : 'Payment Date'}
                </label>
                <input
                  type="date" value={receiptForm.paidAt}
                  onChange={(e) => setReceiptForm((f) => ({ ...f, paidAt: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isThai ? 'วิธีชำระเงิน' : 'Payment Method'}
                </label>
                <select
                  value={receiptForm.paymentMethod}
                  onChange={(e) => setReceiptForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                  className="input-field"
                >
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isThai ? 'หมายเหตุ' : 'Note'} ({isThai ? 'ถ้ามี' : 'optional'})
                </label>
                <input
                  type="text" value={receiptForm.note}
                  onChange={(e) => setReceiptForm((f) => ({ ...f, note: e.target.value }))}
                  className="input-field" placeholder={isThai ? 'เช่น เลข slip โอนเงิน' : 'e.g. transfer slip no.'}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setReceiptModal(null)} className="btn-secondary flex-1" disabled={issuingReceipt}>
                {t('common.cancel')}
              </button>
              <button onClick={handleIssueReceipt} className="btn-primary flex-1" disabled={issuingReceipt}>
                {issuingReceipt ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (isThai ? 'ออกใบเสร็จ' : 'Issue Receipt')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Share Link Modal (LINE / Copy / any channel) ── */}
      {shareModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShareModal(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-green-600" />
                <span className="font-semibold text-gray-900 text-sm">
                  {isThai ? `ส่ง ${shareModal.invoiceNumber} ให้ลูกค้า` : `Share ${shareModal.invoiceNumber}`}
                </span>
              </div>
              <button onClick={() => setShareModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-500">
                {isThai
                  ? 'ลิงก์นี้อยู่ได้ 30 วัน ส่งให้ลูกค้าผ่าน LINE, email, หรือ SMS ลูกค้าเปิดดูใบกำกับและสแกน PromptPay จ่ายเงินได้ทันที'
                  : 'Link valid 30 days. Send via LINE, email, or SMS. The buyer can view + pay via PromptPay.'}
              </p>

              {/* Primary action: COPY. This is the path that always works
                  end-to-end. Users had repeated failures with the LINE
                  share dialog because LINE web "ส่ง" doesn't actually
                  deliver to chats they aren't already active in. */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  {isThai ? '1. คัดลอกลิงก์' : '1. Copy the link'}
                </p>
                <div className="flex items-stretch gap-2">
                  <input
                    id="share-url-input"
                    readOnly
                    value={shareModal.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                  />
                  <button
                    onClick={copyShareLink}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap ${
                      shareCopied ? 'bg-emerald-100 text-emerald-700' : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    {shareCopied ? (isThai ? 'คัดลอกแล้ว' : 'Copied') : (isThai ? 'คัดลอก' : 'Copy')}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  {isThai ? '2. เปิด LINE แชทลูกค้า แล้ววางลิงก์' : '2. Open LINE chat with the customer, then paste'}
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {isThai
                    ? 'วิธีนี้ส่งถึงลูกค้าแน่นอน ไม่หาย'
                    : 'This method always reaches the buyer.'}
                </p>
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-2">
                <p className="text-xs text-slate-500">
                  {isThai ? 'หรือ ทางเลือก (อาจไม่ทำงานเสมอ):' : 'Alternative (may not always work):'}
                </p>
                <button
                  onClick={openShareInLine}
                  className="w-full inline-flex items-center justify-center gap-2 border border-green-300 text-green-700 hover:bg-green-50 font-semibold py-2 rounded-lg text-sm"
                >
                  <MessageCircle className="w-4 h-4" />
                  {isThai ? 'เปิด LINE share dialog' : 'Open LINE share dialog'}
                </button>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {isThai
                    ? 'LINE web ส่งให้ลูกค้าได้เฉพาะคนที่เคยแชทกันมาก่อน และต้องกดปุ่ม "ส่ง" สีเขียวที่ล่างสุดให้ครบ — ถ้าไม่ขึ้นในแชทลูกค้า ให้ใช้วิธี Copy → วาง'
                    : 'LINE web only delivers to chats you have an active history with. You must tap the green "Send" button at the bottom. If the message does not appear, use Copy + paste instead.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Popup ── */}
      {previewModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closePreview}>
          <div
            className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: '860px', maxWidth: '95vw', height: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary-600" />
                <span className="font-semibold text-gray-900 text-sm">{previewModal.invoiceNumber}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  className="btn-secondary text-xs py-1.5 inline-flex items-center gap-1.5"
                >
                  {pdfLoading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Download className="w-3.5 h-3.5" />}
                  {isThai ? 'ดาวน์โหลด PDF' : 'Download PDF'}
                </button>
                <button onClick={closePreview} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 bg-gray-50 overflow-hidden">
              {previewError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-red-600">
                  <span className="text-sm font-medium">โหลด preview ไม่สำเร็จ: {previewError}</span>
                  <button onClick={() => openPreview(previewModal)} className="btn-secondary text-xs">
                    ลองใหม่
                  </button>
                </div>
              ) : previewBlobUrl ? (
                <iframe
                  src={previewBlobUrl}
                  className="w-full h-full border-0"
                  title={previewModal.invoiceNumber}
                  sandbox="allow-same-origin allow-scripts"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-xs">{isThai ? 'กำลังโหลดเอกสาร...' : 'Loading document...'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Record Payment Modal ── */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              {isThai ? 'บันทึกการรับชำระเงิน' : 'Record Payment'}
            </h2>

            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <div className="flex justify-between font-semibold">
                <span>{paymentModal.invoice.invoiceNumber}</span>
                <span className="text-primary-600">{formatCurrency(paymentModal.invoice.total)}</span>
              </div>
            </div>

            {payments.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500">{isThai ? 'ประวัติการชำระ' : 'Payment History'}</p>
                {payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                    <span>{formatDate(p.paidAt)} · {PAYMENT_METHODS[p.method] ?? p.method}</span>
                    <span className="font-medium">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isThai ? 'จำนวนเงิน' : 'Amount'}</label>
                <input type="number" value={paymentForm.amount} min={0}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, amount: Number(e.target.value) }))}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isThai ? 'วิธีชำระ' : 'Method'}</label>
                <select value={paymentForm.method}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}
                  className="input-field">
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isThai ? 'เลขอ้างอิง / Slip' : 'Reference'}</label>
                <input type="text" value={paymentForm.reference}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
                  className="input-field" placeholder="Ref / Slip no." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isThai ? 'วันที่ชำระ' : 'Paid Date'}</label>
                <input type="date" value={paymentForm.paidAt}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, paidAt: e.target.value }))}
                  className="input-field" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setPaymentModal(null)} className="btn-secondary flex-1" disabled={savingPayment}>
                {t('common.cancel')}
              </button>
              <button onClick={handleSavePayment} className="btn-primary flex-1" disabled={savingPayment}>
                {savingPayment ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (isThai ? 'บันทึก' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Invoice Modal ── */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              {isThai ? 'ยกเลิกเอกสาร' : 'Cancel Invoice'}
            </h2>

            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">{isThai ? 'เลขที่เอกสาร' : 'Document No.'}</span>
                <span className="font-mono font-medium">{cancelModal.invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{isThai ? 'ประเภท' : 'Type'}</span>
                <span className="font-medium">
                  {isThai ? TYPE_LABELS[cancelModal.invoice.type].th : TYPE_LABELS[cancelModal.invoice.type].en}
                </span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>{isThai ? 'ยอดรวม' : 'Total'}</span>
                <span className="text-primary-600">{formatCurrency(cancelModal.invoice.total)}</span>
              </div>
            </div>

            {cancelModal.invoice.rdSubmissionStatus === 'success' && (
              <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${
                isThai ? 'bg-amber-50 text-amber-800' : 'bg-amber-50 text-amber-800'
              }`}>
                <Ban className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  {isThai
                    ? 'เอกสารนี้ส่งไป กรมสรรพากร แล้ว ระบบจะแจ้งยกเลิกไปยัง กรมสรรพากร ด้วย'
                    : 'This document was submitted to the Revenue Department. A cancellation will also be sent to RD.'}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isThai ? 'เหตุผลในการยกเลิก' : 'Reason for Cancellation'} *
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="input-field resize-none"
                placeholder={isThai ? 'ระบุเหตุผล เช่น ลูกค้าขอยกเลิก / สินค้าชำรุด' : 'Enter reason, e.g. customer requested cancellation'}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setCancelModal(null)} className="btn-secondary flex-1" disabled={cancelling}>
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCancelInvoice}
                className="btn-primary flex-1 bg-red-600 hover:bg-red-700 focus:ring-red-500"
                disabled={cancelling || !cancelReason.trim()}
              >
                {cancelling
                  ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  : (isThai ? 'ยกเลิกเอกสาร' : 'Cancel Invoice')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
