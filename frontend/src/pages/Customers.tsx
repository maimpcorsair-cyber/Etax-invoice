import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Edit2, UserX, FileText, X, Save, Loader2, Users, ReceiptText, Database, CheckCircle2, AlertTriangle, Upload, ExternalLink, ShieldCheck, Handshake, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { Customer, CustomerDocument, CustomerDocumentType, CustomerKind, CustomerPartyRole, CustomerReadinessSummary, CustomerUseCase } from '../types';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import { digitsOnly, englishTextOnly, guardedInputClass, inputGuide, isEnglishText, isFiveDigitBranchCode, isThaiText, isThirteenDigitId, thaiTextOnly } from '../lib/inputGuards';

const EMPTY_FORM: Omit<Customer, 'id' | 'companyId' | 'isActive' | 'createdAt'> = {
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
  documents: [],
};

const CUSTOMER_USE_CASE_OPTIONS: Array<{ value: CustomerUseCase; labelTh: string; labelEn: string }> = [
  { value: 'general', labelTh: 'ซื้อขายทั่วไป', labelEn: 'General trading' },
  { value: 'full_tax_invoice', labelTh: 'ออกใบกำกับภาษีเต็มรูป', labelEn: 'Full tax invoice' },
  { value: 'credit', labelTh: 'เปิดเครดิต', labelEn: 'Credit account' },
  { value: 'contract_project', labelTh: 'ทำสัญญา/โครงการ', labelEn: 'Contract / project' },
  { value: 'vendor_payee', labelTh: 'คู่ค้า/ผู้รับเงิน', labelEn: 'Vendor / payee' },
];

