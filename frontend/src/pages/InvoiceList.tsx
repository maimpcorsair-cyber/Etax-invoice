import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus, Search, Download, FileText, FileSpreadsheet,
  ExternalLink, ChevronDown, Loader2, Receipt, CheckCircle, Clock, CreditCard, Send, Eye, X,
} from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { Invoice, InvoiceStatus, InvoiceType, Payment } from '../types';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import { isNative, savePdfNative, sharePdfNative } from '../hooks/useNative';

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

export default function InvoiceList() {
  const { t } = useTranslation();
  const { isThai, formatCurrency, formatDate } = useLanguage();
  const { token, user } = useAuthStore();
  const { policy } = useCompanyAccessPolicy();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<InvoiceType | 'all'>('all');
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

  const fetchInvoices = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);

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
  }, [search, statusFilter, typeFilter, token]);

  useEffect(() => {
    const t = setTimeout(() => fetchInvoices(1), 300);
    return () => clearTimeout(t);
  }, [fetchInvoices]);

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
        body: JSON.stringify({ search, status: statusFilter !== 'all' ? statusFilter : undefined }),
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

      if (isNative()) {
        // On Android/iOS: try to share first (user can save from share sheet)
        const shared = await sharePdfNative(blob, filename, previewModal.invoiceNumber);
        if (!shared) {
          // Fallback: save directly to Documents folder
          await savePdfNative(blob, filename);
          alert(isThai ? `บันทึก PDF แล้ว: ${filename}` : `PDF saved: ${filename}`);
        }
      } else {
        // Web: standard anchor download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('invoice.list')}</h1>
        <Link to="/app/invoices/new" className={`btn-primary shrink-0 ${policy?.canCreateInvoice === false ? 'pointer-events-none opacity-50' : ''}`}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('invoice.create')}</span>
          <span className="sm:hidden">{isThai ? 'สร้าง' : 'New'}</span>
        </Link>
      </div>

      {policy && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900">
          {isThai
            ? `แพ็กเกจปัจจุบัน: ${policy.planLabel} • ใช้เอกสารเดือนนี้ ${policy.usage.documentsThisMonth}${policy.maxDocumentsPerMonth ? ` / ${policy.maxDocumentsPerMonth}` : ''}`
            : `Current plan: ${policy.planLabel} • Documents this month: ${policy.usage.documentsThisMonth}${policy.maxDocumentsPerMonth ? ` / ${policy.maxDocumentsPerMonth}` : ''}`}
        </div>
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

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header" scope="col">{isThai ? 'เลขที่' : 'Number'}</th>
                <th className="table-header hidden sm:table-cell" scope="col">{isThai ? 'ประเภท' : 'Type'}</th>
                <th className="table-header" scope="col">{t('customer.title')}</th>
                <th className="table-header hidden sm:table-cell" scope="col">{t('invoice.date')}</th>
                <th className="table-header text-right" scope="col">{t('common.amount')}</th>
                <th className="table-header hidden sm:table-cell" scope="col">{isThai ? 'ชำระแล้ว' : 'Payment'}</th>
                <th className="table-header" scope="col">{t('common.status')}</th>
                <th className="table-header hidden sm:table-cell" scope="col">{isThai ? 'ส่ง RD' : 'RD Submit'}</th>
                <th className="table-header" scope="col">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12">
                  <Loader2 className="w-8 h-8 mx-auto animate-spin text-gray-300" />
                </td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-500">
                  <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  {t('common.noData')}
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
                          {inv.rdSubmissionStatus ? (
                            <span className={`badge-${
                              inv.rdSubmissionStatus === 'success' ? 'success' :
                              inv.rdSubmissionStatus === 'pending' ? 'warning' :
                              inv.rdSubmissionStatus === 'failed' ? 'error' : 'info'
                            }`}>
                              {t(`invoice.rdSubmission.${inv.rdSubmissionStatus}`)}
                            </span>
                          ) : (
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
    </div>
  );
}
