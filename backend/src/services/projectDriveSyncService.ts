import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';
import { logger } from '../config/logger';
import { downloadFromStorage, isStorageConfigured } from './storageService';
import {
  DriveDocumentFolder,
  ensureProjectDriveFolder,
  isDriveConfigured,
  shareServiceAccountDriveItem,
  uploadToDrive,
} from './googleDriveService';

type IntakeForDrive = {
  id: string;
  companyId: string;
  projectId: string | null;
  userId: string;
  fileName: string | null;
  mimeType: string;
  fileSize: number;
  fileBase64: string | null;
  storageKey: string | null;
  ocrResult: Prisma.JsonValue | null;
  warnings?: Prisma.JsonValue | null;
};

function asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function driveFolderForIntake(intake: IntakeForDrive): DriveDocumentFolder {
  const ocr = asObject(intake.ocrResult);
  const documentType = String(ocr.documentType ?? '').toLowerCase();
  const text = JSON.stringify(ocr).toLowerCase();

  if (documentType.includes('purchase_order') || documentType.includes('quotation') || documentType.includes('delivery')) {
    return '01_PO';
  }
  if (documentType.includes('bank_transfer') || documentType.includes('payment') || text.includes('promptpay') || text.includes('สลิป')) {
    return '03_Transfer_Slips';
  }
  if (intake.mimeType.includes('image')) return '04_Photos';
  if (intake.mimeType === 'application/pdf') return '02_Tax_Invoices';
  return '99_Other';
}

async function readIntakeBuffer(intake: IntakeForDrive): Promise<Buffer | null> {
  if (intake.fileBase64) return Buffer.from(intake.fileBase64, 'base64');
  if (intake.storageKey) return downloadFromStorage(intake.storageKey);
  return null;
}

function usableDriveUserId(userId: string, preferredUserId?: string | null) {
  if (preferredUserId) return preferredUserId;
  if (userId.startsWith('project-guest:')) return null;
  return userId;
}

function selectDriveRefreshToken(input: {
  companyOwnerToken?: string | null;
  preferredUserToken?: string | null;
}) {
  return input.companyOwnerToken ?? input.preferredUserToken ?? null;
}