const PARTY_ROLE_OPTIONS: Array<{ value: CustomerPartyRole; labelTh: string; labelEn: string; descriptionTh: string; descriptionEn: string }> = [
  { value: 'customer', labelTh: 'ลูกค้า', labelEn: 'Customer', descriptionTh: 'ใช้กับเอกสารขายและลูกหนี้', descriptionEn: 'For sales documents and receivables' },
  { value: 'supplier', labelTh: 'ซัพพลายเออร์', labelEn: 'Supplier', descriptionTh: 'ใช้กับบันทึกซื้อ ภาษีซื้อ และจ่ายเงิน', descriptionEn: 'For purchases, input VAT, and payments' },
  { value: 'both', labelTh: 'ทั้งสอง', labelEn: 'Both', descriptionTh: 'บริษัทเดียวกันเป็นได้ทั้งลูกค้าและผู้ขาย', descriptionEn: 'Same party can be buyer and vendor' },
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

const THAI_CHARACTER_PATTERN = /[\u0E00-\u0E7F]/;
const THAI_ADDRESS_TERMS: Array<[RegExp, string]> = [
  [/กรุงเทพมหานคร|กรุงเทพฯ|กทม\./g, 'Bangkok'],
  [/บริษัท/g, 'Company'],
  [/จำกัด\s*\(มหาชน\)/g, 'Public Company Limited'],
  [/จำกัด/g, 'Co., Ltd.'],
  [/ประเทศไทย/g, 'Thailand'],
  [/สำนักงานใหญ่/g, 'Head Office'],
  [/เลขที่/g, 'No. '],
  [/อาคาร/g, 'Building '],
  [/ชั้นที่|ชั้น/g, 'Floor '],
  [/เลขที่ห้อง/g, 'Room '],
  [/หมู่บ้าน/g, 'Village '],
  [/หมู่/g, 'Moo '],
  [/ซอย/g, 'Soi '],
  [/ถนน/g, 'Road '],
  [/แขวง/g, 'Khwaeng '],
  [/ตำบล/g, 'Tambon '],
  [/เขต/g, 'Khet '],
  [/อำเภอ/g, 'Amphoe '],
  [/จังหวัด/g, 'Changwat '],
  [/อรกานต์/g, 'Orakarn'],
  [/เอสเอสพี\s*ทาวเวอร์/g, 'SSP Tower'],
  [/พระรามที่\s*2/g, 'Rama II'],
  [/บางมด/g, 'Bang Mot'],
  [/จอมทอง/g, 'Chom Thong'],
  [/ชิดลม/g, 'Chit Lom'],
  [/เพลินจิต/g, 'Phloen Chit'],
  [/ลุมพินี/g, 'Lumphini'],
  [/ปทุมวัน/g, 'Pathum Wan'],
  [/คลองเตย/g, 'Khlong Toei'],
  [/ระนอง/g, 'Ranong'],
  [/สุขุมวิท/g, 'Sukhumvit'],
  [/สาทร/g, 'Sathon'],
  [/สีลม/g, 'Si Lom'],
  [/บางรัก/g, 'Bang Rak'],
  [/วัฒนา/g, 'Watthana'],
  [/ห้วยขวาง/g, 'Huai Khwang'],
  [/ดินแดง/g, 'Din Daeng'],
  [/บางนา/g, 'Bang Na'],
  [/ลาดพร้าว/g, 'Lat Phrao'],
  [/จตุจักร/g, 'Chatuchak'],
];

const THAI_ROMANIZATION_BY_CODE: Record<number, string> = {
  0x0e01: 'k', 0x0e02: 'kh', 0x0e03: 'kh', 0x0e04: 'kh', 0x0e05: 'kh', 0x0e06: 'kh', 0x0e07: 'ng',
  0x0e08: 'ch', 0x0e09: 'ch', 0x0e0a: 'ch', 0x0e0b: 's', 0x0e0c: 'ch', 0x0e0d: 'y',
  0x0e0e: 'd', 0x0e0f: 't', 0x0e10: 'th', 0x0e11: 'th', 0x0e12: 'th', 0x0e13: 'n',
  0x0e14: 'd', 0x0e15: 't', 0x0e16: 'th', 0x0e17: 'th', 0x0e18: 'th', 0x0e19: 'n',
  0x0e1a: 'b', 0x0e1b: 'p', 0x0e1c: 'ph', 0x0e1d: 'f', 0x0e1e: 'ph', 0x0e1f: 'f', 0x0e20: 'ph', 0x0e21: 'm',
  0x0e22: 'y', 0x0e23: 'r', 0x0e24: 'rue', 0x0e25: 'l', 0x0e26: 'lue', 0x0e27: 'w', 0x0e28: 's', 0x0e29: 's',
  0x0e2a: 's', 0x0e2b: 'h', 0x0e2c: 'l', 0x0e2d: 'o', 0x0e2e: 'h',
  0x0e30: 'a', 0x0e32: 'a', 0x0e33: 'am', 0x0e34: 'i', 0x0e35: 'i', 0x0e36: 'ue', 0x0e37: 'ue',
  0x0e38: 'u', 0x0e39: 'u', 0x0e40: 'e', 0x0e41: 'ae', 0x0e42: 'o', 0x0e43: 'ai', 0x0e44: 'ai',
};

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
  const [partyRoleFilter, setPartyRoleFilter] = useState<CustomerPartyRole | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [customerKind, setCustomerKind] = useState<CustomerKind>('company');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customerDocuments, setCustomerDocuments] = useState<CustomerDocument[]>([]);
  const [uploadingDocType, setUploadingDocType] = useState<CustomerDocumentType | null>(null);
  const [dbdQuery, setDbdQuery] = useState('');
  const [dbdSuggestions, setDbdSuggestions] = useState<DbdLocalSuggestion[]>([]);
  const [dbdLoading, setDbdLoading] = useState(false);
  const [dbdNotice, setDbdNotice] = useState('');
  const [appliedDbdSuggestion, setAppliedDbdSuggestion] = useState<DbdLocalSuggestion | null>(null);
  const isIndividual = customerKind === 'individual';
  const currentUseCase = (form.useCase ?? 'general') as CustomerUseCase;
  const currentPartyRole = (form.partyRole ?? 'customer') as CustomerPartyRole;
  const isSupplierRole = currentPartyRole === 'supplier' || currentPartyRole === 'both' || currentUseCase === 'vendor_payee';
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
      labelTh: isCompany ? (isSupplierRole ? 'ข้อมูลซัพพลายเออร์ครบถ้วน' : 'ข้อมูลบริษัทครบถ้วน') : 'ข้อมูลบุคคลครบถ้วน',
      labelEn: isCompany ? (isSupplierRole ? 'Supplier details complete' : 'Company details complete') : 'Individual details complete',
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
      setError(isThai ? 'ถึงจำนวนคู่ค้าสูงสุดของแพ็กเกจแล้ว' : 'You reached the counterparty limit for this plan');
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
      documents: c.documents ?? [],
      readiness: c.readiness,
    });
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

      const payload = isIndividual
        ? {
          ...form,
          partyRole: currentPartyRole,
          customerKind: 'individual',
        useCase: currentUseCase,
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
    if (!confirm(isThai ? 'ยืนยันการปิดใช้งานลูกค้านี้?' : 'Deactivate this customer?')) return;
    await fetch(`/api/customers/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchCustomers();
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

  function setPartyRole(nextRole: CustomerPartyRole) {
    setError('');
    setForm((prev) => {
      const current = (prev.useCase ?? 'general') as CustomerUseCase;
      const nextUseCase = nextRole === 'supplier' && current === 'general'
        ? 'vendor_payee'
        : nextRole === 'customer' && current === 'vendor_payee'
          ? 'general'
          : current;
      return { ...prev, partyRole: nextRole, useCase: nextUseCase };
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
    if (role === 'supplier') return isThai ? 'ซัพพลายเออร์' : 'Supplier';
    if (role === 'both') return isThai ? 'ลูกค้า + ซัพพลายเออร์' : 'Customer + supplier';
    return isThai ? 'ลูกค้า' : 'Customer';
  }

  function partyRoleBadgeClass(role?: string | null) {
    if (role === 'supplier') return 'bg-amber-50 text-amber-700 ring-amber-100';
    if (role === 'both') return 'bg-violet-50 text-violet-700 ring-violet-100';
    return 'bg-blue-50 text-blue-700 ring-blue-100';
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

  function translateThaiTextFallback(value: string | null | undefined) {
    if (!value) return '';
    let translated = value;
    for (const [pattern, replacement] of THAI_ADDRESS_TERMS) {
      translated = translated.replace(pattern, replacement);
    }
    translated = Array.from(translated).map((char) => {
      if (!THAI_CHARACTER_PATTERN.test(char)) return char;
      return THAI_ROMANIZATION_BY_CODE[char.charCodeAt(0)] ?? '';
    }).join('');

    const cleaned = translated
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.)])/g, '$1')
      .replace(/([(])\s+/g, '$1')
      .trim();
    return /[A-Za-z]/.test(cleaned) ? cleaned : '';
  }

  function applyDbdSuggestion(suggestion: DbdLocalSuggestion) {
    setForm((prev) => {
      const addressTh = suggestion.addressTh ?? suggestion.vatAddress ?? prev.addressTh;
      const nameEn = suggestion.nameEn ?? (prev.nameEn?.trim() ? prev.nameEn : translateThaiTextFallback(suggestion.nameTh));
      const addressEn = suggestion.addressEn ?? (prev.addressEn?.trim() ? prev.addressEn : translateThaiTextFallback(addressTh));

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

  function readinessTone(status: CustomerReadinessSummary['status']) {
    if (status === 'complete') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (status === 'not_required') return 'border-slate-200 bg-slate-50 text-slate-700';
    if (status === 'partial') return 'border-amber-200 bg-amber-50 text-amber-800';
    return 'border-rose-200 bg-rose-50 text-rose-800';
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isThai ? 'ลูกค้าและซัพพลายเออร์' : 'Customers & Suppliers'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isThai ? 'ฐานข้อมูลคู่ค้ากลาง ใช้ร่วมกับเอกสารขาย บันทึกซื้อ ภาษี และการจ่ายเงิน' : 'One counterparty master for sales, purchases, VAT, and payments.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openCreate('customer')}
            className="btn-secondary"
            disabled={!!policy && policy.maxCustomers !== null && policy.usage.customers >= policy.maxCustomers}
          >
            <Plus className="w-4 h-4" />
            {isThai ? 'เพิ่มลูกค้า' : 'Add customer'}
          </button>
          <button
            onClick={() => openCreate('supplier')}
            className="btn-primary"
            disabled={!!policy && policy.maxCustomers !== null && policy.usage.customers >= policy.maxCustomers}
          >
            <Truck className="w-4 h-4" />
            {isThai ? 'เพิ่มซัพพลายเออร์' : 'Add supplier'}
          </button>
        </div>
      </div>

      {policy && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900">
          {isThai
            ? `คู่ค้าในแพ็กเกจ ${policy.planLabel}: ${policy.usage.customers}${policy.maxCustomers ? ` / ${policy.maxCustomers}` : ''}`
            : `Counterparties on ${policy.planLabel}: ${policy.usage.customers}${policy.maxCustomers ? ` / ${policy.maxCustomers}` : ''}`}
        </div>
      )}

      {/* Search */}
      <div className="card">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['all', 'customer', 'supplier', 'both'] as const).map((role) => (
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
              placeholder={isThai ? 'ค้นหาชื่อ เลขผู้เสียภาษี ลูกค้า หรือซัพพลายเออร์' : 'Search name, tax ID, customer, or supplier'}
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
                <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${partyRoleBadgeClass(c.partyRole)}`}>
                  {c.partyRole === 'supplier' ? <Truck className="h-3 w-3" /> : <Handshake className="h-3 w-3" />}
                  {partyRoleLabel(c.partyRole)}
                </span>
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
                        <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${partyRoleBadgeClass(c.partyRole)}`}>
                          {c.partyRole === 'supplier' ? <Truck className="h-3 w-3" /> : <Handshake className="h-3 w-3" />}
                          {partyRoleLabel(c.partyRole)}
                        </span>
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
                    ? (isThai ? 'แก้ไขคู่ค้า' : 'Edit counterparty')
                    : currentPartyRole === 'supplier'
                      ? (isThai ? 'เพิ่มซัพพลายเออร์' : 'Add supplier')
                      : (isThai ? 'เพิ่มลูกค้า' : 'Add customer')}
                </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
                )}

                <div>
                  <label className="label">{isThai ? 'บทบาทในระบบ' : 'Role in Billboy'}</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {PARTY_ROLE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPartyRole(option.value)}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          currentPartyRole === option.value
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

              <div>
                <label className="label">{isThai ? 'ประเภทการใช้งาน' : 'Usage type'}</label>
                <select
                  value={currentUseCase}
                  onChange={(e) => field('useCase', e.target.value)}
                  className="input-field"
                >
                  {CUSTOMER_USE_CASE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {isThai ? option.labelTh : option.labelEn}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  {isThai
                    ? 'ระบบจะเตือนเอกสารที่ควรมีตามเคส แต่ยังไม่บล็อกการทำงาน'
                    : 'Billboy shows the recommended evidence for this case without blocking the workflow.'}
                </p>
              </div>

              <div className={`rounded-xl border p-4 ${readinessTone(localReadiness.status)}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <ShieldCheck className="h-4 w-4" />
                      {isThai ? 'ความพร้อมของข้อมูลลูกค้า' : 'Customer readiness'}
                    </div>
                    <p className="mt-1 text-xs opacity-85">
                      {isThai
                        ? 'เตือนก่อน ไม่บล็อกงาน: แนบเฉพาะเอกสารที่จำเป็นกับเคสนี้'
                        : 'Warn first, do not block: attach only evidence needed for this case.'}
                    </p>
                  </div>
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-xs font-semibold">
                    {localReadiness.status === 'complete'
                      ? (isThai ? 'พร้อม' : 'Complete')
                      : localReadiness.status === 'not_required'
                        ? (isThai ? 'เอกสารไม่จำเป็น' : 'No evidence needed')
                        : localReadiness.status === 'partial'
                          ? (isThai ? 'ใกล้ครบ' : 'Partial')
                          : (isThai ? 'ต้องตรวจเพิ่ม' : 'Action needed')}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {localReadiness.items.map((item) => {
                    const docs = item.documentType ? documentsForType(item.documentType) : [];
                    const isUploading = item.documentType && uploadingDocType === item.documentType;
                    return (
                      <div key={item.key} className="rounded-lg bg-white/80 px-3 py-2 text-sm text-slate-700 ring-1 ring-white/70">
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
                                {item.required
                                  ? (isThai ? 'ควรมีสำหรับเคสนี้' : 'Recommended for this case')
                                  : (isThai ? 'optional เฉพาะกรณีจำเป็น' : 'Optional only when needed')}
                              </p>
                            </div>
                          </div>
                          {item.documentType && (
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              {editing ? (
                                <>
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
                                </>
                              ) : (
                                <span className="text-xs text-slate-500">{isThai ? 'บันทึกก่อนแนบไฟล์' : 'Save first'}</span>
                              )}
                            </div>
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
              </div>

              {!isIndividual && (
                <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-teal-900">
                          <Database className="h-4 w-4" />
                          {isSupplierRole ? (isThai ? 'ค้นข้อมูลซัพพลายเออร์' : 'Supplier lookup') : (isThai ? 'ค้นข้อมูลบริษัท' : 'Company lookup')}
                        </div>
                      <p className="mt-1 text-xs text-teal-700">
                        {isThai
                            ? 'เติมชื่อ เลขผู้เสียภาษี และที่อยู่จากข้อมูลเปิดหรือข้อมูลที่เคยบันทึกไว้'
                            : 'Fill name, tax ID, and address from open data or saved counterparty records.'}
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
                      placeholder={isThai ? 'พิมพ์ชื่อบริษัท/ซัพพลายเออร์ หรือเลขผู้เสียภาษีอย่างน้อย 3 ตัว...' : 'Type company/supplier name or at least 3 tax ID digits...'}
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
                          ? (isThai ? 'ชื่อซัพพลายเออร์ (ไทย) *' : 'Supplier name (TH) *')
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
                        : (isThai ? 'ใช้ชื่อภาษาไทยตามเอกสารของคู่ค้า' : 'Use the Thai legal name from the counterparty document.')}
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
                          ? `${isThai ? 'เลขผู้เสียภาษีซัพพลายเออร์' : 'Supplier Tax ID'} * (13 ${isThai ? 'หลัก' : 'digits'})`
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
                  <p className={inputGuide(formValidation.addressTh)}>
                      {isThai ? 'ใช้ที่อยู่ภาษาไทยสำหรับเอกสารภาษีและการตรวจ audit' : 'Use Thai address text for tax documents and audit checks.'}
                  </p>
                </div>
                {!isIndividual && (
                <div className="sm:col-span-2">
                  <label className="label">{t('customer.addressEn')}</label>
                  <textarea value={form.addressEn} onChange={(e) => field('addressEn', englishTextOnly(e.target.value))} className={guardedInputClass(formValidation.addressEn)} rows={2} placeholder="123 Example Road, Bangkok 10110" />
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
                  <label className="label">{t('customer.contactPerson')}</label>
                  <input value={form.contactPerson} onChange={(e) => field('contactPerson', e.target.value)} className="input-field" placeholder={isThai ? 'ชื่อผู้ติดต่อ' : 'Contact person name'} />
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
