import { logger } from '../config/logger';
import {
  looksLikeBankSlipCandidate,
  ocrBankTransferSlip,
  ocrSupplierInvoice,
  OcrResult,
} from './aiService';
import { decodeQrFromImage } from './qrDecodeService';
import { rasterizePdfToPngPages } from './pdfRasterService';
import { parseThaiSlipQr, type ThaiSlipQrFields } from './thaiSlipQrParser';

export const PURCHASE_RECORD_DOCUMENT_TYPES = new Set<OcrResult['documentType']>([
  'tax_invoice',
  'receipt',
  'invoice',
  'billing_note',
  'expense_receipt',
  'credit_note',
  'debit_note',
]);

export const REVIEW_ONLY_DOCUMENT_TYPES = new Set<OcrResult['documentType']>([
  'quotation',
  'purchase_order',
  'delivery_note',
  'withholding_tax',
  'bank_statement',
  'contract',
  'other',
]);

const SUPPORTED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export interface DocumentOcrAnalysis {
  result: OcrResult;
  stages: string[];
  qrText?: string;
  pageCount?: number;
  source: 'text_pdf' | 'scan_pdf' | 'image' | 'unknown';
}

function paymentAmountFromResult(result: OcrResult) {
  return Number(result.payment?.amount ?? result.total ?? 0);
}

export function hasUsefulDocumentData(result?: OcrResult | null) {
  return !!(
    result &&
    (
      result.supplierName ||
      result.invoiceNumber ||
      result.total ||
      result.vatAmount ||
      paymentAmountFromResult(result) ||
      result.payment?.fromName ||
      result.payment?.toName ||
      result.payment?.reference ||
      result.documentMetadata?.purchaseOrderNumber ||
      result.documentMetadata?.quotationNumber ||
      result.documentMetadata?.deliveryNoteNumber
    )
  );
}

export function supportedDocumentMimeType(mimeType: string) {
  return SUPPORTED_MIME_TYPES.includes(mimeType);
}

export function documentIntakeStatusForOcr(result: OcrResult) {
  if (!hasUsefulDocumentData(result)) return 'failed';
  if (PURCHASE_RECORD_DOCUMENT_TYPES.has(result.documentType)) return 'awaiting_confirmation';
  return 'needs_review';
}

export function documentIntakeWarningsForOcr(result: OcrResult, stages: string[] = []) {
  return [
    ...(result.validationWarnings ?? []),
    ...stages.map((stage) => `analysis:${stage}`),
    ...(!PURCHASE_RECORD_DOCUMENT_TYPES.has(result.documentType) ? [`review_only:${result.documentType}`] : []),
  ];
}

function mergeAnalysisWarning(result: OcrResult, warning: string): OcrResult {
  return {
    ...result,
    validationWarnings: [...(result.validationWarnings ?? []), warning],
  };
}

function shouldTrySlipSpecialist(result: OcrResult) {
  return result.documentType !== 'bank_transfer'
    && result.documentType !== 'payment_advice'
    && (!paymentAmountFromResult(result) || looksLikeBankSlipCandidate(result));
}

async function trySlipSpecialist(
  buffer: Buffer,
  mimeType: string,
  qrText: string | undefined,
  stages: string[],
): Promise<OcrResult | null> {
  stages.push('bank_slip_specialist');
  const slipResult = await ocrBankTransferSlip(buffer.toString('base64'), mimeType, qrText);
  if (paymentAmountFromResult(slipResult) || slipResult.invoiceNumber || slipResult.payment?.reference) {
    return slipResult;
  }
  return null;
}

async function extractPdfText(buffer: Buffer, stages: string[]) {
  let pageCount = 1;
  let pdfText = '';
  try {
    stages.push('pdf_text_extract');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const textResult = await parser.getText();
    pageCount = textResult.total ?? 1;
    pdfText = (textResult.text ?? '').trim().slice(0, 8000);
  } catch (err) {
    logger.warn('[Document OCR] PDF text extraction failed; continuing to scan OCR', { error: String(err) });
    stages.push('pdf_text_extract_failed');
  }
  return { pdfText, pageCount };
}

