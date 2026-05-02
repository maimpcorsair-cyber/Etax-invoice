import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, Save, FileCheck, Download, Maximize2 } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import { useCompanyProfile } from '../hooks/useCompanyProfile';
import { useCustomerSearch } from '../hooks/useCustomerSearch';
import { useInvoiceForm } from '../hooks/useInvoiceForm';
import { useInvoicePreview } from '../hooks/useInvoicePreview';
import InvoiceBuilderHeader from '../components/invoice/InvoiceBuilderHeader';
import IssuedSuccessModal from '../components/invoice/IssuedSuccessModal';
import DocumentSettingsCard from '../components/invoice/DocumentSettingsCard';
import DocumentAppearanceCard from '../components/invoice/DocumentAppearanceCard';
import SellerCard from '../components/invoice/SellerCard';
import BuyerCard from '../components/invoice/BuyerCard';
import ItemsTable from '../components/invoice/ItemsTable';
import NotesPaymentCard from '../components/invoice/NotesPaymentCard';
import PreviewModal from '../components/invoice/PreviewModal';
import TemplateMarketplace from '../components/invoice/TemplateMarketplace';
import type { DocumentTemplateOption } from '../types';
import { builtinDocumentTemplates, supportsDocumentType } from '../lib/documentTemplatePresets';

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