export async function syncDocumentIntakeToProjectDrive(
  intakeId: string,
  options: {
    companyId: string;
    preferredUserId?: string | null;
    force?: boolean;
    duplicatePolicy?: 'rename' | 'replace' | 'skip' | 'error';
  },
) {
  if (!isDriveConfigured()) {
    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.updateMany({
      where: { id: intakeId, companyId: options.companyId },
      data: { driveSyncStatus: 'skipped', driveSyncError: 'Google Drive is not configured' },
    }));
    return null;
  }

  const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
    where: { id: intakeId, companyId: options.companyId },
    select: {
      id: true,
      companyId: true,
      projectId: true,
      userId: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      fileBase64: true,
      storageKey: true,
      ocrResult: true,
      warnings: true,
      driveSyncStatus: true,
      driveFileId: true,
    },
  }));

  if (!intake || !intake.projectId) return null;
  if (!options.force && intake.driveSyncStatus === 'synced' && intake.driveFileId) return null;

  await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
    where: { id: intake.id },
    data: { driveSyncStatus: 'syncing', driveSyncError: null },
  }));

  try {
    const { company, project, user, companyOwner } = await withSystemRlsContext(prisma, async (tx) => {
      const [companyRecord, projectRecord, preferredUser] = await Promise.all([
        tx.company.findUnique({
          where: { id: intake.companyId },
          select: { nameTh: true, nameEn: true, email: true, googleDriveOwnerUserId: true },
        }),
        tx.project.findFirst({
          where: { id: intake.projectId!, companyId: intake.companyId },
          select: { id: true, code: true, name: true },
        }),
        (() => {
          const userId = usableDriveUserId(intake.userId, options.preferredUserId);
          return userId
            ? tx.user.findFirst({ where: { id: userId, companyId: intake.companyId }, select: { email: true, googleRefreshToken: true } })
            : Promise.resolve(null);
        })(),
      ]);
      const owner = companyRecord?.googleDriveOwnerUserId
        ? await tx.user.findFirst({
          where: { id: companyRecord.googleDriveOwnerUserId, companyId: intake.companyId },
          select: { email: true, googleRefreshToken: true },
        })
        : null;
      return { company: companyRecord, project: projectRecord, user: preferredUser, companyOwner: owner };
    });

    if (!project) throw new Error('Project not found for Drive sync');
    const buffer = await readIntakeBuffer(intake);
    if (!buffer) throw new Error('No stored file buffer available for Drive sync');

    const companyName = company?.nameEn ?? company?.nameTh ?? intake.companyId;
    const result = await uploadToDrive(
      buffer,
      intake.fileName ?? `document-${intake.id}`,
      intake.mimeType,
      companyName,
      selectDriveRefreshToken({
        companyOwnerToken: companyOwner?.googleRefreshToken,
        preferredUserToken: user?.googleRefreshToken,
      }),
      {
        projectCode: project.code,
        projectName: project.name,
        documentFolder: driveFolderForIntake(intake),
        shareWithEmails: [company?.email, companyOwner?.email, user?.email].filter(Boolean) as string[],
        duplicatePolicy: options.duplicatePolicy ?? 'rename',
      },
    );

    const warnings = asStringArray(intake.warnings);
    const duplicateWarnings = result.duplicate
      ? [
        `drive_duplicate:${result.duplicate.policy}`,
        result.duplicate.existingSize === intake.fileSize
          ? 'drive_duplicate_size:same'
          : `drive_duplicate_size:${result.duplicate.existingSize ?? 'unknown'}:${intake.fileSize}`,
      ]
      : [];

    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
      where: { id: intake.id },
      data: {
        driveFileId: result.fileId,
        driveUrl: result.url,
        driveFolderId: result.folderId,
        driveFolderUrl: result.folderUrl,
        driveSyncStatus: 'synced',
        driveSyncError: null,
        driveSyncedAt: new Date(),
        driveUserDrive: result.userDrive,
        fileName: result.fileName,
        warnings: duplicateWarnings.length
          ? Array.from(new Set([...warnings, ...duplicateWarnings])) as Prisma.InputJsonValue
          : undefined,
      },
    }));

    if (result.projectFolderId && result.projectFolderUrl) {
      await withSystemRlsContext(prisma, (tx) => tx.project.updateMany({
        where: { id: project.id, companyId: intake.companyId },
        data: {
          driveFolderId: result.projectFolderId,
          driveFolderUrl: result.projectFolderUrl,
        },
      }));
    }

    logger.info('Project document synced to Drive', {
      intakeId,
      fileId: result.fileId,
      folderId: result.folderId,
      userDrive: result.userDrive,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Drive sync failed';
    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.updateMany({
      where: { id: intakeId, companyId: options.companyId },
      data: {
        driveSyncStatus: 'failed',
        driveSyncError: message,
      },
    }));
    logger.warn('Project document Drive sync failed', { intakeId, error: err });
    return null;
  }
}

export async function ensureProjectDriveFolderForUser(input: {
  companyId: string;
  projectId: string;
  userId: string;
}) {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured on this server');

  const { company, project, user, companyOwner } = await withSystemRlsContext(prisma, async (tx) => {
    const [companyRecord, projectRecord, preferredUser] = await Promise.all([
      tx.company.findUnique({
        where: { id: input.companyId },
        select: { nameTh: true, nameEn: true, email: true, googleDriveOwnerUserId: true },
      }),
      tx.project.findFirst({
        where: { id: input.projectId, companyId: input.companyId },
        select: { id: true, code: true, name: true, driveFolderId: true, driveFolderUrl: true },
      }),
      tx.user.findFirst({ where: { id: input.userId, companyId: input.companyId }, select: { email: true, googleRefreshToken: true } }),
    ]);
    const owner = companyRecord?.googleDriveOwnerUserId
      ? await tx.user.findFirst({
        where: { id: companyRecord.googleDriveOwnerUserId, companyId: input.companyId },
        select: { email: true, googleRefreshToken: true },
      })
      : null;
    return { company: companyRecord, project: projectRecord, user: preferredUser, companyOwner: owner };
  });
  if (!project) return null;
  const shareWithEmails = [company?.email, companyOwner?.email, user?.email].filter(Boolean) as string[];
  const selectedRefreshToken = selectDriveRefreshToken({
    companyOwnerToken: companyOwner?.googleRefreshToken,
    preferredUserToken: user?.googleRefreshToken,
  });

  if (project.driveFolderId && project.driveFolderUrl) {
    await shareServiceAccountDriveItem(project.driveFolderId, shareWithEmails, 'writer');
    return {
      folderId: project.driveFolderId,
      folderUrl: project.driveFolderUrl,
      userDrive: !!selectedRefreshToken,
    };
  }

  const folder = await ensureProjectDriveFolder({
    companyName: company?.nameEn ?? company?.nameTh ?? input.companyId,
    projectCode: project.code,
    projectName: project.name,
    userRefreshToken: selectedRefreshToken,
    shareWithEmails,
  });

  await withSystemRlsContext(prisma, (tx) => tx.project.updateMany({
    where: { id: input.projectId, companyId: input.companyId },
    data: { driveFolderId: folder.folderId, driveFolderUrl: folder.folderUrl },
  }));
  return folder;
}

