import { useState, useCallback } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { Invoice, InvoiceItem, InvoiceType, Language } from '../types';
import { emptyItem, calculateItem, translateZodMessage } from '../utils/invoiceHelpers';

const DRAFT_STORAGE_KEY = 'etax_invoice_draft';

/** Shape of the draft saved in localStorage — mirrors form state fields */
interface DraftPayload {
  docType: InvoiceType;
  language: Language;
  invoiceDate: string;
  dueDate: string;
  referenceDocNumber: string;
  items: InvoiceItem[];
  notes: string;
  paymentMethod: string;
  documentLogoUrl: string | null;
  showCompanyLogo: boolean;
  templateId: string | null;
  documentMode: 'ordinary' | 'electronic';
  bankPaymentInfo: string;
  signatureImageUrl: string | null;
  signerName: string;
  signerTitle: string;
  savedAt: number;
}

interface Options {
  token: string | null;
  clearAuth: () => void;
  navigate: NavigateFunction;
  isThai: boolean;
}

export function useInvoiceForm({ token, clearAuth, navigate, isThai }: Options) {
  const [docType, setDocType] = useState<InvoiceType>('tax_invoice');
  const [docLanguage, setDocLanguage] = useState<Language>('th');
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [dueDate, setDueDate] = useState('');
  const [referenceDocNumber, setReferenceDocNumber] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [showCompanyLogo, setShowCompanyLogo] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [documentMode, setDocumentMode] = useState<'ordinary' | 'electronic'>('electronic');
  const [bankPaymentInfo, setBankPaymentInfo] = useState('');
  const [signatureImageUrl, setSignatureImageUrl] = useState<string | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitMessageType, setSubmitMessageType] = useState<'ok' | 'err' | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState(false);

  /* ── Auto-save draft to localStorage ── */
  const saveDraftToStorage = useCallback(() => {
    try {
      const draft = {
        docType, docLanguage, invoiceDate, dueDate, referenceDocNumber,
        items, notes, paymentMethod, documentLogoUrl: logoUrl, showCompanyLogo, templateId,
        documentMode, bankPaymentInfo, signatureImageUrl, signerName, signerTitle,
        savedAt: Date.now(),
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // localStorage may be unavailable (private browsing, full quota)
    }
  }, [docType, docLanguage, invoiceDate, dueDate, referenceDocNumber, items, notes,
      paymentMethod, logoUrl, showCompanyLogo, templateId, documentMode,
      bankPaymentInfo, signatureImageUrl, signerName, signerTitle]);

  const clearDraftFromStorage = useCallback(() => {
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  /* ── Load draft from localStorage (only for NEW invoices, not edit mode) ── */
  const loadDraftFromStorage = useCallback((): boolean => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return false;
      const draft = JSON.parse(raw) as DraftPayload;
      // Only recover if draft is less than 7 days old
      if (draft.savedAt && Date.now() - draft.savedAt > 7 * 24 * 60 * 60 * 1000) {
        clearDraftFromStorage();
        return false;
      }
      if (draft.docType) setDocType(draft.docType);
      if (draft.language) setDocLanguage(draft.language);
      if (draft.invoiceDate) setInvoiceDate(new Date(draft.invoiceDate).toISOString().split('T')[0]);
      if (draft.dueDate) setDueDate(new Date(draft.dueDate).toISOString().split('T')[0]);
      if (draft.referenceDocNumber) setReferenceDocNumber(draft.referenceDocNumber);
      if (Array.isArray(draft.items) && draft.items.length > 0) {
        setItems(draft.items.map((item) => ({
          ...item,
          nameEn: item.nameEn ?? '',
          descriptionTh: item.descriptionTh ?? '',
          descriptionEn: item.descriptionEn ?? '',
        })));
      }
      if (draft.notes != null) setNotes(draft.notes);
      if (draft.paymentMethod != null) setPaymentMethod(draft.paymentMethod);
      if (draft.templateId != null) setTemplateId(draft.templateId);
      if (draft.documentMode != null) setDocumentMode(draft.documentMode);
      if (draft.bankPaymentInfo != null) setBankPaymentInfo(draft.bankPaymentInfo);
      if (draft.showCompanyLogo != null) setShowCompanyLogo(draft.showCompanyLogo);
      if (draft.documentLogoUrl != null) setLogoUrl(draft.documentLogoUrl);
      if (draft.signatureImageUrl != null) setSignatureImageUrl(draft.signatureImageUrl);
      if (draft.signerName != null) setSignerName(draft.signerName);
      if (draft.signerTitle != null) setSignerTitle(draft.signerTitle);
      return true;
    } catch {
      return false;
    }
  }, [clearDraftFromStorage]);

  /* ── Check if there is a recoverable draft (without actually loading it) ── */
  const hasRecoverableDraft = useCallback((): boolean => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return false;
      const draft = JSON.parse(raw) as { savedAt?: number };
      if (draft.savedAt && Date.now() - draft.savedAt > 7 * 24 * 60 * 60 * 1000) {
        clearDraftFromStorage();
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, [clearDraftFromStorage]);

  const discardRecoveredDraft = useCallback(() => {
    clearDraftFromStorage();
    setRecoveredDraft(false);
  }, [clearDraftFromStorage]);

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i));

  const updateItem = useCallback(
    (index: number, field: keyof InvoiceItem, value: string | number) => {
      setItems((prev) => {
        const updated = [...prev];
        updated[index] = calculateItem({
          ...updated[index],
          [field]: value,
        } as InvoiceItem);
        return updated;
      });
    },
    [],
  );

  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const totalVat = items.reduce((s, i) => s + i.vatAmount, 0);
  const total = subtotal + totalVat;

  const hydrateFromInvoice = useCallback((invoice: Invoice) => {
    setDocType(invoice.type);
    setDocLanguage(invoice.language);
    setInvoiceDate(new Date(invoice.invoiceDate).toISOString().split('T')[0]);
    setDueDate(invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : '');
    setReferenceDocNumber(invoice.referenceDocNumber ?? '');
    setNotes(invoice.notes ?? '');
    setPaymentMethod(invoice.paymentMethod ?? '');
    setTemplateId(invoice.templateId ?? null);
    setDocumentMode(invoice.documentMode ?? 'electronic');
    setBankPaymentInfo(invoice.bankPaymentInfo ?? '');
    setShowCompanyLogo(invoice.showCompanyLogo ?? true);
    setLogoUrl(invoice.documentLogoUrl ?? null);
    setSignatureImageUrl(invoice.signatureImageUrl ?? null);
    setSignerName(invoice.signerName ?? '');
    setSignerTitle(invoice.signerTitle ?? '');
    setItems(
      invoice.items.length > 0
        ? invoice.items.map((item) => ({
            ...item,
            nameEn: item.nameEn ?? '',
            descriptionTh: item.descriptionTh ?? '',
            descriptionEn: item.descriptionEn ?? '',
          }))
        : [emptyItem()],
    );
    setSubmitMessage(null);
    setSubmitMessageType(null);
  }, []);

  const validate = (customerId: string) => {
    if (!customerId) {
      setSubmitMessage(isThai ? 'กรุณาเลือกลูกค้าก่อนบันทึกเอกสาร' : 'Please select a customer before saving.');
      setSubmitMessageType('err');
      return false;
    }
    if (!invoiceDate) {
      setSubmitMessage(isThai ? 'กรุณาเลือกวันที่ออกเอกสาร' : 'Please select invoice date');
      setSubmitMessageType('err');
      return false;
    }
    if (items.length === 0 || !items[0].nameTh.trim()) {
      setSubmitMessage(isThai ? 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ' : 'Please add at least one item');
      setSubmitMessageType('err');
      return false;
    }
    if (['receipt', 'credit_note', 'debit_note'].includes(docType) && !referenceDocNumber.trim()) {
      setSubmitMessage(isThai ? 'กรุณาระบุเลขที่เอกสารอ้างอิง (บังคับ)' : 'Reference document number is required');
      setSubmitMessageType('err');
      return false;
    }
    return true;
  };

  const buildPayload = (customerId: string, asDraft: boolean) => ({
    type: docType,
    language: docLanguage,
    invoiceDate,
    dueDate: dueDate || undefined,
    customerId,
    asDraft,
    items: items.map((item) => ({
      nameTh: item.nameTh,
      nameEn: item.nameEn || '',
      descriptionTh: item.descriptionTh || '',
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discount: item.discount,
      vatType: item.vatType,
    })),
    notes: notes || undefined,
    paymentMethod: paymentMethod || undefined,
    templateId: templateId || undefined,
    documentMode,
    bankPaymentInfo: bankPaymentInfo || undefined,
    showCompanyLogo,
    documentLogoUrl: logoUrl || undefined,
    signatureImageUrl: signatureImageUrl || undefined,
    signerName: signerName || undefined,
    signerTitle: signerTitle || undefined,
    referenceDocNumber: referenceDocNumber || undefined,
  });

  const handleApiError = async (res: Response) => {
    if (res.status === 401) { clearAuth(); navigate('/login'); return true; }
    const err = (await res.json()) as { error?: string; details?: { path: (string | number)[]; message: string }[] };
    const msg = err.details?.map((d) => `${d.path.join('.')}: ${translateZodMessage(d.message)}`).join('\n') ?? err.error ?? 'Save failed';
    setSubmitMessage(msg);
    setSubmitMessageType('err');
    return true;
  };

  const handleSaveDraft = async (customerId: string, invoiceId?: string) => {
    setSubmitMessage(null);
    setSubmitMessageType(null);
    if (!validate(customerId)) return;
    setSaving(true);
    try {
      const res = await fetch(invoiceId ? `/api/invoices/${invoiceId}` : '/api/invoices', {
        method: invoiceId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildPayload(customerId, true)),
      });
      if (!res.ok) { await handleApiError(res); return; }
      setSubmitMessage(isThai ? 'บันทึกร่างเรียบร้อย สามารถแก้ไขและออกเอกสารได้ในภายหลัง' : 'Draft saved. You can edit and issue the document later.');
      setSubmitMessageType('ok');
      setTimeout(() => navigate('/app/invoices'), 1200);
    } catch {
      setSubmitMessage(isThai ? 'เกิดข้อผิดพลาด กรุณาลองใหม่' : 'An error occurred, please try again');
      setSubmitMessageType('err');
    } finally {
      setSaving(false);
    }
  };

  const handleIssue = async (customerId: string, invoiceId?: string, onIssued?: (id: string) => void) => {
    setSubmitMessage(null);
    setSubmitMessageType(null);
    if (!validate(customerId)) return;
    setSaving(true);
    try {
      let issuedId: string;
      if (invoiceId) {
        // Existing draft → issue via dedicated endpoint
        const res = await fetch(`/api/invoices/${invoiceId}/issue`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { await handleApiError(res); return; }
        issuedId = invoiceId;
      } else {
        // New invoice → create + issue immediately (asDraft: false)
        const res = await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(buildPayload(customerId, false)),
        });
        if (!res.ok) { await handleApiError(res); return; }
        const json = (await res.json()) as { data: { id: string } };
        issuedId = json.data.id;
      }
      setSubmitMessage(isThai ? 'ออกเอกสารสำเร็จ! กำลังสร้าง PDF...' : 'Document issued! Generating PDF...');
      setSubmitMessageType('ok');
      if (onIssued) {
        onIssued(issuedId);
      } else {
        setTimeout(() => navigate('/app/invoices'), 1500);
      }
    } catch {
      setSubmitMessage(isThai ? 'เกิดข้อผิดพลาด กรุณาลองใหม่' : 'An error occurred, please try again');
      setSubmitMessageType('err');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (_asDraft: boolean, customerId: string, invoiceId?: string) => {
    return handleIssue(customerId, invoiceId);
  };

  return {
    docType,
    setDocType,
    docLanguage,
    setDocLanguage,
    invoiceDate,
    setInvoiceDate,
    dueDate,
    setDueDate,
    referenceDocNumber,
    setReferenceDocNumber,
    items,
    addItem,
    removeItem,
    updateItem,
    notes,
    setNotes,
    paymentMethod,
    setPaymentMethod,
    saving,
    submitMessage,
    submitMessageType,
    clearSubmitMessage: () => {
      setSubmitMessage(null);
      setSubmitMessageType(null);
    },
    logoUrl,
    setLogoUrl,
    showCompanyLogo,
    setShowCompanyLogo,
    templateId,
    setTemplateId,
    documentMode,
    setDocumentMode,
    bankPaymentInfo,
    setBankPaymentInfo,
    signatureImageUrl,
    setSignatureImageUrl,
    signerName,
    setSignerName,
    signerTitle,
    setSignerTitle,
    subtotal,
    totalVat,
    total,
    hydrateFromInvoice,
    saveDraftToStorage,
    clearDraftFromStorage,
    loadDraftFromStorage,
    hasRecoverableDraft,
    discardRecoveredDraft,
    recoveredDraft,
    setRecoveredDraft,
    handleSave,
    handleSaveDraft,
    handleIssue,
  };
}
