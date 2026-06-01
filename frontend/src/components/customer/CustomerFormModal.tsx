import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, Loader2, Database, Search, CheckCircle2, ChevronDown, Handshake, Truck } from 'lucide-react';
import type { Customer, CustomerKind, CustomerPartyRole, CustomerUseCase } from '../../types';
import {
  digitsOnly,
  englishTextOnly,
  guardedInputClass,
  inputGuide,
  isEnglishText,
  isFiveDigitBranchCode,
  isThaiText,
  isThirteenDigitId,
  thaiTextOnly,
} from '../../lib/inputGuards';

// Shared "add a customer/vendor" popup. This is the same create form the
// Customers directory page uses (party role · DBD lookup · tax fields · credit
// terms), pulled out so the invoice/quotation/delivery/recurring builders can
// add a buyer inline instead of navigating away. The Customers page keeps its
// richer editor (Drive evidence, portal invite) — those are post-save
// management features that don't belong in a quick "add buyer" flow.

type CustomerForm = Omit<Customer, 'id' | 'companyId' | 'isActive' | 'createdAt'> & {
  creditLimit?: string | number | null;
  creditDays?: string | number | null;
};

const EMPTY_FORM: CustomerForm = {
  partyRole: 'customer',
  customerKind: 'company',
  useCase: 'general',
  verificationStatus: 'not_required',
  vatEvidenceStatus: 'not_required',
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
  creditLimit: null,
  creditDays: null,
  documents: [],
};

const CUSTOMER_USE_CASE_OPTIONS: Array<{
  value: CustomerUseCase;
  labelTh: string;
  labelEn: string;
  descriptionTh: string;
  descriptionEn: string;
}> = [
  { value: 'general', labelTh: 'ทั่วไป', labelEn: 'General', descriptionTh: 'บันทึกชื่อไว้ใช้งานประจำ', descriptionEn: 'Save the name for everyday work' },
  { value: 'full_tax_invoice', labelTh: 'ใบกำกับภาษี', labelEn: 'Tax invoice', descriptionTh: 'ต้องการข้อมูลภาษีให้ครบ', descriptionEn: 'Keep tax details complete' },
  { value: 'credit', labelTh: 'เครดิต', labelEn: 'Credit', descriptionTh: 'มีวงเงินหรือกำหนดชำระ', descriptionEn: 'Track credit limit or payment days' },
  { value: 'contract_project', labelTh: 'สัญญา/โปรเจค', labelEn: 'Contract / project', descriptionTh: 'ใช้กับงานสัญญาหรือโครงการ', descriptionEn: 'Use for contract or project work' },
  { value: 'vendor_payee', labelTh: 'ผู้ขาย/ผู้รับเงิน', labelEn: 'Vendor / payee', descriptionTh: 'ใช้กับซื้อ ค่าใช้จ่าย หรือจ่ายเงิน', descriptionEn: 'Use for purchase, expense, or payment' },
];

const PARTY_ROLE_OPTIONS: Array<{ value: 'customer' | 'supplier'; labelTh: string; labelEn: string; descriptionTh: string; descriptionEn: string }> = [
  { value: 'customer', labelTh: 'ลูกค้า', labelEn: 'Customer', descriptionTh: 'สำหรับออกเอกสารขาย', descriptionEn: 'For sales documents' },
  { value: 'supplier', labelTh: 'ผู้ขาย', labelEn: 'Vendor', descriptionTh: 'สำหรับบันทึกซื้อ ค่าใช้จ่าย หรือเอกสารจากผู้ขาย', descriptionEn: 'For purchase records, expenses, and vendor documents' },
];

interface DbdLocalSuggestion {
  taxId: string;
  nameTh: string | null;
  nameEn: string | null;
  addressTh: string | null;
  addressEn: string | null;
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

function moneyInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [whole, ...fractionParts] = cleaned.split('.');
  const fraction = fractionParts.join('').slice(0, 2);
  return fractionParts.length > 0 ? `${whole}.${fraction}` : whole;
}

function numericValue(value: unknown) {
  return String(value ?? '').trim().replace(/,/g, '');
}

function optionalCreditLimit(value: unknown) {
  const raw = numericValue(value);
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : NaN;
}

function optionalCreditDays(value: unknown) {
  const raw = numericValue(value);
  if (!raw) return null;
  const days = Number(raw);
  return Number.isInteger(days) ? days : NaN;
}

