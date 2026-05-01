import { useEffect, useState } from 'react';
import { Eye, Save, FileCheck } from 'lucide-react';
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
import type { DocumentTemplateOption } from '../types';

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
  const validationErrors = getInvoiceValidationErrors({
    isThai,
    invoiceDate: form.invoiceDate,
    items: form.items,
    customerId: customer.selectedCustomerId,
    docType: form.docType,
    referenceDocNumber: form.referenceDocNumber,
  });

  /* ── Preview validation + payload ── */
  const handlePreviewClick = async () => {
    if (validationErrors.length > 0) {
      preview.clearPreviewError();
      return;
    }

    await preview.openPreview({
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
      templateId: form.templateId || undefined,
      documentMode: form.documentMode,
      bankPaymentInfo: form.bankPaymentInfo || undefined,
      showCompanyLogo: form.showCompanyLogo,
      signatureImageUrl: form.signatureImageUrl || undefined,
      signerName: form.signerName || undefined,
      signerTitle: form.signerTitle || undefined,
    });
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
        if (!res.ok) {
          throw new Error(json.error ?? 'Failed to load template options');
        }
        if (active) {
          setTemplates(json.data ?? []);
        }
      } catch {
        if (active) {
          setTemplates([]);
        }
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
        if (!res.ok || !json.data) {
          throw new Error(json.error ?? 'Failed to load invoice');
        }
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
    id,
    isEdit,
    isThai,
    token,
    form.hydrateFromInvoice,
    form.clearSubmitMessage,
    customer.setSelectedCustomerId,
    customer.setCustomerSearch,
    customer.clearResults,
    preview.clearPreviewError,
  ]);

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-4">
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
          <div
            className={`rounded-2xl border px-4 py-3 text-sm whitespace-pre-line ${
              form.submitMessageType === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
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
          templates={templates}
          selectedTemplateId={form.templateId}
          onTemplateChange={form.setTemplateId}
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
          docLanguage={form.docLanguage}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
      </div>
      {/* Sticky bottom action bar — mobile only */}
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
          {form.saving ? (
            <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {isThai ? 'บันทึกร่าง' : 'Draft'}
        </button>
        <button
          className="btn-primary flex-1 justify-center bg-green-600 hover:bg-green-700"
          onClick={() => form.handleIssue(customer.selectedCustomerId, id, (issuedId) => setIssuedInvoiceId(issuedId))}
          disabled={form.saving}
        >
          {form.saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <FileCheck className="w-4 h-4" />
          )}
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
    </>
  );
}
