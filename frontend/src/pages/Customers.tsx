import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Edit2, UserX, FileText, X, Save, Loader2, Users, ReceiptText, Database, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { Customer } from '../types';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import { digitsOnly, englishTextOnly, guardedInputClass, inputGuide, isEnglishText, isFiveDigitBranchCode, isThaiText, isThirteenDigitId, thaiTextOnly } from '../lib/inputGuards';

const EMPTY_FORM: Omit<Customer, 'id' | 'companyId' | 'isActive' | 'createdAt'> = {
  nameTh: '',
  nameEn: '',
  taxId: '',
  branchCode: '00000',
  branchNameTh: '',
  branchNameEn: '',
  addressTh: '',
  addressEn: '',
  email: '',
  phone: '',
  contactPerson: '',
  personalId: '',
};

interface DbdLocalSuggestion {
  taxId: string;
  nameTh: string | null;
  nameEn: string | null;
  addressTh: string | null;
  branchCode: string;
  branchNameTh: string | null;
  branchNameEn: string | null;
  email: string | null;
  phone: string | null;
  contactPerson: string | null;
  status: string | null;
  juristicType: string | null;
  source: 'billboy-verified' | 'open-dbd' | 'rd-vat';
  lastSyncedAt: string | null;
  vatRegistered: boolean;
  vatName: string | null;
  vatAddress: string | null;
  vatLastSyncedAt: string | null;
  verifiedByThisCompany: boolean;
}

interface DbdLookupResponse {
  data?: {
    profile: DbdLocalSuggestion | null;
    verifiedProfile: DbdLocalSuggestion | null;
    openDataProfile: DbdLocalSuggestion | null;
  };
  error?: string;
}

interface DbdSearchResponse {
  data?: DbdLocalSuggestion[];
  error?: string;
}

