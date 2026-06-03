import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Edit2, UserX, FileText, X, Save, Loader2, Users, ReceiptText, Database, CheckCircle2, AlertTriangle, Upload, ExternalLink, ShieldCheck, Handshake, Truck, ChevronDown, FolderOpen, Package, Send } from 'lucide-react';
import SectionSubNav from '../components/SectionSubNav';
import { Link } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { Customer, CustomerDocument, CustomerDocumentType, CustomerKind, CustomerPartyRole, CustomerReadinessSummary, CustomerUseCase } from '../types';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import { digitsOnly, englishTextOnly, guardedInputClass, inputGuide, isEnglishText, isFiveDigitBranchCode, isThaiText, isThirteenDigitId, thaiTextOnly } from '../lib/inputGuards';
import { ConfirmDialog, ToastStack, type ConfirmDialogState, type FeedbackToast } from '../components/ui/AppFeedback';

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

function formatMoney(value: unknown, locale: string) {
  const amount = optionalCreditLimit(value);
  if (amount === null || Number.isNaN(amount)) return '';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function hasThaiPostcode(value: string | null | undefined) {
  return Boolean(value?.match(/[0-9๐-๙]{5}\s*$/));
}

export default function Customers() {
  const { t } = useTranslation();
  const { isThai } = useLanguage();
  const { token } = useAuthStore();
  const { policy } = useCompanyAccessPolicy();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [partyRoleFilter, setPartyRoleFilter] = useState<CustomerPartyRole | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [customerKind, setCustomerKind] = useState<CustomerKind>('company');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customerDocuments, setCustomerDocuments] = useState<CustomerDocument[]>([]);
  const [uploadingDocType, setUploadingDocType] = useState<CustomerDocumentType | null>(null);
  const [showEvidenceDetails, setShowEvidenceDetails] = useState(false);
  const [dbdQuery, setDbdQuery] = useState('');
  const [dbdSuggestions, setDbdSuggestions] = useState<DbdLocalSuggestion[]>([]);
  const [dbdLoading, setDbdLoading] = useState(false);
  const [dbdNotice, setDbdNotice] = useState('');
  const [appliedDbdSuggestion, setAppliedDbdSuggestion] = useState<DbdLocalSuggestion | null>(null);
  const [toasts, setToasts] = useState<FeedbackToast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const isIndividual = customerKind === 'individual';
  const currentUseCase = (form.useCase ?? 'general') as CustomerUseCase;

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
  const currentPartyRole = (form.partyRole ?? 'customer') as CustomerPartyRole;
  const isSupplierRole = currentPartyRole === 'supplier' || currentPartyRole === 'both' || currentUseCase === 'vendor_payee';
  const primaryPartyRole: 'customer' | 'supplier' =
    currentPartyRole === 'supplier' || (currentPartyRole === 'both' && currentUseCase === 'vendor_payee')
      ? 'supplier'
      : 'customer';
  const usesBothSides = currentPartyRole === 'both';
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

  function buildLocalReadiness(): CustomerReadinessSummary {
    const isCompany = customerKind === 'company';
    const needsVatEvidence = isCompany && ['full_tax_invoice', 'credit', 'contract_project'].includes(currentUseCase);
    const needsRegistration = isCompany && ['credit', 'contract_project', 'vendor_payee'].includes(currentUseCase);
    const needsContract = ['credit', 'contract_project'].includes(currentUseCase);
    const recommendsPersonalIdEvidence = !isCompany && ['credit', 'contract_project', 'vendor_payee'].includes(currentUseCase);
    const recommendsBankAccount = isSupplierRole;
    const hasDoc = (documentType: CustomerDocumentType) =>
      customerDocuments.some((doc) => doc.documentType === documentType && doc.status !== 'rejected');

    const items: CustomerReadinessSummary['items'] = [{
      key: 'basic_identity',
      labelTh: isCompany ? (isSupplierRole ? 'ข้อมูลผู้ขายครบถ้วน' : 'ข้อมูลบริษัทครบถ้วน') : 'ข้อมูลบุคคลครบถ้วน',
      labelEn: isCompany ? (isSupplierRole ? 'Vendor details complete' : 'Company details complete') : 'Individual details complete',
      required: true,
      complete: Boolean(form.nameTh && form.taxId.length === 13 && form.addressTh),
    }];

    if (needsRegistration) {
      items.push({
        key: 'company_registration',
        labelTh: 'หนังสือรับรองบริษัท',
        labelEn: 'Company registration',
        required: true,
        documentType: 'company_registration',
        complete: hasDoc('company_registration'),
      });
    }
    if (needsVatEvidence) {
      items.push({
        key: 'vat_certificate',
        labelTh: 'ภ.พ.20 / หลักฐานจด VAT',
        labelEn: 'VAT certificate',
        required: true,
        documentType: 'vat_certificate',
        complete: hasDoc('vat_certificate'),
      });
    }
    if (needsContract) {
      const documentType: CustomerDocumentType = currentUseCase === 'credit' ? 'credit_agreement' : 'contract';
      items.push({
        key: 'contract_or_credit',
        labelTh: currentUseCase === 'credit' ? 'เอกสารเปิดเครดิต/ข้อตกลงชำระเงิน' : 'สัญญาหรือเอกสารโครงการ',
        labelEn: currentUseCase === 'credit' ? 'Credit terms document' : 'Contract or project document',
        required: true,
        documentType,
        complete: hasDoc(documentType),
      });
    }
    if (isCompany && needsContract) {
      items.push({
        key: 'director_id',
        labelTh: 'สำเนาบัตรผู้มีอำนาจลงนาม (เฉพาะถ้าจำเป็น)',
        labelEn: 'Authorized signer ID (only if needed)',
        required: false,
        documentType: 'director_id',
        complete: hasDoc('director_id'),
      });
    }
    if (recommendsPersonalIdEvidence) {
      items.push({
        key: 'personal_id',
        labelTh: 'เอกสารยืนยันตัวตน (เฉพาะเคสสัญญา/วงเงินสูง)',
        labelEn: 'Identity evidence (contract/high-value cases only)',
        required: false,
        documentType: 'personal_id',
        complete: hasDoc('personal_id'),
      });
    }
    if (recommendsBankAccount) {
      items.push({
        key: 'bank_account',
        labelTh: 'หลักฐานบัญชีรับเงิน / ข้อมูลจ่ายเงิน',
        labelEn: 'Bank account or payee evidence',
        required: false,
        documentType: 'bank_account',
        complete: hasDoc('bank_account'),
      });
    }

    const requiredItems = items.filter((item) => item.required);
    const missingRequiredCount = requiredItems.filter((item) => !item.complete).length;
    const recommendedMissingCount = items.filter((item) => !item.required && !item.complete).length;
    const hasRequiredDoc = requiredItems.some((item) => item.documentType && item.complete);
    const status = requiredItems.length <= 1 && currentUseCase === 'general'
      ? 'not_required'
      : missingRequiredCount === 0
        ? 'complete'
        : hasRequiredDoc
          ? 'partial'
          : 'missing';
    const vatDoc = customerDocuments.find((doc) => doc.documentType === 'vat_certificate' && doc.status !== 'rejected');
    const vatEvidenceStatus = !needsVatEvidence ? 'not_required' : vatDoc?.status === 'verified' ? 'verified' : vatDoc ? 'uploaded' : 'missing';

    return { status, vatEvidenceStatus, missingRequiredCount, recommendedMissingCount, items };
  }

  const localReadiness = buildLocalReadiness();
  const requiredEvidenceItems = localReadiness.items.filter((item) => item.required);
  const optionalEvidenceItems = localReadiness.items.filter((item) => !item.required);
  const evidenceItems = localReadiness.items.filter((item) => item.documentType);
  const attachedEvidenceCount = customerDocuments.filter((doc) => doc.status !== 'rejected').length;
  const recommendedMissingCount = localReadiness.recommendedMissingCount ?? 0;
  const totalMissingCount = localReadiness.missingRequiredCount + recommendedMissingCount;
  const summaryReviewCount = localReadiness.status === 'not_required' ? 0 : totalMissingCount;
  const selectedUseCaseOption = CUSTOMER_USE_CASE_OPTIONS.find((option) => option.value === currentUseCase) ?? CUSTOMER_USE_CASE_OPTIONS[0];
  const evidenceFolderUrl = customerDocuments.find((doc) => doc.driveFolderUrl)?.driveFolderUrl ?? null;
  const hasCreditTerms = form.creditLimit !== null && form.creditLimit !== undefined && String(form.creditLimit).trim() !== ''
    || form.creditDays !== null && form.creditDays !== undefined && String(form.creditDays).trim() !== '';

    const fetchCustomers = useCallback(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (partyRoleFilter !== 'all') params.set('partyRole', partyRoleFilter);
        const query = params.toString();
        const res = await fetch(`/api/customers${query ? `?${query}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      const json = await res.json();
      setCustomers(json.data ?? []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
    }, [partyRoleFilter, search, token]);

  useEffect(() => {
    const t = setTimeout(fetchCustomers, 300);
    return () => clearTimeout(t);
  }, [fetchCustomers]);

  useEffect(() => {
      if (!showModal || !token || isIndividual) return;
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
    }, [dbdQuery, isIndividual, showModal, token]);

  function resetDbdAssist() {
    setDbdQuery('');
    setDbdSuggestions([]);
    setDbdLoading(false);
    setDbdNotice('');
    setAppliedDbdSuggestion(null);
  }

  function openCreate(initialRole: CustomerPartyRole = 'customer') {
    if (policy && policy.maxCustomers !== null && policy.usage.customers >= policy.maxCustomers) {
      setError(isThai ? 'ถึงจำนวนรายชื่อสูงสุดของแพ็กเกจแล้ว' : 'You reached the directory limit for this plan');
      return;
    }
    setEditing(null);
    setCustomerKind('company');
    setForm({
      ...EMPTY_FORM,
      partyRole: initialRole,
      useCase: initialRole === 'supplier' ? 'vendor_payee' : 'general',
    });
    setCustomerDocuments([]);
    setShowEvidenceDetails(false);
    setError('');
    resetDbdAssist();
    setShowModal(true);
  }

  function openEdit(c: Customer) {
    const existingPersonalId = c.personalId ?? '';
    setEditing(c);
    const kind = c.customerKind ?? (existingPersonalId ? 'individual' : 'company');
    setCustomerKind(kind);
    setCustomerDocuments(c.documents ?? []);
    setForm({
      customerKind: kind,
      partyRole: c.partyRole ?? (c.useCase === 'vendor_payee' ? 'supplier' : 'customer'),
      useCase: c.useCase ?? 'general',
      verificationStatus: c.verificationStatus ?? 'not_required',
      vatEvidenceStatus: c.vatEvidenceStatus ?? 'not_required',
      nameTh: c.nameTh,
      nameEn: c.nameEn ?? '',
      taxId: existingPersonalId || c.taxId,
      branchCode: c.branchCode ?? '00000',
      branchNameTh: c.branchNameTh ?? '',
      branchNameEn: c.branchNameEn ?? '',
      addressTh: c.addressTh,
      addressEn: c.addressEn ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      contactPerson: c.contactPerson ?? '',
      personalId: existingPersonalId,
      creditLimit: c.creditLimit ?? null,
      creditDays: c.creditDays ?? null,
      documents: c.documents ?? [],
      readiness: c.readiness,
    });
    setShowEvidenceDetails(false);
    setError('');
    resetDbdAssist();
    setShowModal(true);
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
      const url = editing ? `/api/customers/${editing.id}` : '/api/customers';
      const method = editing ? 'PUT' : 'POST';
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
      setCustomerDocuments([]);
      fetchCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    setConfirmDialog({
      tone: 'warning',
      title: isThai ? 'ปิดใช้งานรายชื่อนี้?' : 'Deactivate this contact?',
      description: isThai
        ? 'รายชื่อนี้จะไม่แสดงเป็นตัวเลือกหลัก แต่ประวัติเอกสารเดิมยังอยู่เพื่อ audit'
        : 'This contact will be hidden from primary choices, while existing document history remains available for audit.',
      confirmLabel: isThai ? 'ปิดใช้งาน' : 'Deactivate',
      cancelLabel: t('common.cancel'),
      onCancel: () => setConfirmDialog(null),
      onConfirm: () => {
        setConfirmDialog(null);
        void deactivateConfirmed(id);
      },
    });
  }

  async function deactivateConfirmed(id: string) {
    await fetch(`/api/customers/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    showToast({ tone: 'success', title: isThai ? 'ปิดใช้งานรายชื่อแล้ว' : 'Contact deactivated' });
    fetchCustomers();
  }

  // Seller-initiated Customer Portal invite. We POST to the customer
  // endpoint, backend generates a magic-link and emails it directly so
  // the buyer doesn't have to remember /portal + retype their email.
  async function handleSendPortalLink(customer: Customer) {
    if (!customer.email) {
      showToast({
        tone: 'warning',
        title: isThai ? 'ยังไม่มีอีเมลลูกค้า' : 'Customer email is missing',
        description: isThai ? 'เพิ่มอีเมลก่อน แล้วค่อยส่งลิงก์ Customer Portal' : 'Add an email address before sending a Customer Portal link.',
      });
      return;
    }
    setConfirmDialog({
      tone: 'info',
      title: isThai ? 'ส่งลิงก์ Customer Portal?' : 'Send Customer Portal link?',
      description: isThai
        ? `ระบบจะส่งลิงก์ไปที่ ${customer.email} ลูกค้าจะเห็นเฉพาะเอกสารของตัวเอง และลิงก์มีอายุ 14 วัน`
        : `Billboy will email ${customer.email}. They will only see their own documents, and the link expires in 14 days.`,
      confirmLabel: isThai ? 'ส่งลิงก์' : 'Send link',
      cancelLabel: t('common.cancel'),
      onCancel: () => setConfirmDialog(null),
      onConfirm: () => {
        setConfirmDialog(null);
        void sendPortalLinkConfirmed(customer);
      },
    });
  }

  async function sendPortalLinkConfirmed(customer: Customer) {
    try {
      const res = await fetch(`/api/customers/${customer.id}/portal-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      showToast({
        tone: 'success',
        title: isThai ? 'ส่งลิงก์แล้ว' : 'Portal link sent',
        description: customer.email ?? undefined,
      });
    } catch (e) {
      showToast({
        tone: 'error',
        title: isThai ? 'ส่งลิงก์ไม่สำเร็จ' : 'Portal link could not be sent',
        description: (e as Error).message,
      });
    }
  }

  const field = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

    function setKind(nextKind: CustomerKind) {
    setCustomerKind(nextKind);
    setError('');
    if (nextKind === 'individual') {
      resetDbdAssist();
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

  function maskedCustomerId(customer: Customer) {
    if (!customer.personalId) return customer.taxId;
    const id = customer.personalId || customer.taxId;
    if (id.length < 4) return '*************';
    return `*********${id.slice(-4)}`;
  }

  function customerIdLabel(customer: Customer) {
    if (customer.personalId) return isThai ? 'เลขบุคคลธรรมดา' : 'Individual ID';
    return isThai ? 'เลขผู้เสียภาษี' : 'Tax ID';
  }

  function partyRoleLabel(role?: string | null) {
    if (role === 'supplier') return isThai ? 'ผู้ขาย' : 'Vendor';
    if (role === 'both') return isThai ? 'ลูกค้า + ผู้ขาย' : 'Customer + vendor';
    return isThai ? 'ลูกค้า' : 'Customer';
  }

  function partyRoleBadgeClass(role?: string | null) {
    if (role === 'supplier') return 'border border-amber-200 bg-white text-amber-700';
    if (role === 'both') return 'border border-primary-200 bg-white text-primary-700';
    return 'border border-slate-200 bg-white text-slate-700';
  }

  function creditTermsText(customer: Customer) {
    const parts: string[] = [];
    if (customer.creditDays !== null && customer.creditDays !== undefined) {
      parts.push(isThai ? `เครดิต ${customer.creditDays} วัน` : `${customer.creditDays} credit days`);
    }
    if (customer.creditLimit !== null && customer.creditLimit !== undefined && formatMoney(customer.creditLimit, isThai ? 'th-TH' : 'en-US')) {
      parts.push(isThai ? `วงเงิน ${formatMoney(customer.creditLimit, 'th-TH')}` : `Limit ${formatMoney(customer.creditLimit, 'en-US')}`);
    }
    return parts.join(' · ');
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

  async function handleUploadCustomerDocument(documentType: CustomerDocumentType, file?: File | null) {
    if (!editing || !file || !token) return;
    setUploadingDocType(documentType);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);
      formData.append('requiredFor', currentUseCase);

      const res = await fetch(`/api/customers/${editing.id}/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json() as { data?: CustomerDocument[]; readiness?: CustomerReadinessSummary; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      setCustomerDocuments(json.data ?? []);
      setForm((prev) => ({ ...prev, documents: json.data ?? [], readiness: json.readiness }));
      fetchCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingDocType(null);
    }
  }

  async function handleMarkDocumentVerified(document: CustomerDocument) {
    if (!editing || !token) return;
    setUploadingDocType(document.documentType);
    try {
      const res = await fetch(`/api/customers/${editing.id}/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: document.status === 'verified' ? 'uploaded' : 'verified' }),
      });
      const json = await res.json() as { data?: CustomerDocument[]; readiness?: CustomerReadinessSummary; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Update failed');
      setCustomerDocuments(json.data ?? []);
      setForm((prev) => ({ ...prev, documents: json.data ?? [], readiness: json.readiness }));
      fetchCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUploadingDocType(null);
    }
  }

  function documentsForType(documentType: CustomerDocumentType) {
    return customerDocuments.filter((doc) => doc.documentType === documentType && doc.status !== 'rejected');
  }

  function readinessStatusLabel(status: CustomerReadinessSummary['status']) {
    if (status === 'complete') return isThai ? 'พร้อมใช้งาน' : 'Ready';
    if (status === 'not_required') return isThai ? 'เอกสารไม่จำเป็น' : 'No evidence needed';
    if (status === 'partial') return isThai ? 'ใกล้ครบ' : 'Almost ready';
    return totalMissingCount > 0
      ? (isThai ? `ยังขาด ${totalMissingCount} รายการ` : `${totalMissingCount} item${totalMissingCount > 1 ? 's' : ''} to review`)
      : (isThai ? 'ควรตรวจเพิ่ม' : 'Review suggested');
  }

  function readinessStatusClass(status: CustomerReadinessSummary['status']) {
    if (status === 'complete') return 'border border-emerald-200 bg-white text-emerald-700';
    if (status === 'not_required') return 'border border-slate-200 bg-white text-slate-600';
    return 'border border-amber-200 bg-white text-amber-700';
  }

  const activeCount = customers.filter((customer) => customer.isActive).length;
  const inactiveCount = customers.length - activeCount;
  const supplierCount = customers.filter((customer) => customer.partyRole === 'supplier' || customer.partyRole === 'both' || customer.useCase === 'vendor_payee').length;
  const customerCount = customers.filter((customer) => customer.partyRole !== 'supplier').length;
  const creditCustomerCount = customers.filter((customer) => customer.creditDays != null || customer.creditLimit != null || customer.useCase === 'credit').length;
  const evidenceReviewCount = customers.filter((customer) => {
    const readiness = customer.readiness;
    if (!readiness) return customer.vatEvidenceStatus === 'missing' || customer.verificationStatus === 'missing' || customer.verificationStatus === 'partial';
    return readiness.status === 'missing' || readiness.status === 'partial' || readiness.missingRequiredCount > 0;
  }).length;
  const totalCreditLimit = customers.reduce((sum, customer) => {
    const amount = optionalCreditLimit(customer.creditLimit);
    return amount !== null && !Number.isNaN(amount) ? sum + amount : sum;
  }, 0);
  const workItems = [
    {
      label: isThai ? 'ลูกค้าใช้งาน' : 'Active customers',
      value: activeCount,
      detail: isThai ? `${inactiveCount} ปิดใช้งาน` : `${inactiveCount} inactive`,
      icon: Users,
      tone: activeCount > 0 ? 'clear' : 'idle',
    },
    {
      label: isThai ? 'ผู้ขาย/ผู้รับเงิน' : 'Vendors/payees',
      value: supplierCount,
      detail: isThai ? `${customerCount} ฝั่งขาย` : `${customerCount} sales-side`,
      icon: Truck,
      tone: supplierCount > 0 ? 'needs' : 'idle',
    },
    {
      label: isThai ? 'เครดิต' : 'Credit terms',
      value: creditCustomerCount,
      detail: totalCreditLimit > 0 ? formatMoney(totalCreditLimit, isThai ? 'th-TH' : 'en-US') : (isThai ? 'ยังไม่มีวงเงิน' : 'No credit limit'),
      icon: Handshake,
      tone: creditCustomerCount > 0 ? 'clear' : 'idle',
    },
    {
      label: isThai ? 'ต้องตรวจเอกสาร' : 'Evidence review',
      value: evidenceReviewCount,
      detail: isThai ? 'ภ.พ.20 / สัญญา / KYC' : 'VAT / contract / KYC',
      icon: ShieldCheck,
      tone: evidenceReviewCount > 0 ? 'needs' : 'clear',
    },
  ];
  const statusDotClass = (tone: string) => {
    if (tone === 'overdue') return 'bg-rose-500';
    if (tone === 'needs') return 'bg-amber-500';
    if (tone === 'clear') return 'bg-emerald-500';
    return 'bg-slate-300';
  };

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog dialog={confirmDialog} />
      <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <SectionSubNav
        items={[
          { key: 'customers', to: '/app/customers', label: isThai ? 'ลูกค้า' : 'Customers', icon: Users },
          { key: 'products', to: '/app/products', label: isThai ? 'สินค้า/บริการ' : 'Products & Services', icon: Package },
        ]}
      />
      <section className="premium-hero premium-hero-dark overflow-hidden p-3.5 sm:p-6 lg:p-7">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.7fr)] lg:items-stretch">
          <div className="min-w-0">
            <p className="premium-eyebrow">{isThai ? 'Customer Master Ledger' : 'Customer Master Ledger'}</p>
            <div className="mt-3 flex items-center gap-3 sm:mt-4">
              <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-amber-100 ring-1 ring-white/10 sm:inline-flex">
                <Database className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-white sm:text-3xl">
                  {isThai ? 'รายชื่อลูกค้าและผู้ขาย' : 'Customer & Vendor Directory'}
                </h1>
                <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-white/70 sm:block">
                  {isThai ? 'เก็บ master data สำหรับออกเอกสารขาย ซื้อ โปรเจค และ Customer Portal' : 'Keep master data ready for sales, purchases, projects, and Customer Portal.'}
                </p>
              </div>
            </div>
            <div className="mt-4 sm:mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
                {isThai ? 'รายชื่อในมุมมองนี้' : 'Directory entries in this view'}
              </p>
              <p className="mt-1 text-[clamp(2rem,4vw,2.5rem)] font-bold leading-none text-white tabular-nums">
                {customers.length}
              </p>
              <div className="mt-3 h-px w-40 bg-amber-200/80" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:mt-5 sm:gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 sm:px-4 sm:py-3">
                <p className="text-xs font-semibold text-white/55">{isThai ? 'ใช้งานอยู่' : 'Active'}</p>
                <p className="mt-1 font-bold text-white tabular-nums">{activeCount}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 sm:px-4 sm:py-3">
                <p className="text-xs font-semibold text-white/55">{isThai ? 'ต้องตรวจเอกสาร' : 'Evidence review'}</p>
                <p className="mt-1 font-bold text-white tabular-nums">{evidenceReviewCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 sm:p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Users className="h-4 w-4 text-amber-100" />
              {isThai ? 'จัดการรายชื่อ' : 'Directory actions'}
            </div>
            {policy && (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                <p className="text-xs font-semibold text-white/55">{isThai ? `แพ็กเกจ ${policy.planLabel}` : `${policy.planLabel} plan`}</p>
                <p className="mt-1 text-sm font-bold text-white tabular-nums">
                  {policy.usage.customers}{policy.maxCustomers ? ` / ${policy.maxCustomers}` : ''} {isThai ? 'รายชื่อ' : 'entries'}
                </p>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <button
                onClick={() => openCreate('customer')}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-primary-900 shadow-sm transition hover:bg-amber-50 disabled:opacity-60 sm:px-4 sm:py-2.5"
                disabled={!!policy && policy.maxCustomers !== null && policy.usage.customers >= policy.maxCustomers}
              >
                <Plus className="h-4 w-4" />
                {isThai ? 'เพิ่มลูกค้า' : 'Add customer'}
              </button>
              <button
                onClick={() => openCreate('supplier')}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-60 sm:px-4 sm:py-2.5"
                disabled={!!policy && policy.maxCustomers !== null && policy.usage.customers >= policy.maxCustomers}
              >
                <Truck className="h-4 w-4" />
                {isThai ? 'เพิ่มผู้ขาย' : 'Add vendor'}
              </button>
              <Link to="/app/products" className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/15 sm:col-span-1 sm:px-4 sm:py-2.5">
                <Package className="h-4 w-4" />
                {isThai ? 'สินค้า/บริการ' : 'Products'}
              </Link>
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

      {/* Search */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['all', 'customer', 'supplier'] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setPartyRoleFilter(role)}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  partyRoleFilter === role
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {role === 'supplier' ? <Truck className="h-3.5 w-3.5" /> : <Handshake className="h-3.5 w-3.5" />}
                {role === 'all' ? (isThai ? 'ทั้งหมด' : 'All') : partyRoleLabel(role)}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isThai ? 'ค้นหาชื่อหรือเลขผู้เสียภาษี' : 'Search name or tax ID'}
              className="input-field pl-9"
            />
          </div>
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
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
                <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${partyRoleBadgeClass(c.partyRole)}`}>
                  {c.partyRole === 'supplier' ? <Truck className="h-3 w-3" /> : <Handshake className="h-3 w-3" />}
                  {partyRoleLabel(c.partyRole)}
                </span>
                {creditTermsText(c) && (
                  <p className="text-xs text-slate-500">{creditTermsText(c)}</p>
                )}
                {/* Row 3: tax ID */}
              {c.taxId && (
                <p className="text-xs text-gray-400 font-mono">
                  {customerIdLabel(c)}: {maskedCustomerId(c)}
                </p>
              )}
              {/* Row 4: actions */}
              <div className="flex items-center gap-2 pt-2">
                <Link
                  to={`/app/customers/${c.id}/statement`}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {isThai ? 'เอกสาร' : 'Invoices'}
                </Link>
                <button
                  onClick={() => openEdit(c)}
                  className="inline-flex items-center gap-1 rounded-lg border border-primary-100 bg-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  {t('common.edit')}
                </button>
                {c.isActive && (
                  <button
                    onClick={() => handleDeactivate(c.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
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
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-950">{isThai ? 'Customer master ledger' : 'Customer master ledger'}</h2>
          <p className="mt-1 text-xs text-slate-500">{isThai ? 'ตรวจข้อมูลลูกค้า ผู้ขาย เลขภาษี ช่องทางติดต่อ และ statement' : 'Review customers, vendors, tax IDs, contact channels, and statements.'}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
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
                        <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${partyRoleBadgeClass(c.partyRole)}`}>
                          {c.partyRole === 'supplier' ? <Truck className="h-3 w-3" /> : <Handshake className="h-3 w-3" />}
                          {partyRoleLabel(c.partyRole)}
                        </span>
                        {creditTermsText(c) && (
                          <p className="mt-1 text-xs text-slate-500">{creditTermsText(c)}</p>
                        )}
                      </td>
                    <td className="table-cell font-mono text-xs hidden sm:table-cell">{maskedCustomerId(c)}</td>
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
                        {c.email && (
                          <button
                            onClick={() => handleSendPortalLink(c)}
                            className="p-1 text-primary-500 hover:text-primary-700"
                            title={isThai ? 'ส่งลิงก์ Customer Portal ให้ลูกค้า' : 'Send Customer Portal link'}
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
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
                  {editing
                    ? (isThai ? 'แก้ไขรายชื่อ' : 'Edit directory entry')
                    : (isThai ? 'เพิ่มรายชื่อ' : 'Add directory entry')}
                </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
                {error && (
                  <div className="rounded-xl border border-rose-200 bg-white p-3 text-sm font-semibold text-rose-700">{error}</div>
                )}

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
                  {CUSTOMER_USE_CASE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        field('useCase', option.value);
                        setShowEvidenceDetails(false);
                      }}
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

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <ShieldCheck className="h-4 w-4 text-slate-500" />
                      {isThai ? 'ข้อมูลและเอกสารประกอบ' : 'Details and supporting documents'}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {isThai
                        ? 'ไฟล์จริงเก็บใน Google Drive เป็นหมวด ส่วน Billboy และ Sheet ใช้เป็นสารบัญลิงก์ตรวจ audit'
                        : 'Files live in organized Google Drive folders. Billboy and Sheets keep the audit index and links.'}
                    </p>
                  </div>
                  <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${readinessStatusClass(localReadiness.status)}`}>
                    {readinessStatusLabel(localReadiness.status)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="font-semibold text-slate-900">{summaryReviewCount}</div>
                    <div className="mt-0.5 text-slate-500">{isThai ? 'ควรตรวจ' : 'To review'}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="font-semibold text-slate-900">{attachedEvidenceCount}</div>
                    <div className="mt-0.5 text-slate-500">{isThai ? 'แนบแล้ว' : 'Attached'}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="font-semibold text-slate-900">{evidenceItems.length}</div>
                    <div className="mt-0.5 text-slate-500">{isThai ? 'เอกสารประกอบ' : 'Evidence'}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  {editing ? (
                    <>
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800 transition hover:bg-primary-100">
                        {uploadingDocType === 'other' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {isThai ? 'แนบไฟล์ทั่วไป' : 'Attach general file'}
                        <input
                          type="file"
                          className="hidden"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          disabled={uploadingDocType === 'other'}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            handleUploadCustomerDocument('other', file);
                          }}
                        />
                      </label>
                      {evidenceFolderUrl ? (
                        <a
                          href={evidenceFolderUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <FolderOpen className="h-4 w-4" />
                          {isThai ? 'เปิดโฟลเดอร์ Drive' : 'Open Drive folder'}
                        </a>
                      ) : (
                        <span className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                          {isThai ? 'โฟลเดอร์ Drive จะสร้างเมื่อแนบไฟล์แรก' : 'Drive folder is created on the first upload'}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                      {isThai ? 'บันทึกรายชื่อก่อน แล้วค่อยแนบไฟล์' : 'Save this name first, then attach files'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowEvidenceDetails((value) => !value)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {showEvidenceDetails || summaryReviewCount > 0
                      ? (isThai ? 'ซ่อนรายการเอกสาร' : 'Hide document checklist')
                      : (isThai ? 'ดูเอกสารที่แนบแล้ว' : 'View attached documents')}
                    <ChevronDown className={`h-4 w-4 transition-transform ${showEvidenceDetails || summaryReviewCount > 0 ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {(showEvidenceDetails || summaryReviewCount > 0) && (
                  <div className="mt-3 space-y-4">
                    {[
                      {
                        key: 'required',
                        title: isThai ? 'จำเป็นสำหรับงานนี้' : 'Recommended for this work',
                        items: requiredEvidenceItems,
                      },
                      {
                        key: 'optional',
                        title: isThai ? 'แนบเมื่อจำเป็น' : 'Attach when needed',
                        items: optionalEvidenceItems,
                      },
                    ].filter((group) => group.items.length > 0).map((group) => (
                      <div key={group.key} className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</div>
                        {group.items.map((item) => {
                          const docs = item.documentType ? documentsForType(item.documentType) : [];
                          const isUploading = item.documentType && uploadingDocType === item.documentType;
                          return (
                            <div key={item.key} className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm text-slate-700">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-start gap-2">
                                  {item.complete ? (
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                  ) : (
                                    <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${item.required ? 'text-amber-600' : 'text-slate-400'}`} />
                                  )}
                                  <div>
                                    <p className="font-medium text-slate-900">{isThai ? item.labelTh : item.labelEn}</p>
                                    <p className="text-xs text-slate-500">
                                      {item.complete
                                        ? (isThai ? 'ครบแล้ว' : 'Complete')
                                        : item.required
                                          ? (isThai ? 'ควรตรวจเพิ่ม' : 'Review suggested')
                                          : (isThai ? 'ไม่บังคับ แนบเมื่อจำเป็น' : 'Optional; attach when needed')}
                                    </p>
                                  </div>
                                </div>
                                {item.documentType ? (
                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    {editing ? (
                                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                                        {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                        {docs.length ? (isThai ? 'อัปโหลดเพิ่ม' : 'Upload more') : (isThai ? 'แนบไฟล์' : 'Upload')}
                                        <input
                                          type="file"
                                          className="hidden"
                                          accept="application/pdf,image/jpeg,image/png,image/webp"
                                          disabled={!!isUploading}
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            handleUploadCustomerDocument(item.documentType!, file);
                                          }}
                                        />
                                      </label>
                                    ) : (
                                      <span className="text-xs text-slate-500">{isThai ? 'บันทึกก่อน แล้วค่อยแนบไฟล์' : 'Save first, then attach files'}</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-500">{isThai ? 'กรอกในฟอร์มหลัก' : 'Fill in the main form'}</span>
                                )}
                              </div>
                              {docs.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {docs.map((doc) => (
                                    <span key={doc.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                                      <span className="truncate">{doc.fileName}</span>
                                      {doc.driveUrl && (
                                        <a href={doc.driveUrl} target="_blank" rel="noreferrer" className="text-primary-700 hover:text-primary-900">
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleMarkDocumentVerified(doc)}
                                        className={doc.status === 'verified' ? 'text-emerald-700' : 'text-slate-500 hover:text-emerald-700'}
                                        title={isThai ? 'สลับสถานะตรวจแล้ว' : 'Toggle verified'}
                                      >
                                        <CheckCircle2 className="h-3 w-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="btn-secondary">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isThai ? 'บันทึกรายชื่อ' : 'Save entry'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
