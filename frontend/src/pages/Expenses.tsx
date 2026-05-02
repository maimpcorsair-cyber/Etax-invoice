import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Edit2, Trash2, X, Save, Loader2, Wallet,
  AlertTriangle, Send, ThumbsUp, ThumbsDown,
  Link as LinkIcon, Image as ImageIcon, FileText, PlusCircle, MinusCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import type { ExpenseVoucher, ExpenseVoucherStatus, AttachmentFileType, EvidenceType, PettyCash } from '../types';

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
  const { formatCurrency, formatDate } = useLanguage();
  const { token, user } = useAuthStore();
  const { policy } = useCompanyAccessPolicy();

  const [vouchers, setVouchers] = useState<ExpenseVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(startOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState<ExpenseVoucherStatus | 'all'>('all');
  const [expenseLimit, setExpenseLimit] = useState<number | null>(null);
  const [pettyCash, setPettyCash] = useState<PettyCash | null>(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ExpenseVoucher | null>(null);
  const [voucherDate, setVoucherDate] = useState(todayIso());
  const [voucherDesc, setVoucherDesc] = useState('');
  const [voucherNotes, setVoucherNotes] = useState('');
  const [items, setItems] = useState<ItemForm[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState('');
  const [rejectionNote, setRejectionNote] = useState('');

  const isFreePlan = policy?.plan === 'free';
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('dateFrom', from);
      if (to) params.set('dateTo', to);
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const [vRes, sRes, pcRes] = await Promise.all([
        fetch(`/api/expenses?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/expenses/settings', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/expenses/petty-cash', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const vJson = await vRes.json();
      const sJson = await sRes.json();
      const pcJson = await pcRes.json();
      setVouchers(vJson.data ?? []);
      setExpenseLimit(sJson.data?.expenseLimit ?? null);
      setPettyCash(pcJson.data ?? null);
    } catch {
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, search, statusFilter, token]);

  useEffect(() => {
    const timer = setTimeout(fetchVouchers, 300);
    return () => clearTimeout(timer);
  }, [fetchVouchers]);

  const totalAmount = vouchers.reduce((s, v) => s + Number(v.totalAmount), 0);
  const draftCount = vouchers.filter((v) => v.status === 'draft').length;
  const submittedCount = vouchers.filter((v) => v.status === 'submitted').length;
  const approvedCount = vouchers.filter((v) => v.status === 'approved').length;

  function statusBadgeClass(status: ExpenseVoucherStatus) {
    if (status === 'draft') return 'badge-info';
    if (status === 'submitted') return 'badge-warning';
    if (status === 'approved') return 'badge-success';
    return 'badge-danger';
  }

  function openCreate() {
    if (isFreePlan) {
      setError(t('expenses.limitExceeded', { limit: 0 }));
      return;
    }
    setEditing(null);
    setVoucherDate(todayIso());
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
    if (!confirm(t('common.confirm') + '?')) return;
    await fetch(`/api/expenses/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
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

  async function handleApprove(id: string) {
    setError('');
    try {
      const res = await fetch(`/api/expenses/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json();
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary-600" />
            {t('expenses.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {expenseLimit !== null
              ? `${t('expenses.expenseLimit')}: ${formatCurrency(expenseLimit)}`
              : t('expenses.noLimit')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Petty cash balance chip */}
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
            <Wallet className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-emerald-800">{formatCurrency(pettyCash?.balance ?? 0)}</span>
            {isAdmin && (
              <button
                onClick={() => { setTopUpAmount(''); setShowTopUpModal(true); }}
                className="ml-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 underline"
              >
                {t('expenses.topUp', 'Top Up')}
              </button>
            )}
          </div>
        <button onClick={openCreate} className="btn-primary" disabled={isFreePlan}>
          <Plus className="w-4 h-4" />
          {t('expenses.newVoucher')}
        </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: t('common.total'), value: vouchers.length, amount: formatCurrency(totalAmount), tone: 'bg-blue-50 text-blue-700' },
          { label: t('expenses.status.draft'), value: draftCount, tone: 'bg-gray-50 text-gray-700' },
          { label: t('expenses.status.submitted'), value: submittedCount, tone: 'bg-amber-50 text-amber-700' },
          { label: t('expenses.status.approved'), value: approvedCount, tone: 'bg-green-50 text-green-700' },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-lg px-3 py-2 ${stat.tone}`}>
            <p className="text-[11px] font-medium opacity-80">{stat.label}</p>
            <p className="text-lg font-bold">{stat.value}</p>
            {stat.amount && <p className="text-xs font-medium mt-0.5">{stat.amount}</p>}
          </div>
        ))}
      </div>

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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
        </div>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
        ) : vouchers.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-500">
            <Wallet className="w-10 h-10 mb-2 text-gray-300" />
            {t('expenses.noItems')}
          </div>
        ) : (
          vouchers.map((v) => (
            <div key={v.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-2">
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
                <span className="text-xs text-gray-400">{t('expenses.total')}</span>
                <span className="font-bold text-primary-700">{formatCurrency(v.totalAmount)}</span>
              </div>
              {v.rejectionNote && (
                <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{v.rejectionNote}</p>
              )}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {v.status === 'draft' && (
                  <>
                    <button onClick={() => openEdit(v)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100">
                      <Edit2 className="w-3.5 h-3.5" /> {t('common.edit')}
                    </button>
                    <button onClick={() => handleSubmit(v.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100">
                      <Send className="w-3.5 h-3.5" /> {t('expenses.submit')}
                    </button>
                    <button onClick={() => handleDelete(v.id)} className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                {v.status === 'submitted' && isAdmin && (
                  <>
                    <button onClick={() => handleApprove(v.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100">
                      <ThumbsUp className="w-3.5 h-3.5" /> {t('expenses.approve')}
                    </button>
                    <button onClick={() => openReject(v.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100">
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
      <div className="card p-0 overflow-hidden hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{t('expenses.voucherNumber')}</th>
                <th className="table-header">{t('expenses.voucherDate')}</th>
                <th className="table-header">{t('expenses.description')}</th>
                <th className="table-header text-center">{t('expenses.expenseItem')}</th>
                <th className="table-header text-right">{t('expenses.total')}</th>
                <th className="table-header">{t('common.status')}</th>
                <th className="table-header">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-500" /></td></tr>
              ) : vouchers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-500">
                  <Wallet className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  {t('expenses.noItems')}
                </td></tr>
              ) : (
                vouchers.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="table-cell font-mono text-xs font-medium">{v.voucherNumber}</td>
                    <td className="table-cell text-gray-600 whitespace-nowrap">{formatDate(v.voucherDate)}</td>
                    <td className="table-cell text-gray-500 text-sm max-w-[200px] truncate">{v.description ?? '—'}</td>
                    <td className="table-cell text-center">{v.itemCount ?? 0}</td>
                    <td className="table-cell text-right font-semibold">{formatCurrency(v.totalAmount)}</td>
                    <td className="table-cell">
                      <span className={statusBadgeClass(v.status)}>{t(`expenses.status.${v.status}`)}</span>
                      {v.rejectionNote && (
                        <p className="text-[11px] text-red-500 mt-1 max-w-[150px] truncate" title={v.rejectionNote}>{v.rejectionNote}</p>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        {v.status === 'draft' && (
                          <>
                            <button onClick={() => openEdit(v)} className="p-1 text-primary-600 hover:text-primary-800" title={t('common.edit')}>
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleSubmit(v.id)} className="p-1 text-amber-600 hover:text-amber-800" title={t('expenses.submit')}>
                              <Send className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(v.id)} className="p-1 text-red-400 hover:text-red-600" title={t('common.delete')}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {v.status === 'submitted' && isAdmin && (
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
                  <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">{t('expenses.total')}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{formatCurrency(totalAmount)}</td>
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
                      <button
                        onClick={() => removeItem(idx)}
                        className="absolute top-2 right-2 p-1 text-red-400 hover:text-red-600"
                        title={t('expenses.removeItem')}
                      >
                        <MinusCircle className="w-4 h-4" />
                      </button>
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
                              <span className="text-gray-400">·</span>
                              <span className="text-gray-400">{t(`expenses.evidenceType.${att.evidenceType}`, att.evidenceType)}</span>
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
  );
}
