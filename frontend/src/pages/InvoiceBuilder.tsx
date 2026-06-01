import { useCallback, useEffect, useRef, useState } from 'react';
import { BriefcaseBusiness, ChevronDown, Eye, Download, FileClock, FileText, Maximize2, RotateCcw, Trash2 } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import { useCompanyProfile } from '../hooks/useCompanyProfile';
import { useCustomerSearch } from '../hooks/useCustomerSearch';
import { formatBankPaymentInfo, useDocumentProfile } from '../hooks/useDocumentProfile';
import { useInvoiceForm } from '../hooks/useInvoiceForm';
import { useInvoicePreview } from '../hooks/useInvoicePreview';
import { addCalendarDays } from '../lib/dateMath';
import InvoiceBuilderHeader from '../components/invoice/InvoiceBuilderHeader';
import IssuedSuccessModal from '../components/invoice/IssuedSuccessModal';
import DocumentSettingsCard from '../components/invoice/DocumentSettingsCard';
import DocumentAppearanceCard from '../components/invoice/DocumentAppearanceCard';
import SellerCard from '../components/invoice/SellerCard';
import BuyerCard from '../components/invoice/BuyerCard';
import ItemsTable from '../components/invoice/ItemsTable';
import NotesPaymentCard from '../components/invoice/NotesPaymentCard';
import WhtCard from '../components/invoice/WhtCard';
import PreviewModal from '../components/invoice/PreviewModal';
import type { BankAccountProfile, DocumentTemplateOption } from '../types';
import { type BuiltinDocumentTemplate, builtinDocumentTemplates, supportsDocumentType } from '../lib/documentTemplatePresets';

const STANDARD_TEMPLATE_VALUE = '__system_standard__';

const swatchColors: Record<string, string> = {
  'bg-white': '#fff',
  'bg-blue-200': '#bfdbfe',
  'bg-blue-900': '#1e3a8a',
  'bg-gray-100': '#f3f4f6',
  'bg-gray-200': '#e5e7eb',
  'bg-gray-400': '#9ca3af',
  'bg-gray-800': '#1f2937',
  'bg-gray-900': '#111827',
  'bg-slate-100': '#f1f5f9',
  'bg-slate-300': '#cbd5e1',
  'bg-slate-400': '#94a3b8',
  'bg-pink-50': '#fdf2f8',
  'bg-pink-100': '#fce7f3',
  'bg-pink-300': '#f9a8d4',
  'bg-pink-400': '#f472b6',
  'bg-sky-50': '#f0f9ff',
  'bg-sky-300': '#7dd3fc',
  'bg-blue-100': '#dbeafe',
  'bg-blue-400': '#60a5fa',
  'bg-yellow-50': '#fefce8',
  'bg-yellow-100': '#fef9c3',
  'bg-yellow-300': '#fde047',
  'bg-yellow-400': '#facc15',
  'bg-emerald-50': '#ecfdf5',
  'bg-emerald-100': '#d1fae5',
  'bg-emerald-300': '#6ee7b7',
  'bg-emerald-400': '#34d399',
  'bg-lime-50': '#f7fee7',
  'bg-lime-300': '#bef264',
  'bg-violet-50': '#f5f3ff',
  'bg-violet-100': '#ede9fe',
  'bg-violet-300': '#c4b5fd',
  'bg-violet-400': '#a78bfa',
  'bg-orange-50': '#fff7ed',
  'bg-amber-300': '#fcd34d',
};

function renderTemplateSwatches(template?: BuiltinDocumentTemplate | null) {
  const swatches = template?.swatches ?? ['bg-blue-900', 'bg-blue-200', 'bg-white'];
  return (
    <div className="flex shrink-0 gap-1" aria-hidden="true">
      {swatches.map((cls, index) => (
        <span
          key={`${cls}-${index}`}
          className="h-3 w-3 rounded-full border border-slate-200"
          style={{ background: swatchColors[cls] ?? '#94a3b8' }}
        />
      ))}
    </div>
  );
}

function getInvoiceValidationErrors(params: {
  isThai: boolean;
  invoiceDate: string;
  items: Array<{ nameTh: string; quantity: number; unitPrice: number }>;
  customerId: string;
  docType: string;
  referenceDocNumber: string;
}) {
  const { isThai, invoiceDate, items, customerId, docType, referenceDocNumber } = params;
  const errors: string[] = [];

  if (!invoiceDate) {
    errors.push(isThai ? 'ยังไม่ได้เลือกวันที่ออกเอกสาร' : 'Invoice date is missing.');
  }
  if (!customerId) {
    errors.push(isThai ? 'ยังไม่ได้เลือกลูกค้า' : 'Customer is not selected.');
  }
  if (items.length === 0) {
    errors.push(isThai ? 'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ' : 'Add at least one item.');
  }

  const emptyNameIdx = items.findIndex((item) => !item.nameTh.trim());
  if (emptyNameIdx !== -1) {
    errors.push(
      isThai
        ? `รายการที่ ${emptyNameIdx + 1} ยังไม่ได้กรอกชื่อสินค้า`
        : `Item row ${emptyNameIdx + 1} is missing a Thai item name.`,
    );
  }

  const zeroQtyIdx = items.findIndex((item) => !(item.quantity > 0));
  if (zeroQtyIdx !== -1) {
    errors.push(
      isThai
        ? `รายการที่ ${zeroQtyIdx + 1} ต้องมีจำนวนมากกว่า 0`
        : `Item row ${zeroQtyIdx + 1} must have quantity greater than 0.`,
    );
  }

  const negPriceIdx = items.findIndex((item) => item.unitPrice < 0);
  if (negPriceIdx !== -1) {
    errors.push(
      isThai
        ? `รายการที่ ${negPriceIdx + 1} มีราคาต่อหน่วยติดลบ`
        : `Item row ${negPriceIdx + 1} has a negative unit price.`,
    );
  }

  if (
    ['receipt', 'credit_note', 'debit_note'].includes(docType) &&
    !referenceDocNumber.trim()
  ) {
    errors.push(
      isThai
        ? 'เอกสารประเภทนี้ต้องระบุเลขที่เอกสารอ้างอิง'
        : 'This document type requires a reference document number.',
    );
  }

  return errors;
}

