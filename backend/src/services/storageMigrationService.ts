import { prisma } from '../config/database';
import { uploadToStorage, isStorageConfigured } from './storageService';
import { logger } from '../config/logger';

export async function migrateDocumentToStorage(docId: string): Promise<boolean> {
  if (!isStorageConfigured()) return false;

  const doc = await prisma.documentIntake.findUnique({
    where: { id: docId },
    select: { id: true, companyId: true, fileBase64: true, mimeType: true, fileName: true, fileSize: true, storageKey: true },
  });

  if (!doc || !doc.fileBase64 || doc.storageKey) return false;

  const buffer = Buffer.from(doc.fileBase64, 'base64');
  const ext = doc.mimeType === 'application/pdf' ? 'pdf' : doc.mimeType.split('/')[1] ?? 'bin';
  const key = `companies/${doc.companyId}/document-intakes/${Date.now()}-${doc.id.slice(-6)}.${ext}`;

  const fileUrl = await uploadToStorage(key, buffer, doc.mimeType);

  await prisma.documentIntake.update({
    where: { id: docId },
    data: { storageKey: key, fileUrl, fileBase64: null },
  });

  logger.info(`Migrated document ${docId} to storage: ${key}`);
  return true;
}

export async function batchMigrateDbFiles(limit = 50): Promise<{ migrated: number; errors: number }> {
  if (!isStorageConfigured()) return { migrated: 0, errors: 0 };

  const docs = await prisma.documentIntake.findMany({
    where: { fileBase64: { not: null }, storageKey: null },
    select: { id: true },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });

  let migrated = 0;
  let errors = 0;

  for (const doc of docs) {
    try {
      const ok = await migrateDocumentToStorage(doc.id);
      if (ok) migrated++;
    } catch (err) {
      errors++;
      logger.error(`Failed to migrate document ${doc.id}:`, err);
    }
  }

  logger.info(`Batch migration complete: ${migrated} migrated, ${errors} errors`);
  return { migrated, errors };
}
