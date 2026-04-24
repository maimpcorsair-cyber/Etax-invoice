import { useState, useCallback } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { Invoice, InvoiceItem, InvoiceType, Language } from '../types';
import { emptyItem, calculateItem, translateZodMessage } from '../utils/invoiceHelpers';

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
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitMessageType, setSubmitMessageType] = useState<'ok' | 'err' | null>(null);

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
    setShowCompanyLogo(invoice.showCompanyLogo ?? true);
    setLogoUrl(invoice.documentLogoUrl ?? null);
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

  const handleSave = async (_asDraft: boolean, customerId: string, invoiceId?: string) => {
    setSubmitMessage(null);
    setSubmitMessageType(null);

    if (!customerId) {
      setSubmitMessage(isThai ? 'กรุณาเลือกลูกค้าก่อนบันทึกเอกสาร' : 'Please select a customer before saving.');
      setSubmitMessageType('err');
      return;
    }
    if (!invoiceDate) {
      setSubmitMessage(
        isThai ? 'กรุณาเลือกวันที่ออกเอกสาร' : 'Please select invoice date',
      );
      setSubmitMessageType('err');
      return;
    }
    if (items.length === 0 || !items[0].nameTh.trim()) {
      setSubmitMessage(
        isThai
          ? 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ'
          : 'Please add at least one item',
      );
      setSubmitMessageType('err');
      return;
    }
    if (
      ['receipt', 'credit_note', 'debit_note'].includes(docType) &&
      !referenceDocNumber.trim()
    ) {
      setSubmitMessage(
        isThai
          ? 'กรุณาระบุเลขที่เอกสารอ้างอิง (บังคับ)'
          : 'Reference document number is required',
      );
      setSubmitMessageType('err');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type: docType,
        language: docLanguage,
        invoiceDate,
        dueDate: dueDate || undefined,
        customerId,
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
        showCompanyLogo,
        documentLogoUrl: logoUrl || undefined,
        referenceDocNumber: referenceDocNumber || undefined,
      };

      const res = await fetch(invoiceId ? `/api/invoices/${invoiceId}` : '/api/invoices', {
        method: invoiceId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (res.status === 401) {
          clearAuth();
          navigate('/login');
          return;
        }
        const err = (await res.json()) as {
          error?: string;
          details?: { path: (string | number)[]; message: string }[];
        };
        const msg =
          err.details
            ?.map((d) => `${d.path.join('.')}: ${translateZodMessage(d.message)}`)
            .join('\n') ??
          err.error ??
          'Save failed';
        setSubmitMessage(msg);
        setSubmitMessageType('err');
        return;
      }

      setSubmitMessage(
        invoiceId
          ? (isThai ? 'อัปเดตเอกสารสำเร็จ กำลังกลับไปหน้ารายการเอกสาร...' : 'Document updated. Returning to the invoice list...')
          : (isThai ? 'บันทึกเอกสารสำเร็จ กำลังกลับไปหน้ารายการเอกสาร...' : 'Document saved. Returning to the invoice list...'),
      );
      setSubmitMessageType('ok');
      navigate('/app/invoices');
    } catch {
      setSubmitMessage(
        isThai
          ? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
          : 'An error occurred, please try again',
      );
      setSubmitMessageType('err');
    } finally {
      setSaving(false);
    }
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
    subtotal,
    totalVat,
    total,
    hydrateFromInvoice,
    handleSave,
  };
}
