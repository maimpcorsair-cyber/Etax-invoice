import { logger } from '../config/logger';
import {
  looksLikeBankSlipCandidate,
  ocrBankTransferSlip,
  ocrSupplierInvoice,
  OcrResult,
} from './aiService';
import { decodeQrFromImage } from './qrDecodeService';
import { rasterizePdfToPngPages } from './pdfRasterService';

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
        result = mergeAnalysisWarning(pageResult, `อ่านจากภาพหน้า PDF หน้า ${index + 1}`);
        result.extractionProvider = `${pageResult.extractionProvider ?? 'vision'}+pdf-raster-fallback`;
        source = 'image';
        break;
      }
    }
  }

  return { result, pageCount, source };
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
  return { result, source: 'unknown', stages: ['ocr_unknown'] };
}
