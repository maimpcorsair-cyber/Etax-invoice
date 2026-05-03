import type { DocumentIntake } from '@prisma/client';
import type { OcrResult } from './aiService';

export type DocumentGroup = 'input_vat' | 'payment_proof' | 'supporting_attachment' | 'unknown';
export type DocumentSubtype =
  | 'tax_invoice'
  | 'receipt'
  | 'supplier_invoice'
  | 'billing_note'
  | 'credit_note'
  | 'debit_note'
  | 'expense_receipt'
  | 'bank_transfer'
  | 'bank_statement'
  | 'payment_advice'
  | 'quotation'
  | 'purchase_order'
  | 'delivery_note'
  | 'contract'
  | 'other';
export type VerificationStatus =
  | 'ocr_only'
  | 'qr_missing'
  | 'qr_found'
  | 'verified'
  | 'mismatch'
  | 'duplicate'
  | 'unverifiable';

export interface DocumentIntelligence {
  group: DocumentGroup;
  subtype: DocumentSubtype;
  groupLabelTh: string;
  groupLabelEn: string;
  subtypeLabelTh: string;
  subtypeLabelEn: string;
  readiness: {
    ready: boolean;
    labelTh: string;
    labelEn: string;
    reasonsTh: string[];
    reasonsEn: string[];
  };
  verification: {
    status: VerificationStatus;
    labelTh: string;
    labelEn: string;
    provider?: string;
    verifiedAt?: string;
  };
  payment?: {
    amount?: number;
    paidAt?: string;
    bankName?: string;
    fromName?: string;
    fromAccount?: string;
    toName?: string;
    toAccount?: string;
    reference?: string;
    direction?: 'incoming' | 'outgoing' | 'unknown';
  };
  audit: {
    requiredAttachments: Array<
      'tax_document' | 'payment_proof' | 'po_or_contract' | 'delivery_or_acceptance'
    >;
    missingAttachments: Array<
      'tax_document' | 'payment_proof' | 'po_or_contract' | 'delivery_or_acceptance'
    >;
  };
}

type IntakeLike = Pick<
  DocumentIntake,
  | 'status'
  | 'ocrResult'
  | 'warnings'
  | 'error'
  | 'purchaseInvoiceId'
  | 'targetId'
  | 'targetType'
  | 'fileName'
>;

const inputVatTypes = new Set<OcrResult['documentType']>([
  'tax_invoice',
  'receipt',
  'invoice',
  'billing_note',
  'expense_receipt',
  'credit_note',
  'debit_note',
]);

const paymentTypes = new Set<OcrResult['documentType']>([
  'bank_transfer',
  'bank_statement',
  'payment_advice',
]);

const attachmentTypes = new Set<OcrResult['documentType']>([
  'quotation',
  'purchase_order',
  'delivery_note',
  'contract',
  'withholding_tax',
]);