export default function Customers() {
  const { t } = useTranslation();
  const { isThai } = useLanguage();
  const { token } = useAuthStore();
  const { policy } = useCompanyAccessPolicy();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dbdQuery, setDbdQuery] = useState('');
  const [dbdSuggestions, setDbdSuggestions] = useState<DbdLocalSuggestion[]>([]);
  const [dbdLoading, setDbdLoading] = useState(false);
  const [dbdNotice, setDbdNotice] = useState('');
  const [appliedDbdSuggestion, setAppliedDbdSuggestion] = useState<DbdLocalSuggestion | null>(null);
  const formValidation = {
    nameTh: form.nameTh.trim().length > 0 && !isThaiText(form.nameTh, true),
    nameEn: (form.nameEn ?? '').trim().length > 0 && !isEnglishText(form.nameEn ?? ''),
    taxId: form.taxId.length > 0 && !isThirteenDigitId(form.taxId),
    branchCode: (form.branchCode ?? '').length > 0 && !isFiveDigitBranchCode(form.branchCode ?? ''),
    branchNameTh: (form.branchNameTh ?? '').trim().length > 0 && !isThaiText(form.branchNameTh ?? ''),
    branchNameEn: (form.branchNameEn ?? '').trim().length > 0 && !isEnglishText(form.branchNameEn ?? ''),
    addressTh: form.addressTh.trim().length > 0 && !isThaiText(form.addressTh, true),
    addressEn: (form.addressEn ?? '').trim().length > 0 && !isEnglishText(form.addressEn ?? ''),
    personalId: !!form.personalId && form.personalId.length > 0 && !isThirteenDigitId(form.personalId),
  };

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/customers${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setCustomers(json.data ?? []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [search, token]);

  useEffect(() => {
    const t = setTimeout(fetchCustomers, 300);
    return () => clearTimeout(t);
  }, [fetchCustomers]);

  useEffect(() => {
    if (!showModal || !token) return;
    const trimmed = dbdQuery.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (trimmed.length < 3 && digits.length < 3) {
      setDbdSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setDbdLoading(true);
      try {
        const q = digits.length >= 3 ? digits : trimmed;
        const res = await fetch(`/api/dbd/local/search?q=${encodeURIComponent(q)}&limit=10`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const json = await res.json() as DbdSearchResponse;
        if (!res.ok) throw new Error(json.error ?? 'Search failed');
        setDbdSuggestions(json.data ?? []);
      } catch (err) {
        if (!controller.signal.aborted) {
          setDbdSuggestions([]);
          setDbdNotice(err instanceof Error ? err.message : 'Search failed');
        }
      } finally {
        if (!controller.signal.aborted) setDbdLoading(false);
      }
    }, 450);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [dbdQuery, showModal, token]);

  function resetDbdAssist() {
    setDbdQuery('');
    setDbdSuggestions([]);
    setDbdLoading(false);
    setDbdNotice('');
    setAppliedDbdSuggestion(null);
  }

  function openCreate() {
    if (policy && policy.maxCustomers !== null && policy.usage.customers >= policy.maxCustomers) {
      setError(isThai ? 'ถึงจำนวนลูกค้าสูงสุดของแพ็กเกจแล้ว' : 'You reached the customer limit for this plan');
      return;
    }
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    resetDbdAssist();
    setShowModal(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      nameTh: c.nameTh,
      nameEn: c.nameEn ?? '',
      taxId: c.taxId,
      branchCode: c.branchCode ?? '00000',
      branchNameTh: c.branchNameTh ?? '',
      branchNameEn: c.branchNameEn ?? '',
      addressTh: c.addressTh,
      addressEn: c.addressEn ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      contactPerson: c.contactPerson ?? '',
      personalId: c.personalId ?? '',
    });
    setError('');
    resetDbdAssist();
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.nameTh.trim() || formValidation.nameTh) { setError(isThai ? 'กรุณากรอกชื่อภาษาไทยให้ถูกต้อง' : 'Please enter a valid Thai name'); return; }
    if (form.taxId.length !== 13) { setError(isThai ? 'เลขผู้เสียภาษีต้องมี 13 หลัก' : 'Tax ID must be 13 digits'); return; }
    if (!form.addressTh.trim() || formValidation.addressTh) { setError(isThai ? 'กรุณากรอกที่อยู่ภาษาไทยให้ถูกต้อง' : 'Please enter a valid Thai address'); return; }

    setSaving(true);
    setError('');
    try {
      const url = editing ? `/api/customers/${editing.id}` : '/api/customers';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Save failed');
      }
      setShowModal(false);
      fetchCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm(isThai ? 'ยืนยันการปิดใช้งานลูกค้านี้?' : 'Deactivate this customer?')) return;
    await fetch(`/api/customers/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchCustomers();
  }

  const field = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function sourceLabel(suggestion: DbdLocalSuggestion) {
    if (suggestion.verifiedByThisCompany) return isThai ? 'ข้อมูลที่บริษัทนี้เคยยืนยัน' : 'Company verified';
    if (suggestion.vatRegistered) return isThai ? 'ข้อมูลเปิด + VAT' : 'Open data + VAT';
    return isThai ? 'ข้อมูลเปิด DBD' : 'Open DBD';
  }

  function formatSyncDate(value: string | null) {
    if (!value) return isThai ? 'ยังไม่ทราบวันอัปเดต' : 'No sync date';
    return new Date(value).toLocaleDateString(isThai ? 'th-TH' : 'en-US');
  }

  function applyDbdSuggestion(suggestion: DbdLocalSuggestion) {
    setForm((prev) => ({
      ...prev,
      nameTh: suggestion.nameTh ?? prev.nameTh,
      nameEn: suggestion.nameEn ?? prev.nameEn ?? '',
      taxId: suggestion.taxId || prev.taxId,
      branchCode: suggestion.branchCode ?? prev.branchCode ?? '00000',
      branchNameTh: suggestion.branchNameTh ?? prev.branchNameTh ?? '',
      branchNameEn: suggestion.branchNameEn ?? prev.branchNameEn ?? '',
      addressTh: suggestion.addressTh ?? suggestion.vatAddress ?? prev.addressTh,
      email: suggestion.email ?? prev.email ?? '',
      phone: suggestion.phone ?? prev.phone ?? '',
      contactPerson: suggestion.contactPerson ?? prev.contactPerson ?? '',
    }));
    setAppliedDbdSuggestion(suggestion);
    setDbdNotice(
      isThai
        ? `เติมข้อมูลจาก ${sourceLabel(suggestion)} แล้ว กรุณาตรวจอีกครั้งก่อนบันทึก`
        : `Applied ${sourceLabel(suggestion)}. Please review before saving.`,
    );
    setDbdQuery(suggestion.nameTh ?? suggestion.nameEn ?? suggestion.taxId);
    setDbdSuggestions([]);
  }

  async function lookupTaxIdFromOpenData() {
    if (!token || form.taxId.length !== 13) {
      setDbdNotice(isThai ? 'กรุณากรอกเลขผู้เสียภาษี 13 หลักก่อน' : 'Enter a 13-digit tax ID first');
      return;
    }

    setDbdLoading(true);
    setDbdNotice('');
    try {
      const res = await fetch(`/api/dbd/local/lookup?taxId=${encodeURIComponent(form.taxId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as DbdLookupResponse;
      if (!res.ok) throw new Error(json.error ?? 'Lookup failed');
      if (!json.data?.profile) {
        setDbdNotice(isThai ? 'ไม่พบข้อมูลใน cache เปิด กรอกเองต่อได้' : 'No open-data match. You can continue manually.');
        return;
      }
      applyDbdSuggestion(json.data.profile);
    } catch (err) {
      setDbdNotice(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setDbdLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('customer.title')}</h1>
        <button
          onClick={openCreate}
          className="btn-primary"
          disabled={!!policy && policy.maxCustomers !== null && policy.usage.customers >= policy.maxCustomers}
        >
          <Plus className="w-4 h-4" />
          {t('customer.add')}
        </button>
      </div>

      {policy && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900">
          {isThai
            ? `ลูกค้าในแพ็กเกจ ${policy.planLabel}: ${policy.usage.customers}${policy.maxCustomers ? ` / ${policy.maxCustomers}` : ''}`
            : `Customers on ${policy.planLabel}: ${policy.usage.customers}${policy.maxCustomers ? ` / ${policy.maxCustomers}` : ''}`}
        </div>
      )}

      {/* Search */}
      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('customer.search')}
            className="input-field pl-9"
          />
        </div>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-500">
            <Users className="w-10 h-10 mb-2 text-gray-300" />
            {t('common.noData')}
          </div>
        ) : (
          customers.map((c) => (
            <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-1">
              {/* Row 1: name + status badge */}
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-900 leading-snug">
                  {isThai ? c.nameTh : (c.nameEn ?? c.nameTh)}
                </p>
                <span className={`shrink-0 ${c.isActive ? 'badge-success' : 'badge-error'}`}>
                  {c.isActive ? t('common.active') : t('common.inactive')}
                </span>
              </div>
              {/* Row 2: subtitle name */}
              {isThai && c.nameEn && c.nameEn !== c.nameTh && (
                <p className="text-sm text-gray-500">{c.nameEn}</p>
              )}
              {!isThai && c.nameTh && (
                <p className="text-sm text-gray-500">{c.nameTh}</p>
              )}
              {/* Row 3: tax ID */}
              {c.taxId && (
                <p className="text-xs text-gray-400 font-mono">ID: {c.taxId}</p>
              )}
              {/* Row 4: actions */}
              <div className="flex items-center gap-2 pt-2">
                <Link
                  to={`/app/customers/${c.id}/statement`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {isThai ? 'เอกสาร' : 'Invoices'}
                </Link>
                <button
                  onClick={() => openEdit(c)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  {t('common.edit')}
                </button>
                {c.isActive && (
                  <button
                    onClick={() => handleDeactivate(c.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    {isThai ? 'ปิดใช้งาน' : 'Deactivate'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{isThai ? 'ชื่อ' : 'Name'}</th>
                <th className="table-header hidden sm:table-cell">{t('customer.taxId')}</th>
                <th className="table-header hidden sm:table-cell">{t('customer.phone')}</th>
                <th className="table-header hidden sm:table-cell">{t('customer.email')}</th>
                <th className="table-header">{t('common.status')}</th>
                <th className="table-header">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-500" />
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500">
                    <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">
                      <p className="font-medium">{isThai ? c.nameTh : (c.nameEn ?? c.nameTh)}</p>
                      {c.nameEn && isThai && <p className="text-xs text-gray-400">{c.nameEn}</p>}
                      {!isThai && <p className="text-xs text-gray-400">{c.nameTh}</p>}
                    </td>
                    <td className="table-cell font-mono text-xs hidden sm:table-cell">{c.taxId}</td>
                    <td className="table-cell text-gray-500 hidden sm:table-cell">{c.phone ?? '—'}</td>
                    <td className="table-cell text-gray-500 hidden sm:table-cell">{c.email ?? '—'}</td>
                    <td className="table-cell">
                      <span className={c.isActive ? 'badge-success' : 'badge-error'}>
                        {c.isActive ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Link
                          to={`/app/customers/${c.id}/statement`}
                          className="p-1 text-slate-600 hover:text-slate-900"
                          title={isThai ? 'ดู SOA / Statement' : 'View SOA / Statement'}
                        >
                          <ReceiptText className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1 text-primary-600 hover:text-primary-800"
                          title={t('common.edit')}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {c.isActive && (
                          <button
                            onClick={() => handleDeactivate(c.id)}
                            className="p-1 text-red-400 hover:text-red-600"
                            title={isThai ? 'ปิดใช้งาน' : 'Deactivate'}
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? t('customer.edit') : t('customer.add')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
              )}

              <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-teal-900">
                      <Database className="h-4 w-4" />
                      {isThai ? 'ช่วยเติมข้อมูลบริษัทจากข้อมูลเปิดฟรี' : 'Free open-data company autofill'}
                    </div>
                    <p className="mt-1 text-xs text-teal-700">
                      {isThai
                        ? 'ค้นจากข้อมูล DBD/RD ที่ sync ไว้ใน Billboy และข้อมูลลูกค้าที่บริษัทนี้เคยยืนยันแล้ว'
                        : 'Search Billboy local DBD/RD cache plus this company’s verified customer data.'}
                    </p>
                  </div>
                  {appliedDbdSuggestion && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-medium text-teal-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {sourceLabel(appliedDbdSuggestion)}
                    </span>
                  )}
                </div>

                <div className="mt-3 relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-500" />
                  <input
                    value={dbdQuery}
                    onChange={(e) => setDbdQuery(e.target.value)}
                    className="input-field pl-9 bg-white"
                    placeholder={isThai ? 'พิมพ์ชื่อบริษัทหรือเลขผู้เสียภาษีอย่างน้อย 3 ตัว...' : 'Type company name or at least 3 tax ID digits...'}
                  />
                  {dbdLoading && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-teal-500" />
                  )}
                </div>

                {dbdSuggestions.length > 0 && (
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-teal-100 bg-white shadow-sm">
                    {dbdSuggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.taxId}-${suggestion.branchCode}-${suggestion.source}`}
                        type="button"
                        onClick={() => applyDbdSuggestion(suggestion)}
                        className="w-full border-b border-slate-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-teal-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{suggestion.nameTh ?? suggestion.vatName ?? suggestion.taxId}</div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {suggestion.taxId} · {isThai ? 'สาขา' : 'branch'} {suggestion.branchCode}
                              {suggestion.vatRegistered ? ` · ${isThai ? 'จด VAT' : 'VAT registered'}` : ''}
                            </div>
                            {(suggestion.addressTh ?? suggestion.vatAddress) && (
                              <div className="mt-1 line-clamp-2 text-xs text-slate-500">{suggestion.addressTh ?? suggestion.vatAddress}</div>
                            )}
                          </div>
                          <span className="shrink-0 rounded-full bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700">
                            {sourceLabel(suggestion)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {dbdNotice && (
                  <p className="mt-2 text-xs text-teal-700">{dbdNotice}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('customer.nameTh')} *</label>
                  <input value={form.nameTh} onChange={(e) => field('nameTh', thaiTextOnly(e.target.value))} className={guardedInputClass(formValidation.nameTh)} placeholder="บริษัท ตัวอย่าง จำกัด" />
                  <p className={inputGuide(formValidation.nameTh)}>
                    {isThai ? 'ใช้ชื่อภาษาไทย เช่น บริษัท ตัวอย่าง จำกัด' : 'Thai only, e.g. บริษัท ตัวอย่าง จำกัด'}
                  </p>
                </div>
                <div>
                  <label className="label">{t('customer.nameEn')}</label>
                  <input value={form.nameEn} onChange={(e) => field('nameEn', englishTextOnly(e.target.value))} className={guardedInputClass(formValidation.nameEn)} placeholder="Example Co., Ltd." />
                  <p className={inputGuide(formValidation.nameEn)}>
                    {isThai ? 'ใช้ชื่ออังกฤษ เช่น Example Co., Ltd.' : 'English only, e.g. Example Co., Ltd.'}
                  </p>
                </div>
                <div>
                  <label className="label">{t('customer.taxId')} * (13 {isThai ? 'หลัก' : 'digits'})</label>
                  <div className="flex gap-2">
                    <input value={form.taxId} onChange={(e) => field('taxId', digitsOnly(e.target.value, 13))} className={guardedInputClass(formValidation.taxId, 'font-mono')} placeholder="0000000000000" inputMode="numeric" maxLength={13} />
                    <button
                      type="button"
                      onClick={lookupTaxIdFromOpenData}
                      disabled={dbdLoading || form.taxId.length !== 13}
                      className="inline-flex min-w-fit items-center gap-1 rounded-lg border border-teal-200 bg-white px-3 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {dbdLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                      {isThai ? 'ดึงข้อมูล' : 'Lookup'}
                    </button>
                  </div>
                  <p className={inputGuide(formValidation.taxId)}>
                    {isThai ? `ตัวเลข ${form.taxId.length}/13 หลัก` : `${form.taxId.length}/13 digits`}
                    {appliedDbdSuggestion?.taxId === form.taxId ? ` · ${sourceLabel(appliedDbdSuggestion)} · ${formatSyncDate(appliedDbdSuggestion.lastSyncedAt)}` : ''}
                  </p>
                </div>
                <div>
                  <label className="label">{t('customer.branchCode')}</label>
                  <input value={form.branchCode} onChange={(e) => field('branchCode', digitsOnly(e.target.value, 5))} className={guardedInputClass(formValidation.branchCode, 'font-mono')} placeholder="00000" inputMode="numeric" maxLength={5} />
                  <p className={inputGuide(formValidation.branchCode)}>
                    {isThai ? `รหัสสาขา ${(form.branchCode ?? '').length}/5 หลัก` : `${(form.branchCode ?? '').length}/5 branch digits`}
                  </p>
                </div>
                <div>
                  <label className="label">{isThai ? 'ชื่อสาขา (ไทย)' : 'Branch Name (TH)'}</label>
                  <input value={form.branchNameTh} onChange={(e) => field('branchNameTh', thaiTextOnly(e.target.value))} className={guardedInputClass(formValidation.branchNameTh)} placeholder="สำนักงานใหญ่" />
                </div>
                <div>
                  <label className="label">{isThai ? 'ชื่อสาขา (อังกฤษ)' : 'Branch Name (EN)'}</label>
                  <input value={form.branchNameEn} onChange={(e) => field('branchNameEn', englishTextOnly(e.target.value))} className={guardedInputClass(formValidation.branchNameEn)} placeholder="Head Office" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{t('customer.addressTh')} *</label>
                  <textarea value={form.addressTh} onChange={(e) => field('addressTh', thaiTextOnly(e.target.value))} className={guardedInputClass(formValidation.addressTh)} rows={2} placeholder="123 ถนนตัวอย่าง แขวง... เขต... กรุงเทพฯ 10110" />
                  <p className={inputGuide(formValidation.addressTh)}>
                    {isThai ? 'ใช้ที่อยู่ภาษาไทยสำหรับเอกสารภาษี' : 'Use Thai address text for tax documents.'}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{t('customer.addressEn')}</label>
                  <textarea value={form.addressEn} onChange={(e) => field('addressEn', englishTextOnly(e.target.value))} className={guardedInputClass(formValidation.addressEn)} rows={2} placeholder="123 Example Road, Bangkok 10110" />
                </div>
                <div>
                  <label className="label">{t('customer.email')}</label>
                  <input type="email" value={form.email} onChange={(e) => field('email', e.target.value)} className="input-field" placeholder="contact@example.com" />
                </div>
                <div>
                  <label className="label">{t('customer.phone')}</label>
                  <input value={form.phone} onChange={(e) => field('phone', e.target.value)} className="input-field" placeholder="02-xxx-xxxx" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{t('customer.contactPerson')}</label>
                  <input value={form.contactPerson} onChange={(e) => field('contactPerson', e.target.value)} className="input-field" placeholder={isThai ? 'ชื่อผู้ติดต่อ' : 'Contact person name'} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">
                    {isThai ? 'เลขบัตรประชาชน (13 หลัก) — สำหรับบุคคลธรรมดา / Easy e-Receipt' : 'National ID (13 digits) — for individuals / Easy e-Receipt'}
                  </label>
                  <input
                    value={form.personalId ?? ''}
                    onChange={(e) => field('personalId', digitsOnly(e.target.value, 13))}
                    className={guardedInputClass(formValidation.personalId, 'font-mono')}
                    placeholder="0000000000000"
                    inputMode="numeric"
                    maxLength={13}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {isThai
                      ? 'ใช้สำหรับออก e-Receipt ให้บุคคลธรรมดา ตามโครงการ Easy e-Receipt ของสรรพากร'
                      : 'Used to issue e-Receipt for individuals under the Revenue Department Easy e-Receipt program'}
                  </p>
                </div>
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
    </div>
  );
}