async function analyzePdfDocument(
  buffer: Buffer,
  companyId: string,
  stages: string[],
): Promise<{ result: OcrResult; pageCount: number; source: DocumentOcrAnalysis['source'] }> {
  const { pdfText, pageCount } = await extractPdfText(buffer, stages);
  let result: OcrResult;
  let source: DocumentOcrAnalysis['source'] = 'scan_pdf';

  if (pdfText.length > 30) {
    stages.push('ocr_text_pdf');
    source = 'text_pdf';
    result = await ocrSupplierInvoice(Buffer.from(pdfText, 'utf-8').toString('base64'), 'text/plain', {
      pageCount,
      source,
      companyId,
    });
  } else {
    stages.push('ocr_pdf_binary');
    result = await ocrSupplierInvoice(buffer.toString('base64'), 'application/pdf', {
      pageCount,
      source,
      companyId,
    });
  }

  if (shouldTrySlipSpecialist(result)) {
    const slipResult = await trySlipSpecialist(buffer, 'application/pdf', undefined, stages);
    if (slipResult) result = slipResult;
  }

  const needsRasterFallback = !hasUsefulDocumentData(result)
    || result.confidence === 'low'
    || (!!result.validationWarnings?.length && !result.total);

  if (needsRasterFallback) {
    stages.push('pdf_raster_fallback');
    const rasterPages = await rasterizePdfToPngPages(buffer);
    const pageResults: OcrResult[] = [];
    for (const [index, png] of rasterPages.entries()) {
      stages.push(`pdf_raster_page_${index + 1}`);
      let pageResult = await ocrSupplierInvoice(png.toString('base64'), 'image/png', {
        source: 'image',
        companyId,
        pageCount: rasterPages.length,
      });
      if (shouldTrySlipSpecialist(pageResult)) {
        const slipCandidate = await trySlipSpecialist(png, 'image/png', undefined, stages);
        if (slipCandidate) pageResult = slipCandidate;
      }
      if (hasUsefulDocumentData(pageResult)) {
        pageResults.push(pageResult);
      }
    }
    if (pageResults.length > 0) {
      // Multi-page invoices put the header on page 1 and the total on the
      // last page — aggregate across pages instead of stopping at the first
      // useful one. mergeMultiPageResults picks the highest-confidence value
      // for each field across all page results.
      const merged = pageResults.length === 1
        ? pageResults[0]
        : mergeMultiPageResults(pageResults);
      result = mergeAnalysisWarning(merged, rasterPages.length > 1
        ? `อ่านจาก ${pageResults.length}/${rasterPages.length} หน้า PDF แล้วรวมข้อมูล`
        : 'อ่านจากภาพหน้า PDF');
      result.extractionProvider = `${merged.extractionProvider ?? 'vision'}+pdf-raster-fallback`;
      source = 'image';
    }
  }

  return { result, pageCount, source };
}

/**
 * Merge OCR results from multiple PDF pages. For each field, prefers the
 * non-empty / higher-magnitude value (totals usually appear on the last
 * page; supplier info usually appears on the first; we want the maximum
 * useful information across all pages).
 */
function mergeMultiPageResults(pageResults: OcrResult[]): OcrResult {
  if (pageResults.length === 0) {
    throw new Error('mergeMultiPageResults called with empty array');
  }
  if (pageResults.length === 1) return pageResults[0];

  const pickFirstNonEmpty = (getter: (r: OcrResult) => string | undefined): string => {
    for (const r of pageResults) {
      const v = getter(r);
      if (v && String(v).trim()) return String(v);
    }
    return '';
  };
  const pickMax = (getter: (r: OcrResult) => number | undefined): number => {
    let max = 0;
    for (const r of pageResults) {
      const v = Number(getter(r) ?? 0);
      if (v > max) max = v;
    }
    return max;
  };

  // Pick a primary result whose total is non-zero — typically the last page
  // of a multi-page invoice (where the grand total lives).
  const primary = [...pageResults].reverse().find((r) => Number(r.total) > 0) ?? pageResults[0];

  const merged: OcrResult = {
    ...primary,
    documentType: primary.documentType,
    documentTypeLabel: primary.documentTypeLabel || pickFirstNonEmpty((r) => r.documentTypeLabel),
    supplierName: pickFirstNonEmpty((r) => r.supplierName),
    supplierTaxId: pickFirstNonEmpty((r) => r.supplierTaxId),
    supplierBranch: pickFirstNonEmpty((r) => r.supplierBranch) || '00000',
    invoiceNumber: pickFirstNonEmpty((r) => r.invoiceNumber),
    invoiceDate: pickFirstNonEmpty((r) => r.invoiceDate),
    subtotal: pickMax((r) => r.subtotal),
    vatAmount: pickMax((r) => r.vatAmount),
    total: pickMax((r) => r.total),
    confidence: pageResults.some((r) => r.confidence === 'high') ? 'high'
      : pageResults.some((r) => r.confidence === 'medium') ? 'medium' : 'low',
    validationWarnings: Array.from(
      new Set(pageResults.flatMap((r) => r.validationWarnings ?? [])),
    ),
  };

  // Foreign-currency fields — keep them if any page reported them.
  for (const r of pageResults) {
    if (!merged.originalCurrency && r.originalCurrency && r.originalCurrency !== 'THB') {
      merged.originalCurrency = r.originalCurrency;
      merged.exchangeRate = r.exchangeRate;
      merged.originalTotal = r.originalTotal;
      merged.originalSubtotal = r.originalSubtotal;
      merged.originalVatAmount = r.originalVatAmount;
    }
  }

  // documentMetadata — concat unique fields across pages.
  const mergedMeta: NonNullable<OcrResult['documentMetadata']> = { ...(primary.documentMetadata ?? {}) };
  for (const r of pageResults) {
    const meta = r.documentMetadata;
    if (!meta) continue;
    for (const [key, value] of Object.entries(meta)) {
      const k = key as keyof typeof mergedMeta;
      if (mergedMeta[k] === undefined || mergedMeta[k] === null || mergedMeta[k] === '' || mergedMeta[k] === 0) {
        (mergedMeta as Record<string, unknown>)[k] = value;
      }
    }
  }
  merged.documentMetadata = mergedMeta;
  return merged;
}

