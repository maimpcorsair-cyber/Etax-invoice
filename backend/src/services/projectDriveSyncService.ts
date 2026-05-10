import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';
import { logger } from '../config/logger';
import { downloadFromStorage } from './storageService';
import {
  DriveDocumentFolder,
  ensureProjectDriveFolder,
  isDriveConfigured,
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
};

function asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

export async function syncDocumentIntakeToProjectDrive(
  intakeId: string,
  options: { companyId: string; preferredUserId?: string | null; force?: boolean },
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
    const [company, project, user] = await withSystemRlsContext(prisma, (tx) => Promise.all([
      tx.company.findUnique({ where: { id: intake.companyId }, select: { nameTh: true, nameEn: true } }),
      tx.project.findFirst({
        where: { id: intake.projectId!, companyId: intake.companyId },
        select: { id: true, code: true, name: true },
      }),
      (() => {
        const userId = usableDriveUserId(intake.userId, options.preferredUserId);
        return userId
          ? tx.user.findFirst({ where: { id: userId, companyId: intake.companyId }, select: { googleRefreshToken: true } })
          : Promise.resolve(null);
      })(),
    ]));

    if (!project) throw new Error('Project not found for Drive sync');
    const buffer = await readIntakeBuffer(intake);
    if (!buffer) throw new Error('No stored file buffer available for Drive sync');

    const companyName = company?.nameEn ?? company?.nameTh ?? intake.companyId;
    const result = await uploadToDrive(
      buffer,
      intake.fileName ?? `document-${intake.id}`,
      intake.mimeType,
      companyName,
      user?.googleRefreshToken,
      {
        projectCode: project.code,
        projectName: project.name,
        documentFolder: driveFolderForIntake(intake),
      },
    );

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

  const data = await withSystemRlsContext(prisma, (tx) => Promise.all([
    tx.company.findUnique({ where: { id: input.companyId }, select: { nameTh: true, nameEn: true } }),
    tx.project.findFirst({
      where: { id: input.projectId, companyId: input.companyId },
      select: { id: true, code: true, name: true, driveFolderId: true, driveFolderUrl: true },
    }),
    tx.user.findFirst({ where: { id: input.userId, companyId: input.companyId }, select: { googleRefreshToken: true } }),
  ]));
  const [company, project, user] = data;
  if (!project) return null;
  if (project.driveFolderId && project.driveFolderUrl) {
    return { folderId: project.driveFolderId, folderUrl: project.driveFolderUrl, userDrive: !!user?.googleRefreshToken };
  }

  const folder = await ensureProjectDriveFolder({
    companyName: company?.nameEn ?? company?.nameTh ?? input.companyId,
    projectCode: project.code,
    projectName: project.name,
    userRefreshToken: user?.googleRefreshToken,
  });

  await withSystemRlsContext(prisma, (tx) => tx.project.updateMany({
    where: { id: input.projectId, companyId: input.companyId },
    data: { driveFolderId: folder.folderId, driveFolderUrl: folder.folderUrl },
  }));
  return folder;
}
