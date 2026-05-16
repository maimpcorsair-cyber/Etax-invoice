import prisma from '../config/database';
import { logger } from '../config/logger';
import type { OcrResult } from './aiService';

const SUPPORTED_TYPES = new Set<OcrResult['documentType']>([
  'purchase_order',
  'quotation',
  'delivery_note',
]);

export function isSupportedProjectDocumentType(type: OcrResult['documentType']): boolean {
  return SUPPORTED_TYPES.has(type);
}

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function documentNumberFromResult(result: OcrResult): string {
  return (
    result.invoiceNumber
    || result.documentMetadata?.purchaseOrderNumber
    || result.documentMetadata?.quotationNumber
    || result.documentMetadata?.deliveryNoteNumber
    || `${result.documentType.toUpperCase()}-${Date.now()}`
  );
}

export interface ProjectDocumentIntakeOptions {
  intakeId: string;
  companyId: string;
  projectId: string;
  result: OcrResult;
}

export interface ProjectDocumentIntakeResult {
  ok: boolean;
  id?: string;
  documentType: string;
  documentNumber?: string;
  reason?: string;
}

export async function createProjectDocumentFromIntake(
  options: ProjectDocumentIntakeOptions,
): Promise<ProjectDocumentIntakeResult> {
  const { result, projectId, companyId, intakeId } = options;
  if (!isSupportedProjectDocumentType(result.documentType)) {
    return { ok: false, documentType: result.documentType, reason: 'unsupported_type' };
  }
  if (!projectId) {
    return { ok: false, documentType: result.documentType, reason: 'project_required' };
  }

  const docNumber = documentNumberFromResult(result);
  const issueDate = safeDate(result.invoiceDate);
  const expectedDate = safeDate(result.documentMetadata?.dueDate);
  const vendorName = result.supplierName || result.documentMetadata?.sellerName || '';
  const vendorTaxId = result.supplierTaxId || result.documentMetadata?.sellerTaxId || '';

  try {
    const created = await prisma.projectPurchaseOrder.upsert({
      where: {
        companyId_projectId_poNumber: { companyId, projectId, poNumber: docNumber },
      },
      update: {
        documentType: result.documentType,
        vendorName: vendorName || undefined,
        vendorTaxId: vendorTaxId || undefined,
        issueDate: issueDate ?? undefined,
        expectedDate: expectedDate ?? undefined,
        subtotal: result.subtotal || undefined,
        vatAmount: result.vatAmount || undefined,
        total: result.total || undefined,
        documentIntakeId: intakeId,
        metadata: {
          confidence: result.confidence,
          extractionProvider: result.extractionProvider,
          documentMetadata: result.documentMetadata,
        },
      },
      create: {
        companyId,
        projectId,
        documentIntakeId: intakeId,
        poNumber: docNumber,
        documentType: result.documentType,
        vendorName: vendorName || null,
        vendorTaxId: vendorTaxId || null,
        issueDate,
        expectedDate,
        subtotal: result.subtotal || null,
        vatAmount: result.vatAmount || null,
        total: result.total || null,
        currency: result.documentMetadata?.currency || 'THB',
        status: result.documentType === 'delivery_note' ? 'received' : 'open',
        source: 'document_intake',
        metadata: {
          confidence: result.confidence,
          extractionProvider: result.extractionProvider,
          documentMetadata: result.documentMetadata,
        },
      },
    });

    await prisma.documentIntake.update({
      where: { id: intakeId },
      data: {
        targetType: 'project_purchase_order',
        targetId: created.id,
        status: 'saved',
      },
    });

    logger.info('[projectDocIntake] created project document', {
      type: result.documentType,
      poNumber: docNumber,
      projectId,
    });

    return { ok: true, id: created.id, documentType: result.documentType, documentNumber: docNumber };
  } catch (err) {
    logger.warn('[projectDocIntake] failed', {
      error: err instanceof Error ? err.message : String(err),
      type: result.documentType,
      projectId,
    });
    return { ok: false, documentType: result.documentType, reason: 'create_failed' };
  }
}