type SectionKey = 'settings' | 'buyer' | 'items' | 'notes' | 'appearance' | 'seller';

const STEPPER_STEPS: { key: SectionKey; labelTh: string; labelEn: string }[] = [
  { key: 'settings',   labelTh: 'เอกสาร',   labelEn: 'Document' },
  { key: 'buyer',      labelTh: 'ผู้ซื้อ',  labelEn: 'Buyer' },
  { key: 'items',      labelTh: 'รายการ',   labelEn: 'Items' },
  { key: 'notes',      labelTh: 'หมายเหตุ', labelEn: 'Notes' },
  { key: 'appearance', labelTh: 'รูปแบบ',   labelEn: 'Appearance' },
  { key: 'seller',     labelTh: 'ผู้ขาย',   labelEn: 'Seller' },
];

interface ProjectOption {
  id: string;
  code: string;
  name: string;
  status: string;
}

export default function InvoiceBuilder() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isThai } = useLanguage();
  const { token, clearAuth } = useAuthStore();
  const isEdit = Boolean(id);

  const ctx = { token, clearAuth, navigate, isThai };
  const { company } = useCompanyProfile({ token });
  const documentProfile = useDocumentProfile({ token });
  const customer = useCustomerSearch({ token });
  const form = useInvoiceForm(ctx);
  const preview = useInvoicePreview(ctx);

  const [showBuyerSection, setShowBuyerSection] = useState(true);
  const [loadingInvoice, setLoadingInvoice] = useState(isEdit);
  const [loadInvoiceError, setLoadInvoiceError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DocumentTemplateOption[]>([]);
  const [issuedInvoiceId, setIssuedInvoiceId] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState(searchParams.get('projectId') ?? '');
  const [quotationPrefillMessage, setQuotationPrefillMessage] = useState<string | null>(null);
  const [quotationPrefillError, setQuotationPrefillError] = useState<string | null>(null);
  const [prefilledQuotationNumber, setPrefilledQuotationNumber] = useState<string | null>(null);
  const [showDraftRecoveryPrompt, setShowDraftRecoveryPrompt] = useState(false);
  const fromQuotationId = searchParams.get('fromQuotation');

  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const hasCompanyLogo = Boolean(company?.logoUrl);
  const canUseElectronicMode = company?.electronicInvoicingReady === true;

  useEffect(() => {
    if (!token) return;
    void fetch('/api/projects?status=all', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.ok ? res.json() : { data: [] })
      .then((json) => setProjects(json.data ?? []))
      .catch(() => setProjects([]));
  }, [token]);

  // Mobile/tablet tab state
  const [mobileTab, setMobileTab] = useState<'form' | 'preview'>('form');

  // Section stepper active section
  const [activeSection, setActiveSection] = useState<SectionKey>('settings');

  // Section refs for stepper scroll
  const settingsRef  = useRef<HTMLDivElement>(null);
  const appearanceRef = useRef<HTMLDivElement>(null);
  const sellerRef    = useRef<HTMLDivElement>(null);
  const buyerRef     = useRef<HTMLDivElement>(null);
  const itemsRef     = useRef<HTMLDivElement>(null);
  const notesRef     = useRef<HTMLDivElement>(null);
  const formScrollRef = useRef<HTMLDivElement>(null);

  const sectionRefs: Record<SectionKey, React.RefObject<HTMLDivElement>> = {
    settings:   settingsRef,
    appearance: appearanceRef,
    seller:     sellerRef,
    buyer:      buyerRef,
    items:      itemsRef,
    notes:      notesRef,
  };

  // Inline preview state (right panel)
  const [inlinePreviewHtml, setInlinePreviewHtml] = useState<string | null>(null);
  const [inlinePreviewLoading, setInlinePreviewLoading] = useState(false);
  const [inlinePreviewError, setInlinePreviewError] = useState<string | null>(null);
  const [inlineDownloading, setInlineDownloading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.46);
  const lastPayloadRef = useRef<object | null>(null);
  const didApplyDocumentProfile = useRef(false);

  const validationErrors = getInvoiceValidationErrors({
    isThai,
    invoiceDate: form.invoiceDate,
    items: form.items,
    customerId: customer.selectedCustomerId,
    docType: form.docType,
    referenceDocNumber: form.referenceDocNumber,
  });
  const previewValidationErrors = getInvoiceValidationErrors({
    isThai,
    invoiceDate: form.invoiceDate,
    items: form.items,
    customerId: 'preview-customer',
    docType: form.docType,
    referenceDocNumber: form.referenceDocNumber,
  });

  /* ── IntersectionObserver to track active section ── */
  useEffect(() => {
    const scrollEl = formScrollRef.current;
    if (!scrollEl) return;

    const observers: IntersectionObserver[] = [];

    STEPPER_STEPS.forEach(({ key }) => {
      const el = sectionRefs[key].current;
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(key);
        },
        { root: scrollEl, threshold: 0.35 },
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scrollToSection(key: SectionKey) {
    const el = sectionRefs[key].current;
    const container = formScrollRef.current;
    if (!el || !container) return;
    const hasInnerScroll = container.scrollHeight > container.clientHeight + 16;
    if (hasInnerScroll) {
      container.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const applyBankAccount = useCallback((bankAccountId: string) => {
    setSelectedBankAccountId(bankAccountId);
    const account = documentProfile.profile.bankAccounts.find((item) => item.id === bankAccountId);
    form.setBankPaymentInfo(account ? formatBankPaymentInfo(account, isThai) : '');
    form.setPromptPayId(account?.promptPayId ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentProfile.profile.bankAccounts, form.setBankPaymentInfo, form.setPromptPayId, isThai]);

  const handleAddBankAccount = useCallback(async (account: Omit<BankAccountProfile, 'id'>) => {
    const nextAccounts = [...documentProfile.profile.bankAccounts, account];
    const saved = await documentProfile.saveProfile({ bankAccounts: nextAccounts });
    const newAccount = saved?.bankAccounts.find((item) =>
      item.accountNumber === account.accountNumber && item.bankName === account.bankName,
    );
    if (newAccount) {
      setSelectedBankAccountId(newAccount.id);
      form.setBankPaymentInfo(formatBankPaymentInfo(newAccount, isThai));
      form.setPromptPayId(newAccount.promptPayId ?? '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentProfile.profile.bankAccounts, documentProfile.saveProfile, form.setBankPaymentInfo, isThai]);

  useEffect(() => {
    if (didApplyDocumentProfile.current || documentProfile.loading) return;
    const accounts = documentProfile.profile.bankAccounts;
    const defaultAccount = accounts.find((account) => account.isDefault) ?? accounts[0];
    if (!form.bankPaymentInfo && defaultAccount) {
      setSelectedBankAccountId(defaultAccount.id);
      form.setBankPaymentInfo(formatBankPaymentInfo(defaultAccount, isThai));
      form.setPromptPayId(defaultAccount.promptPayId ?? '');
    }

    const signatureProfile = documentProfile.profile.signatureProfile;
    if (signatureProfile) {
      if (!form.signatureImageUrl && signatureProfile.signatureImageUrl) {
        form.setSignatureImageUrl(signatureProfile.signatureImageUrl);
      }
      if (!form.signerName && signatureProfile.signerName) {
        form.setSignerName(signatureProfile.signerName);
      }
      if (!form.signerTitle && signatureProfile.signerTitle) {
        form.setSignerTitle(signatureProfile.signerTitle);
      }
    }
    didApplyDocumentProfile.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    documentProfile.loading,
    documentProfile.profile.bankAccounts,
    documentProfile.profile.signatureProfile,
    form.bankPaymentInfo,
    form.setBankPaymentInfo,
    form.signatureImageUrl,
    form.setSignatureImageUrl,
    form.signerName,
    form.setSignerName,
    form.signerTitle,
    form.setSignerTitle,
    isThai,
  ]);

  /* ── Preview payload builder ── */
  const buildPreviewPayload = useCallback((overrides?: { templateId?: string | null }) => ({
    type: form.docType,
    language: form.docLanguage,
    invoiceDate: form.invoiceDate,
    dueDate: form.docType === 'tax_invoice' && form.dueDate ? form.dueDate : undefined,
    items: form.items.map((item) => ({
      productId: item.productId || undefined,
      nameTh: item.nameTh,
      nameEn: item.nameEn || '',
      descriptionTh: item.descriptionTh || '',
      descriptionEn: item.descriptionEn || '',
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discountAmount: item.discount,
      vatType: item.vatType,
    })),
    notes: form.notes || undefined,
    logoUrl: form.logoUrl || undefined,
    templateId: (overrides?.templateId !== undefined ? overrides.templateId : form.templateId) || undefined,
    documentMode: form.documentMode,
    bankPaymentInfo: form.bankPaymentInfo || undefined,
    promptPayId: form.promptPayId || undefined,
    showCompanyLogo: form.showCompanyLogo,
    signatureImageUrl: form.signatureImageUrl || undefined,
    signerName: form.signerName || undefined,
    signerTitle: form.signerTitle || undefined,
  }), [form]);

  /* ── Inline preview fetch ── */
  const fetchInlinePreview = useCallback(async (payload: object) => {
    if (!token) return;
    setInlinePreviewLoading(true);
    setInlinePreviewError(null);
    lastPayloadRef.current = payload;
    try {
      const response = await fetch('/api/invoices/preview?format=html', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        if (response.status === 401) { clearAuth(); navigate('/login'); return; }
        throw new Error(isThai ? 'โหลดตัวอย่างไม่สำเร็จ' : 'Preview failed');
      }
      const html = await response.text();
      if (html.length < 100) throw new Error(isThai ? 'ตัวอย่างว่างเปล่า' : 'Empty preview');
      setInlinePreviewHtml(html);
    } catch (err) {
      setInlinePreviewError(
        err instanceof Error ? err.message : (isThai ? 'โหลดตัวอย่างไม่สำเร็จ' : 'Preview failed'),
      );
    } finally {
      setInlinePreviewLoading(false);
    }
  }, [token, clearAuth, navigate, isThai]);

  /* ── Debounced trigger on any form change ── */
  const triggerDebouncedPreview = useCallback((overrides?: { templateId?: string | null }) => {
    if (previewValidationErrors.length > 0) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchInlinePreview(buildPreviewPayload(overrides));
    }, 600);
  }, [previewValidationErrors, fetchInlinePreview, buildPreviewPayload]);

  /* ── Immediate preview on template change ── */
  const handleTemplateChange = useCallback((templateId: string | null) => {
    form.setTemplateId(templateId);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (previewValidationErrors.length === 0) {
      fetchInlinePreview(buildPreviewPayload({ templateId }));
    }
    // Also refresh modal if open
    if (preview.previewHtml !== null && previewValidationErrors.length === 0) {
      preview.openPreview(buildPreviewPayload({ templateId }));
    }
  }, [form, previewValidationErrors, fetchInlinePreview, buildPreviewPayload, preview]);

  /* ── Compute scale when panel resizes ── */
  useEffect(() => {
    if (!previewPanelRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width - 64;
        const fitScale = width / 794;
        setPreviewScale(Math.min(0.68, Math.max(0.36, fitScale)));
      }
    });
    observer.observe(previewPanelRef.current);
    return () => observer.disconnect();
  }, []);

  /* ── Trigger preview when form changes (debounced) ── */
  useEffect(() => {
    triggerDebouncedPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.docType, form.docLanguage, form.invoiceDate, form.dueDate,
    form.items, form.notes, form.logoUrl, form.templateId, form.documentMode,
    form.bankPaymentInfo, form.showCompanyLogo, form.signatureImageUrl,
    form.signerName, form.signerTitle, customer.selectedCustomerId,
  ]);

  /* ── Modal preview handler ── */
  const handlePreviewClick = async () => {
    if (previewValidationErrors.length > 0) {
      preview.clearPreviewError();
      return;
    }
    await preview.openPreview(buildPreviewPayload());
  };

  /* ── Inline PDF download ── */
  const handleInlineDownload = async () => {
    if (!token || !lastPayloadRef.current) return;
    setInlineDownloading(true);
    try {
      const response = await fetch('/api/invoices/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(lastPayloadRef.current),
      });
      if (!response.ok) throw new Error(isThai ? 'ดาวน์โหลดล้มเหลว' : 'Download failed');
      const blob = new Blob([await response.arrayBuffer()], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-preview-${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setInlinePreviewError(err instanceof Error ? err.message : (isThai ? 'ดาวน์โหลดล้มเหลว' : 'Download failed'));
    } finally {
      setInlineDownloading(false);
    }
  };

  useEffect(() => {
    const presetType = searchParams.get('type');
    if (!isEdit && !fromQuotationId && presetType && ['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note'].includes(presetType)) {
      form.setDocType(presetType as typeof form.docType);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.setDocType, fromQuotationId, isEdit, searchParams, form.docType]);

  useEffect(() => {
    if (!token || isEdit || !fromQuotationId) return;
    let active = true;

    async function loadQuotationPrefill() {
      setQuotationPrefillMessage(null);
      setQuotationPrefillError(null);
      setPrefilledQuotationNumber(null);
      setShowDraftRecoveryPrompt(false);
      form.clearDraftFromStorage();
      try {
        const res = await fetch(`/api/quotations/${fromQuotationId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json() as { data?: import('../types').Quotation; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed to load quotation');
        if (!active) return;

        if (json.data.status === 'converted' && json.data.convertedToInvoiceId) {
          navigate(`/app/invoices/${json.data.convertedToInvoiceId}/edit`, { replace: true });
          return;
        }
        if (json.data.status !== 'accepted') {
          throw new Error(
            isThai
              ? 'ใบเสนอราคาต้องอยู่สถานะลูกค้ายืนยันแล้วก่อนออกใบกำกับภาษี'
              : 'The quotation must be accepted before creating a tax invoice.',
          );
        }

        form.hydrateFromQuotation(json.data);
        setProjectId(json.data.projectId ?? '');
        customer.setSelectedCustomerId(json.data.buyerId);
        customer.setCustomerSearch(isThai ? (json.data.buyer?.nameTh ?? '') : (json.data.buyer?.nameEn ?? json.data.buyer?.nameTh ?? ''));
        customer.clearResults();
        setShowBuyerSection(true);
        setPrefilledQuotationNumber(json.data.quotationNumber);
        setQuotationPrefillMessage(
          isThai
            ? `เติมข้อมูลจากใบเสนอราคา ${json.data.quotationNumber} แล้ว แก้ไขรายละเอียดก่อนบันทึกหรือออกเอกสารได้`
            : `Prefilled from quotation ${json.data.quotationNumber}. You can edit details before saving or issuing.`,
        );
      } catch (error) {
        if (!active) return;
        setQuotationPrefillError(
          error instanceof Error
            ? error.message
            : (isThai ? 'โหลดข้อมูลใบเสนอราคาไม่สำเร็จ' : 'Could not load quotation prefill.'),
        );
      }
    }

    void loadQuotationPrefill();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fromQuotationId,
    isEdit,
    isThai,
    navigate,
    token,
    form.hydrateFromQuotation,
    form.clearDraftFromStorage,
  ]);

  useEffect(() => {
    if (!token) return;
    let active = true;

    async function loadTemplateOptions() {
      try {
        const res = await fetch('/api/invoices/template-options', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json() as { data?: DocumentTemplateOption[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Failed to load template options');
        if (active) setTemplates(json.data ?? []);
      } catch {
        if (active) setTemplates([]);
      }
    }

    loadTemplateOptions();
    return () => { active = false; };
  }, [token]);

  /* ── Draft recovery — on new invoice, offer to restore from localStorage ── */
  useEffect(() => {
    if (isEdit || fromQuotationId || !token || form.recoveredDraft || form.userDismissedDraft) return;
    setShowDraftRecoveryPrompt(form.hasRecoverableDraft());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromQuotationId, isEdit, token, form.recoveredDraft, form.userDismissedDraft]);

  /* ── Auto-save form to localStorage every 5 seconds (new invoices only) ── */
  useEffect(() => {
    if (isEdit || fromQuotationId || form.saving || form.recoveredDraft || form.userDismissedDraft || showDraftRecoveryPrompt) return;
    const interval = setInterval(() => {
      form.saveDraftToStorage();
    }, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromQuotationId, isEdit, form.saving, form.recoveredDraft, form.userDismissedDraft, showDraftRecoveryPrompt]);

  /* ── Auto-clear draft when successfully issued ── */
  useEffect(() => {
    if (issuedInvoiceId) {
      form.clearDraftFromStorage();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuedInvoiceId, form.clearDraftFromStorage]);

  useEffect(() => {
    if (company && !canUseElectronicMode && form.documentMode === 'electronic') {
      form.setDocumentMode('ordinary');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, canUseElectronicMode, form.documentMode, form.setDocumentMode]);

  useEffect(() => {
    if (company && !hasCompanyLogo && form.showCompanyLogo) {
      form.setShowCompanyLogo(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, hasCompanyLogo, form.showCompanyLogo, form.setShowCompanyLogo]);

  useEffect(() => {
    if (!isEdit || !id || !token) return;
    let active = true;

    async function loadInvoice() {
      setLoadingInvoice(true);
      setLoadInvoiceError(null);
      form.clearSubmitMessage();
      try {
        const res = await fetch(`/api/invoices/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json() as { data?: import('../types').Invoice; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed to load invoice');
        if (!active) return;
        form.hydrateFromInvoice(json.data);
        setProjectId(json.data.projectId ?? '');
        customer.setSelectedCustomerId(json.data.buyer.id);
        customer.setCustomerSearch(isThai ? json.data.buyer.nameTh : (json.data.buyer.nameEn ?? json.data.buyer.nameTh));
        setIsDraft(json.data.status === 'draft' && (json.data.invoiceNumber?.startsWith('DRAFT-') ?? false));
      } catch (error) {
        if (!active) return;
        form.clearSubmitMessage();
        preview.clearPreviewError();
        customer.clearResults();
        if (error instanceof Error) {
          setLoadInvoiceError(
            isThai
              ? `โหลดข้อมูลเอกสารเดิมไม่สำเร็จ: ${error.message}`
              : `Could not load this invoice for editing: ${error.message}`,
          );
        }
      } finally {
        if (active) setLoadingInvoice(false);
      }
    }

    loadInvoice();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    id, isEdit, isThai, token,
    form.hydrateFromInvoice, form.clearSubmitMessage,
    customer.setSelectedCustomerId, customer.setCustomerSearch, customer.clearResults,
    preview.clearPreviewError,
  ]);

  // Build all matching templates for the dropdown
  const matchingBuiltinTemplates = builtinDocumentTemplates.filter((t) => supportsDocumentType(t, form.docType));
  const filteredCustomTemplates = templates.filter((t) =>
    t.type === form.docType && (t.language === form.docLanguage || t.language === 'both' || form.docLanguage === 'both'),
  );
  const selectedBuiltinTemplate = matchingBuiltinTemplates.find((template) => template.id === form.templateId) ?? null;
  const minimalTemplates = matchingBuiltinTemplates.filter((template) => template.tagEn === 'Minimal');
  const cuteTemplates = matchingBuiltinTemplates.filter((template) => template.tagEn === 'Cute');

  /* ── Stepper dot indicator helper ── */
  function stepperDot(key: SectionKey) {
    if (key === 'buyer' && !customer.selectedCustomerId) {
      return <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-500" />;
    }
    if (key === 'items' && form.items.length > 0) {
      return (
        <span className="inline-flex h-4 min-w-[16px] flex-shrink-0 items-center justify-center rounded-full bg-slate-200 px-1 text-[9px] font-bold text-slate-700">
          {form.items.length}
        </span>
      );
    }
    return null;
  }

  /* ── Form panel (shared between desktop left pane and mobile form tab) ── */
  const renderFormPanel = (useInnerScroll = true) => (
    <div className={useInnerScroll ? 'flex h-full min-h-[580px] flex-col overflow-hidden bg-white' : 'flex flex-col bg-white'}>
      {/* Stepper strip */}
      <div className={useInnerScroll
        ? 'flex-shrink-0 border-b border-slate-200 bg-white px-3 py-2'
        : 'border-b border-slate-200 bg-white px-3 py-3 lg:rounded-t-3xl'}
      >
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-6 sm:overflow-visible sm:pb-0">
          {STEPPER_STEPS.map(({ key, labelTh, labelEn }, idx) => {
            const isActive = activeSection === key;
            return (
              <button
                key={key}
                onClick={() => scrollToSection(key)}
                className={`
                  flex min-h-9 min-w-[116px] items-center justify-center gap-1.5 border-b-2 px-2 text-[12px] font-semibold
                  transition-colors sm:min-w-0
                  ${isActive
                    ? 'border-primary-700 bg-white text-primary-800'
                    : 'border-transparent bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'}
                `}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className={`
                  flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold
                  ${isActive ? 'bg-primary-50 text-primary-800' : 'bg-slate-100 text-slate-500'}
                `}>
                  {idx + 1}
                </span>
                <span className="min-w-0 truncate">{isThai ? labelTh : labelEn}</span>
                {stepperDot(key)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable cards area */}
      <div
        ref={formScrollRef}
        className={useInnerScroll
          ? 'flex-1 overflow-y-auto bg-slate-50 px-4 py-4 space-y-4 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4 xl:space-y-0'
          : 'bg-slate-50 px-0 py-3 space-y-4 sm:px-4 sm:py-4 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4 xl:space-y-0'}
      >
        <div ref={settingsRef} className="scroll-mt-28 xl:col-span-2">
          <DocumentSettingsCard
            docType={form.docType}
            onDocTypeChange={form.setDocType}
            docLanguage={form.docLanguage}
            onDocLanguageChange={form.setDocLanguage}
            invoiceDate={form.invoiceDate}
            onInvoiceDateChange={form.setInvoiceDate}
            dueDate={form.dueDate}
            onDueDateChange={form.setDueDate}
            referenceDocNumber={form.referenceDocNumber}
            onReferenceDocNumberChange={form.setReferenceDocNumber}
          />
        </div>
        {projects.length > 0 && (
          <div className="scroll-mt-28 xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <BriefcaseBusiness className="h-4 w-4 text-primary-600" />
              <h2 className="text-sm font-bold text-slate-900">{isThai ? 'โปรเจค / งาน' : 'Project / job'}</h2>
            </div>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="input-field">
              <option value="">{isThai ? 'ไม่ผูกโปรเจค' : 'No project'}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              {isThai ? 'ใบขายนี้จะไปแสดงใน Project Workspace และใช้คำนวณรายรับ/กำไรของโปรเจค' : 'This sales invoice appears in the Project Workspace and counts toward project revenue and margin.'}
            </p>
          </div>
        )}
        <div ref={buyerRef} className="scroll-mt-28 xl:col-span-2">
          <BuyerCard
            customers={customer.customers}
            customerSearch={customer.customerSearch}
            selectedCustomerId={customer.selectedCustomerId}
            showBuyerSection={showBuyerSection}
            onSearchChange={customer.setCustomerSearch}
            onSelectCustomer={(selectedCustomer, name) => {
              form.clearSubmitMessage();
              preview.clearPreviewError();
              customer.setSelectedCustomerId(selectedCustomer.id);
              customer.setCustomerSearch(name);
              customer.clearResults();
              if (form.docType === 'tax_invoice' && !form.dueDate && selectedCustomer.creditDays !== null && selectedCustomer.creditDays !== undefined) {
                const nextDueDate = addCalendarDays(form.invoiceDate, Number(selectedCustomer.creditDays));
                if (nextDueDate) form.setDueDate(nextDueDate);
              }
            }}
            onClearCustomer={customer.clearCustomer}
            onToggleSection={() => setShowBuyerSection((s) => !s)}
          />
        </div>
        <div ref={itemsRef} className="scroll-mt-28 xl:col-span-2">
          <ItemsTable
            items={form.items}
            subtotal={form.subtotal}
            totalVat={form.totalVat}
            total={form.total}
            onAddItem={form.addItem}
            onRemoveItem={form.removeItem}
            onUpdateItem={form.updateItem}
            whtRate={form.whtRate}
            onWhtRateChange={form.setWhtRate}
          />
        </div>
        <div ref={notesRef} className="scroll-mt-28 xl:col-span-2">
          <NotesPaymentCard
            notes={form.notes}
            onNotesChange={form.setNotes}
            paymentMethod={form.paymentMethod}
            onPaymentMethodChange={form.setPaymentMethod}
          />
          <WhtCard
            whtRate={form.whtRate}
            onWhtRateChange={form.setWhtRate}
            subtotal={form.subtotal}
            totalVat={form.totalVat}
            total={form.total}
          />
        </div>
        <div ref={appearanceRef} className="scroll-mt-28 xl:col-span-2">
          <DocumentAppearanceCard
            documentMode={form.documentMode}
            onDocumentModeChange={form.setDocumentMode}
            canUseElectronicMode={canUseElectronicMode}
            onBankPaymentInfoChange={form.setBankPaymentInfo}
            bankAccounts={documentProfile.profile.bankAccounts}
            selectedBankAccountId={selectedBankAccountId}
            onBankAccountSelect={applyBankAccount}
            onAddBankAccount={handleAddBankAccount}
            bankProfileSaving={documentProfile.saving}
            bankProfileError={documentProfile.error}
            showCompanyLogo={form.showCompanyLogo}
            hasCompanyLogo={hasCompanyLogo}
            onShowCompanyLogoChange={form.setShowCompanyLogo}
            documentLogoUrl={form.logoUrl}
            onDocumentLogoChange={form.setLogoUrl}
            signatureImageUrl={form.signatureImageUrl}
            onSignatureImageChange={form.setSignatureImageUrl}
            signerName={form.signerName}
            onSignerNameChange={form.setSignerName}
            signerTitle={form.signerTitle}
            onSignerTitleChange={form.setSignerTitle}
            docType={form.docType}
          />
        </div>
        <div ref={sellerRef} className="scroll-mt-28 xl:col-span-2">
          <SellerCard company={company} />
        </div>
        {/* bottom padding so last card isn't flush */}
        <div className="h-8 xl:col-span-2" />
      </div>
    </div>
  );

  /* ── Preview panel (shared between desktop right pane and mobile preview tab) ── */
  const renderPreviewPanel = (
    <div ref={previewPanelRef} className="flex h-full min-h-[580px] flex-col overflow-hidden bg-slate-100">
      {/* Preview toolbar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-primary-700 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary-100">
          {renderTemplateSwatches(selectedBuiltinTemplate)}
          <div className="min-w-0 flex-1">
            <label className="block text-[10px] font-semibold leading-3 text-slate-400">
              {isThai ? 'เทมเพลตเอกสาร' : 'Document template'}
            </label>
            <div className="relative">
              <select
                value={form.templateId ?? STANDARD_TEMPLATE_VALUE}
                onChange={(event) => handleTemplateChange(event.target.value === STANDARD_TEMPLATE_VALUE ? null : event.target.value)}
                className="w-full appearance-none bg-transparent pr-6 text-xs font-semibold leading-5 text-slate-800 outline-none"
                aria-label={isThai ? 'เลือกเทมเพลตเอกสาร' : 'Choose document template'}
              >
                <option value={STANDARD_TEMPLATE_VALUE}>
                  {isThai ? 'มาตรฐาน - แบบราชการ A4' : 'Standard - official A4'}
                </option>
                {minimalTemplates.length > 0 && (
                  <optgroup label={isThai ? 'เรียบง่าย / ทางการ' : 'Minimal / official'}>
                    {minimalTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {isThai ? template.nameTh : template.nameEn}
                      </option>
                    ))}
                  </optgroup>
                )}
                {cuteTemplates.length > 0 && (
                  <optgroup label={isThai ? 'สีพาสเทล / ร้านค้า' : 'Pastel / shop'}>
                    {cuteTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {isThai ? template.nameTh : template.nameEn}
                      </option>
                    ))}
                  </optgroup>
                )}
                {filteredCustomTemplates.length > 0 && (
                  <optgroup label={isThai ? 'เทมเพลตบริษัท' : 'Company templates'}>
                    {filteredCustomTemplates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Updating badge */}
          {inlinePreviewLoading && (
            <span className="flex items-center gap-1.5 text-xs text-primary-600 bg-primary-50 border border-primary-200 px-2 py-1 rounded-full">
              <span className="w-2.5 h-2.5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin inline-block" />
              {isThai ? 'กำลังอัปเดต...' : 'Updating...'}
            </span>
          )}
          {inlinePreviewHtml && !inlinePreviewLoading && (
            <button
              onClick={handleInlineDownload}
              disabled={inlineDownloading}
              className="flex items-center gap-1.5 text-xs text-slate-600 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition"
            >
              <Download className="w-3.5 h-3.5" />
              {inlineDownloading ? (isThai ? 'กำลังสร้าง...' : 'Generating...') : (isThai ? 'ดาวน์โหลด PDF' : 'Download PDF')}
            </button>
          )}
          <button
            onClick={handlePreviewClick}
            disabled={preview.previewLoading || form.saving}
            title={isThai ? 'เปิดแบบเต็มจอ' : 'Open fullscreen'}
            className="flex items-center gap-1.5 text-xs text-slate-600 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top,#eef2ff_0,#f8fafc_42%,#eef2f7_100%)] p-5 flex flex-col items-center">
        {inlinePreviewError && (
          <div className="w-full max-w-2xl mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {inlinePreviewError}
          </div>
        )}

        {previewValidationErrors.length > 0 && !inlinePreviewHtml && !inlinePreviewLoading ? (
          <div className="flex w-full flex-1 items-start justify-center py-8">
            <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-5 text-left shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <Eye className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {isThai ? 'ตัวอย่างจะขึ้นเมื่อข้อมูลพร้อม' : 'Preview appears when the document is ready'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {isThai
                      ? 'แก้รายการด้านซ้ายให้ครบก่อน ระบบจะสร้างตัวอย่างเอกสารให้อัตโนมัติ'
                      : 'Finish the required fields on the left and Billboy will render the document preview automatically.'}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {previewValidationErrors.map((e, idx) => (
                  <div key={e} className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
                      {idx + 1}
                    </span>
                    <span>{e}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : inlinePreviewLoading && !inlinePreviewHtml ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
            <p className="text-sm text-slate-500">{isThai ? 'กำลังโหลดตัวอย่าง...' : 'Loading preview...'}</p>
          </div>
        ) : inlinePreviewHtml ? (
          <div className="rounded-3xl bg-white/70 p-4 shadow-inner ring-1 ring-slate-200/70">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span className="font-medium">{isThai ? 'ตัวอย่าง A4' : 'A4 preview'}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                {Math.round(previewScale * 100)}%
              </span>
            </div>
            <div
              className="relative overflow-hidden rounded-sm bg-white shadow-xl"
              style={{
                width: 794 * previewScale,
                height: 1123 * previewScale,
              }}
            >
              <div
                style={{
                  width: 794,
                  height: 1123,
                  transformOrigin: 'top left',
                  transform: `scale(${previewScale})`,
                }}
              >
                {inlinePreviewLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-sm bg-white/60">
                    <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-200 border-t-primary-500" />
                  </div>
                )}
                <iframe
                  srcDoc={inlinePreviewHtml}
                  title={isThai ? 'ตัวอย่างเอกสาร' : 'Document Preview'}
                  sandbox="allow-same-origin allow-scripts"
                  className="block w-full rounded-sm border-0"
                  style={{ height: 1123 }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-1 items-start justify-center py-8">
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
                <Eye className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-bold text-slate-900">
                {isThai ? 'พื้นที่ตัวอย่างเอกสาร' : 'Document preview'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {isThai
                  ? 'เลือกผู้ซื้อและเพิ่มรายการสินค้าแล้วตัวอย่าง PDF จะอัปเดตที่นี่'
                  : 'Choose a buyer and add line items to see the PDF-style preview here.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="-mx-4 -mt-6 min-h-[calc(100vh-64px)] bg-slate-50 pb-32 sm:-mx-6 sm:pb-0 lg:-mx-8">
      {/* ── Full-width header ── */}
      <div className="space-y-3 px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
        <InvoiceBuilderHeader
          isEdit={isEdit}
          isDraft={isDraft}
          invoiceId={id}
          saving={form.saving}
          previewLoading={preview.previewLoading}
          validationErrors={validationErrors}
          onSaveDraft={() => form.handleSaveDraft(customer.selectedCustomerId, id, projectId)}
          onPreview={handlePreviewClick}
          onIssue={() => form.handleIssue(customer.selectedCustomerId, id, (issuedId) => {
            setIssuedInvoiceId(issuedId);
          }, projectId)}
        />

        {(prefilledQuotationNumber || quotationPrefillMessage || quotationPrefillError) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            quotationPrefillError
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}>
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {quotationPrefillError
                  ?? quotationPrefillMessage
                  ?? (isThai
                    ? `เติมข้อมูลจากใบเสนอราคา ${prefilledQuotationNumber} แล้ว แก้ไขรายละเอียดก่อนบันทึกหรือออกเอกสารได้`
                    : `Prefilled from quotation ${prefilledQuotationNumber}. You can edit details before saving or issuing.`)}
              </p>
            </div>
          </div>
        )}

        {showDraftRecoveryPrompt && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <FileClock className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {isThai ? 'มีฉบับร่างค้างอยู่' : 'Unsaved draft found'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {isThai
                      ? 'กู้คืนข้อมูลเดิมเพื่อทำต่อ หรือเริ่มเอกสารใหม่ได้ทันที'
                      : 'Restore the previous draft to continue, or start this document fresh.'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    form.loadDraftFromStorage();
                    setShowDraftRecoveryPrompt(false);
                  }}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary-700 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-800"
                >
                  <RotateCcw className="h-4 w-4" />
                  {isThai ? 'กู้คืน' : 'Restore'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    form.discardRecoveredDraft();
                    setShowDraftRecoveryPrompt(false);
                  }}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {isThai ? 'เริ่มใหม่' : 'Start fresh'}
                </button>
              </div>
            </div>
          </div>
        )}

        {loadingInvoice && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            {isThai ? 'กำลังโหลดข้อมูลเอกสารเดิม...' : 'Loading invoice details...'}
          </div>
        )}
        {loadInvoiceError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 whitespace-pre-line">
            {loadInvoiceError}
          </div>
        )}
        {form.submitMessage && (
          <div className={`rounded-2xl border px-4 py-3 text-sm whitespace-pre-line ${
            form.submitMessageType === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}>
            {form.submitMessage}
          </div>
        )}
        {preview.previewError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 whitespace-pre-line">
            {preview.previewError}
          </div>
        )}
        {preview.downloadError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 whitespace-pre-line">
            {preview.downloadError}
          </div>
        )}
      </div>

      {/* ── Mobile/tablet tab bar (below lg) ── */}
      <div className="lg:hidden flex bg-white border-y border-gray-200">
        <button
          onClick={() => setMobileTab('form')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors border-b-2 ${
            mobileTab === 'form'
              ? 'border-primary-600 text-primary-600 bg-primary-50/50'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>{isThai ? 'กรอกข้อมูล' : 'Form'}</span>
        </button>
        <button
          onClick={() => setMobileTab('preview')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors border-b-2 ${
            mobileTab === 'preview'
              ? 'border-primary-600 text-primary-600 bg-primary-50/50'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Eye className="h-4 w-4" />
          <span>{isThai ? 'ดูตัวอย่าง' : 'Preview'}</span>
          {validationErrors.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          )}
        </button>
      </div>

      {/* ── Body: tab layout on mobile, split pane on desktop ── */}
      <div className="px-0 pb-6 sm:px-6">

        {/* Mobile/tablet: show selected tab panel */}
        <div className={mobileTab === 'form' ? 'lg:hidden' : 'hidden'}>
          {renderFormPanel(false)}
        </div>
        <div className={mobileTab === 'preview' ? 'min-h-[560px] lg:hidden' : 'hidden'}>
          {renderPreviewPanel}
        </div>

        {/* Desktop (lg+): split pane — form left, preview right */}
        <div className="hidden w-full grid-cols-[minmax(620px,820px)_minmax(420px,1fr)] items-start gap-4 lg:grid">
          {/* LEFT: form panel */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {renderFormPanel(false)}
          </div>
          {/* RIGHT: preview panel */}
          <div className="sticky top-[84px] flex max-h-[calc(100vh-108px)] min-h-[620px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {renderPreviewPanel}
          </div>
        </div>

      </div>

      <IssuedSuccessModal
        invoiceId={issuedInvoiceId}
        onClose={() => { setIssuedInvoiceId(null); navigate('/app/invoices'); }}
      />

      <PreviewModal
        show={preview.showPreviewModal}
        previewLoading={preview.previewLoading}
        previewHtml={preview.previewHtml}
        downloading={preview.downloading}
        onDownload={preview.handleDownloadPdf}
        onClose={preview.closePreview}
      />

    </div>
  );
}