function mergeQrFieldsIntoResult(result: OcrResult, qr: ThaiSlipQrFields): OcrResult {
  // QR transactionId / reference are deterministic — let them override OCR's read.
  // But we don't override amount/parties since QR doesn't carry those reliably.
  const reference = qr.reference ?? qr.transactionId ?? null;
  const bankName = qr.bank ?? result.payment?.bankName ?? null;
  const looksLikeSlip = !!qr.transactionId && !!qr.bank;

  return {
    ...result,
    documentType: looksLikeSlip ? 'bank_transfer' : result.documentType,
    documentTypeLabel: looksLikeSlip && !result.documentTypeLabel ? 'สลิปโอนเงิน' : result.documentTypeLabel,
    invoiceNumber: result.invoiceNumber || qr.transactionId || '',
    payment: {
      ...(result.payment ?? {}),
      reference: result.payment?.reference || reference || undefined,
      bankName: result.payment?.bankName || bankName || undefined,
    },
    validationWarnings: [
      ...(result.validationWarnings ?? []),
      ...(qr.bank ? [`qr_verified:${qr.bank}`] : []),
    ],
  };
}

async function analyzeImageDocument(
  buffer: Buffer,
  mimeType: string,
  companyId: string,
  stages: string[],
): Promise<{ result: OcrResult; qrText?: string }> {
  stages.push('qr_decode');
  const qrResult = decodeQrFromImage(buffer, mimeType);
  const qrText = qrResult.ok ? qrResult.text : undefined;

  const slipQrFields = qrText ? parseThaiSlipQr(qrText) : null;
  if (slipQrFields && slipQrFields.confidence >= 0.6) {
    stages.push(`qr_thai_slip:${slipQrFields.bank ?? 'unknown'}`);
  }

  stages.push('ocr_image');
  let result = await ocrSupplierInvoice(buffer.toString('base64'), mimeType, {
    source: 'image',
    qrText,
    companyId,
  });

  if (shouldTrySlipSpecialist(result)) {
    const slipResult = await trySlipSpecialist(buffer, mimeType, qrText, stages);
    if (slipResult) result = slipResult;
  }

  // QR-augmented merge: when QR identifies the bank + transaction id, stamp those onto the result
  // even if the OCR step came back weak. This makes the K+/SCB/BBL slip flow much more reliable.
  if (slipQrFields && slipQrFields.confidence >= 0.6) {
    result = mergeQrFieldsIntoResult(result, slipQrFields);
  }

  return { result, qrText };
}

export async function analyzeAccountingDocumentBuffer(
  buffer: Buffer,
  mimeType: string,
  companyId: string,
): Promise<DocumentOcrAnalysis> {
  const stages: string[] = [];
  if (!supportedDocumentMimeType(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  try {
    if (mimeType === 'application/pdf') {
      const pdf = await analyzePdfDocument(buffer, companyId, stages);
      return { ...pdf, stages };
    }

    if (mimeType.startsWith('image/')) {
      const image = await analyzeImageDocument(buffer, mimeType, companyId, stages);
      return {
        result: image.result,
        qrText: image.qrText,
        source: 'image',
        stages,
      };
    }

    const result = await ocrSupplierInvoice(buffer.toString('base64'), mimeType, {
      source: 'unknown',
      companyId,
    });
    return { result, source: 'unknown', stages: [...stages, 'ocr_unknown'] };
  } catch (err) {
    // Never let an inner OCR step crash the whole pipeline — return an empty result
    // with the stage list so the caller can show a meaningful message.
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[Document OCR] pipeline failed; returning empty result', { error: msg, stages });
    const empty: OcrResult = {
      documentType: 'other',
      documentTypeLabel: 'เอกสารอื่น',
      supplierName: '',
      supplierTaxId: '',
      supplierBranch: '00000',
      invoiceNumber: '',
      invoiceDate: '',
      subtotal: 0,
      vatAmount: 0,
      total: 0,
      confidence: 'low',
      extractionProvider: 'none',
      validationWarnings: [`pipeline_error:${msg.slice(0, 200)}`],
    };
    return { result: empty, source: 'unknown', stages: [...stages, 'pipeline_caught_error'] };
  }
}