function hasThaiPostcode(value: string | null | undefined) {
  return Boolean(value?.match(/[0-9๐-๙]{5}\s*$/));
}

interface CustomerFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the freshly created customer so the caller can select it. */
  onSaved: (customer: Customer) => void;
  token: string | null;
  isThai: boolean;
  /** When set, the customer/vendor role picker is hidden and locked to this role. */
  lockPartyRole?: 'customer' | 'supplier';
  title?: string;
}

export default function CustomerFormModal({
  open,
  onClose,
  onSaved,
  token,
  isThai,
  lockPartyRole,
  title,
}: CustomerFormModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [customerKind, setCustomerKind] = useState<CustomerKind>('company');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dbdQuery, setDbdQuery] = useState('');
  const [dbdSuggestions, setDbdSuggestions] = useState<DbdLocalSuggestion[]>([]);
  const [dbdLoading, setDbdLoading] = useState(false);
  const [dbdNotice, setDbdNotice] = useState('');
  const [appliedDbdSuggestion, setAppliedDbdSuggestion] = useState<DbdLocalSuggestion | null>(null);

  const isIndividual = customerKind === 'individual';
  const currentUseCase = (form.useCase ?? 'general') as CustomerUseCase;
  const currentPartyRole = (form.partyRole ?? 'customer') as CustomerPartyRole;
  const isSupplierRole = currentPartyRole === 'supplier' || currentPartyRole === 'both' || currentUseCase === 'vendor_payee';
  const primaryPartyRole: 'customer' | 'supplier' =
    currentPartyRole === 'supplier' || (currentPartyRole === 'both' && currentUseCase === 'vendor_payee')
      ? 'supplier'
      : 'customer';
  const usesBothSides = currentPartyRole === 'both';
  const useCaseOptions = lockPartyRole === 'customer'
    ? CUSTOMER_USE_CASE_OPTIONS.filter((option) => option.value !== 'vendor_payee')
    : CUSTOMER_USE_CASE_OPTIONS;
  const selectedUseCaseOption = useCaseOptions.find((option) => option.value === currentUseCase) ?? useCaseOptions[0];
  const hasCreditTerms = form.creditLimit !== null && form.creditLimit !== undefined && String(form.creditLimit).trim() !== ''
    || (form.creditDays !== null && form.creditDays !== undefined && String(form.creditDays).trim() !== '');

  const formValidation = {
    nameTh: form.nameTh.trim().length > 0 && !isThaiText(form.nameTh, true),
    nameEn: (form.nameEn ?? '').trim().length > 0 && !isEnglishText(form.nameEn ?? ''),
    taxId: form.taxId.length > 0 && !isThirteenDigitId(form.taxId),
    branchCode: (form.branchCode ?? '').length > 0 && !isFiveDigitBranchCode(form.branchCode ?? ''),
    branchNameTh: (form.branchNameTh ?? '').trim().length > 0 && !isThaiText(form.branchNameTh ?? ''),
    branchNameEn: (form.branchNameEn ?? '').trim().length > 0 && !isEnglishText(form.branchNameEn ?? ''),
    addressTh: form.addressTh.trim().length > 0 && !isThaiText(form.addressTh, true),
    addressEn: (form.addressEn ?? '').trim().length > 0 && !isEnglishText(form.addressEn ?? ''),
    creditLimit: (() => {
      const amount = optionalCreditLimit(form.creditLimit);
      return amount !== null && (Number.isNaN(amount) || amount < 0);
    })(),
    creditDays: (() => {
      const days = optionalCreditDays(form.creditDays);
      return days !== null && (Number.isNaN(days) || days < 0);
    })(),
  };
  const addressMissingPostcode = Boolean(form.addressTh.trim()) && !hasThaiPostcode(form.addressTh);
  const dbdAppliedWithoutEnglishAddress = Boolean(
    appliedDbdSuggestion
    && appliedDbdSuggestion.taxId === form.taxId
    && !appliedDbdSuggestion.addressEn
    && !form.addressEn?.trim()
  );

  // Reset to a clean form each time the popup opens.
  useEffect(() => {
    if (!open) return;
    const role: CustomerPartyRole = lockPartyRole ?? 'customer';
    setForm({
      ...EMPTY_FORM,
      partyRole: role,
      useCase: role === 'supplier' ? 'vendor_payee' : 'general',
    });
    setCustomerKind('company');
    setSaving(false);
    setError('');
    setDbdQuery('');
    setDbdSuggestions([]);
    setDbdLoading(false);
    setDbdNotice('');
    setAppliedDbdSuggestion(null);
  }, [open, lockPartyRole]);

  // Debounced DBD/open-data search by company name or tax ID.
  useEffect(() => {
    if (!open || !token || isIndividual) return;
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
  }, [dbdQuery, isIndividual, open, token]);

  const field = (key: keyof CustomerForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function setKind(nextKind: CustomerKind) {
    setCustomerKind(nextKind);
    setError('');
    if (nextKind === 'individual') {
      setDbdQuery('');
      setDbdSuggestions([]);
      setDbdNotice('');
      setAppliedDbdSuggestion(null);
      setForm((prev) => {
        const id = prev.personalId || prev.taxId;
        return {
          ...prev,
          customerKind: 'individual',
          taxId: digitsOnly(id, 13),
          personalId: digitsOnly(id, 13),
          branchCode: '00000',
          branchNameTh: '',
          branchNameEn: '',
          nameEn: '',
          addressEn: '',
        };
      });
    } else {
      setForm((prev) => ({ ...prev, customerKind: 'company', personalId: '' }));
    }
  }

  function getUseCaseForPrimaryRole(nextRole: 'customer' | 'supplier', current: CustomerUseCase) {
    if (nextRole === 'supplier' && current === 'general') return 'vendor_payee';
    if (nextRole === 'customer' && current === 'vendor_payee') return 'general';
    return current;
  }

  function setPartyRole(nextRole: 'customer' | 'supplier') {
    setError('');
    setForm((prev) => {
      const current = (prev.useCase ?? 'general') as CustomerUseCase;
      const nextUseCase = getUseCaseForPrimaryRole(nextRole, current);
      return { ...prev, partyRole: prev.partyRole === 'both' ? 'both' : nextRole, useCase: nextUseCase };
    });
  }

  function setUsesBothSides(enabled: boolean) {
    setError('');
    setForm((prev) => {
      const current = (prev.useCase ?? 'general') as CustomerUseCase;
      if (enabled) return { ...prev, partyRole: 'both' };
      const nextRole: 'customer' | 'supplier' = current === 'vendor_payee' ? 'supplier' : 'customer';
      return { ...prev, partyRole: nextRole, useCase: getUseCaseForPrimaryRole(nextRole, current) };
    });
  }

  function setIndividualId(value: string) {
    const id = digitsOnly(value, 13);
    setForm((prev) => ({ ...prev, taxId: id, personalId: id }));
  }

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
    setForm((prev) => {
      const addressTh = suggestion.addressTh ?? suggestion.vatAddress ?? prev.addressTh;
      const nameEn = suggestion.nameEn ?? prev.nameEn ?? '';
      const addressEn = suggestion.addressEn ?? prev.addressEn ?? '';
      return {
        ...prev,
        nameTh: suggestion.nameTh ?? prev.nameTh,
        nameEn,
        taxId: suggestion.taxId || prev.taxId,
        branchCode: suggestion.branchCode ?? prev.branchCode ?? '00000',
        branchNameTh: suggestion.branchNameTh ?? prev.branchNameTh ?? '',
        branchNameEn: suggestion.branchNameEn ?? prev.branchNameEn ?? '',
        addressTh,
        addressEn,
        email: suggestion.email ?? prev.email ?? '',
        phone: suggestion.phone ?? prev.phone ?? '',
        contactPerson: suggestion.contactPerson ?? prev.contactPerson ?? '',
      };
    });
    setAppliedDbdSuggestion(suggestion);
    setDbdNotice(
      isThai
        ? `เติมข้อมูลจาก ${sourceLabel(suggestion)} แล้ว กรุณาตรวจอีกครั้งก่อนบันทึก`
        : `Applied ${sourceLabel(suggestion)}. Please review before saving.`,
    );
    setDbdQuery(suggestion.nameTh ?? suggestion.nameEn ?? suggestion.taxId);
    setDbdSuggestions([]);
  }

  async function fetchDbdProfileByTaxId(taxId: string) {
    if (!token) return null;
    const res = await fetch(`/api/dbd/local/lookup?taxId=${encodeURIComponent(taxId)}&refresh=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as DbdLookupResponse;
    if (!res.ok) throw new Error(json.error ?? 'Lookup failed');
    return json.data?.profile ?? null;
  }

  async function selectDbdSuggestion(suggestion: DbdLocalSuggestion) {
    if (!token || suggestion.taxId.length !== 13) {
      applyDbdSuggestion(suggestion);
      return;
    }
    setDbdLoading(true);
    setDbdNotice('');
    try {
      const enriched = await fetchDbdProfileByTaxId(suggestion.taxId);
      applyDbdSuggestion(enriched ?? suggestion);
    } catch (err) {
      applyDbdSuggestion(suggestion);
      setDbdNotice(
        isThai
          ? 'ใช้ข้อมูลจากรายการค้นหาแล้ว แต่ยัง enrich จากเลขภาษีไม่สำเร็จ กรุณาตรวจที่อยู่อีกครั้ง'
          : 'Applied the search result, but tax ID enrichment failed. Please review the address.',
      );
      console.warn('DBD suggestion enrichment failed', err);
    } finally {
      setDbdLoading(false);
    }
  }

  async function lookupTaxIdFromOpenData() {
    if (!token || form.taxId.length !== 13) {
      setDbdNotice(isThai ? 'กรุณากรอกเลขผู้เสียภาษี 13 หลักก่อน' : 'Enter a 13-digit tax ID first');
      return;
    }
    setDbdLoading(true);
    setDbdNotice('');
    try {
      const profile = await fetchDbdProfileByTaxId(form.taxId);
      if (!profile) {
        setDbdNotice(isThai ? 'ไม่พบข้อมูลใน cache เปิด กรอกเองต่อได้' : 'No open-data match. You can continue manually.');
        return;
      }
      applyDbdSuggestion(profile);
    } catch (err) {
      setDbdNotice(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setDbdLoading(false);
    }
  }

  async function handleSave() {
    if (!form.nameTh.trim() || formValidation.nameTh) { setError(isThai ? 'กรุณากรอกชื่อภาษาไทยให้ถูกต้อง' : 'Please enter a valid Thai name'); return; }
    if (form.taxId.length !== 13) {
      setError(isIndividual
        ? (isThai ? 'เลขประจำตัว 13 หลักต้องครบ' : 'The 13-digit individual ID is required')
        : (isThai ? 'เลขผู้เสียภาษีต้องมี 13 หลัก' : 'Tax ID must be 13 digits'));
      return;
    }
    if (!form.addressTh.trim() || formValidation.addressTh) { setError(isThai ? 'กรุณากรอกที่อยู่ภาษาไทยให้ถูกต้อง' : 'Please enter a valid Thai address'); return; }
    if (formValidation.creditLimit) { setError(isThai ? 'วงเงินเครดิตต้องเป็นตัวเลข 0 ขึ้นไป' : 'Credit limit must be a number from 0 or higher'); return; }
    if (formValidation.creditDays) { setError(isThai ? 'เครดิตกี่วันต้องเป็นจำนวนเต็ม 0 ขึ้นไป' : 'Credit days must be a whole number from 0 or higher'); return; }

    const normalizedCreditLimit = optionalCreditLimit(form.creditLimit);
    const normalizedCreditDays = optionalCreditDays(form.creditDays);

    const payload = isIndividual
      ? {
        ...form,
        partyRole: currentPartyRole,
        customerKind: 'individual',
        useCase: currentUseCase,
        creditLimit: normalizedCreditLimit,
        creditDays: normalizedCreditDays,
        taxId: form.taxId,
        personalId: form.taxId,
        branchCode: '00000',
        branchNameTh: '',
        branchNameEn: '',
        nameEn: '',
        addressEn: '',
      }
      : {
        ...form,
        partyRole: currentPartyRole,
        customerKind: 'company',
        useCase: currentUseCase,
        creditLimit: normalizedCreditLimit,
        creditDays: normalizedCreditDays,
        personalId: form.personalId || '',
      };
    delete payload.documents;
    delete payload.readiness;
    delete payload.verificationStatus;
    delete payload.vatEvidenceStatus;

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json() as { data?: Customer; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Save failed');
      onSaved(json.data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {title ?? (isThai ? 'เพิ่มลูกค้าใหม่' : 'Add new customer')}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {!lockPartyRole && (
            <div>
              <label className="label">{isThai ? 'รายชื่อนี้ใช้เป็น' : 'Use this entry as'}</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PARTY_ROLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPartyRole(option.value)}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      primaryPartyRole === option.value
                        ? 'border-primary-300 bg-primary-50 text-primary-900 ring-2 ring-primary-100'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {option.value === 'supplier' ? <Truck className="h-4 w-4" /> : <Handshake className="h-4 w-4" />}
                      {isThai ? option.labelTh : option.labelEn}
                    </span>
                    <span className="mt-1 block text-xs opacity-75">{isThai ? option.descriptionTh : option.descriptionEn}</span>
                  </button>
                ))}
              </div>
              <label className="mt-2 inline-flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={usesBothSides}
                  onChange={(event) => setUsesBothSides(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                {isThai ? 'ใช้ได้ทั้งเป็นลูกค้าและผู้ขาย' : 'Use as both customer and vendor'}
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setKind('company')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                customerKind === 'company'
                  ? 'bg-white text-primary-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isThai ? 'บริษัท/นิติบุคคล' : 'Company'}
            </button>
            <button
              type="button"
              onClick={() => setKind('individual')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                customerKind === 'individual'
                  ? 'bg-white text-primary-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isThai ? 'บุคคลธรรมดา' : 'Individual'}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <label className="label mb-0">{isThai ? 'ใช้สำหรับ' : 'Use for'}</label>
                <p className="mt-0.5 text-xs text-slate-500">
                  {isThai ? selectedUseCaseOption.descriptionTh : selectedUseCaseOption.descriptionEn}
                </p>
              </div>
              <span className="text-[11px] font-medium text-slate-400">
                {isThai ? 'เปลี่ยนได้ภายหลัง' : 'Can be changed later'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {useCaseOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => field('useCase', option.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    currentUseCase === option.value
                      ? 'border-primary-300 bg-primary-50 text-primary-900 ring-2 ring-primary-100'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {isThai ? option.labelTh : option.labelEn}
                </button>
              ))}
            </div>
          </div>

          {!isIndividual && (
            <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-teal-900">
                    <Database className="h-4 w-4" />
                    {isThai ? 'ค้นข้อมูลบริษัท' : 'Company lookup'}
                  </div>
                  <p className="mt-1 text-xs text-teal-700">
                    {isThai
                      ? 'ช่วยเติมชื่อ เลขผู้เสียภาษี และที่อยู่ให้อัตโนมัติ'
                      : 'Fill name, tax ID, and address automatically when data is available.'}
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
                  placeholder={isThai ? 'ค้นด้วยชื่อบริษัทหรือเลขผู้เสียภาษี' : 'Search by company name or tax ID'}
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
                      onClick={() => selectDbdSuggestion(suggestion)}
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
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">
                {isIndividual
                  ? (isThai ? 'ชื่อ-นามสกุล *' : 'Full name *')
                  : isSupplierRole
                    ? (isThai ? 'ชื่อผู้ขาย (ไทย) *' : 'Vendor name (TH) *')
                    : `${t('customer.nameTh')} *`}
              </label>
              <input
                value={form.nameTh}
                onChange={(e) => field('nameTh', thaiTextOnly(e.target.value))}
                className={guardedInputClass(formValidation.nameTh)}
                placeholder={isIndividual ? 'สมชาย ใจดี' : isSupplierRole ? 'บริษัท ผู้ขาย จำกัด' : 'บริษัท ตัวอย่าง จำกัด'}
              />
              <p className={inputGuide(formValidation.nameTh)}>
                {isIndividual
                  ? (isThai ? 'ใช้ชื่อตามเอกสารของลูกค้า เช่น สมชาย ใจดี' : 'Use the customer name for the document.')
                  : (isThai ? 'ใช้ชื่อภาษาไทยตามเอกสาร' : 'Use the Thai legal name from the document.')}
              </p>
            </div>
            {!isIndividual && (
              <div>
                <label className="label">{t('customer.nameEn')}</label>
                <input value={form.nameEn} onChange={(e) => field('nameEn', englishTextOnly(e.target.value))} className={guardedInputClass(formValidation.nameEn)} placeholder="Example Co., Ltd." />
                <p className={inputGuide(formValidation.nameEn)}>
                  {isThai ? 'ใช้ชื่ออังกฤษ เช่น Example Co., Ltd.' : 'English only, e.g. Example Co., Ltd.'}
                </p>
              </div>
            )}
            <div>
              <label className="label">
                {isIndividual
                  ? (isThai ? 'เลขประจำตัว 13 หลักสำหรับบุคคลธรรมดา *' : '13-digit individual ID *')
                  : isSupplierRole
                    ? `${isThai ? 'เลขผู้เสียภาษีผู้ขาย' : 'Vendor Tax ID'} * (13 ${isThai ? 'หลัก' : 'digits'})`
                    : `${t('customer.taxId')} * (13 ${isThai ? 'หลัก' : 'digits'})`}
              </label>
              <div className="flex gap-2">
                <input
                  value={form.taxId}
                  onChange={(e) => (isIndividual ? setIndividualId(e.target.value) : field('taxId', digitsOnly(e.target.value, 13)))}
                  className={guardedInputClass(formValidation.taxId, 'font-mono')}
                  placeholder="0000000000000"
                  inputMode="numeric"
                  maxLength={13}
                />
                {!isIndividual && (
                  <button
                    type="button"
                    onClick={lookupTaxIdFromOpenData}
                    disabled={dbdLoading || form.taxId.length !== 13}
                    className="inline-flex min-w-fit items-center gap-1 rounded-lg border border-teal-200 bg-white px-3 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {dbdLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                    {isThai ? 'ดึงข้อมูล' : 'Lookup'}
                  </button>
                )}
              </div>
              <p className={inputGuide(formValidation.taxId)}>
                {isIndividual
                  ? (isThai
                    ? 'ใช้เมื่อต้องออกเอกสารให้ลูกค้าบุคคลธรรมดา ระบบไม่ค้นข้อมูลบุคคลจากฐานรัฐ กรุณาตรวจสอบกับลูกค้าก่อนบันทึก'
                    : 'Use this for individual customers. Billboy does not search government personal data; verify it with the customer before saving.')
                  : (
                    <>
                      {isThai ? `ตัวเลข ${form.taxId.length}/13 หลัก` : `${form.taxId.length}/13 digits`}
                      {appliedDbdSuggestion?.taxId === form.taxId ? ` · ${sourceLabel(appliedDbdSuggestion)} · ${formatSyncDate(appliedDbdSuggestion.lastSyncedAt)}` : ''}
                    </>
                  )}
              </p>
            </div>
            {!isIndividual && (
              <div>
                <label className="label">{t('customer.branchCode')}</label>
                <input value={form.branchCode} onChange={(e) => field('branchCode', digitsOnly(e.target.value, 5))} className={guardedInputClass(formValidation.branchCode, 'font-mono')} placeholder="00000" inputMode="numeric" maxLength={5} />
                <p className={inputGuide(formValidation.branchCode)}>
                  {isThai ? `รหัสสาขา ${(form.branchCode ?? '').length}/5 หลัก` : `${(form.branchCode ?? '').length}/5 branch digits`}
                </p>
              </div>
            )}
            {!isIndividual && (
              <div>
                <label className="label">{isThai ? 'ชื่อสาขา (ไทย)' : 'Branch Name (TH)'}</label>
                <input value={form.branchNameTh} onChange={(e) => field('branchNameTh', thaiTextOnly(e.target.value))} className={guardedInputClass(formValidation.branchNameTh)} placeholder="สำนักงานใหญ่" />
              </div>
            )}
            {!isIndividual && (
              <div>
                <label className="label">{isThai ? 'ชื่อสาขา (อังกฤษ)' : 'Branch Name (EN)'}</label>
                <input value={form.branchNameEn} onChange={(e) => field('branchNameEn', englishTextOnly(e.target.value))} className={guardedInputClass(formValidation.branchNameEn)} placeholder="Head Office" />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="label">{t('customer.addressTh')} *</label>
              <textarea value={form.addressTh} onChange={(e) => field('addressTh', thaiTextOnly(e.target.value))} className={guardedInputClass(formValidation.addressTh)} rows={2} placeholder="123 ถนนตัวอย่าง แขวง... เขต... กรุงเทพฯ 10110" />
              <p className={addressMissingPostcode ? 'mt-1 text-xs text-amber-600' : inputGuide(formValidation.addressTh)}>
                {addressMissingPostcode
                  ? (isThai ? 'ควรตรวจรหัสไปรษณีย์ก่อนบันทึก หากข้อมูลเปิดไม่มีให้กรอกเอง' : 'Please verify the postcode before saving if open data did not include it.')
                  : (isThai ? 'ใช้ที่อยู่ภาษาไทยสำหรับเอกสารภาษีและการตรวจ audit' : 'Use Thai address text for tax documents and audit checks.')}
              </p>
            </div>
            {!isIndividual && (
              <div className="sm:col-span-2">
                <label className="label">{t('customer.addressEn')}</label>
                <textarea value={form.addressEn} onChange={(e) => field('addressEn', englishTextOnly(e.target.value))} className={guardedInputClass(formValidation.addressEn)} rows={2} placeholder="226/368 Moo 3, San Phak Wan, Hang Dong, Chiang Mai 50230" />
                <p className={dbdAppliedWithoutEnglishAddress ? 'mt-1 text-xs text-slate-500' : inputGuide(formValidation.addressEn)}>
                  {dbdAppliedWithoutEnglishAddress
                    ? (isThai ? 'ไม่มีที่อยู่อังกฤษจากข้อมูลเปิด กรุณากรอกเองถ้าต้องใช้ออกเอกสารภาษาอังกฤษ' : 'No English address was found in open data. Enter it manually if needed for English documents.')
                    : (isThai ? 'กรอกเฉพาะเมื่อมีที่อยู่อังกฤษจริง ระบบจะไม่แปลงจากภาษาไทยให้อัตโนมัติ' : 'Enter only a real English address. Billboy will not auto-romanize Thai addresses.')}
                </p>
              </div>
            )}
            <div>
              <label className="label">{t('customer.email')}</label>
              <input type="email" value={form.email} onChange={(e) => field('email', e.target.value)} className="input-field" placeholder="contact@example.com" />
            </div>
            <div>
              <label className="label">{t('customer.phone')}</label>
              <input value={form.phone} onChange={(e) => field('phone', e.target.value)} className="input-field" placeholder="02-xxx-xxxx" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">{isThai ? 'ผู้ประสานงาน' : 'Contact person'}</label>
              <input value={form.contactPerson} onChange={(e) => field('contactPerson', e.target.value)} className="input-field" placeholder={isThai ? 'ชื่อผู้ประสานงาน' : 'Contact person name'} />
            </div>
          </div>

          <details
            className="group rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            open={currentUseCase === 'credit' || hasCreditTerms}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  {isThai ? 'เงื่อนไขเครดิต' : 'Credit terms'}
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                    {isThai ? 'ไม่บังคับ' : 'Optional'}
                  </span>
                  {currentUseCase === 'credit' && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
                      {isThai ? 'แนะนำ' : 'Recommended'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {isThai
                    ? 'ใส่เฉพาะรายที่มีวงเงินหรือกำหนดชำระ ระบบจะช่วยเตือนในเอกสารขาย'
                    : 'Add only when this name has a credit limit or payment term.'}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">{isThai ? 'วงเงินเครดิต' : 'Credit limit'}</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">฿</span>
                  <input
                    value={form.creditLimit ?? ''}
                    onChange={(e) => field('creditLimit', moneyInput(e.target.value))}
                    className={guardedInputClass(formValidation.creditLimit, 'pl-7')}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </div>
                <p className={inputGuide(formValidation.creditLimit)}>
                  {isThai ? 'ตัวเลขเท่านั้น เช่น 50000' : 'Numbers only, e.g. 50000'}
                </p>
              </div>
              <div>
                <label className="label">{isThai ? 'เครดิตกี่วัน' : 'Credit days'}</label>
                <input
                  value={form.creditDays ?? ''}
                  onChange={(e) => field('creditDays', digitsOnly(e.target.value, 4))}
                  className={guardedInputClass(formValidation.creditDays)}
                  placeholder="30"
                  inputMode="numeric"
                />
                <p className={inputGuide(formValidation.creditDays)}>
                  {isThai ? 'เช่น 0, 7, 15, 30 หรือ 60 วัน' : 'For example 0, 7, 15, 30, or 60 days'}
                </p>
              </div>
            </div>
          </details>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isThai ? 'บันทึกรายชื่อ' : 'Save entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