/**
 * Upload an invoice PDF and XML to the company's Google Drive (02_Tax_Invoices folder).
 * Uses dedup policy "skip" — won't overwrite if the file already exists.
 * Updates Invoice.driveFileId / driveUrl / driveXmlFileId / driveXmlUrl on success.
 */
export async function syncInvoiceToDrive(invoiceId: string): Promise<void> {
  if (!isDriveConfigured()) return;
  if (!isStorageConfigured()) return;

  const invoice = await withSystemRlsContext(prisma, (tx) => tx.invoice.findFirst({
    where: { id: invoiceId },
    select: {
      id: true,
      companyId: true,
      invoiceNumber: true,
      driveFileId: true,
      company: {
        select: {
          nameTh: true,
          nameEn: true,
          googleDriveOwnerUserId: true,
          googleDriveOwnerLinkedAt: true,
        },
      },
    },
  }));

  if (!invoice) return;
  if (invoice.driveFileId) return; // Already synced — skip

  const companyName = invoice.company.nameTh || invoice.company.nameEn || 'Company';
  const storageKeyPdf = `invoices/${invoice.companyId}/${invoice.invoiceNumber}.pdf`;
  const storageKeyXml = `invoices/${invoice.companyId}/${invoice.invoiceNumber}.xml`;

  // Get Drive refresh token from the company's designated Drive owner
  let userRefreshToken: string | null = null;
  if (invoice.company.googleDriveOwnerUserId) {
    const owner = await withSystemRlsContext(prisma, (tx) => tx.user.findFirst({
      where: { id: invoice.company.googleDriveOwnerUserId! },
      select: { googleRefreshToken: true },
    }));
    userRefreshToken = owner?.googleRefreshToken ?? null;
  }

  const updates: Record<string, string> = {};

  // Upload PDF
  try {
    const pdfBuffer = await downloadFromStorage(storageKeyPdf);
    const pdfResult = await uploadToDrive(
      pdfBuffer,
      `${invoice.invoiceNumber}.pdf`,
      'application/pdf',
      companyName,
      userRefreshToken,
      { documentFolder: '02_Tax_Invoices', duplicatePolicy: 'skip' },
    );
    if (pdfResult.fileId) {
      updates.driveFileId = pdfResult.fileId;
      updates.driveUrl = pdfResult.url;
    }
  } catch (err) {
    logger.warn('[syncInvoiceToDrive] PDF not ready or upload failed', { error: err, invoiceId, storageKeyPdf });
  }

  // Upload XML
  try {
    const xmlBuffer = await downloadFromStorage(storageKeyXml);
    const xmlResult = await uploadToDrive(
      xmlBuffer,
      `${invoice.invoiceNumber}.xml`,
      'application/xml',
      companyName,
      userRefreshToken,
      { documentFolder: '02_Tax_Invoices', duplicatePolicy: 'skip' },
    );
    if (xmlResult.fileId) {
      updates.driveXmlFileId = xmlResult.fileId;
      updates.driveXmlUrl = xmlResult.url;
    }
  } catch (err) {
    logger.warn('[syncInvoiceToDrive] XML not ready or upload failed', { error: err, invoiceId, storageKeyXml });
  }

  if (Object.keys(updates).length > 0) {
    await withSystemRlsContext(prisma, (tx) => tx.invoice.update({
      where: { id: invoiceId },
      data: updates,
    }));
    logger.info('[syncInvoiceToDrive] Invoice synced to Drive', { invoiceId, ...updates });
  }
}