export default function InvoiceBuilder() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isThai } = useLanguage();
  const { token, clearAuth } = useAuthStore();
  const isEdit = Boolean(id);

  const ctx = { token, clearAuth, navigate, isThai };
  const { company } = useCompanyProfile({ token });
  const customer = useCustomerSearch({ token });
  const form = useInvoiceForm(ctx);
  const preview = useInvoicePreview(ctx);

  const [showBuyerSection, setShowBuyerSection] = useState(true);
  const [loadingInvoice, setLoadingInvoice] = useState(isEdit);
  const [loadInvoiceError, setLoadInvoiceError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DocumentTemplateOption[]>([]);
  const [issuedInvoiceId, setIssuedInvoiceId] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(false);

  const [showMarketplace, setShowMarketplace] = useState(false);

  // Inline preview state (right panel)
  const [inlinePreviewHtml, setInlinePreviewHtml] = useState<string | null>(null);
  const [inlinePreviewLoading, setInlinePreviewLoading] = useState(false);
  const [inlinePreviewError, setInlinePreviewError] = useState<string | null>(null);
  const [inlineDownloading, setInlineDownloading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const lastPayloadRef = useRef<object | null>(null);

  const validationErrors = getInvoiceValidationErrors({
    isThai,
    invoiceDate: form.invoiceDate,
    items: form.items,
    customerId: customer.selectedCustomerId,
    docType: form.docType,
    referenceDocNumber: form.referenceDocNumber,
  });

  /* ── Preview payload builder ── */
  const buildPreviewPayload = useCallback((overrides?: { templateId?: string | null }) => ({
    type: form.docType,
    language: form.docLanguage,
    invoiceDate: form.invoiceDate,
    dueDate: form.dueDate || undefined,
    items: form.items.map((item) => ({
      nameTh: item.nameTh,
      nameEn: item.nameEn || '',
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discount: item.discount,
      vatType: item.vatType,
    })),
    notes: form.notes || undefined,
    logoUrl: form.logoUrl || undefined,
    templateId: (overrides?.templateId !== undefined ? overrides.templateId : form.templateId) || undefined,
    documentMode: form.documentMode,
    bankPaymentInfo: form.bankPaymentInfo || undefined,
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
    if (validationErrors.length > 0) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchInlinePreview(buildPreviewPayload(overrides));
    }, 600);
  }, [validationErrors, fetchInlinePreview, buildPreviewPayload]);

  /* ── Immediate preview on template change ── */
  const handleTemplateChange = useCallback((templateId: string | null) => {
    form.setTemplateId(templateId);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (validationErrors.length === 0) {
      fetchInlinePreview(buildPreviewPayload({ templateId }));
    }
    // Also refresh modal if open
    if (preview.previewHtml !== null && validationErrors.length === 0) {
      preview.openPreview(buildPreviewPayload({ templateId }));
    }
  }, [form, validationErrors, fetchInlinePreview, buildPreviewPayload, preview]);

  /* ── Compute scale when panel resizes ── */
  useEffect(() => {
    if (!previewPanelRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width - 32; // subtract padding
        setPreviewScale(Math.min(1, width / 794));
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
    if (validationErrors.length > 0) {
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
    if (!isEdit && presetType && ['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note'].includes(presetType)) {
      form.setDocType(presetType as typeof form.docType);
    }
  }, [form.setDocType, isEdit, searchParams, form.docType]);

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

  return (
    <div
      className="flex flex-col overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 -mt-6"
      style={{ height: 'calc(100vh - 64px)' }}
    >
      {/* ── Full-width header ── */}
      <div className="flex-shrink-0 px-6 pt-6 pb-3 bg-gray-50 border-b border-gray-200 space-y-3">
        <InvoiceBuilderHeader
          isEdit={isEdit}
          isDraft={isDraft}
          invoiceId={id}
          saving={form.saving}
          previewLoading={preview.previewLoading}
          validationErrors={validationErrors}
          onSaveDraft={() => form.handleSaveDraft(customer.selectedCustomerId, id)}
          onPreview={handlePreviewClick}
          onIssue={() => form.handleIssue(customer.selectedCustomerId, id, (issuedId) => {
            setIssuedInvoiceId(issuedId);
          })}
        />

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

      {/* ── Split pane body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* LEFT: form panel */}
        <div className="w-[520px] flex-shrink-0 overflow-y-auto bg-gray-50 px-6 py-4 space-y-4">
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
          <DocumentAppearanceCard
            documentMode={form.documentMode}
            onDocumentModeChange={form.setDocumentMode}
            bankPaymentInfo={form.bankPaymentInfo}
            onBankPaymentInfoChange={form.setBankPaymentInfo}
            showCompanyLogo={form.showCompanyLogo}
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
          <div className="grid grid-cols-1 gap-4">
            <SellerCard company={company} />
            <BuyerCard
              customers={customer.customers}
              customerSearch={customer.customerSearch}
              selectedCustomerId={customer.selectedCustomerId}
              showBuyerSection={showBuyerSection}
              onSearchChange={customer.setCustomerSearch}
              onSelectCustomer={(custId, name) => {
                form.clearSubmitMessage();
                preview.clearPreviewError();
                customer.setSelectedCustomerId(custId);
                customer.setCustomerSearch(name);
                customer.clearResults();
              }}
              onClearCustomer={customer.clearCustomer}
              onToggleSection={() => setShowBuyerSection((s) => !s)}
            />
          </div>
          <ItemsTable
            items={form.items}
            subtotal={form.subtotal}
            totalVat={form.totalVat}
            total={form.total}
            onAddItem={form.addItem}
            onRemoveItem={form.removeItem}
            onUpdateItem={form.updateItem}
          />
          <NotesPaymentCard
            notes={form.notes}
            onNotesChange={form.setNotes}
            paymentMethod={form.paymentMethod}
            onPaymentMethodChange={form.setPaymentMethod}
          />
          {/* bottom padding so last card isn't flush */}
          <div className="h-8" />
        </div>

        {/* RIGHT: live preview panel */}
        <div ref={previewPanelRef} className="flex-1 flex flex-col bg-gray-100 min-w-0">
          {/* Preview toolbar */}
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
            {/* Template selector button */}
            <button
              onClick={() => setShowMarketplace(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px 6px 8px',
                background: '#f8fafc',
                border: '1.5px solid #e2e8f0',
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                minWidth: 0,
                flex: 1,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#1e3a8a';
                (e.currentTarget as HTMLElement).style.background = '#fff';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
                (e.currentTarget as HTMLElement).style.background = '#f8fafc';
              }}
            >
              {/* Color swatches of current template */}
              {(() => {
                const tw: Record<string, string> = {
                  'bg-white': '#fff', 'bg-blue-900': '#1e3a8a', 'bg-blue-200': '#bfdbfe',
                  'bg-slate-700': '#334155', 'bg-slate-300': '#cbd5e1', 'bg-slate-200': '#e2e8f0',
                };
                const current = matchingBuiltinTemplates.find(t => t.id === form.templateId);
                const swatches = current?.swatches ?? ['bg-blue-900', 'bg-blue-200', 'bg-white'];
                return (
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    {swatches.map((cls, i) => (
                      <div key={i} style={{
                        width: 12, height: 12, borderRadius: '50%',
                        background: tw[cls] ?? '#94a3b8',
                        border: '1px solid rgba(0,0,0,0.1)',
                      }} />
                    ))}
                  </div>
                );
              })()}
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, lineHeight: 1.2 }}>
                  {isThai ? 'เทมเพลต' : 'Template'}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {form.templateId
                    ? (matchingBuiltinTemplates.find(t => t.id === form.templateId)?.nameTh
                        ?? filteredCustomTemplates.find(t => t.id === form.templateId)?.name
                        ?? form.templateId)
                    : (isThai ? 'มาตรฐาน' : 'Standard')}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
            </button>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Updating badge */}
              {inlinePreviewLoading && (
                <span className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-full">
                  <span className="w-2.5 h-2.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin inline-block" />
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
          <div className="flex-1 overflow-auto p-4 flex flex-col items-center">
            {inlinePreviewError && (
              <div className="w-full max-w-2xl mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {inlinePreviewError}
              </div>
            )}

            {validationErrors.length > 0 && !inlinePreviewHtml && !inlinePreviewLoading ? (
              <div className="flex flex-col items-center justify-center flex-1 text-center text-slate-400 gap-3 py-16">
                <Eye className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">
                  {isThai ? 'กรอกข้อมูลให้ครบก่อนดูตัวอย่าง' : 'Complete the form to see a live preview'}
                </p>
                <ul className="text-xs text-slate-400 space-y-1">
                  {validationErrors.map((e) => <li key={e}>• {e}</li>)}
                </ul>
              </div>
            ) : inlinePreviewLoading && !inlinePreviewHtml ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-sm text-slate-500">{isThai ? 'กำลังโหลดตัวอย่าง...' : 'Loading preview...'}</p>
              </div>
            ) : inlinePreviewHtml ? (
              <div
                className="relative bg-white shadow-xl rounded-sm"
                style={{
                  width: 794,
                  transformOrigin: 'top center',
                  transform: `scale(${previewScale})`,
                  marginBottom: `calc((794px * ${previewScale} - 794px))`,
                }}
              >
                {inlinePreviewLoading && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-sm">
                    <div className="w-6 h-6 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                  </div>
                )}
                <iframe
                  srcDoc={inlinePreviewHtml}
                  title={isThai ? 'ตัวอย่างเอกสาร' : 'Document Preview'}
                  sandbox="allow-same-origin allow-scripts"
                  className="w-full border-0 rounded-sm"
                  style={{ height: 1123, display: 'block' }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 text-center text-slate-300 gap-3 py-16">
                <Eye className="w-12 h-12 opacity-30" />
                <p className="text-sm">{isThai ? 'ตัวอย่างจะแสดงที่นี่' : 'Preview will appear here'}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile sticky action bar */}
      <div className="sm:hidden fixed bottom-16 left-0 right-0 z-30 bg-white border-t border-gray-200 px-4 py-3 flex gap-2">
        <button
          className="btn-secondary flex-1 justify-center"
          onClick={handlePreviewClick}
          disabled={preview.previewLoading || form.saving}
        >
          <Eye className="w-4 h-4" />
          {isThai ? 'ดูตัวอย่าง' : 'Preview'}
        </button>
        <button
          className="btn-secondary flex-1 justify-center"
          onClick={() => form.handleSaveDraft(customer.selectedCustomerId, id)}
          disabled={form.saving}
        >
          {form.saving
            ? <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            : <Save className="w-4 h-4" />}
          {isThai ? 'บันทึกร่าง' : 'Draft'}
        </button>
        <button
          className="btn-primary flex-1 justify-center bg-green-600 hover:bg-green-700"
          onClick={() => form.handleIssue(customer.selectedCustomerId, id, (issuedId) => setIssuedInvoiceId(issuedId))}
          disabled={form.saving}
        >
          {form.saving
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <FileCheck className="w-4 h-4" />}
          {isThai ? 'ออกเอกสาร' : 'Issue'}
        </button>
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

      <TemplateMarketplace
        isOpen={showMarketplace}
        onClose={() => setShowMarketplace(false)}
        selectedTemplateId={form.templateId}
        onSelect={(id) => handleTemplateChange(id)}
        docType={form.docType}
        customTemplates={filteredCustomTemplates}
        isThai={isThai}
      />
    </div>
  );
}