function asOcrResult(value: unknown): OcrResult | null {
  if (!value || typeof value !== 'object') return null;
  return value as OcrResult;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function subtypeFromOcr(result: OcrResult | null): DocumentSubtype {
  if (!result) return 'other';
  if (result.documentType === 'invoice') return 'supplier_invoice';
  if (result.documentType === 'withholding_tax') return 'other';
  return result.documentType as DocumentSubtype;
}

function labels(group: DocumentGroup, subtype: DocumentSubtype) {
  const groupLabels: Record<DocumentGroup, { th: string; en: string }> = {
    input_vat: { th: 'เอกสารภาษีซื้อ', en: 'Input VAT document' },
    payment_proof: { th: 'เอกสารแนบ: หลักฐานชำระเงิน', en: 'Attachment: payment proof' },
    supporting_attachment: { th: 'เอกสารแนบประกอบ', en: 'Supporting attachment' },
    unknown: { th: 'ยังไม่ทราบประเภท', en: 'Unclassified document' },
  };
  const subtypeLabels: Record<DocumentSubtype, { th: string; en: string }> = {
    tax_invoice: { th: 'ใบกำกับภาษีซื้อ', en: 'Purchase tax invoice' },
    receipt: { th: 'ใบเสร็จรับเงิน', en: 'Receipt' },
    supplier_invoice: { th: 'ใบแจ้งหนี้ supplier', en: 'Supplier invoice' },
    billing_note: { th: 'ใบวางบิล', en: 'Billing note' },
    credit_note: { th: 'ใบลดหนี้', en: 'Credit note' },
    debit_note: { th: 'ใบเพิ่มหนี้', en: 'Debit note' },
    expense_receipt: { th: 'ใบเสร็จค่าใช้จ่าย', en: 'Expense receipt' },
    bank_transfer: { th: 'สลิปโอนเงิน', en: 'Bank transfer slip' },
    bank_statement: { th: 'รายการเดินบัญชี', en: 'Bank statement' },
    payment_advice: { th: 'Payment advice', en: 'Payment advice' },
    quotation: { th: 'ใบเสนอราคา', en: 'Quotation' },
    purchase_order: { th: 'PO / ใบสั่งซื้อ', en: 'Purchase order' },
    delivery_note: { th: 'ใบส่งของ / ส่งงาน', en: 'Delivery / acceptance note' },
    contract: { th: 'สัญญา', en: 'Contract' },
    other: { th: 'เอกสารอื่น', en: 'Other document' },
  };
  return { group: groupLabels[group], subtype: subtypeLabels[subtype] };
}

function groupFromContent(item: IntakeLike, result: OcrResult | null): DocumentGroup {
  if (result?.documentType && paymentTypes.has(result.documentType)) return 'payment_proof';
  if (result?.documentType && inputVatTypes.has(result.documentType)) return 'input_vat';
  if (result?.documentType && attachmentTypes.has(result.documentType))
    return 'supporting_attachment';

  const text = [
    item.fileName,
    result?.documentType,
    result?.documentTypeLabel,
    result?.postingSuggestion,
    result?.rawText?.slice(0, 500),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(bank|transfer|payment|slip|statement|promptpay|โอน|สลิป|ธนาคาร)/i.test(text))
    return 'payment_proof';
  if (
    /(tax invoice|receipt|invoice|billing|credit note|debit note|ใบกำกับ|ใบเสร็จ|ใบแจ้งหนี้|ใบวางบิล|ใบลดหนี้|ใบเพิ่มหนี้)/i.test(
      text
    )
  )
    return 'input_vat';
  if (
    /(contract|purchase order|quotation|delivery|acceptance|po|สัญญา|ใบเสนอราคา|ใบสั่งซื้อ|ใบส่งของ|ส่งงาน)/i.test(
      text
    )
  )
    return 'supporting_attachment';
  return 'unknown';
}

function missingFields(group: DocumentGroup, result: OcrResult | null) {
  const th: string[] = [];
  const en: string[] = [];
  if (!result) return { th: ['ยังไม่มีผลอ่านเอกสาร'], en: ['No OCR result yet'] };

  const add = (condition: unknown, thLabel: string, enLabel: string) => {
    if (!condition) {
      th.push(thLabel);
      en.push(enLabel);
    }
  };

  if (group === 'payment_proof') {
    add(result.payment?.amount || result.total, 'ยอดโอน', 'Transfer amount');
    add(result.payment?.paidAt || result.invoiceDate, 'วันที่โอน', 'Transfer date');
    add(result.payment?.bankName, 'ธนาคาร', 'Bank');
    add(
      result.payment?.fromName || result.payment?.toName || result.supplierName,
      'ผู้โอน/ผู้รับ',
      'Payer/payee'
    );
    add(result.payment?.reference || result.invoiceNumber, 'เลขอ้างอิง', 'Reference no.');
    return { th, en };
  }

  if (group === 'supporting_attachment') {
    add(result.documentTypeLabel || result.documentType, 'ประเภทเอกสาร', 'Document type');
    add(
      result.invoiceNumber ||
        result.documentMetadata?.purchaseOrderNumber ||
        result.documentMetadata?.quotationNumber ||
        result.documentMetadata?.deliveryNoteNumber,
      'เลขที่อ้างอิง',
      'Reference no.'
    );
    add(result.invoiceDate, 'วันที่เอกสาร', 'Document date');
    return { th, en };
  }

  if (group === 'input_vat') {
    add(result.supplierName, 'ชื่อผู้ขาย', 'Supplier');
    add(result.supplierTaxId || result.documentMetadata?.sellerTaxId, 'เลขผู้เสียภาษี', 'Tax ID');
    add(result.invoiceNumber, 'เลขที่เอกสาร', 'Document no.');
    add(result.invoiceDate, 'วันที่', 'Date');
    add(result.total, 'ยอดรวม', 'Total');
    if (result.vatAmount > 0)
      add(
        result.supplierTaxId || result.documentMetadata?.sellerTaxId,
        'เลขผู้เสียภาษีสำหรับเคลม VAT',
        'Tax ID for VAT claim'
      );
  }

  return { th, en };
}

function verificationFor(
  group: DocumentGroup,
  result: OcrResult | null
): DocumentIntelligence['verification'] {
  if (group !== 'payment_proof') {
    return { status: 'ocr_only', labelTh: 'ตรวจด้วย OCR', labelEn: 'OCR only' };
  }
  const reference = result?.payment?.reference || result?.invoiceNumber;
  if (!reference)
    return {
      status: 'qr_missing',
      labelTh: 'ยังไม่พบ QR/เลขอ้างอิง',
      labelEn: 'No QR/reference found',
    };
  return {
    status: 'qr_found',
    labelTh: 'พบเลขอ้างอิง รอตรวจ API',
    labelEn: 'Reference found, API verification pending',
  };
}

export function buildDocumentIntelligence(item: IntakeLike): DocumentIntelligence {
  const result = asOcrResult(item.ocrResult);
  const group = groupFromContent(item, result);
  const subtype = subtypeFromOcr(result);
  const displayLabels = labels(group, subtype);
  const missing = missingFields(group, result);
  const warnings = [...asStringArray(item.warnings), ...(result?.validationWarnings ?? [])];
  const reasonsTh: string[] = [];
  const reasonsEn: string[] = [];

  const addReason = (condition: boolean, th: string, en: string) => {
    if (condition) {
      reasonsTh.push(th);
      reasonsEn.push(en);
    }
  };

  addReason(
    item.status === 'processing' || item.status === 'received',
    'รอระบบอ่านเอกสารให้เสร็จ',
    'Waiting for document analysis'
  );
  addReason(
    item.status === 'failed',
    'อ่านไฟล์ไม่สำเร็จ ต้องอัปโหลดใหม่หรือกรอกเอง',
    'Analysis failed; upload again or enter manually'
  );
  addReason(
    group === 'unknown',
    'ยังไม่ทราบประเภทเอกสาร ต้องจัดกลุ่มก่อนเก็บ audit trail',
    'Document type is unknown; classify it before audit filing'
  );
  addReason(
    missing.th.length > 0,
    `ขาดข้อมูลหลัก: ${missing.th.join(', ')}`,
    `Missing key fields: ${missing.en.join(', ')}`
  );
  addReason(
    warnings.length > 0,
    `มีคำเตือน: ${warnings.slice(0, 2).join(', ')}`,
    `Warnings: ${warnings.slice(0, 2).join(', ')}`
  );
  addReason(
    (group === 'payment_proof' || group === 'supporting_attachment') &&
      !item.purchaseInvoiceId &&
      item.status === 'saved',
    'เอกสารแนบนี้ยังไม่ได้ผูกกับรายการหลัก',
    'This attachment is not linked to its main record'
  );

  const ready =
    reasonsTh.length === 0 &&
    group !== 'unknown' &&
    ['awaiting_confirmation', 'saved', 'needs_review'].includes(item.status);
  const requiredAttachments: DocumentIntelligence['audit']['requiredAttachments'] =
    group === 'input_vat'
      ? ['tax_document', 'payment_proof']
      : group === 'payment_proof'
        ? ['tax_document', 'payment_proof']
        : ['tax_document', 'po_or_contract', 'delivery_or_acceptance'];

  return {
    group,
    subtype,
    groupLabelTh: displayLabels.group.th,
    groupLabelEn: displayLabels.group.en,
    subtypeLabelTh: displayLabels.subtype.th,
    subtypeLabelEn: displayLabels.subtype.en,
    readiness: {
      ready,
      labelTh: ready
        ? group === 'input_vat'
          ? 'พร้อมเข้าขั้นตอนภาษีซื้อ'
          : 'พร้อมแนบประกอบ'
        : 'ยังไม่พร้อม',
      labelEn: ready
        ? group === 'input_vat'
          ? 'Ready for Input VAT flow'
          : 'Ready as attachment'
        : 'Not ready',
      reasonsTh: ready
        ? [
            group === 'input_vat'
              ? 'ข้อมูลบัญชีและ VAT หลักครบ พร้อมตรวจยืนยัน/เก็บ audit trail'
              : 'ข้อมูลอ้างอิงหลักครบ ใช้แนบกับรายการซื้อเพื่อ audit trail ได้',
          ]
        : reasonsTh,
      reasonsEn: ready
        ? [
            group === 'input_vat'
              ? 'Key accounting and VAT fields are complete; ready to confirm and audit'
              : 'Key reference details are available; attach it to the purchase record for audit trail',
          ]
        : reasonsEn,
    },
    verification: verificationFor(group, result),
    payment: result?.payment,
    audit: {
      requiredAttachments,
      missingAttachments: requiredAttachments.filter((kind) => {
        if (kind === 'tax_document') return group !== 'input_vat' && !item.purchaseInvoiceId;
        if (kind === 'payment_proof') return group !== 'payment_proof' && !item.purchaseInvoiceId;
        return group !== 'supporting_attachment' && !item.purchaseInvoiceId;
      }),
    },
  };
}

export function withDocumentIntelligence<T extends IntakeLike>(
  item: T
): T & { intelligence: DocumentIntelligence } {
  return {
    ...item,
    intelligence: buildDocumentIntelligence(item),
  };
}
